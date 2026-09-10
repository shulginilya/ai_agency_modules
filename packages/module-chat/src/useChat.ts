import { useCallback, useRef, useState } from 'react';
import { useModulesClient, type ModuleApiError } from '@ai-modules/core';
import type { ChatMessage, ChatPayload, ChatPanelOptions, ChatResult } from './types';

export interface UseChatOptions extends ChatPanelOptions {
  moduleId?: string;
  config?: Record<string, unknown>;
  initialMessages?: ChatMessage[];
}

/**
 * Conversation state on top of the generic module client.
 *
 * Kept separate from the presentational component so a host app can build its
 * own chat UI while reusing the transport and turn-taking logic.
 */
export function useChat({
  moduleId = 'chat',
  config,
  initialMessages = [],
  system,
  temperature,
  maxTokens,
  streaming = true,
}: UseChatOptions = {}) {
  const client = useModulesClient();
  const controllerRef = useRef<AbortController | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [pending, setPending] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ModuleApiError | null>(null);
  const [lastResult, setLastResult] = useState<ChatResult | null>(null);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setBusy(false);
    setPending((buffered) => {
      if (buffered) {
        setMessages((history) => [...history, { role: 'assistant', content: buffered }]);
      }
      return '';
    });
  }, []);

  const reset = useCallback(() => {
    cancel();
    setMessages(initialMessages);
    setError(null);
    setLastResult(null);
  }, [cancel, initialMessages]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      const history = [...messages, { role: 'user', content: trimmed } as ChatMessage];
      setMessages(history);
      setError(null);
      setPending('');
      setBusy(true);

      const payload: ChatPayload = {
        messages: history,
        ...(system ? { system } : {}),
        ...(temperature !== undefined ? { temperature } : {}),
        ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
      };

      const controller = new AbortController();
      controllerRef.current = controller;

      try {
        if (streaming) {
          let buffer = '';
          await client.stream<ChatMessage, ChatPayload>(
            moduleId,
            { payload, config },
            {
              signal: controller.signal,
              onDelta: (chunk) => {
                buffer += chunk;
                setPending(buffer);
              },
              onDone: (data) => {
                setMessages((current) => [...current, { role: 'assistant', content: buffer }]);
                setPending('');
                setLastResult({
                  message: { role: 'assistant', content: buffer },
                  model: String(data.model ?? ''),
                  provider: String(data.provider ?? ''),
                  usage: { input_tokens: 0, output_tokens: 0 },
                  finish_reason: 'stop',
                });
              },
              onError: setError,
            },
          );
        } else {
          const result = await client.invoke<ChatResult, ChatPayload>(moduleId, {
            payload,
            config,
          });
          setMessages((current) => [...current, result.message]);
          setLastResult(result);
        }
      } catch (sendError) {
        if (!controller.signal.aborted) setError(sendError as ModuleApiError);
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
        setBusy(false);
      }
    },
    [busy, client, config, maxTokens, messages, moduleId, streaming, system, temperature],
  );

  return { messages, pending, busy, error, lastResult, send, cancel, reset };
}
