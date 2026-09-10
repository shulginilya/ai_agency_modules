export { ModulesClient, parseFrame, type ModulesClientOptions } from './client';
export { ModulesProvider, useModulesClient, type ModulesProviderProps } from './context';
export { ModuleHost, type ModuleHostProps } from './ModuleHost';
export { useModuleInvoke, useModuleManifest, useModuleStream, useModules } from './hooks';
export {
  clearModuleComponents,
  getModuleComponent,
  registerModuleComponent,
  registeredComponents,
  type AnyModuleComponent,
  type ModuleComponentProps,
  type ModuleRegistration,
} from './registry';
export {
  ModuleApiError,
  type ApiErrorBody,
  type Capability,
  type InvokeRequest,
  type InvokeResponse,
  type JSONSchema,
  type ModuleManifest,
  type StreamEvent,
  type StreamHandlers,
  type UISpec,
} from './types';
