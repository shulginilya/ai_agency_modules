import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { ModulesClient, type ModulesClientOptions } from './client';

interface ModulesContextValue {
  client: ModulesClient;
}

const ModulesContext = createContext<ModulesContextValue | null>(null);

export interface ModulesProviderProps extends Partial<ModulesClientOptions> {
  /** Pass a pre-built client instead of `baseUrl` when you need custom wiring. */
  client?: ModulesClient;
  children: ReactNode;
}

export function ModulesProvider({
  client,
  baseUrl = '/api',
  headers,
  fetchImpl,
  children,
}: ModulesProviderProps) {
  const value = useMemo<ModulesContextValue>(
    () => ({ client: client ?? new ModulesClient({ baseUrl, headers, fetchImpl }) }),
    [client, baseUrl, headers, fetchImpl],
  );
  return <ModulesContext.Provider value={value}>{children}</ModulesContext.Provider>;
}

export function useModulesClient(): ModulesClient {
  const context = useContext(ModulesContext);
  if (!context) {
    throw new Error('useModulesClient must be used inside a <ModulesProvider>.');
  }
  return context.client;
}
