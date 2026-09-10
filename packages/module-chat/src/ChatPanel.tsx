import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { ModuleComponentProps } from '@ai-modules/core';
import { useChat } from './useChat';
import type { ChatPanelOptions } from './types';
import './styles.css';

export type ChatPanelProps = ModuleComponentProps<ChatPanelOptions>;

/**
 * Default UI for the `chat` module. Rendered by `<ModuleHost moduleId="chat" />`,
 * or imported directly when a host wants to place it itself.
 */
export function ChatPanel({ manifest, config, props, className }: ChatPanelProps) {
  const options: ChatPanelOptions = props ?? {};
  const {
    placeholder = 'Message...',
    showUsage = true,
    emptyState = 'Start the conversation.',
    system,
    temperature,
    maxTokens,
    streaming = true,
  } = options;

  const supportsStreaming = manifest?.capabilities?.includes('stream') ?? false;
  const { messages, pending, busy, error, lastResult, send, cancel, reset } = useChat({
    moduleId: manifest?.id ?? 'chat',
    config,
    system,
    temperature,
    maxTokens,
    streaming: streaming && supportsStreaming,
  });

  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, pending]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft;
    setDraft('');
    void send(text);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const visible = messages.filter((message) => message.role !== 'system');

  return (
    <section className={['aim-chat', className].filter(Boolean).join(' ')}>
      <header className="aim-chat__header">
        <span className="aim-chat__title">{manifest?.name ?? 'Chat'}</span>
        <span className="aim-chat__meta">
          {showUsage && lastResult
            ? `${lastResult.provider} / ${lastResult.model}`
            : (manifest?.description ?? '')}
        </span>
      </header>

      <div className="aim-chat__log" ref={logRef} role="log" aria-live="polite">
        {visible.length === 0 && !pending ? <p className="aim-chat__empty">{emptyState}</p> : null}

        {visible.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`aim-chat__bubble aim-chat__bubble--${message.role}`}
          >
            {message.content}
          </div>
        ))}

        {pending ? (
          <div className="aim-chat__bubble aim-chat__bubble--assistant">
            {pending}
            <span className="aim-chat__caret" aria-hidden="true">
              ▍
            </span>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="aim-chat__error" role="alert">
          {error.message}
        </p>
      ) : null}

      <form className="aim-chat__composer" onSubmit={submit}>
        <textarea
          className="aim-chat__input"
          value={draft}
          placeholder={placeholder}
          aria-label="Message"
          rows={1}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {busy ? (
          <button
            type="button"
            className="aim-chat__button aim-chat__button--ghost"
            onClick={cancel}
          >
            Stop
          </button>
        ) : (
          <button type="submit" className="aim-chat__button" disabled={!draft.trim()}>
            Send
          </button>
        )}
        <button
          type="button"
          className="aim-chat__button aim-chat__button--ghost"
          onClick={reset}
          disabled={busy || visible.length === 0}
        >
          Clear
        </button>
      </form>
    </section>
  );
}
