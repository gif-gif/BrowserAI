import { useI18n } from '../../shared/i18n/I18nProvider';
import type { Conversation } from '../../shared/types/chat';

interface ConversationRowProps {
  conversation: Conversation;
  active?: boolean;
  deleting?: boolean;
  onOpen(id: string): void;
  onPin(id: string, pinned: boolean): void;
  onDelete(id: string): void;
}

function PinIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 4 6 0-.7 5 2.7 3v1H7v-1l2.7-3L9 4Z" /><path d="M12 13v7" /></svg>;
}

function DeleteIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M8 10v7m4-7v7m4-7v7M6 7l1 13h10l1-13" /></svg>;
}

export function ConversationRow({ conversation, active = false, deleting = false, onOpen, onPin, onDelete }: ConversationRowProps) {
  const { messages } = useI18n();
  return (
    <li className={`conversation-row ${active ? 'conversation-row--active' : ''}`} data-conversation-id={conversation.id}>
      <button
        className="conversation-row__open"
        type="button"
        aria-label={messages.openConversation(conversation.id)}
        onClick={() => onOpen(conversation.id)}
        disabled={deleting}
      >
        <strong>{conversation.title || messages.unnamedConversation}</strong>
        <span>{conversation.messages.at(-1)?.content || messages.noMessages}</span>
      </button>
      <div className="conversation-row__actions">
        <button
          type="button"
          aria-label={conversation.pinned ? messages.unpinConversation(conversation.id) : messages.pinConversation(conversation.id)}
          title={conversation.pinned ? messages.unpin : messages.pin}
          onClick={() => onPin(conversation.id, !conversation.pinned)}
          disabled={deleting}
        >
          <PinIcon />
        </button>
        <button
          type="button"
          aria-label={messages.deleteConversation(conversation.id)}
          title={deleting ? messages.deleting : messages.delete}
          onClick={() => onDelete(conversation.id)}
          disabled={deleting}
          aria-busy={deleting}
        >
          <DeleteIcon />
        </button>
      </div>
    </li>
  );
}
