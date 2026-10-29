import { useCallback, useState } from 'react';
import type { Conversation } from '../../../shared/types/chat';
import type { ActiveTabState } from '../../../shared/types/tab-state';
import type { RetentionChangeResult, RetentionDays } from '../../../shared/types/storage';
import { normalizeError, type AppError } from '../../../shared/errors/app-error';
import type { RuntimeSender } from './useActiveTabState';

interface HistorySnapshot {
  conversations: Conversation[];
  retentionDays: RetentionDays;
}

interface DeleteConversationResult {
  deleted: true;
  activeState?: ActiveTabState;
}

interface ClearConversationsResult {
  deletedIds: string[];
  activeState?: ActiveTabState;
}

interface UseHistoryOptions {
  runtime: RuntimeSender;
  createRequestId(): string;
  tabId?: number;
  activeConversationId?: string;
  onConversationChanged(nextState?: ActiveTabState): Promise<unknown> | unknown;
}

export function useHistory({
  runtime,
  createRequestId,
  tabId,
  activeConversationId,
  onConversationChanged,
}: UseHistoryOptions) {
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [retentionDays, setRetentionDays] = useState<RetentionDays>(30);
  const [loading, setLoading] = useState(false);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [error, setError] = useState<AppError>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await runtime.send({
        version: 1,
        requestId: createRequestId(),
        type: 'LIST_CONVERSATIONS',
      }) as HistorySnapshot;
      setConversations(result.conversations);
      setRetentionDays(result.retentionDays);
      return result;
    } catch (caught) {
      setError(normalizeError(caught));
      return undefined;
    } finally {
      setLoading(false);
    }
  }, [createRequestId, runtime]);

  const openHistory = useCallback(() => {
    setOpen(true);
    void load();
  }, [load]);

  const closeHistory = useCallback(() => setOpen(false), []);

  const openConversation = useCallback(async (conversationId: string) => {
    if (tabId === undefined) return;
    setLoading(true);
    setError(undefined);
    try {
      const nextState = await runtime.send({
        version: 1,
        requestId: createRequestId(),
        type: 'OPEN_CONVERSATION',
        tabId,
        conversationId,
      }) as ActiveTabState;
      await onConversationChanged(nextState);
      setOpen(false);
    } catch (caught) {
      setError(normalizeError(caught));
    } finally {
      setLoading(false);
    }
  }, [createRequestId, onConversationChanged, runtime, tabId]);

  const pinConversation = useCallback(async (conversationId: string, pinned: boolean) => {
    setError(undefined);
    try {
      await runtime.send({
        version: 1,
        requestId: createRequestId(),
        type: 'PIN_CONVERSATION',
        conversationId,
        pinned,
      });
      setConversations((current) => current.map((conversation) => (
        conversation.id === conversationId ? { ...conversation, pinned } : conversation
      )));
    } catch (caught) {
      setError(normalizeError(caught));
    }
  }, [createRequestId, runtime]);

  const deleteConversation = useCallback(async (conversationId: string) => {
    if (deletingIds.includes(conversationId)) return;
    setError(undefined);
    setDeletingIds((current) => [...current, conversationId]);
    try {
      const result = await runtime.send({
        version: 1,
        requestId: createRequestId(),
        type: 'DELETE_CONVERSATION',
        conversationId,
        ...(tabId === undefined ? {} : { tabId }),
      }) as DeleteConversationResult;
      setConversations((current) => current.filter((conversation) => conversation.id !== conversationId));
      if (conversationId === activeConversationId) await onConversationChanged(result.activeState);
    } catch (caught) {
      setError(normalizeError(caught));
    } finally {
      setDeletingIds((current) => current.filter((id) => id !== conversationId));
    }
  }, [activeConversationId, createRequestId, deletingIds, onConversationChanged, runtime, tabId]);

  const clearAll = useCallback(async () => {
    setError(undefined);
    try {
      const result = await runtime.send({
        version: 1,
        requestId: createRequestId(),
        type: 'CLEAR_CONVERSATIONS',
        ...(tabId === undefined ? {} : { tabId }),
      }) as ClearConversationsResult;
      setConversations((current) => current.filter((conversation) => !result.deletedIds.includes(conversation.id)));
      if (activeConversationId && result.deletedIds.includes(activeConversationId)) {
        await onConversationChanged(result.activeState);
      }
    } catch (caught) {
      setError(normalizeError(caught));
    }
  }, [activeConversationId, createRequestId, onConversationChanged, runtime, tabId]);

  const requestRetentionChange = useCallback(async (
    days: RetentionDays,
    confirmed: boolean,
  ): Promise<RetentionChangeResult> => {
    try {
      const result = await runtime.send({
        version: 1,
        requestId: createRequestId(),
        type: 'SET_RETENTION',
        retentionDays: days,
        confirmed,
      }) as RetentionChangeResult;
      if (!result.requiresConfirmation) {
        setRetentionDays(result.retentionDays);
        await load();
      }
      return result;
    } catch (caught) {
      const normalized = normalizeError(caught);
      setError(normalized);
      throw normalized;
    }
  }, [createRequestId, load, runtime]);

  return {
    open,
    conversations,
    retentionDays,
    loading,
    deletingIds,
    error,
    openHistory,
    closeHistory,
    openConversation,
    pinConversation,
    deleteConversation,
    clearAll,
    requestRetentionChange,
  };
}
