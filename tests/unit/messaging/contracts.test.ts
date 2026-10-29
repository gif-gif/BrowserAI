import { describe, expect, it } from 'vitest';
import {
  chatPortCommandSchema,
  contentCommandSchema,
  parseRuntimeCommand,
  runtimeCommandSchema,
  streamEventSchema,
} from '../../../messaging/contracts';
import { reduceChatStreamEvent } from '../../../messaging/chat-port';

describe('runtime message contracts', () => {
  it('requires version, known type, and requestId for every runtime command', () => {
    expect(runtimeCommandSchema.safeParse({ version: 1, type: 'GET_ACTIVE_TAB_STATE', requestId: 'r1' }).success).toBe(true);
    expect(runtimeCommandSchema.safeParse({ version: 1, type: 'GET_TAB_STATE', requestId: 'r2', tabId: 7 }).success).toBe(true);
    expect(runtimeCommandSchema.safeParse({ version: 1, type: 'GET_TAB_STATE', requestId: 'r3' }).success).toBe(false);
    expect(runtimeCommandSchema.safeParse({ type: 'GET_ACTIVE_TAB_STATE', requestId: 'r1' }).success).toBe(false);
    expect(runtimeCommandSchema.safeParse({ version: 2, type: 'GET_ACTIVE_TAB_STATE', requestId: 'r1' }).success).toBe(false);
    expect(runtimeCommandSchema.safeParse({ version: 1, type: 'NOPE', requestId: 'r1' }).success).toBe(false);
    expect(runtimeCommandSchema.safeParse({ version: 1, type: 'GET_ACTIVE_TAB_STATE' }).success).toBe(false);
  });

  it('validates the trusted writing assistant preference command', () => {
    expect(runtimeCommandSchema.safeParse({
      version: 1,
      type: 'GET_WRITING_ASSISTANT_PREFERENCES',
      requestId: 'writing-preferences-1',
    }).success).toBe(true);
    expect(runtimeCommandSchema.safeParse({
      version: 1,
      type: 'GET_WRITING_ASSISTANT_PREFERENCES',
      requestId: 'writing-preferences-2',
      storageKey: 'must-not-be-accepted',
    }).success).toBe(false);
  });

  it('validates AI writing assistant requests without accepting page input metadata', () => {
    expect(runtimeCommandSchema.safeParse({
      version: 1,
      type: 'AI_WRITING_ASSIST',
      requestId: 'writing-1',
      text: 'Please improve this paragraph.',
      instruction: 'Use a professional tone',
      model: 'gpt-5-mini',
      tone: 'professional',
      locale: 'en',
    }).success).toBe(true);
    expect(runtimeCommandSchema.safeParse({
      version: 1,
      type: 'AI_WRITING_ASSIST',
      requestId: 'writing-2',
      text: '',
      tone: 'dramatic',
      locale: 'en',
    }).success).toBe(false);
    expect(runtimeCommandSchema.safeParse({
      version: 1,
      type: 'AI_WRITING_ASSIST',
      requestId: 'writing-3',
      text: 'Text',
      tone: 'polish',
      locale: 'en',
      inputType: 'password',
    }).success).toBe(false);
    expect(runtimeCommandSchema.safeParse({
      version: 1,
      type: 'AI_WRITING_ASSIST',
      requestId: 'writing-4',
      text: 'Text',
      model: '   ',
      tone: 'polish',
      locale: 'en',
    }).success).toBe(false);
  });

  it('validates history commands without exposing storage implementation details', () => {
    expect(runtimeCommandSchema.safeParse({ version: 1, type: 'LIST_CONVERSATIONS', requestId: 'history-1' }).success).toBe(true);
    expect(runtimeCommandSchema.safeParse({ version: 1, type: 'OPEN_CONVERSATION', requestId: 'history-2', tabId: 7, conversationId: 'c1' }).success).toBe(true);
    expect(runtimeCommandSchema.safeParse({ version: 1, type: 'DELETE_CONVERSATION', requestId: 'history-3', tabId: 7, conversationId: 'c1' }).success).toBe(true);
    expect(runtimeCommandSchema.safeParse({ version: 1, type: 'SET_CONVERSATION_MODEL', requestId: 'history-model', tabId: 7, conversationId: 'c1', model: 'gpt-5-mini' }).success).toBe(true);
    expect(runtimeCommandSchema.safeParse({ version: 1, type: 'SET_CONVERSATION_MODEL', requestId: 'history-model-empty', tabId: 7, conversationId: 'c1', model: '   ' }).success).toBe(false);
    expect(runtimeCommandSchema.safeParse({ version: 1, type: 'CLEAR_CONVERSATIONS', requestId: 'history-4' }).success).toBe(true);
    expect(runtimeCommandSchema.safeParse({ version: 1, type: 'SET_RETENTION', requestId: 'history-5', retentionDays: 7, confirmed: false }).success).toBe(true);
    expect(runtimeCommandSchema.safeParse({ version: 1, type: 'SET_RETENTION', requestId: 'history-6', retentionDays: 14, confirmed: false }).success).toBe(false);
  });

  it('validates the configurable per-file attachment limit', () => {
    expect(runtimeCommandSchema.safeParse({
      version: 1, type: 'GET_ATTACHMENT_LIMIT', requestId: 'attachment-limit-get',
    }).success).toBe(true);
    expect(runtimeCommandSchema.safeParse({
      version: 1, type: 'SET_ATTACHMENT_LIMIT', requestId: 'attachment-limit-min', attachmentMaxBytes: 1024 * 1024,
    }).success).toBe(true);
    expect(runtimeCommandSchema.safeParse({
      version: 1, type: 'SET_ATTACHMENT_LIMIT', requestId: 'attachment-limit-max', attachmentMaxBytes: 20 * 1024 * 1024,
    }).success).toBe(true);
    expect(runtimeCommandSchema.safeParse({
      version: 1, type: 'SET_ATTACHMENT_LIMIT', requestId: 'attachment-limit-small', attachmentMaxBytes: 1024 * 1024 - 1,
    }).success).toBe(false);
    expect(runtimeCommandSchema.safeParse({
      version: 1, type: 'SET_ATTACHMENT_LIMIT', requestId: 'attachment-limit-large', attachmentMaxBytes: 20 * 1024 * 1024 + 1,
    }).success).toBe(false);
  });

  it('validates the configurable page context limit', () => {
    expect(runtimeCommandSchema.safeParse({
      version: 1, type: 'GET_CONTEXT_LIMIT', requestId: 'context-limit-get',
    }).success).toBe(true);
    expect(runtimeCommandSchema.safeParse({
      version: 1, type: 'SET_CONTEXT_LIMIT', requestId: 'context-limit-min', documentCharacters: 5_000,
    }).success).toBe(true);
    expect(runtimeCommandSchema.safeParse({
      version: 1, type: 'SET_CONTEXT_LIMIT', requestId: 'context-limit-max', documentCharacters: 200_000,
    }).success).toBe(true);
    expect(runtimeCommandSchema.safeParse({
      version: 1, type: 'SET_CONTEXT_LIMIT', requestId: 'context-limit-small', documentCharacters: 4_999,
    }).success).toBe(false);
    expect(runtimeCommandSchema.safeParse({
      version: 1, type: 'SET_CONTEXT_LIMIT', requestId: 'context-limit-large', documentCharacters: 200_001,
    }).success).toBe(false);
    expect(runtimeCommandSchema.safeParse({
      version: 1, type: 'SET_CONTEXT_LIMIT', requestId: 'context-limit-fraction', documentCharacters: 40_000.5,
    }).success).toBe(false);
    expect(runtimeCommandSchema.safeParse({
      version: 1, type: 'SET_CONTEXT_LIMIT', requestId: 'context-limit-extra', documentCharacters: 40_000, apiKey: 'nope',
    }).success).toBe(false);
  });

  it('validates retrying page context for a specific tab', () => {
    expect(runtimeCommandSchema.safeParse({
      version: 1,
      type: 'RETRY_PAGE_CONTEXT',
      requestId: 'retry-page-1',
      tabId: 7,
    }).success).toBe(true);
    expect(runtimeCommandSchema.safeParse({
      version: 1,
      type: 'RETRY_PAGE_CONTEXT',
      requestId: 'retry-page-2',
    }).success).toBe(false);
  });

  it('validates draft Gateway model-list and test commands', () => {
    const config = {
      id: 'gateway-main', name: '', type: 'openai-compatible', baseURL: 'https://gw.example/v1', model: '',
      endpointMode: 'chat-completions', defaultHeaders: {}, timeoutMs: 30_000, stream: true,
    } as const;
    expect(runtimeCommandSchema.safeParse({
      version: 1, requestId: 'models-1', type: 'LIST_PROVIDER_MODELS', config, apiKey: 'sk-test',
    }).success).toBe(true);
    expect(runtimeCommandSchema.safeParse({
      version: 1, requestId: 'test-1', type: 'TEST_PROVIDER_DRAFT', config,
    }).success).toBe(false);
    expect(runtimeCommandSchema.safeParse({
      version: 1, requestId: 'test-2', type: 'TEST_PROVIDER_DRAFT', config: { ...config, model: 'gpt-test' },
    }).success).toBe(true);
  });

  it('accepts Anthropic Messages configs only with the messages endpoint', () => {
    const config = {
      id: 'gateway-main', name: 'Claude', type: 'anthropic-messages', baseURL: 'https://api.anthropic.com', model: 'claude-opus-5-5',
      endpointMode: 'messages', defaultHeaders: {}, timeoutMs: 30_000, stream: true,
    } as const;
    expect(runtimeCommandSchema.safeParse({
      version: 1, requestId: 'save-1', type: 'SAVE_PROVIDER_CONFIG', config,
    }).success).toBe(true);
    expect(runtimeCommandSchema.safeParse({
      version: 1, requestId: 'save-2', type: 'SAVE_PROVIDER_CONFIG', config: { ...config, endpointMode: 'chat-completions' },
    }).success).toBe(false);
    expect(runtimeCommandSchema.safeParse({
      version: 1, requestId: 'save-3', type: 'SAVE_PROVIDER_CONFIG', config: { ...config, type: 'gemini' },
    }).success).toBe(false);
  });

  it('validates page technology analysis runtime and content commands', () => {
    expect(runtimeCommandSchema.safeParse({
      version: 1, requestId: 'tech-runtime', type: 'ANALYZE_PAGE_TECH_STACK', tabId: 7,
    }).success).toBe(true);
    expect(contentCommandSchema.safeParse({
      version: 1, requestId: 'tech-content', type: 'ANALYZE_TECH_STACK',
    }).success).toBe(true);
  });

  it('validates free screenshot selection commands without accepting extra fields', () => {
    const command = {
      version: 1,
      requestId: 'screenshot-1',
      type: 'START_SCREENSHOT_SELECTION',
      instruction: '拖动选择截图区域',
      cancelHint: '按 Esc 取消',
    } as const;
    expect(contentCommandSchema.safeParse(command).success).toBe(true);
    expect(contentCommandSchema.safeParse({
      ...command,
      instruction: '',
    }).success).toBe(false);
    expect(contentCommandSchema.safeParse({
      ...command,
      apiKey: 'must-not-be-accepted',
    }).success).toBe(false);
  });

  it('validates streaming commands with the same envelope rules', () => {
    expect(chatPortCommandSchema.safeParse({
      version: 1,
      type: 'START_CHAT',
      requestId: 'r1',
      tabId: 3,
      conversationId: 'c1',
      text: '你好',
      contextSelection: { includePage: true, includeSelection: false },
    }).success).toBe(true);
    expect(chatPortCommandSchema.safeParse({
      version: 1,
      type: 'START_CHAT',
      requestId: 'r2',
      tabId: 3,
      conversationId: 'c1',
      text: '点击搜索按钮',
      contextSelection: { includePage: true, includeSelection: false },
      allowPageActions: true,
    }).success).toBe(true);
    expect(chatPortCommandSchema.safeParse({
      version: 1,
      type: 'START_CHAT',
      requestId: 'skill-only',
      tabId: 3,
      conversationId: 'c1',
      text: '',
      contextSelection: { includePage: false, includeSelection: false },
      skill: { name: '周报', prompt: '整理成周报' },
    }).success).toBe(true);
    expect(chatPortCommandSchema.safeParse({
      version: 1,
      type: 'START_CHAT',
      requestId: 'bad-skill',
      tabId: 3,
      conversationId: 'c1',
      text: '你好',
      contextSelection: { includePage: false, includeSelection: false },
      skill: { name: '周报', prompt: '' },
    }).success).toBe(false);
    expect(chatPortCommandSchema.safeParse({
      version: 1,
      type: 'START_CHAT',
      requestId: 'r3',
      tabId: 3,
      conversationId: 'c1',
      text: '',
      attachments: [{
        id: 'image-1', name: 'screen.jpg', mimeType: 'image/jpeg',
        dataUrl: 'data:image/jpeg;base64,aGVsbG8=', source: 'screenshot',
      }],
      contextSelection: { includePage: false, includeSelection: false },
    }).success).toBe(true);
    expect(chatPortCommandSchema.safeParse({
      version: 1,
      type: 'START_CHAT',
      requestId: 'document-chat',
      tabId: 3,
      conversationId: 'c1',
      text: '',
      attachments: [{
        kind: 'document', id: 'document-1', name: 'notes.txt', mimeType: 'text/plain',
        size: 12, text: 'Reference notes', source: 'upload', truncated: false,
      }],
      contextSelection: { includePage: false, includeSelection: false },
    }).success).toBe(true);
    expect(chatPortCommandSchema.safeParse({
      version: 1,
      type: 'START_CHAT',
      requestId: 'invalid-document-chat',
      tabId: 3,
      conversationId: 'c1',
      text: '',
      attachments: [{
        kind: 'document', id: 'document-1', name: 'notes.exe', mimeType: 'application/octet-stream',
        size: 12, text: 'Reference notes', source: 'upload', truncated: false,
      }],
      contextSelection: { includePage: false, includeSelection: false },
    }).success).toBe(false);
    expect(chatPortCommandSchema.safeParse({
      version: 1,
      type: 'START_CHAT',
      requestId: 'tech-chat',
      tabId: 3,
      conversationId: 'c1',
      text: 'Analyze stack',
      contextSelection: { includePage: false, includeSelection: false },
      techStackEvidence: {
        url: 'https://example.com', title: 'Example', scripts: [], stylesheets: [], metaNames: [],
        htmlAttributes: {}, frameworkMarkers: [],
        technologies: [{ name: 'React', category: 'framework', confidence: 'high', evidence: ['runtime marker'] }],
        truncated: false, capturedAt: 1,
      },
    }).success).toBe(true);
    expect(chatPortCommandSchema.safeParse({
      version: 1,
      type: 'START_CHAT',
      requestId: 'r4',
      tabId: 3,
      conversationId: 'c1',
      text: '',
      attachments: [],
      contextSelection: { includePage: false, includeSelection: false },
    }).success).toBe(false);
    expect(chatPortCommandSchema.safeParse({
      version: 1,
      type: 'START_CHAT',
      requestId: 'r5',
      tabId: 3,
      conversationId: 'c1',
      text: 'analyze',
      attachments: [{
        id: 'file-1', name: 'notes.txt', mimeType: 'text/plain',
        dataUrl: 'data:text/plain;base64,aGVsbG8=', source: 'upload',
      }],
      contextSelection: { includePage: false, includeSelection: false },
    }).success).toBe(false);
    expect(chatPortCommandSchema.safeParse({ version: 1, type: 'CANCEL_CHAT', requestId: '' }).success).toBe(false);
  });

  it('accepts only safe generated-image stream events', () => {
    const valid = {
      version: 1,
      type: 'image',
      requestId: 'image-1',
      index: 0,
      image: {
        dataUrl: 'data:image/png;base64,aGVsbG8=',
        mimeType: 'image/png',
        revisedPrompt: 'A revised prompt',
      },
    };
    expect(streamEventSchema.safeParse(valid).success).toBe(true);
    expect(streamEventSchema.safeParse({
      ...valid,
      image: { ...valid.image, dataUrl: 'https://example.com/image.png' },
    }).success).toBe(false);
    expect(streamEventSchema.safeParse({
      ...valid,
      image: { ...valid.image, dataUrl: 'data:text/html;base64,aGVsbG8=' },
    }).success).toBe(false);
    expect(streamEventSchema.safeParse({
      ...valid,
      image: { ...valid.image, mimeType: 'image/gif' },
    }).success).toBe(false);
  });

  it('returns a safe parse result instead of throwing for unknown input', () => {
    expect(parseRuntimeCommand({ type: 'UNKNOWN', apiKey: 'secret' })).toMatchObject({ ok: false });
  });

  it('keeps content-script commands free of provider configuration and secrets', () => {
    const contractShape = JSON.stringify(contentCommandSchema);
    for (const forbidden of ['apiKey', 'baseURL', 'providerId', 'defaultHeaders', 'model']) {
      expect(contractShape).not.toContain(forbidden);
    }
    expect(contentCommandSchema.safeParse({
      version: 1,
      type: 'EXTRACT_CONTEXT',
      requestId: 'r1',
      limits: { titleCharacters: 500, selectionCharacters: 12_000, documentCharacters: 40_000 },
      apiKey: 'should-be-rejected',
    }).success).toBe(false);
    expect(contentCommandSchema.safeParse({
      version: 1,
      type: 'EXECUTE_DOM_ACTIONS',
      requestId: 'dom-1',
      actions: [{ type: 'setValue', ref: 'e1', value: 'Browser AI' }, { type: 'click', ref: 'e2' }],
    }).success).toBe(true);
    expect(contentCommandSchema.safeParse({
      version: 1,
      type: 'EXECUTE_DOM_ACTIONS',
      requestId: 'dom-2',
      actions: [{ type: 'script', ref: 'e1', value: 'alert(1)' }],
    }).success).toBe(false);
  });
});

describe('chat stream event reducer', () => {
  it('ignores events belonging to a different request', () => {
    const initial = { requestId: 'r1', status: 'streaming' as const, text: 'A' };
    const next = reduceChatStreamEvent(initial, {
      version: 1,
      type: 'delta',
      requestId: 'r2',
      text: 'B',
    });
    expect(next).toBe(initial);
  });
});
