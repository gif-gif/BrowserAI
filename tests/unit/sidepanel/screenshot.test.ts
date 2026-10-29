import { afterEach, describe, expect, it, vi } from 'vitest';
import { cropScreenshotDataUrl } from '../../../entrypoints/sidepanel/utils/screenshot';
import { screenshotAttachmentFromDataUrl } from '../../../entrypoints/sidepanel/utils/image-attachments';

class LoadedImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 2000;
  naturalHeight = 1200;
  width = 2000;
  height = 1200;

  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

describe('screenshot utilities', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('scales a CSS-pixel region to the captured image before cropping', async () => {
    vi.stubGlobal('Image', LoadedImage);
    const drawImage = vi.fn();
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/jpeg;base64,Y3JvcHBlZA==');
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => (
      tagName.toLowerCase() === 'canvas' ? canvas : originalCreateElement(tagName, options)
    )) as typeof document.createElement);

    const result = await cropScreenshotDataUrl('data:image/jpeg;base64,ZmFrZQ==', {
      x: 100,
      y: 50,
      width: 300,
      height: 200,
      viewportWidth: 1000,
      viewportHeight: 600,
    });

    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(400);
    expect(drawImage).toHaveBeenCalledWith(expect.any(LoadedImage), 200, 100, 600, 400, 0, 0, 600, 400);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.9);
    expect(result).toBe('data:image/jpeg;base64,Y3JvcHBlZA==');
  });

  it('uses an extension matching the screenshot MIME type', () => {
    expect(screenshotAttachmentFromDataUrl(
      'data:image/png;base64,aGVsbG8=',
      () => 'shot-1',
      Date.UTC(2026, 9, 5),
    )).toMatchObject({
      id: 'shot-1',
      mimeType: 'image/png',
      source: 'screenshot',
      name: expect.stringMatching(/\.png$/),
    });
  });
});
