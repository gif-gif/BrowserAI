import type { ScreenshotRegion } from '../../../shared/types/screenshot';

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Screenshot image could not be decoded'));
    image.src = dataUrl;
  });
}

function validDimension(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export async function cropScreenshotDataUrl(
  dataUrl: string,
  region: ScreenshotRegion,
): Promise<string> {
  if (
    !validDimension(region.width)
    || !validDimension(region.height)
    || !validDimension(region.viewportWidth)
    || !validDimension(region.viewportHeight)
  ) {
    throw new Error('Invalid screenshot selection');
  }

  const image = await loadImage(dataUrl);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!validDimension(sourceWidth) || !validDimension(sourceHeight)) {
    throw new Error('Invalid screenshot dimensions');
  }

  const scaleX = sourceWidth / region.viewportWidth;
  const scaleY = sourceHeight / region.viewportHeight;
  const sourceX = Math.max(0, Math.round(region.x * scaleX));
  const sourceY = Math.max(0, Math.round(region.y * scaleY));
  const cropWidth = Math.min(sourceWidth - sourceX, Math.max(1, Math.round(region.width * scaleX)));
  const cropHeight = Math.min(sourceHeight - sourceY, Math.max(1, Math.round(region.height * scaleY)));
  if (cropWidth <= 0 || cropHeight <= 0) throw new Error('Screenshot selection is outside the image');

  const canvas = document.createElement('canvas');
  canvas.width = cropWidth;
  canvas.height = cropHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');
  context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return canvas.toDataURL('image/jpeg', 0.9);
}
