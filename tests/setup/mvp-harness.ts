import { openSidePanelFromUserGesture } from '../../core/background/start-background';
import { ActiveTabStateService } from '../../core/chat/active-tab-state-service';
import { ChatService } from '../../core/chat/chat-service';
import { ContextSnapshotService } from '../../core/chat/context-snapshot-service';
import { TabSessionService } from '../../core/chat/tab-session-service';
import { GatewayPermissionService } from '../../core/permissions/gateway-permission-service';
import { OpenAICompatibleAdapter } from '../../core/providers/openai-compatible-adapter';
import { ActiveStreamRegistry } from '../../core/streaming/active-stream-registry';
import type { StreamEvent } from '../../messaging/contracts';
import type { ProviderConfigDraft } from '../../shared/types/provider';
import { ConversationRepository } from '../../storage/conversation-repository';
import { ProviderConfigRepository } from '../../storage/provider-config-repository';
import { TabBindingRepository } from '../../storage/tab-binding-repository';
import { FakeStorageArea } from './fake-storage';
import { createFakeChrome } from './fake-chrome';
import {
  createFakeOpenAIClientFactory,
  type FakeGatewayResponse,
} from './fake-openai-gateway';

const DEFAULT_SUCCESS_CHUNKS = [
  { choices: [{ delta: { content: '默认回答' }, finish_reason: null }] },
  { choices: [{ delta: {}, finish_reason: 'stop' }] },
] as const;

interface HarnessOptions {
  gatewayResponses?: readonly FakeGatewayResponse[];
  permissionRequestGranted?: boolean;
  extractionError?: Error;
}

interface AskInput {
  requestId: string;
  tabId: number;
  conversationId: string;
  text: string;
  includePage?: boolean;
  includeSelection?: boolean;
}

export function createMvpHarness(options: HarnessOptions = {}) {
  const storage = new FakeStorageArea();
  let now = 100;
  let conversationSequence = 0;
  let messageSequence = 0;
  const providerConfigs = new ProviderConfigRepository(storage, () => ++now);
  const conversations = new ConversationRepository(storage);
  const bindings = new TabBindingRepository(storage);
  const snapshots = new ContextSnapshotService();
  const streams = new ActiveStreamRegistry();
  const chrome = createFakeChrome({ permissionRequestGranted: options.permissionRequestGranted });
  const gateway = createFakeOpenAIClientFactory(
    options.gatewayResponses ?? [{ chunks: DEFAULT_SUCCESS_CHUNKS }, { chunks: DEFAULT_SUCCESS_CHUNKS }],
  );
  const gatewayPermissions = new GatewayPermissionService(chrome.browser.permissions);
  const adapter = new OpenAICompatibleAdapter(providerConfigs, gateway.factory);
  const sessions = new TabSessionService(
    conversations,
    bindings,
    async () => {
      return { model: (await providerConfigs.getActive())?.model ?? '' };
    },
    { now: () => ++now, createId: () => `conversation-${++conversationSequence}` },
  );
  const activeTabs = new ActiveTabStateService(sessions, snapshots, async (tabId, url, navigationKey) => {
    if (options.extractionError) throw options.extractionError;
    return {
      snapshotId: `snapshot-${tabId}-${navigationKey}`,
      tabId,
      title: `页面 ${tabId}`,
      url,
      selection: { text: `初始选区 tab-${tabId}` },
      document: { text: `本地页面正文 tab-${tabId}`, extractionMethod: 'readability' as const },
      metadata: {
        extractedAt: ++now,
        originalCharacterCount: 20,
        submittedCharacterCount: 20,
        truncated: false,
        navigationKey,
      },
    };
  });
  const chat = new ChatService({
    conversations,
    snapshots,
    streams,
    getConfig: () => providerConfigs.getActive(),
    getSecret: (providerId) => providerConfigs.getSecretForBackground(providerId),
    hasGatewayPermission: (config) => chrome.browser.permissions.contains({
      origins: [`${new URL(config.baseURL).origin}/*`],
    }),
    getAdapter: () => adapter,
    createId: (prefix) => `${prefix}-${++messageSequence}`,
    now: () => ++now,
  });

  return {
    storage,
    chrome,
    gateway,
    providerConfigs,
    conversations,
    bindings,
    snapshots,
    gatewayPermissions,
    activeTabs,
    chat,
    async configure(config: ProviderConfigDraft, apiKey: string) {
      await providerConfigs.save(config, apiKey);
      return gatewayPermissions.requestForBaseUrl(config.baseURL);
    },
    async openPanel(tabId: number, url: string) {
      chrome.setActiveTab({ id: tabId, url });
      await openSidePanelFromUserGesture(chrome.browser, { id: tabId, url });
    },
    async openTab(tabId: number, url: string, navigationKey: string) {
      chrome.setActiveTab({ id: tabId, url });
      return activeTabs.open({ tabId, url, navigationKey });
    },
    async ask(input: AskInput): Promise<StreamEvent[]> {
      const events: StreamEvent[] = [];
      const snapshot = snapshots.current(input.tabId);
      await chat.start({
        requestId: input.requestId,
        tabId: input.tabId,
        conversationId: input.conversationId,
        text: input.text,
        contextSelection: {
          includePage: input.includePage ?? false,
          includeSelection: input.includeSelection ?? false,
          ...((input.includePage || input.includeSelection) && snapshot
            ? { snapshotId: snapshot.snapshotId }
            : {}),
        },
      }, (event) => { events.push(event); });
      return events;
    },
  };
}
