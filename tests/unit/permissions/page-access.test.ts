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
});
