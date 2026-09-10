"""Server-Sent Events helpers.

The wire format is deliberately boring so any client can read it:

    event: delta
    data: {"text": "hello"}

Every stream ends with a ``done`` event (or an ``error`` event followed by
``done``), which is what the React client keys off to close the reader.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator

from .contracts import StreamEvent
from .errors import ModuleError

logger = logging.getLogger(__name__)

SSE_HEADERS = {
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


def format_sse(event: StreamEvent) -> str:
    payload = json.dumps(event.data, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event.type}\ndata: {payload}\n\n"


async def sse_response_body(
    events: AsyncIterator[StreamEvent],
) -> AsyncIterator[str]:
    """Wrap a module's event stream: guarantees terminal `done`, maps errors."""
    saw_done = False
    try:
        async for event in events:
            saw_done = saw_done or event.type == "done"
            yield format_sse(event)
    except ModuleError as exc:
        logger.warning("Module error during stream: %s", exc.message)
        yield format_sse(StreamEvent(type="error", data=exc.to_dict()))
        saw_done = False
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Unhandled error during stream")
        yield format_sse(StreamEvent.error(str(exc), code="internal_error"))
        saw_done = False
    finally:
        if not saw_done:
            yield format_sse(StreamEvent.done())
