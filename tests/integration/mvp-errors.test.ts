import { describe, expect, it } from 'vitest';
import malformedFixture from '../fixtures/stream-malformed.jsonl?raw';
import { reconcileStaleStreams } from '../../core/streaming/stale-stream-reconciler';
import { createMvpHarness } from '../setup/mvp-harness';
import { loadOpenAIJsonlFixture } from '../setup/fake-openai-gateway';

const failureConfig = {
  id: 'gateway-1', name: 'Gateway', type: 'openai-compatible' as const,
  baseURL: 'https://gateway.example.com/v1', model: 'gpt-test',
  endpointMode: 'chat-completions' as const, defaultHeaders: {}, timeoutMs: 1000, stream: true as const,
};

interface ReadinessSetup {
  saveConfig?: boolean;
  saveSecret?: boolean;
  grantPermission?: boolean;
}

describe('MVP error recovery', () => {
  it.each<readonly [string, ReadinessSetup, string]>([
    ['missing configuration', {}, 'CONFIG_MISSING'],
    ['missing API key', { saveConfig: true }, 'API_KEY_MISSING'],
    ['denied Gateway permission', { saveConfig: true, saveSecret: true, grantPermission: false }, 'HOST_PERMISSION_REQUIRED'],
  ] as const)('reports %s before contacting the Gateway', async (_name, setup, code) => {
    const harness = createMvpHarness({ permissionRequestGranted: setup.grantPermission ?? true });
    if (setup.saveConfig) await harness.providerConfigs.save(failureConfig, setup.saveSecret ? 'sk-test' : undefined);
    if (setup.grantPermission !== undefined) {
      const permission = await harness.gatewayPermissions.requestForBaseUrl(failureConfig.baseURL);
      expect(permission.granted).toBe(setup.grantPermission);
    }
    const state = await harness.openTab(1, 'https://example.test', 'nav-1');
    await expect(harness.ask({ requestId: 'r1', tabId: 1, conversationId: state.conversation.id, text: '你好' }))
      .rejects.toMatchObject({ code });
    expect(harness.gateway.requests).toHaveLength(0);
  });

  it.each([
    [{ error: Object.assign(new Error('invalid key'), { status: 401 }) }, 'AUTHENTICATION_FAILED'],
    [{ error: Object.assign(new Error('rate limited'), { status: 429 }) }, 'RATE_LIMITED'],
    [{ error: Object.assign(new Error('timed out'), { name: 'APIConnectionTimeoutError' }) }, 'REQUEST_TIMEOUT'],
    [{ chunks: loadOpenAIJsonlFixture(malformedFixture) }, 'STREAM_PROTOCOL_ERROR'],
  ] as const)('persists normalized Gateway failure %s', async (response, code) => {
    const harness = createMvpHarness({ gatewayResponses: [response] });
    await harness.configure(failureConfig, 'sk-test');
    const state = await harness.openTab(1, 'https://example.test', 'nav-1');
    const events = await harness.ask({ requestId: 'r1', tabId: 1, conversationId: state.conversation.id, text: '你好' });
    expect(events.at(-1)).toMatchObject({ type: 'failed', error: { code } });
    expect((await harness.conversations.get(state.conversation.id))?.messages.at(-1)).toMatchObject({ status: 'failed', error: { code } });
  });

  it('reconciles an interrupted worker stream and falls back to chat-only after extraction failure', async () => {
    const harness = createMvpHarness({ extractionError: new Error('页面脚本不可用') });
    await harness.configure(failureConfig, 'sk-test');
    const state = await harness.openTab(1, 'https://example.test', 'nav-1');
    expect(state.context).toMatchObject({ status: 'unavailable', reason: 'CONTEXT_EXTRACTION_FAILED' });
    await harness.ask({ requestId: 'r1', tabId: 1, conversationId: state.conversation.id, text: '不读取页面也可以回答' });

    const conversation = await harness.conversations.get(state.conversation.id);
    await harness.conversations.save({
      ...conversation!, updatedAt: 1,
      messages: [...conversation!.messages, { id: 'stale', role: 'assistant', content: '半截', status: 'streaming', createdAt: 1 }],
    });
    expect(await reconcileStaleStreams(harness.conversations, { now: 120_000, thresholdMs: 60_000 })).toBe(1);
    expect((await harness.conversations.get(state.conversation.id))?.messages.at(-1)).toMatchObject({
      status: 'failed', error: { code: 'STREAM_INTERRUPTED' },
    });
  });
});
