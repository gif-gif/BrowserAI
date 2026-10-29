import {
  IMAGE_ATTACHMENT_MIME_TYPES,
  MAX_IMAGE_ATTACHMENT_DATA_URL_LENGTH,
  type ImageAttachment,
  type ImageAttachmentMimeType,
} from '../../../shared/types/chat';

export type ImageAttachmentErrorCode = 'unsupported' | 'too_large' | 'read_failed';

export class ImageAttachmentError extends Error {
  constructor(readonly code: ImageAttachmentErrorCode) {
    super(code);
    this.name = 'ImageAttachmentError';
  }
}

function isSupportedMimeType(value: string): value is ImageAttachmentMimeType {
  return IMAGE_ATTACHMENT_MIME_TYPES.some((mimeType) => mimeType === value);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new ImageAttachmentError('read_failed'));
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new ImageAttachmentError('read_failed'));
    reader.readAsDataURL(file);
  });
}

export async function imageAttachmentFromFile(
  file: File,
  createId: () => string,
  maxBytes: number,
): Promise<ImageAttachment> {
  if (!isSupportedMimeType(file.type)) throw new ImageAttachmentError('unsupported');
  if (file.size > maxBytes) throw new ImageAttachmentError('too_large');

  const dataUrl = await readAsDataUrl(file);
  if (dataUrl.length > MAX_IMAGE_ATTACHMENT_DATA_URL_LENGTH) throw new ImageAttachmentError('too_large');
  if (!dataUrl.startsWith(`data:${file.type};base64,`)) throw new ImageAttachmentError('read_failed');

  return {
    id: createId(),
    name: file.name || 'image',
    mimeType: file.type,
    dataUrl,
    source: 'upload',
  };
}

export function screenshotAttachmentFromDataUrl(
  dataUrl: string,
  createId: () => string,
  capturedAt = Date.now(),
): ImageAttachment {
  const mimeType = IMAGE_ATTACHMENT_MIME_TYPES.find((type) => dataUrl.startsWith(`data:${type};base64,`));
  if (!mimeType || dataUrl.length > MAX_IMAGE_ATTACHMENT_DATA_URL_LENGTH) {
    throw new ImageAttachmentError('read_failed');
  }
  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.slice('image/'.length);
  return {
    id: createId(),
    name: `screenshot-${new Date(capturedAt).toISOString().replace(/[:.]/g, '-')}.${extension}`,
    mimeType,
    dataUrl,
    source: 'screenshot',
  };
}
