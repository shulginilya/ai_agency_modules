from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from aim_core import ModuleRegistry, Settings, create_app
from aim_modules.chat import ChatModule
from aim_modules.chat.providers import MockProvider


@pytest.fixture
def registry() -> ModuleRegistry:
    reg = ModuleRegistry()
    reg.register(ChatModule(provider=MockProvider(delay=0.0)))
    return reg


@pytest.fixture
def client(registry: ModuleRegistry):
    app = create_app(settings=Settings(cors_origins=[]), registry=registry)
    with TestClient(app) as test_client:
        yield test_client
