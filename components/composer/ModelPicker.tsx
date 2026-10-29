import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useI18n } from '../../shared/i18n/I18nProvider';

interface ModelPickerProps {
  model: string;
  models: string[];
  disabled?: boolean;
  onChange?: (model: string) => void;
}

function ChevronDownIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg>;
}

function SearchIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5" /><path d="m13 13 3.5 3.5" /></svg>;
}

function CheckIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10.5 3.2 3.2L15 7" /></svg>;
}

/** Compact model switcher for the composer: a small popover with a search box instead of a native select. */
export function ModelPicker({ model, models, disabled = false, onChange }: ModelPickerProps) {
  const { messages } = useI18n();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const options = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? models.filter((item) => item.toLowerCase().includes(needle)) : models;
  }, [models, query]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return undefined;
    searchRef.current?.focus();
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, open]);

  function openPicker() {
    if (disabled) return;
    setQuery('');
    setActiveIndex(Math.max(0, models.indexOf(model)));
    setOpen(true);
  }

  function close(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function choose(item: string) {
    if (item !== model) onChange?.(item);
    close(true);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!options.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((index) => (index + step + options.length) % options.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = options[activeIndex];
      if (item) choose(item);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  }

  const activeOption = options[activeIndex] ? `${listId}-${activeIndex}` : undefined;

  return (
    <div className="model-selector" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`model-selector__trigger${open ? ' model-selector__trigger--open' : ''}`}
        title={messages.currentModel(model)}
        aria-label={`${messages.model}: ${model}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => (open ? close(false) : openPicker())}
      >
        <span className="model-selector__value">{model}</span>
        <span className="model-selector__chevron" aria-hidden="true"><ChevronDownIcon /></span>
      </button>
      {open ? (
        <div className="model-picker" role="dialog" aria-label={messages.model}>
          <label className="model-picker__search">
            <SearchIcon />
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder={messages.modelSearchPlaceholder}
              aria-label={messages.modelSearchPlaceholder}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={activeOption}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
              onKeyDown={handleSearchKeyDown}
            />
          </label>
          <div ref={listRef} id={listId} className="model-picker__list" role="listbox" aria-label={messages.model}>
            {options.length === 0 ? <p className="model-picker__empty">{messages.modelSearchNoMatch}</p> : null}
            {options.map((item, index) => (
              <div
                key={item}
                id={`${listId}-${index}`}
                data-index={index}
                role="option"
                aria-selected={item === model}
                title={item}
                className={`model-picker__option${index === activeIndex ? ' model-picker__option--active' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(item)}
              >
                <span className="model-picker__name">{item}</span>
                {item === model ? <span className="model-picker__check" aria-hidden="true"><CheckIcon /></span> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
