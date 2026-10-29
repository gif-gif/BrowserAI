import type { SerializedAppError } from '../errors/app-error';
import type { SkillInvocation } from './skill';
import {
  DEFAULT_ATTACHMENT_MAX_BYTES,
  MAX_CHAT_ATTACHMENTS,
  MAX_IMAGE_ATTACHMENT_DATA_URL_LENGTH,
} from '../constants/attachment-limits';

export type MessageRole = 'system' | 'user' | 'assistant';
export type MessageStatus = 'complete' | 'streaming' | 'failed' | 'cancelled';

export const IMAGE_ATTACHMENT_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export const DOCUMENT_ATTACHMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/tab-separated-values',
  'application/json',
  'application/xml',
  'text/xml',
  'text/html',
] as const;

// Compatibility aliases retained for existing image generation and persisted conversations.
export const MAX_IMAGE_ATTACHMENTS = MAX_CHAT_ATTACHMENTS;
export const MAX_IMAGE_ATTACHMENT_BYTES = DEFAULT_ATTACHMENT_MAX_BYTES;
export { MAX_IMAGE_ATTACHMENT_DATA_URL_LENGTH };

export type ImageAttachmentMimeType = typeof IMAGE_ATTACHMENT_MIME_TYPES[number];
export type DocumentAttachmentMimeType = typeof DOCUMENT_ATTACHMENT_MIME_TYPES[number];

export interface ImageAttachment {
  id: string;
  name: string;
  mimeType: ImageAttachmentMimeType;
  dataUrl: string;
  source: 'upload' | 'screenshot' | 'generated';
}

export interface DocumentAttachment {
  kind: 'document';
  id: string;
  name: string;
  mimeType: DocumentAttachmentMimeType;
  size: number;
  text: string;
  source: 'upload';
  truncated: boolean;
}

export type ChatAttachment = ImageAttachment | DocumentAttachment;

export function isImageAttachment(attachment: ChatAttachment): attachment is ImageAttachment {
  return 'dataUrl' in attachment;
}

export function isDocumentAttachment(attachment: ChatAttachment): attachment is DocumentAttachment {
  return 'kind' in attachment && attachment.kind === 'document';
}

export interface MessageSource {
  pageTitle: string;
  pageUrl: string;
  contextTypes: Array<'page' | 'selection'>;
  pageTruncated: boolean;
  /** Other tabs shared with “@”. Optional, so conversations stored before multi-tab context stay valid. */
  additionalPages?: MessageSourcePage[];
}

export interface MessageSourcePage {
  pageTitle: string;
  pageUrl: string;
  pageTruncated: boolean;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  attachments?: ChatAttachment[];
  /** The “/” skill the user applied. Optional, so conversations stored before skills stay valid. */
  skill?: SkillInvocation;
  source?: MessageSource;
  error?: SerializedAppError;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  providerId: string;
  model: string;
  promptVersion: string;
  pinned: boolean;
  source?: {
    title: string;
    url: string;
  };
  createdAt: number;
  updatedAt: number;
}
