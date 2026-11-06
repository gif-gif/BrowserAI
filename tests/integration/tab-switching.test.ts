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

  it('keeps a same-URL snapshot whose navigation key differs and reports the page key', async () => {
    // A reload or an onUpdated reset leaves the background and the page with different counts.
    const { service, snapshots } = setup(vi.fn(async (tabId: number, url: string) => ({
      snapshotId: 'snapshot-reloaded', tabId, title: 'Repo', url,
      document: { text: 'repo readme', extractionMethod: 'innerText' as const },
      metadata: { extractedAt: 1, originalCharacterCount: 11, submittedCharacterCount: 11, truncated: false, navigationKey: `${url}#chrome-ai-navigation-0` },
    })));
    const adopted = vi.fn();
    service.setNavigationListener(adopted);
    const url = 'https://github.com/heydamir/unslop';

    const state = await service.open({ tabId: 4, url, navigationKey: `${url}#chrome-ai-navigation-3` });

    expect(state.context).toMatchObject({ status: 'ready', snapshot: { snapshotId: 'snapshot-reloaded' } });
    expect(state.navigationKey).toBe(`${url}#chrome-ai-navigation-0`);
    expect(adopted).toHaveBeenCalledWith(4, `${url}#chrome-ai-navigation-0`);
    expect(snapshots.requireCurrent(4, 'snapshot-reloaded').document?.text).toBe('repo readme');
  });

  it('still rejects a snapshot taken after the page moved to another URL', async () => {
    const { service } = setup(vi.fn(async (tabId: number) => ({
      snapshotId: 'snapshot-other', tabId, title: 'Issues', url: 'https://github.com/heydamir/unslop/issues',
      document: { text: 'issues', extractionMethod: 'innerText' as const },
      metadata: { extractedAt: 1, originalCharacterCount: 6, submittedCharacterCount: 6, truncated: false, navigationKey: 'https://github.com/heydamir/unslop/issues#chrome-ai-navigation-1' },
    })));
    const adopted = vi.fn();
    service.setNavigationListener(adopted);

    const state = await service.open({ tabId: 4, url: 'https://github.com/heydamir/unslop', navigationKey: 'https://github.com/heydamir/unslop#chrome-ai-navigation-0' });

    expect(state.context).toMatchObject({ status: 'unavailable', reason: 'CONTEXT_EXTRACTION_FAILED' });
    expect(adopted).not.toHaveBeenCalled();
  });

  it('returns chat-only state for restricted pages', async () => {
    const { service, extract } = setup();
    const state = await service.open({ tabId: 9, url: 'chrome://settings', navigationKey: 'restricted' });
    expect(state.context).toMatchObject({ status: 'unavailable', reason: 'PAGE_UNSUPPORTED' });
    expect(extract).not.toHaveBeenCalled();
  });
});
