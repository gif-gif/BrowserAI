import type { AppMessages } from '../../shared/i18n/messages';
import type { ResolvedAppearance } from '../../shared/theme/appearance';
import type { ThemeTokens } from '../../shared/theme/theme';
import { WRITING_TONES, type WritingAssistResult, type WritingTone } from '../../shared/types/writing-assistant';
import type { SkillInvocation } from '../../shared/types/skill';
import { renderMarkdown } from './render-markdown';

type WritingAssistantMessages = Pick<AppMessages,
  | 'writingAssistantOpen'
  | 'writingAssistantTitle'
  | 'writingAssistantClose'
  | 'writingAssistantDescription'
  | 'writingAssistantTone'
  | 'writingTonePolish'
  | 'writingToneProfessional'
  | 'writingToneFriendly'
  | 'writingToneConcise'
  | 'writingAssistantContext'
  | 'writingAssistantContextPlaceholder'
  | 'writingAssistantGenerate'
  | 'writingAssistantGenerating'
  | 'writingAssistantResult'
  | 'writingAssistantHistory'
  | 'writingAssistantOriginal'
  | 'writingAssistantInputPlaceholder'
  | 'writingAssistantInsert'
  | 'writingAssistantInserted'
  | 'writingAssistantEmpty'
  | 'writingAssistantTargetMissing'
  | 'writingAssistantDeleteResult'
  | 'writingAssistantExpandResult'
  | 'writingAssistantCollapseResult'
  | 'model'
  | 'modelSearchPlaceholder'
  | 'modelSearchNoMatch'
  | 'copy'
  | 'copied'
>;

interface WritingAssistantHistoryItem {
  id: string;
  sourceText: string;
  resultText: string;
  tone: WritingTone;
  skillName?: string;
  model?: string;
  /** The selected range the source came from, replaced on insert. */
  sourceRange?: { start: number; end: number; selected: boolean };
  /** Without a selected source, the caret the page textarea had when the assistant opened. */
  insertAt?: { start: number; end: number };
}

/** A user “/” skill offered under the tones. */
export interface WritingAssistantSkill {
  id: string;
  name: string;
  prompt: string;
}

interface StyleOption {
  key: string;
  label: string;
  tone?: WritingTone;
  skill?: WritingAssistantSkill;
}

const SKILL_STYLE_PREFIX = 'skill:';
/** Results shown in full before the list starts scrolling. */
const VISIBLE_RESULTS = 3;

interface RewriteRequest {
  requestId: string;
  text: string;
  instruction?: string;
  model?: string;
  tone: WritingTone;
  skill?: SkillInvocation;
}

interface TextareaWritingAssistantOptions {
  document: Document;
  window: Window;
  messages: WritingAssistantMessages;
  loadMessages?(): Promise<WritingAssistantMessages>;
  loadModels?(): Promise<{ model: string; models: string[] }>;
  /** The user's saved “/” skills, read through the background each time the assistant opens. */
  loadSkills?(): Promise<WritingAssistantSkill[]>;
  requestRewrite(request: RewriteRequest): Promise<WritingAssistResult>;
  createRequestId?: () => string;
}

const STYLE = `
  :host {
    all: initial;
    --ai-accent: #0b57d0;
    --ai-accent-hover: #0842a0;
    --ai-accent-soft: #e8f0fe;
    --ai-focus: rgba(11, 87, 208, .25);
    --ai-surface: rgba(255,255,255,.99);
    --ai-surface-subtle: #f7f8fa;
    --ai-surface-hover: #f1f3f5;
    --ai-text: #202124;
    --ai-text-secondary: #5f6368;
    --ai-border: #e1e4e8;
    color-scheme: light dark;
  }
  * { box-sizing: border-box; }
  button, input, select, textarea { font: inherit; }
  button { -webkit-tap-highlight-color: transparent; }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .launcher {
    position: fixed;
    z-index: 2147483646;
    display: none;
    width: 24px;
    height: 24px;
    padding: 0;
    align-items: center;
    justify-content: center;
    appearance: none;
    border: 0;
    border-radius: 7px;
    color: #000;
    background: transparent;
    cursor: pointer;
    pointer-events: auto;
    transition: transform 140ms ease, opacity 160ms ease;
  }
  .launcher:hover { opacity: .7; }
  .launcher:active { transform: scale(.94); }
  .launcher svg { width: 16px; height: 16px; overflow: visible; filter: drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff); }
  .logo-c { fill: none; stroke: currentColor; stroke-width: 50; stroke-linecap: round; }
  .logo-spark { fill: currentColor; }
  .panel {
    position: fixed;
    z-index: 2147483647;
    display: none;
    width: min(460px, calc(100vw - 24px));
    max-height: min(680px, calc(100vh - 24px));
    max-height: min(680px, calc(100dvh - 24px));
    overflow: hidden;
    border: 1px solid var(--ai-border);
    border-radius: 20px;
    color: var(--ai-text);
    background: var(--ai-surface);
    box-shadow: 0 22px 64px rgba(15,23,42,.20), 0 5px 18px rgba(15,23,42,.10);
    font: 400 14px/1.5 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, "Noto Sans SC", sans-serif;
    pointer-events: auto;
    animation: ai-writing-enter 180ms cubic-bezier(.2,.8,.2,1);
  }
  @keyframes ai-writing-enter { from { opacity: 0; transform: translateY(6px) scale(.985); } to { opacity: 1; transform: none; } }
  /* Same layout as the side panel's writing dialog: header, then one column
     of source, pickers, context box and results. The panel is only as tall as
     its content; positionPanel() caps it to the viewport. */
  .panel-layout {
    display: grid;
    width: 100%;
    height: 100%;
    min-height: 0;
    max-height: inherit;
    overflow: hidden;
    grid-template-rows: auto minmax(0, 1fr);
  }
  .header {
    min-width: 0;
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) 32px;
    grid-template-areas: "logo title close" "description description description";
    align-items: center;
    column-gap: 8px;
    row-gap: 6px;
    padding: 18px 16px 10px 20px;
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  .header[data-dragging="true"] { cursor: grabbing; }
  .brand-mark { grid-area: logo; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; color: var(--ai-text); }
  .brand-mark svg { width: 22px; height: 22px; overflow: visible; }
  .title { grid-area: title; min-width: 0; margin: 0; overflow: hidden; color: var(--ai-text); font-size: 16px; line-height: 22px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
  .description {
    grid-area: description;
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    overflow-wrap: anywhere;
    color: var(--ai-text-secondary);
    font-size: 12px;
    line-height: 17px;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  .close-button { grid-area: close; justify-self: end; }
  .icon-button {
    flex: 0 0 auto;
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    appearance: none;
    border: 0;
    border-radius: 50%;
    color: var(--ai-text-secondary);
    background: transparent;
    cursor: pointer;
    transition: color 160ms ease, background 160ms ease, transform 120ms ease;
  }
  .icon-button:hover:not(:disabled) { color: var(--ai-text); background: var(--ai-surface-hover); }
  .icon-button:active:not(:disabled) { transform: scale(.96); }
  .icon-button svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .content {
    position: relative;
    display: grid;
    align-content: start;
    gap: 12px;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 6px 20px 20px;
    touch-action: pan-y;
    scrollbar-width: thin;
  }
  .content::-webkit-scrollbar { width: 8px; }
  .content::-webkit-scrollbar-track { background: transparent; }
  .content::-webkit-scrollbar-thumb { border: 2px solid transparent; border-radius: 999px; background: color-mix(in srgb, var(--ai-text-secondary) 42%, transparent); background-clip: padding-box; }
  .source-input {
    width: 100%;
    min-height: 88px;
    max-height: 180px;
    padding: 10px 12px;
    resize: vertical;
    border: 1px solid var(--ai-border);
    border-radius: 14px;
    color: var(--ai-text);
    background: var(--ai-surface-subtle);
    font-size: 14px;
    line-height: 1.5;
    outline: none;
  }
  .source-input::placeholder, .composer-input::placeholder { color: #98a2b3; }
  .source-input:focus { border-color: color-mix(in srgb, var(--ai-accent) 55%, var(--ai-border)); }
  .picker-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .model-section, .tone-section { min-width: 0; }
  .model-picker-wrap, .tone-picker-wrap { position: relative; }
  .model-trigger, .tone-trigger {
    width: 100%;
    height: 40px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px 0 14px;
    border: 1px solid var(--ai-border);
    border-radius: 12px;
    color: var(--ai-text);
    background: var(--ai-surface);
    box-shadow: 0 1px 2px rgba(15,23,42,.05);
    font-size: 14px;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    outline: none;
    transition: border-color 160ms ease, background 160ms ease;
  }
  .model-trigger:hover:not(:disabled), .model-trigger[aria-expanded="true"], .model-trigger:focus-visible { border-color: color-mix(in srgb, var(--ai-accent) 35%, var(--ai-border)); background: var(--ai-surface-hover); }
  .model-trigger:disabled { cursor: not-allowed; opacity: .62; }
  .model-trigger-chevron { flex: 0 0 auto; display: inline-flex; color: var(--ai-text-secondary); }
  .model-trigger-chevron svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: transform 160ms ease; }
  .model-trigger[aria-expanded="true"] .model-trigger-chevron svg { transform: rotate(180deg); }
  .model-trigger-value { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* Both dropdowns are position: fixed and placed by placePopover() from the
     trigger rect, so they can extend past the panel edge instead of being
     clipped by the scrollable content. */
  .model-popover {
    position: fixed;
    z-index: 3;
    display: none;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
    gap: 4px;
    padding: 6px;
    border: 1px solid var(--ai-border);
    border-radius: 14px;
    background: var(--ai-surface);
    box-shadow: 0 12px 32px rgba(15,23,42,.16), 0 2px 8px rgba(15,23,42,.06);
    animation: ai-model-open 140ms cubic-bezier(.2,0,0,1);
  }
  .model-popover[data-open="true"] { display: grid; }
  @keyframes ai-model-open { from { opacity: 0; transform: translateY(-4px) scale(.98); } to { opacity: 1; transform: none; } }
  .model-search { height: 30px; display: flex; align-items: center; gap: 6px; padding: 0 8px; border-radius: 9px; color: var(--ai-text-secondary); background: var(--ai-surface-hover); }
  .model-search svg { width: 14px; height: 14px; flex: 0 0 14px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }
  .model-search input { min-width: 0; flex: 1 1 auto; height: 100%; padding: 0; border: 0; outline: 0; color: var(--ai-text); background: transparent; font-size: 12px; }
  .model-list { min-height: 0; max-height: 320px; display: grid; align-content: start; gap: 1px; overflow-y: auto; overscroll-behavior: contain; }
  .model-option { min-height: 30px; display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 8px; color: var(--ai-text); font-size: 12px; cursor: pointer; }
  .model-option[data-active="true"] { background: var(--ai-surface-hover); }
  .model-option[aria-selected="true"] { color: var(--ai-accent); font-weight: 600; }
  .model-option-name { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .model-option svg { width: 14px; height: 14px; flex: 0 0 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .model-empty { margin: 0; padding: 8px; color: var(--ai-text-secondary); font-size: 12px; }
  .tone-trigger:hover, .tone-trigger[aria-expanded="true"], .tone-trigger:focus-visible { border-color: color-mix(in srgb, var(--ai-accent) 35%, var(--ai-border)); background: var(--ai-surface-hover); }
  .tone-trigger-value { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tone-trigger-chevron { flex: 0 0 auto; display: inline-flex; color: var(--ai-text-secondary); }
  .tone-trigger-chevron svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: transform 160ms ease; }
  .tone-trigger[aria-expanded="true"] .tone-trigger-chevron svg { transform: rotate(180deg); }
  .tone-popover {
    position: fixed;
    z-index: 3;
    display: none;
    overflow-y: auto;
    overscroll-behavior: contain;
    gap: 1px;
    padding: 6px;
    border: 1px solid var(--ai-border);
    border-radius: 14px;
    background: var(--ai-surface);
    box-shadow: 0 12px 32px rgba(15,23,42,.16), 0 2px 8px rgba(15,23,42,.06);
    animation: ai-model-open 140ms cubic-bezier(.2,0,0,1);
  }
  .tone-popover[data-open="true"] { display: grid; }
  .tone-option { min-height: 34px; display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-radius: 8px; color: var(--ai-text); font-size: 13px; cursor: pointer; }
  .tone-option[data-active="true"] { background: var(--ai-surface-hover); }
  .tone-option[aria-selected="true"] { color: var(--ai-accent); font-weight: 600; }
  .tone-icon { width: 22px; height: 22px; flex: 0 0 22px; display: inline-flex; align-items: center; justify-content: center; border-radius: 7px; color: var(--ai-accent); background: var(--ai-accent-soft); }
  .tone-icon svg, .tone-check svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .tone-text { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tone-check { flex: 0 0 auto; display: inline-flex; color: var(--ai-accent); opacity: 0; }
  .tone-option[aria-selected="true"] .tone-check { opacity: 1; }
  .tone-separator { height: 1px; margin: 4px 6px; background: var(--ai-border); }
  /* Context input and the polish arrow share one rounded box, like the chat composer. */
  .composer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 6px 6px 14px;
    border: 1px solid var(--ai-border);
    border-radius: 16px;
    background: var(--ai-surface);
    box-shadow: 0 2px 8px rgba(15,23,42,.06);
  }
  .composer:focus-within { border-color: color-mix(in srgb, var(--ai-accent) 55%, var(--ai-border)); }
  .composer-input { min-width: 0; flex: 1; height: 36px; padding: 0; border: 0; color: var(--ai-text); background: transparent; outline: none; font-size: 14px; }
  .generate-button {
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    appearance: none;
    border: 0;
    border-radius: 12px;
    color: #fff;
    background: var(--ai-accent);
    cursor: pointer;
    transition: transform 120ms ease, background 160ms ease;
  }
  .generate-button:hover:not(:disabled) { background: var(--ai-accent-hover); }
  .generate-button:active:not(:disabled) { transform: scale(.97); }
  .generate-button svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  button:disabled { opacity: .48; cursor: not-allowed; }
  .spinner {
    display: none;
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,.45);
    border-top-color: #fff;
    border-radius: 50%;
    animation: ai-writing-spin .75s linear infinite;
  }
  @keyframes ai-writing-spin { to { transform: rotate(360deg); } }
  .status { display: none; margin: 0; padding: 9px 11px; border-radius: 10px; font-size: 12px; line-height: 18px; }
  .status[data-kind="error"] { display: block; color: #b42318; background: #fef3f2; }
  .status[data-kind="success"] { display: block; color: #067647; background: #ecfdf3; }
  /* Every polish stays in this list, newest first. Three show in full; the
     list then scrolls (max-height is measured in renderResults). */
  .results { --results-max: min(420px, 55vh); display: none; gap: 8px; max-height: var(--results-max); overflow-y: auto; overscroll-behavior: contain; }
  .results[data-has-results="true"] { display: grid; }
  .result-card { display: grid; gap: 6px; padding: 10px 12px 12px; border-radius: 12px; background: var(--ai-accent-soft); }
  .result-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
  .result-meta { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1 1 auto; font-size: 12px; line-height: 18px; }
  .result-tone { flex: none; padding: 1px 8px; border-radius: 999px; color: var(--ai-accent); background: color-mix(in srgb, var(--ai-accent) 12%, transparent); font-weight: 600; white-space: nowrap; }
  .result-model { min-width: 0; overflow: hidden; color: var(--ai-text-secondary); text-overflow: ellipsis; white-space: nowrap; }
  .result-actions { display: flex; flex: none; align-items: center; gap: 2px; }
  .result-actions .icon-button { width: 28px; height: 28px; }
  .result-actions .icon-button svg { width: 16px; height: 16px; }
  .result-actions .icon-button[data-copied="true"] { color: var(--ai-accent); }
  .result-delete:hover:not(:disabled) { color: #b42318 !important; background: #fef3f2 !important; }
  .result-insert { min-height: 28px; padding: 0 10px; appearance: none; border: 0; border-radius: 14px; color: var(--ai-accent); background: transparent; font-size: 12px; font-weight: 600; white-space: nowrap; cursor: pointer; }
  .result-insert:hover:not(:disabled) { background: color-mix(in srgb, var(--ai-accent) 12%, transparent); }
  .result-body { color: var(--ai-text); font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; user-select: text; }
  /* Long results show about eight lines and fade out until expanded. */
  .result-body[data-collapsed="true"] { max-height: calc(13px * 1.6 * 8); overflow: hidden; }
  .result-body[data-overflowing="true"] { -webkit-mask-image: linear-gradient(to bottom, #000 70%, transparent); mask-image: linear-gradient(to bottom, #000 70%, transparent); }
  .result-body > :first-child { margin-top: 0; }
  .result-body > :last-child { margin-bottom: 0; }
  .result-body p { margin: .4em 0; }
  .result-body ul, .result-body ol { margin: .4em 0; padding-left: 20px; }
  .result-body h1, .result-body h2, .result-body h3, .result-body h4, .result-body h5, .result-body h6 { margin: .6em 0 .3em; font-size: 13px; font-weight: 650; }
  .result-body pre { overflow-x: auto; padding: 8px; border-radius: 8px; background: var(--ai-surface-subtle); }
  .result-body code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: .9em; }
  .result-body blockquote { margin: .4em 0; padding-left: 10px; border-left: 3px solid var(--ai-border); color: var(--ai-text-secondary); }
  .result-body table { border-collapse: collapse; }
  .result-body th, .result-body td { padding: 3px 6px; border: 1px solid var(--ai-border); }
  .result-body a { color: var(--ai-accent); }
  .result-toggle { justify-self: start; min-height: 24px; margin-left: -8px; padding: 0 8px; appearance: none; border: 0; border-radius: 12px; color: var(--ai-accent); background: transparent; font-size: 12px; font-weight: 600; cursor: pointer; }
  .result-toggle:hover { background: color-mix(in srgb, var(--ai-accent) 12%, transparent); }
  .launcher:focus-visible, .icon-button:focus-visible, .result-insert:focus-visible, .result-toggle:focus-visible,
  .tone-trigger:focus-visible, .generate-button:focus-visible {
    outline: 3px solid var(--ai-focus);
    outline-offset: 2px;
  }
  @media (max-width: 420px) {
    .panel { width: calc(100vw - 16px); border-radius: 16px; }
    .header { padding-left: 16px; padding-right: 12px; }
    .content { padding-left: 16px; padding-right: 16px; }
  }
  /* Dark palette follows the extension's Appearance setting (Chrome's mode by default), set on the host. */
  :host([data-appearance="dark"]) {
    --ai-surface: rgba(30,31,34,.99);
    --ai-surface-subtle: #25272b;
    --ai-surface-hover: #303238;
    --ai-text: #f3f4f6;
    --ai-text-secondary: #b1b7c2;
    --ai-border: #42454d;
  }
  :host([data-appearance="dark"]) .panel { box-shadow: 0 22px 64px rgba(0,0,0,.48), 0 5px 18px rgba(0,0,0,.28); }
  :host([data-appearance="dark"]) .source-input::placeholder, :host([data-appearance="dark"]) .composer-input::placeholder { color: #777d88; }
  :host([data-appearance="dark"]) .tone-icon { color: color-mix(in srgb, var(--ai-accent) 68%, white); background: color-mix(in srgb, var(--ai-accent) 18%, var(--ai-surface-subtle)); }
  :host([data-appearance="dark"]) .tone-option[aria-selected="true"] { color: color-mix(in srgb, var(--ai-accent) 68%, white); }
  :host([data-appearance="dark"]) .tone-popover { box-shadow: 0 12px 32px rgba(0,0,0,.42); }
  :host([data-appearance="dark"]) .status[data-kind="error"] { color: #fda29b; background: #4a2525; }
  :host([data-appearance="dark"]) .status[data-kind="success"] { color: #6ce9a6; background: #183a2d; }
  :host([data-appearance="dark"]) .result-card { background: color-mix(in srgb, var(--ai-accent) 16%, var(--ai-surface-subtle)); }
  :host([data-appearance="dark"]) .result-tone, :host([data-appearance="dark"]) .result-insert, :host([data-appearance="dark"]) .result-toggle { color: color-mix(in srgb, var(--ai-accent) 68%, white); }
  :host([data-appearance="dark"]) .composer { box-shadow: 0 4px 14px rgba(0,0,0,.30); }
  @media (prefers-reduced-motion: reduce) {
    .launcher, .panel, .icon-button, .result-insert, .tone-trigger, .tone-popover, .generate-button { animation: none; transition: none; }
  }
`;

function createSvg(document: Document, paths: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = paths;
  return svg;
}

// The extension's C-sparkle logo, traced from public/icon at 512px.
function createLogo(document: Document): SVGSVGElement {
  const svg = createSvg(document, '<path class="logo-c" d="M305 170A113 113 0 1 0 305 342"/><path class="logo-spark" d="M350 190Q357 249 416 256Q357 263 350 321Q343 263 286 256Q343 249 350 190Z"/>');
  svg.setAttribute('viewBox', '86 86 340 340');
  return svg;
}

const POPUP_CONTAINER_SELECTOR = [
  'dialog',
  '[popover]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  '[aria-modal="true"]',
  '[data-radix-popper-content-wrapper]',
].join(',');

function findInteractionContainer(target: HTMLTextAreaElement, document: Document): HTMLElement {
  const popup = target.closest<HTMLElement>(POPUP_CONTAINER_SELECTOR);
  return popup ?? target.parentElement ?? document.documentElement;
}

function setTextareaValue(target: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) setter.call(target, value);
  else target.value = value;
  target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
}

export class TextareaWritingAssistant {
  private readonly host: HTMLDivElement;
  private readonly shadow: ShadowRoot;
  private readonly launcher: HTMLButtonElement;
  private readonly panel: HTMLDivElement;
  private readonly header: HTMLDivElement;
  private readonly content: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly description: HTMLParagraphElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly sourceInput: HTMLTextAreaElement;
  private readonly modelLabel: HTMLSpanElement;
  private readonly modelSection: HTMLDivElement;
  private readonly modelTrigger: HTMLButtonElement;
  private readonly modelValue: HTMLSpanElement;
  private readonly modelPopover: HTMLDivElement;
  private readonly modelSearch: HTMLInputElement;
  private readonly modelList: HTMLDivElement;
  private models: string[] = [];
  private selectedModel = '';
  private modelActiveIndex = 0;
  private readonly toneLabel: HTMLSpanElement;
  private readonly toneSelect: HTMLSelectElement;
  private readonly toneSection: HTMLDivElement;
  private readonly toneTrigger: HTMLButtonElement;
  private readonly toneValue: HTMLSpanElement;
  private readonly tonePopover: HTMLDivElement;
  private readonly toneOptions = new Map<string, HTMLDivElement>();
  private styleOptions: StyleOption[] = [];
  private skills: WritingAssistantSkill[] = [];
  private skillsRevision = 0;
  private readonly toneIcons: Record<WritingTone, string> = {
    polish: '<path d="m12 3 .8 2.4a5.5 5.5 0 0 0 3.5 3.5l2.4.8-2.4.8a5.5 5.5 0 0 0-3.5 3.5l-.8 2.4-.8-2.4a5.5 5.5 0 0 0-3.5-3.5l-2.4-.8 2.4-.8a5.5 5.5 0 0 0 3.5-3.5L12 3Z"/>',
    professional: '<rect x="4" y="7" width="16" height="12" rx="2"/><path d="M9 7V5h6v2M4 12h16M10 12v2h4v-2"/>',
    friendly: '<circle cx="12" cy="12" r="9"/><path d="M8.5 10h.01M15.5 10h.01M8 14.5c1 1.2 2.3 1.8 4 1.8s3-.6 4-1.8"/>',
    concise: '<path d="M5 7h14M5 12h9M5 17h6"/>',
  };
  private toneActiveIndex = 0;
  private readonly contextLabel: HTMLLabelElement;
  private readonly contextInput: HTMLInputElement;
  private readonly generateButton: HTMLButtonElement;
  private readonly generateLabel: HTMLSpanElement;
  private readonly generateIcon: SVGSVGElement;
  private readonly spinner: HTMLSpanElement;
  private readonly resultList: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly hostObserver: MutationObserver;
  /** Follows the bound textarea's size (drag handle, auto-grow) which fires no scroll or window resize. */
  private readonly targetResizeObserver?: ResizeObserver;
  private messages: WritingAssistantMessages;
  private messagesRefreshRevision = 0;
  private enabled = true;
  private target?: HTMLTextAreaElement;
  private sourceRange?: { start: number; end: number; selected: boolean };
  private sourceTextSnapshot = '';
  private insertAt?: { start: number; end: number };
  private interactionContainer?: HTMLElement;
  private panelOpen = false;
  private panelManuallyPositioned = false;
  private dragState?: { pointerId: number; offsetX: number; offsetY: number };
  private generating = false;
  private generation = 0;
  private readonly historyCopyResetTimers = new Map<HTMLButtonElement, number>();
  /** Every result of this session, newest first. */
  private history: WritingAssistantHistoryItem[] = [];
  private readonly expandedResults = new Set<string>();
  private modelLoadPromise?: Promise<void>;
  private readonly createRequestId: () => string;

  constructor(private readonly options: TextareaWritingAssistantOptions) {
    this.messages = options.messages;
    this.createRequestId = options.createRequestId ?? (() => globalThis.crypto?.randomUUID?.() ?? `writing-${Date.now()}`);
    const { document } = options;

    this.host = document.createElement('div');
    this.host.dataset.chromeAiOwned = 'true';
    this.host.dataset.chromeAiWritingAssistant = 'true';
    this.host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483645;pointer-events:none;';
    this.hostObserver = new MutationObserver(() => this.ensureOpenPanelMounted());
    const ResizeObserverImpl = (options.window as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    this.targetResizeObserver = ResizeObserverImpl ? new ResizeObserverImpl(() => this.reposition()) : undefined;
    this.shadow = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE;

    this.launcher = document.createElement('button');
    this.launcher.type = 'button';
    this.launcher.className = 'launcher';
    this.launcher.append(createLogo(document));

    this.panel = document.createElement('div');
    this.panel.className = 'panel';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'false');
    const panelLayout = document.createElement('div');
    panelLayout.className = 'panel-layout';

    this.header = document.createElement('div');
    this.header.className = 'header';
    const brandMark = document.createElement('div');
    brandMark.className = 'brand-mark';
    brandMark.setAttribute('aria-hidden', 'true');
    brandMark.append(createLogo(document));
    this.title = document.createElement('h2');
    this.title.className = 'title';
    this.title.id = 'chrome-ai-writing-title';
    this.description = document.createElement('p');
    this.description.className = 'description';
    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.className = 'icon-button close-button';
    this.closeButton.append(createSvg(document, '<path d="m6 6 12 12M18 6 6 18"/>'));
    this.header.append(brandMark, this.title, this.closeButton, this.description);

    this.content = document.createElement('div');
    this.content.className = 'content';
    this.sourceInput = document.createElement('textarea');
    this.sourceInput.className = 'source-input';
    this.sourceInput.id = 'chrome-ai-writing-source';
    this.sourceInput.rows = 3;
    this.sourceInput.maxLength = 20_000;

    this.resultList = document.createElement('div');
    this.resultList.className = 'results';
    this.resultList.setAttribute('role', 'list');
    this.resultList.setAttribute('aria-live', 'polite');

    const modelSection = document.createElement('div');
    modelSection.className = 'model-section';
    this.modelSection = modelSection;
    this.modelLabel = document.createElement('span');
    // The row has no visible headings; labels stay for screen readers.
    this.modelLabel.className = 'model-label sr-only';
    this.modelLabel.id = 'chrome-ai-writing-model-label';
    const modelPickerWrap = document.createElement('div');
    modelPickerWrap.className = 'model-picker-wrap';
    this.modelTrigger = document.createElement('button');
    this.modelTrigger.type = 'button';
    this.modelTrigger.id = 'chrome-ai-writing-model';
    this.modelTrigger.className = 'model-trigger';
    this.modelTrigger.disabled = true;
    this.modelTrigger.setAttribute('aria-busy', 'true');
    this.modelTrigger.setAttribute('aria-haspopup', 'listbox');
    this.modelTrigger.setAttribute('aria-expanded', 'false');
    this.modelTrigger.setAttribute('aria-controls', 'chrome-ai-writing-model-list');
    this.modelTrigger.setAttribute('aria-labelledby', `${this.modelLabel.id} chrome-ai-writing-model`);
    this.modelValue = document.createElement('span');
    this.modelValue.className = 'model-trigger-value';
    const modelChevron = document.createElement('span');
    modelChevron.className = 'model-trigger-chevron';
    modelChevron.append(createSvg(document, '<path d="m8 10 4 4 4-4"/>'));
    this.modelTrigger.append(this.modelValue, modelChevron);

    this.modelPopover = document.createElement('div');
    this.modelPopover.className = 'model-popover';
    this.modelPopover.setAttribute('role', 'dialog');
    this.modelPopover.setAttribute('aria-labelledby', this.modelLabel.id);
    const modelSearchWrap = document.createElement('label');
    modelSearchWrap.className = 'model-search';
    modelSearchWrap.append(createSvg(document, '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>'));
    this.modelSearch = document.createElement('input');
    this.modelSearch.type = 'search';
    this.modelSearch.id = 'chrome-ai-writing-model-search';
    this.modelSearch.autocomplete = 'off';
    this.modelSearch.spellcheck = false;
    this.modelSearch.setAttribute('role', 'combobox');
    this.modelSearch.setAttribute('aria-autocomplete', 'list');
    this.modelSearch.setAttribute('aria-expanded', 'true');
    this.modelSearch.setAttribute('aria-controls', 'chrome-ai-writing-model-list');
    modelSearchWrap.append(this.modelSearch);
    this.modelList = document.createElement('div');
    this.modelList.id = 'chrome-ai-writing-model-list';
    this.modelList.className = 'model-list';
    this.modelList.setAttribute('role', 'listbox');
    this.modelList.setAttribute('aria-labelledby', this.modelLabel.id);
    this.modelPopover.append(modelSearchWrap, this.modelList);
    modelPickerWrap.append(this.modelTrigger, this.modelPopover);
    modelSection.append(this.modelLabel, modelPickerWrap);

    const toneSection = document.createElement('div');
    toneSection.className = 'tone-section';
    this.toneSection = toneSection;
    this.toneLabel = document.createElement('span');
    this.toneLabel.className = 'tone-label sr-only';
    this.toneLabel.id = 'chrome-ai-writing-tone-label';
    // The hidden select keeps the chosen tone; the dropdown below is its visible control.
    this.toneSelect = document.createElement('select');
    this.toneSelect.id = 'chrome-ai-writing-tone';
    this.toneSelect.className = 'sr-only';
    this.toneSelect.tabIndex = -1;
    this.toneSelect.setAttribute('aria-hidden', 'true');
    const tonePickerWrap = document.createElement('div');
    tonePickerWrap.className = 'tone-picker-wrap';
    this.toneTrigger = document.createElement('button');
    this.toneTrigger.type = 'button';
    this.toneTrigger.id = 'chrome-ai-writing-tone-trigger';
    this.toneTrigger.className = 'tone-trigger';
    this.toneTrigger.setAttribute('role', 'combobox');
    this.toneTrigger.setAttribute('aria-haspopup', 'listbox');
    this.toneTrigger.setAttribute('aria-expanded', 'false');
    this.toneTrigger.setAttribute('aria-controls', 'chrome-ai-writing-tone-list');
    this.toneTrigger.setAttribute('aria-labelledby', `${this.toneLabel.id} chrome-ai-writing-tone-trigger`);
    this.toneValue = document.createElement('span');
    this.toneValue.className = 'tone-trigger-value';
    const toneChevron = document.createElement('span');
    toneChevron.className = 'tone-trigger-chevron';
    toneChevron.append(createSvg(document, '<path d="m8 10 4 4 4-4"/>'));
    this.toneTrigger.append(this.toneValue, toneChevron);
    this.tonePopover = document.createElement('div');
    this.tonePopover.id = 'chrome-ai-writing-tone-list';
    this.tonePopover.className = 'tone-popover';
    this.tonePopover.setAttribute('role', 'listbox');
    this.tonePopover.setAttribute('aria-labelledby', this.toneLabel.id);
    tonePickerWrap.append(this.toneTrigger, this.tonePopover);
    toneSection.append(this.toneLabel, this.toneSelect, tonePickerWrap);
    this.renderToneOptions();

    const feedback = document.createElement('div');
    feedback.className = 'feedback';
    this.status = document.createElement('div');
    this.status.className = 'status';
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    feedback.append(this.status);

    const pickerRow = document.createElement('div');
    pickerRow.className = 'picker-row';
    pickerRow.append(toneSection, modelSection);
    const composer = document.createElement('div');
    composer.className = 'composer';
    this.contextLabel = document.createElement('label');
    this.contextLabel.className = 'sr-only';
    this.contextLabel.htmlFor = 'chrome-ai-writing-context';
    this.contextInput = document.createElement('input');
    this.contextInput.id = 'chrome-ai-writing-context';
    this.contextInput.className = 'composer-input';
    this.contextInput.type = 'text';
    this.contextInput.maxLength = 1000;
    this.generateButton = document.createElement('button');
    this.generateButton.type = 'button';
    this.generateButton.className = 'generate-button';
    this.spinner = document.createElement('span');
    this.spinner.className = 'spinner';
    this.generateIcon = createSvg(document, '<path d="M5 12h13M14 7l5 5-5 5"/>');
    this.generateLabel = document.createElement('span');
    this.generateLabel.className = 'sr-only';
    this.generateButton.append(this.spinner, this.generateIcon, this.generateLabel);
    composer.append(this.contextLabel, this.contextInput, this.generateButton);
    this.content.append(this.sourceInput, pickerRow, composer, feedback, this.resultList);

    panelLayout.append(this.header, this.content);
    this.panel.append(panelLayout);
    this.panel.setAttribute('aria-labelledby', this.title.id);
    this.shadow.append(style, this.launcher, this.panel);
    document.documentElement.append(this.host);

    this.closeButton.addEventListener('click', () => this.close(true));
    this.header.addEventListener('pointerdown', this.onPanelDragStart);
    this.header.addEventListener('pointermove', this.onPanelDragMove);
    this.header.addEventListener('pointerup', this.onPanelDragEnd);
    this.header.addEventListener('pointercancel', this.onPanelDragEnd);
    this.generateButton.addEventListener('click', () => void this.generate());
    this.contextInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      void this.generate();
    });
    this.sourceInput.addEventListener('input', () => {
      // A typed or pasted source no longer maps to a range of the page textarea;
      // inserting then goes to the caret captured when the assistant opened.
      this.sourceRange = undefined;
      this.sourceTextSnapshot = this.sourceInput.value.trim();
      this.refreshSourceState();
    });
    this.toneTrigger.addEventListener('click', () => (this.isTonePickerOpen() ? this.closeTonePicker(false) : this.openTonePicker()));
    this.toneTrigger.addEventListener('keydown', this.onToneTriggerKeyDown);
    this.modelTrigger.addEventListener('click', () => (this.isModelPickerOpen() ? this.closeModelPicker(false) : this.openModelPicker()));
    this.modelSearch.addEventListener('input', () => {
      this.modelActiveIndex = 0;
      this.renderModelOptions();
      this.positionOpenPopovers();
    });
    this.content.addEventListener('scroll', this.onContentScroll, { passive: true });
    this.modelSearch.addEventListener('keydown', this.onModelSearchKeyDown);
    this.shadow.addEventListener('pointerdown', (event) => {
      const path = event.composedPath();
      if (this.isModelPickerOpen() && !path.includes(this.modelSection)) this.closeModelPicker(false);
      if (this.isTonePickerOpen() && !path.includes(this.toneSection)) this.closeTonePicker(false);
    });
    this.shadow.addEventListener('keydown', this.onShadowKeyDown);
    this.setMessages(this.messages);
  }

  start(): void {
    this.options.window.addEventListener('pointerdown', this.onLauncherActivationCapture, true);
    this.options.window.addEventListener('mousedown', this.onLauncherActivationCapture, true);
    this.options.window.addEventListener('click', this.onLauncherActivationCapture, true);
    this.options.window.addEventListener('blur', this.onTargetFocusLeavingCapture, true);
    this.options.window.addEventListener('focusout', this.onTargetFocusLeavingCapture, true);
    this.options.document.addEventListener('focusin', this.onFocusIn, true);
    this.options.document.addEventListener('focusout', this.onFocusOut, true);
    this.options.document.addEventListener('select', this.onTargetSelectionChange, true);
    this.options.document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
    this.options.window.addEventListener('scroll', this.reposition, true);
    this.options.window.addEventListener('wheel', this.onAssistantWheel, { capture: true, passive: false });
    this.options.window.addEventListener('resize', this.reposition);
    this.hostObserver.observe(this.options.document.documentElement, { childList: true, subtree: true });
  }

  stop(): void {
    this.options.window.removeEventListener('pointerdown', this.onLauncherActivationCapture, true);
    this.options.window.removeEventListener('mousedown', this.onLauncherActivationCapture, true);
    this.options.window.removeEventListener('click', this.onLauncherActivationCapture, true);
    this.options.window.removeEventListener('blur', this.onTargetFocusLeavingCapture, true);
    this.options.window.removeEventListener('focusout', this.onTargetFocusLeavingCapture, true);
    this.options.document.removeEventListener('focusin', this.onFocusIn, true);
    this.options.document.removeEventListener('focusout', this.onFocusOut, true);
    this.options.document.removeEventListener('select', this.onTargetSelectionChange, true);
    this.options.document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    this.options.window.removeEventListener('scroll', this.reposition, true);
    this.options.window.removeEventListener('wheel', this.onAssistantWheel, true);
    this.options.window.removeEventListener('resize', this.reposition);
    this.hostObserver.disconnect();
    this.targetResizeObserver?.disconnect();
    for (const timer of this.historyCopyResetTimers.values()) this.options.window.clearTimeout(timer);
    this.historyCopyResetTimers.clear();
    this.shadow.removeEventListener('keydown', this.onShadowKeyDown);
    this.host.remove();
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;

    if (!enabled) {
      this.generation += 1;
      this.generating = false;
      this.generateButton.disabled = true;
      this.sourceInput.readOnly = false;
      this.spinner.style.display = 'none';
      this.generateIcon.style.display = '';
      this.generateLabel.textContent = this.messages.writingAssistantGenerate;
      this.generateButton.title = this.messages.writingAssistantGenerate;
      this.generateButton.setAttribute('aria-label', this.messages.writingAssistantGenerate);
      this.close(false);
      this.hideLauncher();
      this.setTarget(undefined);
      this.sourceRange = undefined;
      this.sourceTextSnapshot = '';
      this.interactionContainer = undefined;
      return;
    }

    const activeElement = this.options.document.activeElement;
    if (
      activeElement instanceof HTMLTextAreaElement
      && !activeElement.disabled
      && !activeElement.readOnly
      && !activeElement.closest('[data-chrome-ai-owned="true"]')
    ) {
      this.bindTarget(activeElement);
    }
  }

  setMessages(messages: WritingAssistantMessages): void {
    this.messagesRefreshRevision += 1;
    this.applyMessages(messages);
  }

  private applyMessages(messages: WritingAssistantMessages): void {
    this.messages = messages;
    this.launcher.title = messages.writingAssistantOpen;
    this.launcher.setAttribute('aria-label', messages.writingAssistantOpen);
    this.title.textContent = messages.writingAssistantTitle;
    this.description.textContent = messages.writingAssistantDescription;
    this.closeButton.title = messages.writingAssistantClose;
    this.closeButton.setAttribute('aria-label', messages.writingAssistantClose);
    this.modelLabel.textContent = messages.model;
    this.modelSearch.placeholder = messages.modelSearchPlaceholder;
    this.modelSearch.setAttribute('aria-label', messages.modelSearchPlaceholder);
    if (this.isModelPickerOpen()) this.renderModelOptions();
    this.toneLabel.textContent = messages.writingAssistantTone;
    this.renderToneOptions();
    this.sourceInput.placeholder = messages.writingAssistantInputPlaceholder;
    this.sourceInput.setAttribute('aria-label', messages.writingAssistantOriginal);
    this.contextLabel.textContent = messages.writingAssistantContext;
    this.contextInput.placeholder = messages.writingAssistantContext;
    this.generateLabel.textContent = this.generating ? messages.writingAssistantGenerating : messages.writingAssistantGenerate;
    this.generateButton.title = this.generateLabel.textContent;
    this.generateButton.setAttribute('aria-label', this.generateLabel.textContent);
    this.resultList.setAttribute('aria-label', messages.writingAssistantResult);
    this.renderResults();
  }

  setAppearance(appearance: ResolvedAppearance): void {
    this.host.dataset.appearance = appearance;
  }

  setTheme(theme: ThemeTokens): void {
    this.host.style.setProperty('--ai-accent', theme.color);
    this.host.style.setProperty('--ai-accent-hover', theme.hover);
    this.host.style.setProperty('--ai-accent-soft', theme.soft);
    this.host.style.setProperty('--ai-focus', theme.focus);
  }

  reloadModels(): void {
    this.modelLoadPromise = undefined;
    this.closeModelPicker(false);
    this.modelTrigger.disabled = true;
    this.modelTrigger.setAttribute('aria-busy', 'true');
    if (this.panelOpen) void this.ensureModelsLoaded();
  }

  private refreshMessages(): void {
    if (!this.options.loadMessages) return;
    const revision = ++this.messagesRefreshRevision;
    void this.options.loadMessages()
      .then((messages) => {
        if (revision !== this.messagesRefreshRevision) return;
        this.applyMessages(messages);
      })
      .catch(() => undefined);
  }

  private refreshSkills(): void {
    if (!this.options.loadSkills) return;
    const revision = ++this.skillsRevision;
    void this.options.loadSkills()
      .then((skills) => {
        if (revision !== this.skillsRevision) return;
        this.skills = skills;
        this.renderToneOptions();
      })
      .catch(() => undefined);
  }

  private ensureModelsLoaded(): Promise<void> {
    if (this.modelLoadPromise) return this.modelLoadPromise;
    if (!this.options.loadModels) {
      this.modelTrigger.disabled = true;
      this.modelTrigger.setAttribute('aria-busy', 'false');
      return Promise.resolve();
    }

    this.modelTrigger.disabled = true;
    this.modelTrigger.setAttribute('aria-busy', 'true');
    this.modelLoadPromise = this.options.loadModels()
      .then(({ model, models }) => {
        const current = this.selectedModel.trim();
        const values = Array.from(new Set([model, ...models].map((value) => value.trim()).filter(Boolean)));
        this.models = values;
        this.setSelectedModel(current && values.includes(current) ? current : model.trim() || values[0] || '');
        this.modelTrigger.disabled = values.length === 0;
      })
      .catch(() => {
        this.modelTrigger.disabled = this.models.length === 0;
        this.modelLoadPromise = undefined;
      })
      .finally(() => this.modelTrigger.setAttribute('aria-busy', 'false'));
    return this.modelLoadPromise;
  }

  private setSelectedModel(model: string): void {
    this.selectedModel = model;
    this.modelValue.textContent = model;
    this.modelTrigger.title = model;
  }

  private isModelPickerOpen(): boolean {
    return this.modelPopover.dataset.open === 'true';
  }

  private filteredModels(): string[] {
    const query = this.modelSearch.value.trim().toLowerCase();
    return query ? this.models.filter((model) => model.toLowerCase().includes(query)) : this.models;
  }

  private openModelPicker(): void {
    if (this.modelTrigger.disabled || this.models.length === 0) return;
    this.closeTonePicker(false);
    this.modelSearch.value = '';
    this.modelActiveIndex = Math.max(0, this.models.indexOf(this.selectedModel));
    this.modelPopover.dataset.open = 'true';
    this.modelTrigger.setAttribute('aria-expanded', 'true');
    this.renderModelOptions();
    this.placePopover(this.modelPopover, this.modelTrigger, 'end', 260);
    this.modelSearch.focus({ preventScroll: true });
  }

  private closeModelPicker(restoreFocus: boolean): void {
    if (!this.isModelPickerOpen()) return;
    delete this.modelPopover.dataset.open;
    this.modelTrigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) this.modelTrigger.focus({ preventScroll: true });
  }

  private chooseModel(model: string): void {
    this.setSelectedModel(model);
    this.closeModelPicker(true);
  }

  private renderModelOptions(): void {
    const { document } = this.options;
    const options = this.filteredModels();
    if (this.modelActiveIndex >= options.length) this.modelActiveIndex = Math.max(0, options.length - 1);
    if (options.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'model-empty';
      empty.textContent = this.messages.modelSearchNoMatch;
      this.modelList.replaceChildren(empty);
      this.modelSearch.removeAttribute('aria-activedescendant');
      return;
    }
    this.modelList.replaceChildren(...options.map((model, index) => {
      const option = document.createElement('div');
      option.id = `chrome-ai-writing-model-option-${index}`;
      option.className = 'model-option';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', model === this.selectedModel ? 'true' : 'false');
      option.dataset.active = index === this.modelActiveIndex ? 'true' : 'false';
      option.title = model;
      const name = document.createElement('span');
      name.className = 'model-option-name';
      name.textContent = model;
      option.append(name);
      if (model === this.selectedModel) option.append(createSvg(document, '<path d="m6 12 4 4 8-8"/>'));
      option.addEventListener('pointerenter', () => this.setModelActiveIndex(index));
      option.addEventListener('mousedown', (event) => event.preventDefault());
      option.addEventListener('click', () => this.chooseModel(model));
      return option;
    }));
    this.modelSearch.setAttribute('aria-activedescendant', `chrome-ai-writing-model-option-${this.modelActiveIndex}`);
  }

  private setModelActiveIndex(index: number): void {
    this.modelActiveIndex = index;
    for (const [optionIndex, option] of [...this.modelList.querySelectorAll<HTMLElement>('.model-option')].entries()) {
      option.dataset.active = optionIndex === index ? 'true' : 'false';
      if (optionIndex === index) option.scrollIntoView?.({ block: 'nearest' });
    }
    this.modelSearch.setAttribute('aria-activedescendant', `chrome-ai-writing-model-option-${index}`);
  }

  private readonly onModelSearchKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing) return;
    const options = this.filteredModels();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!options.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      this.setModelActiveIndex((this.modelActiveIndex + step + options.length) % options.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const model = options[this.modelActiveIndex];
      if (model) this.chooseModel(model);
    } else if (event.key === 'Escape') {
      // The shadow-level handler still stops Escape from reaching the page.
      this.closeModelPicker(true);
    } else if (event.key === 'Tab') {
      this.closeModelPicker(false);
    }
  };

  private isTonePickerOpen(): boolean {
    return this.tonePopover.dataset.open === 'true';
  }

  private openTonePicker(): void {
    this.closeModelPicker(false);
    this.tonePopover.dataset.open = 'true';
    this.toneTrigger.setAttribute('aria-expanded', 'true');
    this.setToneActiveIndex(Math.max(0, this.styleOptions.findIndex(({ key }) => key === this.toneSelect.value)));
    this.placePopover(this.tonePopover, this.toneTrigger, 'start', 180);
  }

  private positionOpenPopovers(): void {
    if (this.isModelPickerOpen()) this.placePopover(this.modelPopover, this.modelTrigger, 'end', 260);
    if (this.isTonePickerOpen()) this.placePopover(this.tonePopover, this.toneTrigger, 'start', 180);
  }

  // Anchor a fixed dropdown to its trigger in the host coordinate space. It
  // opens below the trigger and may overflow the panel; it flips above only
  // when the viewport has clearly more room there.
  private placePopover(popover: HTMLElement, trigger: HTMLElement, align: 'start' | 'end', minWidth: number): void {
    const space = this.getHostCoordinateSpace();
    const margin = 8;
    const gap = 6;
    const rect = trigger.getBoundingClientRect();
    const triggerLeft = space.toLocalX(rect.left);
    const triggerRight = space.toLocalX(rect.right);
    const triggerTop = space.toLocalY(rect.top);
    const triggerBottom = space.toLocalY(rect.bottom);
    const viewportWidth = Math.max(0, space.viewportRight - space.viewportLeft - margin * 2);
    const width = Math.min(viewportWidth, Math.max(triggerRight - triggerLeft, minWidth));
    const minLeft = space.viewportLeft + margin;
    const maxLeft = Math.max(minLeft, space.viewportRight - margin - width);
    const desiredLeft = align === 'end' ? triggerRight - width : triggerLeft;
    const roomBelow = Math.max(0, space.viewportBottom - margin - (triggerBottom + gap));
    const roomAbove = Math.max(0, triggerTop - gap - (space.viewportTop + margin));
    const placeAbove = roomBelow < 200 && roomAbove > roomBelow;

    popover.style.left = `${Math.max(minLeft, Math.min(maxLeft, desiredLeft))}px`;
    popover.style.width = `${width}px`;
    popover.style.maxHeight = `${placeAbove ? roomAbove : roomBelow}px`;
    popover.dataset.placement = placeAbove ? 'top' : 'bottom';
    popover.style.top = placeAbove
      ? `${triggerTop - gap - popover.offsetHeight}px`
      : `${triggerBottom + gap}px`;
  }

  private closeTonePicker(restoreFocus: boolean): void {
    if (!this.isTonePickerOpen()) return;
    delete this.tonePopover.dataset.open;
    this.toneTrigger.setAttribute('aria-expanded', 'false');
    this.toneTrigger.removeAttribute('aria-activedescendant');
    if (restoreFocus) this.toneTrigger.focus({ preventScroll: true });
  }

  private chooseTone(key: string): void {
    this.toneSelect.value = key;
    this.syncTonePicker();
    this.closeTonePicker(true);
  }

  private setToneActiveIndex(index: number): void {
    this.toneActiveIndex = index;
    for (const [optionIndex, option] of this.styleOptions.entries()) {
      this.toneOptions.get(option.key)!.dataset.active = optionIndex === index ? 'true' : 'false';
    }
    const active = this.styleOptions[index];
    if (active) this.toneTrigger.setAttribute('aria-activedescendant', this.toneOptions.get(active.key)!.id);
  }

  /**
   * The style menu lists the four tones, a divider, then the user's skills.
   * Options are rebuilt only when that list changes; otherwise labels update
   * in place so open menus and focus are not disturbed.
   */
  private renderToneOptions(): void {
    const { document } = this.options;
    const next: StyleOption[] = [
      ...WRITING_TONES.map((tone) => ({ key: tone as string, label: this.toneLabelFor(tone), tone })),
      ...this.skills.map((skill) => ({ key: `${SKILL_STYLE_PREFIX}${skill.id}`, label: skill.name, skill })),
    ];
    // The hidden select holds the chosen style; rebuilding it would reset that.
    const previous = this.toneSelect.value || 'polish';
    const sameKeys = next.length === this.styleOptions.length
      && next.every((option, index) => option.key === this.styleOptions[index]?.key);
    this.styleOptions = next;

    if (sameKeys && this.toneOptions.size === next.length) {
      for (const option of next) {
        this.toneOptions.get(option.key)!.querySelector<HTMLElement>('.tone-text')!.textContent = option.label;
        const native = [...this.toneSelect.options].find(({ value }) => value === option.key);
        if (native) native.textContent = option.label;
      }
    } else {
      this.toneSelect.replaceChildren();
      this.tonePopover.replaceChildren();
      this.toneOptions.clear();
      for (const [index, option] of next.entries()) {
        const native = document.createElement('option');
        native.value = option.key;
        native.textContent = option.label;
        this.toneSelect.append(native);
        if (option.skill && !next[index - 1]?.skill) {
          const separator = document.createElement('div');
          separator.className = 'tone-separator';
          separator.setAttribute('role', 'separator');
          this.tonePopover.append(separator);
        }
        const item = document.createElement('div');
        item.id = `chrome-ai-writing-tone-option-${option.key}`;
        item.className = 'tone-option';
        item.dataset.tone = option.key;
        item.setAttribute('role', 'option');
        const icon = document.createElement('span');
        icon.className = 'tone-icon';
        icon.append(createSvg(document, option.tone ? this.toneIcons[option.tone] : '<path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z"/>'));
        const label = document.createElement('span');
        label.className = 'tone-text';
        label.textContent = option.label;
        const check = document.createElement('span');
        check.className = 'tone-check';
        check.append(createSvg(document, '<path d="m6 12 4 4 8-8"/>'));
        item.append(icon, label, check);
        item.addEventListener('pointerenter', () => this.setToneActiveIndex(index));
        item.addEventListener('mousedown', (event) => event.preventDefault());
        item.addEventListener('click', () => this.chooseTone(option.key));
        this.toneOptions.set(option.key, item);
        this.tonePopover.append(item);
      }
      if (this.isTonePickerOpen()) this.placePopover(this.tonePopover, this.toneTrigger, 'start', 180);
    }
    // A skill deleted elsewhere falls back to the default tone.
    this.toneSelect.value = next.some(({ key }) => key === previous) ? previous : 'polish';
    this.syncTonePicker();
  }

  private selectedStyleOption(): StyleOption {
    return this.styleOptions.find(({ key }) => key === this.toneSelect.value) ?? this.styleOptions[0]!;
  }

  private syncTonePicker(): void {
    for (const [key, option] of this.toneOptions) {
      option.setAttribute('aria-selected', String(key === this.toneSelect.value));
    }
    this.toneValue.textContent = this.selectedStyleOption().label;
    this.toneTrigger.title = this.toneValue.textContent;
  }

  private readonly onToneTriggerKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.isTonePickerOpen()) {
        this.openTonePicker();
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const count = this.styleOptions.length;
      this.setToneActiveIndex((this.toneActiveIndex + step + count) % count);
    } else if ((event.key === 'Enter' || event.key === ' ') && this.isTonePickerOpen()) {
      event.preventDefault();
      this.chooseTone(this.styleOptions[this.toneActiveIndex]!.key);
    } else if (event.key === 'Escape') {
      // The shadow-level handler still stops Escape from reaching the page.
      this.closeTonePicker(true);
    } else if (event.key === 'Tab') {
      this.closeTonePicker(false);
    }
  };

  private readonly onLauncherActivationCapture = (event: Event): void => {
    if (!this.enabled || !event.composedPath().includes(this.launcher)) return;

    // Re-read the saved language whenever the entry point is used. The storage
    // change event remains the fast path, while this also heals stale content
    // scripts after extension reloads or missed browser storage notifications.
    this.refreshMessages();

    // Page popovers commonly close from document-level outside-click handlers.
    // Intercept the launcher at window capture (before document handlers), keep
    // the source textarea focused, and activate the assistant ourselves.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!this.panelOpen) this.open();
  };

  private readonly onTargetFocusLeavingCapture = (event: FocusEvent): void => {
    if (!this.panelOpen || !this.target || !event.composedPath().includes(this.target)) return;
    const relatedTarget = event.relatedTarget;
    const enteringAssistant = relatedTarget === this.host
      || (relatedTarget instanceof Node && this.shadow.contains(relatedTarget));
    const stayingInEditor = relatedTarget instanceof Element
      && relatedTarget.matches('select, [role="combobox"], [aria-haspopup="listbox"]')
      && Boolean(this.interactionContainer?.contains(relatedTarget));
    if (!enteringAssistant && !stayingInEditor) return;

    // Some editors close their entire popover from an unconditional textarea
    // blur handler. Suppress that teardown both when entering the assistant and
    // when the user moves to another control (for example a select) in the same
    // editor, while allowing the browser to complete the actual focus change.
    event.stopImmediatePropagation();
  };

  private setTarget(target: HTMLTextAreaElement | undefined): void {
    if (this.target === target) return;
    this.targetResizeObserver?.disconnect();
    this.target = target;
    if (target) this.targetResizeObserver?.observe(target);
  }

  private bindTarget(target: HTMLTextAreaElement): void {
    this.setTarget(target);
    this.sourceRange = undefined;
    this.sourceTextSnapshot = '';
    const interactionContainer = findInteractionContainer(target, this.options.document);
    this.interactionContainer = interactionContainer;
    if (this.host.parentElement !== interactionContainer) interactionContainer.append(this.host);
    this.resetHistory();
    this.showLauncher();
  }

  private readonly onFocusIn = (event: FocusEvent): void => {
    if (!this.enabled) return;
    const path = event.composedPath();
    if (path.includes(this.host)) return;
    // Once opened, the assistant stays bound to its original textarea until
    // the user explicitly presses Close. Focusing the page must not dismiss,
    // retarget, or refresh the captured source text. Only a new text selection
    // is allowed to replace that snapshot.
    if (this.panelOpen) return;
    const target = path.find((item): item is HTMLTextAreaElement => item instanceof HTMLTextAreaElement);
    if (!target) return;
    if (target.disabled || target.readOnly || path.some((item) => item instanceof Element && item.matches('[data-chrome-ai-owned="true"]'))) return;
    this.refreshMessages();
    this.bindTarget(target);
  };

  private readonly onTargetSelectionChange = (event: Event): void => {
    if (!this.panelOpen || !this.target || !event.composedPath().includes(this.target)) return;
    // Do not follow input/change (including framework onChange updates). The
    // source shown in the assistant is a stable snapshot and changes only when
    // the user selects a non-empty text range in the bound textarea.
    if (this.captureSelectedSourceFromTarget()) this.syncSourceFromSelection();
  };

  private readonly onFocusOut = (): void => {
    this.options.window.setTimeout(() => {
      if (this.panelOpen) return;
      if (this.options.document.activeElement !== this.target) this.hideLauncher();
    }, 0);
  };

  private readonly onDocumentPointerDown = (event: PointerEvent): void => {
    const path = event.composedPath();
    if (path.includes(this.host)) return;
    if (this.panelOpen) {
      // The page may remove the textarea's containing popover after this event.
      // Keep the assistant alive and remount it if that happens.
      this.options.window.setTimeout(() => this.ensureOpenPanelMounted(), 0);
      return;
    }
    if (this.target && path.includes(this.target)) return;
    this.hideLauncher();
  };

  private readonly onShadowKeyDown = (event: Event): void => {
    if (event instanceof KeyboardEvent && event.key === 'Escape') {
      // Closing is intentionally limited to the visible Close button. Also
      // stop Escape from dismissing a page dialog that currently owns the host.
      event.preventDefault();
      event.stopPropagation();
    }
  };

  private readonly onPanelDragStart = (event: PointerEvent): void => {
    if (event.button !== 0 || event.composedPath().includes(this.closeButton)) return;
    const space = this.getHostCoordinateSpace();
    const left = Number.parseFloat(this.panel.style.left);
    const top = Number.parseFloat(this.panel.style.top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) return;

    event.preventDefault();
    this.panelManuallyPositioned = true;
    this.dragState = {
      pointerId: event.pointerId,
      offsetX: space.toLocalX(event.clientX) - left,
      offsetY: space.toLocalY(event.clientY) - top,
    };
    this.header.dataset.dragging = 'true';
    this.header.setPointerCapture?.(event.pointerId);
  };

  private readonly onPanelDragMove = (event: PointerEvent): void => {
    const drag = this.dragState;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const space = this.getHostCoordinateSpace();
    const margin = 12;
    const width = Number.parseFloat(this.panel.style.width) || this.panel.offsetWidth;
    const height = Number.parseFloat(this.panel.style.height) || this.panel.offsetHeight;
    const minLeft = space.viewportLeft + margin;
    const minTop = space.viewportTop + margin;
    const maxLeft = Math.max(minLeft, space.viewportRight - margin - width);
    const maxTop = Math.max(minTop, space.viewportBottom - margin - height);
    const desiredLeft = space.toLocalX(event.clientX) - drag.offsetX;
    const desiredTop = space.toLocalY(event.clientY) - drag.offsetY;
    this.panel.style.left = `${Math.max(minLeft, Math.min(maxLeft, desiredLeft))}px`;
    this.panel.style.top = `${Math.max(minTop, Math.min(maxTop, desiredTop))}px`;
    this.positionOpenPopovers();
  };

  private readonly onPanelDragEnd = (event: PointerEvent): void => {
    const drag = this.dragState;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (this.header.hasPointerCapture?.(event.pointerId)) this.header.releasePointerCapture(event.pointerId);
    this.dragState = undefined;
    delete this.header.dataset.dragging;
    this.positionPanelWithinViewport();
  };

  private readonly onAssistantWheel = (event: WheelEvent): void => {
    if (!this.panelOpen || event.ctrlKey) return;
    const path = event.composedPath();
    if (!path.includes(this.panel)) return;

    if (event.deltaY === 0) return;

    // Nested scrollers (the model list, long source/result previews) take the
    // wheel first, like overscroll-behavior: contain. Without this the window
    // handler below would always move the outer content instead.
    const nestedScroller = this.findNestedScroller(path);
    if (!nestedScroller && (path.includes(this.modelPopover) || path.includes(this.tonePopover))) {
      // An open dropdown floats over the content; never scroll the panel
      // behind it, which would also drag the dropdown along.
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const scroller = nestedScroller ?? this.content;
    const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    if (maxScrollTop <= 0 && scroller === this.content) return;

    const multiplier = event.deltaMode === 1
      ? 18
      : event.deltaMode === 2
        ? Math.max(1, scroller.clientHeight)
        : 1;
    const nextScrollTop = Math.max(
      0,
      Math.min(maxScrollTop, scroller.scrollTop + event.deltaY * multiplier),
    );

    // The assistant can be mounted inside a page-owned dialog whose global
    // wheel handler locks scrolling. Handle the wheel at window capture level
    // so long rewrite results remain scrollable without moving the page behind
    // the assistant.
    scroller.scrollTop = nextScrollTop;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private findNestedScroller(path: EventTarget[]): HTMLElement | undefined {
    for (const node of path) {
      if (node === this.content || node === this.panel) return undefined;
      if (!(node instanceof HTMLElement) || node.scrollHeight <= node.clientHeight) continue;
      const overflowY = this.options.window.getComputedStyle(node).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') return node;
    }
    return undefined;
  }

  private readonly reposition = (event?: Event): void => {
    // The window listener runs in capture mode so it can follow page-owned
    // scrollers. Ignore the assistant's own scroll container: recalculating the
    // floating panel during an internal scroll can interrupt wheel/touch
    // scrolling and make the result area appear stuck.
    if (event?.composedPath().includes(this.host)) return;
    if (!this.target?.isConnected) {
      this.ensureOpenPanelMounted();
      if (!this.panelOpen) this.hideLauncher();
      return;
    }
    this.positionLauncher();
    if (this.panelOpen) this.refreshPanelPosition();
  };

  private readonly onContentScroll = (): void => {
    this.positionOpenPopovers();
  };

  private ensureOpenPanelMounted(): void {
    if (!this.panelOpen) return;
    const target = this.target;
    if (!target?.isConnected) {
      // The page-owned dialog/editor containing the source textarea was
      // genuinely closed. Do not remount the assistant as a detached floating
      // window; dismiss it and wait for the next textarea focus instead.
      this.close(false);
      this.launcher.style.display = 'none';
      this.setTarget(undefined);
      this.interactionContainer = undefined;
      return;
    }

    if (!this.host.isConnected) {
      const interactionContainer = findInteractionContainer(target, this.options.document);
      this.interactionContainer = interactionContainer;
      interactionContainer.append(this.host);
    }
    this.panel.style.display = 'block';
    this.positionLauncher();
    this.refreshPanelPosition();
  }

  private positionPanelWithinViewport(): void {
    const space = this.getHostCoordinateSpace();
    const margin = 12;
    const availableWidth = Math.max(0, space.viewportRight - space.viewportLeft - margin * 2);
    const availableHeight = Math.max(0, space.viewportBottom - space.viewportTop - margin * 2);
    const currentWidth = Number.parseFloat(this.panel.style.width);
    const currentHeight = Number.parseFloat(this.panel.style.height);
    const width = Math.min(Number.isFinite(currentWidth) ? currentWidth : 460, availableWidth);
    const natural = this.measureNaturalHeight();
    const height = Math.min(natural > 0 ? natural : Number.isFinite(currentHeight) ? currentHeight : 680, availableHeight);
    const minLeft = space.viewportLeft + margin;
    const minTop = space.viewportTop + margin;
    const maxLeft = Math.max(minLeft, space.viewportRight - margin - width);
    const maxTop = Math.max(minTop, space.viewportBottom - margin - height);
    const currentLeft = Number.parseFloat(this.panel.style.left);
    const currentTop = Number.parseFloat(this.panel.style.top);
    const left = Math.max(minLeft, Math.min(maxLeft, Number.isFinite(currentLeft) ? currentLeft : minLeft));
    const top = Math.max(minTop, Math.min(maxTop, Number.isFinite(currentTop) ? currentTop : minTop));
    this.panel.style.width = `${width}px`;
    this.panel.style.height = `${height}px`;
    this.panel.style.left = `${left}px`;
    this.panel.style.top = `${top}px`;
  }

  /** The panel's content height without the inline height cap; 0 when there is no layout. */
  private measureNaturalHeight(): number {
    const previous = this.panel.style.height;
    this.panel.style.height = 'auto';
    const natural = this.panel.offsetHeight;
    this.panel.style.height = previous;
    return natural;
  }

  private refreshPanelPosition(): void {
    if (this.panelManuallyPositioned) this.positionPanelWithinViewport();
    else this.positionPanel();
    this.positionOpenPopovers();
  }

  private showLauncher(): void {
    if (!this.enabled) return;
    this.launcher.style.display = 'flex';
    this.positionLauncher();
  }

  private hideLauncher(): void {
    this.launcher.style.display = 'none';
    if (!this.panelOpen) this.setTarget(undefined);
  }

  private getHostCoordinateSpace() {
    const hostRect = this.host.getBoundingClientRect();
    const width = this.host.offsetWidth || hostRect.width || this.options.window.innerWidth;
    const height = this.host.offsetHeight || hostRect.height || this.options.window.innerHeight;
    const scaleX = hostRect.width > 0 && width > 0 ? hostRect.width / width : 1;
    const scaleY = hostRect.height > 0 && height > 0 ? hostRect.height / height : 1;
    const toLocalX = (value: number): number => (value - hostRect.left) / scaleX;
    const toLocalY = (value: number): number => (value - hostRect.top) / scaleY;
    return {
      toLocalX,
      toLocalY,
      viewportLeft: Math.max(0, toLocalX(0)),
      viewportRight: Math.min(width, toLocalX(this.options.window.innerWidth)),
      viewportTop: Math.max(0, toLocalY(0)),
      viewportBottom: Math.min(height, toLocalY(this.options.window.innerHeight)),
    };
  }

  private positionLauncher(): void {
    if (!this.target) return;
    const targetRect = this.target.getBoundingClientRect();
    const space = this.getHostCoordinateSpace();
    const targetLeft = space.toLocalX(targetRect.left);
    const targetRight = space.toLocalX(targetRect.right);
    const targetTop = space.toLocalY(targetRect.top);
    const targetBottom = space.toLocalY(targetRect.bottom);
    const visibleLeft = Math.max(targetLeft, space.viewportLeft);
    const visibleRight = Math.min(targetRight, space.viewportRight);
    const visibleTop = Math.max(targetTop, space.viewportTop);
    const visibleBottom = Math.min(targetBottom, space.viewportBottom);

    const size = 24;
    const inset = 5;
    // Anchor the launcher inside the textarea's visible bottom-right corner.
    // The host may live inside a transformed dialog/popover, so viewport
    // coordinates must be converted to the host's local coordinate space.
    const x = Math.max(visibleLeft, visibleRight - size - inset);
    const y = Math.max(visibleTop, visibleBottom - size - inset);
    this.launcher.style.left = `${x}px`;
    this.launcher.style.top = `${y}px`;
    const visible = visibleRight > visibleLeft && visibleBottom > visibleTop;
    this.launcher.style.visibility = visible ? 'visible' : 'hidden';
  }

  private positionPanel(): void {
    if (!this.target) return;
    const space = this.getHostCoordinateSpace();
    const margin = 12;
    const gap = 8;
    const launcherSize = 24;
    const launcherLeft = Number.parseFloat(this.launcher.style.left);
    const launcherTop = Number.parseFloat(this.launcher.style.top);
    if (!Number.isFinite(launcherLeft) || !Number.isFinite(launcherTop)) return;

    const availableWidth = Math.max(0, space.viewportRight - space.viewportLeft - margin * 2);
    const fullAvailableHeight = Math.max(0, space.viewportBottom - space.viewportTop - margin * 2);
    const roomAbove = Math.max(0, launcherTop - gap - (space.viewportTop + margin));
    const roomBelow = Math.max(0, space.viewportBottom - margin - (launcherTop + launcherSize + gap));
    const placeAbove = roomAbove >= roomBelow;
    const anchoredRoom = placeAbove ? roomAbove : roomBelow;
    // Keep the panel attached to the launcher whenever there is enough usable
    // room. On extremely small viewports, fill the safe viewport and clamp.
    const maximumHeight = Math.min(680, anchoredRoom >= 140 ? anchoredRoom : fullAvailableHeight);
    const natural = this.measureNaturalHeight();
    const height = natural > 0 ? Math.min(natural, maximumHeight) : maximumHeight;
    const anchorRight = launcherLeft + launcherSize;
    const minLeft = space.viewportLeft + margin;
    const maximumWidth = Math.min(460, availableWidth);
    const rightAlignedWidth = Math.max(0, anchorRight - minLeft);
    const canRightAlign = rightAlignedWidth >= Math.min(280, maximumWidth);
    const width = canRightAlign ? Math.min(maximumWidth, rightAlignedWidth) : maximumWidth;
    const maxLeft = space.viewportRight - margin - width;
    const left = canRightAlign
      ? anchorRight - width
      : Math.max(minLeft, Math.min(maxLeft, launcherLeft));
    const desiredTop = placeAbove
      ? launcherTop - gap - height
      : launcherTop + launcherSize + gap;
    const minTop = space.viewportTop + margin;
    const maxTop = space.viewportBottom - margin - height;
    const top = Math.max(minTop, Math.min(maxTop, desiredTop));

    this.panel.style.width = `${width}px`;
    this.panel.style.height = `${height}px`;
    this.panel.style.left = `${left}px`;
    this.panel.style.top = `${top}px`;
  }

  private open(): void {
    if (!this.enabled) return;
    if (!this.target?.isConnected) {
      this.showStatus(this.messages.writingAssistantTargetMissing, 'error');
      return;
    }
    this.panelOpen = true;
    this.panelManuallyPositioned = false;
    this.panel.style.display = 'block';
    this.resetHistory();
    this.clearStatus();
    this.syncTonePicker();
    void this.ensureModelsLoaded();
    this.refreshSkills();
    // Never treat the textarea's full value as rewrite input. The source starts
    // from a non-empty range the user explicitly selected, or stays empty for
    // the user to type; the caret is kept so 插入 can put text there.
    this.sourceRange = undefined;
    this.sourceTextSnapshot = '';
    const target = this.target;
    this.insertAt = { start: target.selectionStart ?? target.value.length, end: target.selectionEnd ?? target.value.length };
    this.captureSelectedSourceFromTarget();
    this.sourceInput.value = this.sourceTextSnapshot;
    this.refreshSourceState();
    this.positionPanel();
    this.options.window.requestAnimationFrame?.(() => this.refreshPanelPosition());
    // Keep focus in the source textarea when the panel first opens. Many editors
    // render their textarea inside a popover that closes immediately on blur.
  }

  private close(restoreFocus: boolean): void {
    const drag = this.dragState;
    if (drag && this.header.hasPointerCapture?.(drag.pointerId)) this.header.releasePointerCapture(drag.pointerId);
    this.dragState = undefined;
    delete this.header.dataset.dragging;
    this.panelOpen = false;
    this.closeModelPicker(false);
    this.closeTonePicker(false);
    this.panel.style.display = 'none';
    this.resetHistory();
    if (restoreFocus && this.target?.isConnected) this.target.focus({ preventScroll: true });
  }

  private async generate(): Promise<void> {
    const target = this.target;
    if (!target?.isConnected) {
      this.showStatus(this.messages.writingAssistantTargetMissing, 'error');
      return;
    }
    const text = this.getSourceText();
    if (!text) {
      this.showStatus(this.messages.writingAssistantEmpty, 'error');
      return;
    }

    const generation = ++this.generation;
    const style = this.selectedStyleOption();
    const tone = style.tone ?? 'polish';
    const skill = style.skill;
    this.generating = true;
    this.generateButton.disabled = true;
    this.sourceInput.readOnly = true;
    this.spinner.style.display = 'inline-block';
    this.generateIcon.style.display = 'none';
    this.generateLabel.textContent = this.messages.writingAssistantGenerating;
    this.generateButton.title = this.generateLabel.textContent;
    this.generateButton.setAttribute('aria-label', this.generateLabel.textContent);
    this.clearStatus();

    try {
      const response = await this.options.requestRewrite({
        requestId: this.createRequestId(),
        text,
        instruction: this.contextInput.value.trim() || undefined,
        ...(this.selectedModel.trim() ? { model: this.selectedModel.trim() } : {}),
        tone,
        ...(skill ? { skill: { name: skill.name, prompt: skill.prompt } } : {}),
      });
      if (generation !== this.generation) return;
      this.history.unshift({
        id: `${generation}-${Date.now()}`,
        sourceText: text,
        resultText: response.text,
        tone,
        ...(skill ? { skillName: skill.name } : {}),
        ...(this.selectedModel.trim() ? { model: this.selectedModel.trim() } : {}),
        ...(this.sourceRange ? { sourceRange: { ...this.sourceRange } } : this.insertAt ? { insertAt: { ...this.insertAt } } : {}),
      });
      this.renderResults();
      this.refreshPanelPosition();
      this.revealResult();
      const revealAfterLayout = () => {
        this.renderResults();
        this.refreshPanelPosition();
        this.revealResult();
      };
      if (this.options.window.requestAnimationFrame) this.options.window.requestAnimationFrame(revealAfterLayout);
      else this.options.window.setTimeout(revealAfterLayout, 0);
    } catch (error) {
      if (generation !== this.generation) return;
      this.showStatus(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      if (generation === this.generation) {
        this.generating = false;
        this.sourceInput.readOnly = false;
        this.refreshSourceState(false);
        this.spinner.style.display = 'none';
        this.generateIcon.style.display = '';
        this.generateLabel.textContent = this.messages.writingAssistantGenerate;
        this.generateButton.title = this.generateLabel.textContent;
        this.generateButton.setAttribute('aria-label', this.generateLabel.textContent);
      }
    }
  }

  private refreshSourceState(clearExistingStatus = true): void {
    if (!this.target?.isConnected) {
      if (!this.generating) this.generateButton.disabled = true;
      return;
    }
    if (this.generating) return;
    const text = this.getSourceText();
    this.generateButton.disabled = !text;
    if (text && clearExistingStatus && this.status.dataset.kind === 'error') this.clearStatus();
  }

  private captureSelectedSourceFromTarget(): boolean {
    const target = this.target;
    if (!target) return false;

    const value = target.value;
    const selectionStart = Math.max(0, Math.min(value.length, target.selectionStart ?? 0));
    const selectionEnd = Math.max(selectionStart, Math.min(value.length, target.selectionEnd ?? selectionStart));
    if (selectionEnd <= selectionStart) return false;

    this.sourceRange = { start: selectionStart, end: selectionEnd, selected: true };
    this.sourceTextSnapshot = value.slice(selectionStart, selectionEnd).trim();
    return true;
  }

  private getSourceText(): string {
    return this.sourceTextSnapshot;
  }

  /** Shows a newly selected range of the page textarea as the source. */
  private syncSourceFromSelection(): void {
    this.sourceInput.value = this.sourceTextSnapshot;
    this.refreshSourceState();
  }

  private revealResult(): void {
    const contentRect = this.content.getBoundingClientRect();
    const resultRect = this.resultList.getBoundingClientRect();
    const hasLayoutGeometry = contentRect.height > 0 || resultRect.height > 0;
    const resultTop = hasLayoutGeometry
      ? this.content.scrollTop + resultRect.top - contentRect.top
      : this.resultList.offsetTop - this.content.offsetTop;
    // Assign scrollTop directly instead of relying on scrollTo/scrollIntoView.
    // This keeps scrolling scoped to the assistant and avoids moving the page's
    // own dialog or viewport.
    this.content.scrollTop = Math.max(0, resultTop - 12);
  }

  private toneLabelFor(tone: WritingTone): string {
    return {
      polish: this.messages.writingTonePolish,
      professional: this.messages.writingToneProfessional,
      friendly: this.messages.writingToneFriendly,
      concise: this.messages.writingToneConcise,
    }[tone];
  }

  private renderResults(): void {
    const { document } = this.options;
    for (const timer of this.historyCopyResetTimers.values()) this.options.window.clearTimeout(timer);
    this.historyCopyResetTimers.clear();
    this.resultList.replaceChildren();
    this.resultList.style.removeProperty('max-height');
    this.resultList.dataset.hasResults = String(this.history.length > 0);

    const bodies: Array<{ body: HTMLElement; toggle: HTMLButtonElement; id: string }> = [];
    for (const item of this.history) {
      const card = document.createElement('section');
      card.className = 'result-card';
      card.setAttribute('role', 'listitem');
      card.setAttribute('aria-label', this.messages.writingAssistantResult);
      card.dataset.historyItemId = item.id;

      const header = document.createElement('div');
      header.className = 'result-header';
      const meta = document.createElement('div');
      meta.className = 'result-meta';
      const tone = document.createElement('span');
      tone.className = 'result-tone';
      tone.textContent = item.skillName ?? this.toneLabelFor(item.tone);
      meta.append(tone);
      if (item.model) {
        const model = document.createElement('span');
        model.className = 'result-model';
        model.textContent = item.model;
        model.title = item.model;
        meta.append(model);
      }

      const actions = document.createElement('div');
      actions.className = 'result-actions';
      const insert = document.createElement('button');
      insert.type = 'button';
      insert.className = 'result-insert';
      insert.textContent = this.messages.writingAssistantInsert;
      insert.addEventListener('click', () => this.insertResult(item));
      const body = document.createElement('div');
      body.className = 'result-body';
      body.append(renderMarkdown(document, item.resultText));
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'icon-button result-copy';
      this.updateCopyButton(copy, false);
      copy.addEventListener('click', () => void this.copyResult(item, body, copy));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-button result-delete';
      remove.title = this.messages.writingAssistantDeleteResult;
      remove.setAttribute('aria-label', this.messages.writingAssistantDeleteResult);
      remove.append(createSvg(document, '<path d="M5 7h14M10 11v6M14 11v6M9 7l1-2h4l1 2M7 7l1 12h8l1-12"/>'));
      remove.addEventListener('click', () => this.deleteResult(item.id));
      actions.append(insert, copy, remove);
      header.append(meta, actions);

      const expanded = this.expandedResults.has(item.id);
      if (!expanded) body.dataset.collapsed = 'true';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'result-toggle';
      toggle.hidden = true;
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.textContent = expanded ? this.messages.writingAssistantCollapseResult : this.messages.writingAssistantExpandResult;
      toggle.addEventListener('click', () => {
        if (this.expandedResults.has(item.id)) this.expandedResults.delete(item.id);
        else this.expandedResults.add(item.id);
        this.renderResults();
        this.refreshPanelPosition();
      });
      card.append(header, body, toggle);
      this.resultList.append(card);
      bodies.push({ body, toggle, id: item.id });
    }

    // Long results are clamped with a 展开全部 toggle; measured after mounting.
    for (const { body, toggle, id } of bodies) {
      const expanded = this.expandedResults.has(id);
      const overflowing = expanded || body.scrollHeight > body.clientHeight + 1;
      toggle.hidden = !overflowing;
      if (overflowing && !expanded) body.dataset.overflowing = 'true';
    }
    // Results differ in length, so the list ends at the bottom of the third one.
    const cards = [...this.resultList.children] as HTMLElement[];
    const last = cards[VISIBLE_RESULTS - 1];
    if (cards.length > VISIBLE_RESULTS && last) {
      const height = Math.round(last.getBoundingClientRect().bottom - cards[0]!.getBoundingClientRect().top);
      if (height > 0) this.resultList.style.maxHeight = `min(${height}px, var(--results-max))`;
      this.resultList.dataset.scrollable = 'true';
    } else {
      delete this.resultList.dataset.scrollable;
    }
  }

  private deleteResult(id: string): void {
    this.history = this.history.filter((item) => item.id !== id);
    this.expandedResults.delete(id);
    this.renderResults();
    this.refreshPanelPosition();
  }

  private resetHistory(): void {
    for (const timer of this.historyCopyResetTimers.values()) this.options.window.clearTimeout(timer);
    this.historyCopyResetTimers.clear();
    this.history = [];
    this.expandedResults.clear();
    this.renderResults();
  }

  private updateCopyButton(button: HTMLButtonElement, copied: boolean): void {
    const label = copied ? this.messages.copied : this.messages.copy;
    const icon = copied
      ? '<path d="m5 12 4 4L19 6"/>'
      : '<rect x="9" y="9" width="10" height="10" rx="2"/><path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>';
    button.replaceChildren(createSvg(this.options.document, icon));
    button.title = label;
    button.setAttribute('aria-label', label);
    if (copied) button.dataset.copied = 'true';
    else delete button.dataset.copied;
  }

  private showCopyConfirmation(button: HTMLButtonElement): void {
    const previousTimer = this.historyCopyResetTimers.get(button);
    if (previousTimer !== undefined) this.options.window.clearTimeout(previousTimer);
    this.updateCopyButton(button, true);
    const timer = this.options.window.setTimeout(() => {
      this.historyCopyResetTimers.delete(button);
      this.updateCopyButton(button, false);
    }, 2_000);
    this.historyCopyResetTimers.set(button, timer);
  }

  private async copyResult(
    item: WritingAssistantHistoryItem,
    resultElement: HTMLElement,
    button: HTMLButtonElement,
  ): Promise<void> {
    const value = item.resultText.trim();
    if (!value) return;
    try {
      const clipboard = this.options.window.navigator.clipboard;
      if (clipboard?.writeText) {
        await clipboard.writeText(value);
      } else {
        const selection = this.options.window.getSelection();
        const range = this.options.document.createRange();
        range.selectNodeContents(resultElement);
        selection?.removeAllRanges();
        selection?.addRange(range);
        if (!this.options.document.execCommand('copy')) throw new Error(this.messages.copy);
        selection?.removeAllRanges();
      }
      this.showCopyConfirmation(button);
    } catch (error) {
      this.showStatus(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  private insertResult(item: WritingAssistantHistoryItem): void {
    if (!this.target?.isConnected) {
      this.showStatus(this.messages.writingAssistantTargetMissing, 'error');
      return;
    }
    const value = item.resultText;
    if (!value.trim()) return;
    const length = this.target.value.length;
    const range = item.sourceRange ?? item.insertAt ?? { start: length, end: length };
    const safeStart = Math.max(0, Math.min(length, range.start));
    const safeEnd = Math.max(safeStart, Math.min(length, range.end));
    const nextValue = `${this.target.value.slice(0, safeStart)}${value}${this.target.value.slice(safeEnd)}`;
    const nextCaret = safeStart + value.length;
    setTextareaValue(this.target, nextValue);
    this.target.focus({ preventScroll: true });
    this.target.setSelectionRange(nextCaret, nextCaret);
    this.showStatus(this.messages.writingAssistantInserted, 'success');
  }

  private showStatus(message: string, kind: 'error' | 'success'): void {
    this.status.textContent = message;
    this.status.dataset.kind = kind;
    this.status.style.display = 'block';
  }

  private clearStatus(): void {
    this.status.textContent = '';
    delete this.status.dataset.kind;
    this.status.style.display = 'none';
  }
}
