import { describe, expect, it } from 'vitest';
import {
  AnthropicMessagesAdapter,
  normalizeAnthropicBaseURL,
} from '../../core/providers/anthropic-messages-adapter';
import type { ProviderConfig } from '../../shared/types/provider';

const config: ProviderConfig = {
  id: 'p1',
  name: 'Claude Gateway',
  type: 'anthropic-messages',
  baseURL: 'https://gateway.example.com/v1/',
  model: 'claude-opus-5-5',
  endpointMode: 'messages',
  defaultHeaders: { 'X-Team': 'alpha' },
  temperature: 1.6,
  timeoutMs: 45_000,
  stream: true,
  createdAt: 1,
  updatedAt: 1,
};

const STREAM = [
  { type: 'message_start', message: { usage: { input_tokens: 12, output_tokens: 1 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '你好' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '！' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
  { type: 'message_stop' },
];

function fakeFactory(options: { events?: unknown[]; error?: unknown; models?: string[] } = {}) {
  const clientOptions: unknown[] = [];
  const requests: Array<{ body: Record<string, unknown>; options?: { signal?: AbortSignal } }> = [];
  const factory = (clientConfig: unknown) => {
    clientOptions.push(clientConfig);
    return {
      models: {
        list: () => (async function* () {
          for (const id of options.models ?? []) yield { id };
        })(),
      },
      messages: {
        create: async (body: Record<string, unknown>, requestOptions?: { signal?: AbortSignal }) => {
          requests.push({ body, options: requestOptions });
          if (options.error) throw options.error;
          return (async function* () {
            for (const event of options.events ?? STREAM) yield structuredClone(event);
          })();
        },
      },
    };
  };
  return { factory, clientOptions, requests };
}

function source(overrides: Partial<ProviderConfig> = {}) {
  return {
    get: async () => ({ ...config, ...overrides }),
    getSecretForBackground: async () => 'sk-ant-test',
  };
}

async function collect(iterable: AsyncIterable<unknown>) {
  const values = [];
  for await (const value of iterable) values.push(value);
  return values;
}

describe('AnthropicMessagesAdapter', () => {
  it('sends a Messages API request and normalizes the stream', async () => {
    const fake = fakeFactory();
    const controller = new AbortController();
    const events = await collect(new AnthropicMessagesAdapter(source(), fake.factory).streamChat({
      requestId: 'r1',
      providerId: 'p1',
      model: '',
      messages: [
        { role: 'system', content: '系统指令' },
        { role: 'user', content: '你好' },
      ],
      signal: controller.signal,
    }));

    expect(fake.clientOptions).toEqual([{
      apiKey: 'sk-ant-test',
      baseURL: 'https://gateway.example.com',
      defaultHeaders: { 'X-Team': 'alpha', 'x-api-key': 'sk-ant-test' },
      dangerouslyAllowBrowser: true,
      timeout: 45_000,
      maxRetries: 0,
    }]);
    expect(fake.requests[0]?.body).toEqual({
      model: 'claude-opus-5-5',
      system: '系统指令',
      messages: [{ role: 'user', content: '你好' }],
      max_tokens: 8192,
      temperature: 1,
      stream: true,
    });
    expect(fake.requests[0]?.options?.signal).toBe(controller.signal);
    expect(events).toEqual([
      { type: 'started', requestId: 'r1' },
      { type: 'delta', requestId: 'r1', text: '你好' },
      { type: 'delta', requestId: 'r1', text: '！' },
      { type: 'usage', requestId: 'r1', inputTokens: 12, outputTokens: 3, totalTokens: 15 },
      { type: 'completed', requestId: 'r1', finishReason: 'stop' },
    ]);
  });

  it('maps HTTP errors to normalized failed events', async () => {
    const fake = fakeFactory({ error: Object.assign(new Error('invalid x-api-key'), { status: 401 }) });
    const events = await collect(new AnthropicMessagesAdapter(source(), fake.factory).streamChat({
      requestId: 'r1', providerId: 'p1', model: 'claude-opus-5-5',
      messages: [{ role: 'user', content: 'hi' }], signal: new AbortController().signal,
    }));
    expect(events.at(-1)).toMatchObject({ type: 'failed', error: { code: 'AUTHENTICATION_FAILED' } });
  });

  it('lists models and runs a one-token connection test', async () => {
    const fake = fakeFactory({ models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-opus-5-5'] });
    const adapter = new AnthropicMessagesAdapter(source(), fake.factory);
    expect(await adapter.listModels(config, 'sk-draft')).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5']);
    expect(fake.clientOptions[0]).toMatchObject({ apiKey: 'sk-draft' });

    const result = await adapter.testDraft(config);
    expect(result).toMatchObject({ ok: true, message: '连接成功' });
    expect(fake.requests[0]?.body).toMatchObject({ max_tokens: 1, stream: true, model: 'claude-opus-5-5' });
  });

  it('keeps the base URL host and only trims a trailing /v1', () => {
    expect(normalizeAnthropicBaseURL('https://api.anthropic.com')).toBe('https://api.anthropic.com');
    expect(normalizeAnthropicBaseURL('https://gw.example/anthropic/v1/')).toBe('https://gw.example/anthropic');
  });
});
