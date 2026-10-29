import { z } from 'zod';
import type { SerializedAppError } from '../shared/errors/app-error';
import {
  DOCUMENT_ATTACHMENT_MIME_TYPES,
  IMAGE_ATTACHMENT_MIME_TYPES,
  MAX_IMAGE_ATTACHMENT_DATA_URL_LENGTH,
} from '../shared/types/chat';
import {
  MAX_ATTACHMENT_MAX_BYTES,
  MAX_CHAT_ATTACHMENTS,
  MAX_DOCUMENT_ATTACHMENT_CHARACTERS,
  MAX_DOCUMENT_ATTACHMENTS_TOTAL_CHARACTERS,
  MIN_ATTACHMENT_MAX_BYTES,
} from '../shared/constants/attachment-limits';
import {
  MAX_DOCUMENT_CONTEXT_CHARACTERS,
  MAX_SHARED_TABS,
  MIN_DOCUMENT_CONTEXT_CHARACTERS,
} from '../shared/constants/context-limits';
import { PROVIDER_ENDPOINT_MODES, PROVIDER_TYPES } from '../shared/types/provider';
import { FLOATING_CHAT_MAX_SIZE, FLOATING_CHAT_MIN_HEIGHT, FLOATING_CHAT_MIN_WIDTH } from '../shared/types/floating-chat';
import { WRITING_TONES } from '../shared/types/writing-assistant';
import { MAX_SKILL_NAME_LENGTH, MAX_SKILL_PROMPT_LENGTH } from '../shared/types/skill';

const requestId = z.string().min(1);
const envelope = {
  version: z.literal(1),
  requestId,
};

const retentionDaysSchema = z.union([
  z.literal(0),
  z.literal(7),
  z.literal(30),
  z.literal(90),
  z.literal(-1),
]);

const providerConnectionDraftSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: z.enum(PROVIDER_TYPES),
  baseURL: z.string().min(1),
  model: z.string(),
  endpointMode: z.enum(['chat-completions', 'messages']),
  defaultHeaders: z.record(z.string(), z.string()),
  temperature: z.number().finite().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive(),
  stream: z.literal(true),
}).strict();

const providerTestDraftSchema = providerConnectionDraftSchema.extend({
  model: z.string().min(1),
}).strict();

const providerConfigDraftSchema = providerTestDraftSchema.extend({
  name: z.string().min(1),
}).strict();

// Each request format has exactly one endpoint; reject mismatched pairs at the boundary.
function withPairedEndpoint<T extends typeof providerConnectionDraftSchema>(schema: T) {
  return schema.refine((config) => PROVIDER_ENDPOINT_MODES[config.type] === config.endpointMode, {
    message: 'endpointMode does not match provider type',
    path: ['endpointMode'],
  });
}

export const runtimeCommandSchema = z.discriminatedUnion('type', [
  z.object({ ...envelope, type: z.literal('GET_ACTIVE_TAB_STATE') }).strict(),
  z.object({
    ...envelope,
    type: z.literal('GET_TAB_STATE'),
    tabId: z.number().int().nonnegative(),
  }).strict(),
  z.object({ ...envelope, type: z.literal('LIST_CONVERSATIONS') }).strict(),
  z.object({
    ...envelope,
    type: z.literal('OPEN_CONVERSATION'),
    tabId: z.number().int().nonnegative(),
    conversationId: z.string().min(1),
  }).strict(),
  z.object({ ...envelope, type: z.literal('CREATE_CONVERSATION'), tabId: z.number().int().nonnegative() }).strict(),
  z.object({
    ...envelope,
    type: z.literal('SET_CONVERSATION_MODEL'),
    tabId: z.number().int().nonnegative(),
    conversationId: z.string().min(1),
    model: z.string().trim().min(1),
  }).strict(),
  z.object({
    ...envelope,
    type: z.literal('DELETE_CONVERSATION'),
    conversationId: z.string().min(1),
    tabId: z.number().int().nonnegative().optional(),
  }).strict(),
  z.object({ ...envelope, type: z.literal('PIN_CONVERSATION'), conversationId: z.string().min(1), pinned: z.boolean() }).strict(),
  z.object({ ...envelope, type: z.literal('CLEAR_CONVERSATIONS'), tabId: z.number().int().nonnegative().optional() }).strict(),
  z.object({
    ...envelope,
    type: z.literal('SET_RETENTION'),
    retentionDays: retentionDaysSchema,
    confirmed: z.boolean(),
  }).strict(),
  z.object({ ...envelope, type: z.literal('GET_PROVIDER_SETTINGS') }).strict(),
  z.object({ ...envelope, type: z.literal('GET_WRITING_ASSISTANT_PREFERENCES') }).strict(),
  z.object({ ...envelope, type: z.literal('GET_CONTEXT_LIMIT') }).strict(),
  z.object({ ...envelope, type: z.literal('GET_ATTACHMENT_LIMIT') }).strict(),
  z.object({
    ...envelope,
    type: z.literal('SET_CONTEXT_LIMIT'),
    documentCharacters: z.number().int()
      .min(MIN_DOCUMENT_CONTEXT_CHARACTERS)
      .max(MAX_DOCUMENT_CONTEXT_CHARACTERS),
  }).strict(),
  z.object({
    ...envelope,
    type: z.literal('SET_ATTACHMENT_LIMIT'),
    attachmentMaxBytes: z.number().int()
      .min(MIN_ATTACHMENT_MAX_BYTES)
      .max(MAX_ATTACHMENT_MAX_BYTES),
  }).strict(),
  z.object({ ...envelope, type: z.literal('SAVE_PROVIDER_CONFIG'), config: withPairedEndpoint(providerConfigDraftSchema), apiKey: z.string().optional() }).strict(),
  z.object({ ...envelope, type: z.literal('REMOVE_PROVIDER_SECRET'), providerId: z.string().min(1) }).strict(),
  z.object({ ...envelope, type: z.literal('LIST_PROVIDER_MODELS'), config: withPairedEndpoint(providerConnectionDraftSchema), apiKey: z.string().optional() }).strict(),
  z.object({ ...envelope, type: z.literal('TEST_PROVIDER_DRAFT'), config: withPairedEndpoint(providerTestDraftSchema), apiKey: z.string().optional() }).strict(),
  z.object({ ...envelope, type: z.literal('TEST_PROVIDER_CONNECTION'), providerId: z.string().min(1) }).strict(),
  z.object({
    ...envelope,
    type: z.literal('AI_WRITING_ASSIST'),
    text: z.string().trim().min(1).max(20_000),
    instruction: z.string().trim().max(1_000).optional(),
    model: z.string().trim().min(1).max(300).optional(),
    tone: z.enum(WRITING_TONES),
    locale: z.enum(['zh-CN', 'zh-TW', 'en']),
  }).strict(),
  z.object({ ...envelope, type: z.literal('EXTRACT_PAGE_CONTEXT'), tabId: z.number().int().nonnegative() }).strict(),
  z.object({ ...envelope, type: z.literal('ANALYZE_PAGE_TECH_STACK'), tabId: z.number().int().nonnegative() }).strict(),
  z.object({ ...envelope, type: z.literal('RETRY_PAGE_CONTEXT'), tabId: z.number().int().nonnegative() }).strict(),
  z.object({ ...envelope, type: z.literal('ALLOW_PAGE_ACCESS_ONCE'), tabId: z.number().int().nonnegative() }).strict(),
  z.object({ ...envelope, type: z.literal('EXTRACT_TAB_CONTEXT'), tabId: z.number().int().nonnegative() }).strict(),
  z.object({ ...envelope, type: z.literal('OPEN_FLOATING_CHAT'), tabId: z.number().int().nonnegative() }).strict(),
  z.object({ ...envelope, type: z.literal('CLOSE_FLOATING_CHAT'), tabId: z.number().int().nonnegative() }).strict(),
  // Asked by the floating page on load. It is web-accessible, so it renders only inside a tab
  // where the user opened the floating chat, never when some other page embeds it.
  z.object({ ...envelope, type: z.literal('GET_FLOATING_CHAT_STATUS'), tabId: z.number().int().nonnegative() }).strict(),
  // Sent from a click in the floating chat; the handler calls sidePanel.open() before any await.
  z.object({ ...envelope, type: z.literal('OPEN_SIDE_PANEL'), tabId: z.number().int().nonnegative() }).strict(),
]);

export type RuntimeCommand = z.infer<typeof runtimeCommandSchema>;
export type RuntimeCommandType = RuntimeCommand['type'];

export type RuntimeSuccessResponse<T = unknown> = {
  version: 1;
  requestId: string;
  ok: true;
  data: T;
};
export type RuntimeErrorResponse = {
  version: 1;
  requestId: string;
  ok: false;
  error: SerializedAppError;
};
export type RuntimeResponse<T = unknown> = RuntimeSuccessResponse<T> | RuntimeErrorResponse;

export function parseRuntimeCommand(input: unknown):
  | { ok: true; command: RuntimeCommand }
  | { ok: false; requestId: string } {
  const parsed = runtimeCommandSchema.safeParse(input);
  if (parsed.success) return { ok: true, command: parsed.data };
  const candidate = input as { requestId?: unknown } | null;
  return {
    ok: false,
    requestId: typeof candidate?.requestId === 'string' && candidate.requestId ? candidate.requestId : 'unknown',
  };
}

const contextSelectionSchema = z.object({
  includePage: z.boolean(),
  includeSelection: z.boolean(),
  snapshotId: z.string().min(1).optional(),
  /** Other tabs mentioned with “@”. The background re-extracts them at send time. */
  additionalTabIds: z.array(z.number().int().nonnegative()).max(MAX_SHARED_TABS).optional(),
}).strict();

export const pageTechStackEvidenceSchema = z.object({
  url: z.string().max(2_000),
  title: z.string().max(500),
  generator: z.string().max(300).optional(),
  scripts: z.array(z.string().max(1_000)).max(80),
  stylesheets: z.array(z.string().max(1_000)).max(80),
  metaNames: z.array(z.string().max(1_000)).max(50),
  htmlAttributes: z.record(z.string().max(100), z.string().max(300)),
  frameworkMarkers: z.array(z.string().max(100)).max(80),
  technologies: z.array(z.object({
    name: z.string().min(1).max(100),
    category: z.enum(['framework', 'library', 'cms', 'commerce', 'analytics', 'monitoring', 'hosting', 'cdn', 'ui', 'build-tool', 'other']),
    confidence: z.enum(['high', 'medium', 'low']),
    evidence: z.array(z.string().min(1).max(500)).max(8),
  }).strict()).max(40),
  truncated: z.boolean(),
  capturedAt: z.number().int().nonnegative(),
}).strict();

const imageAttachmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(255),
  mimeType: z.enum(IMAGE_ATTACHMENT_MIME_TYPES),
  dataUrl: z.string()
    .max(MAX_IMAGE_ATTACHMENT_DATA_URL_LENGTH)
    .regex(/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/),
  source: z.enum(['upload', 'screenshot']),
}).strict();

const documentAttachmentSchema = z.object({
  kind: z.literal('document'),
  id: z.string().min(1),
  name: z.string().min(1).max(255),
  mimeType: z.enum(DOCUMENT_ATTACHMENT_MIME_TYPES),
  size: z.number().int().nonnegative().max(MAX_ATTACHMENT_MAX_BYTES),
  text: z.string().min(1).max(MAX_DOCUMENT_ATTACHMENT_CHARACTERS),
  source: z.literal('upload'),
  truncated: z.boolean(),
}).strict();

const chatAttachmentSchema = z.union([imageAttachmentSchema, documentAttachmentSchema]);

/** A user-defined “/” skill applied to this turn, sent by value so edits never rewrite history. */
const skillInvocationSchema = z.object({
  name: z.string().min(1).max(MAX_SKILL_NAME_LENGTH),
  prompt: z.string().min(1).max(MAX_SKILL_PROMPT_LENGTH),
}).strict();

const rawChatPortCommandSchema = z.discriminatedUnion('type', [
  z.object({
    ...envelope,
    type: z.literal('START_CHAT'),
    tabId: z.number().int().nonnegative(),
    conversationId: z.string().min(1),
    text: z.string().max(100_000),
    attachments: z.array(chatAttachmentSchema).max(MAX_CHAT_ATTACHMENTS).optional().default([]),
    contextSelection: contextSelectionSchema,
    allowPageActions: z.boolean().optional().default(false),
    techStackEvidence: pageTechStackEvidenceSchema.optional(),
    skill: skillInvocationSchema.optional(),
  }).strict(),
  z.object({ ...envelope, type: z.literal('CANCEL_CHAT') }).strict(),
]);

export const chatPortCommandSchema = rawChatPortCommandSchema.superRefine((command, context) => {
  if (command.type === 'START_CHAT' && !command.text.trim() && command.attachments.length === 0 && !command.skill) {
    context.addIssue({ code: 'custom', path: ['text'], message: 'Message text or an attachment is required' });
  }
  if (command.type === 'START_CHAT') {
    const totalDocumentCharacters = command.attachments.reduce(
      (total, attachment) => total + ('kind' in attachment ? attachment.text.length : 0),
      0,
    );
    if (totalDocumentCharacters > MAX_DOCUMENT_ATTACHMENTS_TOTAL_CHARACTERS) {
      context.addIssue({ code: 'custom', path: ['attachments'], message: 'Document attachment text is too large' });
    }
  }
});
export type ChatPortCommand = z.infer<typeof chatPortCommandSchema>;

const serializedErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
  status: z.number().optional(),
  requestId: z.string().optional(),
}).strict();

const generatedImageSchema = z.object({
  dataUrl: z.string()
    .max(MAX_IMAGE_ATTACHMENT_DATA_URL_LENGTH)
    .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  revisedPrompt: z.string().max(20_000).optional(),
}).strict();

export const streamEventSchema = z.discriminatedUnion('type', [
  z.object({ ...envelope, type: z.literal('started') }).strict(),
  z.object({ ...envelope, type: z.literal('delta'), text: z.string() }).strict(),
  z.object({
    ...envelope,
    type: z.literal('image'),
    image: generatedImageSchema,
    index: z.number().int().nonnegative().max(MAX_CHAT_ATTACHMENTS - 1),
  }).strict(),
  z.object({
    ...envelope,
    type: z.literal('usage'),
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    totalTokens: z.number().int().nonnegative().optional(),
  }).strict(),
  z.object({ ...envelope, type: z.literal('completed'), finishReason: z.string().optional() }).strict(),
  z.object({ ...envelope, type: z.literal('failed'), error: serializedErrorSchema }).strict(),
]);
export type StreamEvent = z.infer<typeof streamEventSchema>;

const floatingChatLayoutSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().min(FLOATING_CHAT_MIN_WIDTH).max(FLOATING_CHAT_MAX_SIZE),
  height: z.number().finite().min(FLOATING_CHAT_MIN_HEIGHT).max(FLOATING_CHAT_MAX_SIZE),
}).strict();

const contextLimitsSchema = z.object({
  titleCharacters: z.number().int().positive(),
  selectionCharacters: z.number().int().positive(),
  documentCharacters: z.number().int().positive(),
}).strict();

export const domActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('click'), ref: z.string().min(1) }).strict(),
  z.object({ type: z.literal('focus'), ref: z.string().min(1) }).strict(),
  z.object({ type: z.literal('scrollIntoView'), ref: z.string().min(1) }).strict(),
  z.object({ type: z.literal('setValue'), ref: z.string().min(1), value: z.string().max(10_000) }).strict(),
  z.object({ type: z.literal('select'), ref: z.string().min(1), value: z.string().max(1_000) }).strict(),
]);

export const contentCommandSchema = z.discriminatedUnion('type', [
  z.object({ ...envelope, type: z.literal('EXTRACT_CONTEXT'), limits: contextLimitsSchema }).strict(),
  z.object({ ...envelope, type: z.literal('SET_SELECTION_BUTTON_ENABLED'), enabled: z.boolean() }).strict(),
  z.object({ ...envelope, type: z.literal('GET_DOM_SNAPSHOT'), maxElements: z.number().int().min(1).max(200).optional() }).strict(),
  z.object({ ...envelope, type: z.literal('ANALYZE_TECH_STACK') }).strict(),
  z.object({
    ...envelope,
    type: z.literal('START_SCREENSHOT_SELECTION'),
    instruction: z.string().trim().min(1).max(200),
    cancelHint: z.string().trim().min(1).max(100),
  }).strict(),
  z.object({ ...envelope, type: z.literal('EXECUTE_DOM_ACTIONS'), actions: z.array(domActionSchema).min(1).max(12) }).strict(),
  z.object({
    ...envelope,
    type: z.literal('SHOW_FLOATING_CHAT'),
    layout: floatingChatLayoutSchema,
  }).strict(),
  z.object({ ...envelope, type: z.literal('HIDE_FLOATING_CHAT') }).strict(),
]);
export type ContentCommand = z.infer<typeof contentCommandSchema>;

export const contentEventSchema = z.discriminatedUnion('type', [
  z.object({ ...envelope, type: z.literal('SELECTION_CAPTURED'), text: z.string() }).strict(),
  z.object({ ...envelope, type: z.literal('SELECTION_ACTION_CLICKED'), text: z.string() }).strict(),
  // Live page selection; an empty text means the selection was cleared.
  z.object({ ...envelope, type: z.literal('SELECTION_CHANGED'), text: z.string() }).strict(),
  z.object({ ...envelope, type: z.literal('PAGE_NAVIGATION_CHANGED'), url: z.string(), navigationKey: z.string() }).strict(),
  z.object({ ...envelope, type: z.literal('CONTEXT_EXTRACTION_FAILED'), message: z.string() }).strict(),
  z.object({ ...envelope, type: z.literal('REQUEST_PAGE_ACCESS_POLICY') }).strict(),
  // The user closed the in-page floating chat from its own title bar.
  z.object({ ...envelope, type: z.literal('FLOATING_CHAT_CLOSED') }).strict(),
  z.object({ ...envelope, type: z.literal('FLOATING_CHAT_LAYOUT_CHANGED'), layout: floatingChatLayoutSchema }).strict(),
]);
export type ContentEvent = z.infer<typeof contentEventSchema>;
