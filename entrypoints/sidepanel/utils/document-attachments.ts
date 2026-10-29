import { MAX_DOCUMENT_ATTACHMENT_CHARACTERS } from '../../../shared/constants/attachment-limits';
import {
  DOCUMENT_ATTACHMENT_MIME_TYPES,
  type DocumentAttachment,
  type DocumentAttachmentMimeType,
} from '../../../shared/types/chat';

export type DocumentAttachmentErrorCode = 'unsupported' | 'too_large' | 'read_failed' | 'empty';

export class DocumentAttachmentError extends Error {
  constructor(readonly code: DocumentAttachmentErrorCode) {
    super(code);
    this.name = 'DocumentAttachmentError';
  }
}

const EXTENSION_MIME_TYPES: Record<string, DocumentAttachmentMimeType> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  log: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  json: 'application/json',
  xml: 'application/xml',
  html: 'text/html',
  htm: 'text/html',
};

const TEXT_MIME_TYPES = new Set<DocumentAttachmentMimeType>([
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/tab-separated-values',
  'application/json',
  'application/xml',
  'text/xml',
  'text/html',
]);

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
}

export function resolveDocumentMimeType(file: Pick<File, 'name' | 'type'>): DocumentAttachmentMimeType | undefined {
  const byExtension = EXTENSION_MIME_TYPES[extensionOf(file.name)];
  if (byExtension) return byExtension;
  return DOCUMENT_ATTACHMENT_MIME_TYPES.find((mimeType) => mimeType === file.type);
}

function cleanExtractedText(value: string): string {
  return [...value]
    .filter((character) => character.charCodeAt(0) !== 0)
    .join('')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

async function extractText(file: File, mimeType: DocumentAttachmentMimeType): Promise<string> {
  if (TEXT_MIME_TYPES.has(mimeType)) return file.text();

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (mimeType === 'application/pdf') {
    const { toMarkdown } = await import('@mdgate/pdf');
    return toMarkdown(bytes);
  }
  if (mimeType === 'application/msword') {
    const { toMarkdown } = await import('@mdgate/doc');
    return toMarkdown(bytes);
  }
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const { toMarkdown } = await import('@mdgate/docx');
    return toMarkdown(bytes);
  }
  if (mimeType === 'application/vnd.ms-excel'
    || mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    const { toMarkdown } = await import('@mdgate/xlsx');
    return toMarkdown(bytes);
  }
  throw new DocumentAttachmentError('unsupported');
}

export async function documentAttachmentFromFile(
  file: File,
  createId: () => string,
  maxBytes: number,
): Promise<DocumentAttachment> {
  const mimeType = resolveDocumentMimeType(file);
  if (!mimeType) throw new DocumentAttachmentError('unsupported');
  if (file.size > maxBytes) throw new DocumentAttachmentError('too_large');

  let extracted: string;
  try {
    extracted = cleanExtractedText(await extractText(file, mimeType));
  } catch (error) {
    if (error instanceof DocumentAttachmentError) throw error;
    throw new DocumentAttachmentError('read_failed');
  }
  if (!extracted) throw new DocumentAttachmentError('empty');

  const truncated = extracted.length > MAX_DOCUMENT_ATTACHMENT_CHARACTERS;
  return {
    kind: 'document',
    id: createId(),
    name: file.name || 'document',
    mimeType,
    size: file.size,
    text: truncated ? extracted.slice(0, MAX_DOCUMENT_ATTACHMENT_CHARACTERS) : extracted,
    source: 'upload',
    truncated,
  };
}
