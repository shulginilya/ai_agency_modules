import type { ReactNode } from 'react';
import { useModuleManifest } from './hooks';
import { getModuleComponent } from './registry';

export interface ModuleHostProps {
  /** Backend module id, e.g. `"chat"`. */
  moduleId: string;
  config?: Record<string, unknown>;
  props?: Record<string, unknown>;
  className?: string;
  fallback?: ReactNode;
  renderError?: (message: string) => ReactNode;
}

/**
 * Resolves a backend module to its registered React component.
 *
 * The host app never imports module components directly - it renders
 * `<ModuleHost moduleId="chat" />` and the manifest decides what appears.
 */
export function ModuleHost({
  moduleId,
  config,
  props,
  className,
  fallback = null,
  renderError,
}: ModuleHostProps) {
  const { data: manifest, loading, error } = useModuleManifest(moduleId);
  const fail = renderError ?? ((message: string) => <div role="alert">{message}</div>);

  if (loading) return <>{fallback}</>;
  if (error || !manifest) return <>{fail(error?.message ?? `Module "${moduleId}" not found`)}</>;

  const key = manifest.ui?.component;
  if (!key) return <>{fail(`Module "${moduleId}" declares no UI component`)}</>;

  const registration = getModuleComponent(key);
  if (!registration) {
    return <>{fail(`No component registered for "${key}". Import its package to register it.`)}</>;
  }

  const Component = registration.render;
  return (
    <Component
      manifest={manifest}
      config={config}
      className={className}
      props={{ ...(manifest.ui?.default_props ?? {}), ...(props ?? {}) }}
    />
  );
}
