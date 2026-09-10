import {
  InvokeRequest,
  InvokeResponse,
  ModuleApiError,
  ModuleManifest,
  StreamEvent,
  StreamHandlers,
} from './types';

export interface ModulesClientOptions {
  /** Root of the API, e.g. `http://localhost:8000/api`. */
  baseUrl: string;
  /** Extra headers (auth, tenant, correlation ids). Re-read on every call. */
  headers?: HeadersInit | (() => HeadersInit);
  fetchImpl?: typeof fetch;
}

/**
 * Transport for the module API. Framework-agnostic on purpose: the React
 * bindings in this package are a thin layer over it, and a non-React host can
 * use the client directly.
 */
export class ModulesClient {
  private readonly baseUrl: string;
  private readonly headers: ModulesClientOptions['headers'];
  private readonly fetchImpl: typeof fetch;

  constructor({ baseUrl, headers, fetchImpl }: ModulesClientOptions) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.headers = headers;
    this.fetchImpl = fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  private resolveHeaders(): HeadersInit {
    return typeof this.headers === 'function' ? this.headers() : (this.headers ?? {});
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchImpl(this.url(path), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...this.resolveHeaders(),
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw await toApiError(response);
    }
    return (await response.json()) as T;
  }

  listModules(signal?: AbortSignal): Promise<ModuleManifest[]> {
    return this.request<ModuleManifest[]>('/modules', { method: 'GET', signal });
  }

  getManifest(moduleId: string, signal?: AbortSignal): Promise<ModuleManifest> {
    return this.request<ModuleManifest>(`/modules/${moduleId}`, { method: 'GET', signal });
  }

  async invoke<TResult, TPayload = unknown>(
    moduleId: string,
    request: InvokeRequest<TPayload>,
    signal?: AbortSignal,
  ): Promise<TResult> {
    const response = await this.request<InvokeResponse<TResult>>(`/modules/${moduleId}/invoke`, {
      method: 'POST',
      body: JSON.stringify(withDefaults(request)),
      signal,
    });
    return response.result;
  }

  /**
   * Consume a module's SSE stream. Resolves once the terminal `done` event
   * arrives (or the request is aborted); rejects on transport/module errors.
   */
  async stream<TResult = unknown, TPayload = unknown>(
    moduleId: string,
    request: InvokeRequest<TPayload>,
    handlers: StreamHandlers<TResult> = {},
  ): Promise<void> {
    const response = await this.fetchImpl(this.url(`/modules/${moduleId}/stream`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...this.resolveHeaders(),
      },
      body: JSON.stringify(withDefaults(request)),
      signal: handlers.signal,
    });

    if (!response.ok) {
      const error = await toApiError(response);
      handlers.onError?.(error);
      throw error;
    }
    if (!response.body) {
      throw new ModuleApiError({ code: 'no_stream_body', message: 'Response had no body' });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line.
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const event = parseFrame(frame);
          if (event) {
            dispatch(event, handlers);
            if (event.type === 'done') return;
          }
          boundary = buffer.indexOf('\n\n');
        }
      }
      const trailing = parseFrame(buffer);
      if (trailing) dispatch(trailing, handlers);
    } finally {
      reader.releaseLock();
      void response.body.cancel().catch(() => undefined);
    }
  }
}

function withDefaults<TPayload>(request: InvokeRequest<TPayload>): InvokeRequest<TPayload> {
  return { config: {}, metadata: {}, ...request };
}

function dispatch<TResult>(event: StreamEvent, handlers: StreamHandlers<TResult>): void {
  handlers.onEvent?.(event);
  switch (event.type) {
    case 'delta':
      handlers.onDelta?.(String(event.data.text ?? ''));
      break;
    case 'message':
      handlers.onMessage?.(event.data as TResult);
      break;
    case 'error':
      handlers.onError?.(
        new ModuleApiError({
          code: String(event.data.code ?? 'module_error'),
          message: String(event.data.message ?? 'Stream failed'),
          details: event.data.details,
        }),
      );
      break;
    case 'done':
      handlers.onDone?.(event.data);
      break;
    default:
      break;
  }
}

/** Parses one `event:`/`data:` SSE frame; returns null for comments/keep-alives. */
export function parseFrame(frame: string): StreamEvent | null {
  let type = 'message';
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    const value = separator === -1 ? '' : line.slice(separator + 1).trimStart();
    if (field === 'event') type = value;
    else if (field === 'data') dataLines.push(value);
  }
  if (dataLines.length === 0) return null;
  const raw = dataLines.join('\n');
  try {
    return { type, data: JSON.parse(raw) as Record<string, unknown> };
  } catch {
    return { type, data: { text: raw } };
  }
}

async function toApiError(response: Response): Promise<ModuleApiError> {
  let body = { code: 'http_error', message: `${response.status} ${response.statusText}` };
  try {
    const parsed = (await response.json()) as { error?: typeof body };
    if (parsed?.error) body = parsed.error;
  } catch {
    /* non-JSON error body */
  }
  return new ModuleApiError(body, response.status);
}
