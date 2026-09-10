/** Mirrors `aim_modules.chat.schemas`. */

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatPayload {
  messages: ChatMessage[];
  system?: string;
  temperature?: number;
  max_tokens?: number;
}

export interface ChatUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface ChatResult {
  message: ChatMessage;
  model: string;
  provider: string;
  usage: ChatUsage;
  finish_reason: string;
}

export interface ChatPanelOptions {
  placeholder?: string;
  showUsage?: boolean;
  system?: string;
  temperature?: number;
  maxTokens?: number;
  /** Streamed token-by-token (default) or a single invoke round-trip. */
  streaming?: boolean;
  emptyState?: string;
}
