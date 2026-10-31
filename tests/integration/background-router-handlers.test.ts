import { describe, expect, it, vi } from 'vitest';
import { startBackground, type BackgroundBrowserApi } from '../../core/background/start-background';
import type { BackgroundPort, BackgroundTab } from '../../core/background/browser-api';
import type { BackgroundServices } from '../../core/background/create-services';
import { CHAT_STREAM_PORT_NAME } from '../../messaging/chat-port';

function event<T extends (...args: never[]) => unknown>() {
  const listeners: T[] = [];
  return {
    addListener(listener: T) { listeners.push(listener); },
    removeListener(listener: T) {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    },
    listeners,
  };
}

function createBrowser() {
  const runtimeMessage = event<(message: unknown, sender: { tab?: { id?: number; url?: string } }) => unknown>();
  const runtimeConnect = event<(port: BackgroundPort) => void>();
  const actionClicked = event<(tab: BackgroundTab) => void>();
  const tabRemoved = event<(tabId: number) => void>();
  const tabUpdated = event<(tabId: number, change: { url?: string; status?: string }, tab: BackgroundTab) => void>();
  const menuClicked = event<(info: { menuItemId: string | number; selectionText?: string }, tab?: BackgroundTab) => void>();
  const alarm = event<(alarm: { name: string }) => void>();
  const installed = event<(details: { reason: string }) => void>();
  const queryActiveTab = vi.fn<BackgroundBrowserApi['tabs']['query']>(async () => [
    { id: 7, url: 'https://example.test/article' },
  ]);
  const browser = {
    runtime: { id: 'extension-id', onMessage: runtimeMessage, onConnect: runtimeConnect, onInstalled: installed },
    storage: { local: { setAccessLevel: vi.fn(async () => undefined) } },
    action: { onClicked: actionClicked },
    tabs: {
      query: queryActiveTab,
      get: vi.fn(async (tabId: number) => ({ id: tabId, url: 'https://example.test/article' })),
      sendMessage: vi.fn(),
      onRemoved: tabRemoved,
      onUpdated: tabUpdated,
    },
    scripting: {
      executeScript: vi.fn(async () => undefined),
      registerContentScripts: vi.fn(async () => undefined),
      unregisterContentScripts: vi.fn(async () => undefined),
    },
    sidePanel: { setOptions: vi.fn(async () => undefined), open: vi.fn(async () => undefined) },
    contextMenus: { removeAll: vi.fn(async () => undefined), create: vi.fn(), onClicked: menuClicked },
    alarms: { get: vi.fn(async () => undefined), create: vi.fn(), onAlarm: alarm },
    permissions: { contains: vi.fn<(permission: { origins: string[] }) => Promise<boolean>>(async () => true), request: vi.fn(async () => true), remove: vi.fn(async () => true) },
  } satisfies BackgroundBrowserApi;
  return { browser, runtimeMessage, runtimeConnect, actionClicked, tabRemoved, tabUpdated, installed };
}

type TestPort = BackgroundPort & {
  postMessage: ReturnType<typeof vi.fn<(message: unknown) => void>>;
  onMessage: ReturnType<typeof event<(message: unknown) => void>>;
  onDisconnect: ReturnType<typeof event<() => void>>;
};

function createServices(): BackgroundServices {
  const first = {
    id: 'c1',
    title: 'First',
    messages: [{ id: 'm1', role: 'user', content: 'Hello', status: 'complete', createdAt: 1 }],
    model: 'm1',
    promptVersion: 'v1',
    pinned: false,
    createdAt: 1,
    updatedAt: 2,
  };
  const empty = {
    id: 'c-empty', title: 'Empty', messages: [], model: 'm1', promptVersion: 'v1', pinned: false, createdAt: 2, updatedAt: 3,
  };
  return {
    storage: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    providerConfigs: {
      list: vi.fn(async () => []), get: vi.fn(), getActive: vi.fn(), save: vi.fn(), getSecretForBackground: vi.fn(), removeSecret: vi.fn(), delete: vi.fn(),
    },
    conversations: {
      list: vi.fn(async () => [empty, first]), get: vi.fn(), save: vi.fn(), setPinned: vi.fn(), setModel: vi.fn(), delete: vi.fn(),
    },
    preferences: { get: vi.fn(async () => ({ retentionDays: 30, pageAccessMode: 'active-tab', selectionButtonEnabled: true, documentContextCharacters: 40_000, attachmentMaxBytes: 5 * 1024 * 1024, siteDenylist: [] })), save: vi.fn() },
    bindings: { list: vi.fn(async () => []), get: vi.fn(), save: vi.fn(), removeConversation: vi.fn(), remove: vi.fn() },
    floatingChats: {
      openTabs: vi.fn(async () => []), isOpen: vi.fn(async () => false), markOpen: vi.fn(async () => undefined),
      markClosed: vi.fn(async () => false), getLayout: vi.fn(async () => ({ x: -1, y: -1, width: 420, height: 640 })), saveLayout: vi.fn(async () => undefined),
    },
    retention: { cleanup: vi.fn(async () => ({ deletedIds: [] })), clearUnpinned: vi.fn(async () => ({ deletedIds: [] })), setRetention: vi.fn() },
    pageAccess: {
      getPagePolicy: vi.fn(async () => ({ supported: true, excluded: true, automatic: false, selectionActionEnabled: false, pageContextAllowed: false, canAllowOnce: true, reason: 'denylisted' })),
      allowOnce: vi.fn(async () => true),
      restoreAllSites: vi.fn(async () => false),
    },
    snapshots: { store: vi.fn(), current: vi.fn(), invalidate: vi.fn(), remove: vi.fn(), requireCurrent: vi.fn(), require: vi.fn(), attachSelection: vi.fn(), syncSelection: vi.fn() },
    sessions: {
      resolve: vi.fn(), bindExisting: vi.fn(), createNew: vi.fn(async () => ({ id: 'c-new' })), closeTab: vi.fn(),
    },
    activeTabs: {
      open: vi.fn(async ({ tabId, url, navigationKey }) => ({ tabId, url, navigationKey, conversation: { id: 'c1' }, context: { status: 'unavailable' } })),
      reopen: vi.fn(async ({ tabId, url, navigationKey }) => ({ tabId, url, navigationKey, conversation: { id: 'c1' }, context: { status: 'unavailable' } })),
      navigationChanged: vi.fn(), closeTab: vi.fn(),
    },
    providers: {
      adapters: {
        'openai-compatible': { type: 'openai-compatible', capabilities: { streaming: true, text: true, vision: false, files: false, tools: false }, listModels: vi.fn(async () => []), testDraft: vi.fn(), testConnection: vi.fn(), streamChat: vi.fn() },
        'anthropic-messages': { type: 'anthropic-messages', capabilities: { streaming: true, text: true, vision: true, files: false, tools: false }, listModels: vi.fn(async () => []), testDraft: vi.fn(), testConnection: vi.fn(), streamChat: vi.fn() },
      },
      get(type: 'openai-compatible' | 'anthropic-messages') { return this.adapters[type]; },
    },
    chat: { start: vi.fn(async (_input, emit) => emit({ version: 1, type: 'completed', requestId: 'chat-1' })), cancel: vi.fn(async () => true) },
  } as unknown as BackgroundServices;
}

describe('background lifecycle and router handlers', () => {
  it('locks storage, initializes persisted state, routes commands, and handles tab lifecycle', async () => {
    const { browser, runtimeMessage, actionClicked, tabRemoved, tabUpdated } = createBrowser();
    const services = createServices();
    const migrate = vi.fn(async () => undefined);
    const reconcile = vi.fn(async () => 0);
    const app = startBackground(browser, { services, migrate, reconcile });
    await app.ready;

    expect(browser.storage.local.setAccessLevel).toHaveBeenCalledWith({ accessLevel: 'TRUSTED_CONTEXTS' });
    expect(migrate).toHaveBeenCalledWith(services.storage);
    expect(reconcile).toHaveBeenCalledWith(services.conversations);
    expect(services.retention.cleanup).toHaveBeenCalled();
    expect(services.pageAccess.restoreAllSites).toHaveBeenCalledTimes(1);
    expect(migrate.mock.invocationCallOrder[0]).toBeLessThan(reconcile.mock.invocationCallOrder[0]!);
    expect(browser.alarms.get).toHaveBeenCalledWith('chrome-ai-daily-cleanup');
    expect(browser.alarms.create).toHaveBeenCalledWith('chrome-ai-daily-cleanup', { periodInMinutes: 1440 });
    expect(browser.contextMenus.removeAll).toHaveBeenCalledOnce();
    expect(browser.contextMenus.create).not.toHaveBeenCalled();
    expect(browser.contextMenus.onClicked.listeners).toHaveLength(0);

    const runtimeListener = runtimeMessage.listeners[0]!;
    const response = await runtimeListener({ version: 1, requestId: 'state-1', type: 'GET_ACTIVE_TAB_STATE' }, {});
    expect(response).toMatchObject({ ok: true, requestId: 'state-1', data: { tabId: 7 } });
    expect(services.activeTabs.open).toHaveBeenCalledWith(expect.objectContaining({ tabId: 7, url: 'https://example.test/article' }));


    const exactStateResponse = await runtimeListener({
      version: 1, requestId: 'state-exact', type: 'GET_TAB_STATE', tabId: 7,
    }, {});
    expect(exactStateResponse).toMatchObject({ ok: true, requestId: 'state-exact', data: { tabId: 7 } });
    expect(browser.tabs.get).toHaveBeenCalledWith(7);

    const openai = services.providers.get('openai-compatible');
    vi.mocked(openai.listModels).mockResolvedValue(['gpt-test']);
    vi.mocked(openai.testDraft).mockResolvedValue({ ok: true, message: '连接成功', latencyMs: 9 });
    const draftConfig = {
      id: 'gateway-main', name: '', type: 'openai-compatible' as const, baseURL: 'https://gw.example/v1', model: '',
      endpointMode: 'chat-completions' as const, defaultHeaders: {}, timeoutMs: 30_000, stream: true as const,
    };
    const modelResponse = await runtimeListener({
      version: 1, requestId: 'models-1', type: 'LIST_PROVIDER_MODELS', config: draftConfig, apiKey: 'sk-draft',
    }, {});
    expect(modelResponse).toMatchObject({ ok: true, data: { models: ['gpt-test'] } });
    expect(openai.listModels).toHaveBeenCalledWith(draftConfig, 'sk-draft');

    const testResponse = await runtimeListener({
      version: 1, requestId: 'test-1', type: 'TEST_PROVIDER_DRAFT', config: { ...draftConfig, model: 'gpt-test' }, apiKey: 'sk-draft',
    }, {});
    expect(testResponse).toMatchObject({ ok: true, data: { message: '连接成功', latencyMs: 9 } });
    expect(openai.testDraft).toHaveBeenCalledWith({ ...draftConfig, model: 'gpt-test' }, 'sk-draft');

    const anthropic = services.providers.get('anthropic-messages');
    vi.mocked(anthropic.listModels).mockResolvedValue(['claude-opus-5-5']);
    const anthropicDraft = { ...draftConfig, type: 'anthropic-messages' as const, endpointMode: 'messages' as const, baseURL: 'https://api.anthropic.com' };
    const anthropicModels = await runtimeListener({
      version: 1, requestId: 'models-2', type: 'LIST_PROVIDER_MODELS', config: anthropicDraft, apiKey: 'sk-draft',
    }, {});
    expect(anthropicModels).toMatchObject({ ok: true, data: { models: ['claude-opus-5-5'] } });
    expect(anthropic.listModels).toHaveBeenCalledWith(anthropicDraft, 'sk-draft');
    expect(openai.listModels).toHaveBeenCalledTimes(1);

    const allowed = await runtimeListener({ version: 1, requestId: 'allow-1', type: 'ALLOW_PAGE_ACCESS_ONCE', tabId: 7 }, {});
    expect(allowed).toMatchObject({ ok: true, data: { allowed: true } });
    expect(services.pageAccess.allowOnce).toHaveBeenCalledWith(7, 'https://example.test/article');

    vi.mocked(browser.scripting.executeScript).mockClear();
    vi.mocked(services.activeTabs.open).mockClear();
    const retried = await runtimeListener({ version: 1, requestId: 'retry-page-1', type: 'RETRY_PAGE_CONTEXT', tabId: 7 }, {});
    expect(retried).toMatchObject({ ok: true, data: { tabId: 7 } });
    expect(browser.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 7 },
      files: ['content-scripts/content.js'],
    });
    expect(services.activeTabs.open).toHaveBeenCalledWith(expect.objectContaining({
      tabId: 7,
      url: 'https://example.test/article',
    }));

    await actionClicked.listeners[0]!({ id: 7, url: 'https://example.test/article' });
    expect(browser.scripting.executeScript).toHaveBeenCalledWith({ target: { tabId: 7 }, files: ['content-scripts/content.js'] });
    expect(browser.sidePanel.open).toHaveBeenCalledWith({ tabId: 7 });

    tabUpdated.listeners[0]!(7, { url: 'https://example.test/next' }, { id: 7, url: 'https://example.test/next' });
    expect(services.activeTabs.navigationChanged).toHaveBeenCalledWith(7, 'https://example.test/next#chrome-ai-navigation-0');
    await tabRemoved.listeners[0]!(7);
    expect(services.activeTabs.closeTab).toHaveBeenCalledWith(7);
  });

  it('opens the floating chat in the page, hides it for the side panel, and restores it after a reload', async () => {
    const { browser, runtimeMessage, actionClicked, tabUpdated } = createBrowser();
    const services = createServices();
    const openTabs = new Set<number>();
    vi.mocked(services.floatingChats.markOpen).mockImplementation(async (tabId) => { openTabs.add(tabId); });
    vi.mocked(services.floatingChats.markClosed).mockImplementation(async (tabId) => openTabs.delete(tabId));
    vi.mocked(services.floatingChats.isOpen).mockImplementation(async (tabId) => openTabs.has(tabId));
    startBackground(browser, { services, migrate: vi.fn(), reconcile: vi.fn(), cleanup: vi.fn() });
    const send = runtimeMessage.listeners[0]!;

    const opened = await send({ version: 1, requestId: 'float-1', type: 'OPEN_FLOATING_CHAT', tabId: 7 }, {});
    expect(opened).toMatchObject({ ok: true, data: { open: true } });
    expect(browser.scripting.executeScript).toHaveBeenCalledWith({ target: { tabId: 7 }, files: ['content-scripts/content.js'] });
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(7, expect.objectContaining({
      type: 'SHOW_FLOATING_CHAT', layout: { x: -1, y: -1, width: 420, height: 640 },
    }));
    expect(await send({ version: 1, requestId: 'float-2', type: 'GET_FLOATING_CHAT_STATUS', tabId: 7 }, {}))
      .toMatchObject({ ok: true, data: { open: true } });

    vi.mocked(browser.tabs.sendMessage).mockClear();
    tabUpdated.listeners.forEach((listener) => listener(7, { status: 'complete' }, { id: 7, url: 'https://example.test/article' }));
    await vi.waitFor(() => expect(browser.tabs.sendMessage).toHaveBeenCalledWith(7, expect.objectContaining({ type: 'SHOW_FLOATING_CHAT' })));

    await actionClicked.listeners[0]!({ id: 7, url: 'https://example.test/article' });
    expect(browser.sidePanel.open).toHaveBeenCalledWith({ tabId: 7 });
    await vi.waitFor(() => expect(browser.tabs.sendMessage).toHaveBeenCalledWith(7, expect.objectContaining({ type: 'HIDE_FLOATING_CHAT' })));
    expect(openTabs.has(7)).toBe(false);

    vi.mocked(browser.tabs.sendMessage).mockClear();
    tabUpdated.listeners.forEach((listener) => listener(7, { status: 'complete' }, { id: 7, url: 'https://example.test/article' }));
    await Promise.resolve();
    expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('re-injects the content script after a reload only on sites with host access', async () => {
    const { browser, tabUpdated } = createBrowser();
    const services = createServices();
    browser.permissions.contains.mockImplementation(async (permission: { origins: string[] }) => permission.origins.includes('https://granted.test/*'));
    startBackground(browser, { services, migrate: vi.fn(), reconcile: vi.fn(), cleanup: vi.fn() });

    tabUpdated.listeners.forEach((listener) => listener(7, { status: 'complete' }, { id: 7, url: 'https://granted.test/form' }));
    await vi.waitFor(() => expect(browser.scripting.executeScript).toHaveBeenCalledWith({ target: { tabId: 7 }, files: ['content-scripts/content.js'] }));

    vi.mocked(browser.scripting.executeScript).mockClear();
    tabUpdated.listeners.forEach((listener) => listener(8, { status: 'complete' }, { id: 8, url: 'https://other.test/form' }));
    tabUpdated.listeners.forEach((listener) => listener(9, { status: 'complete' }, { id: 9, url: 'chrome://settings' }));
    tabUpdated.listeners.forEach((listener) => listener(10, { status: 'loading' }, { id: 10, url: 'https://granted.test/form' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(browser.permissions.request).not.toHaveBeenCalled();
    expect(browser.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('re-injects the content script into open granted tabs after the extension reloads', async () => {
    const { browser, installed } = createBrowser();
    const services = createServices();
    browser.tabs.query.mockResolvedValue([
      { id: 1, url: 'https://granted.test/form' },
      { id: 2, url: 'https://other.test/form' },
      { id: 3 },
      { id: 4, url: 'chrome://extensions' },
    ]);
    browser.permissions.contains.mockImplementation(async (permission: { origins: string[] }) => permission.origins.includes('https://granted.test/*'));
    startBackground(browser, { services, migrate: vi.fn(), reconcile: vi.fn(), cleanup: vi.fn() });
    expect(browser.scripting.executeScript).not.toHaveBeenCalled();

    installed.listeners.forEach((listener) => listener({ reason: 'update' }));
    await vi.waitFor(() => expect(browser.scripting.executeScript).toHaveBeenCalledWith({ target: { tabId: 1 }, files: ['content-scripts/content.js'] }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(browser.scripting.executeScript).toHaveBeenCalledTimes(1);
    expect(browser.permissions.request).not.toHaveBeenCalled();
  });

  it('refuses the floating chat on pages scripts cannot reach', async () => {
    const { browser, runtimeMessage } = createBrowser();
    const services = createServices();
    vi.mocked(browser.tabs.get).mockResolvedValue({ id: 7, url: 'chrome://settings' });
    startBackground(browser, { services, migrate: vi.fn(), reconcile: vi.fn(), cleanup: vi.fn() });

    const response = await runtimeMessage.listeners[0]!({ version: 1, requestId: 'float-x', type: 'OPEN_FLOATING_CHAT', tabId: 7 }, {});
    expect(response).toMatchObject({ ok: false, error: { code: 'PAGE_UNSUPPORTED' } });
    expect(services.floatingChats.markOpen).not.toHaveBeenCalled();
  });

  it('records closing and moving the floating chat from the page', async () => {
    const { browser, runtimeMessage } = createBrowser();
    const services = createServices();
    startBackground(browser, { services, migrate: vi.fn(), reconcile: vi.fn(), cleanup: vi.fn() });
    const sender = { tab: { id: 7, url: 'https://example.test/article' } };
    const layout = { x: 20, y: 30, width: 500, height: 600 };

    await runtimeMessage.listeners[0]!({ version: 1, requestId: 'fc-1', type: 'FLOATING_CHAT_LAYOUT_CHANGED', layout }, sender);
    expect(services.floatingChats.saveLayout).toHaveBeenCalledWith(layout);
    await runtimeMessage.listeners[0]!({ version: 1, requestId: 'fc-2', type: 'FLOATING_CHAT_CLOSED' }, sender);
    expect(services.floatingChats.markClosed).toHaveBeenCalledWith(7);
  });

  it('keeps every explicitly opened tab enabled without exposing the panel on untouched tabs', async () => {
    const { browser, actionClicked } = createBrowser();
    const services = createServices();
    const app = startBackground(browser, {
      services,
      migrate: vi.fn(),
      reconcile: vi.fn(),
      cleanup: vi.fn(),
    });
    await app.ready;

    // Untouched tabs inherit this disabled global default.
    expect(browser.sidePanel.setOptions).toHaveBeenCalledWith({ enabled: false });
    vi.mocked(browser.sidePanel.setOptions).mockClear();

    actionClicked.listeners[0]!({ id: 7, windowId: 10, url: 'https://example.test/a' });
    expect(browser.sidePanel.setOptions).toHaveBeenCalledWith({
      tabId: 7,
      enabled: true,
      path: 'sidepanel.html',
    });
    expect(browser.sidePanel.open).toHaveBeenCalledWith({ tabId: 7 });

    vi.mocked(browser.sidePanel.setOptions).mockClear();
    actionClicked.listeners[0]!({ id: 8, windowId: 10, url: 'https://example.test/b' });
    expect(browser.sidePanel.setOptions).toHaveBeenCalledWith({
      tabId: 8,
      enabled: true,
      path: 'sidepanel.html',
    });
    expect(browser.sidePanel.open).toHaveBeenCalledWith({ tabId: 8 });
    // Opening B must not disable A: both tabs retain independent panels.
    expect(browser.sidePanel.setOptions).not.toHaveBeenCalledWith({ tabId: 7, enabled: false });
  });

  it('keeps chat available when Chrome omits the active tab URL after a tab switch', async () => {
    const { browser, runtimeMessage } = createBrowser();
    const services = createServices();
    vi.mocked(browser.tabs.query).mockResolvedValue([{ id: 8 }]);
    startBackground(browser, { services, migrate: vi.fn(), reconcile: vi.fn(), cleanup: vi.fn() });

    const response = await runtimeMessage.listeners[0]!(
      { version: 1, requestId: 'state-without-url', type: 'GET_ACTIVE_TAB_STATE' },
      {},
    );

    expect(response).toMatchObject({ ok: true, data: { tabId: 8 } });
    expect(services.activeTabs.open).toHaveBeenCalledWith({
      tabId: 8,
      url: 'chrome-ai-tab://unavailable/8',
      navigationKey: 'chrome-ai-tab://unavailable/8#chrome-ai-navigation-0',
    });
  });

  it('handles content navigation events and chat ports without leaking thrown errors', async () => {
    const { browser, runtimeMessage, runtimeConnect } = createBrowser();
    const services = createServices();
    startBackground(browser, { services, migrate: vi.fn(), reconcile: vi.fn() });

    const policy = await runtimeMessage.listeners[0]!({
      version: 1,
      requestId: 'policy-1',
      type: 'REQUEST_PAGE_ACCESS_POLICY',
    }, { tab: { id: 7, url: 'https://example.test/spa' } });
    expect(policy).toMatchObject({ selectionActionEnabled: false, excluded: true });
    expect(services.pageAccess.getPagePolicy).toHaveBeenCalledWith(7, 'https://example.test/spa', { consumeOneTime: false });

    await runtimeMessage.listeners[0]!({
      version: 1,
      requestId: 'nav-1',
      type: 'PAGE_NAVIGATION_CHANGED',
      url: 'https://example.test/spa',
      navigationKey: 'spa-key-2',
    }, { tab: { id: 7, url: 'https://example.test/spa' } });
    expect(services.activeTabs.navigationChanged).toHaveBeenCalledWith(7, 'spa-key-2');

    await runtimeMessage.listeners[0]!({
      version: 1,
      requestId: 'selection-change-1',
      type: 'SELECTION_CHANGED',
      text: 'live',
    }, { tab: { id: 7, url: 'https://example.test/spa' } });
    expect(services.snapshots.syncSelection).toHaveBeenCalledWith(7, 'live');

    await runtimeMessage.listeners[0]!({
      version: 1,
      requestId: 'selection-1',
      type: 'SELECTION_ACTION_CLICKED',
      text: 'selected',
    }, { tab: { id: 7, url: 'https://example.test/spa' } });
    expect(services.activeTabs.open).toHaveBeenLastCalledWith(expect.objectContaining({
      tabId: 7,
      navigationKey: 'spa-key-2',
    }));

    await runtimeMessage.listeners[0]!({
      version: 1,
      requestId: 'state-after-spa',
      type: 'GET_ACTIVE_TAB_STATE',
    }, {});
    expect(services.activeTabs.open).toHaveBeenLastCalledWith(expect.objectContaining({
      tabId: 7,
      navigationKey: 'spa-key-2',
    }));

    const port: TestPort = {
      name: CHAT_STREAM_PORT_NAME,
      postMessage: vi.fn(),
      onMessage: event<(message: unknown) => void>(),
      onDisconnect: event<() => void>(),
    };
    runtimeConnect.listeners[0]!(port);
    await port.onMessage.listeners[0]!({
      version: 1,
      requestId: 'chat-1',
      type: 'START_CHAT',
      tabId: 7,
      conversationId: 'c1',
      text: '你好',
      contextSelection: { includePage: false, includeSelection: false },
    });
    expect(services.chat.start).toHaveBeenCalled();
    expect(port.postMessage).toHaveBeenCalledWith({ version: 1, type: 'completed', requestId: 'chat-1' });

    await port.onMessage.listeners[0]!({
      version: 1,
      requestId: 'chat-invalid',
      type: 'START_CHAT',
      tabId: 7,
      conversationId: 'c1',
      text: '',
      attachments: [],
      contextSelection: { includePage: false, includeSelection: false },
    });
    expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      version: 1,
      type: 'failed',
      requestId: 'chat-invalid',
      error: expect.objectContaining({ code: 'INVALID_MESSAGE' }),
    }));

    port.onDisconnect.listeners[0]!();
    expect(port.onMessage.listeners).toHaveLength(0);
  });

  it('routes history actions and safely replaces a deleted active conversation', async () => {
    const { browser, runtimeMessage } = createBrowser();
    const services = createServices();
    vi.mocked(services.bindings.get).mockResolvedValue({
      tabId: 7, conversationId: 'c1', pageUrl: 'https://example.test/article', navigationKey: 'nav-1', updatedAt: 1,
    });
    const replacement = {
      id: 'replacement', title: 'New', messages: [], model: 'm1', promptVersion: 'v1', pinned: false, createdAt: 3, updatedAt: 3,
    };
    vi.mocked(services.sessions.createNew).mockResolvedValue(replacement);
    vi.mocked(services.activeTabs.open).mockResolvedValue({
      tabId: 7, url: 'https://example.test/article', navigationKey: 'nav-1', conversation: replacement, context: { status: 'unavailable', reason: 'PAGE_UNSUPPORTED' },
    });
    startBackground(browser, { services, migrate: vi.fn(), reconcile: vi.fn(), cleanup: vi.fn() });
    const send = runtimeMessage.listeners[0]!;

    const history = await send({ version: 1, requestId: 'history-1', type: 'LIST_CONVERSATIONS' }, {});
    expect(history).toMatchObject({ ok: true, data: { retentionDays: 30, conversations: [{ id: 'c1' }] } });

    await send({ version: 1, requestId: 'open-1', type: 'OPEN_CONVERSATION', tabId: 7, conversationId: 'c1' }, {});
    expect(services.sessions.bindExisting).toHaveBeenCalledWith(7, 'c1', 'https://example.test/article', expect.any(String));

    const deleted = await send({ version: 1, requestId: 'delete-1', type: 'DELETE_CONVERSATION', tabId: 7, conversationId: 'c1' }, {});
    expect(services.conversations.delete).toHaveBeenCalledWith('c1');
    expect(services.bindings.removeConversation).toHaveBeenCalledWith('c1');
    expect(deleted).toMatchObject({ ok: true, data: { deleted: true, activeState: { conversation: { id: 'replacement' } } } });

    vi.mocked(services.bindings.get).mockResolvedValue({
      tabId: 7, conversationId: 'c1', pageUrl: 'https://example.test/article', navigationKey: 'nav-1', updatedAt: 1,
    });
    vi.mocked(services.retention.clearUnpinned).mockResolvedValue({ deletedIds: ['c1', 'ordinary'] });
    const cleared = await send({ version: 1, requestId: 'clear-1', type: 'CLEAR_CONVERSATIONS', tabId: 7 }, {});
    expect(services.retention.clearUnpinned).toHaveBeenCalled();
    expect(services.sessions.createNew).toHaveBeenCalledWith(7, 'https://example.test/article', expect.any(String));
    expect(cleared).toMatchObject({
      ok: true,
      data: { deletedIds: ['c1', 'ordinary'], activeState: { conversation: { id: 'replacement' } } },
    });
  });

  it('returns sanitized writing assistant preferences from the trusted background', async () => {
    const { browser, runtimeMessage } = createBrowser();
    const services = createServices();
    vi.mocked(services.storage.get)
      .mockResolvedValueOnce('zh-TW')
      .mockResolvedValueOnce('violet')
      .mockResolvedValueOnce(false);
    startBackground(browser, { services, migrate: vi.fn(), reconcile: vi.fn(), cleanup: vi.fn() });
    const send = runtimeMessage.listeners[0]!;

    const loaded = await send({
      version: 1,
      requestId: 'writing-preferences-valid',
      type: 'GET_WRITING_ASSISTANT_PREFERENCES',
    }, {});
    expect(loaded).toMatchObject({
      ok: true,
      data: {
        languagePreference: 'zh-TW',
        themePreference: 'violet',
        writingAssistantEnabled: false,
      },
    });

    vi.mocked(services.storage.get)
      .mockResolvedValueOnce('invalid-language')
      .mockResolvedValueOnce('invalid-theme')
      .mockResolvedValueOnce('invalid-enabled');
    const defaults = await send({
      version: 1,
      requestId: 'writing-preferences-defaults',
      type: 'GET_WRITING_ASSISTANT_PREFERENCES',
    }, {});
    expect(defaults).toMatchObject({
      ok: true,
      data: {
        languagePreference: 'auto',
        themePreference: 'blue',
        writingAssistantEnabled: true,
      },
    });
  });

  it('loads and saves the page context character limit', async () => {
    const { browser, runtimeMessage } = createBrowser();
    const services = createServices();
    startBackground(browser, { services, migrate: vi.fn(), reconcile: vi.fn(), cleanup: vi.fn() });
    const send = runtimeMessage.listeners[0]!;

    const loaded = await send({
      version: 1,
      requestId: 'context-limit-get',
      type: 'GET_CONTEXT_LIMIT',
    }, {});
    expect(loaded).toMatchObject({ ok: true, data: { documentCharacters: 40_000 } });

    const saved = await send({
      version: 1,
      requestId: 'context-limit-set',
      type: 'SET_CONTEXT_LIMIT',
      documentCharacters: 120_000,
    }, {});
    expect(services.preferences.save).toHaveBeenCalledWith(expect.objectContaining({
      documentContextCharacters: 120_000,
    }));
    expect(saved).toMatchObject({ ok: true, data: { documentCharacters: 120_000 } });
  });

  it('loads and saves the per-file attachment size limit', async () => {
    const { browser, runtimeMessage } = createBrowser();
    const services = createServices();
    startBackground(browser, { services, migrate: vi.fn(), reconcile: vi.fn(), cleanup: vi.fn() });
    const send = runtimeMessage.listeners[0]!;

    const loaded = await send({
      version: 1,
      requestId: 'attachment-limit-get',
      type: 'GET_ATTACHMENT_LIMIT',
    }, {});
    expect(loaded).toMatchObject({ ok: true, data: { attachmentMaxBytes: 5 * 1024 * 1024 } });

    const saved = await send({
      version: 1,
      requestId: 'attachment-limit-set',
      type: 'SET_ATTACHMENT_LIMIT',
      attachmentMaxBytes: 10 * 1024 * 1024,
    }, {});
    expect(services.preferences.save).toHaveBeenCalledWith(expect.objectContaining({
      attachmentMaxBytes: 10 * 1024 * 1024,
    }));
    expect(saved).toMatchObject({ ok: true, data: { attachmentMaxBytes: 10 * 1024 * 1024 } });
  });

  it('updates the model only for the conversation currently bound to the tab', async () => {
    const { browser, runtimeMessage } = createBrowser();
    const services = createServices();
    const updated = {
      id: 'c1', title: 'First', messages: [], model: 'm2', promptVersion: 'v1', pinned: false, createdAt: 1, updatedAt: 3,
    };
    vi.mocked(services.bindings.get).mockResolvedValue({
      tabId: 7, conversationId: 'c1', pageUrl: 'https://example.test/article', navigationKey: 'nav-1', updatedAt: 1,
    });
    vi.mocked(services.conversations.setModel).mockResolvedValue(updated);
    vi.mocked(services.providerConfigs.getActive).mockResolvedValue({
      id: 'p1', name: 'Gateway', type: 'openai-compatible', baseURL: 'https://gateway.example.test/v1', model: 'm1',
      endpointMode: 'chat-completions', defaultHeaders: {}, timeoutMs: 30_000, stream: true, createdAt: 1, updatedAt: 1,
    });
    vi.mocked(services.activeTabs.reopen).mockResolvedValue({
      tabId: 7,
      url: 'https://example.test/article',
      navigationKey: 'nav-1',
      conversation: updated,
      context: { status: 'unavailable', reason: 'PAGE_UNSUPPORTED' },
    });
    startBackground(browser, { services, migrate: vi.fn(), reconcile: vi.fn(), cleanup: vi.fn() });

    const response = await runtimeMessage.listeners[0]!({
      version: 1,
      requestId: 'model-1',
      type: 'SET_CONVERSATION_MODEL',
      tabId: 7,
      conversationId: 'c1',
      model: 'm2',
    }, {});

    expect(services.conversations.setModel).toHaveBeenCalledWith('c1', 'm2');
    expect(services.providerConfigs.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', model: 'm2' }));
    expect(services.activeTabs.reopen).toHaveBeenCalledWith(expect.objectContaining({ tabId: 7, navigationKey: expect.any(String) }));
    expect(services.activeTabs.open).not.toHaveBeenCalled();
    expect(response).toMatchObject({ ok: true, data: { conversation: { id: 'c1', model: 'm2' } } });
  });

  it('extracts a mentioned tab only after site access and returns a summary without page text', async () => {
    const { browser, runtimeMessage } = createBrowser();
    const services = createServices();
    vi.mocked(services.pageAccess.getPagePolicy).mockResolvedValue({
      supported: true, excluded: false, automatic: false, selectionActionEnabled: true, pageContextAllowed: true, canAllowOnce: false,
    });
    const extract = vi.fn(async ({ tabId, url, navigationKey }: { tabId: number; url: string; navigationKey: string }) => ({
      status: 'ready' as const,
      snapshot: {
        snapshotId: 'snap-9', tabId, title: 'Docs', url,
        document: { text: 'SECRET PAGE BODY', extractionMethod: 'readability' as const },
        metadata: { extractedAt: 1, originalCharacterCount: 16, submittedCharacterCount: 16, truncated: false, navigationKey },
      },
    }));
    Object.assign(services.activeTabs, { extract });
    startBackground(browser, { services, migrate: vi.fn(), reconcile: vi.fn(), cleanup: vi.fn() });

    vi.mocked(browser.permissions.contains).mockResolvedValueOnce(false);
    const denied = await runtimeMessage.listeners[0]!({ version: 1, requestId: 'tab-1', type: 'EXTRACT_TAB_CONTEXT', tabId: 9 }, {});
    expect(denied).toMatchObject({ ok: false, error: { code: 'PAGE_PERMISSION_REQUIRED' } });
    expect(extract).not.toHaveBeenCalled();

    const response = await runtimeMessage.listeners[0]!({ version: 1, requestId: 'tab-2', type: 'EXTRACT_TAB_CONTEXT', tabId: 9 }, {});
    expect(browser.permissions.contains).toHaveBeenLastCalledWith({ origins: ['https://example.test/*'] });
    expect(browser.scripting.executeScript).toHaveBeenCalledWith({ target: { tabId: 9 }, files: ['content-scripts/content.js'] });
    expect(response).toEqual({
      version: 1,
      requestId: 'tab-2',
      ok: true,
      data: { tabId: 9, snapshotId: 'snap-9', title: 'Docs', url: 'https://example.test/article', truncated: false },
    });
    expect(JSON.stringify(response)).not.toContain('SECRET PAGE BODY');
  });
});
