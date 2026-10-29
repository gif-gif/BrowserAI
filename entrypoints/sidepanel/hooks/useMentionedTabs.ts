import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RuntimeCommand } from '../../../messaging/contracts';
import { MAX_SHARED_TABS } from '../../../shared/constants/context-limits';
import { normalizeError } from '../../../shared/errors/app-error';
import type { MentionedTab, TabCandidate, TabContextSummary } from '../../../shared/types/tab-mention';

export interface TabMentionSource {
  /** Lists tabs in the current window. Resolves undefined when the optional "tabs" permission is denied. */
  listTabs(): Promise<TabCandidate[] | undefined>;
  /** Lists tabs only if access was already granted; never prompts. */
  peekTabs?(): Promise<TabCandidate[] | undefined>;
  /** Requests the optional host permission for the tab's site. Must run inside the selecting user gesture. */
  requestSiteAccess(url: string): Promise<boolean>;
  subscribeTabRemoved?(listener: (tabId: number) => void): () => void;
  faviconFor?(url: string): string | undefined;
}

interface UseMentionedTabsOptions {
  conversationId?: string;
  currentTabId?: number;
  source?: TabMentionSource;
  runtime: { send(command: RuntimeCommand): Promise<unknown> };
  createRequestId: () => string;
  messages: {
    tabSitePermissionDenied: string;
    tabContextFailed: string;
    tabLimitReached: (max: number) => string;
  };
  localizeError: (error: ReturnType<typeof normalizeError>) => string;
}

export interface MentionedTabsResult {
  tabs: MentionedTab[];
  error?: string;
  add(tab: TabCandidate): void;
  remove(tabId: number): void;
  clearError(): void;
  /** Tab ids to send; failed tabs are skipped so they never block a message. */
  sendableTabIds: number[];
}

/**
 * Tabs shared with “@” stay attached to a conversation until the user removes
 * them. State lives only in Side Panel memory: page text stays in the service
 * worker and is re-extracted at send time.
 */
export function useMentionedTabs({
  conversationId,
  currentTabId,
  source,
  runtime,
  createRequestId,
  messages,
  localizeError,
}: UseMentionedTabsOptions): MentionedTabsResult {
  const [byConversation, setByConversation] = useState<Record<string, MentionedTab[]>>({});
  const [error, setError] = useState<string>();
  const conversationRef = useRef(conversationId);
  conversationRef.current = conversationId;

  const update = useCallback((targetConversation: string, change: (tabs: MentionedTab[]) => MentionedTab[]) => {
    setByConversation((current) => ({ ...current, [targetConversation]: change(current[targetConversation] ?? []) }));
  }, []);

  useEffect(() => {
    if (!source?.subscribeTabRemoved) return undefined;
    return source.subscribeTabRemoved((tabId) => {
      setByConversation((current) => Object.fromEntries(
        Object.entries(current).map(([id, tabs]) => [id, tabs.filter((tab) => tab.tabId !== tabId)]),
      ));
    });
  }, [source]);

  useEffect(() => { setError(undefined); }, [conversationId]);

  const allTabs = conversationId ? byConversation[conversationId] ?? [] : [];
  // The current tab is already represented by the page context card.
  const tabs = useMemo(() => allTabs.filter((tab) => tab.tabId !== currentTabId), [allTabs, currentTabId]);

  const add = useCallback((candidate: TabCandidate) => {
    const targetConversation = conversationRef.current;
    if (!targetConversation || !source || candidate.tabId === currentTabId) return;
    const existing = byConversation[targetConversation] ?? [];
    if (existing.some((tab) => tab.tabId === candidate.tabId)) return;
    if (existing.filter((tab) => tab.tabId !== currentTabId).length >= MAX_SHARED_TABS) {
      setError(messages.tabLimitReached(MAX_SHARED_TABS));
      return;
    }
    setError(undefined);
    const tabId = candidate.tabId;
    const setTab = (patch: Partial<MentionedTab>) => update(
      targetConversation,
      (current) => current.map((tab) => (tab.tabId === tabId ? { ...tab, ...patch } : tab)),
    );
    update(targetConversation, (current) => [
      ...current,
      { tabId, title: candidate.title, url: candidate.url, status: 'loading' },
    ]);

    // Request site access synchronously inside the user gesture that selected the tab.
    const access = source.requestSiteAccess(candidate.url);
    void (async () => {
      try {
        if (!await access) {
          setTab({ status: 'error', errorMessage: messages.tabSitePermissionDenied });
          return;
        }
        const summary = await runtime.send({
          version: 1,
          requestId: createRequestId(),
          type: 'EXTRACT_TAB_CONTEXT',
          tabId,
        }) as TabContextSummary;
        setTab({
          status: 'ready',
          title: summary.title || candidate.title,
          url: summary.url || candidate.url,
          snapshotId: summary.snapshotId,
          truncated: summary.truncated,
          errorMessage: undefined,
        });
      } catch (caught) {
        setTab({ status: 'error', errorMessage: localizeError(normalizeError(caught)) || messages.tabContextFailed });
      }
    })();
  }, [byConversation, createRequestId, currentTabId, localizeError, messages, runtime, source, update]);

  const remove = useCallback((tabId: number) => {
    const targetConversation = conversationRef.current;
    if (!targetConversation) return;
    setError(undefined);
    update(targetConversation, (current) => current.filter((tab) => tab.tabId !== tabId));
  }, [update]);

  const sendableTabIds = useMemo(
    () => tabs.filter((tab) => tab.status !== 'error').map((tab) => tab.tabId),
    [tabs],
  );

  return { tabs, error, add, remove, clearError: () => setError(undefined), sendableTabIds };
}
