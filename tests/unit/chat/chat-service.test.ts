import { describe, expect, it, vi } from 'vitest';
import { ChatService } from '../../../core/chat/chat-service';
import { ContextSnapshotService } from '../../../core/chat/context-snapshot-service';
import { ActiveStreamRegistry } from '../../../core/streaming/active-stream-registry';
import { ConversationRepository } from '../../../storage/conversation-repository';
import { FakeStorageArea } from '../../setup/fake-storage';
import type { ProviderAdapter, ProviderStreamEvent } from '../../../core/providers/provider-adapter';
import type { Conversation } from '../../../shared/types/chat';
import type { DomAction, DomActionBatchResult, DomSnapshot } from '../../../shared/types/dom-actions';
import type { ExtractedPageContext } from '../../../shared/types/context';

const conversation = (): Conversation => ({ id: 'c1', title: 'New', messages: [], providerId: 'p1', model: 'm1', promptVersion: 'v1', pinned: false, createdAt: 1, updatedAt: 1 });

function adapter(events: ProviderStreamEvent[], onStart = vi.fn()): ProviderAdapter {
  return {
    type: 'openai-compatible', capabilities: { streaming: true, text: true, vision: false, files: false, tools: false },
    listModels: vi.fn(), testDraft: vi.fn(), testConnection: vi.fn(),
    async *streamChat(input) { onStart(input); for (const event of events) yield event; },
  };
}

async function setup(options: {
  hasConfig?: boolean;
  hasKey?: boolean;
  hasPermission?: boolean;
  events?: ProviderStreamEvent[];
  eventBatches?: ProviderStreamEvent[][];
  pageActions?: {
    snapshot: (tabId: number) => Promise<DomSnapshot>;
    execute: (tabId: number, actions: DomAction[]) => Promise<DomActionBatchResult>;
  };
  extractTab?: (tabId: number) => Promise<ExtractedPageContext>;
} = {}) {
  const storage = new FakeStorageArea();
  const conversations = new ConversationRepository(storage);
  await conversations.save(conversation());
  const onStart = vi.fn();
  let batchIndex = 0;
  const provider = options.eventBatches
    ? {
        type: 'openai-compatible' as const,
        capabilities: { streaming: true, text: true, vision: false, files: false, tools: false } as const,
        listModels: vi.fn(), testDraft: vi.fn(), testConnection: vi.fn(),
        async *streamChat(providerInput: Parameters<ProviderAdapter['streamChat']>[0]) {
          onStart(providerInput);
          const events = options.eventBatches?.[batchIndex++] ?? [];
          for (const event of events) yield event;
        },
      }
    : adapter(options.events ?? [
        { type: 'started', requestId: 'r1' }, { type: 'delta', requestId: 'r1', text: 'Hello' }, { type: 'completed', requestId: 'r1' },
      ], onStart);
  let id = 0;
  const service = new ChatService({
    conversations, snapshots: new ContextSnapshotService(), streams: new ActiveStreamRegistry(),
    getConfig: async () => options.hasConfig === false ? undefined : ({ id: 'p1', name: 'P', type: 'openai-compatible', baseURL: 'https://api.example.com/v1', model: 'm1', endpointMode: 'chat-completions', defaultHeaders: {}, timeoutMs: 1000, stream: true, createdAt: 1, updatedAt: 1 }),
    getSecret: async () => options.hasKey === false ? undefined : 'key',
    hasGatewayPermission: async () => options.hasPermission !== false,
    getAdapter: () => provider,
    createId: (prefix) => `${prefix}-${++id}`,
    now: () => 100 + id,
    ...(options.pageActions ? { pageActions: options.pageActions } : {}),
    ...(options.extractTab ? { extractTab: options.extractTab } : {}),
  });
  return { service, conversations, onStart };
}

const input = { requestId: 'r1', tabId: 1, conversationId: 'c1', text: 'Question', contextSelection: { includePage: false, includeSelection: false } };

describe('ChatService', () => {
  it.each([
    ['CONFIG_MISSING', { hasConfig: false }], ['API_KEY_MISSING', { hasKey: false }], ['HOST_PERMISSION_REQUIRED', { hasPermission: false }],
  ])('fails with %s before persisting messages', async (code, options) => {
    const { service, conversations } = await setup(options);
    await expect(service.start(input, vi.fn())).rejects.toMatchObject({ code });
    expect((await conversations.get('c1'))?.messages).toHaveLength(0);
  });

  it('persists user then streaming placeholder before network, forwards deltas, and completes', async () => {
    const { service, conversations, onStart } = await setup();
    const emitted: unknown[] = [];
    await service.start(input, (event) => { emitted.push(event); });
    const saved = await conversations.get('c1');
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ messages: expect.any(Array) }));
    expect(saved?.messages.map((item) => [item.role, item.content, item.status])).toEqual([
      ['user', 'Question', 'complete'], ['assistant', 'Hello', 'complete'],
    ]);
    expect(emitted).toContainEqual({ version: 1, type: 'delta', requestId: 'r1', text: 'Hello' });
  });



  it('persists image attachments and forwards them as multimodal provider content', async () => {
    const { service, conversations, onStart } = await setup();
    const attachment = {
      id: 'image-1', name: 'screen.jpg', mimeType: 'image/jpeg' as const,
      dataUrl: 'data:image/jpeg;base64,aGVsbG8=', source: 'screenshot' as const,
    };

    await service.start({ ...input, text: '', attachments: [attachment] }, vi.fn());

    const saved = await conversations.get('c1');
    expect(saved?.title).toBe('screen.jpg');
    expect(saved?.messages[0]).toMatchObject({ role: 'user', content: '', attachments: [attachment] });
    const providerMessages = onStart.mock.calls[0]?.[0].messages;
    expect(providerMessages.at(-1)?.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'image_url', image_url: { url: attachment.dataUrl, detail: 'auto' } }),
    ]));
  });

  it('persists generated images on the assistant message and emits them to the UI', async () => {
    const imageEvent: ProviderStreamEvent = {
      type: 'image',
      requestId: 'r1',
      index: 0,
      image: {
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,aGVsbG8=',
        revisedPrompt: 'A polished prompt',
      },
    };
    const { service, conversations } = await setup({ events: [
      { type: 'started', requestId: 'r1' },
      imageEvent,
      imageEvent,
      { type: 'completed', requestId: 'r1' },
    ] });
    const emitted: unknown[] = [];

    await service.start(input, (event) => { emitted.push(event); });

    expect((await conversations.get('c1'))?.messages.at(-1)).toMatchObject({
      role: 'assistant',
      status: 'complete',
      attachments: [{
        id: 'assistant-2-image-0',
        name: 'generated-image-1.png',
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,aGVsbG8=',
        source: 'generated',
      }],
    });
    expect(emitted).toContainEqual({ version: 1, ...imageEvent });
  });

  it('marks partial output cancelled when cancellation aborts the request', async () => {
    const { service, conversations } = await setup({ events: [] });
    const run = service.start(input, vi.fn());
    await Promise.resolve(); await Promise.resolve();
    await service.cancel('r1');
    await run;
    const assistant = (await conversations.get('c1'))?.messages.at(-1);
    expect(assistant).toMatchObject({ role: 'assistant', status: 'cancelled' });
  });


  it('emits a cancellation terminal event when stopped before the stream is registered', async () => {
    const { service, conversations, onStart } = await setup();
    const emitted: unknown[] = [];
    const run = service.start(input, (event) => { emitted.push(event); });

    await service.cancel('r1');
    await run;

    expect(onStart).not.toHaveBeenCalled();
    expect((await conversations.get('c1'))?.messages.at(-1)).toMatchObject({
      role: 'assistant',
      status: 'cancelled',
    });
    expect(emitted).toContainEqual(expect.objectContaining({
      version: 1,
      type: 'failed',
      requestId: 'r1',
      error: expect.objectContaining({ code: 'REQUEST_CANCELLED' }),
    }));
  });

  it('retries from a selected user turn without duplicating the user message or old page context', async () => {
    const { service, conversations, onStart } = await setup();
    const existing = (await conversations.get('c1'))!;
    await conversations.save({
      ...existing,
      messages: [{
        id: 'original-user', role: 'user', content: 'Original question', status: 'complete', createdAt: 2,
        source: { pageTitle: 'Old page', pageUrl: 'https://old.example', contextTypes: ['page'], pageTruncated: false },
      }],
    });

    await service.retry({
      requestId: 'r1', tabId: 1, conversationId: 'c1', userMessageId: 'original-user',
      contextSelection: { includePage: false, includeSelection: false },
    }, vi.fn());

    const saved = await conversations.get('c1');
    expect(saved?.messages.filter((item) => item.role === 'user')).toHaveLength(1);
    expect(saved?.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'Hello', status: 'complete' });
    expect(JSON.stringify(onStart.mock.calls[0])).not.toContain('https://old.example');
  });

  it('persists a safe failed state and does not include page content when chips are removed', async () => {
    const { service, conversations, onStart } = await setup({ events: [{ type: 'failed', requestId: 'r1', error: { code: 'RATE_LIMITED', message: 'Try later', retryable: true } }] });
    await service.start(input, vi.fn());
    const assistant = (await conversations.get('c1'))?.messages.at(-1);
    expect(assistant).toMatchObject({ status: 'failed', error: { code: 'RATE_LIMITED', message: 'Try later' } });
    expect(JSON.stringify(onStart.mock.calls[0])).not.toContain('<page_content>');
  });

  it('does not continue page actions after cancellation', async () => {
    let resolveSnapshot: ((snapshot: DomSnapshot) => void) | undefined;
    const snapshot = vi.fn(() => new Promise<DomSnapshot>((resolve) => { resolveSnapshot = resolve; }));
    const execute = vi.fn(async () => ({
      url: 'https://example.com', title: 'Example', results: [],
    }));
    const { service, conversations } = await setup({ pageActions: { snapshot, execute } });
    const emitted: unknown[] = [];
    const run = service.start(
      { ...input, allowPageActions: true },
      (event) => { emitted.push(event); },
    );

    await vi.waitFor(() => expect(snapshot).toHaveBeenCalledTimes(1));
    await service.cancel('r1');
    resolveSnapshot?.({
      url: 'https://example.com', title: 'Example', capturedAt: 1, truncated: false, elements: [],
    });
    await run;

    expect(execute).not.toHaveBeenCalled();
    expect((await conversations.get('c1'))?.messages.at(-1)).toMatchObject({
      role: 'assistant', status: 'cancelled',
    });
    expect(emitted).toContainEqual(expect.objectContaining({
      type: 'failed', requestId: 'r1', error: expect.objectContaining({ code: 'REQUEST_CANCELLED' }),
    }));
  });

  it('runs a bounded page-action loop and stores only the user-facing result', async () => {
    const snapshot = vi.fn(async () => ({
      url: 'https://example.com', title: 'Example', capturedAt: 1, truncated: false,
      elements: [{ ref: 'e1', tag: 'button', text: 'Search' }],
    }));
    const execute = vi.fn(async () => ({
      url: 'https://example.com', title: 'Example',
      results: [{ action: { type: 'click' as const, ref: 'e1' }, success: true, message: 'Clicked e1.' }],
    }));
    const { service, conversations, onStart } = await setup({
      pageActions: { snapshot, execute },
      eventBatches: [
        [
          { type: 'started', requestId: 'r1' },
          { type: 'delta', requestId: 'r1', text: '{"message":"Clicking search","actions":[{"type":"click","ref":"e1"}],"done":false}' },
          { type: 'completed', requestId: 'r1' },
        ],
        [
          { type: 'started', requestId: 'r1' },
          { type: 'delta', requestId: 'r1', text: '{"message":"Search opened.","actions":[],"done":true}' },
          { type: 'completed', requestId: 'r1' },
        ],
      ],
    });
    const emitted: unknown[] = [];

    await service.start({ ...input, allowPageActions: true }, (event) => { emitted.push(event); });

    expect(snapshot).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledWith(1, [{ type: 'click', ref: 'e1' }]);
    expect(onStart).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(onStart.mock.calls[1])).toContain('browser_action_result');
    expect((await conversations.get('c1'))?.messages.at(-1)).toMatchObject({
      role: 'assistant', content: 'Search opened.', status: 'complete',
    });
    expect(emitted).toContainEqual({ version: 1, type: 'delta', requestId: 'r1', text: 'Search opened.' });
  });

  it('re-extracts mentioned tabs at send time and records them as message sources', async () => {
    const extractTab = vi.fn(async (tabId: number): Promise<ExtractedPageContext> => ({
      snapshotId: `snap-${tabId}`,
      tabId,
      title: `Tab ${tabId}`,
      url: `https://example.org/${tabId}`,
      document: { text: `Body of tab ${tabId}`, extractionMethod: 'readability' },
      metadata: { extractedAt: 1, originalCharacterCount: 10, submittedCharacterCount: 10, truncated: false, navigationKey: 'nav' },
    }));
    const { service, conversations, onStart } = await setup({ extractTab });

    await service.start({
      ...input,
      contextSelection: { includePage: false, includeSelection: false, additionalTabIds: [7, 8, 7, 1] },
    }, vi.fn());

    expect(extractTab.mock.calls.map(([tabId]) => tabId)).toEqual([7, 8]);
    const providerMessages = onStart.mock.calls[0]?.[0].messages;
    expect(providerMessages.at(-1)?.content).toContain('Body of tab 8');
    const saved = await conversations.get('c1');
    expect(saved?.messages[0]?.source).toEqual({
      pageTitle: 'Tab 7',
      pageUrl: 'https://example.org/7',
      contextTypes: ['page'],
      pageTruncated: false,
      additionalPages: [{ pageTitle: 'Tab 8', pageUrl: 'https://example.org/8', pageTruncated: false }],
    });
  });

  it('fails before persisting when a mentioned tab can no longer be read', async () => {
    const { service, conversations } = await setup({ extractTab: async () => { throw new Error('gone'); } });
    await expect(service.start({
      ...input,
      contextSelection: { includePage: false, includeSelection: false, additionalTabIds: [7] },
    }, vi.fn())).rejects.toMatchObject({ code: 'CONTEXT_EXTRACTION_FAILED' });
    expect((await conversations.get('c1'))?.messages).toHaveLength(0);
  });
});
