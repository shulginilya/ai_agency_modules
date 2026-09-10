"""Discovery and lookup of installed modules.

Two discovery mechanisms, both optional:

1. **Package scan** - every subpackage of a configured package (default
   ``aim_modules``) is imported and searched for ``AIModule`` subclasses.
2. **Entry points** - third-party distributions expose modules under the
   ``ai_modules`` entry-point group, so a module can live in its own repo and
   be installed with ``pip install``.
"""

from __future__ import annotations

import importlib
import inspect
import logging
import pkgutil
from collections.abc import Iterable, Iterator
from importlib.metadata import entry_points

from .contracts import AIModule, ModuleManifest
from .errors import ModuleNotFound

logger = logging.getLogger(__name__)


class ModuleRegistry:
    """Holds the live module instances for one application."""

    def __init__(self) -> None:
        self._modules: dict[str, AIModule] = {}

    # -- registration ------------------------------------------------------
    def register(self, module: AIModule) -> None:
        module_id = module.manifest.id
        if module_id in self._modules:
            raise ValueError(f"Duplicate module id: {module_id!r}")
        self._modules[module_id] = module
        logger.info("Registered module %s v%s", module_id, module.manifest.version)

    def register_class(self, cls: type[AIModule]) -> None:
        self.register(cls())

    # -- lookup ------------------------------------------------------------
    def get(self, module_id: str) -> AIModule:
        try:
            return self._modules[module_id]
        except KeyError:
            raise ModuleNotFound(f"No module registered with id {module_id!r}") from None

    def __contains__(self, module_id: object) -> bool:
        return module_id in self._modules

    def __iter__(self) -> Iterator[AIModule]:
        return iter(self._modules.values())

    def __len__(self) -> int:
        return len(self._modules)

    def ids(self) -> list[str]:
        return sorted(self._modules)

    def manifests(self) -> list[ModuleManifest]:
        ordered = sorted(self._modules.values(), key=lambda m: m.manifest.id)
        return [m.build_manifest() for m in ordered]

    # -- lifecycle ---------------------------------------------------------
    async def startup(self) -> None:
        for module in self._modules.values():
            await module.startup()

    async def shutdown(self) -> None:
        for module in self._modules.values():
            await module.shutdown()

    # -- discovery ---------------------------------------------------------
    def discover(
        self,
        packages: Iterable[str] = (),
        entry_point_group: str | None = None,
        enabled: Iterable[str] = (),
    ) -> ModuleRegistry:
        """Import and register everything that looks like a module."""
        allow = set(enabled)
        found: list[type[AIModule]] = []
        for package_name in packages:
            found.extend(_scan_package(package_name))
        if entry_point_group:
            found.extend(_scan_entry_points(entry_point_group))

        for cls in _dedupe(found):
            module_id = cls.manifest.id
            if allow and module_id not in allow:
                logger.debug("Skipping module %s (not in enabled_modules)", module_id)
                continue
            if module_id in self._modules:
                continue
            self.register_class(cls)
        return self


def _dedupe(classes: Iterable[type[AIModule]]) -> list[type[AIModule]]:
    seen: dict[str, type[AIModule]] = {}
    for cls in classes:
        seen.setdefault(f"{cls.__module__}.{cls.__qualname__}", cls)
    return list(seen.values())


def _scan_package(package_name: str) -> list[type[AIModule]]:
    try:
        package = importlib.import_module(package_name)
    except ModuleNotFoundError:
        logger.warning("Module package %r not importable; skipping", package_name)
        return []

    found = _classes_in(package)
    for info in pkgutil.walk_packages(
        getattr(package, "__path__", []), prefix=f"{package_name}."
    ):
        try:
            submodule = importlib.import_module(info.name)
        except Exception:  # pragma: no cover - a broken module must not kill boot
            logger.exception("Failed importing %s", info.name)
            continue
        found.extend(_classes_in(submodule))
    return found


def _scan_entry_points(group: str) -> list[type[AIModule]]:
    found: list[type[AIModule]] = []
    for ep in entry_points(group=group):
        try:
            loaded = ep.load()
        except Exception:  # pragma: no cover
            logger.exception("Failed loading entry point %s", ep.name)
            continue
        if inspect.isclass(loaded) and issubclass(loaded, AIModule):
            found.append(loaded)
        else:
            logger.warning("Entry point %s did not resolve to an AIModule", ep.name)
    return found


def _classes_in(namespace: object) -> list[type[AIModule]]:
    return [
        obj
        for obj in vars(namespace).values()
        if inspect.isclass(obj)
        and issubclass(obj, AIModule)
        and obj is not AIModule
        and not inspect.isabstract(obj)
        and hasattr(obj, "manifest")
    ]
