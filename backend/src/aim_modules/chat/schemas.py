"""Input/output contract for the chat module."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Role = Literal["system", "user", "assistant"]


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Role
    content: str = Field(min_length=1, max_length=32_000)


class ChatInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    messages: list[ChatMessage] = Field(min_length=1, max_length=200)
    system: str | None = Field(default=None, max_length=8_000)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=1024, ge=1, le=8192)


class ChatUsage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0


class ChatOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: ChatMessage
    model: str
    provider: str
    usage: ChatUsage = Field(default_factory=ChatUsage)
    finish_reason: str = "stop"
