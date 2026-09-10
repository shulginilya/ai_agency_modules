"""Demo module: a streaming chat/completion panel.

Copy this directory as the starting point for a new module - it exercises
every part of the contract: typed IO, config, streaming, custom routes and
lifecycle hooks.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter

from aim_core.contracts import AIModule, ModuleContext, ModuleManifest, StreamEvent, UISpec
from aim_core.settings import get_settings

from .providers import ChatProvider, build_provider
from .schemas import ChatInput, ChatMessage, ChatOutput


class ChatModule(AIModule[ChatInput, ChatOutput]):
    manifest = ModuleManifest(
        id="chat",
        name="Chat",
        version="0.1.0",
        description="Multi-turn chat with token-by-token streaming.",
        capabilities=["invoke", "stream", "routes"],
        tags=["llm", "demo"],
        ui=UISpec(
            component="chat",
            package="@ai-modules/chat",
            icon="message-square",
            default_props={"placeholder": "Ask something...", "showUsage": True},
        ),
        config_schema={
            "type": "object",
            "properties": {
                "provider": {
                    "type": "string",
                    "enum": ["mock", "anthropic"],
                    "description": "Overrides the server default for one request.",
                },
                "model": {"type": "string"},
            },
            "additionalProperties": False,
        },
    )
    InputModel = ChatInput
    OutputModel = ChatOutput

    def __init__(self, provider: ChatProvider | None = None) -> None:
        self._settings = get_settings()
        self._default_provider = provider or self._build(self._settings.llm_provider)

    # -- provider selection -------------------------------------------------
    def _build(self, name: str, model: str | None = None) -> ChatProvider:
        """Only the provider being built sees its own settings."""
        if name == "anthropic":
            return build_provider(
                "anthropic",
                api_key=self._settings.anthropic_api_key,
                model=model or self._settings.anthropic_model,
            )
        return build_provider(name, model=model)

    def _provider_for(self, ctx: ModuleContext) -> ChatProvider:
        name = ctx.get("provider")
        if not name or name == self._default_provider.name:
            return self._default_provider
        return self._build(str(name), ctx.get("model"))

    # -- lifecycle ----------------------------------------------------------
    async def health(self) -> dict[str, Any]:
        return {
            "status": "ok",
            "provider": self._default_provider.name,
            "model": self._default_provider.model,
        }

    # -- execution ----------------------------------------------------------
    async def invoke(self, payload: ChatInput, ctx: ModuleContext) -> ChatOutput:
        return await self._provider_for(ctx).complete(payload)

    async def stream(
        self, payload: ChatInput, ctx: ModuleContext
    ) -> AsyncIterator[StreamEvent]:
        provider = self._provider_for(ctx)
        buffer: list[str] = []
        yield StreamEvent(
            type="start", data={"provider": provider.name, "model": provider.model}
        )
        async for chunk in provider.stream(payload):
            buffer.append(chunk)
            yield StreamEvent.delta(chunk)
        message = ChatMessage(role="assistant", content="".join(buffer))
        yield StreamEvent(type="message", data=message.model_dump())
        yield StreamEvent.done(model=provider.model, provider=provider.name)

    # -- module-owned routes (mounted at /api/modules/chat/x) ---------------
    def routes(self) -> APIRouter:
        router = APIRouter()

        @router.get("/providers", summary="Chat providers available on this server")
        async def providers() -> dict[str, Any]:
            return {
                "default": self._default_provider.name,
                "available": ["mock", "anthropic"],
            }

        return router
