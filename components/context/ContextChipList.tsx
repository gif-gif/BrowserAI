import { useState } from 'react';
import { useI18n } from '../../shared/i18n/I18nProvider';
import type { MentionedTab } from '../../shared/types/tab-mention';
import type { PageContextState } from '../../shared/types/tab-state';
import { getContextStatusView, type ContextStatusView } from './ContextStatus';

interface ContextChipListProps {
  context?: PageContextState;
  includePage?: boolean;
  selectionText?: string;
  mentionedTabs?: MentionedTab[];
  faviconFor?: (url: string) => string | undefined;
  onIncludePageChange?: (enabled: boolean) => void;
  onRemoveSelection?: () => void;
  onRemoveTab?: (tabId: number) => void;
}

interface SharedTabRow {
  key: string;
  title: string;
  url?: string;
  tone: ContextStatusView['tone'];
  detail?: string;
  status?: string;
  current: boolean;
  truncated: boolean;
  onRemove?: () => void;
}

function RemoveIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="m4.5 4.5 7 7m0-7-7 7" />
    </svg>
  );
}

function TabIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7" />
      <path d="M3 10h14M10 3c2 2 2.8 4.4 2.8 7s-.8 5-2.8 7M10 3c-2 2-2.8 4.4-2.8 7s.8 5 2.8 7" />
    </svg>
  );
}

function SelectionIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 5h12M4 9h12M4 13h7" />
      <path d="M14 12v5m-2.5-2.5h5" />
    </svg>
  );
}

function AddIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9" /></svg>;
}

function ChevronIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 12 4-4 4 4" /></svg>;
}

function TabFavicon({ url, faviconFor }: { url?: string; faviconFor?: (url: string) => string | undefined }) {
  const [failed, setFailed] = useState(false);
  const src = url && !failed ? faviconFor?.(url) : undefined;
  if (!src) return <span className="context-item__icon" aria-hidden="true"><TabIcon /></span>;
  return (
    <span className="context-item__icon" aria-hidden="true">
      <img src={src} alt="" width={16} height={16} onError={() => setFailed(true)} />
    </span>
  );
}

export function ContextChipList({
  context,
  includePage = true,
  selectionText,
  mentionedTabs = [],
  faviconFor,
  onIncludePageChange,
  onRemoveSelection,
  onRemoveTab,
}: ContextChipListProps) {
  const { messages } = useI18n();
  const [expanded, setExpanded] = useState(false);
  if (!context && !selectionText && mentionedTabs.length === 0) return null;

  const pageStatus = context ? getContextStatusView(context, messages) : undefined;
  const readySnapshot = context?.status === 'ready' ? context.snapshot : undefined;
  const pageTitle = readySnapshot ? readySnapshot.title.trim() || readySnapshot.url : undefined;

  const rows: SharedTabRow[] = [];
  if (context && pageStatus && includePage) {
    rows.push({
      key: 'current',
      title: pageTitle ?? pageStatus.label,
      url: readySnapshot?.url,
      tone: pageStatus.tone,
      detail: pageStatus.detail,
      current: true,
      truncated: Boolean(pageTitle && readySnapshot?.metadata.truncated),
      onRemove: onIncludePageChange ? () => onIncludePageChange(false) : undefined,
    });
  }
  for (const tab of mentionedTabs) {
    const title = tab.title.trim() || tab.url;
    rows.push({
      key: `tab-${tab.tabId}`,
      title,
      url: tab.url,
      tone: tab.status === 'error' ? 'unavailable' : tab.status === 'loading' ? 'neutral' : 'ready',
      detail: tab.errorMessage ?? tab.url,
      status: tab.status === 'loading'
        ? messages.tabContextLoading
        : tab.status === 'error'
          ? tab.errorMessage ?? messages.tabContextFailed
          : undefined,
      current: false,
      truncated: Boolean(tab.truncated),
      onRemove: onRemoveTab ? () => onRemoveTab(tab.tabId) : undefined,
    });
  }

  const grouped = rows.length > 1;
  const showRows = !grouped || expanded;

  function renderRow(row: SharedTabRow, single: boolean) {
    const label = single && (row.url || !row.current)
      ? messages.sharingTab(row.title)
      : row.title;
    return (
      <div key={row.key} className={`context-item context-item--${row.tone} ${single ? 'context-item--single' : 'context-item--row'}`} title={row.detail}>
        <TabFavicon url={row.url} faviconFor={faviconFor} />
        <span className="context-item__label">
          <span className="context-item__title">{label}</span>
          {!single && row.url && <span className="context-item__excerpt">{row.status ?? hostname(row.url)}</span>}
          {single && row.status && <span className="context-item__excerpt">{row.status}</span>}
        </span>
        {!single && row.current && <span className="context-item__badge context-item__badge--current">{messages.currentTabBadge}</span>}
        {row.truncated && <span className="context-item__badge">{messages.truncated}</span>}
        {row.onRemove && (
          <button
            className="context-item__remove"
            type="button"
            aria-label={row.current ? messages.removePageContext : messages.removeTabContext(row.title)}
            title={row.current ? messages.removePageContext : messages.removeTabContext(row.title)}
            onClick={row.onRemove}
          >
            <RemoveIcon />
          </button>
        )}
      </div>
    );
  }

  return (
    <section className="context-strip" aria-label={messages.conversationContext}>
      {grouped && (
        <div className={`context-group ${expanded ? 'context-group--expanded' : ''}`}>
          <button
            className="context-group__summary"
            type="button"
            aria-expanded={expanded}
            aria-controls="context-group-list"
            aria-label={expanded ? messages.collapseSharedTabs : messages.expandSharedTabs}
            data-tooltip={expanded ? messages.collapseSharedTabs : messages.expandSharedTabs}
            onClick={() => setExpanded((value) => !value)}
          >
            <span className="context-group__icons" aria-hidden="true">
              {rows.slice(0, 3).map((row) => <TabFavicon key={row.key} url={row.url} faviconFor={faviconFor} />)}
            </span>
            <span className="context-group__label">{messages.sharingTabs(rows.length)}</span>
            <span className="context-group__chevron" aria-hidden="true"><ChevronIcon /></span>
          </button>
          {showRows && (
            <div id="context-group-list" className="context-group__list">
              {rows.map((row) => renderRow(row, false))}
            </div>
          )}
        </div>
      )}
      {!grouped && rows.map((row) => renderRow(row, true))}
      {selectionText && (
        <div className="context-item context-item--selection" title={selectionText}>
          <span className="context-item__icon" aria-hidden="true"><SelectionIcon /></span>
          <span className="context-item__label">
            <strong>{messages.selectedText}</strong>
            <span className="context-item__excerpt">{selectionText}</span>
          </span>
          {onRemoveSelection && (
            <button className="context-item__remove" type="button" aria-label={messages.removeSelectionContext} title={messages.removeSelectionContext} onClick={onRemoveSelection}>
              <RemoveIcon />
            </button>
          )}
        </div>
      )}
      {context && !includePage && onIncludePageChange && (
        <button className="context-add" type="button" onClick={() => onIncludePageChange(true)}>
          <AddIcon />
          {messages.sharePageContext}
        </button>
      )}
    </section>
  );
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
