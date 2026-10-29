import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import './select.css';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Options sharing a group render under one heading, in first-seen order. */
  group?: string;
}

interface SelectProps<T extends string> {
  value: T;
  options: readonly SelectOption<T>[];
  /** Visible label above the trigger. Omit it and pass `ariaLabel` when the surrounding layout already names the field. */
  label?: string;
  ariaLabel?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  /** Adds a filter box at the top of the menu; the strings come from the caller so this component stays i18n-free. */
  search?: { placeholder: string; noMatch: string };
  onChange(value: T): void;
}

const MENU_GAP = 6;
const MENU_MAX_HEIGHT = 280;
const MENU_MIN_HEIGHT = 120;
const MENU_MIN_WIDTH = 160;
const VIEWPORT_MARGIN = 8;

function ChevronDownIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg>;
}

function SearchIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5" /><path d="m13 13 3.5 3.5" /></svg>;
}

function CheckIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10.5 3.2 3.2L15 7" /></svg>;
}

/**
 * Styled single-choice select shared by the side panel and options page. The menu drops down below the trigger
 * (flipping up only when the viewport has no room) instead of the native popup that covers the field. It is portaled
 * to `document.body` with fixed positioning so scrollable dialogs and drawers cannot clip it.
 */
export function Select<T extends string>({ value, options, label, ariaLabel, id, className, disabled = false, search, onChange }: SelectProps<T>) {
  const generatedId = useId();
  const idPrefix = id ?? generatedId;
  const listId = `${idPrefix}-list`;
  const labelId = `${idPrefix}-label`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [placement, setPlacement] = useState<{ up: boolean; style: CSSProperties }>({ up: false, style: { maxHeight: MENU_MAX_HEIGHT } });
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const visibleOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? options.filter((option) => option.label.toLowerCase().includes(needle)) : options;
  }, [options, query]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return undefined;
    function isInside(target: EventTarget | null) {
      return target instanceof Node && Boolean(rootRef.current?.contains(target) || menuRef.current?.contains(target));
    }
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!isInside(event.target)) setOpen(false);
    }
    // The fixed menu would detach from the trigger once something behind it scrolls or the panel resizes.
    function closeOnScroll(event: Event) {
      if (!isInside(event.target)) setOpen(false);
    }
    function closeOnResize() {
      setOpen(false);
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    window.addEventListener('scroll', closeOnScroll, true);
    window.addEventListener('resize', closeOnResize);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      window.removeEventListener('scroll', closeOnScroll, true);
      window.removeEventListener('resize', closeOnResize);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - MENU_GAP * 2;
    const above = rect.top - MENU_GAP * 2;
    const up = below < MENU_MIN_HEIGHT && above > below;
    const width = Math.max(rect.width, MENU_MIN_WIDTH);
    const left = Math.max(VIEWPORT_MARGIN, Math.min(rect.left, window.innerWidth - width - VIEWPORT_MARGIN));
    // The portaled menu no longer inherits size tokens set on the select's container.
    const fontSize = rootRef.current ? getComputedStyle(rootRef.current).getPropertyValue('--ui-select-font-size').trim() : '';
    setPlacement({
      up,
      style: {
        left,
        width,
        ...(fontSize ? { '--ui-select-font-size': fontSize } : {}),
        maxHeight: Math.max(MENU_MIN_HEIGHT, Math.min(MENU_MAX_HEIGHT, up ? above : below)),
        ...(up ? { bottom: window.innerHeight - rect.top + MENU_GAP } : { top: rect.bottom + MENU_GAP }),
      },
    });
    searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, open]);

  function openMenu() {
    if (disabled || !options.length) return;
    setQuery('');
    setActiveIndex(selectedIndex);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function choose(index: number) {
    const option = visibleOptions[index];
    if (!option) return;
    if (option.value !== value) onChange(option.value);
    close();
  }

  /** Shared by the trigger and the search box; `typing` leaves Space/Home/End to the text input. */
  function handleMenuKey(event: KeyboardEvent<HTMLElement>, typing: boolean) {
    const count = visibleOptions.length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!count) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((index) => (index + step + count) % count);
    } else if (!typing && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault();
      setActiveIndex(event.key === 'Home' ? 0 : count - 1);
    } else if (event.key === 'Enter' || (!typing && event.key === ' ')) {
      event.preventDefault();
      choose(activeIndex);
    } else if (event.key === 'Escape') {
      // Keep Escape from also closing a surrounding drawer or dialog.
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      close();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (open) {
      handleMenuKey(event, false);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openMenu();
    }
  }

  const activeOption = open && visibleOptions[activeIndex] ? `${idPrefix}-${activeIndex}` : undefined;

  return (
    <div className={`ui-select${open ? ' ui-select--open' : ''}${className ? ` ${className}` : ''}`} ref={rootRef}>
      {label ? <span id={labelId} className="ui-select__label">{label}</span> : null}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        className="ui-select__trigger"
        aria-label={label ? undefined : ariaLabel}
        aria-labelledby={label ? labelId : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={search ? undefined : activeOption}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleKeyDown}
      >
        <span className="ui-select__value">{options[selectedIndex]?.label}</span>
        <span className="ui-select__chevron" aria-hidden="true"><ChevronDownIcon /></span>
      </button>
      {open ? createPortal(
        <div
          ref={menuRef}
          className={`ui-select__menu${placement.up ? ' ui-select__menu--up' : ''}${search ? ' ui-select__menu--search' : ''}`}
          style={placement.style}
        >
          {search ? (
            <label className="ui-select__search">
              <SearchIcon />
              <input
                ref={searchRef}
                type="search"
                value={query}
                placeholder={search.placeholder}
                aria-label={search.placeholder}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded
                aria-controls={listId}
                aria-activedescendant={activeOption}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
                onKeyDown={(event) => handleMenuKey(event, true)}
              />
            </label>
          ) : null}
          <div ref={listRef} id={listId} className="ui-select__list" role="listbox" aria-label={label ?? ariaLabel}>
            {search && !visibleOptions.length ? <p className="ui-select__empty">{search.noMatch}</p> : null}
            {visibleOptions.map((option, index) => (
              <Fragment key={option.value}>
                {option.group && option.group !== visibleOptions[index - 1]?.group ? (
                  <div className="ui-select__group" role="presentation">{option.group}</div>
                ) : null}
                <div
                  id={`${idPrefix}-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={option.value === value}
                  title={option.label}
                  className={`ui-select__option${index === activeIndex ? ' ui-select__option--active' : ''}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(index)}
                >
                  <span className="ui-select__option-label">{option.label}</span>
                  <span className="ui-select__check" aria-hidden="true">{option.value === value ? <CheckIcon /> : null}</span>
                </div>
              </Fragment>
            ))}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
