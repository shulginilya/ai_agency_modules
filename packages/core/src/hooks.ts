import { useCallback, useEffect, useRef, useState } from 'react';
import { useModulesClient } from './context';
import type { InvokeRequest, ModuleApiError, ModuleManifest, StreamHandlers } from './types';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: ModuleApiError | null;
}

/** All modules the backend exposes. */
export function useModules(): AsyncState<ModuleManifest[]> & { refresh: () => void } {
  const client = useModulesClient();
  const [state, setState] = useState<AsyncState<ModuleManifest[]>>({
    data: null,
    loading: true,
    error: null,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState((previous) => ({ ...previous, loading: true }));
    client
      .listModules(controller.signal)
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error: ModuleApiError) => {
        if (controller.signal.aborted) return;
        setState({ data: null, loading: false, error });
      });
    return () => controller.abort();
  }, [client, nonce]);

  return { ...state, refresh: useCallback(() => setNonce((n) => n + 1), []) };
}

/** One module's manifest. */
export function useModuleManifest(moduleId: string): AsyncState<ModuleManifest> {
  const client = useModulesClient();
  const [state, setState] = useState<AsyncState<ModuleManifest>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    setState({ data: null, loading: true, error: null });
    client
      .getManifest(moduleId, controller.signal)
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error: ModuleApiError) => {
        if (controller.signal.aborted) return;
        setState({ data: null, loading: false, error });
      });
    return () => controller.abort();
  }, [client, moduleId]);

  return state;
}

/** Imperative one-shot invoke with loading/error state. */
export function useModuleInvoke<TResult, TPayload = unknown>(moduleId: string) {
  const client = useModulesClient();
  const [state, setState] = useState<AsyncState<TResult>>({
    data: null,
    loading: false,
    error: null,
  });

  const invoke = useCallback(
    async (request: InvokeRequest<TPayload>): Promise<TResult | null> => {
      setState({ data: null, loading: true, error: null });
      try {
        const result = await client.invoke<TResult, TPayload>(moduleId, request);
        setState({ data: result, loading: false, error: null });
        return result;
      } catch (error) {
        setState({ data: null, loading: false, error: error as ModuleApiError });
        return null;
      }
    },
    [client, moduleId],
  );

  return { ...state, invoke };
}

/**
 * Streaming invoke. Accumulates `delta` text into `text` and exposes `cancel`.
 * The in-flight request is aborted on unmount.
 */
export function useModuleStream<TResult = unknown, TPayload = unknown>(moduleId: string) {
  const client = useModulesClient();
  const controllerRef = useRef<AbortController | null>(null);
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<ModuleApiError | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setStreaming(false);
  }, []);

  const start = useCallback(
    async (request: InvokeRequest<TPayload>, handlers: StreamHandlers<TResult> = {}) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setText('');
      setError(null);
      setStreaming(true);
      try {
        await client.stream<TResult, TPayload>(moduleId, request, {
          ...handlers,
          signal: controller.signal,
          onDelta: (chunk) => {
            setText((previous) => previous + chunk);
            handlers.onDelta?.(chunk);
          },
          onError: (streamError) => {
            setError(streamError);
            handlers.onError?.(streamError);
          },
        });
      } catch (streamError) {
        if (!controller.signal.aborted) setError(streamError as ModuleApiError);
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
        setStreaming(false);
      }
    },
    [client, moduleId],
  );

  return { text, streaming, error, start, cancel, reset: () => setText('') };
}
