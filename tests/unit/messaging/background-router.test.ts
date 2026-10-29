import { describe, expect, it, vi } from 'vitest';
import { createBackgroundRouter, type RuntimeCommandHandlers } from '../../../messaging/background-router';

function handlers(): RuntimeCommandHandlers {
  return {
    GET_ACTIVE_TAB_STATE: vi.fn(async () => ({ tabId: 1 })),
    GET_TAB_STATE: vi.fn(async () => ({ tabId: 1 })),
    LIST_CONVERSATIONS: vi.fn(async () => ({ conversations: [], retentionDays: 30 })),
    OPEN_CONVERSATION: vi.fn(async () => ({ conversationId: 'c1' })),
    CREATE_CONVERSATION: vi.fn(async () => ({ conversationId: 'c1' })),
    SET_CONVERSATION_MODEL: vi.fn(async () => ({ conversationId: 'c1', model: 'm2' })),
    DELETE_CONVERSATION: vi.fn(async () => ({ deleted: true })),
    PIN_CONVERSATION: vi.fn(async () => ({ pinned: true })),
    CLEAR_CONVERSATIONS: vi.fn(async () => ({ deletedIds: [] })),
    SET_RETENTION: vi.fn(async () => ({ requiresConfirmation: false, affectedCount: 0, retentionDays: 30 })),
    GET_CONTEXT_LIMIT: vi.fn(async () => ({ documentCharacters: 40_000 })),
    GET_ATTACHMENT_LIMIT: vi.fn(async () => ({ attachmentMaxBytes: 5 * 1024 * 1024 })),
    SET_CONTEXT_LIMIT: vi.fn(async () => ({ documentCharacters: 80_000 })),
    SET_ATTACHMENT_LIMIT: vi.fn(async () => ({ attachmentMaxBytes: 10 * 1024 * 1024 })),
    GET_PROVIDER_SETTINGS: vi.fn(async () => ({ providers: [] })),
    GET_WRITING_ASSISTANT_PREFERENCES: vi.fn(async () => ({
      languagePreference: 'auto', themePreference: 'blue', writingAssistantEnabled: true,
    })),
    SAVE_PROVIDER_CONFIG: vi.fn(async () => ({ saved: true })),
    REMOVE_PROVIDER_SECRET: vi.fn(async () => ({ removed: true })),
    LIST_PROVIDER_MODELS: vi.fn(async () => ({ models: [] })),
    TEST_PROVIDER_DRAFT: vi.fn(async () => ({ ok: true })),
    TEST_PROVIDER_CONNECTION: vi.fn(async () => ({ ok: true })),
    AI_WRITING_ASSIST: vi.fn(async () => ({ text: 'rewritten' })),
    EXTRACT_PAGE_CONTEXT: vi.fn(async () => ({ snapshotId: 's1' })),
    ANALYZE_PAGE_TECH_STACK: vi.fn(async () => ({ technologies: [] })),
    RETRY_PAGE_CONTEXT: vi.fn(async () => ({ tabId: 1 })),
    ALLOW_PAGE_ACCESS_ONCE: vi.fn(async () => ({ allowed: true })),
    EXTRACT_TAB_CONTEXT: vi.fn(async () => ({ tabId: 8, snapshotId: 'snapshot-8', title: 'Other', url: 'https://example.org/', truncated: false })),
    OPEN_FLOATING_CHAT: vi.fn(async () => ({ open: true })),
    CLOSE_FLOATING_CHAT: vi.fn(async () => ({ open: false })),
    GET_FLOATING_CHAT_STATUS: vi.fn(async () => ({ open: false })),
    OPEN_SIDE_PANEL: vi.fn(async () => ({ open: true })),
  };
}

describe('background router', () => {
  it('routes a valid command to exactly one handler', async () => {
    const commandHandlers = handlers();
    const route = createBackgroundRouter(commandHandlers);
    const response = await route({ version: 1, type: 'CREATE_CONVERSATION', requestId: 'r1', tabId: 7 });
    expect(response).toMatchObject({ version: 1, requestId: 'r1', ok: true });
    expect(commandHandlers.CREATE_CONVERSATION).toHaveBeenCalledTimes(1);
    expect(Object.values(commandHandlers).reduce((sum, handler) => sum + vi.mocked(handler).mock.calls.length, 0)).toBe(1);
  });

  it('serializes invalid commands without throwing across the runtime boundary', async () => {
    const commandHandlers = handlers();
    const response = await createBackgroundRouter(commandHandlers)({
      version: 1,
      type: 'UNKNOWN_COMMAND',
      requestId: 'r-invalid',
      apiKey: 'must-not-echo',
    });
    expect(response).toMatchObject({
      version: 1,
      requestId: 'r-invalid',
      ok: false,
      error: { code: 'INVALID_MESSAGE', retryable: false },
    });
    expect(JSON.stringify(response)).not.toContain('must-not-echo');
    expect(Object.values(commandHandlers).every((handler) => vi.mocked(handler).mock.calls.length === 0)).toBe(true);
  });

  it('serializes handler failures', async () => {
    const commandHandlers = handlers();
    commandHandlers.TEST_PROVIDER_CONNECTION = vi.fn(async () => { throw new Error('gateway exploded'); });
    const response = await createBackgroundRouter(commandHandlers)({
      version: 1,
      type: 'TEST_PROVIDER_CONNECTION',
      requestId: 'r2',
      providerId: 'p1',
    });
    expect(response).toMatchObject({ ok: false, requestId: 'r2', error: { code: 'UNKNOWN' } });
  });
});
