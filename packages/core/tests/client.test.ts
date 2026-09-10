import { describe, expect, it, vi } from 'vitest';
import { ModulesClient, parseFrame } from '../src/client';
import type { StreamEvent } from '../src/types';

function sseResponse(frames: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('parseFrame', () => {
  it('reads event name and JSON data', () => {
    expect(parseFrame('event: delta\ndata: {"text":"hi"}')).toEqual({
      type: 'delta',
      data: { text: 'hi' },
    });
  });

  it('ignores comments and keep-alives', () => {
    expect(parseFrame(': keep-alive')).toBeNull();
  });
});

describe('ModulesClient', () => {
  it('unwraps the invoke envelope', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ module_id: 'chat', request_id: 'r1', result: { ok: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = new ModulesClient({ baseUrl: 'http://api/api', fetchImpl });
    await expect(client.invoke('chat', { payload: {} })).resolves.toEqual({ ok: true });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('http://api/api/modules/chat/invoke');
  });

  it('maps an error body onto ModuleApiError', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'invalid_payload', message: 'nope' } }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = new ModulesClient({ baseUrl: '/api', fetchImpl });
    await expect(client.invoke('chat', { payload: {} })).rejects.toMatchObject({
      code: 'invalid_payload',
      status: 422,
    });
  });

  it('dispatches stream events, including frames split across chunks', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          'event: start\ndata: {"provider":"mock"}\n\nevent: delta\ndata: {"te',
          'xt":"he"}\n\nevent: delta\ndata: {"text":"llo"}\n\n',
          'event: message\ndata: {"role":"assistant","content":"hello"}\n\nevent: done\ndata: {}\n\n',
        ]),
      );
    const client = new ModulesClient({ baseUrl: '/api', fetchImpl });

    const events: StreamEvent[] = [];
    let text = '';
    let done = false;
    await client.stream(
      'chat',
      { payload: {} },
      {
        onEvent: (event) => events.push(event),
        onDelta: (chunk) => (text += chunk),
        onDone: () => (done = true),
      },
    );

    expect(text).toBe('hello');
    expect(done).toBe(true);
    expect(events.map((e) => e.type)).toEqual(['start', 'delta', 'delta', 'message', 'done']);
  });
});
