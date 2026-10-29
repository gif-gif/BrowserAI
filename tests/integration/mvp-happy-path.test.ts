import { describe, expect, it } from 'vitest';
import successFixture from '../fixtures/stream-success.jsonl?raw';
import { createMvpHarness } from '../setup/mvp-harness';
import { loadOpenAIJsonlFixture } from '../setup/fake-openai-gateway';

const configDraft = {
  id: 'gateway-1', name: '团队 Gateway', type: 'openai-compatible' as const,
  baseURL: 'https://gateway.example.com/v1', model: 'gpt-test',
  endpointMode: 'chat-completions' as const, defaultHeaders: { 'X-Team': 'alpha' },
  timeoutMs: 30_000, stream: true as const,
};

describe('MVP happy path', () => {
  it('runs configuration, local context, tab isolation, selection, streaming, persistence, and cancellation', async () => {
    const harness = createMvpHarness({ gatewayResponses: [
      { chunks: loadOpenAIJsonlFixture(successFixture) },
      { chunks: loadOpenAIJsonlFixture(successFixture) },
      { waitForAbort: true },
    ] });

    await harness.providerConfigs.save(configDraft, 'sk-mvp-secret');
    const permission = await harness.gatewayPermissions.requestForBaseUrl(configDraft.baseURL);
    expect(permission).toMatchObject({ granted: true, originPattern: 'https://gateway.example.com/*' });

    await harness.openPanel(1, 'https://article.example/story');
    const tabOne = await harness.openTab(1, 'https://article.example/story', 'nav-1');
    expect(tabOne.context.status).toBe('ready');

    const firstEvents = await harness.ask({
      requestId: 'request-1', tabId: 1, conversationId: tabOne.conversation.id,
      text: '总结当前页面', includePage: true,
    });
    expect(firstEvents.filter((event) => event.type === 'delta')).toHaveLength(2);
    expect(firstEvents.at(-2)).toMatchObject({ type: 'completed' });
    expect((await harness.conversations.get(tabOne.conversation.id))?.messages.at(-1)).toMatchObject({
      role: 'assistant', content: '页面摘要', status: 'complete',
    });
    expect(JSON.stringify(harness.gateway.requests[0]?.body)).toContain('本地页面正文 tab-1');

    const tabTwo = await harness.openTab(2, 'https://dashboard.example/app', 'nav-2');
    const reopened = await harness.openTab(1, 'https://article.example/story', 'nav-1');
    expect(tabTwo.conversation.id).not.toBe(tabOne.conversation.id);
    expect(reopened.conversation.id).toBe(tabOne.conversation.id);

    harness.snapshots.attachSelection(1, '用户刚刚选择的关键句');
    await harness.ask({
      requestId: 'request-2', tabId: 1, conversationId: tabOne.conversation.id,
      text: '解释选区', includeSelection: true,
    });
    expect(JSON.stringify(harness.gateway.requests[1]?.body)).toContain('用户刚刚选择的关键句');

    const cancelling = harness.ask({
      requestId: 'request-3', tabId: 1, conversationId: tabOne.conversation.id,
      text: '生成很长的回答',
    });
    await harness.gateway.waitForRequestCount(3);
    await harness.chat.cancel('request-3');
    await cancelling;
    expect((await harness.conversations.get(tabOne.conversation.id))?.messages.at(-1)?.status).toBe('cancelled');
  });
});
