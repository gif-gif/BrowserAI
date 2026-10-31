import { ActiveTabStateService } from '../chat/active-tab-state-service';
import { ChatService } from '../chat/chat-service';
import { ContextSnapshotService } from '../chat/context-snapshot-service';
import { TabSessionService } from '../chat/tab-session-service';
import { analyzeGatewayBaseUrl } from '../permissions/gateway-origin';
import { PageAccessService } from '../permissions/page-access-service';
import { AnthropicMessagesAdapter } from '../providers/anthropic-messages-adapter';
import { OpenAICompatibleAdapter } from '../providers/openai-compatible-adapter';
import { ProviderRegistry } from '../providers/provider-registry';
import { ActiveStreamRegistry } from '../streaming/active-stream-registry';
import { WritingAssistantService } from '../writing-assistant/writing-assistant-service';
import { ContentClient } from '../../messaging/content-client';
import { DEFAULT_CONTEXT_LIMITS } from '../../shared/constants/context-limits';
import type { ExtractedPageContext } from '../../shared/types/context';
import type { DomActionBatchResult, DomSnapshot } from '../../shared/types/dom-actions';
import type { PageTechStackEvidence } from '../../shared/types/tech-stack';
import { ConversationRepository } from '../../storage/conversation-repository';
import { PreferencesRepository } from '../../storage/preferences-repository';
import { ProviderConfigRepository } from '../../storage/provider-config-repository';
import { RetentionService } from '../../storage/retention-service';
import { ChromeLocalStorageArea, ChromeSessionStorageArea } from '../../storage/storage-area';
import { FloatingChatRepository } from '../../storage/floating-chat-repository';
import { TabBindingRepository } from '../../storage/tab-binding-repository';
import type { BackgroundBrowserApi } from './browser-api';

export interface BackgroundServices {
  storage: ChromeLocalStorageArea;
  providerConfigs: ProviderConfigRepository;
  conversations: ConversationRepository;
  preferences: PreferencesRepository;
  bindings: TabBindingRepository;
  retention: RetentionService;
  pageAccess: PageAccessService;
  snapshots: ContextSnapshotService;
  sessions: TabSessionService;
  activeTabs: ActiveTabStateService;
  providers: ProviderRegistry;
  chat: ChatService;
  writingAssistant: WritingAssistantService;
  floatingChats: FloatingChatRepository;
  extractPage(tabId: number, url: string, navigationKey: string): Promise<ExtractedPageContext>;
  analyzeTechStack(tabId: number): Promise<PageTechStackEvidence>;
}

export function createBackgroundServices(api: BackgroundBrowserApi): BackgroundServices {
  const storage = new ChromeLocalStorageArea();
  const providerConfigs = new ProviderConfigRepository(storage);
  const conversations = new ConversationRepository(storage);
  const preferences = new PreferencesRepository(storage);
  const bindings = new TabBindingRepository(storage);
  const floatingChats = new FloatingChatRepository(new ChromeSessionStorageArea(), storage);
  const retention = new RetentionService(conversations, preferences, bindings);
  const pageAccess = new PageAccessService(api.permissions, api.scripting, preferences);
  const content = new ContentClient(api.tabs);
  const snapshots = new ContextSnapshotService();
  const providers = new ProviderRegistry([
    new OpenAICompatibleAdapter(providerConfigs),
    new AnthropicMessagesAdapter(providerConfigs),
  ]);
  const streams = new ActiveStreamRegistry();
  const getProviderDefaults = async () => {
    const config = (await providerConfigs.list())[0];
    return { providerId: config?.id ?? '', model: config?.model ?? '' };
  };
  const sessions = new TabSessionService(conversations, bindings, getProviderDefaults);
  const extractPage = async (tabId: number) => {
    const currentPreferences = await preferences.get();
    const extracted = await content.send<ExtractedPageContext>(tabId, {
      version: 1,
      requestId: globalThis.crypto?.randomUUID?.() ?? `context-${Date.now()}`,
      type: 'EXTRACT_CONTEXT',
      limits: {
        ...DEFAULT_CONTEXT_LIMITS,
        documentCharacters: currentPreferences.documentContextCharacters,
      },
    });
    return { ...extracted, tabId };
  };
  const analyzeTechStack = (tabId: number) => content.send<PageTechStackEvidence>(tabId, {
    version: 1,
    requestId: globalThis.crypto?.randomUUID?.() ?? `tech-stack-${Date.now()}`,
    type: 'ANALYZE_TECH_STACK',
  });
  const activeTabs = new ActiveTabStateService(sessions, snapshots, extractPage, {
    getPageAccess: (tabId, url) => pageAccess.getPagePolicy(tabId, url),
  });
  const chat = new ChatService({
    conversations,
    snapshots,
    streams,
    getConfig: (providerId) => providerConfigs.get(providerId),
    getDefaultConfig: async () => (await providerConfigs.list())[0],
    getSecret: (providerId) => providerConfigs.getSecretForBackground(providerId),
    hasGatewayPermission: async (config) => api.permissions.contains({
      origins: [analyzeGatewayBaseUrl(config.baseURL).originPattern],
    }),
    getAdapter: (config) => providers.get(config.type),
    pageActions: {
      snapshot: (tabId) => content.send<DomSnapshot>(tabId, {
        version: 1,
        requestId: globalThis.crypto?.randomUUID?.() ?? `dom-snapshot-${Date.now()}`,
        type: 'GET_DOM_SNAPSHOT',
        maxElements: 120,
      }),
      execute: (tabId, actions) => content.send<DomActionBatchResult>(tabId, {
        version: 1,
        requestId: globalThis.crypto?.randomUUID?.() ?? `dom-actions-${Date.now()}`,
        type: 'EXECUTE_DOM_ACTIONS',
        actions,
      }),
    },
  });
  const writingAssistant = new WritingAssistantService({
    listConfigs: () => providerConfigs.list(),
    hasGatewayPermission: async (config) => api.permissions.contains({
      origins: [analyzeGatewayBaseUrl(config.baseURL).originPattern],
    }),
    getAdapter: (config) => providers.get(config.type),
  });

  return {
    storage,
    providerConfigs,
    conversations,
    preferences,
    bindings,
    retention,
    pageAccess,
    snapshots,
    sessions,
    activeTabs,
    providers,
    chat,
    writingAssistant,
    floatingChats,
    extractPage,
    analyzeTechStack,
  };
}
