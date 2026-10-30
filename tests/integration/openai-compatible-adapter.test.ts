import { describe, expect, it } from 'vitest';
import { OpenAICompatibleAdapter, normalizeOpenAIBaseURL } from '../../core/providers/openai-compatible-adapter';
import type { ProviderConfig } from '../../shared/types/provider';
import { OPENAI_TEXT_STREAM_CHUNKS } from '../fixtures/openai-stream-chunks';
import { createFakeOpenAIClientFactory } from '../setup/fake-openai-gateway';

const config: ProviderConfig = {
  id: 'p1',
  name: 'Gateway',
  type: 'openai-compatible',
  baseURL: 'https://gateway.example.com/v1',
  model: 'gpt-test',
  endpointMode: 'chat-completions',
  defaultHeaders: { 'X-Team': 'alpha' },
  temperature: 0.2,
  maxOutputTokens: 512,
  timeoutMs: 45_000,
  stream: true,
  createdAt: 1,
  updatedAt: 1,
};

function source(overrides: Partial<ProviderConfig> = {}) {
  return {
    get: async () => ({ ...config, ...overrides }),
    getSecretForBackground: async () => 'sk-test',
  };
}

function input(signal = new AbortController().signal) {
  return {
    requestId: 'r1',
    providerId: 'p1',
    model: 'gpt-test',
    messages: [{ role: 'user' as const, content: '你好' }],
    temperature: 0.3,
    maxOutputTokens: 256,
    signal,
  };
}

async function collect(iterable: AsyncIterable<unknown>) {
  const values = [];
  for await (const value of iterable) values.push(value);
  return values;
}

describe('OpenAICompatibleAdapter', () => {
  it('configures the official client and normalizes a streaming response', async () => {
    const fake = createFakeOpenAIClientFactory(OPENAI_TEXT_STREAM_CHUNKS);
    const adapter = new OpenAICompatibleAdapter(source(), fake.factory);
    const chatInput = input();
    const events = await collect(adapter.streamChat(chatInput));

    expect(fake.clientOptions).toEqual([{
      apiKey: 'sk-test',
      baseURL: 'https://gateway.example.com/v1',
      defaultHeaders: { 'X-Team': 'alpha' },
      dangerouslyAllowBrowser: true,
      timeout: 45_000,
      maxRetries: 0,
    }]);
    expect(fake.requests[0]).toMatchObject({
      body: {
        model: 'gpt-test',
        messages: [{ role: 'user', content: '你好' }],
        temperature: 0.3,
        max_tokens: 256,
        stream: true,
        stream_options: { include_usage: true },
      },
    });
    expect(fake.requests[0]?.options?.signal).toBe(chatInput.signal);
    expect(events).toEqual([
      { type: 'started', requestId: 'r1' },
      { type: 'delta', requestId: 'r1', text: '你' },
      { type: 'delta', requestId: 'r1', text: '好' },
      { type: 'completed', requestId: 'r1', finishReason: 'stop' },
      { type: 'usage', requestId: 'r1', inputTokens: 12, outputTokens: 3, totalTokens: 15 },
    ]);
    expect(JSON.stringify(events)).not.toContain('chatcmpl-1');
  });

  it('uses the Images API for gpt-image-2 and emits a displayable data URL', async () => {
    const fake = createFakeOpenAIClientFactory([], {
      imageResponse: {
        created: 1,
        data: [{ b64_json: 'aGVsbG8=', revised_prompt: 'A small orange cat' }],
        usage: { input_tokens: 8, output_tokens: 16, total_tokens: 24 },
      },
    });
    const adapter = new OpenAICompatibleAdapter(source(), fake.factory);
    const controller = new AbortController();
    const events = await collect(adapter.streamChat({
      ...input(controller.signal),
      model: 'gpt-image-2',
      messages: [{
        role: 'user',
        content: '<browser_context>untrusted page</browser_context>\nUser question:\n画一只橙色小猫',
      }],
    }));

    expect(fake.requests).toHaveLength(0);
    expect(fake.imageRequests).toEqual([{
      body: {
        model: 'gpt-image-2',
        prompt: '画一只橙色小猫',
        size: '1024x1024',
        quality: 'low',
        output_format: 'png',
        n: 1,
      },
      options: { signal: controller.signal, timeout: 300_000 },
    }]);
    expect(events).toEqual([
      { type: 'started', requestId: 'r1' },
      {
        type: 'image',
        requestId: 'r1',
        index: 0,
        image: {
          dataUrl: 'data:image/png;base64,aGVsbG8=',
          mimeType: 'image/png',
          revisedPrompt: 'A small orange cat',
        },
      },
      { type: 'usage', requestId: 'r1', inputTokens: 8, outputTokens: 16, totalTokens: 24 },
      { type: 'completed', requestId: 'r1', finishReason: 'stop' },
    ]);
  });

  it('fails safely when an image response contains no base64 image data', async () => {
    const fake = createFakeOpenAIClientFactory([], {
      imageResponse: { data: [{ url: 'https://untrusted.example/image.png' }] },
    });
    const events = await collect(new OpenAICompatibleAdapter(source(), fake.factory).streamChat({
      ...input(),
      model: 'gpt-image-2',
    }));

    expect(events.at(-1)).toMatchObject({
      type: 'failed',
      requestId: 'r1',
      error: { code: 'STREAM_PROTOCOL_ERROR' },
    });
  });

  it('lists, deduplicates, and sorts Gateway models with a draft API key', async () => {
    const fake = createFakeOpenAIClientFactory([], {
      models: ['gpt-5-mini', 'gpt-4.1-mini', 'gpt-5-mini'],
    });
    const adapter = new OpenAICompatibleAdapter(source(), fake.factory);
    const models = await adapter.listModels({
      ...config,
      name: 'Draft Gateway',
      model: '',
    }, 'sk-draft');

    expect(models).toEqual(['gpt-4.1-mini', 'gpt-5-mini']);
    expect(fake.modelListRequests).toBe(1);
    expect(fake.clientOptions[0]).toMatchObject({ apiKey: 'sk-draft', baseURL: config.baseURL });
  });

  it('falls back to the stored key when listing models for an existing config', async () => {
    const fake = createFakeOpenAIClientFactory([], { models: ['stored-model'] });
    const adapter = new OpenAICompatibleAdapter(source(), fake.factory);
    await expect(adapter.listModels({ ...config, model: '' })).resolves.toEqual(['stored-model']);
    expect(fake.clientOptions[0]?.apiKey).toBe('sk-test');
  });

  it('maps model-list authentication failures', async () => {
    const fake = createFakeOpenAIClientFactory([], {
      modelError: Object.assign(new Error('invalid key'), { status: 401 }),
    });
    const adapter = new OpenAICompatibleAdapter(source(), fake.factory);
    await expect(adapter.listModels({ ...config, model: '' }, 'bad-key')).rejects.toMatchObject({
      code: 'AUTHENTICATION_FAILED',
    });
  });

  it('consumes the test stream so protocol errors are not reported as success', async () => {
    const failingFactory = () => ({
      chat: { completions: { create: async () => ({
        [Symbol.asyncIterator]() {
          return { next: async () => { throw Object.assign(new Error('stream failed'), { status: 500 }); } };
        },
      }) } },
    });
    const adapter = new OpenAICompatibleAdapter(source(), failingFactory);
    await expect(adapter.testDraft(config, 'sk-draft')).rejects.toMatchObject({ code: 'GATEWAY_UNAVAILABLE' });
  });

  it.each([
    [401, 'invalid key', 'AUTHENTICATION_FAILED'],
    [404, 'The model gpt-missing does not exist', 'MODEL_NOT_FOUND'],
    [429, 'rate limit reached', 'RATE_LIMITED'],
    [500, 'server error', 'GATEWAY_UNAVAILABLE'],
  ] as const)('maps HTTP %s failures to %s', async (status, message, code) => {
    const factory = () => ({
      chat: { completions: { create: async () => { throw Object.assign(new Error(message), { status }); } } },
    });
    const events = await collect(new OpenAICompatibleAdapter(source(), factory).streamChat(input()));
    expect(events.at(-1)).toMatchObject({ type: 'failed', requestId: 'r1', error: { code } });
  });

  it('maps timeout failures', async () => {
    const factory = () => ({
      chat: { completions: { create: async () => { throw Object.assign(new Error('timed out'), { name: 'APIConnectionTimeoutError' }); } } },
    });
    const events = await collect(new OpenAICompatibleAdapter(source(), factory).streamChat(input()));
    expect(events.at(-1)).toMatchObject({ type: 'failed', error: { code: 'REQUEST_TIMEOUT' } });
  });

  it('passes AbortSignal through and maps cancellation', async () => {
    const controller = new AbortController();
    const capturedSignals: AbortSignal[] = [];
    const factory = () => ({
      chat: { completions: { create: async (_body: unknown, options?: { signal?: AbortSignal }) => {
        if (options?.signal) capturedSignals.push(options.signal);
        return (async function* () {
          yield OPENAI_TEXT_STREAM_CHUNKS[0];
          controller.abort();
          throw Object.assign(new Error('Request was aborted'), { name: 'AbortError' });
        })();
      } } },
    });
    const events = await collect(new OpenAICompatibleAdapter(source(), factory).streamChat(input(controller.signal)));
    expect(capturedSignals).toEqual([controller.signal]);
    expect(events.at(-1)).toMatchObject({ type: 'failed', error: { code: 'REQUEST_CANCELLED' } });
  });

  it('rejects protected custom headers before creating a client', async () => {
    const fake = createFakeOpenAIClientFactory([]);
    const events = await collect(new OpenAICompatibleAdapter(
      source({ defaultHeaders: { Authorization: 'unsafe' } }),
      fake.factory,
    ).streamChat(input()));
    expect(fake.clientOptions).toHaveLength(0);
    expect(events.at(-1)).toMatchObject({ type: 'failed', error: { code: 'CONFIG_MISSING' } });
  });

  it('accepts a gateway root or its /v1 path as the Base URL', async () => {
    const fake = createFakeOpenAIClientFactory(OPENAI_TEXT_STREAM_CHUNKS);
    await collect(new OpenAICompatibleAdapter(
      source({ baseURL: 'https://gw-cf.opentoken.io/' }),
      fake.factory,
    ).streamChat(input()));
    expect(fake.clientOptions[0]?.baseURL).toBe('https://gw-cf.opentoken.io/v1');

    expect(normalizeOpenAIBaseURL('https://gw-cf.opentoken.io')).toBe('https://gw-cf.opentoken.io/v1');
    expect(normalizeOpenAIBaseURL(' https://gw-cf.opentoken.io/v1/ ')).toBe('https://gw-cf.opentoken.io/v1');
    expect(normalizeOpenAIBaseURL('http://localhost:11434/')).toBe('http://localhost:11434/v1');
    expect(normalizeOpenAIBaseURL('https://gw.example/openai/v1')).toBe('https://gw.example/openai/v1');
    expect(normalizeOpenAIBaseURL('https://gw.example/api/paas/v4')).toBe('https://gw.example/api/paas/v4');
  });
});
