import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';
import type { TabCandidate } from '../../shared/types/tab-mention';
import {
  filterTabCandidates,
  findMentionQuery,
  removeMentionQuery,
  type MentionQuery,
} from '../../entrypoints/sidepanel/utils/tab-mention';
import { SkillPicker, addSkillOptionId, skillOptionId } from './SkillPicker';
import { SkillEditorDialog, type SkillDraft } from './SkillEditorDialog';
import { filterSkills } from '../../shared/skills/skill-store';
import type { Skill } from '../../shared/types/skill';
import type { ShortcutButton } from './QuickActions';
import { ModelPicker } from './ModelPicker';
import { TabMentionPicker, tabOptionId, type TabPickerState } from './TabMentionPicker';
import { useI18n } from '../../shared/i18n/I18nProvider';
import { isImageAttachment, type ChatAttachment } from '../../shared/types/chat';
import type { ScreenshotCaptureMode } from '../../shared/types/screenshot';

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (message: string) => void;
  streaming?: boolean;
  onStop?: () => void;
  stopDisabled?: boolean;
  disabled?: boolean;
  model?: string;
  models?: string[];
  modelLoading?: boolean;
  modelDisabled?: boolean;
  onModelChange?: (model: string) => void;
  attachments?: ChatAttachment[];
  attachmentError?: string;
  attachmentBusy?: boolean;
  screenshotBusy?: boolean;
  onSelectFiles?: (files: File[]) => void;
  onCaptureScreenshot?: (mode: ScreenshotCaptureMode) => void;
  onRemoveAttachment?: (id: string) => void;
  pageActionsEnabled?: boolean;
  pageActionsDisabled?: boolean;
  onPageActionsEnabledChange?: (enabled: boolean) => void;
  context?: ReactNode;
  tabMention?: TabMentionOptions;
  /** User-defined skills offered when the user types “/”. */
  skills?: Skill[];
  /** The skill applied to the next message, shown as “/name” at the start of the input. */
  selectedSkill?: Skill;
  onSelectSkill?: (skill: Skill | undefined) => void;
  onSaveSkill?: (draft: SkillDraft) => Promise<Skill> | Skill;
  onDeleteSkill?: (id: string) => Promise<void> | void;
  /** Opens the skill settings from “+” → Skills → Manage skills. */
  onManageSkills?: () => void;
  /** New chat shortcuts chosen in settings, offered under “+” → New chat shortcuts. */
  newChatShortcuts?: ShortcutButton[];
  newChatShortcutsDisabled?: boolean;
  /** Opens the general settings from “+” → New chat shortcuts → Manage shortcuts. */
  onManageNewChatShortcuts?: () => void;
}

export interface TabMentionOptions {
  /** Loads tab candidates; may request the optional "tabs" permission on first use. */
  loadCandidates(): Promise<TabCandidate[] | undefined>;
  /** Same list, but resolves undefined instead of prompting when access was never granted. */
  peekCandidates?(): Promise<TabCandidate[] | undefined>;
  onSelect(tab: TabCandidate): void;
  /** Removes a tab that is already shared; used by the checkmarks in the “+” menu. */
  onDeselect?(tab: TabCandidate): void;
  selectedTabIds: number[];
  faviconFor?: (url: string) => string | undefined;
}

const TEXTAREA_MAX_ROWS = 6;
const MENU_TAB_LIMIT = 3;
const TAB_PICKER_ID = 'composer-tab-picker';
const SKILL_PICKER_ID = 'composer-skill-picker';
const HINT_ROTATE_MS = 10_000;
// Matches the popover’s close animation in sidepanel.css.
const MENU_CLOSE_MS = 160;

function PlusIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12 14-7-4 14-3-5-7-2Z" />
      <path d="m12 14 7-9" />
    </svg>
  );
}

function StopIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5" /></svg>;
}

function AttachmentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m8.5 12.5 6.2-6.2a3.5 3.5 0 0 1 5 5l-8.1 8.1a5 5 0 0 1-7.1-7.1l8-8" />
      <path d="m7.8 15.2 8.4-8.4" />
    </svg>
  );
}

function FileIcon({ name }: { name: string }) {
  const extension = name.includes('.') ? name.split('.').pop()?.slice(0, 4).toUpperCase() : 'FILE';
  return <span className="composer-attachment__file-icon" aria-hidden="true">{extension || 'FILE'}</span>;
}

function RegionScreenshotIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 4H5a1 1 0 0 0-1 1v3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
      <rect x="8" y="8" width="8" height="8" rx="1" />
    </svg>
  );
}

function PageActionIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 3 11 9-5 1.5L9.5 19 6 3Z" />
      <path d="m13 14 4 5" />
    </svg>
  );
}

function TabPageIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h7A2.5 2.5 0 0 1 16 6.5v7a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 4 13.5v-7Z" />
      <path d="M8 4v5h8" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7" />
      <path d="m6.8 10.2 2.2 2.2 4.2-4.4" />
    </svg>
  );
}

function CloseIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8m0-8-8 8" /></svg>;
}

function ChevronRightIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 6 4 4-4 4" /></svg>;
}

function MoreIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10h.01M10 10h.01M15 10h.01" /></svg>;
}

/** Current tab first, then other readable tabs, as offered directly in the “+” menu. */
function menuTabsFrom(tabs: TabCandidate[]): TabCandidate[] {
  const readable = tabs.filter((tab) => tab.supported);
  return [...readable.filter((tab) => tab.active), ...readable.filter((tab) => !tab.active)].slice(0, MENU_TAB_LIMIT);
}

/** Every tab for the “Add more tabs” submenu: current tab first, unreadable tabs last. */
function allTabsMenuOrder(tabs: TabCandidate[]): TabCandidate[] {
  const rank = (tab: TabCandidate) => (tab.active ? 0 : tab.supported ? 1 : 2);
  return [...tabs].sort((a, b) => rank(a) - rank(b));
}

function SkillsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5.5 3.5h7.5a1.5 1.5 0 0 1 1.5 1.5v11.5H6.5a1.5 1.5 0 0 1-1.5-1.5V4a.5.5 0 0 1 .5-.5Z" />
      <path d="M5 14.5a1.5 1.5 0 0 1 1.5-1.5h8M8 7h4M8 9.5h4" />
    </svg>
  );
}

function BoltIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M11.2 2.5 4.8 11h4.6l-1 6.5L15.2 9h-4.6l.6-6.5Z" /></svg>;
}

function ExternalLinkIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M11 4h5v5M16 4l-7 7" />
      <path d="M14 11.5V15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3.5" />
    </svg>
  );
}

export function ChatComposer({
  value,
  onChange,
  onSend,
  streaming = false,
  onStop,
  stopDisabled = false,
  disabled = false,
  model = 'AI Gateway',
  models = [],
  modelLoading = false,
  modelDisabled = false,
  onModelChange,
  attachments = [],
  attachmentError,
  attachmentBusy = false,
  screenshotBusy = false,
  onSelectFiles,
  onCaptureScreenshot,
  onRemoveAttachment,
  pageActionsEnabled = false,
  pageActionsDisabled = false,
  onPageActionsEnabledChange,
  context,
  tabMention,
  skills = [],
  selectedSkill,
  onSelectSkill,
  onSaveSkill,
  onDeleteSkill,
  onManageSkills,
  newChatShortcuts,
  newChatShortcutsDisabled = false,
  onManageNewChatShortcuts,
}: ChatComposerProps) {
  const { messages } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const toolsButtonRef = useRef<HTMLButtonElement>(null);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  // Keeps the popover mounted while it shrinks back into the “+” button.
  const [toolsMenuClosing, setToolsMenuClosing] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);
  const [menuTabList, setMenuTabList] = useState<TabCandidate[]>([]);
  // Which page of the “+” menu is showing: the main list or a submenu.
  const [menuView, setMenuView] = useState<'main' | 'tabs' | 'skills' | 'shortcuts'>('main');
  const [allTabsState, setAllTabsState] = useState<TabPickerState>({ status: 'loading' });
  const allTabsLoadRef = useRef(0);
  // Long text wraps the single-line input; once it does, stay multiline until
  // the draft is cleared so the layout does not flip back and forth.
  const [wrapped, setWrapped] = useState(false);
  const multiline = value.includes('\n') || (wrapped && value.length > 0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionLoadRef = useRef(0);
  const [mention, setMention] = useState<MentionQuery>();
  const [pickerState, setPickerState] = useState<TabPickerState>({ status: 'loading' });
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const pickerCandidates = pickerState.status === 'ready'
    ? filterTabCandidates(pickerState.candidates, mention?.query ?? '')
    : [];
  const pickerOpen = Boolean(mention && tabMention);
  const [skillQuery, setSkillQuery] = useState<MentionQuery>();
  const [activeSkillIndex, setActiveSkillIndex] = useState(0);
  const skillCandidates = skillQuery ? filterSkills(skills, skillQuery.query) : [];
  const skillPickerOpen = Boolean(skillQuery && onSelectSkill);
  // The “Add skill” row sits after the matching skills.
  const skillRowCount = skillCandidates.length + (onSaveSkill ? 1 : 0);
  const activeSkillRow = Math.min(activeSkillIndex, Math.max(0, skillRowCount - 1));
  const [skillEditor, setSkillEditor] = useState<SkillDraft>();
  // The “/query” the editor was opened from: a new skill replaces it, otherwise the picker reopens.
  const pendingSkillQueryRef = useRef<MentionQuery | undefined>(undefined);
  const menuTabs = menuTabsFrom(menuTabList);
  const canSend = (value.trim().length > 0 || attachments.length > 0 || Boolean(selectedSkill)) && !disabled;
  const toolsDisabled = disabled || streaming || attachmentBusy;
  const modelOptions = Array.from(new Set([model, ...models].map((item) => item.trim()).filter(Boolean)));

  const hints = messages.composerHints;
  const placeholder = hints[hintIndex % hints.length] ?? '';
  const rotateHints = !value && hints.length > 1;

  useEffect(() => {
    if (!rotateHints) return undefined;
    // Show one hint at a time instead of cramming them into one placeholder.
    const timer = setInterval(() => setHintIndex((index) => (index + 1) % hints.length), HINT_ROTATE_MS);
    return () => clearInterval(timer);
  }, [rotateHints, hints.length]);

  useEffect(() => {
    if (!toolsMenuClosing) return undefined;
    const timer = setTimeout(() => {
      setToolsMenuClosing(false);
      setMenuView('main');
    }, MENU_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [toolsMenuClosing]);

  useEffect(() => {
    if (!toolsMenuOpen) return undefined;

    // Only peek: opening “+” must never trigger a permission prompt.
    const peek = tabMention?.peekCandidates;
    if (peek) {
      let live = true;
      void peek().then((tabs) => { if (live) setMenuTabList(tabs ?? []); }).catch(() => { if (live) setMenuTabList([]); });
      return () => { live = false; };
    }
    return undefined;
  }, [toolsMenuOpen, tabMention]);

  useEffect(() => {
    if (!toolsMenuOpen) return;
    const firstItem = toolsMenuRef.current?.querySelector<HTMLElement>('[role^="menuitem"]:not(:disabled)');
    firstItem?.focus();
  }, [toolsMenuOpen, menuView]);

  useEffect(() => {
    if (!toolsMenuOpen) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!toolsMenuRef.current?.contains(event.target as Node)) closeToolsMenu();
    }
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return;
      closeToolsMenu(true);
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [toolsMenuOpen]);

  function openToolsMenu() {
    setToolsMenuClosing(false);
    setMenuView('main');
    setToolsMenuOpen(true);
  }

  function showAllTabs() {
    if (!tabMention) return;
    setMenuView('tabs');
    setAllTabsState({ status: 'loading' });
    // A click here may ask for the optional "tabs" permission.
    const load = ++allTabsLoadRef.current;
    void tabMention.loadCandidates().then((candidates) => {
      if (load !== allTabsLoadRef.current) return;
      setAllTabsState(candidates ? { status: 'ready', candidates } : { status: 'denied' });
      if (candidates) setMenuTabList(candidates);
    }).catch(() => {
      if (load === allTabsLoadRef.current) setAllTabsState({ status: 'denied' });
    });
  }

  /** Shares or unshares a tab from the “+” menu; the menu stays open so several tabs can be picked. */
  function toggleMenuTab(tab: TabCandidate) {
    if (!tabMention || !tab.supported) return;
    if (tabMention.selectedTabIds.includes(tab.tabId)) tabMention.onDeselect?.(tab);
    else tabMention.onSelect(tab);
  }

  function renderMenuTab(tab: TabCandidate) {
    if (!tabMention) return null;
    const selected = tabMention.selectedTabIds.includes(tab.tabId);
    const icon = tabMention.faviconFor?.(tab.url);
    return (
      <button
        key={tab.tabId}
        type="button"
        role="menuitemcheckbox"
        aria-checked={selected}
        className="composer-menu__item"
        disabled={!tab.supported}
        title={tab.supported ? tab.title || tab.url : messages.tabUnsupported}
        onClick={() => toggleMenuTab(tab)}
      >
        <span className="composer-menu__icon" aria-hidden="true">
          {icon ? <img src={icon} alt="" width={16} height={16} /> : <TabPageIcon />}
        </span>
        <span className="composer-menu__label">
          <span className="composer-menu__title">{tab.title || tab.url}</span>
          {tab.active ? <span className="composer-menu__meta"> · {messages.currentTabLabel}</span> : null}
        </span>
        {selected ? <span className="composer-menu__trail composer-menu__trail--check" aria-hidden="true"><CheckCircleIcon /></span> : null}
      </button>
    );
  }

  function closeToolsMenu(restoreFocus = false) {
    setToolsMenuOpen(false);
    setToolsMenuClosing(true);
    if (restoreFocus) toolsButtonRef.current?.focus();
  }

  function chooseMenuSkill(skill: Skill) {
    closeToolsMenu();
    applySkill(skill, undefined);
  }

  function chooseShortcut(shortcut: ShortcutButton) {
    closeToolsMenu();
    shortcut.run();
  }

  function chooseScreenshotMode(mode: ScreenshotCaptureMode) {
    closeToolsMenu();
    onCaptureScreenshot?.(mode);
  }

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    // Grow with the draft up to a fixed number of lines, then scroll inside.
    textarea.style.height = 'auto';
    const styles = globalThis.getComputedStyle?.(textarea);
    const lineHeight = Number.parseFloat(styles?.lineHeight ?? '') || 22;
    const padding = (Number.parseFloat(styles?.paddingTop ?? '') || 0) + (Number.parseFloat(styles?.paddingBottom ?? '') || 0);
    const maxHeight = lineHeight * TEXTAREA_MAX_ROWS + padding;
    if (!value) {
      // An empty draft stays one line even if the placeholder would wrap.
      textarea.style.removeProperty('height');
      textarea.style.overflowY = 'hidden';
      setWrapped(false);
    } else if (textarea.scrollHeight > 0) {
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
      textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
      if (textarea.scrollHeight > lineHeight * 1.5 + padding) setWrapped(true);
    } else {
      textarea.style.removeProperty('height');
    }
  }, [value, multiline]);

  function openTabPicker(next: MentionQuery) {
    if (!tabMention) return;
    const alreadyOpen = Boolean(mention);
    setMention(next);
    if (alreadyOpen) return;
    setActiveTabIndex(0);
    setPickerState({ status: 'loading' });
    const load = ++mentionLoadRef.current;
    void tabMention.loadCandidates().then((candidates) => {
      if (load !== mentionLoadRef.current) return;
      setPickerState(candidates ? { status: 'ready', candidates } : { status: 'denied' });
    }).catch(() => {
      if (load === mentionLoadRef.current) setPickerState({ status: 'denied' });
    });
  }

  function closeTabPicker() {
    mentionLoadRef.current += 1;
    setMention(undefined);
  }

  function updateMention(nextValue: string, caret: number) {
    if (onSelectSkill) {
      const slash = findMentionQuery(nextValue, caret, '/');
      if (slash && !skillQuery) setActiveSkillIndex(0);
      setSkillQuery(slash);
    }
    if (!tabMention) return;
    const query = findMentionQuery(nextValue, caret);
    if (query) openTabPicker(query);
    else if (mention) closeTabPicker();
  }

  function applySkill(skill: Skill, query: MentionQuery | undefined) {
    if (query && value.slice(query.start, query.end) === `/${query.query}`) {
      const next = removeMentionQuery(value, query);
      onChange(next.value);
      requestAnimationFrame(() => textareaRef.current?.setSelectionRange(next.caret, next.caret));
    }
    setSkillQuery(undefined);
    onSelectSkill?.(skill);
    textareaRef.current?.focus();
  }

  function chooseSkill(skill: Skill) {
    if (!skillQuery || !onSelectSkill) return;
    applySkill(skill, skillQuery);
  }

  function openSkillEditor(draft: SkillDraft) {
    pendingSkillQueryRef.current = skillQuery;
    setSkillQuery(undefined);
    setSkillEditor(draft);
  }

  async function saveSkill(draft: SkillDraft) {
    if (!onSaveSkill) return;
    const saved = await onSaveSkill(draft);
    if (!draft.id) {
      applySkill(saved, pendingSkillQueryRef.current);
      pendingSkillQueryRef.current = undefined;
    } else if (selectedSkill?.id === saved.id) onSelectSkill?.(saved);
  }

  async function deleteSkill(id: string) {
    await onDeleteSkill?.(id);
    if (selectedSkill?.id === id) onSelectSkill?.(undefined);
  }

  function closeSkillEditor() {
    const query = pendingSkillQueryRef.current;
    pendingSkillQueryRef.current = undefined;
    setSkillEditor(undefined);
    if (query && value.slice(query.start, query.end) === `/${query.query}`) setSkillQuery(query);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function chooseTab(tab: TabCandidate) {
    if (!tab.supported || !tabMention) return;
    if (mention) {
      const next = removeMentionQuery(value, mention);
      onChange(next.value);
      requestAnimationFrame(() => textareaRef.current?.setSelectionRange(next.caret, next.caret));
    }
    closeTabPicker();
    tabMention.onSelect(tab);
    textareaRef.current?.focus();
  }

  function submit() {
    const message = value.trim();
    if (message || attachments.length > 0 || selectedSkill) onSend(message);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (skillPickerOpen && !event.nativeEvent.isComposing) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (skillRowCount === 0) return;
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActiveSkillIndex((activeSkillRow + step + skillRowCount) % skillRowCount);
        return;
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && skillRowCount > 0) {
        event.preventDefault();
        const skill = skillCandidates[activeSkillRow];
        if (skill) chooseSkill(skill);
        else openSkillEditor({ name: skillQuery?.query ?? '', prompt: '' });
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setSkillQuery(undefined);
        return;
      }
    }
    if (pickerOpen && !event.nativeEvent.isComposing) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (pickerCandidates.length === 0) return;
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActiveTabIndex((index) => (index + step + pickerCandidates.length) % pickerCandidates.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const candidate = pickerCandidates[Math.min(activeTabIndex, pickerCandidates.length - 1)];
        if (candidate) {
          event.preventDefault();
          chooseTab(candidate);
          return;
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeTabPicker();
        return;
      }
    }
    if (
      event.key === 'Backspace'
      && selectedSkill
      && event.currentTarget.selectionStart === 0
      && event.currentTarget.selectionEnd === 0
    ) {
      // Backspace right after the “/skill” token removes the skill.
      event.preventDefault();
      onSelectSkill?.(undefined);
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!streaming && canSend) submit();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length) onSelectFiles?.(files);
  }

  return (
    <>
    <form className="chat-composer" aria-label={messages.sendMessage} onSubmit={(event) => { event.preventDefault(); if (!streaming && canSend) submit(); }}>
      {context}

      {attachments.length > 0 ? (
        <div className="composer-attachments" aria-label={messages.uploadAttachments}>
          {attachments.map((attachment) => (
            <figure className={`composer-attachment ${isImageAttachment(attachment) ? '' : 'composer-attachment--file'}`} key={attachment.id}>
              {isImageAttachment(attachment)
                ? <img src={attachment.dataUrl} alt={attachment.name} />
                : <FileIcon name={attachment.name} />}
              <figcaption title={attachment.name}>{attachment.name}</figcaption>
              <button
                type="button"
                aria-label={messages.removeAttachment(attachment.name)}
                disabled={toolsDisabled}
                onClick={() => onRemoveAttachment?.(attachment.id)}
              >
                <CloseIcon />
              </button>
            </figure>
          ))}
        </div>
      ) : null}

      {pickerOpen && tabMention ? (
        <TabMentionPicker
          id={TAB_PICKER_ID}
          state={pickerState.status === 'ready' ? { status: 'ready', candidates: pickerCandidates } : pickerState}
          activeIndex={Math.min(activeTabIndex, Math.max(0, pickerCandidates.length - 1))}
          selectedTabIds={tabMention.selectedTabIds}
          faviconFor={tabMention.faviconFor}
          onHover={setActiveTabIndex}
          onSelect={chooseTab}
        />
      ) : null}
      {skillPickerOpen ? (
        <SkillPicker
          id={SKILL_PICKER_ID}
          skills={skillCandidates}
          activeIndex={activeSkillRow}
          onHover={setActiveSkillIndex}
          onSelect={chooseSkill}
          onEdit={(skill) => openSkillEditor({ id: skill.id, name: skill.name, prompt: skill.prompt })}
          onAdd={() => openSkillEditor({ name: skillQuery?.query ?? '', prompt: '' })}
        />
      ) : null}

      <div className={`chat-composer__row ${multiline ? 'chat-composer__row--multiline' : ''}`}>
        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.doc,.docx,.xls,.xlsx,.txt,.log,.md,.markdown,.csv,.tsv,.json,.xml,.html,.htm"
          multiple
          disabled={toolsDisabled}
          onChange={handleFileChange}
        />
        <div ref={toolsMenuRef} className="composer-menu">
          <button
            ref={toolsButtonRef}
            className={`composer-tool-button ${toolsMenuOpen ? 'composer-tool-button--open' : ''}`}
            type="button"
            aria-label={messages.composerTools}
            title={messages.composerTools}
            aria-haspopup="menu"
            aria-expanded={toolsMenuOpen}
            aria-controls="composer-tools-menu"
            disabled={toolsDisabled}
            onClick={() => (toolsMenuOpen ? closeToolsMenu() : openToolsMenu())}
          >
            {attachmentBusy || screenshotBusy
              ? <span className="composer-tool-spinner" aria-hidden="true" />
              : <span className="composer-tool-button__icon" aria-hidden="true"><PlusIcon /></span>}
          </button>
          {toolsMenuOpen || toolsMenuClosing ? (
            <div
              id="composer-tools-menu"
              className={`composer-menu__popover ${toolsMenuOpen ? '' : 'composer-menu__popover--closing'}`}
              role={toolsMenuOpen ? 'menu' : undefined}
              aria-label={toolsMenuOpen ? messages.composerTools : undefined}
              aria-hidden={toolsMenuOpen ? undefined : true}
              inert={!toolsMenuOpen}
            >
              {menuView === 'skills' ? (
                <>
                  <button type="button" role="menuitem" className="composer-menu__item composer-menu__item--back" onClick={() => setMenuView('main')}>
                    <span className="composer-menu__icon composer-menu__icon--flip" aria-hidden="true"><ChevronRightIcon /></span>
                    <span className="composer-menu__label">{messages.menuBack}</span>
                  </button>
                  {skills.length === 0 ? <p className="composer-menu__note">{messages.noSkills}</p> : null}
                  {skills.map((skill) => (
                    <button
                      key={skill.id}
                      type="button"
                      role="menuitem"
                      className="composer-menu__item"
                      title={skill.prompt}
                      onClick={() => chooseMenuSkill(skill)}
                    >
                      <span className="composer-menu__icon composer-menu__icon--skill" aria-hidden="true"><BoltIcon /></span>
                      <span className="composer-menu__label">{skill.name}</span>
                    </button>
                  ))}
                  {onManageSkills ? (
                    <>
                      <div className="composer-menu__divider" role="separator" />
                      <button
                        type="button"
                        role="menuitem"
                        className="composer-menu__item"
                        onClick={() => {
                          closeToolsMenu();
                          onManageSkills();
                        }}
                      >
                        <span className="composer-menu__icon" aria-hidden="true"><ExternalLinkIcon /></span>
                        <span className="composer-menu__label">{messages.manageSkills}</span>
                      </button>
                    </>
                  ) : null}
                </>
              ) : menuView === 'shortcuts' && newChatShortcuts ? (
                <>
                  <button type="button" role="menuitem" className="composer-menu__item composer-menu__item--back" onClick={() => setMenuView('main')}>
                    <span className="composer-menu__icon composer-menu__icon--flip" aria-hidden="true"><ChevronRightIcon /></span>
                    <span className="composer-menu__label">{messages.menuBack}</span>
                  </button>
                  {newChatShortcuts.length === 0 ? <p className="composer-menu__note">{messages.noNewChatShortcuts}</p> : null}
                  {newChatShortcuts.map((shortcut) => (
                    <button
                      key={shortcut.key}
                      type="button"
                      role="menuitem"
                      className="composer-menu__item"
                      title={shortcut.title}
                      disabled={newChatShortcutsDisabled}
                      onClick={() => chooseShortcut(shortcut)}
                    >
                      <span className="composer-menu__icon composer-menu__icon--skill" aria-hidden="true"><BoltIcon /></span>
                      <span className="composer-menu__label">{shortcut.label}</span>
                    </button>
                  ))}
                  {onManageNewChatShortcuts ? (
                    <>
                      <div className="composer-menu__divider" role="separator" />
                      <button
                        type="button"
                        role="menuitem"
                        className="composer-menu__item"
                        onClick={() => {
                          closeToolsMenu();
                          onManageNewChatShortcuts();
                        }}
                      >
                        <span className="composer-menu__icon" aria-hidden="true"><ExternalLinkIcon /></span>
                        <span className="composer-menu__label">{messages.manageNewChatShortcuts}</span>
                      </button>
                    </>
                  ) : null}
                </>
              ) : menuView === 'tabs' && tabMention ? (
                <>
                  <button type="button" role="menuitem" className="composer-menu__item composer-menu__item--back" onClick={() => setMenuView('main')}>
                    <span className="composer-menu__icon composer-menu__icon--flip" aria-hidden="true"><ChevronRightIcon /></span>
                    <span className="composer-menu__label">{messages.menuBack}</span>
                  </button>
                  {allTabsState.status === 'loading' ? <p className="composer-menu__note">{messages.tabPickerLoading}</p> : null}
                  {allTabsState.status === 'denied' ? <p className="composer-menu__note">{messages.tabPickerPermissionDenied}</p> : null}
                  {allTabsState.status === 'ready' && allTabsState.candidates.length === 0
                    ? <p className="composer-menu__note">{messages.tabPickerEmpty}</p>
                    : null}
                  {allTabsState.status === 'ready' ? allTabsMenuOrder(allTabsState.candidates).map(renderMenuTab) : null}
                </>
              ) : (
                <>
                  {tabMention ? (
                    <>
                      {menuTabs.map(renderMenuTab)}
                      <button
                        type="button"
                        role="menuitem"
                        className="composer-menu__item"
                        aria-haspopup="menu"
                        onClick={showAllTabs}
                      >
                        <span className="composer-menu__icon" aria-hidden="true"><MoreIcon /></span>
                        <span className="composer-menu__label">{messages.addMoreTabs}</span>
                        <span className="composer-menu__trail" aria-hidden="true"><ChevronRightIcon /></span>
                      </button>
                      <div className="composer-menu__divider" role="separator" />
                    </>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    className="composer-menu__item"
                    disabled={screenshotBusy || !onCaptureScreenshot}
                    onClick={() => chooseScreenshotMode('region')}
                  >
                    <span className="composer-menu__icon" aria-hidden="true"><RegionScreenshotIcon /></span>
                    <span className="composer-menu__label">{messages.selectFromScreen}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="composer-menu__item"
                    onClick={() => {
                      closeToolsMenu();
                      fileInputRef.current?.click();
                    }}
                  >
                    <span className="composer-menu__icon" aria-hidden="true"><AttachmentIcon /></span>
                    <span className="composer-menu__label">{messages.uploadFiles}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={pageActionsEnabled}
                    className="composer-menu__item"
                    title={pageActionsEnabled ? messages.pageActionsEnabledHint : messages.pageActionsHint}
                    disabled={pageActionsDisabled}
                    onClick={() => {
                      closeToolsMenu();
                      onPageActionsEnabledChange?.(!pageActionsEnabled);
                    }}
                  >
                    <span className="composer-menu__icon" aria-hidden="true"><PageActionIcon /></span>
                    <span className="composer-menu__label">{messages.pageActions}</span>
                    {pageActionsEnabled ? <span className="composer-menu__trail composer-menu__trail--check" aria-hidden="true"><CheckCircleIcon /></span> : null}
                  </button>
                  {newChatShortcuts || onSelectSkill ? <div className="composer-menu__divider" role="separator" /> : null}
                  {newChatShortcuts ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="composer-menu__item"
                      aria-haspopup="menu"
                      onClick={() => setMenuView('shortcuts')}
                    >
                      <span className="composer-menu__icon" aria-hidden="true"><BoltIcon /></span>
                      <span className="composer-menu__label">{messages.composerShortcutsMenu}</span>
                      <span className="composer-menu__trail" aria-hidden="true"><ChevronRightIcon /></span>
                    </button>
                  ) : null}
                  {onSelectSkill ? (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        className="composer-menu__item"
                        aria-haspopup="menu"
                        onClick={() => setMenuView('skills')}
                      >
                        <span className="composer-menu__icon" aria-hidden="true"><SkillsIcon /></span>
                        <span className="composer-menu__label">{messages.skillsMenu}</span>
                        <span className="composer-menu__trail" aria-hidden="true"><ChevronRightIcon /></span>
                      </button>
                    </>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </div>

        <label className="sr-only" htmlFor="chat-message">{messages.message}</label>
        <div className="composer-input">
        {selectedSkill ? (
          <button
            type="button"
            className="composer-skill-token"
            title={selectedSkill.prompt}
            aria-label={messages.removeSkill(selectedSkill.name)}
            disabled={disabled}
            onClick={() => {
              onSelectSkill?.(undefined);
              textareaRef.current?.focus();
            }}
          >
            /{selectedSkill.name}
          </button>
        ) : null}
        <textarea
          ref={textareaRef}
          id="chat-message"
          rows={1}
          value={value}
          placeholder={placeholder}
          title={tabMention ? messages.addTabHint : undefined}
          disabled={disabled}
          role={tabMention || onSelectSkill ? 'combobox' : undefined}
          aria-autocomplete={tabMention || onSelectSkill ? 'list' : undefined}
          aria-expanded={tabMention || onSelectSkill ? pickerOpen || skillPickerOpen : undefined}
          aria-controls={skillPickerOpen ? SKILL_PICKER_ID : pickerOpen ? TAB_PICKER_ID : undefined}
          aria-activedescendant={skillPickerOpen && skillRowCount > 0
            ? skillCandidates[activeSkillRow]
              ? skillOptionId(SKILL_PICKER_ID, skillCandidates[activeSkillRow]!.id)
              : addSkillOptionId(SKILL_PICKER_ID)
            : pickerOpen && pickerCandidates[activeTabIndex]
              ? tabOptionId(TAB_PICKER_ID, pickerCandidates[activeTabIndex]!.tabId)
              : undefined}
          onChange={(event) => {
            onChange(event.target.value);
            updateMention(event.target.value, event.target.selectionStart ?? event.target.value.length);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (pickerOpen) closeTabPicker();
            setSkillQuery(undefined);
          }}
        />
        </div>

        {pageActionsEnabled ? (
          <button
            className="page-action-chip"
            type="button"
            aria-label={messages.disablePageActions}
            title={messages.pageActionsEnabledHint}
            onClick={() => onPageActionsEnabledChange?.(false)}
          >
            <PageActionIcon />
            <CloseIcon />
          </button>
        ) : null}
        <ModelPicker
          model={model}
          models={modelOptions}
          disabled={modelDisabled || modelLoading || modelOptions.length === 0}
          onChange={onModelChange}
        />
        {streaming ? (
          <button className="composer-action composer-action--stop" type="button" aria-label={messages.stopGenerating} onClick={onStop} disabled={stopDisabled}>
            <StopIcon />
            <span>{messages.stop}</span>
          </button>
        ) : (
          <button className="composer-action" type="submit" aria-label={messages.send} disabled={!canSend}>
            <SendIcon />
            <span>{messages.send}</span>
          </button>
        )}
      </div>

      {attachmentError ? <p className="composer-error" role="alert">{attachmentError}</p> : null}
    </form>
      {/* Outside the composer form: a nested form would submit the chat message. */}
      {skillEditor ? (
        <SkillEditorDialog
          draft={skillEditor}
          skills={skills}
          onSave={saveSkill}
          onDelete={onDeleteSkill ? deleteSkill : undefined}
          onClose={closeSkillEditor}
        />
      ) : null}
    </>
  );
}
