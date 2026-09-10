"""Generic HTTP surface generated for every registered module.

Routes mounted per module:

    GET  /api/modules                     -> all manifests
    GET  /api/modules/{id}                -> one manifest
    GET  /api/modules/{id}/health         -> module health
    POST /api/modules/{id}/invoke         -> typed request/response
    POST /api/modules/{id}/stream         -> SSE stream
    *    /api/modules/{id}/x/...          -> the module's own extra routes
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .contracts import AIModule, ModuleContext, ModuleManifest
from .errors import CapabilityNotSupported, ModuleValidationError
from .registry import ModuleRegistry
from .streaming import SSE_HEADERS, sse_response_body


class InvokeRequest(BaseModel):
    """Envelope separating the module payload from request-scoped concerns."""

    model_config = ConfigDict(extra="forbid")

    payload: dict[str, Any] = Field(default_factory=dict)
    config: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class InvokeResponse(BaseModel):
    module_id: str
    request_id: str
    result: dict[str, Any]


def get_registry(request: Request) -> ModuleRegistry:
    return request.app.state.registry


#: Dependency alias so handlers stay readable.
Registry = Annotated[ModuleRegistry, Depends(get_registry)]


def build_context(
    module: AIModule, body: InvokeRequest, request: Request
) -> ModuleContext:
    config = {**module.default_config, **body.config}
    return ModuleContext(
        module_id=module.manifest.id,
        user_id=request.headers.get("x-user-id"),
        config=config,
        metadata={
            **body.metadata,
            "user_agent": request.headers.get("user-agent", ""),
        },
    )


def parse_payload(module: AIModule, body: InvokeRequest) -> BaseModel:
    try:
        return module.InputModel.model_validate(body.payload)
    except ValidationError as exc:
        raise ModuleValidationError(
            f"Invalid payload for module {module.manifest.id!r}",
            details=exc.errors(include_url=False),
        ) from exc


def create_modules_router(registry: ModuleRegistry) -> APIRouter:
    router = APIRouter(prefix="/modules", tags=["modules"])

    @router.get("", response_model=list[ModuleManifest], summary="List modules")
    async def list_modules(
        reg: Registry,
    ) -> list[ModuleManifest]:
        return reg.manifests()

    @router.get("/{module_id}", response_model=ModuleManifest, summary="Module manifest")
    async def get_manifest(
        module_id: str, reg: Registry
    ) -> ModuleManifest:
        return reg.get(module_id).build_manifest()

    @router.get("/{module_id}/health", summary="Module health")
    async def module_health(
        module_id: str, reg: Registry
    ) -> dict[str, Any]:
        return await reg.get(module_id).health()

    @router.post("/{module_id}/invoke", response_model=InvokeResponse)
    async def invoke_module(
        module_id: str,
        body: InvokeRequest,
        request: Request,
        reg: Registry,
    ) -> InvokeResponse:
        module = reg.get(module_id)
        payload = parse_payload(module, body)
        ctx = build_context(module, body, request)
        result = await module.invoke(payload, ctx)
        return InvokeResponse(
            module_id=module_id,
            request_id=ctx.request_id,
            result=result.model_dump(mode="json"),
        )

    @router.post("/{module_id}/stream", summary="Stream module output (SSE)")
    async def stream_module(
        module_id: str,
        body: InvokeRequest,
        request: Request,
        reg: Registry,
    ) -> StreamingResponse:
        module = reg.get(module_id)
        if "stream" not in module.manifest.capabilities:
            raise CapabilityNotSupported(
                f"Module {module_id!r} does not support streaming"
            )
        payload = parse_payload(module, body)
        ctx = build_context(module, body, request)
        return StreamingResponse(
            sse_response_body(module.stream(payload, ctx)),
            media_type="text/event-stream",
            headers={**SSE_HEADERS, "X-Request-Id": ctx.request_id},
        )

    # Module-owned routes live under /x/ so they can never collide with the
    # generic verbs above.
    for module in registry:
        extra = module.routes()
        if extra is not None:
            router.include_router(
                extra,
                prefix=f"/{module.manifest.id}/x",
                tags=[f"module:{module.manifest.id}"],
            )

    return router
