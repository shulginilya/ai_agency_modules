"""Core contracts every pluggable AI module implements.

A module is a self-contained unit of AI functionality that ships:
  * a manifest (identity + capabilities + config schema)
  * typed input/output models
  * an ``invoke`` implementation and, optionally, a ``stream`` implementation
  * optionally, extra FastAPI routes mounted under its own namespace

Nothing in this file imports FastAPI, so modules stay transport-agnostic and
unit-testable without spinning up an HTTP server.
"""

from __future__ import annotations

import abc
import uuid
from collections.abc import AsyncIterator, Mapping
from dataclasses import dataclass, field
from typing import Any, ClassVar, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field

TInput = TypeVar("TInput", bound=BaseModel)
TOutput = TypeVar("TOutput", bound=BaseModel)

Capability = Literal["invoke", "stream", "routes"]


def _default_capabilities() -> list[Capability]:
    return ["invoke"]


class UISpec(BaseModel):
    """Hints the frontend registry uses to pick and configure a component."""

    model_config = ConfigDict(extra="forbid")

    component: str = Field(
        description="Component key the React side registers this module under."
    )
    package: str | None = Field(
        default=None, description="npm package that provides the component."
    )
    icon: str | None = None
    default_props: dict[str, Any] = Field(default_factory=dict)


class ModuleManifest(BaseModel):
    """Public description of a module. Served to clients at /api/modules."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[a-z][a-z0-9_-]*$")
    name: str
    version: str = "0.1.0"
    description: str = ""
    capabilities: list[Capability] = Field(default_factory=_default_capabilities)
    tags: list[str] = Field(default_factory=list)
    ui: UISpec | None = None
    input_schema: dict[str, Any] = Field(default_factory=dict)
    output_schema: dict[str, Any] = Field(default_factory=dict)
    config_schema: dict[str, Any] = Field(default_factory=dict)


class StreamEvent(BaseModel):
    """One server-sent event emitted by a streaming module."""

    model_config = ConfigDict(extra="forbid")

    type: str = Field(
        description="Event name, e.g. 'delta', 'message', 'done', 'error'."
    )
    data: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def delta(cls, text: str, **extra: Any) -> StreamEvent:
        return cls(type="delta", data={"text": text, **extra})

    @classmethod
    def done(cls, **extra: Any) -> StreamEvent:
        return cls(type="done", data=dict(extra))

    @classmethod
    def error(cls, message: str, code: str = "module_error") -> StreamEvent:
        return cls(type="error", data={"message": message, "code": code})


@dataclass(slots=True)
class ModuleContext:
    """Per-invocation context handed to a module.

    Keeps request-scoped concerns (identity, correlation, module config) out of
    the payload models so the payload stays the module's own domain contract.
    """

    module_id: str
    request_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    user_id: str | None = None
    config: Mapping[str, Any] = field(default_factory=dict)
    metadata: Mapping[str, Any] = field(default_factory=dict)

    def get(self, key: str, default: Any = None) -> Any:
        return self.config.get(key, default)


class AIModule(abc.ABC, Generic[TInput, TOutput]):
    """Base class for every pluggable module.

    Subclasses declare ``manifest``, ``InputModel`` and ``OutputModel`` and
    implement :meth:`invoke`. Streaming modules also implement :meth:`stream`
    and list ``"stream"`` in their manifest capabilities.
    """

    manifest: ClassVar[ModuleManifest]
    InputModel: ClassVar[type[BaseModel]]
    OutputModel: ClassVar[type[BaseModel]]

    #: Optional defaults merged under any per-request config.
    default_config: ClassVar[dict[str, Any]] = {}

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        if abc.ABC in cls.__bases__:
            return
        for attr in ("manifest", "InputModel", "OutputModel"):
            if not hasattr(cls, attr):
                raise TypeError(f"{cls.__name__} must define `{attr}`")

    # -- lifecycle ---------------------------------------------------------
    async def startup(self) -> None:  # pragma: no cover - default no-op
        """Called once when the app boots. Open clients/pools here."""

    async def shutdown(self) -> None:  # pragma: no cover - default no-op
        """Called once when the app stops. Close clients/pools here."""

    async def health(self) -> dict[str, Any]:
        return {"status": "ok"}

    # -- execution ---------------------------------------------------------
    @abc.abstractmethod
    async def invoke(self, payload: TInput, ctx: ModuleContext) -> TOutput:
        """Run the module once and return a typed result."""

    async def stream(
        self, payload: TInput, ctx: ModuleContext
    ) -> AsyncIterator[StreamEvent]:
        """Yield incremental events. Default: emit the invoke result as one event."""
        result = await self.invoke(payload, ctx)
        yield StreamEvent(type="message", data=result.model_dump())
        yield StreamEvent.done()

    # -- optional extra HTTP surface --------------------------------------
    def routes(self) -> Any | None:
        """Return an ``APIRouter`` mounted at /api/modules/<id>/x, or None."""
        return None

    # -- helpers -----------------------------------------------------------
    @classmethod
    def build_manifest(cls) -> ModuleManifest:
        """Manifest with JSON schemas filled in from the declared models."""
        manifest = cls.manifest.model_copy(deep=True)
        manifest.input_schema = cls.InputModel.model_json_schema()
        manifest.output_schema = cls.OutputModel.model_json_schema()
        return manifest
