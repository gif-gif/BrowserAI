import { getMessages } from '../../shared/i18n/locale';
import type { RectLike } from './selection-position';
import { calculateSelectionButtonPosition } from './selection-position';

export interface SelectionButtonShowOptions {
  text: string;
  rect: RectLike;
}

export interface SelectionButtonLike {
  show(options: SelectionButtonShowOptions): void;
  hide(): void;
  destroy(): void;
  setClickHandler(handler: () => void): void;
}

export class SelectionButton implements SelectionButtonLike {
  private readonly host: HTMLDivElement;
  private readonly button: HTMLButtonElement;
  private clickHandler: () => void = () => undefined;

  constructor(private readonly document: Document, private readonly window: Window) {
    const messages = getMessages();
    this.host = document.createElement('div');
    this.host.dataset.chromeAiOwned = 'true';
    this.host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;display:none;pointer-events:auto;';
    const shadow = this.host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      button {
        appearance: none; border: 1px solid rgba(60,64,67,.16); border-radius: 999px;
        min-height: 36px; padding: 7px 14px; background: #fff; color: #1f1f1f;
        box-shadow: 0 2px 8px rgba(60,64,67,.22), 0 1px 2px rgba(60,64,67,.14);
        font: 500 13px/20px Arial, "Noto Sans SC", sans-serif; white-space: nowrap;
        cursor: pointer; transition: box-shadow 160ms ease, transform 100ms ease;
      }
      button:hover { background: #f8fafd; box-shadow: 0 4px 12px rgba(60,64,67,.25); }
      button:active { transform: scale(.97); }
      button:focus-visible { outline: 3px solid rgba(11,87,208,.32); outline-offset: 2px; }
      @media (prefers-color-scheme: dark) {
        button { background: #202124; color: #e8eaed; border-color: rgba(255,255,255,.16); }
        button:hover { background: #292a2d; }
      }
      @media (prefers-reduced-motion: reduce) { button { transition: none; } }
    `;
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.textContent = messages.selectionAsk;
    this.button.setAttribute('aria-label', messages.selectionAskAria);
    this.button.addEventListener('pointerdown', (event) => event.preventDefault());
    this.button.addEventListener('click', () => this.clickHandler());
    shadow.append(style, this.button);
    document.documentElement.append(this.host);
  }

  setClickHandler(handler: () => void): void { this.clickHandler = handler; }

  show({ rect }: SelectionButtonShowOptions): void {
    this.host.style.display = 'block';
    const measured = this.button.getBoundingClientRect();
    const width = measured.width || 96;
    const height = measured.height || 36;
    const position = calculateSelectionButtonPosition(rect, { width, height }, {
      width: this.window.innerWidth,
      height: this.window.innerHeight,
    });
    this.host.style.left = `${position.x}px`;
    this.host.style.top = `${position.y}px`;
  }

  hide(): void { this.host.style.display = 'none'; }
  destroy(): void { this.host.remove(); }
}
