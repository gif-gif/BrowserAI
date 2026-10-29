import { AppError, normalizeError } from '../../shared/errors/app-error';
import type { ExtractedPageContext } from '../../shared/types/context';
import type { ActiveTabState, PageContextState } from '../../shared/types/tab-state';
import type { PageAccessPolicy } from '../../shared/types/permissions';
import type { ContextSnapshotService } from './context-snapshot-service';
import type { TabSessionService } from './tab-session-service';

export interface ActiveTabDescriptor {
  tabId: number;
  url: string;
  navigationKey: string;
}

export type LocalPageExtractor = (
  tabId: number,
  url: string,
  navigationKey: string,
) => Promise<ExtractedPageContext>;

export function isPageContextSupported(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (parsed.hostname === 'chrome.google.com' && parsed.pathname.startsWith('/webstore')) return false;
  if (parsed.hostname === 'chromewebstore.google.com') return false;
  return true;
}

export interface ActiveTabStateServiceOptions {
  getPageAccess?(tabId: number, url: string): Promise<PageAccessPolicy>;
}

export class ActiveTabStateService {
  constructor(
    private readonly sessions: TabSessionService,
    private readonly snapshots: ContextSnapshotService,
    private readonly extractPage: LocalPageExtractor,
    private readonly options: ActiveTabStateServiceOptions = {},
  ) {}

  async open(tab: ActiveTabDescriptor): Promise<ActiveTabState> {
    const { conversation } = await this.sessions.resolve(tab.tabId, tab.url, tab.navigationKey);
    const context = await this.resolveContext(tab);

    return {
      tabId: tab.tabId,
      url: tab.url,
      navigationKey: tab.navigationKey,
      conversation,
      context,
    };
  }

  /**
   * Re-reads the conversation while keeping the page snapshot already prepared for
   * this navigation, so conversation-only edits (e.g. switching the model) keep the
   * same snapshot id and the panel keeps the user's context selection.
   */
  async reopen(tab: ActiveTabDescriptor): Promise<ActiveTabState> {
    const current = this.snapshots.current(tab.tabId);
    if (!current || current.metadata.navigationKey !== tab.navigationKey) return this.open(tab);
    const { conversation } = await this.sessions.resolve(tab.tabId, tab.url, tab.navigationKey);
    return {
      tabId: tab.tabId,
      url: tab.url,
      navigationKey: tab.navigationKey,
      conversation,
      context: { status: 'ready', snapshot: current },
    };
  }

  /** Extracts page context for a tab without binding a conversation to it (used for “@” mentioned tabs). */
  async extract(tab: ActiveTabDescriptor): Promise<PageContextState> {
    return this.resolveContext(tab);
  }

  private async resolveContext(tab: ActiveTabDescriptor): Promise<PageContextState> {
    let context: PageContextState;

    if (!isPageContextSupported(tab.url)) {
      this.snapshots.invalidate(tab.tabId, tab.navigationKey);
      context = { status: 'unavailable', reason: 'PAGE_UNSUPPORTED' };
    } else {
      const pageAccess = await this.options.getPageAccess?.(tab.tabId, tab.url);
      if (pageAccess && !pageAccess.pageContextAllowed) {
        this.snapshots.invalidate(tab.tabId, tab.navigationKey);
        context = {
          status: 'unavailable',
          reason: pageAccess.supported ? 'PAGE_PERMISSION_REQUIRED' : 'PAGE_UNSUPPORTED',
          message: pageAccess.excluded
            ? '此网站已在自动访问中排除。确认后可仅为本次读取页面内容。'
            : '当前页面不允许扩展读取。',
          canAllowOnce: pageAccess.canAllowOnce,
        };
      } else try {
        const snapshot = await this.extractPage(tab.tabId, tab.url, tab.navigationKey);
        if (snapshot.tabId !== tab.tabId || snapshot.metadata.navigationKey !== tab.navigationKey) {
          throw new AppError('CONTEXT_STALE', '页面在提取期间发生变化');
        }
        this.snapshots.store(snapshot);
        context = { status: 'ready', snapshot };
      } catch (error) {
        const normalized = normalizeError(error);
        this.snapshots.invalidate(tab.tabId, tab.navigationKey);
        context = {
          status: 'unavailable',
          reason: normalized.code === 'PAGE_PERMISSION_REQUIRED'
            ? 'PAGE_PERMISSION_REQUIRED'
            : 'CONTEXT_EXTRACTION_FAILED',
          message: normalized.message,
        };
      }
    }

    return context;
  }

  navigationChanged(tabId: number, navigationKey: string): void {
    this.snapshots.invalidate(tabId, navigationKey);
  }

  async closeTab(tabId: number): Promise<void> {
    this.snapshots.remove(tabId);
    await this.sessions.closeTab(tabId);
  }
}
