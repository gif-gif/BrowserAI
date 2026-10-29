import { describe, expect, it, vi } from 'vitest';
import { selectScreenshotRegion } from '../../../core/screenshot/region-selector';

describe('screenshot region selector', () => {
  it('removes the overlay and returns cancellation when Escape is pressed', async () => {
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const selection = selectScreenshotRegion(document, window, {
      instruction: 'Drag to select',
      cancelHint: 'Press Esc to cancel',
    });

    expect(document.querySelector('[data-chrome-ai-screenshot-selector]')).toBeInTheDocument();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    await expect(selection).resolves.toEqual({ cancelled: true });
    expect(document.querySelector('[data-chrome-ai-screenshot-selector]')).not.toBeInTheDocument();
    requestAnimationFrame.mockRestore();
  });

  it('waits for a double-click inside the selection before resolving', async () => {
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const attachShadow = Element.prototype.attachShadow;
    let root: ShadowRoot | undefined;
    const spy = vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (this: Element, init) {
      root = attachShadow.call(this, init);
      return root;
    });
    let resolved = false;
    const selection = selectScreenshotRegion(document, window, {
      instruction: 'Drag to select',
      cancelHint: 'Press Esc to cancel',
    }).then((result) => { resolved = true; return result; });

    const layer = root!.querySelector<HTMLElement>('.capture-layer')!;
    const pointer = (type: string, x: number, y: number) => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      return event;
    };
    layer.dispatchEvent(pointer('pointerdown', 10, 10));
    layer.dispatchEvent(pointer('pointermove', 110, 90));
    layer.dispatchEvent(pointer('pointerup', 110, 90));
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(root!.querySelector('.confirm')).toBeNull();

    // A double-click outside the selection does not confirm it.
    layer.dispatchEvent(pointer('dblclick', 300, 300));
    await Promise.resolve();
    expect(resolved).toBe(false);

    // Dragging inside the finished selection moves it without resizing.
    layer.dispatchEvent(pointer('pointerdown', 50, 50));
    layer.dispatchEvent(pointer('pointermove', 90, 70));
    layer.dispatchEvent(pointer('pointerup', 90, 70));
    await Promise.resolve();
    expect(resolved).toBe(false);
    // The original spot no longer confirms; the moved selection does.
    layer.dispatchEvent(pointer('dblclick', 20, 20));
    await Promise.resolve();
    expect(resolved).toBe(false);

    layer.dispatchEvent(pointer('dblclick', 100, 100));
    await expect(selection).resolves.toEqual({
      cancelled: false,
      region: expect.objectContaining({ x: 50, y: 30, width: 100, height: 80 }),
    });
    expect(document.querySelector('[data-chrome-ai-screenshot-selector]')).not.toBeInTheDocument();
    spy.mockRestore();
    requestAnimationFrame.mockRestore();
  });
});
