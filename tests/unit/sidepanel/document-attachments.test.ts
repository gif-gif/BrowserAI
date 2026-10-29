import { describe, expect, it, vi } from 'vitest';
import { MAX_DOCUMENT_ATTACHMENT_CHARACTERS } from '../../../shared/constants/attachment-limits';
import {
  documentAttachmentFromFile,
  resolveDocumentMimeType,
} from '../../../entrypoints/sidepanel/utils/document-attachments';

function textFile(contents: string, name: string, type = 'text/plain'): File {
  const bytes = new TextEncoder().encode(contents);
  return {
    name,
    type,
    size: bytes.byteLength,
    text: vi.fn(async () => contents),
    arrayBuffer: vi.fn(async () => bytes.buffer),
  } as unknown as File;
}

describe('document attachments', () => {
  it('resolves supported document types by extension when browser MIME metadata is absent', () => {
    expect(resolveDocumentMimeType({ name: 'report.PDF', type: '' })).toBe('application/pdf');
    expect(resolveDocumentMimeType({ name: 'table.xlsx', type: 'application/octet-stream' })).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(resolveDocumentMimeType({ name: 'script.exe', type: 'application/octet-stream' })).toBeUndefined();
  });

  it('extracts and cleans plain-text attachments locally', async () => {
    const attachment = await documentAttachmentFromFile(
      textFile('First line\0\r\nSecond line   \n', 'notes.txt'),
      () => 'document-1',
      5 * 1024 * 1024,
    );

    expect(attachment).toMatchObject({
      kind: 'document',
      id: 'document-1',
      name: 'notes.txt',
      mimeType: 'text/plain',
      text: 'First line\nSecond line',
      source: 'upload',
      truncated: false,
    });
  });

  it('rejects unsupported, oversized, and empty documents with stable error codes', async () => {
    await expect(documentAttachmentFromFile(textFile('x', 'malware.exe', 'application/octet-stream'), () => 'id', 100))
      .rejects.toMatchObject({ code: 'unsupported' });
    await expect(documentAttachmentFromFile(textFile('too large', 'notes.txt'), () => 'id', 2))
      .rejects.toMatchObject({ code: 'too_large' });
    await expect(documentAttachmentFromFile(textFile(' \n\t ', 'empty.txt'), () => 'id', 100))
      .rejects.toMatchObject({ code: 'empty' });
  });

  it('truncates extracted document text to the local safety limit', async () => {
    const attachment = await documentAttachmentFromFile(
      textFile('x'.repeat(MAX_DOCUMENT_ATTACHMENT_CHARACTERS + 10), 'long.txt'),
      () => 'document-long',
      5 * 1024 * 1024,
    );

    expect(attachment.text).toHaveLength(MAX_DOCUMENT_ATTACHMENT_CHARACTERS);
    expect(attachment.truncated).toBe(true);
  });
});
