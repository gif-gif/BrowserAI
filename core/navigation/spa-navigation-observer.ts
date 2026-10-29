import { createNavigationKey } from '../page-context/navigation-key';

export interface NavigationChange {
  url: string;
  navigationKey: string;
}

export function observeSpaNavigation(
  window: Window,
  listener: (change: NavigationChange) => void,
  options: { pollIntervalMs?: number } = {},
): () => void {
  let currentUrl = window.location.href;
  let revision = 0;
  const notify = () => {
    const url = window.location.href;
    revision += 1;
    currentUrl = url;
    listener({ url, navigationKey: createNavigationKey(url, revision) });
  };
  const notifyIfChanged = () => {
    if (window.location.href !== currentUrl) notify();
  };
  const originalPushState = window.history.pushState.bind(window.history);
  const originalReplaceState = window.history.replaceState.bind(window.history);
  window.history.pushState = (...args) => { originalPushState(...args); notify(); };
  window.history.replaceState = (...args) => { originalReplaceState(...args); notify(); };
  window.addEventListener('popstate', notify);
  window.addEventListener('hashchange', notifyIfChanged);
  const interval = options.pollIntervalMs === 0
    ? undefined
    : window.setInterval(notifyIfChanged, options.pollIntervalMs ?? 750);

  return () => {
    window.history.pushState = originalPushState;
    window.history.replaceState = originalReplaceState;
    window.removeEventListener('popstate', notify);
    window.removeEventListener('hashchange', notifyIfChanged);
    if (interval !== undefined) window.clearInterval(interval);
  };
}
