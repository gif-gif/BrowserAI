import { describe, expect, it, vi } from 'vitest';
import { ActiveTabStateService } from '../../core/chat/active-tab-state-service';
import { ContextSnapshotService } from '../../core/chat/context-snapshot-service';
import { TabSessionService } from '../../core/chat/tab-session-service';
import { ConversationRepository } from '../../storage/conversation-repository';
import { TabBindingRepository } from '../../storage/tab-binding-repository';
import { FakeStorageArea } from '../setup/fake-storage';

function setup(extract = vi.fn(async (tabId: number, url: string, navigationKey: string) => ({
  snapshotId: `snapshot-${tabId}`, tabId, title: `Tab ${tabId}`, url,
  document: { text: 'local page text', extractionMethod: 'innerText' as const },
  metadata: { extractedAt: 1, originalCharacterCount: 15, submittedCharacterCount: 15, truncated: false, navigationKey },
}))) {
  const storage = new FakeStorageArea();
  let sequence = 0;
  const sessions = new TabSessionService(
    new ConversationRepository(storage), new TabBindingRepository(storage),
    async () => ({ model: 'm1' }),
    { createId: () => `c-${++sequence}`, now: () => sequence },
  );
  const snapshots = new ContextSnapshotService();
  return { service: new ActiveTabStateService(sessions, snapshots, extract), sessions, snapshots, extract };
}

describe('tab switching integration', () => {
  it('restores different conversations and prepares context locally without a provider call', async () => {
    const { service, extract } = setup();
    const tabOne = await service.open({ tabId: 1, url: 'https://one.example', navigationKey: 'nav-1' });
    const tabTwo = await service.open({ tabId: 2, url: 'https://two.example', navigationKey: 'nav-2' });
    const reopened = await service.open({ tabId: 1, url: 'https://one.example', navigationKey: 'nav-1' });
    expect(reopened.conversation.id).toBe(tabOne.conversation.id);
    expect(tabTwo.conversation.id).not.toBe(tabOne.conversation.id);
    expect(extract).toHaveBeenCalledTimes(3);
    expect(reopened.context.status).toBe('ready');
  });

  it('reopens a tab with the existing snapshot instead of extracting the page again', async () => {
    const { service, extract } = setup();
    const opened = await service.open({ tabId: 1, url: 'https://one.example', navigationKey: 'nav-1' });
    const reopened = await service.reopen({ tabId: 1, url: 'https://one.example', navigationKey: 'nav-1' });
    expect(extract).toHaveBeenCalledTimes(1);
    expect(reopened.conversation.id).toBe(opened.conversation.id);
    expect(reopened.context).toEqual(opened.context);

    await service.reopen({ tabId: 1, url: 'https://one.example/next', navigationKey: 'nav-2' });
    expect(extract).toHaveBeenCalledTimes(2);
  });

  it('returns chat-only state for restricted pages', async () => {
    const { service, extract } = setup();
    const state = await service.open({ tabId: 9, url: 'chrome://settings', navigationKey: 'restricted' });
    expect(state.context).toMatchObject({ status: 'unavailable', reason: 'PAGE_UNSUPPORTED' });
    expect(extract).not.toHaveBeenCalled();
  });
});
