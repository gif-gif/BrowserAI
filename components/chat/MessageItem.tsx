import { memo } from 'react';
import { useI18n } from '../../shared/i18n/I18nProvider';
import { localizeError } from '../../shared/i18n/locale';
import { isImageAttachment, type ChatMessage } from '../../shared/types/chat';
import { MessageActions } from './MessageActions';
import { SafeMarkdown } from './SafeMarkdown';
import { StreamingIndicator, useBatchedStreamingText } from './StreamingIndicator';

interface MessageItemProps {
  message: ChatMessage;
  retryUserMessageId?: string;
  onRetry?: (userMessageId: string) => void;
}

function MessageItemView({ message, retryUserMessageId, onRetry }: MessageItemProps) {
  const { messages } = useI18n();
  const contextLabels = { page: messages.currentPage, selection: messages.selectedText } as const;
  const visibleContent = useBatchedStreamingText(message.content, message.status === 'streaming');
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const roleLabel = isUser ? messages.you : isAssistant ? messages.ai : messages.system;
  const retryable = isAssistant && (message.status === 'failed' || message.status === 'cancelled');

  return (
    <article className={`message message--${message.role} message--${message.status}`} aria-label={messages.messageFrom(roleLabel)}>
      <div className="message__meta">
        <span className="message__author">{roleLabel}</span>
        {message.status === 'cancelled' && <span className="message__state">{messages.generationStopped}</span>}
      </div>

      {message.attachments?.length ? (
        <div className={`message__attachments ${message.attachments.length === 1 ? 'message__attachments--single' : ''}`}>
          {message.attachments.map((attachment) => isImageAttachment(attachment) ? (
            <img
              className={`message__attachment-image ${attachment.source === 'generated' ? 'message__attachment-image--generated' : ''}`}
              key={attachment.id}
              src={attachment.dataUrl}
              alt={attachment.name}
            />
          ) : (
            <div className="message__attachment-file" key={attachment.id} title={attachment.name}>
              <span className="message__attachment-file-icon" aria-hidden="true">DOC</span>
              <span>{attachment.name}</span>
              {attachment.truncated ? <small>{messages.attachmentContentTruncated}</small> : null}
            </div>
          ))}
        </div>
      ) : null}

      {message.skill ? (
        <div className="message__skill" title={message.skill.prompt}>/{message.skill.name}</div>
      ) : null}

      {visibleContent && (
        <div className="message__content">
          <SafeMarkdown content={visibleContent} />
        </div>
      )}

      {message.status === 'streaming' && <StreamingIndicator />}

      {message.status === 'failed' && (
        <div className="message__error" role="alert">
          <strong>{messages.generationFailed}</strong>
          <span>{message.error ? localizeError(message.error, messages) : messages.requestFailedRetry}</span>
        </div>
      )}

      {message.source && (
        <footer className="message__source">
          <span>{messages.source}：{message.source.pageTitle}</span>
          <span aria-hidden="true">·</span>
          <span>
            {[
              ...message.source.contextTypes.map((type) => contextLabels[type]),
              ...(message.source.pageTruncated ? [messages.truncated] : []),
            ].join(' · ')}
          </span>
          {message.source.additionalPages?.map((page) => (
            <span key={page.pageUrl} className="message__source-page">
              <span aria-hidden="true">·</span> {page.pageTitle}{page.pageTruncated ? ` · ${messages.truncated}` : ''}
            </span>
          ))}
        </footer>
      )}

      {isAssistant && message.status !== 'streaming' && (
        <MessageActions
          content={visibleContent}
          retryUserMessageId={retryable ? retryUserMessageId : undefined}
          onRetry={onRetry}
        />
      )}
    </article>
  );
}

export const MessageItem = memo(MessageItemView);
