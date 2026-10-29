import { sanitizeText } from '../page-context/sanitize-text';
import type { ContentEvent } from '../../messaging/contracts';
import type { SelectionButtonLike } from './selection-button';

export interface SelectionControllerOptions {
  document: Document;
  window: Window;
  button: SelectionButtonLike;
  getSelection?: () => Selection | null;
  sendEvent: (event: ContentEvent) => void | Promise<void>;
  createRequestId?: () => string;
}

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `selection-${Date.now()}`;
}

function isIgnoredTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('[data-chrome-ai-owned="true"]')) return true;
  return target instanceof HTMLInputElement && target.type.toLowerCase() === 'password';
}

export class SelectionController {
  private enabled = true;
  private selectedText = '';
  private suppressNextPointerUp = false;
  private readonly getSelection: () => Selection | null;
  private readonly createRequestId: () => string;

  constructor(private readonly options: SelectionControllerOptions) {
    this.getSelection = options.getSelection ?? (() => options.window.getSelection());
    this.createRequestId = options.createRequestId ?? requestId;
    options.button.setClickHandler(() => this.activate());
  }

  start(): void {
    this.options.document.addEventListener('pointerup', this.onPointerUp, true);
    this.options.document.addEventListener('pointerdown', this.onPointerDown, true);
    this.options.document.addEventListener('keydown', this.onKeyDown, true);
    this.options.document.addEventListener('selectionchange', this.onSelectionChange);
    this.options.window.addEventListener('scroll', this.hide, true);
  }

  stop(): void {
    this.options.document.removeEventListener('pointerup', this.onPointerUp, true);
    this.options.document.removeEventListener('pointerdown', this.onPointerDown, true);
    this.options.document.removeEventListener('keydown', this.onKeyDown, true);
    this.options.document.removeEventListener('selectionchange', this.onSelectionChange);
    this.options.window.removeEventListener('scroll', this.hide, true);
    this.options.button.destroy();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.hide();
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.suppressNextPointerUp) {
      this.suppressNextPointerUp = false;
      return;
    }
    if (!this.enabled || isIgnoredTarget(event.target)) {
      this.hide();
      return;
    }
    const selection = this.getSelection();
    const text = sanitizeText(selection?.toString());
    if (!selection || !text || selection.rangeCount === 0 || isIgnoredTarget(selection.anchorNode?.parentElement ?? null)) {
      this.hide();
      return;
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) {
      this.hide();
      return;
    }
    this.selectedText = text;
    this.options.button.show({ text, rect });
    void this.options.sendEvent({ version: 1, requestId: this.createRequestId(), type: 'SELECTION_CAPTURED', text });
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!isIgnoredTarget(event.target) && this.selectedText) {
      this.suppressNextPointerUp = true;
      this.hide();
    }
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.hide();
  };

  private readonly onSelectionChange = (): void => {
    if (!sanitizeText(this.getSelection()?.toString())) this.hide();
  };

  private readonly hide = (): void => {
    this.selectedText = '';
    this.options.button.hide();
  };

  private activate(): void {
    if (!this.selectedText) return;
    void this.options.sendEvent({
      version: 1,
      requestId: this.createRequestId(),
      type: 'SELECTION_ACTION_CLICKED',
      text: this.selectedText,
    });
    this.options.button.hide();
  }
}
