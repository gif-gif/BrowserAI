import type { RetentionChangeResult, RetentionDays } from '../shared/types/storage';
import type { ConversationRepository } from './conversation-repository';
import type { PreferencesRepository } from './preferences-repository';
import type { TabBindingRepository } from './tab-binding-repository';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

interface RetentionServiceOptions {
  now?: () => number;
}

export interface RetentionCleanupResult {
  deletedIds: string[];
}

function retentionRank(value: RetentionDays): number {
  return value === -1 ? Number.POSITIVE_INFINITY : value;
}

export class RetentionService {
  private readonly now: () => number;

  constructor(
    private readonly conversations: ConversationRepository,
    private readonly preferences: PreferencesRepository,
    private readonly bindings: TabBindingRepository,
    options: RetentionServiceOptions = {},
  ) {
    this.now = options.now ?? Date.now;
  }

  async cleanup(retentionOverride?: RetentionDays): Promise<RetentionCleanupResult> {
    const retentionDays = retentionOverride ?? (await this.preferences.get()).retentionDays;
    const deletedIds = await this.expiredIds(retentionDays);
    for (const id of deletedIds) await this.conversations.delete(id);
    return { deletedIds };
  }

  async clearUnpinned(): Promise<RetentionCleanupResult> {
    const deletedIds = (await this.conversations.list())
      .filter((conversation) => !conversation.pinned)
      .map((conversation) => conversation.id);
    for (const id of deletedIds) {
      await this.conversations.delete(id);
      await this.bindings.removeConversation(id);
    }
    return { deletedIds };
  }

  async setRetention(
    retentionDays: RetentionDays,
    options: { confirmed: boolean },
  ): Promise<RetentionChangeResult> {
    const preferences = await this.preferences.get();
    const isShorter = retentionRank(retentionDays) < retentionRank(preferences.retentionDays);
    const affectedIds = isShorter ? await this.expiredIds(retentionDays) : [];

    if (isShorter && affectedIds.length > 0 && !options.confirmed) {
      return {
        requiresConfirmation: true,
        affectedCount: affectedIds.length,
        retentionDays,
      };
    }

    await this.preferences.save({ ...preferences, retentionDays });
    if (isShorter) await this.cleanup(retentionDays);
    return {
      requiresConfirmation: false,
      affectedCount: affectedIds.length,
      retentionDays,
    };
  }

  private async expiredIds(retentionDays: RetentionDays): Promise<string[]> {
    if (retentionDays === -1) return [];

    const activeIds = new Set((await this.bindings.list()).map((binding) => binding.conversationId));
    const cutoff = this.now() - retentionDays * DAY_IN_MS;
    return (await this.conversations.list())
      .filter((conversation) => (
        !conversation.pinned
        && !activeIds.has(conversation.id)
        && (retentionDays === 0 || conversation.updatedAt < cutoff)
      ))
      .map((conversation) => conversation.id);
  }
}
