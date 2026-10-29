import type { ConversationRepository } from '../../storage/conversation-repository';

export async function reconcileStaleStreams(
  conversations: ConversationRepository,
  options: { now?: number; thresholdMs?: number } = {},
): Promise<number> {
  const now = options.now ?? Date.now();
  const thresholdMs = options.thresholdMs ?? 60_000;
  let reconciled = 0;

  for (const conversation of await conversations.list()) {
    let changed = false;
    const messages = conversation.messages.map((message) => {
      if (message.status !== 'streaming' || now - message.createdAt < thresholdMs) return message;
      changed = true;
      reconciled += 1;
      return {
        ...message,
        status: 'failed' as const,
        error: {
          code: 'STREAM_INTERRUPTED' as const,
          message: '上次回答因扩展后台重启而中断，请重试',
          retryable: true,
        },
      };
    });
    if (changed) await conversations.save({ ...conversation, messages, updatedAt: now });
  }
  return reconciled;
}
