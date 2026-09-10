"""aim_core - a tiny framework for pluggable AI modules."""

from .app import __version__, create_app
from .contracts import (
    AIModule,
    Capability,
    ModuleContext,
    ModuleManifest,
    StreamEvent,
    UISpec,
)
from .errors import (
    CapabilityNotSupported,
    ModuleError,
    ModuleNotFound,
    ModuleValidationError,
    ProviderError,
)
from .registry import ModuleRegistry
from .settings import Settings, get_settings

__all__ = [
    "AIModule",
    "Capability",
    "CapabilityNotSupported",
    "ModuleContext",
    "ModuleError",
    "ModuleManifest",
    "ModuleNotFound",
    "ModuleRegistry",
    "ModuleValidationError",
    "ProviderError",
    "Settings",
    "StreamEvent",
    "UISpec",
    "__version__",
    "create_app",
    "get_settings",
]
