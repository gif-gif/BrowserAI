import type { AppMessages } from '../../shared/i18n/messages';
import {
  FLOATING_CHAT_MAX_SIZE,
  FLOATING_CHAT_MIN_HEIGHT,
  FLOATING_CHAT_MIN_WIDTH,
  type FloatingChatLayout,
} from '../../shared/types/floating-chat';

export type FloatingChatMessages = Pick<AppMessages,
  | 'floatingChatTitle'
  | 'floatingChatClose'
  | 'floatingChatMinimize'
  | 'floatingChatRestore'
>;

interface InPageFloatingChatOptions {
  document: Document;
  window: Window;
  messages: FloatingChatMessages;
  /** The user closed the panel from its own title bar. */
  onClose(): void;
  onLayoutChange(layout: FloatingChatLayout): void;
}

const MARGIN = 16;
const HEADER_HEIGHT = 36;

const STYLE = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .frame {
    position: fixed;
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid rgba(60,64,67,.18);
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 22px 64px rgba(15,23,42,.22), 0 5px 18px rgba(15,23,42,.12);
    font: 500 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, "Noto Sans SC", sans-serif;
    color: #202124;
    color-scheme: light;
  }
  .frame.dark { border-color: rgba(255,255,255,.14); background: #1f1f1f; color: #e3e3e3; color-scheme: dark; }
  .bar {
    display: flex;
    flex: 0 0 ${HEADER_HEIGHT}px;
    align-items: center;
    gap: 4px;
    padding: 0 6px 0 12px;
    cursor: move;
    user-select: none;
    touch-action: none;
  }
  .title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button {
    display: inline-flex;
    width: 26px;
    height: 26px;
    padding: 0;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 7px;
    color: inherit;
    background: transparent;
    cursor: pointer;
  }
  button:hover { background: rgba(127,127,127,.16); }
  button:focus-visible { outline: 2px solid #0b57d0; outline-offset: 1px; }
  svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
  iframe { flex: 1; width: 100%; min-height: 0; border: 0; background: transparent; }
  .frame.minimized iframe, .frame.minimized .resize { display: none; }
  .resize { position: absolute; right: 0; bottom: 0; width: 16px; height: 16px; cursor: nwse-resize; touch-action: none; }
  .frame.dragging iframe { pointer-events: none; }
`;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Hosts the extension's floating chat page in an iframe on the current web page. The chat UI runs
 * in the extension origin, so the page cannot read it; this shell only draws the frame around it.
 */
export class InPageFloatingChat {
  private host?: HTMLElement;
  private frame?: HTMLDivElement;
  private titleNode?: HTMLSpanElement;
  private minimizeButton?: HTMLButtonElement;
  private closeButton?: HTMLButtonElement;
  private layout?: FloatingChatLayout;
  private minimized = false;
  private messages: FloatingChatMessages;
  private readonly onResize = () => { if (this.layout) this.apply(this.layout); };

  constructor(private readonly options: InPageFloatingChatOptions) {
    this.messages = options.messages;
  }

  get visible(): boolean {
    return Boolean(this.host?.isConnected);
  }

  show(url: string, layout: FloatingChatLayout): void {
    if (!this.host?.isConnected) this.mount(url);
    this.apply(layout);
  }

  hide(): void {
    this.options.window.removeEventListener('resize', this.onResize);
    this.host?.remove();
    this.host = undefined;
    this.frame = undefined;
    this.minimized = false;
  }

  setMessages(messages: FloatingChatMessages): void {
    this.messages = messages;
    this.renderLabels();
  }

  setDark(dark: boolean): void {
    this.frame?.classList.toggle('dark', dark);
  }

  private mount(url: string): void {
    const { document } = this.options;
    const host = document.createElement('chrome-ai-floating-chat');
    host.style.cssText = 'all:initial;position:fixed;inset:auto;z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    const frame = document.createElement('div');
    frame.className = 'frame';
    frame.setAttribute('role', 'dialog');

    const bar = document.createElement('div');
    bar.className = 'bar';
    const title = document.createElement('span');
    title.className = 'title';
    const minimize = document.createElement('button');
    minimize.type = 'button';
    minimize.addEventListener('click', () => this.toggleMinimized());
    const close = document.createElement('button');
    close.type = 'button';
    close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    close.addEventListener('click', () => {
      this.hide();
      this.options.onClose();
    });
    bar.append(title, minimize, close);

    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.allow = 'clipboard-write';

    const resize = document.createElement('div');
    resize.className = 'resize';

    frame.append(bar, iframe, resize);
    shadow.append(style, frame);
    (document.body ?? document.documentElement).append(host);

    this.host = host;
    this.frame = frame;
    this.titleNode = title;
    this.minimizeButton = minimize;
    this.closeButton = close;
    this.renderLabels();
    this.track(bar, 'move');
    this.track(resize, 'resize');
    this.options.window.addEventListener('resize', this.onResize);
  }

  private renderLabels(): void {
    if (!this.frame) return;
    this.frame.setAttribute('aria-label', this.messages.floatingChatTitle);
    this.titleNode!.textContent = this.messages.floatingChatTitle;
    const minimizeLabel = this.minimized ? this.messages.floatingChatRestore : this.messages.floatingChatMinimize;
    this.minimizeButton!.setAttribute('aria-label', minimizeLabel);
    this.minimizeButton!.title = minimizeLabel;
    this.minimizeButton!.innerHTML = this.minimized
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg>';
    this.closeButton!.setAttribute('aria-label', this.messages.floatingChatClose);
    this.closeButton!.title = this.messages.floatingChatClose;
  }

  private toggleMinimized(): void {
    this.minimized = !this.minimized;
    this.frame?.classList.toggle('minimized', this.minimized);
    this.renderLabels();
    if (this.layout) this.apply(this.layout);
  }

  /** Keeps the panel inside the viewport; negative x / y anchor it to the bottom-right corner. */
  private apply(layout: FloatingChatLayout): void {
    const view = this.options.window;
    const maxWidth = Math.min(FLOATING_CHAT_MAX_SIZE, view.innerWidth - MARGIN * 2);
    const maxHeight = Math.min(FLOATING_CHAT_MAX_SIZE, view.innerHeight - MARGIN * 2);
    const width = clamp(layout.width, Math.min(FLOATING_CHAT_MIN_WIDTH, maxWidth), maxWidth);
    const height = clamp(layout.height, Math.min(FLOATING_CHAT_MIN_HEIGHT, maxHeight), maxHeight);
    const shownHeight = this.minimized ? HEADER_HEIGHT : height;
    const x = clamp(layout.x < 0 ? view.innerWidth - width - MARGIN : layout.x, 0, view.innerWidth - width);
    const y = clamp(layout.y < 0 ? view.innerHeight - height - MARGIN : layout.y, 0, view.innerHeight - shownHeight);
    this.layout = { x: layout.x < 0 ? -1 : x, y: layout.y < 0 ? -1 : y, width, height };
    if (!this.frame) return;
    Object.assign(this.frame.style, {
      left: `${x}px`,
      top: `${y}px`,
      width: `${width}px`,
      height: `${shownHeight}px`,
    });
  }

  private track(handle: HTMLElement, mode: 'move' | 'resize'): void {
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !this.frame || !this.layout) return;
      if (mode === 'move' && (event.target as Element).closest('button')) return;
      if (mode === 'resize' && this.minimized) return;
      event.preventDefault();
      handle.setPointerCapture?.(event.pointerId);
      const rect = this.frame.getBoundingClientRect();
      const start = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, width: this.layout.width, height: this.layout.height };
      this.frame.classList.add('dragging');
      const onMove = (move: PointerEvent) => {
        const dx = move.clientX - start.x;
        const dy = move.clientY - start.y;
        this.apply(mode === 'move'
          ? { x: start.left + dx, y: start.top + dy, width: start.width, height: start.height }
          : { x: start.left, y: start.top, width: start.width + dx, height: start.height + dy });
      };
      const onUp = () => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
        this.frame?.classList.remove('dragging');
        if (this.layout) this.options.onLayoutChange(this.layout);
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    });
  }
}
