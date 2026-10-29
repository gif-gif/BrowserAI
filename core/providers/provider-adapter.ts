import type { ProviderCapabilities, ProviderType, ConnectionTestResult, ProviderConfigDraft } from '../../shared/types/provider';
import type { SerializedAppError } from '../../shared/errors/app-error';

export type DomainProviderContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } };

export interface DomainProviderMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | DomainProviderContentPart[];
}

export interface ProviderChatInput {
  requestId: string;
  providerId: string;
  model: string;
  messages: DomainProviderMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  signal: AbortSignal;
}

export interface ProviderGeneratedImage {
  dataUrl: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  revisedPrompt?: string;
}

export type ProviderStreamEvent =
  | { type: 'started'; requestId: string }
  | { type: 'delta'; requestId: string; text: string }
  | { type: 'image'; requestId: string; image: ProviderGeneratedImage; index: number }
  | { type: 'usage'; requestId: string; inputTokens?: number; outputTokens?: number; totalTokens?: number }
  | { type: 'completed'; requestId: string; finishReason?: string }
  | { type: 'failed'; requestId: string; error: SerializedAppError };

export interface ProviderAdapter {
  readonly type: ProviderType;
  readonly capabilities: ProviderCapabilities;
  listModels(config: ProviderConfigDraft, apiKey?: string): Promise<string[]>;
  testDraft(config: ProviderConfigDraft, apiKey?: string): Promise<ConnectionTestResult>;
  testConnection(configId: string): Promise<ConnectionTestResult>;
  streamChat(input: ProviderChatInput): AsyncIterable<ProviderStreamEvent>;
}
