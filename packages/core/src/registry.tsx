import type { ComponentType } from 'react';
import type { ModuleManifest } from './types';

/** Props every module component receives from `<ModuleHost />`. */
export interface ModuleComponentProps<TProps = Record<string, unknown>> {
  manifest: ModuleManifest;
  /** Per-request config forwarded to the backend (`ModuleContext.config`). */
  config?: Record<string, unknown>;
  props?: TProps;
  className?: string;
}

/**
 * A module component with any prop shape. `any` is deliberate: registrations
 * are heterogeneous by design, and each component keeps its own precise props.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyModuleComponent = ComponentType<ModuleComponentProps<any>>;

export interface ModuleRegistration {
  /** Must match `manifest.ui.component` from the backend. */
  component: string;
  render: AnyModuleComponent;
  displayName?: string;
}

const registry = new Map<string, ModuleRegistration>();

/** Register a module's UI. Call once at import time from the module package. */
export function registerModuleComponent(registration: ModuleRegistration): void {
  registry.set(registration.component, registration);
}

export function getModuleComponent(key: string): ModuleRegistration | undefined {
  return registry.get(key);
}

export function registeredComponents(): string[] {
  return [...registry.keys()].sort();
}

/** Test/HMR helper. */
export function clearModuleComponents(): void {
  registry.clear();
}
