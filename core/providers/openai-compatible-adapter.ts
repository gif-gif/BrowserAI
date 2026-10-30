import OpenAI from 'openai';
import type {
  ConnectionTestResult,
  ProviderConfig,
  ProviderConfigDraft,
} from '../../shared/types/provider';
import { AppError, serializeAppError } from '../../shared/errors/app-error';
import { sanitizeCustomHeaders } from '../../shared/redaction/header-policy';
import type { ProviderAdapter, ProviderChatInput, ProviderStreamEvent } from './provider-adapter';
import { toOpenAIMessages } from './openai-message-mapper';
import { mapOpenAIError } from './openai-error-mapper';
import { mapOpenAIStreamChunk } from './openai-stream-mapper';

interface ProviderConfigSource {
  get(providerId: string): Promise<ProviderConfig | undefined>;
  getSecretForBackground(providerId: string): Promise<string | undefined>;
}

interface OpenAIImageResponse {
  data?: Array<{ b64_json?: unknown; revised_prompt?: unknown; url?: unknown }>;
  output_format?: unknown;
  usage?: { input_tokens?: unknown; output_tokens?: unknown; total_tokens?: unknown };
}

interface OpenAIClientLike {
  models?: {
    list(): Promise<AsyncIterable<{ id?: unknown }>>;
  };
  images?: {
    generate(
      body: Record<string, unknown>,
      options?: { signal?: AbortSignal; timeout?: number },
    ): Promise<OpenAIImageResponse>;
  };
  chat: {
    completions: {
      create(
        body: Record<string, unknown>,
        options?: { signal?: AbortSignal },
      ): Promise<AsyncIterable<unknown>>;
    };
  };
}

interface OpenAIClientOptions {
  apiKey: string;
  baseURL: string;
  defaultHeaders: Record<string, string>;
  dangerouslyAllowBrowser: true;
  timeout: number;
  maxRetries: 0;
}

type OpenAIClientFactory = (options: OpenAIClientOptions) => OpenAIClientLike;

const defaultClientFactory: OpenAIClientFactory = (options) =>
  new OpenAI(options) as unknown as OpenAIClientLike;

const IMAGE_GENERATION_TIMEOUT_MS = 300_000;

/**
 * The SDK appends paths such as `/chat/completions` directly, so a bare origin
 * (`https://gw.example/`) gets the conventional `/v1`; any explicit path is kept.
 */
export function normalizeOpenAIBaseURL(baseURL: string): string {
  const trimmed = baseURL.trim().replace(/\/+$/u, '');
  try {
    const url = new URL(trimmed);
    if ((url.pathname === '/' || url.pathname === '') && !url.search) return `${url.origin}/v1`;
  } catch {
    return trimmed;
  }
  return trimmed;
}

function isImageGenerationModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return normalized.startsWith('gpt-image-') || normalized === 'chatgpt-image-latest';
}

function textContent(content: import('./provider-adapter').DomainProviderMessage['content']): string {
  if (typeof content === 'string') return content;
  return content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

function imagePrompt(messages: import('./provider-adapter').DomainProviderMessage[]): string {
  const current = [...messages].reverse().find((message) => message.role === 'user');
  const raw = current ? textContent(current.content).trim() : '';
  const marker = 'User question:\n';
  const markerIndex = raw.lastIndexOf(marker);
  const prompt = (markerIndex >= 0 ? raw.slice(markerIndex + marker.length) : raw).trim();
  if (!prompt) throw new AppError('INVALID_MESSAGE', '图片生成提示词不能为空');
  return prompt;
}

function imageMimeType(format: unknown): 'image/png' | 'image/jpeg' | 'image/webp' {
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  return 'image/png';
}

function validTokenCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export class OpenAICompatibleAdapter implements ProviderAdapter {
  readonly type = 'openai-compatible' as const;
  readonly capabilities = {
    streaming: true,
    text: true,
    vision: true,
    files: false,
    tools: false,
  } as const;

  constructor(
    private readonly configs: ProviderConfigSource,
    private readonly createClient: OpenAIClientFactory = defaultClientFactory,
  ) {}

  private createClientFor(config: ProviderConfigDraft, apiKey: string): OpenAIClientLike {
    return this.createClient({
      apiKey,
      baseURL: normalizeOpenAIBaseURL(config.baseURL),
      defaultHeaders: sanitizeCustomHeaders(config.defaultHeaders),
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

  private async resolve(providerId: string): Promise<{ config: ProviderConfig; client: OpenAIClientLike }> {
    const config = await this.configs.get(providerId);
    if (!config) throw new AppError('CONFIG_MISSING', '尚未配置 AI Gateway');
    const apiKey = await this.resolveApiKey(providerId);
    return { config, client: this.createClientFor(config, apiKey) };
  }

  private async resolveDraft(config: ProviderConfigDraft, apiKey?: string): Promise<OpenAIClientLike> {
    return this.createClientFor(config, await this.resolveApiKey(config.id, apiKey));
  }

  async listModels(config: ProviderConfigDraft, apiKey?: string): Promise<string[]> {
    try {
      const client = await this.resolveDraft(config, apiKey);
      if (!client.models) throw new AppError('GATEWAY_UNAVAILABLE', 'Gateway 不支持模型列表接口');
      const page = await client.models.list();
      const models = new Set<string>();
      for await (const item of page) {
        if (typeof item.id === 'string' && item.id.trim()) models.add(item.id.trim());
      }
      return [...models].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    } catch (error) {
      throw mapOpenAIError(error);
    }
  }

  async testDraft(config: ProviderConfigDraft, apiKey?: string): Promise<ConnectionTestResult> {
    const startedAt = Date.now();
    try {
      const client = await this.resolveDraft(config, apiKey);
      const stream = await client.chat.completions.create({
        model: config.model,
        messages: [{ role: 'user', content: 'Reply with OK.' }],
        max_tokens: 1,
        stream: true,
      });
      const iterator = stream[Symbol.asyncIterator]();
      await iterator.next();
      return { ok: true, latencyMs: Date.now() - startedAt, message: '连接成功' };
    } catch (error) {
      throw mapOpenAIError(error);
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
      const model = input.model || config.model;

      if (isImageGenerationModel(model)) {
        if (!client.images) throw new AppError('GATEWAY_UNAVAILABLE', 'Gateway 不支持图片生成接口');
        const response = await client.images.generate({
          model,
          prompt: imagePrompt(input.messages),
          size: '1024x1024',
          quality: 'low',
          output_format: 'png',
          n: 1,
        }, {
          signal: input.signal,
          timeout: IMAGE_GENERATION_TIMEOUT_MS,
        });
        const mimeType = imageMimeType(response.output_format);
        const images = response.data ?? [];
        let generated = 0;

        for (const item of images) {
          if (typeof item.b64_json !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/u.test(item.b64_json)) continue;
          generated += 1;
          yield {
            type: 'image',
            requestId: input.requestId,
            index: generated - 1,
            image: {
              dataUrl: `data:${mimeType};base64,${item.b64_json}`,
              mimeType,
              ...(typeof item.revised_prompt === 'string' && item.revised_prompt.trim()
                ? { revisedPrompt: item.revised_prompt.trim() }
                : {}),
            },
          };
        }

        if (generated === 0) {
          throw new AppError('STREAM_PROTOCOL_ERROR', 'Gateway 未返回可显示的图片数据', { retryable: true });
        }
        if (response.usage) {
          yield {
            type: 'usage',
            requestId: input.requestId,
            ...(validTokenCount(response.usage.input_tokens) ? { inputTokens: response.usage.input_tokens } : {}),
            ...(validTokenCount(response.usage.output_tokens) ? { outputTokens: response.usage.output_tokens } : {}),
            ...(validTokenCount(response.usage.total_tokens) ? { totalTokens: response.usage.total_tokens } : {}),
          };
        }
        yield { type: 'completed', requestId: input.requestId, finishReason: 'stop' };
        return;
      }

      const stream = await client.chat.completions.create({
        model,
        messages: toOpenAIMessages(input.messages),
        ...(input.temperature ?? config.temperature) === undefined
          ? {}
          : { temperature: input.temperature ?? config.temperature },
        ...(input.maxOutputTokens ?? config.maxOutputTokens) === undefined
          ? {}
          : { max_tokens: input.maxOutputTokens ?? config.maxOutputTokens },
        stream: true,
        stream_options: { include_usage: true },
      }, { signal: input.signal });

      for await (const chunk of stream) {
        for (const event of mapOpenAIStreamChunk(chunk, input.requestId)) yield event;
      }
    } catch (error) {
      const mapped = mapOpenAIError(error, input.signal);
      yield { type: 'failed', requestId: input.requestId, error: serializeAppError(mapped) };
    }
  }
}
