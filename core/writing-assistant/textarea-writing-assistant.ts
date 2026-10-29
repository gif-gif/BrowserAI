import type { AppMessages } from '../../shared/i18n/messages';
import type { ResolvedAppearance } from '../../shared/theme/appearance';
import type { ThemeTokens } from '../../shared/theme/theme';
import { WRITING_TONES, type WritingAssistResult, type WritingTone } from '../../shared/types/writing-assistant';

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
  | 'writingAssistantInsert'
  | 'writingAssistantInserted'
  | 'writingAssistantEmpty'
  | 'writingAssistantTargetMissing'
  | 'writingAssistantPrivacy'
  | 'model'
  | 'modelSearchPlaceholder'
  | 'modelSearchNoMatch'
  | 'retry'
  | 'copy'
  | 'copied'
>;

interface WritingAssistantHistoryItem {
  id: string;
  sourceText: string;
  resultText: string;
  tone: WritingTone;
  model?: string;
  sourceRange?: { start: number; end: number; selected: boolean };
}

interface RewriteRequest {
  requestId: string;
  text: string;
  instruction?: string;
  model?: string;
  tone: WritingTone;
}

interface TextareaWritingAssistantOptions {
  document: Document;
  window: Window;
  messages: WritingAssistantMessages;
  loadMessages?(): Promise<WritingAssistantMessages>;
  loadModels?(): Promise<{ model: string; models: string[] }>;
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
    height: min(680px, calc(100vh - 24px));
    height: min(680px, calc(100dvh - 24px));
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
  .panel-layout {
    display: grid;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    grid-template-rows: auto minmax(0, 1fr) auto;
  }
  .header {
    min-width: 0;
    width: 100%;
    max-width: 100%;
    min-height: 64px;
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) 40px;
    align-items: center;
    gap: 12px;
    overflow: hidden;
    padding: 12px 14px 12px 16px;
    border-bottom: 1px solid var(--ai-border);
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  .header[data-dragging="true"] { cursor: grabbing; }
  .brand-mark {
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--ai-text);
  }
  .brand-mark svg { width: 28px; height: 28px; overflow: visible; }
  .title-wrap { min-width: 0; width: 100%; max-width: 100%; overflow: hidden; }
  .title { max-width: 100%; margin: 0; overflow: hidden; color: var(--ai-text); font-size: 15px; line-height: 20px; font-weight: 700; letter-spacing: -.01em; text-overflow: ellipsis; white-space: nowrap; }
  .description {
    display: -webkit-box;
    max-width: 100%;
    margin: 1px 0 0;
    overflow: hidden;
    overflow-wrap: anywhere;
    color: var(--ai-text-secondary);
    font-size: 11px;
    line-height: 15px;
    white-space: normal;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  .icon-button {
    flex: 0 0 auto;
    width: 40px;
    height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    appearance: none;
    border: 0;
    border-radius: 12px;
    color: var(--ai-text-secondary);
    background: transparent;
    cursor: pointer;
    transition: color 160ms ease, background 160ms ease, transform 120ms ease;
  }
  .icon-button:hover { color: var(--ai-text); background: var(--ai-surface-hover); }
  .icon-button:active { transform: scale(.96); }
  .icon-button svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .content {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    max-height: 100%;
    overflow-x: hidden;
    overflow-y: scroll;
    overscroll-behavior: contain;
    scroll-behavior: auto;
    touch-action: pan-y;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    scrollbar-gutter: stable;
  }
  .content::-webkit-scrollbar { width: 8px; }
  .content::-webkit-scrollbar-track { background: transparent; }
  .content::-webkit-scrollbar-thumb { border: 2px solid transparent; border-radius: 999px; background: color-mix(in srgb, var(--ai-text-secondary) 42%, transparent); background-clip: padding-box; }
  .content::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--ai-text-secondary) 62%, transparent); background-clip: padding-box; }
  .source-preview {
    margin: 0;
    max-height: 96px;
    overflow: auto;
    padding: 20px 22px 16px;
    color: var(--ai-text-secondary);
    font-size: 15px;
    line-height: 1.55;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .result-wrap {
    display: none;
    gap: 12px;
    padding: 0 22px 18px;
    border-bottom: 1px solid var(--ai-border);
  }
  .history-section { display: none; padding: 16px 14px 18px; border-bottom: 1px solid var(--ai-border); }
  .history-heading { display: block; padding: 0 8px 10px; color: var(--ai-text-secondary); font-size: 11px; line-height: 16px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
  .history-list { display: grid; gap: 10px; }
  .history-card { display: grid; gap: 10px; padding: 14px; border: 1px solid var(--ai-border); border-radius: 14px; background: var(--ai-surface-subtle); }
  .history-meta { display: flex; align-items: center; gap: 7px; min-width: 0; color: var(--ai-text-secondary); font-size: 11px; line-height: 16px; }
  .history-tone { color: var(--ai-accent); font-weight: 700; }
  .history-model { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .history-block { display: grid; gap: 4px; }
  .history-block-label { color: var(--ai-text-secondary); font-size: 10px; line-height: 14px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
  .history-source, .history-result { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }
  .history-source { max-height: 76px; overflow: auto; color: var(--ai-text-secondary); font-size: 13px; line-height: 1.5; }
  .history-result { color: var(--ai-text); font-size: 15px; line-height: 1.58; }
  .history-actions { display: flex; align-items: center; gap: 4px; padding-top: 2px; }
  .history-insert-button { min-height: 28px; padding: 3px 8px; appearance: none; border: 1px solid var(--ai-accent); border-radius: 9px; color: #fff; background: var(--ai-accent); font-size: 11px; line-height: 16px; font-weight: 650; cursor: pointer; }
  .history-insert-button:hover { border-color: var(--ai-accent-hover); background: var(--ai-accent-hover); }
  .history-copy-button { margin-left: auto; width: 28px; height: 28px; border-radius: 8px; }
  .history-copy-button[data-copied="true"] { color: var(--ai-accent); background: var(--ai-accent-soft); }
  .result-label { color: var(--ai-text-secondary); font-size: 11px; line-height: 16px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
  .result-source-block { display: grid; gap: 4px; padding: 10px 12px; border: 1px solid var(--ai-border); border-radius: 12px; background: var(--ai-surface-subtle); }
  .result-source { margin: 0; max-height: 76px; overflow: auto; color: var(--ai-text-secondary); font-size: 13px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }
  .result {
    width: 100%;
    margin: 0;
    color: var(--ai-text);
    font-size: 17px;
    line-height: 1.62;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    user-select: text;
  }
  .composer-input::placeholder { color: #98a2b3; }
  .result-actions { display: flex; align-items: center; gap: 4px; }
  .insert-button, .retry-button {
    min-height: 28px;
    padding: 3px 8px;
    appearance: none;
    border-radius: 8px;
    font-size: 11px;
    line-height: 16px;
    font-weight: 650;
    cursor: pointer;
    transition: transform 120ms ease, background 160ms ease, border-color 160ms ease, color 160ms ease;
  }
  .insert-button { border: 1px solid var(--ai-accent); color: #fff; background: var(--ai-accent); }
  .insert-button:hover:not(:disabled) { border-color: var(--ai-accent-hover); background: var(--ai-accent-hover); }
  .retry-button { border: 1px solid transparent; color: var(--ai-text-secondary); background: transparent; }
  .retry-button:hover:not(:disabled) { color: var(--ai-text); background: var(--ai-surface-hover); }
  .copy-button { width: 28px; height: 28px; margin-left: auto; border-radius: 8px; }
  .copy-button[data-copied="true"] { color: var(--ai-accent); background: var(--ai-accent-soft); }
  .picker-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 10px 22px 12px; }
  .model-section, .tone-section { min-width: 0; }
  .model-picker-wrap { position: relative; }
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
  .model-popover {
    position: absolute;
    z-index: 2;
    top: calc(100% + 6px);
    right: 0;
    width: max(100%, 260px);
    display: none;
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
  .model-list { max-height: 220px; display: grid; gap: 1px; overflow-y: auto; overscroll-behavior: contain; }
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
    position: absolute;
    z-index: 2;
    top: calc(100% + 6px);
    left: 0;
    width: max(100%, 180px);
    display: none;
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
  .feedback { padding: 0 22px; }
  .status { display: none; margin: 0 0 12px; padding: 9px 11px; border-radius: 10px; color: var(--ai-text-secondary); background: var(--ai-surface-subtle); font-size: 12px; line-height: 18px; }
  .status[data-kind="error"] { display: block; color: #b42318; background: #fef3f2; }
  .status[data-kind="success"] { display: block; color: #067647; background: #ecfdf3; }
  .privacy { display: flex; gap: 7px; align-items: flex-start; padding: 0 22px 16px; color: var(--ai-text-secondary); font-size: 11px; line-height: 16px; }
  .privacy svg { flex: 0 0 auto; width: 13px; height: 13px; margin-top: 1px; fill: none; stroke: currentColor; stroke-width: 1.8; }
  .composer-shell { flex: 0 0 auto; padding: 12px 14px 14px; border-top: 1px solid var(--ai-border); background: var(--ai-surface-subtle); }
  .composer {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 54px;
    padding: 7px 8px 7px 14px;
    border: 1px solid var(--ai-border);
    border-radius: 15px;
    background: var(--ai-surface);
    box-shadow: 0 6px 20px rgba(15,23,42,.10), 0 1px 3px rgba(15,23,42,.08);
  }
  .composer-input { min-width: 0; flex: 1; height: 38px; padding: 7px 0; border: 0; color: var(--ai-text); background: transparent; outline: none; }
  .generate-button {
    flex: 0 0 auto;
    width: 40px;
    height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    appearance: none;
    border: 1px solid var(--ai-accent);
    border-radius: 12px;
    color: #fff;
    background: var(--ai-accent);
    cursor: pointer;
    transition: transform 120ms ease, background 160ms ease, border-color 160ms ease;
  }
  .generate-button:hover:not(:disabled) { border-color: var(--ai-accent-hover); background: var(--ai-accent-hover); }
  .generate-button:active:not(:disabled), .insert-button:active:not(:disabled), .retry-button:active:not(:disabled) { transform: scale(.97); }
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
  .launcher:focus-visible, .icon-button:focus-visible, .insert-button:focus-visible, .retry-button:focus-visible,
  .tone-trigger:focus-visible, .generate-button:focus-visible {
    outline: 3px solid var(--ai-focus);
    outline-offset: 2px;
  }
  @media (max-width: 420px) {
    .panel {
      width: calc(100vw - 16px);
      height: calc(100vh - 16px);
      height: calc(100dvh - 16px);
      max-height: calc(100vh - 16px);
      max-height: calc(100dvh - 16px);
      border-radius: 16px;
    }
    .source-preview, .result-wrap { padding-left: 16px; padding-right: 16px; }
    .history-section { padding-left: 10px; padding-right: 10px; }
    .feedback { padding: 0 16px; }
    .privacy { padding-left: 16px; padding-right: 16px; }
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
  :host([data-appearance="dark"]) .composer-input::placeholder { color: #777d88; }
  :host([data-appearance="dark"]) .tone-icon { color: color-mix(in srgb, var(--ai-accent) 68%, white); background: color-mix(in srgb, var(--ai-accent) 18%, var(--ai-surface-subtle)); }
  :host([data-appearance="dark"]) .tone-option[aria-selected="true"] { color: color-mix(in srgb, var(--ai-accent) 68%, white); }
  :host([data-appearance="dark"]) .tone-popover { box-shadow: 0 12px 32px rgba(0,0,0,.42); }
  :host([data-appearance="dark"]) .status[data-kind="error"] { color: #fda29b; background: #4a2525; }
  :host([data-appearance="dark"]) .status[data-kind="success"] { color: #6ce9a6; background: #183a2d; }
  :host([data-appearance="dark"]) .composer { box-shadow: 0 7px 22px rgba(0,0,0,.30); }
  @media (prefers-reduced-motion: reduce) {
    .launcher, .panel, .icon-button, .insert-button, .retry-button, .tone-trigger, .tone-popover, .generate-button { animation: none; transition: none; }
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
  private readonly sourcePreview: HTMLParagraphElement;
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
  private readonly toneOptions = new Map<WritingTone, HTMLDivElement>();
  private readonly toneIcons: Record<WritingTone, string> = {
    polish: '<path d="m12 3 .8 2.4a5.5 5.5 0 0 0 3.5 3.5l2.4.8-2.4.8a5.5 5.5 0 0 0-3.5 3.5l-.8 2.4-.8-2.4a5.5 5.5 0 0 0-3.5-3.5l-2.4-.8 2.4-.8a5.5 5.5 0 0 0 3.5-3.5L12 3Z"/>',
    professional: '<rect x="4" y="7" width="16" height="12" rx="2"/><path d="M9 7V5h6v2M4 12h16M10 12v2h4v-2"/>',
    friendly: '<circle cx="12" cy="12" r="9"/><path d="M8.5 10h.01M15.5 10h.01M8 14.5c1 1.2 2.3 1.8 4 1.8s3-.6 4-1.8"/>',
    concise: '<path d="M5 7h14M5 12h9M5 17h6"/>',
  };
  private toneActiveIndex = 0;
  private readonly contextLabel: HTMLLabelElement;
  private readonly contextInput: HTMLInputElement;
  private readonly privacyText: HTMLSpanElement;
  private readonly generateButton: HTMLButtonElement;
  private readonly generateLabel: HTMLSpanElement;
  private readonly generateIcon: SVGSVGElement;
  private readonly spinner: HTMLSpanElement;
  private readonly resultWrap: HTMLDivElement;
  private readonly resultLabel: HTMLSpanElement;
  private readonly resultSourceLabel: HTMLSpanElement;
  private readonly resultSource: HTMLParagraphElement;
  private readonly result: HTMLDivElement;
  private readonly historySection: HTMLDivElement;
  private readonly historyLabel: HTMLSpanElement;
  private readonly historyList: HTMLDivElement;
  private readonly insertButton: HTMLButtonElement;
  private readonly retryButton: HTMLButtonElement;
  private readonly copyButton: HTMLButtonElement;
  private readonly status: HTMLDivElement;
  private readonly hostObserver: MutationObserver;
  private messages: WritingAssistantMessages;
  private messagesRefreshRevision = 0;
  private enabled = true;
  private target?: HTMLTextAreaElement;
  private sourceRange?: { start: number; end: number; selected: boolean };
  private sourceTextSnapshot = '';
  private interactionContainer?: HTMLElement;
  private panelOpen = false;
  private panelManuallyPositioned = false;
  private dragState?: { pointerId: number; offsetX: number; offsetY: number };
  private generating = false;
  private generation = 0;
  private copyConfirmed = false;
  private copyResetTimer?: number;
  private readonly historyCopyResetTimers = new Map<HTMLButtonElement, number>();
  private activeResult?: WritingAssistantHistoryItem;
  private history: WritingAssistantHistoryItem[] = [];
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
    const titleWrap = document.createElement('div');
    titleWrap.className = 'title-wrap';
    this.title = document.createElement('h2');
    this.title.className = 'title';
    this.title.id = 'chrome-ai-writing-title';
    this.description = document.createElement('p');
    this.description.className = 'description';
    titleWrap.append(this.title, this.description);
    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.className = 'icon-button close-button';
    this.closeButton.append(createSvg(document, '<path d="m6 6 12 12M18 6 6 18"/>'));
    this.header.append(brandMark, titleWrap, this.closeButton);

    this.content = document.createElement('div');
    this.content.className = 'content';
    this.sourcePreview = document.createElement('p');
    this.sourcePreview.className = 'source-preview';

    this.resultWrap = document.createElement('div');
    this.resultWrap.className = 'result-wrap';
    const resultSourceBlock = document.createElement('div');
    resultSourceBlock.className = 'result-source-block';
    this.resultSourceLabel = document.createElement('span');
    this.resultSourceLabel.className = 'history-block-label';
    this.resultSource = document.createElement('p');
    this.resultSource.className = 'result-source';
    resultSourceBlock.append(this.resultSourceLabel, this.resultSource);
    this.resultLabel = document.createElement('span');
    this.resultLabel.className = 'result-label';
    this.resultLabel.id = 'chrome-ai-writing-result-label';
    this.result = document.createElement('div');
    this.result.id = 'chrome-ai-writing-result';
    this.result.className = 'result';
    this.result.setAttribute('role', 'region');
    this.result.setAttribute('aria-labelledby', this.resultLabel.id);
    const resultActions = document.createElement('div');
    resultActions.className = 'result-actions';
    this.insertButton = document.createElement('button');
    this.insertButton.type = 'button';
    this.insertButton.className = 'insert-button';
    this.retryButton = document.createElement('button');
    this.retryButton.type = 'button';
    this.retryButton.className = 'retry-button';
    this.copyButton = document.createElement('button');
    this.copyButton.type = 'button';
    this.copyButton.className = 'icon-button copy-button';
    this.copyButton.append(createSvg(document, '<rect x="9" y="9" width="10" height="10" rx="2"/><path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>'));
    resultActions.append(this.insertButton, this.retryButton, this.copyButton);
    this.resultWrap.append(resultSourceBlock, this.resultLabel, this.result, resultActions);

    this.historySection = document.createElement('div');
    this.historySection.className = 'history-section';
    this.historyLabel = document.createElement('span');
    this.historyLabel.className = 'history-heading';
    this.historyList = document.createElement('div');
    this.historyList.className = 'history-list';
    this.historySection.append(this.historyLabel, this.historyList);

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
    for (const [index, value] of WRITING_TONES.entries()) {
      const option = document.createElement('option');
      option.value = value;
      this.toneSelect.append(option);
      const item = document.createElement('div');
      item.id = `chrome-ai-writing-tone-option-${value}`;
      item.className = 'tone-option';
      item.dataset.tone = value;
      item.setAttribute('role', 'option');
      const icon = document.createElement('span');
      icon.className = 'tone-icon';
      icon.append(createSvg(document, this.toneIcons[value]));
      const label = document.createElement('span');
      label.className = 'tone-text';
      const check = document.createElement('span');
      check.className = 'tone-check';
      check.append(createSvg(document, '<path d="m6 12 4 4 8-8"/>'));
      item.append(icon, label, check);
      item.addEventListener('pointerenter', () => this.setToneActiveIndex(index));
      item.addEventListener('mousedown', (event) => event.preventDefault());
      item.addEventListener('click', () => this.chooseTone(value));
      this.toneOptions.set(value, item);
      this.tonePopover.append(item);
    }
    tonePickerWrap.append(this.toneTrigger, this.tonePopover);
    toneSection.append(this.toneLabel, this.toneSelect, tonePickerWrap);
    this.syncTonePicker();

    const feedback = document.createElement('div');
    feedback.className = 'feedback';
    this.status = document.createElement('div');
    this.status.className = 'status';
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    feedback.append(this.status);

    const privacy = document.createElement('div');
    privacy.className = 'privacy';
    privacy.append(createSvg(document, '<path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>'));
    this.privacyText = document.createElement('span');
    privacy.append(this.privacyText);
    const pickerRow = document.createElement('div');
    pickerRow.className = 'picker-row';
    pickerRow.append(toneSection, modelSection);
    this.content.append(this.sourcePreview, this.resultWrap, this.historySection, pickerRow, feedback, privacy);

    const composerShell = document.createElement('div');
    composerShell.className = 'composer-shell';
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
    composerShell.append(composer);

    panelLayout.append(this.header, this.content, composerShell);
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
    this.insertButton.addEventListener('click', () => this.insertResult(this.activeResult));
    this.retryButton.addEventListener('click', () => void this.generate());
    this.copyButton.addEventListener('click', () => void this.copyResult(this.activeResult, this.result, this.copyButton, true));
    this.toneSelect.addEventListener('change', () => this.syncTonePicker());
    this.toneTrigger.addEventListener('click', () => (this.isTonePickerOpen() ? this.closeTonePicker(false) : this.openTonePicker()));
    this.toneTrigger.addEventListener('keydown', this.onToneTriggerKeyDown);
    this.modelTrigger.addEventListener('click', () => (this.isModelPickerOpen() ? this.closeModelPicker(false) : this.openModelPicker()));
    this.modelSearch.addEventListener('input', () => { this.modelActiveIndex = 0; this.renderModelOptions(); });
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
    if (this.copyResetTimer !== undefined) this.options.window.clearTimeout(this.copyResetTimer);
    this.copyResetTimer = undefined;
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
      this.insertButton.disabled = true;
      this.retryButton.disabled = true;
      this.copyButton.disabled = true;
      this.spinner.style.display = 'none';
      this.generateIcon.style.display = '';
      this.generateLabel.textContent = this.messages.writingAssistantGenerate;
      this.generateButton.title = this.messages.writingAssistantGenerate;
      this.generateButton.setAttribute('aria-label', this.messages.writingAssistantGenerate);
      this.close(false);
      this.hideLauncher();
      this.target = undefined;
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
    const toneLabels: Record<WritingTone, string> = {
      polish: messages.writingTonePolish,
      professional: messages.writingToneProfessional,
      friendly: messages.writingToneFriendly,
      concise: messages.writingToneConcise,
    };
    for (const option of this.toneSelect.options) option.textContent = toneLabels[option.value as WritingTone];
    for (const [tone, option] of this.toneOptions) {
      const label = option.querySelector<HTMLElement>('.tone-text');
      if (label) label.textContent = toneLabels[tone];
    }
    this.syncTonePicker();
    this.contextLabel.textContent = messages.writingAssistantContext;
    this.contextInput.placeholder = messages.writingAssistantContextPlaceholder;
    this.privacyText.textContent = messages.writingAssistantPrivacy;
    this.generateLabel.textContent = this.generating ? messages.writingAssistantGenerating : messages.writingAssistantGenerate;
    this.generateButton.title = this.generateLabel.textContent;
    this.generateButton.setAttribute('aria-label', this.generateLabel.textContent);
    this.resultSourceLabel.textContent = messages.writingAssistantOriginal;
    this.resultLabel.textContent = messages.writingAssistantResult;
    this.historyLabel.textContent = messages.writingAssistantHistory;
    this.insertButton.textContent = messages.writingAssistantInsert;
    this.retryButton.textContent = messages.retry;
    this.updateCopyButton(this.copyButton, this.copyConfirmed);
    this.renderHistory();
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
    this.modelSearch.focus({ preventScroll: true });
    this.modelPopover.scrollIntoView?.({ block: 'nearest' });
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
    this.setToneActiveIndex(Math.max(0, WRITING_TONES.indexOf(this.toneSelect.value as WritingTone)));
    this.tonePopover.scrollIntoView?.({ block: 'nearest' });
  }

  private closeTonePicker(restoreFocus: boolean): void {
    if (!this.isTonePickerOpen()) return;
    delete this.tonePopover.dataset.open;
    this.toneTrigger.setAttribute('aria-expanded', 'false');
    this.toneTrigger.removeAttribute('aria-activedescendant');
    if (restoreFocus) this.toneTrigger.focus({ preventScroll: true });
  }

  private chooseTone(tone: WritingTone): void {
    this.toneSelect.value = tone;
    this.syncTonePicker();
    this.closeTonePicker(true);
  }

  private setToneActiveIndex(index: number): void {
    this.toneActiveIndex = index;
    for (const [optionIndex, tone] of WRITING_TONES.entries()) {
      this.toneOptions.get(tone)!.dataset.active = optionIndex === index ? 'true' : 'false';
    }
    this.toneTrigger.setAttribute('aria-activedescendant', `chrome-ai-writing-tone-option-${WRITING_TONES[index]}`);
  }

  private syncTonePicker(): void {
    const selectedTone = this.toneSelect.value as WritingTone;
    for (const [tone, option] of this.toneOptions) {
      option.setAttribute('aria-selected', String(tone === selectedTone));
    }
    this.toneValue.textContent = this.toneLabelFor(selectedTone);
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
      this.setToneActiveIndex((this.toneActiveIndex + step + WRITING_TONES.length) % WRITING_TONES.length);
    } else if ((event.key === 'Enter' || event.key === ' ') && this.isTonePickerOpen()) {
      event.preventDefault();
      this.chooseTone(WRITING_TONES[this.toneActiveIndex]!);
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

  private bindTarget(target: HTMLTextAreaElement): void {
    this.target = target;
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
    if (this.captureSelectedSourceFromTarget()) this.refreshSourceState();
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

    const maxScrollTop = Math.max(0, this.content.scrollHeight - this.content.clientHeight);
    if (maxScrollTop <= 0 || event.deltaY === 0) return;

    const multiplier = event.deltaMode === 1
      ? 18
      : event.deltaMode === 2
        ? Math.max(1, this.content.clientHeight)
        : 1;
    const nextScrollTop = Math.max(
      0,
      Math.min(maxScrollTop, this.content.scrollTop + event.deltaY * multiplier),
    );

    // The assistant can be mounted inside a page-owned dialog whose global
    // wheel handler locks scrolling. Handle the wheel at window capture level
    // so long rewrite results remain scrollable without moving the page behind
    // the assistant.
    this.content.scrollTop = nextScrollTop;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

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

  private ensureOpenPanelMounted(): void {
    if (!this.panelOpen) return;
    const target = this.target;
    if (!target?.isConnected) {
      // The page-owned dialog/editor containing the source textarea was
      // genuinely closed. Do not remount the assistant as a detached floating
      // window; dismiss it and wait for the next textarea focus instead.
      this.close(false);
      this.launcher.style.display = 'none';
      this.target = undefined;
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
    const height = Math.min(Number.isFinite(currentHeight) ? currentHeight : 680, availableHeight);
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

  private refreshPanelPosition(): void {
    if (this.panelManuallyPositioned) this.positionPanelWithinViewport();
    else this.positionPanel();
  }

  private showLauncher(): void {
    if (!this.enabled) return;
    this.launcher.style.display = 'flex';
    this.positionLauncher();
  }

  private hideLauncher(): void {
    this.launcher.style.display = 'none';
    if (!this.panelOpen) this.target = undefined;
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
    const height = Math.min(680, anchoredRoom >= 140 ? anchoredRoom : fullAvailableHeight);
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
    // Never treat the textarea's full value as rewrite input. A source snapshot
    // is created only from a non-empty range the user explicitly selected.
    this.sourceRange = undefined;
    this.sourceTextSnapshot = '';
    this.captureSelectedSourceFromTarget();
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
    this.generating = true;
    this.sourcePreview.textContent = text;
    this.generateButton.disabled = true;
    this.insertButton.disabled = true;
    this.retryButton.disabled = true;
    this.copyButton.disabled = true;
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
        tone: this.toneSelect.value as WritingTone,
      });
      if (generation !== this.generation) return;
      if (this.activeResult) this.history.unshift(this.activeResult);
      this.activeResult = {
        id: `${generation}-${Date.now()}`,
        sourceText: text,
        resultText: response.text,
        tone: this.toneSelect.value as WritingTone,
        ...(this.selectedModel.trim() ? { model: this.selectedModel.trim() } : {}),
        ...(this.sourceRange ? { sourceRange: { ...this.sourceRange } } : {}),
      };
      this.resultSource.textContent = text;
      this.result.textContent = response.text;
      this.resultWrap.style.display = 'grid';
      this.renderHistory();
      this.refreshPanelPosition();
      this.revealResult();
      const revealAfterLayout = () => {
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
        this.refreshSourceState(false);
        const hasResult = Boolean(this.activeResult?.resultText.trim());
        this.insertButton.disabled = !hasResult;
        this.retryButton.disabled = !hasResult;
        this.copyButton.disabled = !hasResult;
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

    const text = this.getSourceText();
    this.sourcePreview.textContent = text;
    if (this.generating) return;

    this.generateButton.disabled = !text;
    if (text) {
      if (clearExistingStatus) this.clearStatus();
      return;
    }
    if (clearExistingStatus) this.showStatus(this.messages.writingAssistantEmpty, 'error');
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

  private revealResult(): void {
    const contentRect = this.content.getBoundingClientRect();
    const resultRect = this.resultWrap.getBoundingClientRect();
    const hasLayoutGeometry = contentRect.height > 0 || resultRect.height > 0;
    const resultTop = hasLayoutGeometry
      ? this.content.scrollTop + resultRect.top - contentRect.top
      : this.resultWrap.offsetTop - this.content.offsetTop;
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

  private renderHistory(): void {
    for (const timer of this.historyCopyResetTimers.values()) this.options.window.clearTimeout(timer);
    this.historyCopyResetTimers.clear();
    this.historyList.replaceChildren();
    this.historySection.style.display = this.history.length ? 'block' : 'none';

    for (const item of this.history) {
      const card = this.options.document.createElement('article');
      card.className = 'history-card';
      card.dataset.historyItemId = item.id;

      const meta = this.options.document.createElement('div');
      meta.className = 'history-meta';
      const tone = this.options.document.createElement('span');
      tone.className = 'history-tone';
      tone.textContent = this.toneLabelFor(item.tone);
      meta.append(tone);
      if (item.model) {
        const separator = this.options.document.createElement('span');
        separator.textContent = '·';
        const model = this.options.document.createElement('span');
        model.className = 'history-model';
        model.textContent = item.model;
        meta.append(separator, model);
      }

      const sourceBlock = this.options.document.createElement('div');
      sourceBlock.className = 'history-block';
      const sourceLabel = this.options.document.createElement('span');
      sourceLabel.className = 'history-block-label';
      sourceLabel.textContent = this.messages.writingAssistantOriginal;
      const source = this.options.document.createElement('p');
      source.className = 'history-source';
      source.textContent = item.sourceText;
      sourceBlock.append(sourceLabel, source);

      const resultBlock = this.options.document.createElement('div');
      resultBlock.className = 'history-block';
      const resultLabel = this.options.document.createElement('span');
      resultLabel.className = 'history-block-label';
      resultLabel.textContent = this.messages.writingAssistantResult;
      const result = this.options.document.createElement('p');
      result.className = 'history-result';
      result.textContent = item.resultText;
      resultBlock.append(resultLabel, result);

      const actions = this.options.document.createElement('div');
      actions.className = 'history-actions';
      const insert = this.options.document.createElement('button');
      insert.type = 'button';
      insert.className = 'history-insert-button';
      insert.textContent = this.messages.writingAssistantInsert;
      insert.addEventListener('click', () => this.insertResult(item));
      const copy = this.options.document.createElement('button');
      copy.type = 'button';
      copy.className = 'icon-button history-copy-button';
      this.updateCopyButton(copy, false);
      copy.addEventListener('click', () => void this.copyResult(item, result, copy, false));
      actions.append(insert, copy);

      card.append(meta, sourceBlock, resultBlock, actions);
      this.historyList.append(card);
    }
  }

  private resetHistory(): void {
    if (this.copyResetTimer !== undefined) this.options.window.clearTimeout(this.copyResetTimer);
    this.copyResetTimer = undefined;
    for (const timer of this.historyCopyResetTimers.values()) this.options.window.clearTimeout(timer);
    this.historyCopyResetTimers.clear();
    this.activeResult = undefined;
    this.history = [];
    this.resultSource.textContent = '';
    this.result.textContent = '';
    this.resultWrap.style.display = 'none';
    this.historyList.replaceChildren();
    this.historySection.style.display = 'none';
    this.updateCopyButton(this.copyButton, false);
  }

  private updateCopyButton(button: HTMLButtonElement, copied: boolean): void {
    if (button === this.copyButton) this.copyConfirmed = copied;
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

  private showCopyConfirmation(button: HTMLButtonElement, current: boolean): void {
    if (current) {
      if (this.copyResetTimer !== undefined) this.options.window.clearTimeout(this.copyResetTimer);
      this.updateCopyButton(button, true);
      this.copyResetTimer = this.options.window.setTimeout(() => {
        this.copyResetTimer = undefined;
        this.updateCopyButton(button, false);
      }, 2_000);
      return;
    }

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
    item: WritingAssistantHistoryItem | undefined,
    resultElement: HTMLElement,
    button: HTMLButtonElement,
    current: boolean,
  ): Promise<void> {
    const value = item?.resultText.trim() ?? '';
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
      this.showCopyConfirmation(button, current);
    } catch (error) {
      this.showStatus(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  private insertResult(item: WritingAssistantHistoryItem | undefined): void {
    if (!this.target?.isConnected) {
      this.showStatus(this.messages.writingAssistantTargetMissing, 'error');
      return;
    }
    const value = item?.resultText ?? '';
    if (!value.trim()) return;
    const range = item?.sourceRange ?? { start: 0, end: this.target.value.length, selected: false };
    const safeStart = Math.max(0, Math.min(this.target.value.length, range.start));
    const safeEnd = Math.max(safeStart, Math.min(this.target.value.length, range.end));
    const nextValue = `${this.target.value.slice(0, safeStart)}${value}${this.target.value.slice(safeEnd)}`;
    const nextCaret = safeStart + value.length;
    setTextareaValue(this.target, nextValue);
    this.target.focus({ preventScroll: true });
    this.target.setSelectionRange(nextCaret, nextCaret);
    this.showStatus(this.messages.writingAssistantInserted, 'success');
    this.generateButton.disabled = false;
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
