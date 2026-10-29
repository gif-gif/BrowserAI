import { useI18n } from '../../shared/i18n/I18nProvider';
import { getMessages } from '../../shared/i18n/locale';
import type { AppMessages } from '../../shared/i18n/messages';
import type { PageContextState } from '../../shared/types/tab-state';

interface ContextStatusProps { context: PageContextState }
export interface ContextStatusView { label: string; detail: string; tone: 'neutral' | 'ready' | 'warning' | 'unavailable' }

export function getContextStatusView(context: PageContextState, messages: AppMessages = getMessages()): ContextStatusView {
  if (context.status === 'preparing') return { label: messages.currentPagePreparing, detail: messages.currentPagePreparingDetail, tone: 'neutral' };
  if (context.status === 'changed') return { label: messages.currentPageChanged, detail: messages.currentPageChangedDetail, tone: 'warning' };
  if (context.status === 'unavailable') {
    const detail = context.reason === 'PAGE_PERMISSION_REQUIRED'
      ? messages.pagePermissionRequiredDetail
      : context.reason === 'CONTEXT_EXTRACTION_FAILED'
        ? messages.contextExtractionFailedDetail
        : context.message ?? messages.pageUnsupportedDetail;
    return { label: messages.currentPageUnavailable, detail, tone: 'unavailable' };
  }
  if (context.snapshot.metadata.truncated) return { label: messages.currentPageTruncated, detail: messages.currentPageTruncatedDetail, tone: 'warning' };
  return { label: messages.currentPage, detail: messages.currentPageReadyDetail, tone: 'ready' };
}

export function ContextStatus({ context }: ContextStatusProps) {
  const { messages } = useI18n();
  const view = getContextStatusView(context, messages);
  return <span className={`context-status context-status--${view.tone}`} title={view.detail}><span className="context-status__dot" aria-hidden="true" />{view.label}</span>;
}
