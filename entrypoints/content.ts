import { defineContentScript } from 'wxt/utils/define-content-script';
import { extractPageContext } from '../core/page-context/extract-page';
import { analyzePageTechStack } from '../core/page-context/analyze-tech-stack';
import { DomPageController } from '../core/page-actions/dom-page-controller';
import { SelectionSync } from '../core/selection/selection-sync';
import { selectScreenshotRegion } from '../core/screenshot/region-selector';
import { TextareaWritingAssistant } from '../core/writing-assistant/textarea-writing-assistant';
import { observeSpaNavigation } from '../core/navigation/spa-navigation-observer';
import { InPageFloatingChat } from '../core/floating-chat/in-page-floating-chat';
import { FLOATING_CHAT_PAGE, type FloatingChatLayout } from '../shared/types/floating-chat';
import { contentCommandSchema, type ContentCommand, type ContentEvent } from '../messaging/contracts';
import { RuntimeClient } from '../messaging/runtime-client';
import { STORAGE_KEYS } from '../shared/constants/storage-keys';
import { AppError } from '../shared/errors/app-error';
import {
  DEFAULT_LANGUAGE_PREFERENCE,
  isLanguagePreference,
  resolveLanguagePreference,
  type LanguagePreference,
} from '../shared/i18n/language-preference';
import { detectLocale, getMessages, localizeError } from '../shared/i18n/locale';
import {
  DEFAULT_THEME,
  getTheme,
  isThemeId,
  type ThemeId,
} from '../shared/theme/theme';
import {
  DARK_SCHEME_QUERY,
  DEFAULT_APPEARANCE,
  isAppearancePreference,
  prefersDarkScheme,
  resolveAppearance,
  type AppearancePreference,
} from '../shared/theme/appearance';
import type { ProviderConfig } from '../shared/types/provider';
import type { ScreenshotSelectionLabels, ScreenshotSelectionResult } from '../shared/types/screenshot';
import { resolveWritingAssistantEnabled } from '../shared/writing-assistant/preference';

const CONTENT_SCRIPT_INSTANCE = '__chromeAiContentScriptInstanceV1';

export async function refreshSelectionActionPolicy(
  requestPolicy: (event: ContentEvent) => Promise<unknown>,
  setEnabled: (enabled: boolean) => void,
  createRequestId: () => string = () => globalThis.crypto?.randomUUID?.() ?? `policy-${Date.now()}`,
): Promise<void> {
  try {
    const policy = await requestPolicy({
      version: 1,
      requestId: createRequestId(),
      type: 'REQUEST_PAGE_ACCESS_POLICY',
    });
    const enabled = (policy as { selectionActionEnabled?: unknown } | undefined)?.selectionActionEnabled;
    setEnabled(enabled === true);
  } catch {
    setEnabled(false);
  }
}


type ContentScriptScope = Record<string, unknown>;

export function resolveWritingLocale(
  preference: unknown,
  browserLanguage?: string | null,
) {
  return resolveLanguagePreference(
    isLanguagePreference(preference) ? preference : DEFAULT_LANGUAGE_PREFERENCE,
    browserLanguage,
  );
}

export interface WritingAssistantPreferences {
  languagePreference: LanguagePreference;
  themePreference: ThemeId;
  appearancePreference: AppearancePreference;
  writingAssistantEnabled: boolean;
}

export function resolveWritingAssistantPreferences(value: unknown): WritingAssistantPreferences {
  const candidate = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
  return {
    languagePreference: isLanguagePreference(candidate.languagePreference)
      ? candidate.languagePreference
      : DEFAULT_LANGUAGE_PREFERENCE,
    themePreference: isThemeId(candidate.themePreference) ? candidate.themePreference : DEFAULT_THEME,
    appearancePreference: isAppearancePreference(candidate.appearancePreference)
      ? candidate.appearancePreference
      : DEFAULT_APPEARANCE,
    writingAssistantEnabled: resolveWritingAssistantEnabled(candidate.writingAssistantEnabled),
  };
}

export function claimContentScriptInstance(scope: ContentScriptScope): boolean {
  if (scope[CONTENT_SCRIPT_INSTANCE]) return false;
  scope[CONTENT_SCRIPT_INSTANCE] = true;
  return true;
}

export function releaseContentScriptInstance(scope: ContentScriptScope): void {
  delete scope[CONTENT_SCRIPT_INSTANCE];
}

interface ContentCommandHandlerOptions {
  document: Document;
  tabId: number;
  selectionText?: () => string;
  createSnapshotId?: () => string;
  navigationKey?: () => string;
  setSelectionButtonEnabled?: (enabled: boolean) => void;
  domPageController?: DomPageController;
  selectScreenshotRegion?: (labels: ScreenshotSelectionLabels) => Promise<ScreenshotSelectionResult>;
  floatingChat?: { show(layout: FloatingChatLayout): void; hide(): void };
}

export function createContentCommandHandler(options: ContentCommandHandlerOptions) {
  const domPageController = options.domPageController ?? new DomPageController(options.document);
  return async (input: ContentCommand | unknown): Promise<unknown> => {
    const parsed = contentCommandSchema.safeParse(input);
    if (!parsed.success) throw new AppError('INVALID_MESSAGE', 'Content Script 消息格式无效');
    const command = parsed.data;
    if (command.type === 'SET_SELECTION_BUTTON_ENABLED') {
      options.setSelectionButtonEnabled?.(command.enabled);
      return { enabled: command.enabled };
    }
    if (command.type === 'ANALYZE_TECH_STACK') {
      return analyzePageTechStack(options.document);
    }
    if (command.type === 'GET_DOM_SNAPSHOT') {
      return domPageController.snapshot(command.maxElements);
    }
    if (command.type === 'START_SCREENSHOT_SELECTION') {
      const selectRegion = options.selectScreenshotRegion ?? ((labels: ScreenshotSelectionLabels) => {
        const view = options.document.defaultView;
        if (!view) throw new AppError('PAGE_UNSUPPORTED', '当前页面不支持自由截图');
        return selectScreenshotRegion(options.document, view, labels);
      });
      return selectRegion({ instruction: command.instruction, cancelHint: command.cancelHint });
    }
    if (command.type === 'SHOW_FLOATING_CHAT' || command.type === 'HIDE_FLOATING_CHAT') {
      if (!options.floatingChat) throw new AppError('PAGE_UNSUPPORTED', '当前页面不支持浮动显示');
      if (command.type === 'SHOW_FLOATING_CHAT') options.floatingChat.show(command.layout);
      else options.floatingChat.hide();
      return { visible: command.type === 'SHOW_FLOATING_CHAT' };
    }
    if (command.type === 'EXECUTE_DOM_ACTIONS') {
      return domPageController.execute(command.actions);
    }
    return extractPageContext({
      document: options.document,
      tabId: options.tabId,
      limits: command.limits,
      selectionText: options.selectionText?.(),
      navigationKey: options.navigationKey?.(),
      createSnapshotId: options.createSnapshotId,
    });
  };
}

export default defineContentScript({
  registration: 'runtime',
  runAt: 'document_idle',
  noScriptStartedPostMessage: true,
  main(ctx) {
    const scope = globalThis as unknown as ContentScriptScope;
    if (!claimContentScriptInstance(scope)) return;

    const runtime = new RuntimeClient(browser.runtime);
    const browserLanguage = () => browser.i18n?.getUILanguage?.() ?? navigator.language;
    let writingLocale = detectLocale();
    let writingMessages = getMessages(writingLocale);
    const loadWritingAssistantPreferences = async () => resolveWritingAssistantPreferences(
      await runtime.send<unknown>({
        version: 1,
        requestId: globalThis.crypto?.randomUUID?.() ?? `writing-preferences-${Date.now()}`,
        type: 'GET_WRITING_ASSISTANT_PREFERENCES',
      }),
    );
    let languageRefreshRevision = 0;
    const applyWritingLanguage = (preference: LanguagePreference) => {
      writingLocale = resolveWritingLocale(preference, browserLanguage());
      writingMessages = getMessages(writingLocale);
      writingAssistant.setMessages(writingMessages);
      floatingChat.setMessages(writingMessages);
    };
    const refreshWritingLanguage = async () => {
      const revision = ++languageRefreshRevision;
      const preferences = await loadWritingAssistantPreferences();
      if (revision === languageRefreshRevision) applyWritingLanguage(preferences.languagePreference);
      return writingMessages;
    };

    const floatingChat = new InPageFloatingChat({
      document,
      window,
      messages: writingMessages,
      onClose: () => {
        void browser.runtime.sendMessage({
          version: 1, requestId: crypto.randomUUID(), type: 'FLOATING_CHAT_CLOSED',
        } satisfies ContentEvent).catch(() => undefined);
      },
      onLayoutChange: (layout) => {
        void browser.runtime.sendMessage({
          version: 1, requestId: crypto.randomUUID(), type: 'FLOATING_CHAT_LAYOUT_CHANGED', layout,
        } satisfies ContentEvent).catch(() => undefined);
      },
    });
    const writingAssistant = new TextareaWritingAssistant({
      document,
      window,
      messages: writingMessages,
      loadMessages: refreshWritingLanguage,
      loadModels: async () => {
        const settings = await runtime.send<{
          providers?: Array<{ config?: ProviderConfig; hasApiKey?: boolean }>;
        }>({
          version: 1,
          requestId: globalThis.crypto?.randomUUID?.() ?? `writing-models-${Date.now()}`,
          type: 'GET_PROVIDER_SETTINGS',
        });
        const config = settings.providers?.find((provider) => provider.hasApiKey && provider.config?.id)?.config;
        if (!config) return { model: '', models: [] };

        try {
          const result = await runtime.send<{ models?: string[] }>({
            version: 1,
            requestId: globalThis.crypto?.randomUUID?.() ?? `writing-model-list-${Date.now()}`,
            type: 'LIST_PROVIDER_MODELS',
            config: {
              id: config.id,
              name: config.name,
              type: config.type,
              baseURL: config.baseURL,
              model: config.model,
              endpointMode: config.endpointMode,
              defaultHeaders: config.defaultHeaders,
              ...(config.temperature === undefined ? {} : { temperature: config.temperature }),
              ...(config.maxOutputTokens === undefined ? {} : { maxOutputTokens: config.maxOutputTokens }),
              timeoutMs: config.timeoutMs,
              stream: config.stream,
            },
          });
          return { model: config.model, models: result.models ?? [] };
        } catch {
          return { model: config.model, models: [config.model] };
        }
      },
      requestRewrite: async (request) => {
        try {
          // Read the shared preference immediately before every request so the
          // model output language always matches Settings and Chat, even if a
          // storage event raced with opening the page assistant.
          await refreshWritingLanguage();
          return await runtime.send({
            version: 1,
            type: 'AI_WRITING_ASSIST',
            locale: writingLocale,
            ...request,
          });
        } catch (error) {
          if (error instanceof AppError) {
            throw new Error(localizeError(error, writingMessages), { cause: error });
          }
          throw error;
        }
      },
    });
    let themeRefreshRevision = 0;
    let writingAssistantRefreshRevision = 0;
    let writingTheme: ThemeId = DEFAULT_THEME;
    let writingAppearance: AppearancePreference = DEFAULT_APPEARANCE;
    const applyWritingTheme = (preference: ThemeId = writingTheme, appearance: AppearancePreference = writingAppearance) => {
      writingTheme = preference;
      writingAppearance = appearance;
      const resolved = resolveAppearance(appearance, prefersDarkScheme(window));
      writingAssistant.setAppearance(resolved);
      floatingChat.setDark(resolved === 'dark');
      writingAssistant.setTheme(getTheme(preference));
    };
    const colorScheme = window.matchMedia?.(DARK_SCHEME_QUERY);
    const onColorSchemeChanged = () => applyWritingTheme();
    const applyWritingAssistantEnabled = (value: unknown) => {
      writingAssistant.setEnabled(resolveWritingAssistantEnabled(value));
    };
    const refreshWritingTheme = async () => {
      const revision = ++themeRefreshRevision;
      const preferences = await loadWritingAssistantPreferences();
      if (revision !== themeRefreshRevision) return;
      applyWritingTheme(preferences.themePreference, preferences.appearancePreference);
    };
    const refreshWritingAssistantEnabled = async () => {
      const revision = ++writingAssistantRefreshRevision;
      const preferences = await loadWritingAssistantPreferences();
      if (revision !== writingAssistantRefreshRevision) return;
      applyWritingAssistantEnabled(preferences.writingAssistantEnabled);
    };
    const onStorageChanged = (
      changes: Record<string, { newValue?: unknown }>,
      areaName: string,
    ) => {
      if (areaName !== 'local') return;
      const languageChange = changes[STORAGE_KEYS.languagePreference];
      if (languageChange) {
        languageRefreshRevision += 1;
        applyWritingLanguage(
          isLanguagePreference(languageChange.newValue)
            ? languageChange.newValue
            : DEFAULT_LANGUAGE_PREFERENCE,
        );
      }
      const themeChange = changes[STORAGE_KEYS.themePreference];
      const appearanceChange = changes[STORAGE_KEYS.appearancePreference];
      if (themeChange || appearanceChange) {
        themeRefreshRevision += 1;
        applyWritingTheme(
          themeChange ? (isThemeId(themeChange.newValue) ? themeChange.newValue : DEFAULT_THEME) : writingTheme,
          appearanceChange
            ? (isAppearancePreference(appearanceChange.newValue) ? appearanceChange.newValue : DEFAULT_APPEARANCE)
            : writingAppearance,
        );
      }
      const writingAssistantChange = changes[STORAGE_KEYS.writingAssistantEnabled];
      if (writingAssistantChange) {
        writingAssistantRefreshRevision += 1;
        applyWritingAssistantEnabled(writingAssistantChange.newValue);
      }
      if (
        changes[STORAGE_KEYS.providerConfigs]
        || Object.keys(changes).some((key) => key.startsWith(STORAGE_KEYS.providerSecretsPrefix))
      ) {
        writingAssistant.reloadModels();
      }
    };
    const sendEvent = (event: ContentEvent) => browser.runtime.sendMessage(event).then(() => undefined).catch(() => undefined);
    const floatingChatShell = floatingChat;
    const floatingChatControl = {
      show(layout: FloatingChatLayout) {
        floatingChatShell.show(browser.runtime.getURL(FLOATING_CHAT_PAGE), layout);
        applyWritingTheme();
      },
      hide() { floatingChatShell.hide(); },
    };
    let navigationKey = `${location.href}#chrome-ai-navigation-0`;
    const stopNavigation = observeSpaNavigation(window, (change) => {
      navigationKey = change.navigationKey;
      void sendEvent({ version: 1, requestId: crypto.randomUUID(), type: 'PAGE_NAVIGATION_CHANGED', ...change });
    });
    const selectionSync = new SelectionSync({ document, window, sendEvent });
    selectionSync.start();
    const handler = createContentCommandHandler({
      document,
      tabId: 0,
      domPageController: new DomPageController(document),
      selectionText: () => window.getSelection()?.toString() ?? '',
      navigationKey: () => navigationKey,
      floatingChat: floatingChatControl,
    });
    const onMessage = async (message: unknown) => {
      try {
        return await handler(message);
      } catch (error) {
        const messageText = error instanceof Error ? error.message : '页面上下文提取失败';
        await sendEvent({
          version: 1,
          requestId: crypto.randomUUID(),
          type: 'CONTEXT_EXTRACTION_FAILED',
          message: messageText,
        });
        throw error;
      }
    };
    browser.runtime.onMessage.addListener(onMessage);
    // The selected-text "Ask AI" bubble is intentionally dormant for now.
    // Keep the launcher hidden until its saved preference has loaded so disabled
    // users never see a brief icon flash during content-script startup.
    writingAssistant.setEnabled(false);
    writingAssistant.start();
    void refreshWritingLanguage().catch(() => undefined);
    void refreshWritingTheme().catch(() => undefined);
    void refreshWritingAssistantEnabled().catch(() => writingAssistant.setEnabled(true));
    browser.storage.onChanged.addListener(onStorageChanged);
    colorScheme?.addEventListener?.('change', onColorSchemeChanged);
    ctx.onInvalidated(() => {
      colorScheme?.removeEventListener?.('change', onColorSchemeChanged);
      browser.runtime.onMessage.removeListener(onMessage);
      browser.storage.onChanged.removeListener(onStorageChanged);
      writingAssistant.stop();
      floatingChat.hide();
      selectionSync.stop();
      stopNavigation();
      releaseContentScriptInstance(scope);
    });
  },
});
