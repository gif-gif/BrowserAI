import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useI18n } from '../../shared/i18n/I18nProvider';

interface ModelComboboxProps {
  id: string;
  value: string;
  models: string[];
  disabled?: boolean;
  invalid?: boolean;
  onChange(value: string): void;
}

function ChevronIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg>;
}

function SearchIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5" /><path d="m13 13 3.5 3.5" /></svg>;
}

function CheckIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10.5 3.2 3.2L15 7" /></svg>;
}

/**
 * Model ID input with a searchable popover for fetched models, matching the composer's picker.
 * Free text stays allowed so custom model IDs can still be typed.
 */
export function ModelCombobox({ id, value, models, disabled = false, invalid = false, onChange }: ModelComboboxProps) {
  const { messages } = useI18n();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const hasModels = models.length > 0;

  const options = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? models.filter((item) => item.toLowerCase().includes(needle)) : models;
  }, [models, query]);

  useEffect(() => {
    if (!hasModels || disabled) setOpen(false);
  }, [disabled, hasModels]);

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
    if (!hasModels || disabled) return;
    setQuery('');
    setActiveIndex(Math.max(0, models.indexOf(value)));
    setOpen(true);
  }

  function close(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) inputRef.current?.focus();
  }

  function choose(item: string) {
    onChange(item);
    close(true);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!hasModels || open) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openPicker();
    }
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
    <div ref={rootRef} className={`model-combobox${hasModels ? ' model-combobox--has-models' : ''}`}>
      <input
        ref={inputRef}
        id={id}
        value={value}
        disabled={disabled}
        placeholder={messages.modelPlaceholder}
        aria-invalid={invalid}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleInputKeyDown}
      />
      {hasModels && (
        <button
          className="model-combobox__toggle"
          type="button"
          disabled={disabled}
          aria-label={messages.modelPickerLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onClick={() => (open ? close(false) : openPicker())}
        >
          <ChevronIcon />
        </button>
      )}
      {hasModels && open && (
        <div className="model-combobox__panel" role="dialog" aria-label={messages.modelPickerLabel}>
          <label className="model-combobox__search">
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
          <div ref={listRef} id={listId} className="model-combobox__list" role="listbox" aria-label={messages.modelPickerLabel}>
            {options.length === 0 && <p className="model-combobox__empty">{messages.modelSearchNoMatch}</p>}
            {options.map((item, index) => (
              <div
                key={item}
                id={`${listId}-${index}`}
                data-index={index}
                role="option"
                aria-selected={item === value}
                title={item}
                className={`model-combobox__option${index === activeIndex ? ' model-combobox__option--active' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(item)}
              >
                <span className="model-combobox__name">{item}</span>
                {item === value && <span className="model-combobox__check" aria-hidden="true"><CheckIcon /></span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
