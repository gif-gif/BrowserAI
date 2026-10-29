import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '../sidepanel/App';
import { I18nProvider } from '../../shared/i18n/I18nProvider';
import { ThemeProvider } from '../../shared/theme/ThemeProvider';
import { RuntimeClient } from '../../messaging/runtime-client';

/**
 * The in-page floating chat. This page is web-accessible so the content script can frame it, which
 * also lets any site frame it; it renders only inside the tab where the user opened it.
 */
async function resolveFloatingTab(): Promise<number | undefined> {
  if (window.top === window) return undefined;
  const tab = await browser.tabs.getCurrent();
  if (tab?.id === undefined) return undefined;
  const status = await new RuntimeClient(browser.runtime).send<{ open?: boolean }>({
    version: 1,
    requestId: globalThis.crypto?.randomUUID?.() ?? `floating-status-${Date.now()}`,
    type: 'GET_FLOATING_CHAT_STATUS',
    tabId: tab.id,
  });
  return status.open ? tab.id : undefined;
}

void resolveFloatingTab().catch(() => undefined).then((tabId) => {
  if (tabId === undefined) return;
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><I18nProvider><ThemeProvider><App floatingTabId={tabId} /></ThemeProvider></I18nProvider></React.StrictMode>,
  );
});
