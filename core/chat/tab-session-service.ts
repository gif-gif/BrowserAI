import { CURRENT_PROMPT_VERSION } from '../../shared/constants/prompt-version';
import { AppError } from '../../shared/errors/app-error';
import type { Conversation } from '../../shared/types/chat';
import type { TabSessionBinding } from '../../shared/types/storage';
import type { ConversationRepository } from '../../storage/conversation-repository';
import type { TabBindingRepository } from '../../storage/tab-binding-repository';

interface ProviderDefaults {
  providerId: string;
  model: string;
}

interface TabSessionServiceOptions {
  now?: () => number;
  createId?: () => string;
}

function createConversationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `conversation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class TabSessionService {
  private readonly now: () => number;
  private readonly createId: () => string;

  constructor(
    private readonly conversations: ConversationRepository,
    private readonly bindings: TabBindingRepository,
    private readonly getProviderDefaults: () => Promise<ProviderDefaults>,
    options: TabSessionServiceOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? createConversationId;
  }

  async resolve(
    tabId: number,
    pageUrl: string,
    navigationKey: string,
  ): Promise<{ conversation: Conversation; binding: TabSessionBinding; created: boolean }> {
    const existingBinding = await this.bindings.get(tabId);
    const existingConversation = existingBinding
      ? await this.conversations.get(existingBinding.conversationId)
      : undefined;

    if (existingConversation) {
      const binding = await this.bind(tabId, existingConversation.id, pageUrl, navigationKey);
      return { conversation: existingConversation, binding, created: false };
    }

    const conversation = await this.createNew(tabId, pageUrl, navigationKey);
    const binding = (await this.bindings.get(tabId))!;
    return { conversation, binding, created: true };
  }

  async createNew(tabId: number, pageUrl: string, navigationKey: string): Promise<Conversation> {
    const previousBinding = await this.bindings.get(tabId);
    const defaults = await this.getProviderDefaults();
    const timestamp = this.now();
    const conversation: Conversation = {
      id: this.createId(),
      title: '新对话',
      messages: [],
      providerId: defaults.providerId,
      model: defaults.model,
      promptVersion: CURRENT_PROMPT_VERSION,
      pinned: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.conversations.save(conversation);
    await this.bind(tabId, conversation.id, pageUrl, navigationKey);
    if (previousBinding?.conversationId !== conversation.id) {
      await this.removeEmptyConversationIfUnbound(previousBinding?.conversationId);
    }
    return conversation;
  }

  async bindExisting(
    tabId: number,
    conversationId: string,
    pageUrl: string,
    navigationKey: string,
  ): Promise<Conversation> {
    const previousBinding = await this.bindings.get(tabId);
    const conversation = await this.conversations.get(conversationId);
    if (!conversation) throw new AppError('INVALID_MESSAGE', '要打开的对话不存在');
    await this.bind(tabId, conversation.id, pageUrl, navigationKey);
    if (previousBinding?.conversationId !== conversation.id) {
      await this.removeEmptyConversationIfUnbound(previousBinding?.conversationId);
    }
    return conversation;
  }

  async closeTab(tabId: number): Promise<void> {
    const binding = await this.bindings.get(tabId);
    await this.bindings.remove(tabId);
    await this.removeEmptyConversationIfUnbound(binding?.conversationId);
  }

  private async removeEmptyConversationIfUnbound(conversationId?: string): Promise<void> {
    if (!conversationId) return;

    const bindings = await this.bindings.list();
    if (bindings.some((binding) => binding.conversationId === conversationId)) return;

    const conversation = await this.conversations.get(conversationId);
    if (conversation?.messages.length === 0) {
      await this.conversations.delete(conversationId);
    }
  }

  private async bind(
    tabId: number,
    conversationId: string,
    pageUrl: string,
    navigationKey: string,
  ): Promise<TabSessionBinding> {
    const binding: TabSessionBinding = {
      tabId,
      conversationId,
      pageUrl,
      navigationKey,
      updatedAt: this.now(),
    };
    await this.bindings.save(binding);
    return binding;
  }
}
