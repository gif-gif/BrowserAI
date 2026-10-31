import { AppError, serializeAppError, type SerializedAppError } from '../../shared/errors/app-error';
import type { ChatMessage, Conversation, ChatAttachment, MessageSource, MessageSourcePage } from '../../shared/types/chat';
import type { DomAction, DomActionBatchResult, DomSnapshot } from '../../shared/types/dom-actions';
import type { ExtractedPageContext } from '../../shared/types/context';
import type { ProviderConfig } from '../../shared/types/provider';
import type { PageTechStackEvidence } from '../../shared/types/tech-stack';
import type { SkillInvocation } from '../../shared/types/skill';
import type { ConversationRepository } from '../../storage/conversation-repository';
import type { StreamEvent } from '../../messaging/contracts';
import type { ProviderAdapter, ProviderStreamEvent } from '../providers/provider-adapter';
import type { ActiveStreamRegistry } from '../streaming/active-stream-registry';
import { buildChatContext, type ContextSelectionInput } from './context-builder';
import type { ContextSnapshotService } from './context-snapshot-service';
import type { PromptBuildMetadata } from './prompt-builder';
import {
  buildPageActionFollowup,
  buildPageActionMessages,
  parsePageActionDecision,
} from '../page-actions/page-action-agent';

export interface StartChatInput {
  requestId: string;
  tabId: number;
  conversationId: string;
  text: string;
  attachments?: ChatAttachment[];
  contextSelection: ContextSelectionInput;
  allowPageActions?: boolean;
  techStackEvidence?: PageTechStackEvidence;
  skill?: SkillInvocation;
}

export interface RetryChatInput {
  requestId: string;
  tabId: number;
  conversationId: string;
  userMessageId: string;
  contextSelection: ContextSelectionInput;
}

export type StreamEventSink = (event: StreamEvent) => void | Promise<void>;

interface ChatServiceDependencies {
  conversations: ConversationRepository;
  snapshots: ContextSnapshotService;
  streams: ActiveStreamRegistry;
  /** The single Gateway from settings, shared by all conversations. */
  getConfig(): Promise<ProviderConfig | undefined>;
  getSecret(providerId: string): Promise<string | undefined>;
  hasGatewayPermission(config: ProviderConfig): Promise<boolean>;
  getAdapter(config: ProviderConfig): ProviderAdapter;
  createId?: (prefix: 'user' | 'assistant') => string;
  now?: () => number;
  /** Extracts a fresh snapshot of another tab the user mentioned with “@”. */
  extractTab?(tabId: number): Promise<ExtractedPageContext>;
  pageActions?: {
    snapshot(tabId: number): Promise<DomSnapshot>;
    execute(tabId: number, actions: DomAction[]): Promise<DomActionBatchResult>;
  };
}

function randomMessageId(prefix: 'user' | 'assistant'): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export class ChatService {
  private readonly now: () => number;
  private readonly createId: (prefix: 'user' | 'assistant') => string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly dependencies: ChatServiceDependencies) {
    this.now = dependencies.now ?? Date.now;
    this.createId = dependencies.createId ?? randomMessageId;
  }

  async start(input: StartChatInput, emit: StreamEventSink): Promise<void> {
    const text = input.text.trim();
    const attachments = input.attachments ?? [];
    if (!text && attachments.length === 0 && !input.skill) throw new AppError('INVALID_MESSAGE', '消息或附件不能为空');
    const conversation = await this.requireConversation(input.conversationId);
    const config = await this.requireReadyProvider();
    const additionalSnapshots = await this.extractAdditionalTabs(input.tabId, input.contextSelection);
    const built = buildChatContext({
      conversation,
      tabId: input.tabId,
      question: text,
      attachments,
      contextSelection: input.contextSelection,
      snapshots: this.dependencies.snapshots,
      techStackEvidence: input.techStackEvidence,
      additionalSnapshots,
      skill: input.skill,
    });

    const source = this.createSource(built.snapshot, built.metadata);
    const userMessage: ChatMessage = {
      id: this.createId('user'), role: 'user', content: text, status: 'complete',
      ...(attachments.length ? { attachments } : {}),
      ...(input.skill ? { skill: input.skill } : {}),
      ...(source ? { source } : {}), createdAt: this.now(),
    };
    await this.appendMessage(conversation.id, userMessage);
    if (input.allowPageActions) {
      await this.streamPageActionAnswer({
        requestId: input.requestId,
        tabId: input.tabId,
        conversation,
        config,
        messages: built.messages,
        emit,
      });
      return;
    }
    await this.streamAnswer({
      requestId: input.requestId,
      conversation,
      config,
      messages: built.messages,
      emit,
    });
  }

  private async streamPageActionAnswer(options: {
    requestId: string;
    tabId: number;
    conversation: Conversation;
    config: ProviderConfig;
    messages: import('../providers/provider-adapter').DomainProviderMessage[];
    emit: StreamEventSink;
  }): Promise<void> {
    const pageActions = this.dependencies.pageActions;
    if (!pageActions) throw new AppError('PAGE_ACTION_FAILED', '当前环境不支持网页操作');

    const { requestId, tabId, conversation, config, emit } = options;
    const assistantMessage: ChatMessage = {
      id: this.createId('assistant'), role: 'assistant', content: '', status: 'streaming', createdAt: this.now(),
    };
    await this.appendMessage(conversation.id, assistantMessage);

    const controller = new AbortController();
    const active = this.dependencies.streams.register({
      requestId,
      conversationId: conversation.id,
      assistantMessageId: assistantMessage.id,
      controller,
    });
    await emit({ version: 1, type: 'started', requestId });

    try {
      if (active.cancelled || controller.signal.aborted) throw new AppError('REQUEST_CANCELLED', '请求已取消');
      let snapshot = await pageActions.snapshot(tabId);
      if (active.cancelled || controller.signal.aborted) throw new AppError('REQUEST_CANCELLED', '请求已取消');
      const messages = buildPageActionMessages(options.messages, snapshot);
      let finalMessage = '';
      let lastProgressMessage = '';

      for (let round = 0; round < 4; round += 1) {
        const raw = await this.collectProviderText({
          requestId,
          conversation,
          config,
          messages,
          signal: controller.signal,
        });
        if (active.cancelled || controller.signal.aborted) throw new AppError('REQUEST_CANCELLED', '请求已取消');
        const decision = parsePageActionDecision(raw);
        if (!decision) {
          finalMessage = raw.trim() || '模型没有返回可执行的网页操作。';
          break;
        }
        lastProgressMessage = decision.message.trim() || lastProgressMessage;
        if (decision.actions.length === 0) {
          finalMessage = decision.message.trim() || '网页操作已完成。';
          break;
        }

        if (active.cancelled || controller.signal.aborted) throw new AppError('REQUEST_CANCELLED', '请求已取消');
        const result = await pageActions.execute(tabId, decision.actions);
        if (active.cancelled || controller.signal.aborted) throw new AppError('REQUEST_CANCELLED', '请求已取消');
        messages.push({ role: 'assistant', content: raw });
        try {
          snapshot = await pageActions.snapshot(tabId);
          if (active.cancelled || controller.signal.aborted) throw new AppError('REQUEST_CANCELLED', '请求已取消');
          messages.push(buildPageActionFollowup(result, snapshot));
        } catch (error) {
          if (active.cancelled || controller.signal.aborted) throw error;
          const succeeded = result.results.some((item) => item.success);
          if (!succeeded) throw error;
          finalMessage = decision.message.trim() || '网页操作已执行，但页面发生变化，无法继续验证结果。';
          break;
        }
      }

      if (!finalMessage) finalMessage = lastProgressMessage || '已达到单次网页操作的最大步骤数，请检查页面后继续。';
      if (active.cancelled || controller.signal.aborted) throw new AppError('REQUEST_CANCELLED', '请求已取消');
      await this.appendDelta(conversation.id, assistantMessage.id, finalMessage);
      await this.setMessageState(conversation.id, assistantMessage.id, 'complete');
      await emit({ version: 1, type: 'delta', requestId, text: finalMessage });
      await emit({ version: 1, type: 'completed', requestId, finishReason: 'page_actions' });
    } catch (error) {
      const cancelled = active.cancelled || controller.signal.aborted;
      const serialized = serializeAppError(cancelled ? new AppError('REQUEST_CANCELLED', '请求已取消') : error);
      await this.setMessageState(
        conversation.id,
        assistantMessage.id,
        cancelled ? 'cancelled' : 'failed',
        cancelled ? undefined : serialized,
      );
      await emit({ version: 1, type: 'failed', requestId, error: serialized });
    } finally {
      this.dependencies.streams.remove(requestId);
    }
  }

  private async collectProviderText(options: {
    requestId: string;
    conversation: Conversation;
    config: ProviderConfig;
    messages: import('../providers/provider-adapter').DomainProviderMessage[];
    signal: AbortSignal;
  }): Promise<string> {
    const adapter = this.dependencies.getAdapter(options.config);
    let text = '';
    let completed = false;
    for await (const event of adapter.streamChat({
      requestId: options.requestId,
      providerId: options.config.id,
      model: options.conversation.model || options.config.model,
      messages: options.messages,
      temperature: options.config.temperature,
      maxOutputTokens: options.config.maxOutputTokens,
      signal: options.signal,
    })) {
      if (event.requestId !== options.requestId) continue;
      if (event.type === 'delta') text += event.text;
      if (event.type === 'completed') completed = true;
      if (event.type === 'failed') {
        throw new AppError(event.error.code, event.error.message, {
          retryable: event.error.retryable,
          status: event.error.status,
          requestId: event.error.requestId,
        });
      }
    }
    if (!completed) throw new AppError('STREAM_PROTOCOL_ERROR', 'Gateway 流在完成事件前结束', { retryable: true });
    return text;
  }

  async retry(input: RetryChatInput, emit: StreamEventSink): Promise<void> {
    const conversation = await this.requireConversation(input.conversationId);
    const userIndex = conversation.messages.findIndex(
      (message) => message.id === input.userMessageId && message.role === 'user',
    );
    if (userIndex < 0) throw new AppError('INVALID_MESSAGE', '找不到要重试的用户消息');
    const userMessage = conversation.messages[userIndex]!;
    const config = await this.requireReadyProvider();
    const historyBeforeTurn: Conversation = {
      ...conversation,
      messages: conversation.messages.slice(0, userIndex),
    };
    const additionalSnapshots = await this.extractAdditionalTabs(input.tabId, input.contextSelection);
    const built = buildChatContext({
      conversation: historyBeforeTurn,
      tabId: input.tabId,
      question: userMessage.content,
      attachments: userMessage.attachments,
      contextSelection: input.contextSelection,
      snapshots: this.dependencies.snapshots,
      additionalSnapshots,
      skill: userMessage.skill,
    });
    await this.streamAnswer({
      requestId: input.requestId,
      conversation,
      config,
      messages: built.messages,
      emit,
    });
  }

  private async streamAnswer(options: {
    requestId: string;
    conversation: Conversation;
    config: ProviderConfig;
    messages: import('../providers/provider-adapter').DomainProviderMessage[];
    emit: StreamEventSink;
  }): Promise<void> {
    const { requestId, conversation, config, messages, emit } = options;
    const assistantMessage: ChatMessage = {
      id: this.createId('assistant'), role: 'assistant', content: '', status: 'streaming', createdAt: this.now(),
    };
    await this.appendMessage(conversation.id, assistantMessage);

    const controller = new AbortController();
    const active = this.dependencies.streams.register({
      requestId,
      conversationId: conversation.id,
      assistantMessageId: assistantMessage.id,
      controller,
    });
    const adapter = this.dependencies.getAdapter(config);
    let terminal = false;

    if (active.cancelled || controller.signal.aborted) {
      const error = serializeAppError(new AppError('REQUEST_CANCELLED', '请求已取消'));
      await this.setMessageState(conversation.id, assistantMessage.id, 'cancelled');
      await emit({ version: 1, type: 'failed', requestId, error });
      this.dependencies.streams.remove(requestId);
      return;
    }

    try {
      for await (const event of adapter.streamChat({
        requestId,
        providerId: config.id,
        model: conversation.model || config.model,
        messages,
        temperature: config.temperature,
        maxOutputTokens: config.maxOutputTokens,
        signal: controller.signal,
      })) {
        if (event.requestId !== requestId) continue;
        if (active.cancelled || controller.signal.aborted) break;
        if (event.type === 'delta') {
          await this.appendDelta(conversation.id, assistantMessage.id, event.text);
        } else if (event.type === 'image') {
          await this.appendGeneratedImage(conversation.id, assistantMessage.id, event.index, event.image);
        } else if (event.type === 'completed') {
          terminal = true;
          await this.setMessageState(conversation.id, assistantMessage.id, 'complete');
        } else if (event.type === 'failed') {
          terminal = true;
          const cancelled = active.cancelled || controller.signal.aborted || event.error.code === 'REQUEST_CANCELLED';
          await this.setMessageState(
            conversation.id,
            assistantMessage.id,
            cancelled ? 'cancelled' : 'failed',
            cancelled ? undefined : event.error,
          );
        }
        await emit(this.toStreamEvent(event));
      }

      if (!terminal) {
        if (active.cancelled || controller.signal.aborted) {
          const error = serializeAppError(new AppError('REQUEST_CANCELLED', '请求已取消'));
          await this.setMessageState(conversation.id, assistantMessage.id, 'cancelled');
          await emit({ version: 1, type: 'failed', requestId, error });
        } else {
          const error: SerializedAppError = {
            code: 'STREAM_PROTOCOL_ERROR',
            message: 'Gateway 流在完成事件前结束',
            retryable: true,
          };
          await this.setMessageState(conversation.id, assistantMessage.id, 'failed', error);
          await emit({ version: 1, type: 'failed', requestId, error });
        }
      }
    } finally {
      this.dependencies.streams.remove(requestId);
    }
  }

  async cancel(requestId: string): Promise<boolean> {
    const active = this.dependencies.streams.cancel(requestId);
    if (!active) return true;
    await this.setMessageState(active.conversationId, active.assistantMessageId, 'cancelled');
    return true;
  }

  private async requireConversation(id: string): Promise<Conversation> {
    const conversation = await this.dependencies.conversations.get(id);
    if (!conversation) throw new AppError('INVALID_MESSAGE', '对话不存在');
    return conversation;
  }

  private async requireReadyProvider(): Promise<ProviderConfig> {
    const config = await this.dependencies.getConfig();
    if (!config) throw new AppError('CONFIG_MISSING', '尚未配置 AI Gateway');
    if (!await this.dependencies.getSecret(config.id)) throw new AppError('API_KEY_MISSING', '尚未配置 Gateway API Key');
    if (!await this.dependencies.hasGatewayPermission(config)) {
      throw new AppError('HOST_PERMISSION_REQUIRED', '需要授权访问当前 Gateway');
    }
    return config;
  }

  /** The tab extractor depends on browser navigation state owned by the background bootstrap. */
  setTabExtractor(extractTab: (tabId: number) => Promise<ExtractedPageContext>): void {
    this.dependencies.extractTab = extractTab;
  }

  private async extractAdditionalTabs(
    currentTabId: number,
    selection: ContextSelectionInput,
  ): Promise<ExtractedPageContext[]> {
    const tabIds = Array.from(new Set(selection.additionalTabIds ?? []))
      .filter((tabId) => tabId !== currentTabId);
    if (tabIds.length === 0) return [];
    const extractTab = this.dependencies.extractTab;
    if (!extractTab) throw new AppError('CONTEXT_EXTRACTION_FAILED', '当前环境不支持读取其他标签页');
    return Promise.all(tabIds.map(async (tabId) => {
      try {
        return await extractTab(tabId);
      } catch (error) {
        throw new AppError('CONTEXT_EXTRACTION_FAILED', '无法读取已添加的标签页，请移除该标签页后重试', { cause: error });
      }
    }));
  }

  private createSource(
    snapshot: ReturnType<ContextSnapshotService['current']>,
    metadata: PromptBuildMetadata,
  ): MessageSource | undefined {
    const contextTypes = metadata.includedContextTypes;
    const additionalPages: MessageSourcePage[] = metadata.includedAdditionalPages.map((page) => ({
      pageTitle: page.title,
      pageUrl: page.url,
      pageTruncated: page.truncated,
    }));
    if (snapshot && contextTypes.length > 0) {
      return {
        pageTitle: snapshot.title,
        pageUrl: snapshot.url,
        contextTypes,
        pageTruncated: snapshot.metadata.truncated,
        ...(additionalPages.length ? { additionalPages } : {}),
      };
    }
    const [first, ...rest] = additionalPages;
    if (!first) return undefined;
    return {
      pageTitle: first.pageTitle,
      pageUrl: first.pageUrl,
      contextTypes: ['page'],
      pageTruncated: first.pageTruncated,
      ...(rest.length ? { additionalPages: rest } : {}),
    };
  }

  private async appendMessage(conversationId: string, message: ChatMessage): Promise<void> {
    await this.updateConversation(conversationId, (conversation) => ({
      ...conversation,
      messages: [...conversation.messages, message],
      title: conversation.messages.length === 0 && message.role === 'user'
        ? ([message.skill ? `/${message.skill.name}` : '', message.content.trim()].filter(Boolean).join(' ')
          || message.attachments?.[0]?.name || '附件对话').slice(0, 60)
        : conversation.title,
      updatedAt: this.now(),
    }));
  }

  private async appendDelta(conversationId: string, messageId: string, text: string): Promise<void> {
    await this.updateMessage(conversationId, messageId, (message) => ({ ...message, content: message.content + text }));
  }

  private async appendGeneratedImage(
    conversationId: string,
    messageId: string,
    index: number,
    image: Extract<ProviderStreamEvent, { type: 'image' }>['image'],
  ): Promise<void> {
    const extension = image.mimeType === 'image/jpeg' ? 'jpg' : image.mimeType.split('/')[1];
    const id = `${messageId}-image-${index}`;
    await this.updateMessage(conversationId, messageId, (message) => {
      if (message.attachments?.some((attachment) => attachment.id === id)) return message;
      const attachment: ChatAttachment = {
        id,
        name: `generated-image-${index + 1}.${extension}`,
        mimeType: image.mimeType,
        dataUrl: image.dataUrl,
        source: 'generated',
      };
      return { ...message, attachments: [...(message.attachments ?? []), attachment] };
    });
  }

  private async setMessageState(
    conversationId: string,
    messageId: string,
    status: ChatMessage['status'],
    error?: SerializedAppError,
  ): Promise<void> {
    await this.updateMessage(conversationId, messageId, (message) => ({
      ...message,
      status,
      ...(error ? { error } : {}),
    }));
  }

  private async updateMessage(
    conversationId: string,
    messageId: string,
    update: (message: ChatMessage) => ChatMessage,
  ): Promise<void> {
    await this.updateConversation(conversationId, (conversation) => ({
      ...conversation,
      messages: conversation.messages.map((message) => message.id === messageId ? update(message) : message),
      updatedAt: this.now(),
    }));
  }

  private async updateConversation(
    conversationId: string,
    update: (conversation: Conversation) => Conversation,
  ): Promise<void> {
    const current = this.writeQueue.then(async () => {
      const conversation = await this.requireConversation(conversationId);
      await this.dependencies.conversations.save(update(conversation));
    });
    this.writeQueue = current.catch(() => undefined);
    await current;
  }

  private toStreamEvent(event: ProviderStreamEvent): StreamEvent {
    return { version: 1, ...event } as StreamEvent;
  }
}
