import { describe, expect, it, vi } from 'vitest';
import { PageAccessService } from '../../../core/permissions/page-access-service';

function setup(permissionGranted: boolean) {
  const permissions = {
    contains: vi.fn(async () => false),
    request: vi.fn(async () => permissionGranted),
    remove: vi.fn(async () => true),
  };
  const scripting = {
    registerContentScripts: vi.fn(async () => undefined),
    unregisterContentScripts: vi.fn(async () => undefined),
  };
  return { permissions, scripting };
}

describe('PageAccessService', () => {
  it('registers the all-sites script only after permission is granted', async () => {
    const denied = setup(false);
    expect(await new PageAccessService(denied.permissions, denied.scripting).enableAllSites())
      .toEqual({ granted: false, registered: false });
    expect(denied.scripting.registerContentScripts).not.toHaveBeenCalled();

    const allowed = setup(true);
    expect(await new PageAccessService(allowed.permissions, allowed.scripting).enableAllSites())
      .toEqual({ granted: true, registered: true });
    expect(allowed.scripting.registerContentScripts).toHaveBeenCalledTimes(1);
    const requestOrder = allowed.permissions.request.mock.invocationCallOrder[0];
    const registerOrder = allowed.scripting.registerContentScripts.mock.invocationCallOrder[0];
    expect(requestOrder).toBeDefined();
    expect(registerOrder).toBeDefined();
    expect(requestOrder!).toBeLessThan(registerOrder!);
  });

  it('unregisters the script and can remove broad host permissions', async () => {
    const api = setup(true);
    const result = await new PageAccessService(api.permissions, api.scripting)
      .disableAllSites({ removePermission: true });
    expect(api.scripting.unregisterContentScripts).toHaveBeenCalled();
    expect(api.permissions.remove).toHaveBeenCalledWith({
      origins: ['http://*/*', 'https://*/*'],
    });
    expect(result).toEqual({ unregistered: true, permissionRemoved: true });
  });

  describe('restoreAllSites', () => {
    function restoreSetup(options: { mode: 'all-sites' | 'active-tab'; granted: boolean; registered: boolean }) {
      let saved = { pageAccessMode: options.mode } as Record<string, unknown>;
      const preferences = {
        get: vi.fn(async () => saved),
        save: vi.fn(async (next: Record<string, unknown>) => { saved = next; }),
      };
      const permissions = {
        contains: vi.fn(async () => options.granted),
        request: vi.fn(async () => true),
        remove: vi.fn(async () => true),
      };
      const scripting = {
        getRegisteredContentScripts: vi.fn(async () => (options.registered ? [{ id: 'chrome-ai-all-sites' }] : [])),
        registerContentScripts: vi.fn(async () => undefined),
        unregisterContentScripts: vi.fn(async () => undefined),
      };
      const service = new PageAccessService(
        permissions,
        scripting,
        preferences as unknown as ConstructorParameters<typeof PageAccessService>[2],
      );
      return { service, permissions, scripting, saved: () => saved };
    }

    it('re-registers the all-sites script dropped by an extension reload', async () => {
      const api = restoreSetup({ mode: 'all-sites', granted: true, registered: false });
      expect(await api.service.restoreAllSites()).toBe(true);
      expect(api.scripting.registerContentScripts).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'chrome-ai-all-sites', js: ['content-scripts/content.js'], persistAcrossSessions: true }),
      ]);
      expect(api.permissions.request).not.toHaveBeenCalled();
    });

    it('leaves an existing registration and activeTab mode alone', async () => {
      const registered = restoreSetup({ mode: 'all-sites', granted: true, registered: true });
      expect(await registered.service.restoreAllSites()).toBe(false);
      expect(registered.scripting.registerContentScripts).not.toHaveBeenCalled();

      const activeTab = restoreSetup({ mode: 'active-tab', granted: true, registered: false });
      expect(await activeTab.service.restoreAllSites()).toBe(false);
      expect(activeTab.scripting.registerContentScripts).not.toHaveBeenCalled();
    });

    it('falls back to activeTab without prompting when the site permission was revoked', async () => {
      const api = restoreSetup({ mode: 'all-sites', granted: false, registered: false });
      expect(await api.service.restoreAllSites()).toBe(false);
      expect(api.scripting.registerContentScripts).not.toHaveBeenCalled();
      expect(api.permissions.request).not.toHaveBeenCalled();
      expect(api.saved().pageAccessMode).toBe('active-tab');
    });
  });
});
