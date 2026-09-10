/** Mirrors `aim_core.contracts` on the Python side. Keep the two in sync. */

export type Capability = 'invoke' | 'stream' | 'routes';

export interface UISpec {
  /** Key the component is registered under on the client. */
  component: string;
  /** npm package providing the component (documentation only). */
  package?: string | null;
  icon?: string | null;
  default_props?: Record<string, unknown>;
}

export interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  capabilities: Capability[];
  tags: string[];
  ui?: UISpec | null;
  input_schema: JSONSchema;
  output_schema: JSONSchema;
  config_schema: JSONSchema;
}

export type JSONSchema = Record<string, unknown>;

/** Request envelope: domain payload separated from request-scoped concerns. */
export interface InvokeRequest<TPayload = unknown> {
  payload: TPayload;
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface InvokeResponse<TResult = unknown> {
  module_id: string;
  request_id: string;
  result: TResult;
}

export interface StreamEvent<TData = Record<string, unknown>> {
  type: string;
  data: TData;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface StreamHandlers<TResult = unknown> {
  onEvent?: (event: StreamEvent) => void;
  /** Convenience hook for `delta` events carrying `{ text }`. */
  onDelta?: (text: string) => void;
  onMessage?: (message: TResult) => void;
  onDone?: (data: Record<string, unknown>) => void;
  onError?: (error: ModuleApiError) => void;
  signal?: AbortSignal;
}

export class ModuleApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(body: ApiErrorBody, status = 500) {
    super(body.message);
    this.name = 'ModuleApiError';
    this.code = body.code;
    this.status = status;
    this.details = body.details;
  }
}
