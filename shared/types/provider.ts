export const PROVIDER_TYPES = ['openai-compatible', 'anthropic-messages'] as const;
export type ProviderType = typeof PROVIDER_TYPES[number];
export type ProviderEndpointMode = 'chat-completions' | 'messages';

/** Each request format is served by exactly one endpoint. */
export const PROVIDER_ENDPOINT_MODES: Record<ProviderType, ProviderEndpointMode> = {
  'openai-compatible': 'chat-completions',
  'anthropic-messages': 'messages',
};

export const DEFAULT_PROVIDER_BASE_URLS: Record<ProviderType, string> = {
  'openai-compatible': 'https://api.openai.com/v1',
  'anthropic-messages': 'https://api.anthropic.com',
};

/** Messages API requires max_tokens; used when the user leaves the limit blank. */
export const DEFAULT_ANTHROPIC_MAX_TOKENS = 8192;

export interface GatewayProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  baseURL: string;
  model: string;
  endpointMode: ProviderEndpointMode;
  defaultHeaders: Record<string, string>;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs: number;
  stream: true;
  createdAt: number;
  updatedAt: number;
}

/** Kept as an alias: configs stored before the Anthropic adapter all use this shape. */
export type OpenAICompatibleConfig = GatewayProviderConfig;
export type ProviderConfig = GatewayProviderConfig;
export type ProviderConfigDraft = Omit<GatewayProviderConfig, 'createdAt' | 'updatedAt'>;

export interface ProviderConfigSubmission {
  config: ProviderConfigDraft;
  apiKey?: string;
  acknowledgeInsecureTransport: boolean;
}

export interface ProviderModelListResult {
  models: string[];
}

export interface ProviderCapabilities {
  streaming: boolean;
  text: boolean;
  vision: boolean;
  files: boolean;
  tools: boolean;
}

export interface ConnectionTestResult {
  ok: boolean;
  latencyMs?: number;
  message: string;
}
