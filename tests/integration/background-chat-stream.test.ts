import { describe, expect, it, vi } from 'vitest';
import { ChatService } from '../../core/chat/chat-service';
import { ContextSnapshotService } from '../../core/chat/context-snapshot-service';
import { ActiveStreamRegistry } from '../../core/streaming/active-stream-registry';
import { ConversationRepository } from '../../storage/conversation-repository';
import { FakeStorageArea } from '../setup/fake-storage';
import type { ProviderAdapter } from '../../core/providers/provider-adapter';

describe('background chat stream integration', () => {
  it('keeps concurrent requests attached to their own assistant messages', async () => {
    const storage = new FakeStorageArea(); const conversations = new ConversationRepository(storage);
    for (const id of ['c1', 'c2']) await conversations.save({ id, title: id, messages: [], model: 'm1', promptVersion: 'v1', pinned: false, createdAt: 1, updatedAt: 1 });
    const provider: ProviderAdapter = {
      type: 'openai-compatible', capabilities: { streaming: true, text: true, vision: false, files: false, tools: false }, listModels: vi.fn(), testDraft: vi.fn(), testConnection: vi.fn(),
      async *streamChat(input) { yield { type: 'started', requestId: input.requestId }; await Promise.resolve(); yield { type: 'delta', requestId: input.requestId, text: input.requestId }; yield { type: 'completed', requestId: input.requestId }; },
    };
    let id = 0;
    const service = new ChatService({ conversations, snapshots: new ContextSnapshotService(), streams: new ActiveStreamRegistry(),
      getConfig: async () => ({ id: 'p1', name: 'P', type: 'openai-compatible', baseURL: 'https://api.example.com', model: 'm1', endpointMode: 'chat-completions', defaultHeaders: {}, timeoutMs: 1000, stream: true, createdAt: 1, updatedAt: 1 }),
      getSecret: async () => 'key', hasGatewayPermission: async () => true, getAdapter: () => provider, createId: p => `${p}-${++id}`,
    });
    await Promise.all(['r1', 'r2'].map((requestId, index) => service.start({ requestId, tabId: index + 1, conversationId: `c${index + 1}`, text: requestId, contextSelection: { includePage: false, includeSelection: false } }, vi.fn())));
    expect((await conversations.get('c1'))?.messages.at(-1)?.content).toBe('r1');
    expect((await conversations.get('c2'))?.messages.at(-1)?.content).toBe('r2');
  });
});
