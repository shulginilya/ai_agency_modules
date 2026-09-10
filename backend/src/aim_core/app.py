"""FastAPI application factory."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .errors import ModuleError
from .registry import ModuleRegistry
from .router import create_modules_router
from .settings import Settings, get_settings

logger = logging.getLogger(__name__)

__version__ = "0.1.0"


def create_app(
    settings: Settings | None = None, registry: ModuleRegistry | None = None
) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=logging.DEBUG if settings.debug else logging.INFO)

    if registry is None:
        registry = ModuleRegistry().discover(
            packages=settings.module_packages,
            entry_point_group=settings.entry_point_group,
            enabled=settings.enabled_modules,
        )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        await registry.startup()
        logger.info("Modules ready: %s", ", ".join(registry.ids()) or "(none)")
        try:
            yield
        finally:
            await registry.shutdown()

    app = FastAPI(
        title=settings.app_name,
        version=__version__,
        lifespan=lifespan,
        debug=settings.debug,
    )
    app.state.registry = registry
    app.state.settings = settings

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
            expose_headers=["X-Request-Id"],
        )

    @app.exception_handler(ModuleError)
    async def module_error_handler(_: Request, exc: ModuleError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"error": exc.to_dict()})

    @app.get("/health", tags=["meta"])
    async def health() -> dict[str, object]:
        return {"status": "ok", "version": __version__, "modules": registry.ids()}

    app.include_router(create_modules_router(registry), prefix=settings.api_prefix)
    return app


app = create_app()
