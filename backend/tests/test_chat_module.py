from __future__ import annotations

import json

from aim_core import ModuleContext
from aim_modules.chat import ChatInput, ChatMessage, ChatModule
from aim_modules.chat.providers import MockProvider


def _payload(text: str = "hello there") -> dict:
    return {"messages": [{"role": "user", "content": text}]}


async def test_invoke_returns_typed_output():
    module = ChatModule(provider=MockProvider(delay=0.0))
    result = await module.invoke(
        ChatInput(messages=[ChatMessage(role="user", content="hi")]),
        ModuleContext(module_id="chat"),
    )
    assert result.message.role == "assistant"
    assert "hi" in result.message.content
    assert result.usage.output_tokens > 0


async def test_stream_emits_start_deltas_message_done():
    module = ChatModule(provider=MockProvider(delay=0.0))
    events = [
        e
        async for e in module.stream(
            ChatInput(messages=[ChatMessage(role="user", content="hi")]),
            ModuleContext(module_id="chat"),
        )
    ]
    types = [e.type for e in events]
    assert types[0] == "start"
    assert types[-1] == "done"
    assert "delta" in types
    joined = "".join(e.data["text"] for e in events if e.type == "delta")
    message = next(e for e in events if e.type == "message")
    assert message.data["content"] == joined


def test_health_endpoint_lists_modules(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["modules"] == ["chat"]


def test_list_modules(client):
    manifests = client.get("/api/modules").json()
    assert len(manifests) == 1
    chat = manifests[0]
    assert chat["id"] == "chat"
    assert chat["ui"]["component"] == "chat"
    assert "stream" in chat["capabilities"]
    assert "messages" in chat["input_schema"]["properties"]


def test_invoke_endpoint(client):
    response = client.post("/api/modules/chat/invoke", json={"payload": _payload()})
    assert response.status_code == 200
    body = response.json()
    assert body["module_id"] == "chat"
    assert body["result"]["provider"] == "mock"


def test_invalid_payload_returns_422_with_details(client):
    response = client.post(
        "/api/modules/chat/invoke", json={"payload": {"messages": []}}
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_payload"


def test_unknown_module_returns_404(client):
    response = client.post("/api/modules/ghost/invoke", json={"payload": {}})
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "module_not_found"


def test_stream_endpoint_emits_sse(client):
    with client.stream(
        "POST", "/api/modules/chat/stream", json={"payload": _payload()}
    ) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        raw = "".join(response.iter_text())

    blocks = [b for b in raw.split("\n\n") if b.strip()]
    parsed = []
    for block in blocks:
        lines = dict(line.split(": ", 1) for line in block.splitlines())
        parsed.append((lines["event"], json.loads(lines["data"])))

    assert parsed[0][0] == "start"
    assert parsed[-1][0] == "done"
    assert any(event == "delta" for event, _ in parsed)


def test_mock_provider_does_not_borrow_the_anthropic_model_name():
    module = ChatModule()
    assert module._default_provider.model == "mock-1"


def test_module_owned_routes_are_mounted(client):
    body = client.get("/api/modules/chat/x/providers").json()
    assert body["default"] == "mock"
