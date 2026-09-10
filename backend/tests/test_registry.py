from __future__ import annotations

import pytest
from pydantic import BaseModel

from aim_core import AIModule, ModuleContext, ModuleManifest, ModuleNotFound, ModuleRegistry


class Echo(BaseModel):
    text: str


class EchoModule(AIModule[Echo, Echo]):
    manifest = ModuleManifest(id="echo", name="Echo")
    InputModel = Echo
    OutputModel = Echo

    async def invoke(self, payload: Echo, ctx: ModuleContext) -> Echo:
        return Echo(text=payload.text[::-1])


def test_register_and_get():
    reg = ModuleRegistry()
    reg.register_class(EchoModule)
    assert reg.ids() == ["echo"]
    assert "echo" in reg
    assert isinstance(reg.get("echo"), EchoModule)


def test_duplicate_id_rejected():
    reg = ModuleRegistry()
    reg.register_class(EchoModule)
    with pytest.raises(ValueError):
        reg.register_class(EchoModule)


def test_unknown_module_raises():
    with pytest.raises(ModuleNotFound):
        ModuleRegistry().get("nope")


def test_manifest_carries_generated_schemas():
    manifest = EchoModule.build_manifest()
    assert manifest.input_schema["properties"]["text"]["type"] == "string"
    assert manifest.output_schema["properties"]["text"]["type"] == "string"


def test_discovery_finds_bundled_modules():
    reg = ModuleRegistry().discover(packages=["aim_modules"])
    assert "chat" in reg.ids()


def test_enabled_filter_excludes_others():
    reg = ModuleRegistry().discover(packages=["aim_modules"], enabled=["nothing"])
    assert reg.ids() == []


async def test_default_stream_wraps_invoke():
    module = EchoModule()
    ctx = ModuleContext(module_id="echo")
    events = [e async for e in module.stream(Echo(text="ab"), ctx)]
    assert [e.type for e in events] == ["message", "done"]
    assert events[0].data["text"] == "ba"
