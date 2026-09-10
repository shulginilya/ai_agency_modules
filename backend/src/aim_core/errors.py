"""Error types shared by the framework and by modules."""

from __future__ import annotations

from typing import Any


class ModuleError(Exception):
    """Base class for errors a module raises deliberately."""

    status_code = 500
    code = "module_error"

    def __init__(self, message: str, *, details: Any | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.details is not None:
            payload["details"] = self.details
        return payload


class ModuleNotFound(ModuleError):
    status_code = 404
    code = "module_not_found"


class ModuleValidationError(ModuleError):
    status_code = 422
    code = "invalid_payload"


class CapabilityNotSupported(ModuleError):
    status_code = 405
    code = "capability_not_supported"


class ProviderError(ModuleError):
    status_code = 502
    code = "provider_error"
