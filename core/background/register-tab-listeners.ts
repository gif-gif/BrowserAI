import { createNavigationKey } from '../page-context/navigation-key';
import type { BackgroundBrowserApi } from './browser-api';

interface TabLifecycleService {
  navigationChanged(tabId: number, navigationKey: string): void;
  closeTab(tabId: number): Promise<void>;
}

interface TabListenerOptions {
  navigationChanged?(tabId: number, navigationKey: string): void;
  tabClosed?(tabId: number): void;
  afterTabClosed?(): Promise<void> | void;
}

export function registerTabListeners(
  tabs: BackgroundBrowserApi['tabs'],
  activeTabs: TabLifecycleService,
  options: TabListenerOptions = {},
): () => void {
  const onRemoved = (tabId: number) => {
    options.tabClosed?.(tabId);
    void Promise.resolve(activeTabs.closeTab(tabId)).then(() => options.afterTabClosed?.());
  };
  const onUpdated = (tabId: number, changeInfo: { url?: string }) => {
    if (!changeInfo.url) return;
    const navigationKey = createNavigationKey(changeInfo.url);
    options.navigationChanged?.(tabId, navigationKey);
    activeTabs.navigationChanged(tabId, navigationKey);
  };
  tabs.onRemoved.addListener(onRemoved);
  tabs.onUpdated.addListener(onUpdated);
  return () => {
    tabs.onRemoved.removeListener(onRemoved);
    tabs.onUpdated.removeListener(onUpdated);
  };
}
