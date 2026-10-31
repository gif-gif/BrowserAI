import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageList } from '../../components/chat/MessageList';
import { ChatComposer, type TabMentionOptions } from '../../components/composer/ChatComposer';
import { QuickActions, resolveShortcutButtons, type QuickAction } from '../../components/composer/QuickActions';
import { ContextChipList } from '../../components/context/ContextChipList';
import { HistoryDrawer } from '../../components/history/HistoryDrawer';
import { PanelHeader } from '../../components/layout/PanelHeader';
import { CHAT_STREAM_PORT_NAME } from '../../messaging/chat-port';
import { contentEventSchema, type RuntimeCommand } from '../../messaging/contracts';
import { RuntimeClient } from '../../messaging/runtime-client';
import { AppError, normalizeError } from '../../shared/errors/app-error';
import { analyzeGatewayBaseUrl } from '../../core/permissions/gateway-origin';
import { pickDefaultModel } from '../../core/settings/default-model';
import { QuickSetupCard, type QuickSetupValues } from '../../components/setup/QuickSetupCard';
import { PROVIDER_ENDPOINT_MODES, type ProviderConfigDraft } from '../../shared/types/provider';
import {
  BYTES_PER_MEGABYTE,
  DEFAULT_ATTACHMENT_MAX_BYTES,
  MAX_CHAT_ATTACHMENTS,
  MAX_DOCUMENT_ATTACHMENTS_TOTAL_CHARACTERS,
} from '../../shared/constants/attachment-limits';
import { useI18n } from '../../shared/i18n/I18nProvider';
import { localizeError } from '../../shared/i18n/locale';
import {
  IMAGE_ATTACHMENT_MIME_TYPES,
  isDocumentAttachment,
  type ChatAttachment,
  type ChatMessage,
} from '../../shared/types/chat';
import type { ExtractedPageContext } from '../../shared/types/context';
import type {
  ScreenshotCaptureMode,
  ScreenshotSelectionLabels,
  ScreenshotSelectionResult,
} from '../../shared/types/screenshot';
import type { PageTechStackEvidence } from '../../shared/types/tech-stack';
import type { Skill, SkillInvocation } from '../../shared/types/skill';
import type { ActiveTabState, PageContextState } from '../../shared/types/tab-state';
import { useActiveTabState, type TabActivitySource } from './hooks/useActiveTabState';
import { useChatStream, type ChatStreamPort } from './hooks/useChatStream';
import { useConversation } from './hooks/useConversation';
import { useHistory } from './hooks/useHistory';
import { useMentionedTabs, type TabMentionSource } from './hooks/useMentionedTabs';
import type { MentionedTab } from '../../shared/types/tab-mention';
import { faviconUrl, isReadableTabUrl, MENTION_SITE_ORIGINS, originPatternFor } from './utils/tab-mention';
import { useProviderStatus } from './hooks/useProviderStatus';
import { useSkills } from './hooks/useSkills';
import { useNewChatShortcuts } from '../../shared/new-chat-shortcuts/useNewChatShortcuts';
import type { NewChatShortcut } from '../../shared/new-chat-shortcuts/preference';
import { SKILL_SETTINGS_ANCHOR, type SettingsSection } from '../../components/settings/settings-sections';
import { STORAGE_KEYS } from '../../shared/constants/storage-keys';
import {
  ImageAttachmentError,
  imageAttachmentFromFile,
  screenshotAttachmentFromDataUrl,
} from './utils/image-attachments';
import {
  DocumentAttachmentError,
  documentAttachmentFromFile,
} from './utils/document-attachments';
import { cropScreenshotDataUrl } from './utils/screenshot';
import './sidepanel.css';

interface PresentationProps {
  messages?: ChatMessage[];
  context?: PageContextState;
  selectionText?: string;
  streaming?: boolean;
  stopDisabled?: boolean;
  disabled?: boolean;
  conversationId?: string;
  model?: string;
  models?: string[];
  modelLoading?: boolean;
  modelDisabled?: boolean;
  banner?: React.ReactNode;
  history?: React.ReactNode;
  settings?: React.ReactNode;
  loading?: boolean;
  errorMessage?: string;
  onSend?: (message: string, attachments?: ChatAttachment[], skill?: SkillInvocation) => boolean | void;
  /** Saved “/” skills; when omitted the panel loads them from storage. */
  skills?: Skill[];
  /** New-conversation suggestions; when omitted the panel loads them from storage. */
  newChatShortcuts?: NewChatShortcut[];
  /** Opens skill management from “+” → Skills → Manage skills. */
  onManageSkills?: () => void;
  onQuickAction?: (action: QuickAction) => void;
  quickActionBusy?: boolean;
  quickActionErrorMessage?: string;
  onStop?: () => void;
  onNewConversation?: () => void;
  onHistory?: () => void;
  onSettings?: () => void;
  floatingSupported?: boolean;
  floating?: boolean;
  floatingBusy?: boolean;
  floatingErrorMessage?: string;
  onToggleFloating?: () => void;
  onModelChange?: (model: string) => void;
  captureScreenshot?: (mode: ScreenshotCaptureMode) => Promise<string | undefined>;
  pageActionsEnabled?: boolean;
  pageActionsDisabled?: boolean;
  onPageActionsEnabledChange?: (enabled: boolean) => void;
  includePageContext?: boolean;
  onPageContextChange?: (enabled: boolean) => void;
  onRetryPageContext?: () => void;
  pageContextRetrying?: boolean;
  attachmentMaxBytes?: number;
  onRemoveSelectionContext?: () => void;
  mentionedTabs?: MentionedTab[];
  mentionError?: string;
  tabMention?: TabMentionOptions;
  onRemoveMentionedTab?: (tabId: number) => void;
}

export interface SidePanelDependencies {
  runtime: {
    send(command: RuntimeCommand): Promise<unknown>;
  };
  createChatPort(): ChatStreamPort;
  createRequestId(): string;
  /** Opens the settings page in a tab, optionally at one of its left-menu sections. */
  openOptionsPage(section?: SettingsSection): Promise<void>;
  /**
   * Requests the optional host permission for a Gateway Base URL. Must be called synchronously
   * from the user gesture; resolves whether access was granted.
   */
  requestGatewayAccess?(baseURL: string): Promise<boolean>;
  /**
   * Asks once for access to all sites when it is missing, for Gateways set up before it was
   * requested together with the Gateway. Must be called synchronously from the user gesture.
   */
  ensureAllSitesAccess?(): void;
  /** Set when this app runs as the in-page floating chat of that tab instead of the side panel. */
  floatingTabId?: number;
  /**
   * Shows the chat inside the tab's page and closes the side panel. Must be called synchronously
   * from the click, which may prompt for access to the site.
   */
  openFloatingChat?(tab: { tabId: number; url: string }): Promise<void>;
  /** From the floating chat: opens the side panel, which removes the floating chat. */
  openSidePanel?(tabId: number): Promise<void>;
  /** Fires when the settings page saves a Gateway or preference change. */
  subscribeSettingsChanged?(listener: () => void): () => void;
  tabActivity?: TabActivitySource;
  /** Fires when the user selects or clears text on a page; empty text means cleared. */
  subscribeSelectionChanges?(listener: (tabId: number, text: string) => void): () => void;
  captureVisibleTab?(tabId: number): Promise<string>;
  captureRegionScreenshot?(
    tabId: number,
    labels: ScreenshotSelectionLabels,
  ): Promise<string | undefined>;
  tabMention?: TabMentionSource;
}

interface AppProps extends PresentationProps {
  dependencies?: SidePanelDependencies;
  /** Runs the app as the in-page floating chat bound to this tab. */
  floatingTabId?: number;
}

const defaultContext: PageContextState = { status: 'preparing' };

function canRetryPageContext(context?: PageContextState): boolean {
  return context?.status === 'preparing'
    || context?.status === 'changed'
    || (context?.status === 'unavailable' && context.reason === 'CONTEXT_EXTRACTION_FAILED');
}

function SidePanelView({
  messages = [],
  context = defaultContext,
  selectionText,
  streaming = false,
  stopDisabled = false,
  disabled = false,
  conversationId,
  model = 'AI Gateway',
  models = [],
  modelLoading = false,
  modelDisabled = false,
  banner,
  history,
  settings,
  loading = false,
  errorMessage,
  onSend,
  onQuickAction,
  quickActionBusy = false,
  quickActionErrorMessage,
  onStop,
  onNewConversation,
  onHistory,
  onSettings,
  floatingSupported = false,
  floating = false,
  floatingBusy = false,
  floatingErrorMessage,
  onToggleFloating,
  onModelChange,
  captureScreenshot,
  includePageContext = true,
  onPageContextChange,
  onRetryPageContext,
  pageContextRetrying = false,
  attachmentMaxBytes = DEFAULT_ATTACHMENT_MAX_BYTES,
  onRemoveSelectionContext,
  mentionedTabs = [],
  mentionError,
  tabMention,
  onRemoveMentionedTab,
  pageActionsEnabled = false,
  pageActionsDisabled = false,
  onPageActionsEnabledChange,
  skills: providedSkills,
  newChatShortcuts: providedShortcuts,
  onManageSkills,
}: PresentationProps) {
  const { messages: t } = useI18n();
  const skillStore = useSkills(providedSkills);
  const { shortcuts: newChatShortcuts } = useNewChatShortcuts(providedShortcuts);
  const [selectedSkill, setSelectedSkill] = useState<Skill>();
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string>();
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [screenshotBusy, setScreenshotBusy] = useState(false);
  // Kept as a fraction rather than a string so a language switch shows the same greeting translated.
  const [greetingSeed, setGreetingSeed] = useState(Math.random);
  const greeting = t.greetings[Math.floor(greetingSeed * t.greetings.length)] ?? t.greetings[0];

  useEffect(() => {
    setGreetingSeed(Math.random());
    setDraft('');
    setAttachments([]);
    setAttachmentError(undefined);
    setSelectedSkill(undefined);
  }, [conversationId]);

  function createAttachmentId() {
    return globalThis.crypto?.randomUUID?.() ?? `attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function attachmentErrorMessage(error: unknown) {
    const maxMegabytes = attachmentMaxBytes / BYTES_PER_MEGABYTE;
    if (error instanceof ImageAttachmentError) {
      if (error.code === 'unsupported') return t.unsupportedAttachment;
      if (error.code === 'too_large') return t.attachmentTooLarge(maxMegabytes);
      return t.attachmentReadFailed;
    }
    if (error instanceof DocumentAttachmentError) {
      if (error.code === 'unsupported') return t.unsupportedAttachment;
      if (error.code === 'too_large') return t.attachmentTooLarge(maxMegabytes);
      if (error.code === 'empty') return t.attachmentEmpty;
      return t.attachmentReadFailed;
    }
    return t.attachmentReadFailed;
  }

  async function addFiles(files: File[]) {
    setAttachmentError(undefined);
    if (attachments.length + files.length > MAX_CHAT_ATTACHMENTS) {
      setAttachmentError(t.attachmentLimitReached(MAX_CHAT_ATTACHMENTS));
      return;
    }

    setAttachmentBusy(true);
    const added: ChatAttachment[] = [];
    let firstError: string | undefined;
    let documentCharacters = attachments
      .filter(isDocumentAttachment)
      .reduce((total, attachment) => total + attachment.text.length, 0);
    try {
      for (const file of files) {
        try {
          const isImage = IMAGE_ATTACHMENT_MIME_TYPES.some((mimeType) => mimeType === file.type);
          const attachment = isImage
            ? await imageAttachmentFromFile(file, createAttachmentId, attachmentMaxBytes)
            : await documentAttachmentFromFile(file, createAttachmentId, attachmentMaxBytes);
          if (isDocumentAttachment(attachment)) {
            const remaining = MAX_DOCUMENT_ATTACHMENTS_TOTAL_CHARACTERS - documentCharacters;
            if (remaining <= 0) {
              firstError ??= t.attachmentContentLimitReached;
              continue;
            }
            if (attachment.text.length > remaining) {
              attachment.text = attachment.text.slice(0, remaining);
              attachment.truncated = true;
            }
            documentCharacters += attachment.text.length;
          }
          added.push(attachment);
        } catch (error) {
          firstError ??= attachmentErrorMessage(error);
        }
      }
      if (added.length) setAttachments((current) => [...current, ...added]);
      setAttachmentError(firstError);
    } finally {
      setAttachmentBusy(false);
    }
  }

  async function takeScreenshot(mode: ScreenshotCaptureMode) {
    if (!captureScreenshot || screenshotBusy) return;
    if (attachments.length >= MAX_CHAT_ATTACHMENTS) {
      setAttachmentError(t.attachmentLimitReached(MAX_CHAT_ATTACHMENTS));
      return;
    }
    setScreenshotBusy(true);
    setAttachmentError(undefined);
    try {
      const dataUrl = await captureScreenshot(mode);
      if (!dataUrl) return;
      const attachment = screenshotAttachmentFromDataUrl(dataUrl, createAttachmentId);
      setAttachments((current) => [...current, attachment]);
    } catch {
      setAttachmentError(t.screenshotFailed);
    } finally {
      setScreenshotBusy(false);
    }
  }

  function send(message: string) {
    const skill = selectedSkill ? { name: selectedSkill.name, prompt: selectedSkill.prompt } : undefined;
    const accepted = skill
      ? onSend?.(message, attachments, skill)
      : attachments.length ? onSend?.(message, attachments) : onSend?.(message);
    if (accepted === false) return;
    setDraft('');
    setAttachments([]);
    setAttachmentError(undefined);
    setSelectedSkill(undefined);
  }

  function runSkillShortcut(skill: Skill) {
    const accepted = onSend?.(draft.trim(), attachments, { name: skill.name, prompt: skill.prompt });
    if (accepted === false) return;
    setDraft('');
    setAttachments([]);
    setAttachmentError(undefined);
    setSelectedSkill(undefined);
  }

  function selectQuickAction(action: QuickAction) {
    if (onQuickAction) {
      onQuickAction(action);
      return;
    }
    send(action.prompt);
  }

  return (
    <div className={`sidepanel-shell ${floating ? 'sidepanel-shell--floating' : ''} ${messages.length === 0 ? 'sidepanel-shell--empty' : ''}`}>
      <PanelHeader
        onNewConversation={onNewConversation}
        onHistory={onHistory}
        onSettings={onSettings}
        floatingSupported={floatingSupported}
        floating={floating}
        floatingBusy={floatingBusy}
        onToggleFloating={onToggleFloating}
        onRetryPageContext={onRetryPageContext}
        pageContextRetrying={pageContextRetrying}
      />

      {floatingErrorMessage ? (
        <aside className="floating-window-error" role="alert">{floatingErrorMessage}</aside>
      ) : null}

      {banner}

      {quickActionErrorMessage ? (
        <aside className="quick-action-error" role="alert">{quickActionErrorMessage}</aside>
      ) : null}

      <main className={`conversation ${messages.length === 0 ? 'conversation--empty' : ''}`}>
        {loading && messages.length === 0 ? (
          <div className="panel-feedback" aria-live="polite">
            <span className="panel-feedback__spinner" aria-hidden="true" />
            {t.loadingCurrentTab}
          </div>
        ) : errorMessage && !quickActionErrorMessage && messages.length === 0 ? (
          <div className="panel-feedback panel-feedback--error" role="alert">{errorMessage}</div>
        ) : messages.length === 0 ? (
          <>
            <section className="empty-state" aria-labelledby="empty-state-title">
              <div className="empty-state__symbol" aria-hidden="true"><img src={new URL('/icon/128.png', window.location.href).href} alt="" /></div>
              <h2 id="empty-state-title">{greeting}</h2>
            </section>
            <QuickActions
              onSelect={selectQuickAction}
              onSelectSkill={runSkillShortcut}
              shortcuts={newChatShortcuts}
              skills={skillStore.skills}
              disabled={disabled || quickActionBusy}
            />
          </>
        ) : (
          <MessageList messages={messages} />
        )}
      </main>

      <div className="composer-dock">
        <ChatComposer
          value={draft}
          onChange={setDraft}
          onSend={send}
          streaming={streaming}
          onStop={onStop}
          stopDisabled={stopDisabled}
          disabled={disabled}
          model={model}
          models={models}
          modelLoading={modelLoading}
          modelDisabled={modelDisabled}
          onModelChange={onModelChange}
          attachments={attachments}
          attachmentError={attachmentError}
          attachmentBusy={attachmentBusy}
          screenshotBusy={screenshotBusy}
          onSelectFiles={(files) => { void addFiles(files); }}
          onCaptureScreenshot={captureScreenshot ? (mode) => { void takeScreenshot(mode); } : undefined}
          onRemoveAttachment={(id) => {
            setAttachments((current) => current.filter((attachment) => attachment.id !== id));
            setAttachmentError(undefined);
          }}
          pageActionsEnabled={pageActionsEnabled}
          pageActionsDisabled={pageActionsDisabled}
          onPageActionsEnabledChange={onPageActionsEnabledChange}
          context={(
            <>
              <ContextChipList
                context={context}
                includePage={includePageContext}
                selectionText={selectionText}
                mentionedTabs={mentionedTabs}
                faviconFor={tabMention?.faviconFor}
                onIncludePageChange={onPageContextChange}
                onRemoveSelection={onRemoveSelectionContext}
                onRemoveTab={onRemoveMentionedTab}
              />
              {mentionError ? <p className="composer-error" role="alert">{mentionError}</p> : null}
            </>
          )}
          tabMention={tabMention}
          skills={skillStore.skills}
          selectedSkill={selectedSkill}
          onSelectSkill={setSelectedSkill}
          onSaveSkill={skillStore.save}
          onDeleteSkill={skillStore.remove}
          onManageSkills={onManageSkills}
          newChatShortcuts={resolveShortcutButtons(newChatShortcuts, t.quickActions, skillStore.skills, selectQuickAction, runSkillShortcut)}
          newChatShortcutsDisabled={disabled || streaming || quickActionBusy}
          onManageNewChatShortcuts={onSettings}
        />
      </div>

      {history}
      {settings}
    </div>
  );
}

function ConnectedSidePanel({ dependencies }: { dependencies: SidePanelDependencies }) {
  const { messages: t } = useI18n();
  const floatingTabId = dependencies.floatingTabId;
  const floating = floatingTabId !== undefined;
  const [floatingBusy, setFloatingBusy] = useState(false);
  const [floatingError, setFloatingError] = useState<string>();
  const activeRefreshRef = useRef<() => Promise<ActiveTabState | undefined>>(async () => undefined);
  const activeStateRef = useRef<ActiveTabState | undefined>(undefined);
  const optimisticResetRef = useRef<() => void>(() => undefined);
  const resetTransientRef = useRef<() => void>(() => undefined);

  const clearTransient = useCallback(() => {
    resetTransientRef.current();
    optimisticResetRef.current();
  }, []);

  const reconcile = useCallback(async () => {
    const previous = activeStateRef.current;
    const latest = await activeRefreshRef.current();
    const persisted = Boolean(
      latest
      && previous
      && latest.tabId === previous.tabId
      && latest.conversation.id === previous.conversation.id
      && latest.conversation.messages.length > previous.conversation.messages.length,
    );
    if (persisted) optimisticResetRef.current();
    return persisted;
  }, []);

  const chat = useChatStream({
    createPort: dependencies.createChatPort,
    createRequestId: dependencies.createRequestId,
    onReconcile: reconcile,
  });
  resetTransientRef.current = chat.reset;

  const activeTab = useActiveTabState({
    runtime: dependencies.runtime,
    tabActivity: dependencies.tabActivity,
    onBeforeLoad: clearTransient,
    createRequestId: dependencies.createRequestId,
    tabId: floatingTabId,
  });
  activeStateRef.current = activeTab.data;
  activeRefreshRef.current = () => activeTab.refresh(activeTab.data?.tabId, { preserveTransient: true });

  const provider = useProviderStatus(dependencies.runtime, dependencies.createRequestId);
  const [attachmentMaxBytes, setAttachmentMaxBytes] = useState(DEFAULT_ATTACHMENT_MAX_BYTES);
  const toggleFloating = useCallback(() => {
    const state = activeTab.data;
    if (!state || floatingBusy) return;
    // Started inside the click: permissions.request and sidePanel.open both need the gesture.
    const pending = floating
      ? dependencies.openSidePanel?.(state.tabId)
      : dependencies.openFloatingChat?.({ tabId: state.tabId, url: state.url });
    if (!pending) return;
    setFloatingBusy(true);
    setFloatingError(undefined);
    void pending
      .catch((caught) => setFloatingError(localizeError(normalizeError(caught), t)))
      .finally(() => setFloatingBusy(false));
  }, [activeTab.data, dependencies, floating, floatingBusy, t]);
  const openSettingsPage = useCallback((section?: SettingsSection) => {
    void dependencies.openOptionsPage(section).catch(() => undefined);
  }, [dependencies]);
  useEffect(() => {
    let active = true;
    const loadAttachmentLimit = () => {
      void dependencies.runtime.send({
        version: 1,
        requestId: dependencies.createRequestId(),
        type: 'GET_ATTACHMENT_LIMIT',
      }).then((response) => {
        if (!active) return;
        const value = (response as { attachmentMaxBytes?: unknown }).attachmentMaxBytes;
        if (typeof value === 'number') setAttachmentMaxBytes(value);
      }).catch(() => undefined);
    };
    loadAttachmentLimit();
    // Settings now live on their own page, so pick up its saves here.
    const unsubscribe = dependencies.subscribeSettingsChanged?.(() => {
      loadAttachmentLimit();
      void provider.refresh();
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [dependencies, provider.refresh]);
  const [quickSetupBusy, setQuickSetupBusy] = useState(false);
  const [quickSetupError, setQuickSetupError] = useState<string>();
  /** One-step first-run setup: grant the Gateway origin, fetch models, preselect one, save. */
  const runQuickSetup = useCallback((values: QuickSetupValues) => {
    // permissions.request must run synchronously inside the submit gesture, before any await.
    const access = dependencies.requestGatewayAccess?.(values.baseURL) ?? Promise.resolve(true);
    setQuickSetupBusy(true);
    setQuickSetupError(undefined);
    void (async () => {
      try {
        let granted: boolean;
        try {
          granted = await access;
        } catch (caught) {
          // Chrome may not count a click inside the page-embedded floating chat as a gesture.
          if (floating) {
            setQuickSetupError(t.quickSetupFloatingPermission);
            return;
          }
          throw caught;
        }
        if (!granted) throw new AppError('HOST_PERMISSION_REQUIRED', '需要授权：请允许 Chrome 访问该 Gateway 后重试。');
        const config: ProviderConfigDraft = {
          id: 'gateway-main',
          name: new URL(values.baseURL).host,
          type: values.type,
          baseURL: values.baseURL,
          model: '',
          endpointMode: PROVIDER_ENDPOINT_MODES[values.type],
          defaultHeaders: {},
          timeoutMs: 30_000,
          stream: true,
        };
        const listed = await dependencies.runtime.send({
          version: 1,
          requestId: dependencies.createRequestId(),
          type: 'LIST_PROVIDER_MODELS',
          config,
          apiKey: values.apiKey,
        }) as { models?: string[] };
        const model = pickDefaultModel(listed.models ?? []);
        if (!model) {
          setQuickSetupError(t.quickSetupNoModels);
          return;
        }
        await dependencies.runtime.send({
          version: 1,
          requestId: dependencies.createRequestId(),
          type: 'SAVE_PROVIDER_CONFIG',
          config: { ...config, model },
          apiKey: values.apiKey,
        });
        await provider.refresh();
      } catch (caught) {
        setQuickSetupError(localizeError(normalizeError(caught), t));
      } finally {
        setQuickSetupBusy(false);
      }
    })();
  }, [dependencies, floating, provider.refresh, t]);
  const [quickActionBusy, setQuickActionBusy] = useState(false);
  const [quickActionErrorMessage, setQuickActionErrorMessage] = useState<string>();
  const [pageContextRetrying, setPageContextRetrying] = useState(false);
  const [pageActionsEnabled, setPageActionsEnabled] = useState(false);
  const quickActionBusyRef = useRef(false);
  const conversation = useConversation({
    conversation: activeTab.data?.conversation,
    stream: chat.stream,
  });
  optimisticResetRef.current = conversation.resetOptimistic;

  const historyConversationChanged = useCallback(async (nextState?: ActiveTabState) => {
    if (nextState) return activeTab.apply(nextState);
    clearTransient();
    return activeTab.refresh();
  }, [activeTab.apply, activeTab.refresh, clearTransient]);
  const history = useHistory({
    runtime: dependencies.runtime,
    createRequestId: dependencies.createRequestId,
    tabId: activeTab.data?.tabId,
    activeConversationId: activeTab.data?.conversation.id,
    onConversationChanged: historyConversationChanged,
  });

  const mentioned = useMentionedTabs({
    conversationId: activeTab.data?.conversation.id,
    currentTabId: activeTab.data?.tabId,
    source: dependencies.tabMention,
    runtime: dependencies.runtime,
    createRequestId: dependencies.createRequestId,
    messages: t,
    localizeError: (error) => localizeError(error, t),
  });
  const mentionedTabIdsRef = useRef<number[]>([]);
  mentionedTabIdsRef.current = mentioned.sendableTabIds;

  const context = activeTab.data?.context;
  const contextIdentity = activeTab.data
    ? `${activeTab.data.tabId}:${activeTab.data.navigationKey}:${context?.status === 'ready' ? context.snapshot.snapshotId : context?.status}`
    : 'none';
  const [selection, setSelection] = useState({ identity: 'none', includePage: false, includeSelection: false });
  const [liveSelection, setLiveSelection] = useState<{ identity: string; text: string }>();
  const snapshotSelectionText = context?.status === 'ready' ? context.snapshot.selection?.text : undefined;
  const selectionText = context?.status !== 'ready'
    ? undefined
    : liveSelection?.identity === contextIdentity
      ? liveSelection.text || undefined
      : snapshotSelectionText;
  const contextIdentityRef = useRef(contextIdentity);
  contextIdentityRef.current = contextIdentity;
  const activeTabIdRef = useRef<number | undefined>(undefined);
  activeTabIdRef.current = activeTab.data?.tabId;
  // Tabs whose page context the user removed. A fresh snapshot (after sending,
  // a page update or navigation) must not quietly share the page again; only the
  // user adding it back does.
  const [pageDismissedTabIds, setPageDismissedTabIds] = useState<ReadonlySet<number>>(() => new Set());
  const pageDismissedTabIdsRef = useRef(pageDismissedTabIds);
  pageDismissedTabIdsRef.current = pageDismissedTabIds;
  const pageDismissed = activeTab.data ? pageDismissedTabIds.has(activeTab.data.tabId) : false;
  const defaultIncludePage = Boolean(context) && !pageDismissed;
  const defaultIncludePageRef = useRef(defaultIncludePage);
  defaultIncludePageRef.current = defaultIncludePage;
  const selectionForRender = selection.identity === contextIdentity
    ? selection
    : {
        identity: contextIdentity,
        includePage: defaultIncludePage,
        includeSelection: Boolean(selectionText),
      };

  const setIncludePage = (includePage: boolean) => {
    const tabId = activeTab.data?.tabId;
    if (tabId !== undefined && pageDismissedTabIdsRef.current.has(tabId) === includePage) {
      const next = new Set(pageDismissedTabIdsRef.current);
      if (includePage) next.delete(tabId);
      else next.add(tabId);
      pageDismissedTabIdsRef.current = next;
      setPageDismissedTabIds(next);
    }
    setSelection((current) => ({ ...selectionForRender, ...current, identity: contextIdentity, includePage }));
  };

  useEffect(() => {
    setSelection({
      identity: contextIdentity,
      includePage: defaultIncludePageRef.current,
      includeSelection: Boolean(snapshotSelectionText),
    });
    setQuickActionErrorMessage(undefined);
    setPageActionsEnabled(false);
  }, [contextIdentity, context?.status, snapshotSelectionText]);

  // Text the user selects on the page is added to the composer as context right
  // away, without re-reading the page. The background keeps the same snapshot
  // in sync, so sending still resolves the selection by snapshot id.
  useEffect(() => dependencies.subscribeSelectionChanges?.((tabId, text) => {
    if (tabId !== activeTabIdRef.current) return;
    const identity = contextIdentityRef.current;
    setLiveSelection({ identity, text });
    setSelection((current) => ({
      ...current,
      ...(current.identity === identity ? {} : { includePage: defaultIncludePageRef.current }),
      identity,
      includeSelection: Boolean(text),
    }));
  }), [dependencies]);

  const startChat = useCallback((
    state: ActiveTabState,
    text: string,
    attachments: ChatAttachment[] = [],
    forcePage = false,
    allowPageActions = false,
    techStackEvidence?: PageTechStackEvidence,
    skill?: SkillInvocation,
    allowPage = true,
  ) => {
    const readyContext = state.context.status === 'ready' ? state.context.snapshot : undefined;
    const includePage = !allowPage || allowPageActions || Boolean(techStackEvidence)
      ? false
      : forcePage
        ? Boolean(readyContext?.document?.text)
        : selectionForRender.includePage && Boolean(readyContext?.document?.text);
    // A live selection only exists in the panel state and the background
    // snapshot, so it counts even when the loaded snapshot has none.
    const liveText = liveSelection?.identity === contextIdentity ? liveSelection.text : undefined;
    const includeSelection = !techStackEvidence
      && selectionForRender.includeSelection
      && Boolean(liveText ?? readyContext?.selection?.text);
    const additionalTabIds = allowPageActions || techStackEvidence
      ? []
      : mentionedTabIdsRef.current.filter((tabId) => tabId !== state.tabId);
    const requestId = chat.start({
      tabId: state.tabId,
      conversationId: state.conversation.id,
      text,
      attachments,
      contextSelection: {
        includePage,
        includeSelection,
        ...((includePage || includeSelection) && readyContext
          ? { snapshotId: readyContext.snapshotId }
          : {}),
        ...(additionalTabIds.length ? { additionalTabIds } : {}),
      },
      allowPageActions,
      ...(techStackEvidence ? { techStackEvidence } : {}),
      ...(skill ? { skill } : {}),
    });
    if (requestId) conversation.beginOptimisticTurn(text, requestId, attachments, skill);
    return requestId;
  }, [chat, conversation, selectionForRender, liveSelection, contextIdentity]);

  const send = useCallback((text: string, attachments: ChatAttachment[] = [], skill?: SkillInvocation) => {
    const state = activeTab.data;
    if (!state || !provider.ready) return false;
    dependencies.ensureAllSitesAccess?.();
    setQuickActionErrorMessage(undefined);
    const requestId = startChat(state, text, attachments, false, pageActionsEnabled, undefined, skill);
    if (requestId && pageActionsEnabled) setPageActionsEnabled(false);
    return Boolean(requestId);
  }, [activeTab.data, dependencies, pageActionsEnabled, provider.ready, startChat]);

  const sendQuickAction = useCallback(async (action: QuickAction) => {
    if (quickActionBusyRef.current || !provider.ready) return;
    if (chat.stream.status === 'streaming') return;
    dependencies.ensureAllSitesAccess?.();

    quickActionBusyRef.current = true;
    setQuickActionBusy(true);
    setQuickActionErrorMessage(undefined);
    try {
      let state = activeTab.data;
      if (!state) {
        setQuickActionErrorMessage(t.quickActionPageUnavailable);
        return;
      }

      if (action.id === 'tech-stack') {
        try {
          const evidence = await dependencies.runtime.send({
            version: 1,
            requestId: dependencies.createRequestId(),
            type: 'ANALYZE_PAGE_TECH_STACK',
            tabId: state.tabId,
          }) as PageTechStackEvidence;
          startChat(state, action.prompt, [], false, false, evidence);
        } catch {
          setQuickActionErrorMessage(t.techStackAnalysisFailed);
        }
        return;
      }

      // With a selection in the composer, a page shortcut acts on that selection
      // only; the whole page is used when nothing is selected.
      if (selectionForRender.includeSelection && selectionText) {
        startChat(state, action.prompt, [], false, false, undefined, undefined, false);
        return;
      }

      if (state.context.status !== 'ready' || !state.context.snapshot.document?.text) {
        try {
          const snapshot = await dependencies.runtime.send({
            version: 1,
            requestId: dependencies.createRequestId(),
            type: 'EXTRACT_PAGE_CONTEXT',
            tabId: state.tabId,
          }) as ExtractedPageContext;

          if (snapshot.tabId !== state.tabId || !snapshot.document?.text) {
            setQuickActionErrorMessage(t.quickActionPageUnavailable);
            return;
          }

          state = activeTab.apply({
            ...state,
            url: snapshot.url,
            navigationKey: snapshot.metadata.navigationKey,
            context: { status: 'ready', snapshot },
          });
        } catch {
          // A page shortcut owns this failure state. Do not route extraction
          // errors through the global active-tab banner as that would display
          // both a protocol error and the actionable page-access message.
          setQuickActionErrorMessage(t.quickActionPageUnavailable);
          return;
        }
      }

      startChat(state, action.prompt, [], true);
    } finally {
      quickActionBusyRef.current = false;
      setQuickActionBusy(false);
    }
  }, [activeTab.apply, activeTab.data, chat.stream.status, dependencies, provider.ready, selectionForRender.includeSelection, selectionText, startChat, t.quickActionPageUnavailable, t.techStackAnalysisFailed]);

  const startNewConversation = useCallback(async () => {
    const state = activeTab.data;
    if (!state || chat.stream.status === 'streaming') return;
    clearTransient();
    const nextState = await dependencies.runtime.send({
      version: 1,
      requestId: dependencies.createRequestId(),
      type: 'CREATE_CONVERSATION',
      tabId: state.tabId,
    }) as ActiveTabState;
    activeTab.apply(nextState);
  }, [activeTab.apply, activeTab.data, chat.stream.status, clearTransient, dependencies]);

  const changeModel = useCallback(async (model: string) => {
    const state = activeTab.data;
    if (!state || !model.trim() || model === state.conversation.model) return;
    if (chat.stream.status === 'streaming') return;
    const nextState = await dependencies.runtime.send({
      version: 1,
      requestId: dependencies.createRequestId(),
      type: 'SET_CONVERSATION_MODEL',
      tabId: state.tabId,
      conversationId: state.conversation.id,
      model,
    }) as ActiveTabState;
    activeTab.apply(nextState);
  }, [activeTab.apply, activeTab.data, chat.stream.status, dependencies]);

  const allowPageOnce = useCallback(async () => {
    const state = activeTab.data;
    if (!state || state.context.status !== 'unavailable' || !state.context.canAllowOnce) return;
    await dependencies.runtime.send({
      version: 1,
      requestId: dependencies.createRequestId(),
      type: 'ALLOW_PAGE_ACCESS_ONCE',
      tabId: state.tabId,
    });
    await activeTab.refresh(state.tabId);
  }, [activeTab, dependencies]);

  const retryPageContext = useCallback(async () => {
    const state = activeTab.data;
    if (!state || pageContextRetrying) return;

    setPageContextRetrying(true);
    setQuickActionErrorMessage(undefined);
    clearTransient();
    try {
      let nextState: ActiveTabState;
      try {
        nextState = await dependencies.runtime.send({
          version: 1,
          requestId: dependencies.createRequestId(),
          type: 'RETRY_PAGE_CONTEXT',
          tabId: state.tabId,
        }) as ActiveTabState;
      } catch (error) {
        const normalized = normalizeError(error);
        if (normalized.code !== 'INVALID_MESSAGE') throw normalized;

        // During an extension update Chrome can briefly keep the previous
        // service worker alive. It does not know RETRY_PAGE_CONTEXT yet, so
        // fall back to the original extraction command that both versions
        // understand instead of exposing "消息格式无效" to the user.
        const snapshot = await dependencies.runtime.send({
          version: 1,
          requestId: dependencies.createRequestId(),
          type: 'EXTRACT_PAGE_CONTEXT',
          tabId: state.tabId,
        }) as ExtractedPageContext;
        nextState = {
          ...state,
          url: snapshot.url,
          navigationKey: snapshot.metadata.navigationKey,
          context: { status: 'ready', snapshot },
        };
      }
      activeTab.apply(nextState);
    } catch (error) {
      const normalized = normalizeError(error);
      setQuickActionErrorMessage(
        normalized.code === 'INVALID_MESSAGE'
          || normalized.code === 'CONTEXT_EXTRACTION_FAILED'
          || normalized.code === 'CONTEXT_STALE'
          || normalized.code === 'PAGE_UNSUPPORTED'
          || normalized.code === 'PAGE_PERMISSION_REQUIRED'
          ? t.quickActionPageUnavailable
          : localizeError(normalized, t),
      );
    } finally {
      setPageContextRetrying(false);
    }
  }, [activeTab.apply, activeTab.data, clearTransient, dependencies, pageContextRetrying, t]);

  const pageAccessBanner = context?.status === 'unavailable'
    && context.reason === 'PAGE_PERMISSION_REQUIRED'
    && context.canAllowOnce ? (
      <aside className="page-access-banner" role="status">
        <div>
          <strong>{t.pageExcludedTitle}</strong>
          <span>{context.message ?? t.pageExcludedDescription}</span>
        </div>
        <button type="button" onClick={() => { void allowPageOnce(); }}>{t.allowPageOnce}</button>
      </aside>
    ) : undefined;

  const providerBanner = !provider.loading && !provider.ready ? (
    <QuickSetupCard
      busy={quickSetupBusy}
      error={quickSetupError ?? (provider.error ? localizeError(provider.error, t) : undefined)}
      onSubmit={runQuickSetup}
      onOpenSettings={() => openSettingsPage('models')}
    />
  ) : undefined;

  return (
    <SidePanelView
      messages={conversation.messages}
      context={context}
      includePageContext={selectionForRender.includePage}
      selectionText={selectionForRender.includeSelection ? selectionText : undefined}
      streaming={chat.stream.status === 'streaming'}
      stopDisabled={!chat.canStop}
      disabled={activeTab.loading || !activeTab.data || !provider.ready}
      conversationId={activeTab.data?.conversation.id}
      model={activeTab.data?.conversation.model || provider.config?.model || 'AI Gateway'}
      models={provider.models}
      modelLoading={provider.modelsLoading}
      modelDisabled={!provider.ready || chat.stream.status === 'streaming'}
      banner={providerBanner ?? pageAccessBanner}
      onManageSkills={() => openSettingsPage(SKILL_SETTINGS_ANCHOR)}
      history={(
        <HistoryDrawer
          open={history.open}
          conversations={history.conversations}
          activeConversationId={activeTab.data?.conversation.id}
          retentionDays={history.retentionDays}
          loading={history.loading}
          deletingIds={history.deletingIds}
          errorMessage={history.error ? localizeError(history.error, t) : undefined}
          onClose={history.closeHistory}
          onOpenConversation={(id) => { void history.openConversation(id); }}
          onPinConversation={(id, pinned) => { void history.pinConversation(id, pinned); }}
          onDeleteConversation={(id) => { void history.deleteConversation(id); }}
          onClearAll={() => { void history.clearAll(); }}
          onRequestRetentionChange={history.requestRetentionChange}
        />
      )}
      loading={activeTab.loading}
      errorMessage={activeTab.error ? localizeError(activeTab.error, t) : undefined}
      onSend={send}
      onQuickAction={(action) => { void sendQuickAction(action); }}
      quickActionBusy={quickActionBusy}
      quickActionErrorMessage={quickActionErrorMessage}
      onStop={chat.stop}
      onNewConversation={() => { void startNewConversation(); }}
      onHistory={history.openHistory}
      onSettings={() => openSettingsPage()}
      floatingSupported={Boolean(floating ? dependencies.openSidePanel : dependencies.openFloatingChat)}
      floating={floating}
      floatingBusy={floatingBusy}
      floatingErrorMessage={floatingError}
      onToggleFloating={toggleFloating}
      onModelChange={(model) => { void changeModel(model); }}
      captureScreenshot={activeTab.data && dependencies.captureVisibleTab
        ? () => {
            if (!dependencies.captureRegionScreenshot) {
              throw new Error('Region screenshot is unavailable');
            }
            return dependencies.captureRegionScreenshot(activeTab.data!.tabId, {
              instruction: t.screenshotSelectionInstruction,
              cancelHint: t.screenshotSelectionCancelHint,
            });
          }
        : undefined}
      pageActionsEnabled={pageActionsEnabled}
      pageActionsDisabled={context?.status !== 'ready'}
      onPageActionsEnabledChange={setPageActionsEnabled}
      onPageContextChange={setIncludePage}
      onRetryPageContext={activeTab.data && canRetryPageContext(context) ? () => { void retryPageContext(); } : undefined}
      pageContextRetrying={pageContextRetrying}
      attachmentMaxBytes={attachmentMaxBytes}
      onRemoveSelectionContext={() => setSelection((current) => ({ ...selectionForRender, ...current, identity: contextIdentity, includeSelection: false }))}
      mentionedTabs={mentioned.tabs}
      mentionError={mentioned.error}
      onRemoveMentionedTab={mentioned.remove}
      tabMention={dependencies.tabMention ? {
        loadCandidates: dependencies.tabMention.listTabs,
        peekCandidates: dependencies.tabMention.peekTabs,
        onSelect: (tab) => {
          // The current tab is shared through the page context card, not as a mention.
          if (tab.tabId === activeTab.data?.tabId) setIncludePage(true);
          else mentioned.add(tab);
        },
        onDeselect: (tab) => {
          if (tab.tabId === activeTab.data?.tabId) setIncludePage(false);
          else mentioned.remove(tab.tabId);
        },
        selectedTabIds: [
          ...mentioned.tabs.map((tab) => tab.tabId),
          ...(selectionForRender.includePage && activeTab.data ? [activeTab.data.tabId] : []),
        ],
        faviconFor: dependencies.tabMention.faviconFor,
      } : undefined}
    />
  );
}

function hasPresentationOverrides(props: AppProps) {
  return Object.keys(props).some((key) => key !== 'dependencies' && key !== 'floatingTabId');
}

function createDefaultDependencies(floatingTabId?: number): SidePanelDependencies | undefined {
  if (typeof browser === 'undefined') return undefined;

  const runtime = new RuntimeClient(browser.runtime);
  const createRequestId = () => globalThis.crypto?.randomUUID?.() ?? `sidepanel-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tabActivity: TabActivitySource = {
    subscribe(listener) {
      browser.tabs.onActivated.addListener(listener);
      const onFocus = () => listener();
      const onVisibility = () => { if (!document.hidden) listener(); };
      window.addEventListener('focus', onFocus);
      document.addEventListener('visibilitychange', onVisibility);
      return () => {
        browser.tabs.onActivated.removeListener(listener);
        window.removeEventListener('focus', onFocus);
        document.removeEventListener('visibilitychange', onVisibility);
      };
    },
  };

  const captureVisibleTab = async (tabId: number) => {
    const tab = await browser.tabs.get(tabId);
    if (tab.windowId === undefined || tab.active === false) throw new Error('The bound tab is not active');
    return browser.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 88 });
  };

  // "tabs" and site access are requested together, once, from the first “@”
  // gesture so adding other tabs afterwards never prompts again.
  const mentionAccess = { permissions: ['tabs' as const], origins: MENTION_SITE_ORIGINS };
  // Checked up front because the request in ensureAllSitesAccess cannot wait on an await.
  let allSitesAccess: boolean | 'denied' | undefined;
  void browser.permissions.contains(mentionAccess)
    .then((granted) => { allSitesAccess = granted; })
    .catch(() => undefined);
  const queryWindowTabs = async () => {
    const tabs = await browser.tabs.query({ currentWindow: true });
    return tabs
      .filter((tab) => tab.id !== undefined && tab.id !== browser.tabs.TAB_ID_NONE)
      .map((tab) => {
        const url = tab.url ?? tab.pendingUrl ?? '';
        return {
          tabId: tab.id!,
          title: tab.title ?? url,
          url,
          active: Boolean(tab.active),
          supported: isReadableTabUrl(url) && !tab.discarded,
        };
      });
  };
  const tabMention: TabMentionSource = {
    async listTabs() {
      const granted = await browser.permissions.contains(mentionAccess)
        || await browser.permissions.request(mentionAccess);
      return granted ? queryWindowTabs() : undefined;
    },
    async peekTabs() {
      return await browser.permissions.contains(mentionAccess) ? queryWindowTabs() : undefined;
    },
    requestSiteAccess(url) {
      const origin = originPatternFor(url);
      if (!origin) return Promise.resolve(false);
      // Already covered by the one-time grant above, so this resolves without a
      // prompt; it only prompts if the user later revoked site access.
      // permissions.request must be called synchronously from the user gesture.
      return browser.permissions.request({ origins: [origin] });
    },
    subscribeTabRemoved(listener) {
      browser.tabs.onRemoved.addListener(listener);
      return () => browser.tabs.onRemoved.removeListener(listener);
    },
    faviconFor: (url) => (url ? faviconUrl(url, browser.runtime.getURL('/')) : undefined),
  };

  return {
    runtime,
    tabMention,
    createChatPort: () => browser.runtime.connect({ name: CHAT_STREAM_PORT_NAME }) as unknown as ChatStreamPort,
    createRequestId,
    floatingTabId,
    openFloatingChat: floatingTabId === undefined ? ({ tabId, url }) => {
      const origin = originPatternFor(url);
      if (!origin || !isReadableTabUrl(url)) {
        return Promise.reject(new AppError('PAGE_UNSUPPORTED', '当前页面不支持浮动显示'));
      }
      // permissions.request must be called synchronously from the user gesture.
      return browser.permissions.request({ origins: [origin] }).then(async (granted) => {
        if (!granted) throw new AppError('PAGE_PERMISSION_REQUIRED', '需要允许访问当前网站后才能浮动显示');
        await runtime.send({ version: 1, requestId: createRequestId(), type: 'OPEN_FLOATING_CHAT', tabId });
        // Closes the side panel; the floating chat runs on its own in the page.
        window.close();
      });
    } : undefined,
    openSidePanel: floatingTabId === undefined ? undefined : async (tabId) => {
      await runtime.send({ version: 1, requestId: createRequestId(), type: 'OPEN_SIDE_PANEL', tabId });
    },
    requestGatewayAccess(baseURL) {
      let originPattern: string;
      try { originPattern = analyzeGatewayBaseUrl(baseURL).originPattern; } catch { return Promise.resolve(false); }
      // permissions.request must be called synchronously from the user gesture.
      // All-sites and "tabs" access are asked for in the same prompt so page features
      // and “@” tab mentions work on new and open pages without another prompt.
      return browser.permissions.request({ permissions: mentionAccess.permissions, origins: [originPattern, ...MENTION_SITE_ORIGINS] });
    },
    ensureAllSitesAccess() {
      if (allSitesAccess !== false) return;
      // Ask at most once per panel; a denial must not prompt on every message.
      allSitesAccess = undefined;
      // permissions.request must be called synchronously from the user gesture.
      void browser.permissions.request(mentionAccess)
        .then((granted) => { allSitesAccess = granted ? true : 'denied'; })
        .catch(() => { allSitesAccess = 'denied'; });
    },
    openOptionsPage: async (section) => {
      if (!section) {
        // Reuses an already open settings tab (options_ui.open_in_tab).
        await browser.runtime.openOptionsPage();
        return;
      }
      // tabs.create needs no "tabs" permission; the hash selects the left-menu section.
      await browser.tabs.create({ url: browser.runtime.getURL(`/options.html#${section}`) });
    },
    subscribeSettingsChanged(listener) {
      const onChanged = (changes: Record<string, unknown>, area: string) => {
        if (area !== 'local') return;
        const keys = Object.keys(changes);
        if (keys.some((key) => key === STORAGE_KEYS.providerConfigs
          || key === STORAGE_KEYS.preferences
          || key.startsWith(STORAGE_KEYS.providerSecretsPrefix))) listener();
      };
      browser.storage.onChanged.addListener(onChanged);
      return () => browser.storage.onChanged.removeListener(onChanged);
    },
    tabActivity,
    subscribeSelectionChanges(listener) {
      const onMessage = (message: unknown, sender: { tab?: { id?: number } }) => {
        const parsed = contentEventSchema.safeParse(message);
        const tabId = sender.tab?.id;
        if (parsed.success && parsed.data.type === 'SELECTION_CHANGED' && tabId !== undefined) listener(tabId, parsed.data.text);
        // Returning nothing leaves the response to the background service worker.
      };
      browser.runtime.onMessage.addListener(onMessage);
      return () => browser.runtime.onMessage.removeListener(onMessage);
    },
    captureVisibleTab,
    captureRegionScreenshot: async (tabId, labels) => {
      const result = await browser.tabs.sendMessage(tabId, {
        version: 1,
        requestId: globalThis.crypto?.randomUUID?.() ?? `screenshot-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: 'START_SCREENSHOT_SELECTION',
        instruction: labels.instruction,
        cancelHint: labels.cancelHint,
      }) as ScreenshotSelectionResult;
      if (result.cancelled) return undefined;
      return cropScreenshotDataUrl(await captureVisibleTab(tabId), result.region);
    },
  };
}

export default function App(props: AppProps) {
  const { messages: t } = useI18n();
  useEffect(() => { document.title = props.floatingTabId === undefined ? t.sidepanelTitle : t.floatingChatTitle; }, [props.floatingTabId, t]);
  const defaultDependencies = useMemo(() => (
    props.dependencies || hasPresentationOverrides(props) ? undefined : createDefaultDependencies(props.floatingTabId)
  ), [props.dependencies, props.floatingTabId]);
  const dependencies = props.dependencies ?? defaultDependencies;

  if (dependencies) return <ConnectedSidePanel dependencies={dependencies} />;
  return <SidePanelView {...props} />;
}
