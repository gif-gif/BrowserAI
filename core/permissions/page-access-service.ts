import type {
  DynamicScriptingApi,
  OriginPermissionsApi,
  PageAccessPolicy,
} from '../../shared/types/permissions';
import type { PreferencesRepository } from '../../storage/preferences-repository';
import { matchesSitePattern } from './site-pattern';

export const ALL_SITES_ORIGINS = ['http://*/*', 'https://*/*'];
export const ALL_SITES_SCRIPT_ID = 'chrome-ai-all-sites';

function supportedPageOrigin(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
  if (parsed.hostname === 'chrome.google.com' && parsed.pathname.startsWith('/webstore')) return undefined;
  if (parsed.hostname === 'chromewebstore.google.com') return undefined;
  return parsed.origin;
}

export class PageAccessService {
  private readonly oneTimeAccess = new Set<string>();
  private registeredAllSites = false;

  constructor(
    private readonly permissions: OriginPermissionsApi,
    private readonly scripting: DynamicScriptingApi,
    private readonly preferences?: PreferencesRepository,
  ) {}

  async enableAllSites(): Promise<{ granted: boolean; registered: boolean }> {
    const permission = { origins: ALL_SITES_ORIGINS };
    const granted = await this.permissions.contains(permission) || await this.permissions.request(permission);
    if (!granted) return { granted: false, registered: false };

    const registeredScripts = await this.scripting.getRegisteredContentScripts?.();
    const alreadyRegistered = registeredScripts?.some(({ id }) => id === ALL_SITES_SCRIPT_ID) ?? false;
    if (!alreadyRegistered) {
      await this.scripting.registerContentScripts([{
        id: ALL_SITES_SCRIPT_ID,
        matches: ALL_SITES_ORIGINS,
        js: ['content-scripts/content.js'],
        runAt: 'document_idle',
        persistAcrossSessions: true,
      }]);
    }
    this.registeredAllSites = true;
    await this.updatePreferences({ pageAccessMode: 'all-sites' });
    return { granted: true, registered: !alreadyRegistered };
  }

  async disableAllSites(
    options: { removePermission?: boolean } = {},
  ): Promise<{ unregistered: boolean; permissionRemoved: boolean }> {
    const registeredScripts = await this.scripting.getRegisteredContentScripts?.();
    const shouldUnregister = this.registeredAllSites
      || registeredScripts === undefined
      || registeredScripts.some(({ id }) => id === ALL_SITES_SCRIPT_ID);
    if (shouldUnregister) {
      await this.scripting.unregisterContentScripts({ ids: [ALL_SITES_SCRIPT_ID] });
      this.registeredAllSites = false;
    }
    await this.updatePreferences({ pageAccessMode: 'active-tab' });
    const permissionRemoved = options.removePermission
      ? await this.permissions.remove({ origins: ALL_SITES_ORIGINS })
      : false;
    return { unregistered: shouldUnregister, permissionRemoved };
  }


  async getPreferences() {
    return this.preferences?.get();
  }

  async setSelectionButtonEnabled(enabled: boolean): Promise<void> {
    await this.updatePreferences({ selectionButtonEnabled: enabled });
  }

  async setSiteDenylist(siteDenylist: string[]): Promise<void> {
    await this.updatePreferences({ siteDenylist });
  }

  async getPagePolicy(
    tabId: number,
    url: string,
    options: { consumeOneTime?: boolean } = {},
  ): Promise<PageAccessPolicy> {
    const origin = supportedPageOrigin(url);
    if (!origin) {
      return {
        supported: false,
        excluded: false,
        automatic: false,
        selectionActionEnabled: false,
        pageContextAllowed: false,
        canAllowOnce: false,
        reason: 'restricted',
      };
    }

    const preferences = await this.preferences?.get();
    const excluded = preferences?.siteDenylist.some((pattern) => matchesSitePattern(url, pattern)) ?? false;
    const token = this.oneTimeKey(tabId, origin);
    const allowedOnce = excluded && this.oneTimeAccess.has(token);
    if (allowedOnce && options.consumeOneTime !== false) this.oneTimeAccess.delete(token);

    return {
      supported: true,
      excluded,
      automatic: preferences?.pageAccessMode === 'all-sites' && !excluded,
      selectionActionEnabled: (preferences?.selectionButtonEnabled ?? true) && !excluded,
      pageContextAllowed: !excluded || allowedOnce,
      canAllowOnce: excluded && !allowedOnce,
      reason: excluded ? 'denylisted' : undefined,
    };
  }

  async allowOnce(tabId: number, url: string): Promise<boolean> {
    const origin = supportedPageOrigin(url);
    if (!origin) return false;
    const preferences = await this.preferences?.get();
    const excluded = preferences?.siteDenylist.some((pattern) => matchesSitePattern(url, pattern)) ?? false;
    if (!excluded) return true;
    this.oneTimeAccess.add(this.oneTimeKey(tabId, origin));
    return true;
  }

  private oneTimeKey(tabId: number, origin: string): string {
    return `${tabId}:${origin}`;
  }

  private async updatePreferences(
    patch: Partial<Awaited<ReturnType<PreferencesRepository['get']>>>,
  ): Promise<void> {
    if (!this.preferences) return;
    await this.preferences.save({ ...(await this.preferences.get()), ...patch });
  }
}
