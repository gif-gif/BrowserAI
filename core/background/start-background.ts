import { AppError, serializeAppError } from '../../shared/errors/app-error';
import { createNavigationKey } from '../page-context/navigation-key';
import { runMigrations } from '../../storage/migrations';
import { reconcileStaleStreams } from '../streaming/stale-stream-reconciler';
import { createBackgroundRouter, type RuntimeCommandHandlers } from '../../messaging/background-router';
import { CHAT_STREAM_PORT_NAME } from '../../messaging/chat-port';
import { chatPortCommandSchema, contentEventSchema, type ContentEvent, type StreamEvent } from '../../messaging/contracts';
import type { StorageArea } from '../../storage/storage-area';
import type { ConversationRepository } from '../../storage/conversation-repository';
import { ALL_SITES_ORIGINS } from '../permissions/page-access-service';
import { createBackgroundServices, type BackgroundServices } from './create-services';
import { registerAlarms } from './register-alarms';
import { registerTabListeners } from './register-tab-listeners';
import type { BackgroundBrowserApi, BackgroundMessageSender, BackgroundPort, BackgroundTab } from './browser-api';
import { STORAGE_KEYS } from '../../shared/constants/storage-keys';
import {
  DEFAULT_LANGUAGE_PREFERENCE,
  isLanguagePreference,
} from '../../shared/i18n/language-preference';
import { DEFAULT_THEME, isThemeId } from '../../shared/theme/theme';
import { DEFAULT_APPEARANCE, isAppearancePreference } from '../../shared/theme/appearance';
import { resolveWritingAssistantEnabled } from '../../shared/writing-assistant/preference';
import type { TabContextSummary } from '../../shared/types/tab-mention';
import type { ExtractedPageContext } from '../../shared/types/context';
import { supportsFloatingChat } from '../../shared/types/floating-chat';

export type { BackgroundBrowserApi } from './browser-api';

interface StartBackgroundOptions {
  services?: BackgroundServices;
  migrate?: (storage: StorageArea) => Promise<void>;
  reconcile?: (conversations: ConversationRepository) => Promise<number>;
  cleanup?: () => Promise<void>;
}

export interface BackgroundApplication {
  services: BackgroundServices;
  ready: Promise<void>;
  dispose(): void;
}

function unavailableTabUrl(tabId: number): string {
  return `chrome-ai-tab://unavailable/${tabId}`;
}

function requireTab(tab: BackgroundTab | undefined): { id: number; url: string } {
  if (tab?.id === undefined) throw new AppError('INVALID_MESSAGE', '无法确定当前标签页');

  // Chrome can omit Tab.url after switching to a tab for which this extension
  // does not currently have activeTab or host access. Keep chat usable without
  // requesting the privacy-sensitive "tabs" permission; the synthetic URL is
  // deliberately unsupported by page-context extraction and is never fetched.
  return { id: tab.id, url: tab.url ?? tab.pendingUrl ?? unavailableTabUrl(tab.id) };
}

async function queryActiveTab(api: BackgroundBrowserApi): Promise<{ id: number; url: string }> {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  return requireTab(tab);
}

async function lookupTab(api: BackgroundBrowserApi, tabId: number): Promise<{ id: number; url: string }> {
  if (api.tabs.get) return requireTab(await api.tabs.get(tabId));
  const active = await queryActiveTab(api);
  if (active.id !== tabId) throw new AppError('INVALID_MESSAGE', '标签页不存在或不可访问');
  return active;
}

export function openSidePanelFromUserGesture(
  api: BackgroundBrowserApi,
  tab: BackgroundTab,
): Promise<void> {
  const { id: tabId } = requireTab(tab);
  // WXT adds side_panel.default_path to the manifest. Disable that window-wide
  // fallback so Chrome only exposes panels explicitly enabled for a tab.
  const disablingDefault = api.sidePanel.setOptions({ enabled: false });
  const configuring = api.sidePanel.setOptions({ tabId, enabled: true, path: 'sidepanel.html' });
  const injecting = api.scripting.executeScript({
    target: { tabId },
    files: ['content-scripts/content.js'],
  }).catch(() => undefined);
  // Keep this call in the original action/content-message event stack. Awaiting
  // setOptions first would lose the user gesture required by sidePanel.open().
  const opening = api.sidePanel.open({ tabId });
  return Promise.all([disablingDefault, configuring, injecting, opening]).then(() => undefined);
}

/** Injects the content script and asks it to draw the floating chat; records the tab as showing it. */
async function showFloatingChat(api: BackgroundBrowserApi, services: BackgroundServices, tab: { id: number; url: string }): Promise<void> {
  if (!supportsFloatingChat(tab.url)) throw new AppError('PAGE_UNSUPPORTED', '当前页面不支持浮动显示');
  try {
    await api.scripting.executeScript({ target: { tabId: tab.id }, files: ['content-scripts/content.js'] });
  } catch (error) {
    throw new AppError('PAGE_PERMISSION_REQUIRED', '需要允许访问当前网站后才能浮动显示', { cause: error });
  }
  // Recorded first: the floating page checks this as soon as its iframe loads.
  await services.floatingChats.markOpen(tab.id);
  try {
    await api.tabs.sendMessage(tab.id, {
      version: 1,
      requestId: globalThis.crypto?.randomUUID?.() ?? `floating-${Date.now()}`,
      type: 'SHOW_FLOATING_CHAT',
      layout: await services.floatingChats.getLayout(),
    });
  } catch (error) {
    await services.floatingChats.markClosed(tab.id);
    throw new AppError('PAGE_UNSUPPORTED', '无法在当前页面打开浮动聊天，请刷新页面后重试', { cause: error });
  }
}

async function hideFloatingChat(api: BackgroundBrowserApi, services: BackgroundServices, tabId: number): Promise<void> {
  if (!await services.floatingChats.markClosed(tabId)) return;
  await api.tabs.sendMessage(tabId, {
    version: 1,
    requestId: globalThis.crypto?.randomUUID?.() ?? `floating-${Date.now()}`,
    type: 'HIDE_FLOATING_CHAT',
  }).catch(() => undefined);
}

/**
 * A reload drops scripts injected through activeTab or the side panel. When the
 * extension already holds host access for the page (site grant, “@” mention
 * grant, or all-sites access whose dynamic registration Chrome lost), inject the
 * content script again so page features like the writing assistant launcher
 * appear without opening the side panel. Never requests a permission; the
 * content script ignores duplicate injections.
 *
 * With `includeActiveTab`, also try tabs without host access: Chrome keeps an
 * activeTab grant across same-origin reloads, which permissions.contains() does
 * not report, so only the injection itself can tell. It fails harmlessly once
 * the grant is gone.
 */
async function restorePageScript(
  api: BackgroundBrowserApi,
  tabId: number,
  url: string | undefined,
  { includeActiveTab = false } = {},
): Promise<void> {
  if (!url || !supportsFloatingChat(url)) return;
  if (!includeActiveTab && !await api.permissions.contains({ origins: [`${new URL(url).origin}/*`] })) return;
  await api.scripting.executeScript({ target: { tabId }, files: ['content-scripts/content.js'] });
}

/**
 * Chrome never injects content scripts into tabs that were already open when
 * the extension is installed, updated or reloaded, and the scripts it had
 * injected are orphaned. Re-inject into open tabs the extension can reach.
 * Without the "tabs" permission Chrome only reports URLs of tabs with host
 * access, so tabs without a URL are skipped.
 */
async function restoreOpenTabScripts(api: BackgroundBrowserApi): Promise<void> {
  const tabs = await api.tabs.query({});
  await Promise.all(tabs.map((tab) => tab.id === undefined
    ? undefined
    : restorePageScript(api, tab.id, tab.url).catch(() => undefined)));
}

/** After a reload the page lost the panel; draw it again if the site is still accessible. */
async function restoreFloatingChat(
  api: BackgroundBrowserApi,
  services: BackgroundServices,
  tabId: number,
  url: string | undefined,
): Promise<void> {
  if (!await services.floatingChats.isOpen(tabId)) return;
  const origin = url && supportsFloatingChat(url) ? `${new URL(url).origin}/*` : undefined;
  if (!origin || !await api.permissions.contains({ origins: [origin] })) {
    await services.floatingChats.markClosed(tabId);
    return;
  }
  await showFloatingChat(api, services, { id: tabId, url: url! })
    .catch(() => services.floatingChats.markClosed(tabId));
}

interface TabScopedSidePanelController {
  open(tab: BackgroundTab): Promise<void>;
  disableDefault(): Promise<void>;
}

function createTabScopedSidePanelController(
  api: BackgroundBrowserApi,
  services: BackgroundServices,
): TabScopedSidePanelController {
  return {
    open(tab) {
      // Enabling is tab-specific. Tabs where the user previously opened the
      // extension remain enabled, while untouched tabs inherit the disabled
      // default and therefore never show the panel automatically.
      const opening = openSidePanelFromUserGesture(api, tab);
      // The side panel and the in-page floating chat are never shown together.
      if (tab.id !== undefined) void hideFloatingChat(api, services, tab.id).catch(() => undefined);
      return opening;
    },
    disableDefault() {
      return api.sidePanel.setOptions({ enabled: false });
    },
  };
}

/**
 * Extracts another tab the user mentioned with “@”. Mentioned tabs are not
 * covered by activeTab, so the site's optional host permission is required.
 * Page text stays in the service worker; callers only receive a summary.
 */
async function extractMentionedTab(
  api: BackgroundBrowserApi,
  services: BackgroundServices,
  navigationKeyFor: (tab: { id: number; url: string }) => string,
  tabId: number,
): Promise<ExtractedPageContext> {
  const tab = await lookupTab(api, tabId);
  const policy = await services.pageAccess.getPagePolicy(tab.id, tab.url, { consumeOneTime: false });
  if (!policy.supported) throw new AppError('PAGE_UNSUPPORTED', '该标签页不支持读取');
  if (!policy.pageContextAllowed) throw new AppError('PAGE_PERMISSION_REQUIRED', '该网站已在自动访问中排除');
  if (!await api.permissions.contains({ origins: [`${new URL(tab.url).origin}/*`] })) {
    throw new AppError('PAGE_PERMISSION_REQUIRED', '需要授权访问该网站后才能读取此标签页');
  }
  await api.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content-scripts/content.js'],
  }).catch(() => undefined);
  const context = await services.activeTabs.extract({
    tabId: tab.id,
    url: tab.url,
    navigationKey: navigationKeyFor(tab),
  });
  if (context.status === 'ready') return context.snapshot;
  if (context.status === 'unavailable') {
    throw new AppError(context.reason, context.message ?? '无法读取该标签页内容');
  }
  throw new AppError('CONTEXT_STALE', '页面上下文尚未准备完成，请重试');
}

function createRuntimeHandlers(
  api: BackgroundBrowserApi,
  services: BackgroundServices,
  openSidePanel: (tab: BackgroundTab) => Promise<void>,
  navigationKeyFor: (tab: { id: number; url: string }) => string,
): RuntimeCommandHandlers {
  return {
    GET_ACTIVE_TAB_STATE: async () => {
      const tab = await queryActiveTab(api);
      return services.activeTabs.open({ tabId: tab.id, url: tab.url, navigationKey: navigationKeyFor(tab) });
    },
    GET_TAB_STATE: async (command) => {
      const tab = await lookupTab(api, command.tabId);
      return services.activeTabs.open({ tabId: tab.id, url: tab.url, navigationKey: navigationKeyFor(tab) });
    },
    LIST_CONVERSATIONS: async () => {
      await services.retention.cleanup();
      const preferences = await services.preferences.get();
      const conversations = await services.conversations.list();
      return {
        conversations: conversations.filter((conversation) => conversation.messages.length > 0),
        retentionDays: preferences.retentionDays,
      };
    },
    OPEN_CONVERSATION: async (command) => {
      const tab = await lookupTab(api, command.tabId);
      await services.sessions.bindExisting(tab.id, command.conversationId, tab.url, navigationKeyFor(tab));
      return services.activeTabs.open({ tabId: tab.id, url: tab.url, navigationKey: navigationKeyFor(tab) });
    },
    CREATE_CONVERSATION: async (command) => {
      const tab = await lookupTab(api, command.tabId);
      await services.sessions.createNew(tab.id, tab.url, navigationKeyFor(tab));
      return services.activeTabs.open({ tabId: tab.id, url: tab.url, navigationKey: navigationKeyFor(tab) });
    },
    SET_CONVERSATION_MODEL: async (command) => {
      const tab = await lookupTab(api, command.tabId);
      const binding = await services.bindings.get(tab.id);
      if (binding?.conversationId !== command.conversationId) {
        throw new AppError('INVALID_MESSAGE', '当前对话已发生变化，请重试');
      }
      const updated = await services.conversations.setModel(command.conversationId, command.model.trim());
      if (!updated) throw new AppError('INVALID_MESSAGE', '要更新的对话不存在');
      // Remember the choice as the Gateway default so new conversations start with it.
      const config = await services.providerConfigs.getActive();
      if (config && config.model !== updated.model) {
        await services.providerConfigs.save({ ...config, model: updated.model });
      }
      return services.activeTabs.reopen({ tabId: tab.id, url: tab.url, navigationKey: navigationKeyFor(tab) });
    },
    DELETE_CONVERSATION: async (command) => {
      const activeBinding = command.tabId === undefined ? undefined : await services.bindings.get(command.tabId);
      await services.conversations.delete(command.conversationId);
      await services.bindings.removeConversation(command.conversationId);

      if (command.tabId !== undefined && activeBinding?.conversationId === command.conversationId) {
        const tab = await lookupTab(api, command.tabId);
        await services.sessions.createNew(tab.id, tab.url, navigationKeyFor(tab));
        return {
          deleted: true,
          activeState: await services.activeTabs.open({
            tabId: tab.id,
            url: tab.url,
            navigationKey: navigationKeyFor(tab),
          }),
        };
      }

      return { deleted: true };
    },
    PIN_CONVERSATION: async (command) => {
      await services.conversations.setPinned(command.conversationId, command.pinned);
      return { pinned: command.pinned };
    },
    CLEAR_CONVERSATIONS: async (command) => {
      const activeBinding = command.tabId === undefined ? undefined : await services.bindings.get(command.tabId);
      const result = await services.retention.clearUnpinned();

      if (command.tabId !== undefined && activeBinding && result.deletedIds.includes(activeBinding.conversationId)) {
        const tab = await lookupTab(api, command.tabId);
        await services.sessions.createNew(tab.id, tab.url, navigationKeyFor(tab));
        return {
          ...result,
          activeState: await services.activeTabs.open({
            tabId: tab.id,
            url: tab.url,
            navigationKey: navigationKeyFor(tab),
          }),
        };
      }

      return result;
    },
    SET_RETENTION: (command) => services.retention.setRetention(command.retentionDays, {
      confirmed: command.confirmed,
    }),
    GET_CONTEXT_LIMIT: async () => {
      const preferences = await services.preferences.get();
      return { documentCharacters: preferences.documentContextCharacters };
    },
    SET_CONTEXT_LIMIT: async (command) => {
      const preferences = await services.preferences.get();
      const nextPreferences = {
        ...preferences,
        documentContextCharacters: command.documentCharacters,
      };
      await services.preferences.save(nextPreferences);
      return { documentCharacters: nextPreferences.documentContextCharacters };
    },
    GET_ATTACHMENT_LIMIT: async () => {
      const preferences = await services.preferences.get();
      return { attachmentMaxBytes: preferences.attachmentMaxBytes };
    },
    SET_ATTACHMENT_LIMIT: async (command) => {
      const preferences = await services.preferences.get();
      const nextPreferences = {
        ...preferences,
        attachmentMaxBytes: command.attachmentMaxBytes,
      };
      await services.preferences.save(nextPreferences);
      return { attachmentMaxBytes: nextPreferences.attachmentMaxBytes };
    },
    GET_PROVIDER_SETTINGS: async () => {
      const configs = await services.providerConfigs.list();
      return {
        providers: await Promise.all(configs.map(async (config) => ({
          config,
          hasApiKey: Boolean(await services.providerConfigs.getSecretForBackground(config.id)),
        }))),
      };
    },
    GET_WRITING_ASSISTANT_PREFERENCES: async () => {
      const [languagePreference, themePreference, writingAssistantEnabled, appearancePreference] = await Promise.all([
        services.storage.get<unknown>(STORAGE_KEYS.languagePreference),
        services.storage.get<unknown>(STORAGE_KEYS.themePreference),
        services.storage.get<unknown>(STORAGE_KEYS.writingAssistantEnabled),
        services.storage.get<unknown>(STORAGE_KEYS.appearancePreference),
      ]);
      return {
        languagePreference: isLanguagePreference(languagePreference)
          ? languagePreference
          : DEFAULT_LANGUAGE_PREFERENCE,
        themePreference: isThemeId(themePreference) ? themePreference : DEFAULT_THEME,
        appearancePreference: isAppearancePreference(appearancePreference) ? appearancePreference : DEFAULT_APPEARANCE,
        writingAssistantEnabled: resolveWritingAssistantEnabled(writingAssistantEnabled),
      };
    },
    SAVE_PROVIDER_CONFIG: async (command) => {
      const config = await services.providerConfigs.save(command.config, command.apiKey);
      return {
        config,
        hasApiKey: Boolean(await services.providerConfigs.getSecretForBackground(config.id)),
      };
    },
    REMOVE_PROVIDER_SECRET: async (command) => {
      await services.providerConfigs.removeSecret(command.providerId);
      return { removed: true };
    },
    LIST_PROVIDER_MODELS: (command) => services.providers.get(command.config.type)
      .listModels(command.config, command.apiKey)
      .then((models) => ({ models })),
    TEST_PROVIDER_DRAFT: (command) => services.providers.get(command.config.type)
      .testDraft(command.config, command.apiKey),
    TEST_PROVIDER_CONNECTION: async (command) => {
      const config = await services.providerConfigs.get(command.providerId);
      if (!config) throw new AppError('CONFIG_MISSING', '尚未配置 AI Gateway');
      return services.providers.get(config.type).testConnection(command.providerId);
    },
    AI_WRITING_ASSIST: (command) => services.writingAssistant.rewrite(command),
    ALLOW_PAGE_ACCESS_ONCE: async (command) => {
      const tab = await lookupTab(api, command.tabId);
      const allowed = await services.pageAccess.allowOnce(tab.id, tab.url);
      if (!allowed) throw new AppError('PAGE_UNSUPPORTED', '当前 Chrome 页面不支持扩展读取');
      return { allowed: true };
    },
    ANALYZE_PAGE_TECH_STACK: async (command) => {
      const tab = await lookupTab(api, command.tabId);
      const policy = await services.pageAccess.getPagePolicy(tab.id, tab.url, { consumeOneTime: false });
      if (!policy.supported || !policy.pageContextAllowed) {
        throw new AppError(
          !policy.supported ? 'PAGE_UNSUPPORTED' : 'PAGE_PERMISSION_REQUIRED',
          !policy.supported ? '当前 Chrome 页面不支持技术栈分析' : '需要允许当前页面访问后才能分析技术栈',
        );
      }
      await api.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content-scripts/content.js'],
      }).catch(() => undefined);
      try {
        return await services.analyzeTechStack(tab.id);
      } catch (error) {
        throw new AppError('CONTEXT_EXTRACTION_FAILED', '无法分析当前网页的技术栈', { cause: error });
      }
    },
    EXTRACT_PAGE_CONTEXT: async (command) => {
      const tab = await lookupTab(api, command.tabId);
      const state = await services.activeTabs.open({
        tabId: tab.id,
        url: tab.url,
        navigationKey: navigationKeyFor(tab),
      });
      if (state.context.status !== 'ready') {
        if (state.context.status === 'unavailable') {
          throw new AppError(
            state.context.reason,
            state.context.message ?? '无法提取当前页面内容',
          );
        }
        throw new AppError('CONTEXT_STALE', '页面上下文尚未准备完成，请重试');
      }
      return state.context.snapshot;
    },
    EXTRACT_TAB_CONTEXT: async (command) => {
      const snapshot = await extractMentionedTab(api, services, navigationKeyFor, command.tabId);
      return {
        tabId: snapshot.tabId,
        snapshotId: snapshot.snapshotId,
        title: snapshot.title,
        url: snapshot.url,
        truncated: snapshot.metadata.truncated,
      } satisfies TabContextSummary;
    },
    OPEN_FLOATING_CHAT: async (command) => {
      const tab = await lookupTab(api, command.tabId);
      await showFloatingChat(api, services, tab);
      return { open: true };
    },
    CLOSE_FLOATING_CHAT: async (command) => {
      await hideFloatingChat(api, services, command.tabId);
      return { open: false };
    },
    GET_FLOATING_CHAT_STATUS: async (command) => ({ open: await services.floatingChats.isOpen(command.tabId) }),
    // Not async: sidePanel.open() must stay in the click's message event, and it also hides the
    // floating chat.
    OPEN_SIDE_PANEL: (command) => openSidePanel({ id: command.tabId }).then(() => ({ open: true })),
    RETRY_PAGE_CONTEXT: async (command) => {
      const tab = await lookupTab(api, command.tabId);

      // Re-injecting repairs pages whose content-script context was lost after
      // an extension reload. The content script protects itself against
      // duplicate listeners when an active instance is already present.
      await api.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content-scripts/content.js'],
      }).catch(() => undefined);

      return services.activeTabs.open({
        tabId: tab.id,
        url: tab.url,
        navigationKey: navigationKeyFor(tab),
      });
    },
  };
}

function handleContentEvent(
  api: BackgroundBrowserApi,
  services: BackgroundServices,
  openSidePanel: (tab: BackgroundTab) => Promise<void>,
  event: ContentEvent,
  sender: BackgroundMessageSender,
  rememberNavigation: (tabId: number, navigationKey: string) => void,
  navigationKeyFor: (tab: { id: number; url: string }) => string,
): Promise<unknown> | unknown {
  const tabId = sender.tab?.id;
  if (tabId === undefined) throw new AppError('INVALID_MESSAGE', '页面事件缺少标签页来源');

  switch (event.type) {
    case 'REQUEST_PAGE_ACCESS_POLICY': {
      const tab = requireTab(sender.tab);
      return services.pageAccess.getPagePolicy(tabId, tab.url, { consumeOneTime: false });
    }
    case 'PAGE_NAVIGATION_CHANGED':
      rememberNavigation(tabId, event.navigationKey);
      services.activeTabs.navigationChanged(tabId, event.navigationKey);
      return { received: true };
    case 'SELECTION_CAPTURED':
      services.snapshots.attachSelection(tabId, event.text);
      return { received: true };
    case 'SELECTION_CHANGED':
      services.snapshots.syncSelection(tabId, event.text);
      return { received: true };
    case 'SELECTION_ACTION_CLICKED': {
      services.snapshots.attachSelection(tabId, event.text);
      const opening = openSidePanel(sender.tab ?? { id: tabId });
      const tab = requireTab(sender.tab);
      void services.activeTabs.open({
        tabId,
        url: tab.url,
        navigationKey: navigationKeyFor(tab),
      }).catch(() => undefined);
      return opening.then(() => ({ received: true }));
    }
    case 'FLOATING_CHAT_CLOSED':
      return services.floatingChats.markClosed(tabId).then(() => ({ received: true }));
    case 'FLOATING_CHAT_LAYOUT_CHANGED':
      return services.floatingChats.saveLayout(event.layout).then(() => ({ received: true }));
    case 'CONTEXT_EXTRACTION_FAILED':
      services.snapshots.invalidate(tabId, navigationKeyFor(requireTab(sender.tab)));
      return { received: true };
  }
}

function registerRuntimeMessages(
  api: BackgroundBrowserApi,
  services: BackgroundServices,
  openSidePanel: (tab: BackgroundTab) => Promise<void>,
  navigationKeyFor: (tab: { id: number; url: string }) => string,
  rememberNavigation: (tabId: number, navigationKey: string) => void,
): () => void {
  const router = createBackgroundRouter(createRuntimeHandlers(api, services, openSidePanel, navigationKeyFor));
  const onMessage = (message: unknown, sender: BackgroundMessageSender) => {
    const contentEvent = contentEventSchema.safeParse(message);
    if (contentEvent.success) {
      try {
        return handleContentEvent(api, services, openSidePanel, contentEvent.data, sender, rememberNavigation, navigationKeyFor);
      } catch (error) {
        return Promise.reject(error);
      }
    }
    return router(message);
  };
  api.runtime.onMessage.addListener(onMessage);
  return () => api.runtime.onMessage.removeListener(onMessage);
}

function registerChatPorts(api: BackgroundBrowserApi, services: BackgroundServices): () => void {
  const ports = new Set<{ port: BackgroundPort; onMessage: (message: unknown) => void; onDisconnect: () => void }>();
  const onConnect = (port: BackgroundPort) => {
    if (port.name !== CHAT_STREAM_PORT_NAME) return;
    let connected = true;
    const post = (event: StreamEvent) => {
      if (!connected) return;
      try { port.postMessage(event); } catch { connected = false; }
    };
    const onMessage = (message: unknown) => {
      const parsed = chatPortCommandSchema.safeParse(message);
      if (!parsed.success) {
        const candidate = message as { requestId?: unknown } | null;
        if (typeof candidate?.requestId === 'string' && candidate.requestId.length > 0) {
          post({
            version: 1,
            type: 'failed',
            requestId: candidate.requestId,
            error: serializeAppError(new AppError('INVALID_MESSAGE', '消息格式无效')),
          });
        }
        return;
      }
      const command = parsed.data;
      if (command.type === 'CANCEL_CHAT') {
        void services.chat.cancel(command.requestId).catch((error) => {
          post({ version: 1, type: 'failed', requestId: command.requestId, error: serializeAppError(error) });
        });
        return;
      }
      void services.chat.start(command, post).catch((error) => {
        post({ version: 1, type: 'failed', requestId: command.requestId, error: serializeAppError(error) });
      });
    };
    const registration: {
      port: BackgroundPort;
      onMessage: (message: unknown) => void;
      onDisconnect: () => void;
    } = { port, onMessage, onDisconnect: () => undefined };
    const onDisconnect = () => {
      connected = false;
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(onDisconnect);
      ports.delete(registration);
    };
    registration.onDisconnect = onDisconnect;
    ports.add(registration);
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
  };
  api.runtime.onConnect.addListener(onConnect);
  return () => {
    api.runtime.onConnect.removeListener(onConnect);
    for (const registration of ports) registration.onDisconnect();
  };
}

export function startBackground(
  api: BackgroundBrowserApi,
  options: StartBackgroundOptions = {},
): BackgroundApplication {
  const services = options.services ?? createBackgroundServices(api);
  const navigationKeys = new Map<number, string>();
  const sidePanels = createTabScopedSidePanelController(api, services);
  const navigationKeyFor = (tab: { id: number; url: string }) => navigationKeys.get(tab.id) ?? createNavigationKey(tab.url);
  const rememberNavigation = (tabId: number, navigationKey: string) => { navigationKeys.set(tabId, navigationKey); };
  const disposers: Array<() => void> = [];
  services.chat.setTabExtractor?.((tabId) => extractMentionedTab(api, services, navigationKeyFor, tabId));

  disposers.push(registerRuntimeMessages(api, services, (tab) => sidePanels.open(tab), navigationKeyFor, rememberNavigation));
  disposers.push(registerChatPorts(api, services));
  disposers.push(registerTabListeners(api.tabs, services.activeTabs, {
    navigationChanged: rememberNavigation,
    tabClosed: (tabId) => {
      navigationKeys.delete(tabId);
      void services.floatingChats.markClosed(tabId).catch(() => undefined);
    },
    afterTabClosed: () => services.retention.cleanup().then(() => undefined),
  }));

  const onTabUpdated = (tabId: number, change: { status?: string }, tab: BackgroundTab) => {
    if (change.status !== 'complete') return;
    const url = tab.url ?? tab.pendingUrl;
    void restorePageScript(api, tabId, url, { includeActiveTab: true }).catch(() => undefined);
    void restoreFloatingChat(api, services, tabId, url).catch(() => undefined);
  };
  api.tabs.onUpdated.addListener(onTabUpdated);
  disposers.push(() => api.tabs.onUpdated.removeListener(onTabUpdated));

  const onInstalled = () => {
    void restoreOpenTabScripts(api).catch(() => undefined);
  };
  api.runtime.onInstalled?.addListener(onInstalled);
  disposers.push(() => api.runtime.onInstalled?.removeListener(onInstalled));

  // All-sites access is granted from the side panel or settings page together
  // with the Gateway. Register the page script for every site and put it into
  // tabs that are already open, so new and existing pages get page features.
  const onPermissionsAdded = ({ origins = [] }: { origins?: string[] }) => {
    if (!ALL_SITES_ORIGINS.some((origin) => origins.includes(origin))) return;
    void services.pageAccess.enableAllSites()
      .then(({ granted }) => (granted ? restoreOpenTabScripts(api) : undefined))
      .catch(() => undefined);
  };
  const onPermissionsRemoved = ({ origins = [] }: { origins?: string[] }) => {
    if (!ALL_SITES_ORIGINS.some((origin) => origins.includes(origin))) return;
    void services.pageAccess.disableAllSites().catch(() => undefined);
  };
  api.permissions.onAdded?.addListener(onPermissionsAdded);
  api.permissions.onRemoved?.addListener(onPermissionsRemoved);
  disposers.push(() => {
    api.permissions.onAdded?.removeListener(onPermissionsAdded);
    api.permissions.onRemoved?.removeListener(onPermissionsRemoved);
  });

  const onActionClicked = (tab: BackgroundTab) => {
    void sidePanels.open(tab).catch(() => undefined);
  };
  api.action.onClicked.addListener(onActionClicked);
  disposers.push(() => api.action.onClicked.removeListener(onActionClicked));

  // Context-menu entry points are temporarily disabled. Clear registrations
  // left by an earlier extension version so “问问 AI” disappears immediately
  // after an update, while keeping the implementation available for later use.
  const clearContextMenus = Promise.resolve(api.contextMenus.removeAll()).catch(() => undefined);

  const cleanup = options.cleanup ?? (() => services.retention.cleanup().then(() => undefined));
  const alarms = registerAlarms(api.alarms, cleanup);
  disposers.push(alarms.dispose);

  const initializeStorage = async () => {
    await api.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    await (options.migrate ?? runMigrations)(services.storage);
    await (options.reconcile ?? reconcileStaleStreams)(services.conversations);
    await cleanup();
  };
  const ready = Promise.all([
    initializeStorage(),
    clearContextMenus,
    sidePanels.disableDefault(),
    services.pageAccess.restoreAllSites().catch(() => undefined),
    alarms.ready,
  ]).then(() => undefined);

  return {
    services,
    ready,
    dispose() { for (const dispose of disposers.splice(0)) dispose(); },
  };
}
