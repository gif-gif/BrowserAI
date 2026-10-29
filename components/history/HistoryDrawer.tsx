import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../shared/i18n/I18nProvider';
import type { Conversation } from '../../shared/types/chat';
import type { RetentionChangeResult, RetentionDays } from '../../shared/types/storage';
import { Select } from '../ui/Select';
import { ConversationRow } from './ConversationRow';

interface HistoryDrawerProps {
  open: boolean;
  conversations: Conversation[];
  activeConversationId?: string;
  retentionDays: RetentionDays;
  loading?: boolean;
  deletingIds?: string[];
  errorMessage?: string;
  onClose(): void;
  onOpenConversation(id: string): void;
  onPinConversation(id: string, pinned: boolean): void;
  onDeleteConversation(id: string): void;
  onClearAll(): void;
  onRequestRetentionChange(days: RetentionDays, confirmed: boolean): Promise<RetentionChangeResult>;
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>;
}

export function HistoryDrawer({
  open,
  conversations,
  activeConversationId,
  retentionDays,
  loading = false,
  deletingIds = [],
  errorMessage,
  onClose,
  onOpenConversation,
  onPinConversation,
  onDeleteConversation,
  onClearAll,
  onRequestRetentionChange,
}: HistoryDrawerProps) {
  const { messages } = useI18n();
  const retentionOptions: Array<{ value: RetentionDays; label: string }> = [
    { value: 0, label: messages.retentionNever },
    { value: 7, label: messages.retentionDays(7) },
    { value: 30, label: messages.retentionDays(30) },
    { value: 90, label: messages.retentionDays(90) },
    { value: -1, label: messages.retentionForever },
  ];
  const [pendingChange, setPendingChange] = useState<{ days: RetentionDays; affectedCount: number }>();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sorted = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations],
  );

  async function requestRetention(days: RetentionDays) {
    const result = await onRequestRetentionChange(days, false);
    if (result.requiresConfirmation) {
      setPendingChange({ days, affectedCount: result.affectedCount });
    } else {
      setPendingChange(undefined);
    }
  }

  async function confirmRetention() {
    if (!pendingChange) return;
    await onRequestRetentionChange(pendingChange.days, true);
    setPendingChange(undefined);
  }

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="history-overlay">
      <button className="history-scrim" type="button" aria-label={messages.closeConversationHistory} onClick={onClose} />
      <aside className="history-drawer" role="dialog" aria-modal="true" aria-label={messages.conversationHistory}>
        <header className="history-drawer__header">
          <div>
            <h2>{messages.conversationHistory}</h2>
            <span>{messages.localDeviceOnly}</span>
          </div>
          <button ref={closeButtonRef} className="icon-button" type="button" aria-label={messages.closeHistory} onClick={onClose}><CloseIcon /></button>
        </header>

        <div className="history-retention">
          <Select
            id="history-retention"
            label={messages.retentionPeriod}
            value={String(retentionDays)}
            options={retentionOptions.map((option) => ({ value: String(option.value), label: option.label }))}
            onChange={(next) => { void requestRetention(Number(next) as RetentionDays); }}
          />
        </div>

        <div className="history-drawer__toolbar">
          <span>{messages.conversationCount(sorted.length)}</span>
          <button type="button" onClick={onClearAll} disabled={sorted.every((item) => item.pinned)}>{messages.clearUnpinnedHistory}</button>
        </div>

        {errorMessage && <p className="history-error" role="alert">{errorMessage}</p>}

        {loading ? (
          <p className="history-empty" aria-live="polite">{messages.loadingHistory}</p>
        ) : sorted.length === 0 ? (
          <p className="history-empty">{messages.noHistory}</p>
        ) : (
          <ul className="history-list">
            {sorted.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                active={conversation.id === activeConversationId}
                deleting={deletingIds.includes(conversation.id)}
                onOpen={onOpenConversation}
                onPin={onPinConversation}
                onDelete={onDeleteConversation}
              />
            ))}
          </ul>
        )}

        {pendingChange && (
          <div className="retention-confirm" role="alertdialog" aria-modal="true" aria-label={messages.shortenRetentionAria}>
            <strong>{messages.shortenRetentionTitle}</strong>
            <p>{messages.shortenRetentionBody(pendingChange.affectedCount)}</p>
            <div>
              <button type="button" onClick={() => setPendingChange(undefined)}>{messages.cancel}</button>
              <button type="button" className="danger-button" aria-label={messages.shortenRetentionAria} onClick={() => { void confirmRetention(); }}>{messages.confirmDelete}</button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
