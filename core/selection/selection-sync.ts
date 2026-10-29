import { DEFAULT_CONTEXT_LIMITS } from '../../shared/constants/context-limits';
import { sanitizeText } from '../page-context/sanitize-text';
import type { ContentEvent } from '../../messaging/contracts';

export interface SelectionSyncOptions {
  document: Document;
  window: Window;
  getSelection?: () => Selection | null;
  sendEvent: (event: ContentEvent) => void | Promise<void>;
  createRequestId?: () => string;
  delayMs?: number;
  maxCharacters?: number;
}

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `selection-sync-${Date.now()}`;
}

function isIgnoredNode(node: Node | null | undefined): boolean {
  const element = node instanceof Element ? node : node?.parentElement;
  if (!element) return false;
  if (element.closest('[data-chrome-ai-owned="true"]')) return true;
  return element instanceof HTMLInputElement && element.type.toLowerCase() === 'password';
}

/**
 * Mirrors the page selection to the extension so the side panel can show it
 * as context while the user is still on the page. Only changes are sent, and
 * rapid selection drags are coalesced into one event.
 */
export class SelectionSync {
  private lastText = '';
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly getSelection: () => Selection | null;
  private readonly createRequestId: () => string;

  constructor(private readonly options: SelectionSyncOptions) {
    this.getSelection = options.getSelection ?? (() => options.window.getSelection());
    this.createRequestId = options.createRequestId ?? requestId;
  }

  start(): void {
    this.options.document.addEventListener('selectionchange', this.schedule);
  }

  stop(): void {
    this.options.document.removeEventListener('selectionchange', this.schedule);
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private readonly schedule = (): void => {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(this.flush, this.options.delayMs ?? 250);
  };

  private readonly flush = (): void => {
    this.timer = undefined;
    const selection = this.getSelection();
    const ignored = isIgnoredNode(selection?.anchorNode) || isIgnoredNode(selection?.focusNode);
    const text = ignored
      ? ''
      : sanitizeText(selection?.toString()).slice(0, this.options.maxCharacters ?? DEFAULT_CONTEXT_LIMITS.selectionCharacters);
    if (text === this.lastText) return;
    this.lastText = text;
    void this.options.sendEvent({ version: 1, requestId: this.createRequestId(), type: 'SELECTION_CHANGED', text });
  };
}
