import { useI18n } from '../../shared/i18n/I18nProvider';
import type { ChatMessage } from '../../shared/types/chat';
import { MessageItem } from './MessageItem';

interface MessageListProps {
  messages: ChatMessage[];
  onRetry?: (userMessageId: string) => void;
}

export function MessageList({ messages, onRetry }: MessageListProps) {
  const { messages: t } = useI18n();
  let latestUserMessageId: string | undefined;

  return (
    <section className="message-list" aria-label={t.conversationMessages} aria-live="polite" aria-relevant="additions text">
      {messages.map((message) => {
        if (message.role === 'user') latestUserMessageId = message.id;
        return (
          <MessageItem
            key={message.id}
            message={message}
            retryUserMessageId={message.role === 'assistant' ? latestUserMessageId : undefined}
            onRetry={onRetry}
          />
        );
      })}
    </section>
  );
}
