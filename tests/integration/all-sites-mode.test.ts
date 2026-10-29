import { describe, expect, it, vi } from 'vitest';
import { ActiveTabStateService } from '../../core/chat/active-tab-state-service';
import { ContextSnapshotService } from '../../core/chat/context-snapshot-service';
import { TabSessionService } from '../../core/chat/tab-session-service';
import { PageAccessService } from '../../core/permissions/page-access-service';
import { matchesSitePattern, normalizeSitePattern } from '../../core/permissions/site-pattern';
import { ConversationRepository } from '../../storage/conversation-repository';
import { PreferencesRepository } from '../../storage/preferences-repository';
import { TabBindingRepository } from '../../storage/tab-binding-repository';
import { FakeStorageArea } from '../setup/fake-storage';

function setup(permissionGranted = true) {
  const storage = new FakeStorageArea();
  const preferences = new PreferencesRepository(storage);
  const permissions = {
    contains: vi.fn(async () => false),
    request: vi.fn(async () => permissionGranted),
    remove: vi.fn(async () => true),
  };
  const scripting = {
    getRegisteredContentScripts: vi.fn<() => Promise<Array<{ id: string }>>>(async () => []),
    registerContentScripts: vi.fn(async () => undefined),
    unregisterContentScripts: vi.fn(async () => undefined),
  };
  return { storage, preferences, permissions, scripting, service: new PageAccessService(permissions, scripting, preferences) };
}

describe('optional all-sites mode', () => {
  it('requests broad access, registers once, and leaves active-tab mode intact after denial', async () => {
    const denied = setup(false);
    expect(await denied.service.enableAllSites()).toEqual({ granted: false, registered: false });
    expect((await denied.preferences.get()).pageAccessMode).toBe('active-tab');
    expect(denied.scripting.registerContentScripts).not.toHaveBeenCalled();

    const granted = setup(true);
    await granted.service.enableAllSites();
    granted.scripting.getRegisteredContentScripts.mockResolvedValue([{ id: 'chrome-ai-all-sites' }]);
    await granted.service.enableAllSites();
    expect(granted.permissions.request).toHaveBeenCalledWith({ origins: ['http://*/*', 'https://*/*'] });
    expect(granted.scripting.registerContentScripts).toHaveBeenCalledTimes(1);
    expect((await granted.preferences.get()).pageAccessMode).toBe('all-sites');
  });

  it('unregisters automatic execution and optionally removes broad permissions', async () => {
    const current = setup(true);
    await current.service.enableAllSites();
    expect(await current.service.disableAllSites({ removePermission: true })).toEqual({ unregistered: true, permissionRemoved: true });
    expect(current.scripting.unregisterContentScripts).toHaveBeenCalledWith({ ids: ['chrome-ai-all-sites'] });
    expect((await current.preferences.get()).pageAccessMode).toBe('active-tab');
  });

  it('normalizes site patterns and excludes matching subdomains from automatic selection and extraction', async () => {
    expect(normalizeSitePattern('https://Accounts.Example.com/login')).toBe('accounts.example.com');
    expect(matchesSitePattern('https://login.example.com', '*.example.com')).toBe(true);
    const current = setup(true);
    await current.preferences.save({ retentionDays: 30, pageAccessMode: 'all-sites', selectionButtonEnabled: true, documentContextCharacters: 40_000, attachmentMaxBytes: 5 * 1024 * 1024, siteDenylist: ['*.example.com'] });

    expect(await current.service.getPagePolicy(4, 'https://accounts.example.com/login')).toMatchObject({
      excluded: true,
      selectionActionEnabled: false,
      pageContextAllowed: false,
      canAllowOnce: true,
    });
  });

  it('requires one-time confirmation before manually extracting an excluded site', async () => {
    const current = setup(true);
    await current.preferences.save({ retentionDays: 30, pageAccessMode: 'all-sites', selectionButtonEnabled: true, documentContextCharacters: 40_000, attachmentMaxBytes: 5 * 1024 * 1024, siteDenylist: ['private.example'] });
    const sessions = new TabSessionService(
      new ConversationRepository(current.storage), new TabBindingRepository(current.storage),
      async () => ({ providerId: 'p1', model: 'm1' }), { createId: () => 'c1', now: () => 1 },
    );
    const extract = vi.fn(async (tabId: number, url: string, navigationKey: string) => ({
      snapshotId: 's1', tabId, title: 'Private', url,
      document: { text: 'secret local text', extractionMethod: 'innerText' as const },
      metadata: { extractedAt: 1, originalCharacterCount: 17, submittedCharacterCount: 17, truncated: false, navigationKey },
    }));
    const activeTabs = new ActiveTabStateService(sessions, new ContextSnapshotService(), extract, {
      getPageAccess: (tabId, url) => current.service.getPagePolicy(tabId, url),
    });

    const blocked = await activeTabs.open({ tabId: 4, url: 'https://private.example/account', navigationKey: 'nav-1' });
    expect(blocked.context).toMatchObject({ status: 'unavailable', reason: 'PAGE_PERMISSION_REQUIRED', canAllowOnce: true });
    expect(extract).not.toHaveBeenCalled();

    expect(await current.service.allowOnce(4, 'https://private.example/account')).toBe(true);
    const allowed = await activeTabs.open({ tabId: 4, url: 'https://private.example/account', navigationKey: 'nav-1' });
    expect(allowed.context.status).toBe('ready');
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it('never allows restricted Chrome pages, even with one-time confirmation', async () => {
    const current = setup(true);
    expect(await current.service.allowOnce(2, 'chrome://settings')).toBe(false);
    expect(await current.service.getPagePolicy(2, 'chrome://settings')).toMatchObject({ pageContextAllowed: false, canAllowOnce: false });
  });
});
