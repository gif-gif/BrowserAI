import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
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
  onChange(value: T): void;
}

const MENU_GAP = 6;
const MENU_MAX_HEIGHT = 280;
const MENU_MIN_HEIGHT = 120;

function ChevronDownIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg>;
}

function CheckIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10.5 3.2 3.2L15 7" /></svg>;
}

/**
 * Styled single-choice select shared by the side panel and options page. The menu drops down below the trigger
 * (flipping up only when the viewport has no room) instead of the native popup that covers the field.
 */
export function Select<T extends string>({ value, options, label, ariaLabel, id, className, disabled = false, onChange }: SelectProps<T>) {
  const generatedId = useId();
  const idPrefix = id ?? generatedId;
  const listId = `${idPrefix}-list`;
  const labelId = `${idPrefix}-label`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [placement, setPlacement] = useState<{ up: boolean; maxHeight: number }>({ up: false, maxHeight: MENU_MAX_HEIGHT });
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return undefined;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - MENU_GAP * 2;
    const above = rect.top - MENU_GAP * 2;
    const up = below < MENU_MIN_HEIGHT && above > below;
    setPlacement({ up, maxHeight: Math.max(MENU_MIN_HEIGHT, Math.min(MENU_MAX_HEIGHT, up ? above : below)) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, open]);

  function openMenu() {
    if (disabled || !options.length) return;
    setActiveIndex(selectedIndex);
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (option && option.value !== value) onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((index) => (index + step + options.length) % options.length);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActiveIndex(event.key === 'Home' ? 0 : options.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(activeIndex);
    } else if (event.key === 'Escape') {
      // Keep Escape from also closing a surrounding drawer or dialog.
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      setOpen(false);
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  }

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
        aria-activedescendant={open ? `${idPrefix}-${activeIndex}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleKeyDown}
      >
        <span className="ui-select__value">{options[selectedIndex]?.label}</span>
        <span className="ui-select__chevron" aria-hidden="true"><ChevronDownIcon /></span>
      </button>
      {open ? (
        <div
          ref={listRef}
          id={listId}
          className={`ui-select__menu${placement.up ? ' ui-select__menu--up' : ''}`}
          style={{ maxHeight: placement.maxHeight }}
          role="listbox"
          aria-label={label ?? ariaLabel}
        >
          {options.map((option, index) => (
            <Fragment key={option.value}>
              {option.group && option.group !== options[index - 1]?.group ? (
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
      ) : null}
    </div>
  );
}
