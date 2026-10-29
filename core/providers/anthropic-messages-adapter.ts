import Anthropic from '@anthropic-ai/sdk';
import {
  DEFAULT_ANTHROPIC_MAX_TOKENS,
  type ConnectionTestResult,
  type ProviderConfig,
  type ProviderConfigDraft,
} from '../../shared/types/provider';
import { AppError, serializeAppError } from '../../shared/errors/app-error';
import { sanitizeCustomHeaders } from '../../shared/redaction/header-policy';
import type { ProviderAdapter, ProviderChatInput, ProviderStreamEvent } from './provider-adapter';
import { toAnthropicMessages } from './anthropic-message-mapper';
import { mapAnthropicStreamEvent, type AnthropicStreamState } from './anthropic-stream-mapper';
// The SDK errors expose the same `status` / `requestID` / abort shape as the OpenAI SDK.
import { mapOpenAIError as mapGatewayError } from './openai-error-mapper';

interface ProviderConfigSource {
  get(providerId: string): Promise<ProviderConfig | undefined>;
  getSecretForBackground(providerId: string): Promise<string | undefined>;
}

interface AnthropicClientLike {
  models?: {
    list(): AsyncIterable<{ id?: unknown }>;
  };
  messages: {
    create(
      body: Record<string, unknown>,
      options?: { signal?: AbortSignal },
    ): Promise<AsyncIterable<unknown>>;
  };
}

interface AnthropicClientOptions {
  apiKey: string;
  baseURL: string;
  defaultHeaders: Record<string, string>;
  dangerouslyAllowBrowser: true;
  timeout: number;
  maxRetries: 0;
}

type AnthropicClientFactory = (options: AnthropicClientOptions) => AnthropicClientLike;

const defaultClientFactory: AnthropicClientFactory = (options) =>
  new Anthropic(options) as unknown as AnthropicClientLike;

/** The SDK appends `/v1/messages`, so a Base URL that already ends in `/v1` is trimmed. */
export function normalizeAnthropicBaseURL(baseURL: string): string {
  return baseURL.trim().replace(/\/+$/u, '').replace(/\/v1$/u, '');
}

export class AnthropicMessagesAdapter implements ProviderAdapter {
  readonly type = 'anthropic-messages' as const;
  readonly capabilities = {
    streaming: true,
    text: true,
    vision: true,
    files: false,
    tools: false,
  } as const;

  constructor(
    private readonly configs: ProviderConfigSource,
    private readonly createClient: AnthropicClientFactory = defaultClientFactory,
  ) {}

  private createClientFor(config: ProviderConfigDraft, apiKey: string): AnthropicClientLike {
    return this.createClient({
      apiKey,
      baseURL: normalizeAnthropicBaseURL(config.baseURL),
      // Anthropic-format gateways authenticate with x-api-key; the SDK also sends the key as a Bearer token.
      defaultHeaders: { ...sanitizeCustomHeaders(config.defaultHeaders), 'x-api-key': apiKey },
      dangerouslyAllowBrowser: true,
      timeout: config.timeoutMs,
      maxRetries: 0,
    });
  }

  private async resolveApiKey(providerId: string, apiKey?: string): Promise<string> {
    const resolved = apiKey?.trim() || await this.configs.getSecretForBackground(providerId);
    if (!resolved) throw new AppError('API_KEY_MISSING', '尚未配置 Gateway API Key');
    return resolved;
  }

  private async resolve(providerId: string): Promise<{ config: ProviderConfig; client: AnthropicClientLike }> {
    const config = await this.configs.get(providerId);
    if (!config) throw new AppError('CONFIG_MISSING', '尚未配置 AI Gateway');
    const apiKey = await this.resolveApiKey(providerId);
    return { config, client: this.createClientFor(config, apiKey) };
  }

  private async resolveDraft(config: ProviderConfigDraft, apiKey?: string): Promise<AnthropicClientLike> {
    return this.createClientFor(config, await this.resolveApiKey(config.id, apiKey));
  }

  async listModels(config: ProviderConfigDraft, apiKey?: string): Promise<string[]> {
    try {
      const client = await this.resolveDraft(config, apiKey);
      if (!client.models) throw new AppError('GATEWAY_UNAVAILABLE', 'Gateway 不支持模型列表接口');
      const models = new Set<string>();
      for await (const item of client.models.list()) {
        if (typeof item.id === 'string' && item.id.trim()) models.add(item.id.trim());
      }
      return [...models].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    } catch (error) {
      throw mapGatewayError(error);
    }
  }

  async testDraft(config: ProviderConfigDraft, apiKey?: string): Promise<ConnectionTestResult> {
    const startedAt = Date.now();
    try {
      const client = await this.resolveDraft(config, apiKey);
      const stream = await client.messages.create({
        model: config.model,
        messages: [{ role: 'user', content: 'Reply with OK.' }],
        max_tokens: 1,
        stream: true,
      });
      const iterator = stream[Symbol.asyncIterator]();
      await iterator.next();
      await iterator.return?.();
      return { ok: true, latencyMs: Date.now() - startedAt, message: '连接成功' };
    } catch (error) {
      throw mapGatewayError(error);
    }
  }

  async testConnection(configId: string) {
    const config = await this.configs.get(configId);
    if (!config) throw new AppError('CONFIG_MISSING', '尚未配置 AI Gateway');
    return this.testDraft(config);
  }

  async *streamChat(input: ProviderChatInput): AsyncIterable<ProviderStreamEvent> {
    try {
      const { config, client } = await this.resolve(input.providerId);
      yield { type: 'started', requestId: input.requestId };
      const { system, messages } = toAnthropicMessages(input.messages);
      if (!messages.length) throw new AppError('INVALID_MESSAGE', '消息内容不能为空');
      const temperature = input.temperature ?? config.temperature;

      const stream = await client.messages.create({
        model: input.model || config.model,
        ...(system ? { system } : {}),
        messages,
        max_tokens: input.maxOutputTokens ?? config.maxOutputTokens ?? DEFAULT_ANTHROPIC_MAX_TOKENS,
        // Messages API accepts temperature in [0, 1]; clamp values carried over from OpenAI's [0, 2] range.
        ...(temperature === undefined ? {} : { temperature: Math.min(Math.max(temperature, 0), 1) }),
        stream: true,
      }, { signal: input.signal });

      const state: AnthropicStreamState = {};
      for await (const event of stream) {
        for (const mapped of mapAnthropicStreamEvent(event, input.requestId, state)) yield mapped;
      }
    } catch (error) {
      const mapped = mapGatewayError(error, input.signal);
      yield { type: 'failed', requestId: input.requestId, error: serializeAppError(mapped) };
    }
  }
}
