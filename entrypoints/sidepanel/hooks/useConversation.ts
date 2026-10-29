import { useCallback, useMemo, useState } from 'react';
import type { SidePanelStreamState } from '../state/chat-stream-reducer';
import type { ChatMessage, Conversation, ChatAttachment } from '../../../shared/types/chat';
import type { SkillInvocation } from '../../../shared/types/skill';

interface OptimisticTurn {
  requestId: string;
  text: string;
  attachments?: ChatAttachment[];
  skill?: SkillInvocation;
  createdAt: number;
}

interface UseConversationOptions {
  conversation?: Conversation;
  stream: SidePanelStreamState;
}

export function useConversation({ conversation, stream }: UseConversationOptions) {
  const [optimisticTurn, setOptimisticTurn] = useState<OptimisticTurn>();

  const beginOptimisticTurn = useCallback((text: string, requestId: string, attachments?: ChatAttachment[], skill?: SkillInvocation) => {
    setOptimisticTurn({
      requestId,
      text,
      ...(attachments?.length ? { attachments } : {}),
      ...(skill ? { skill } : {}),
      createdAt: Date.now(),
    });
  }, []);

  const resetOptimistic = useCallback(() => setOptimisticTurn(undefined), []);

  const messages = useMemo(() => {
    const persisted = conversation?.messages ?? [];
    if (!optimisticTurn || optimisticTurn.requestId !== stream.requestId) return persisted;

    const userMessage: ChatMessage = {
      id: `optimistic-user-${optimisticTurn.requestId}`,
      role: 'user',
      content: optimisticTurn.text,
      ...(optimisticTurn.attachments?.length ? { attachments: optimisticTurn.attachments } : {}),
      ...(optimisticTurn.skill ? { skill: optimisticTurn.skill } : {}),
      status: 'complete',
      createdAt: optimisticTurn.createdAt,
    };
    const assistantStatus: ChatMessage['status'] = stream.status === 'failed'
      ? 'failed'
      : stream.status === 'cancelled'
        ? 'cancelled'
        : stream.status === 'completed'
          ? 'complete'
          : 'streaming';
    const assistantMessage: ChatMessage = {
      id: `optimistic-assistant-${optimisticTurn.requestId}`,
      role: 'assistant',
      content: stream.text,
      status: assistantStatus,
      ...(stream.images.length ? { attachments: stream.images } : {}),
      ...(stream.error ? { error: stream.error } : {}),
      createdAt: optimisticTurn.createdAt + 1,
    };
    return [...persisted, userMessage, assistantMessage];
  }, [conversation?.messages, optimisticTurn, stream]);

  return { messages, beginOptimisticTurn, resetOptimistic };
}
