import { useEffect, useRef } from 'react';
import { useI18n } from '../../shared/i18n/I18nProvider';
import type { TabCandidate } from '../../shared/types/tab-mention';

export type TabPickerState =
  | { status: 'loading' }
  | { status: 'denied' }
  | { status: 'ready'; candidates: TabCandidate[] };

interface TabMentionPickerProps {
  id: string;
  state: TabPickerState;
  activeIndex: number;
  selectedTabIds: number[];
  faviconFor?: (url: string) => string | undefined;
  onHover: (index: number) => void;
  onSelect: (tab: TabCandidate) => void;
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function CheckIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.2 2.8 2.8 6.2-6.2" /></svg>;
}

export function tabOptionId(pickerId: string, tabId: number) {
  return `${pickerId}-tab-${tabId}`;
}

export function TabMentionPicker({
  id,
  state,
  activeIndex,
  selectedTabIds,
  faviconFor,
  onHover,
  onSelect,
}: TabMentionPickerProps) {
  const { messages } = useI18n();
  const listRef = useRef<HTMLDivElement>(null);
  const candidates = state.status === 'ready' ? state.candidates : [];

  useEffect(() => {
    const active = candidates[activeIndex];
    if (!active) return;
    const option = listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(tabOptionId(id, active.tabId))}`);
    option?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, candidates, id]);

  return (
    <div className="tab-picker" role="presentation">
      <div className="tab-picker__heading">{messages.tabPicker}</div>
      {state.status === 'loading' && <p className="tab-picker__empty">{messages.tabPickerLoading}</p>}
      {state.status === 'denied' && <p className="tab-picker__empty">{messages.tabPickerPermissionDenied}</p>}
      {state.status === 'ready' && candidates.length === 0 && <p className="tab-picker__empty">{messages.tabPickerEmpty}</p>}
      {candidates.length > 0 && (
        <div ref={listRef} id={id} className="tab-picker__list" role="listbox" aria-label={messages.tabPicker}>
          {candidates.map((tab, index) => {
            const selected = selectedTabIds.includes(tab.tabId);
            const icon = faviconFor?.(tab.url);
            return (
              <div
                key={tab.tabId}
                id={tabOptionId(id, tab.tabId)}
                role="option"
                aria-selected={index === activeIndex}
                aria-disabled={!tab.supported}
                className={[
                  'tab-picker__option',
                  index === activeIndex ? 'tab-picker__option--active' : '',
                  tab.supported ? '' : 'tab-picker__option--disabled',
                ].join(' ').trim()}
                onMouseEnter={() => onHover(index)}
                onMouseDown={(event) => {
                  // Keep focus in the textarea so the draft caret is preserved.
                  event.preventDefault();
                  if (tab.supported) onSelect(tab);
                }}
              >
                <span className="tab-picker__icon" aria-hidden="true">
                  {icon ? <img src={icon} alt="" width={16} height={16} /> : null}
                </span>
                <span className="tab-picker__text">
                  <strong>{tab.title || hostname(tab.url)}</strong>
                  <small>{tab.supported ? hostname(tab.url) : messages.tabUnsupported}</small>
                </span>
                {tab.active && <span className="context-item__badge context-item__badge--current">{messages.currentTabBadge}</span>}
                {selected && <span className="tab-picker__check" aria-hidden="true"><CheckIcon /></span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
