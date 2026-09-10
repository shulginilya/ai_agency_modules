import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModulesProvider, type ModuleManifest } from '@ai-modules/core';
import { describe, expect, it, vi } from 'vitest';
import { ChatPanel } from '../src/ChatPanel';

const manifest: ModuleManifest = {
  id: 'chat',
  name: 'Chat',
  version: '0.1.0',
  description: 'demo',
  capabilities: ['invoke', 'stream'],
  tags: [],
  ui: { component: 'chat' },
  input_schema: {},
  output_schema: {},
  config_schema: {},
};

function streamingFetch(frames: string[]) {
  return vi.fn().mockImplementation(() => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        for (const frame of frames) controller.enqueue(encoder.encode(frame));
        controller.close();
      },
    });
    return Promise.resolve(
      new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    );
  });
}

describe('ChatPanel', () => {
  it('shows the user turn and the streamed assistant reply', async () => {
    const fetchImpl = streamingFetch([
      'event: start\ndata: {"provider":"mock","model":"mock-1"}\n\n',
      'event: delta\ndata: {"text":"pong"}\n\n',
      'event: done\ndata: {"provider":"mock","model":"mock-1"}\n\n',
    ]);

    render(
      <ModulesProvider baseUrl="/api" fetchImpl={fetchImpl}>
        <ChatPanel manifest={manifest} props={{}} />
      </ModulesProvider>,
    );

    await userEvent.type(screen.getByLabelText('Message'), 'ping');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(screen.getByText('ping')).toBeDefined();
    await waitFor(() => expect(screen.getByText('pong')).toBeDefined());
    await waitFor(() => expect(screen.getByText(/mock-1/)).toBeDefined());
  });

  it('surfaces a module error from the stream', async () => {
    const fetchImpl = streamingFetch([
      'event: error\ndata: {"code":"provider_error","message":"no key"}\n\n',
      'event: done\ndata: {}\n\n',
    ]);

    render(
      <ModulesProvider baseUrl="/api" fetchImpl={fetchImpl}>
        <ChatPanel manifest={manifest} props={{}} />
      </ModulesProvider>,
    );

    await userEvent.type(screen.getByLabelText('Message'), 'hi');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('no key'));
  });
});
