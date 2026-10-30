import type { ContentCommand } from '../../messaging/contracts';

export interface BackgroundTab {
  id?: number;
  windowId?: number;
  url?: string;
  pendingUrl?: string;
}

export interface BackgroundMessageSender {
  tab?: BackgroundTab;
}

export interface BackgroundEvent<T extends (...args: never[]) => unknown> {
  addListener(listener: T): void;
  removeListener(listener: T): void;
}

export interface BackgroundPort {
  name: string;
  postMessage(message: unknown): void;
  onMessage: BackgroundEvent<(message: unknown) => void>;
  onDisconnect: BackgroundEvent<() => void>;
}

export interface BackgroundBrowserApi {
  runtime: {
    id: string;
    onMessage: BackgroundEvent<(message: unknown, sender: BackgroundMessageSender) => unknown>;
    onConnect: BackgroundEvent<(port: BackgroundPort) => void>;
    onInstalled?: BackgroundEvent<(details: { reason: string }) => void>;
  };
  storage: {
    local: {
      setAccessLevel(options: { accessLevel: 'TRUSTED_CONTEXTS' }): Promise<void>;
    };
  };
  action: {
    onClicked: BackgroundEvent<(tab: BackgroundTab) => void>;
  };
  tabs: {
    query(query: { active?: boolean; currentWindow?: boolean }): Promise<BackgroundTab[]>;
    get?(tabId: number): Promise<BackgroundTab>;
    sendMessage(tabId: number, message: ContentCommand): Promise<unknown>;
    onRemoved: BackgroundEvent<(tabId: number) => void>;
    onUpdated: BackgroundEvent<(tabId: number, changeInfo: { url?: string; status?: string }, tab: BackgroundTab) => void>;
  };
  scripting: {
    getRegisteredContentScripts?(): Promise<Array<{ id: string }>>;
    executeScript(options: { target: { tabId: number }; files: string[] }): Promise<unknown>;
    registerContentScripts(scripts: Array<{
      id: string;
      matches: string[];
      js: string[];
      runAt?: 'document_start' | 'document_end' | 'document_idle';
      persistAcrossSessions?: boolean;
    }>): Promise<void>;
    unregisterContentScripts(filter: { ids: string[] }): Promise<void>;
  };
  sidePanel: {
    setOptions(options: { tabId?: number; enabled: boolean; path?: string }): Promise<void>;
    open(options: { tabId: number }): Promise<void>;
  };
  contextMenus: ContextMenusApi;
  alarms: AlarmsApi;
  permissions: {
    contains(permissions: { origins: string[] }): Promise<boolean>;
    request(permissions: { origins: string[] }): Promise<boolean>;
    remove(permissions: { origins: string[] }): Promise<boolean>;
  };
}

export interface ContextMenusApi {
  removeAll(): Promise<void> | void;
  create(options: {
    id: string;
    title: string;
    contexts: ['selection'];
  }): unknown;
  onClicked: BackgroundEvent<(
    info: { menuItemId: string | number; selectionText?: string },
    tab?: BackgroundTab,
  ) => void>;
}

export interface AlarmsApi {
  get(name: string): Promise<{ name: string } | undefined>;
  create(name: string, alarmInfo: { periodInMinutes: number }): Promise<void> | void;
  onAlarm: BackgroundEvent<(alarm: { name: string }) => void>;
}
