"""Provider adapters for the chat module.

The module depends on the :class:`ChatProvider` protocol, not on any vendor
SDK, so swapping providers (or testing) means passing a different object. The
mock provider is the default so a fresh clone runs with no API key.
"""

from __future__ import annotations

import asyncio
import os
import re
from collections.abc import AsyncIterator
from typing import Protocol, runtime_checkable

from aim_core.errors import ProviderError

from .schemas import ChatInput, ChatMessage, ChatOutput, ChatUsage


@runtime_checkable
class ChatProvider(Protocol):
    name: str
    model: str

    async def complete(self, payload: ChatInput) -> ChatOutput: ...

    def stream(self, payload: ChatInput) -> AsyncIterator[str]: ...


def _estimate_tokens(text: str) -> int:
    """Rough token estimate; good enough for a demo's usage numbers."""
    return max(1, len(text) // 4)


class MockProvider:
    """Deterministic echo-style provider - no network, no key, no cost."""

    name = "mock"

    def __init__(self, model: str = "mock-1", delay: float = 0.02) -> None:
        self.model = model
        self.delay = delay

    def _reply(self, payload: ChatInput) -> str:
        last_user = next(
            (m.content for m in reversed(payload.messages) if m.role == "user"),
            "",
        )
        turns = sum(1 for m in payload.messages if m.role == "user")
        words = len(re.findall(r"\w+", last_user))
        return (
            f'You said: "{last_user.strip()}"\n\n'
            f"This is the mock chat provider, so nothing left your machine. "
            f"It counted {words} word(s) in turn {turns} of this conversation "
            f"and would have used temperature {payload.temperature}. "
            f"Set AIM_LLM_PROVIDER=anthropic and AIM_ANTHROPIC_API_KEY to talk "
            f"to a real model."
        )

    async def complete(self, payload: ChatInput) -> ChatOutput:
        text = self._reply(payload)
        await asyncio.sleep(self.delay)
        return ChatOutput(
            message=ChatMessage(role="assistant", content=text),
            model=self.model,
            provider=self.name,
            usage=ChatUsage(
                input_tokens=sum(_estimate_tokens(m.content) for m in payload.messages),
                output_tokens=_estimate_tokens(text),
            ),
        )

    async def stream(self, payload: ChatInput) -> AsyncIterator[str]:
        for chunk in re.findall(r"\S+\s*", self._reply(payload)):
            await asyncio.sleep(self.delay)
            yield chunk


class AnthropicProvider:
    """Thin adapter over the official ``anthropic`` async SDK."""

    name = "anthropic"

    def __init__(self, api_key: str | None = None, model: str = "claude-sonnet-4-5") -> None:
        self.model = model
        self._api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        self._client = None

    def _get_client(self):
        if self._client is None:
            try:
                from anthropic import AsyncAnthropic
            except ImportError as exc:  # pragma: no cover - optional dependency
                raise ProviderError(
                    "The 'anthropic' package is not installed. "
                    "Install it with: pip install 'aim-backend[anthropic]'"
                ) from exc
            if not self._api_key:
                raise ProviderError("AIM_ANTHROPIC_API_KEY is not set")
            self._client = AsyncAnthropic(api_key=self._api_key)
        return self._client

    def _kwargs(self, payload: ChatInput) -> dict:
        kwargs = {
            "model": self.model,
            "max_tokens": payload.max_tokens,
            "temperature": payload.temperature,
            "messages": [
                {"role": m.role, "content": m.content}
                for m in payload.messages
                if m.role != "system"
            ],
        }
        system = payload.system or next(
            (m.content for m in payload.messages if m.role == "system"), None
        )
        if system:
            kwargs["system"] = system
        return kwargs

    async def complete(self, payload: ChatInput) -> ChatOutput:
        client = self._get_client()
        try:
            response = await client.messages.create(**self._kwargs(payload))
        except Exception as exc:  # pragma: no cover - network path
            raise ProviderError(f"Anthropic request failed: {exc}") from exc
        text = "".join(
            block.text for block in response.content if getattr(block, "type", "") == "text"
        )
        return ChatOutput(
            message=ChatMessage(role="assistant", content=text),
            model=response.model,
            provider=self.name,
            usage=ChatUsage(
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
            ),
            finish_reason=response.stop_reason or "stop",
        )

    async def stream(self, payload: ChatInput) -> AsyncIterator[str]:
        client = self._get_client()
        try:
            async with client.messages.stream(**self._kwargs(payload)) as stream:
                async for text in stream.text_stream:
                    yield text
        except Exception as exc:  # pragma: no cover - network path
            raise ProviderError(f"Anthropic stream failed: {exc}") from exc


def build_provider(name: str, **kwargs) -> ChatProvider:
    """Factory used by the module; extend this when adding a provider."""
    if name == "mock":
        return MockProvider(model=kwargs.get("model") or "mock-1")
    if name == "anthropic":
        return AnthropicProvider(
            api_key=kwargs.get("api_key"),
            model=kwargs.get("model") or "claude-sonnet-4-5",
        )
    raise ProviderError(f"Unknown chat provider: {name!r}")
