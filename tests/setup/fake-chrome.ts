import { vi } from 'vitest';
import type {
  BackgroundBrowserApi,
  BackgroundEvent,
  BackgroundMessageSender,
  BackgroundPort,
  BackgroundTab,
} from '../../core/background/browser-api';

export interface FakeEvent<T extends (...args: never[]) => unknown> extends BackgroundEvent<T> {
  listeners: T[];
  emit(...args: Parameters<T>): Array<ReturnType<T>>;
}

export function createFakeEvent<T extends (...args: never[]) => unknown>(): FakeEvent<T> {
  const listeners: T[] = [];
  return {
    listeners,
    addListener(listener) { listeners.push(listener); },
    removeListener(listener) {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    },
    emit(...args) { return listeners.map((listener) => listener(...args) as ReturnType<T>); },
  };
}

export interface FakeChromeOptions {
  activeTab?: BackgroundTab;
  tabs?: BackgroundTab[];
  permissionRequestGranted?: boolean;
  grantedOrigins?: string[];
}

export interface FakeChrome {
  browser: BackgroundBrowserApi;
  events: {
    runtimeMessage: FakeEvent<(message: unknown, sender: BackgroundMessageSender) => unknown>;
    runtimeConnect: FakeEvent<(port: BackgroundPort) => void>;
    actionClicked: FakeEvent<(tab: BackgroundTab) => void>;
    tabRemoved: FakeEvent<(tabId: number) => void>;
    tabUpdated: FakeEvent<(tabId: number, changeInfo: { url?: string }, tab: BackgroundTab) => void>;
  };
  grantedOrigins: Set<string>;
  setActiveTab(tab: BackgroundTab): void;
}

export function createFakeChrome(options: FakeChromeOptions = {}): FakeChrome {
  const runtimeMessage = createFakeEvent<(message: unknown, sender: BackgroundMessageSender) => unknown>();
  const runtimeConnect = createFakeEvent<(port: BackgroundPort) => void>();
  const actionClicked = createFakeEvent<(tab: BackgroundTab) => void>();
  const tabRemoved = createFakeEvent<(tabId: number) => void>();
  const tabUpdated = createFakeEvent<(tabId: number, changeInfo: { url?: string }, tab: BackgroundTab) => void>();
  const menuClicked = createFakeEvent<(
    info: { menuItemId: string | number; selectionText?: string },
    tab?: BackgroundTab,
  ) => void>();
  const alarm = createFakeEvent<(alarm: { name: string }) => void>();
  const grantedOrigins = new Set(options.grantedOrigins ?? []);
  const tabs = new Map<number, BackgroundTab>();
  for (const tab of options.tabs ?? []) if (tab.id !== undefined) tabs.set(tab.id, tab);
  let activeTab = options.activeTab ?? options.tabs?.[0] ?? { id: 1, url: 'https://example.test/' };
  if (activeTab.id !== undefined) tabs.set(activeTab.id, activeTab);
  const registeredScripts = new Set<string>();

  const browser = {
    runtime: { id: 'fake-extension-id', onMessage: runtimeMessage, onConnect: runtimeConnect },
    storage: { local: { setAccessLevel: vi.fn(async () => undefined) } },
    action: { onClicked: actionClicked },
    tabs: {
      query: vi.fn(async () => [activeTab]),
      get: vi.fn(async (tabId: number) => tabs.get(tabId) ?? { id: tabId }),
      sendMessage: vi.fn(async () => undefined),
      onRemoved: tabRemoved,
      onUpdated: tabUpdated,
    },
    scripting: {
      getRegisteredContentScripts: vi.fn(async () => [...registeredScripts].map((id) => ({ id }))),
      executeScript: vi.fn(async () => undefined),
      registerContentScripts: vi.fn(async (scripts: Array<{ id: string }>) => {
        scripts.forEach(({ id }) => registeredScripts.add(id));
      }),
      unregisterContentScripts: vi.fn(async ({ ids }: { ids: string[] }) => {
        ids.forEach((id) => registeredScripts.delete(id));
      }),
    },
    sidePanel: {
      setOptions: vi.fn(async () => undefined),
      open: vi.fn(async () => undefined),
    },
    contextMenus: {
      removeAll: vi.fn(async () => undefined),
      create: vi.fn(),
      onClicked: menuClicked,
    },
    alarms: {
      get: vi.fn(async () => undefined),
      create: vi.fn(),
      onAlarm: alarm,
    },
    permissions: {
      contains: vi.fn(async ({ origins }: { origins: string[] }) => origins.every((origin) => grantedOrigins.has(origin))),
      request: vi.fn(async ({ origins }: { origins: string[] }) => {
        const granted = options.permissionRequestGranted ?? true;
        if (granted) origins.forEach((origin) => grantedOrigins.add(origin));
        return granted;
      }),
      remove: vi.fn(async ({ origins }: { origins: string[] }) => {
        const existed = origins.some((origin) => grantedOrigins.has(origin));
        origins.forEach((origin) => grantedOrigins.delete(origin));
        return existed;
      }),
    },
  } satisfies BackgroundBrowserApi;

  return {
    browser,
    events: { runtimeMessage, runtimeConnect, actionClicked, tabRemoved, tabUpdated },
    grantedOrigins,
    setActiveTab(tab) {
      activeTab = tab;
      if (tab.id !== undefined) tabs.set(tab.id, tab);
    },
  };
}
