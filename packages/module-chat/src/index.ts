import { registerModuleComponent } from '@ai-modules/core';
import { ChatPanel } from './ChatPanel';

// Importing this package registers its UI. The key must match the backend
// manifest's `ui.component`.
registerModuleComponent({
  component: 'chat',
  displayName: 'Chat',
  render: ChatPanel,
});

export { ChatPanel, type ChatPanelProps } from './ChatPanel';
export { useChat, type UseChatOptions } from './useChat';
export type {
  ChatMessage,
  ChatPanelOptions,
  ChatPayload,
  ChatResult,
  ChatRole,
  ChatUsage,
} from './types';
