import type {
  ScreenshotRegion,
  ScreenshotSelectionLabels,
  ScreenshotSelectionResult,
} from '../../shared/types/screenshot';

const MIN_SELECTION_SIZE = 8;
const MAX_Z_INDEX = '2147483647';

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function normalizeRegion(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  viewportWidth: number,
  viewportHeight: number,
): ScreenshotRegion {
  const left = clamp(Math.min(startX, endX), 0, viewportWidth);
  const top = clamp(Math.min(startY, endY), 0, viewportHeight);
  const right = clamp(Math.max(startX, endX), 0, viewportWidth);
  const bottom = clamp(Math.max(startY, endY), 0, viewportHeight);
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    viewportWidth,
    viewportHeight,
  };
}

export function selectScreenshotRegion(
  document: Document,
  window: Window,
  labels: ScreenshotSelectionLabels,
): Promise<ScreenshotSelectionResult> {
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLElement>('[data-chrome-ai-screenshot-selector]');
    existing?.remove();

    const host = document.createElement('div');
    host.dataset.chromeAiScreenshotSelector = 'true';
    Object.assign(host.style, {
      all: 'initial',
      position: 'fixed',
      inset: '0',
      zIndex: MAX_Z_INDEX,
      display: 'block',
      cursor: 'crosshair',
      userSelect: 'none',
      touchAction: 'none',
    });

    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .capture-layer {
        position: fixed;
        inset: 0;
        cursor: crosshair;
        background: rgba(16, 20, 28, .38);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .capture-layer.is-selecting { background: transparent; }
      .selection {
        position: fixed;
        display: none;
        box-sizing: border-box;
        border: 2px solid #4c8bf5;
        border-radius: 3px;
        background: transparent;
        box-shadow: 0 0 0 99999px rgba(16, 20, 28, .52), 0 0 0 1px rgba(255, 255, 255, .9) inset;
      }
      .selection.is-visible { display: block; }
      .selection.is-pending { cursor: move; }
      .size {
        position: absolute;
        right: -2px;
        bottom: -30px;
        min-width: 72px;
        box-sizing: border-box;
        padding: 5px 8px;
        border-radius: 7px;
        color: #fff;
        background: rgba(27, 31, 38, .92);
        font-size: 12px;
        font-weight: 650;
        line-height: 18px;
        text-align: center;
        white-space: nowrap;
      }
      .instruction {
        position: fixed;
        top: 24px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 10px;
        max-width: calc(100vw - 32px);
        box-sizing: border-box;
        padding: 10px 14px;
        border: 1px solid rgba(255, 255, 255, .28);
        border-radius: 12px;
        color: #fff;
        background: rgba(27, 31, 38, .9);
        box-shadow: 0 8px 28px rgba(0, 0, 0, .28);
        font-size: 13px;
        font-weight: 650;
        line-height: 20px;
        white-space: nowrap;
        pointer-events: none;
      }
      .instruction small { color: rgba(255, 255, 255, .72); font-size: 11px; font-weight: 500; }
    `;

    const layer = document.createElement('div');
    layer.className = 'capture-layer';
    layer.setAttribute('role', 'application');
    layer.setAttribute('aria-label', labels.instruction);
    const selection = document.createElement('div');
    selection.className = 'selection';
    const size = document.createElement('span');
    size.className = 'size';
    selection.append(size);
    const instruction = document.createElement('div');
    instruction.className = 'instruction';
    const instructionText = document.createElement('span');
    instructionText.textContent = labels.instruction;
    const cancelHint = document.createElement('small');
    cancelHint.textContent = labels.cancelHint;
    instruction.append(instructionText, cancelHint);
    layer.append(selection, instruction);
    shadow.append(style, layer);
    document.documentElement.append(host);

    let startX: number | undefined;
    let startY: number | undefined;
    let activePointerId: number | undefined;
    // A finished drag waits here until the user double-clicks it to confirm.
    let pending: ScreenshotRegion | undefined;
    // Set while the finished selection is being dragged to a new position.
    let move: { pointerId: number; offsetX: number; offsetY: number; region: ScreenshotRegion } | undefined;
    let settled = false;

    const cleanup = () => {
      document.removeEventListener('keydown', onKeyDown, true);
      host.remove();
    };
    const finish = (result: ScreenshotSelectionResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      window.requestAnimationFrame(() => resolve(result));
    };
    const render = (region: ScreenshotRegion) => {
      pending = undefined;
      selection.classList.remove('is-pending');
      layer.classList.add('is-selecting');
      selection.classList.add('is-visible');
      selection.style.left = `${region.x}px`;
      selection.style.top = `${region.y}px`;
      selection.style.width = `${region.width}px`;
      selection.style.height = `${region.height}px`;
      size.textContent = `${Math.round(region.width)} × ${Math.round(region.height)}`;
    };
    const resetSelection = () => {
      pending = undefined;
      selection.classList.remove('is-pending');
      startX = undefined;
      startY = undefined;
      activePointerId = undefined;
      layer.classList.remove('is-selecting');
      selection.classList.remove('is-visible');
    };
    const currentRegion = (event: PointerEvent) => normalizeRegion(
      startX ?? event.clientX,
      startY ?? event.clientY,
      event.clientX,
      event.clientY,
      window.innerWidth,
      window.innerHeight,
    );
    const isInside = (region: ScreenshotRegion, event: MouseEvent) => (
      event.clientX >= region.x && event.clientX <= region.x + region.width
      && event.clientY >= region.y && event.clientY <= region.y + region.height
    );
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Enter' && pending) {
        event.preventDefault();
        event.stopPropagation();
        finish({ cancelled: false, region: pending });
        return;
      }
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      finish({ cancelled: true });
    }

    layer.addEventListener('contextmenu', (event) => event.preventDefault());
    layer.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      // Pressing inside the finished selection drags it around (a click
      // without movement is half of the confirming double-click); pressing
      // anywhere else redraws the selection.
      if (pending && isInside(pending, event)) {
        move = { pointerId: event.pointerId, offsetX: event.clientX - pending.x, offsetY: event.clientY - pending.y, region: pending };
        layer.setPointerCapture?.(event.pointerId);
        return;
      }
      activePointerId = event.pointerId;
      startX = clamp(event.clientX, 0, window.innerWidth);
      startY = clamp(event.clientY, 0, window.innerHeight);
      layer.setPointerCapture?.(event.pointerId);
      render(currentRegion(event));
    });
    layer.addEventListener('pointermove', (event) => {
      if (move && move.pointerId === event.pointerId) {
        event.preventDefault();
        const { region } = move;
        const x = clamp(event.clientX - move.offsetX, 0, window.innerWidth - region.width);
        const y = clamp(event.clientY - move.offsetY, 0, window.innerHeight - region.height);
        move.region = { ...region, x, y };
        selection.style.left = `${x}px`;
        selection.style.top = `${y}px`;
        return;
      }
      if (activePointerId !== event.pointerId || startX === undefined || startY === undefined) return;
      event.preventDefault();
      render(currentRegion(event));
    });
    layer.addEventListener('pointerup', (event) => {
      if (move && move.pointerId === event.pointerId) {
        event.preventDefault();
        event.stopPropagation();
        pending = move.region;
        move = undefined;
        return;
      }
      if (activePointerId !== event.pointerId || startX === undefined || startY === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      const region = currentRegion(event);
      if (region.width < MIN_SELECTION_SIZE || region.height < MIN_SELECTION_SIZE) {
        resetSelection();
        return;
      }
      startX = undefined;
      startY = undefined;
      activePointerId = undefined;
      pending = region;
      selection.classList.add('is-pending');
    });
    layer.addEventListener('dblclick', (event) => {
      if (!pending || !isInside(pending, event)) return;
      event.preventDefault();
      event.stopPropagation();
      finish({ cancelled: false, region: pending });
    });
    document.addEventListener('keydown', onKeyDown, true);
  });
}
