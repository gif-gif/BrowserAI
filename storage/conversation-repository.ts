import { STORAGE_KEYS } from '../shared/constants/storage-keys';
import type { Conversation } from '../shared/types/chat';
import type { StorageArea } from './storage-area';

export class ConversationRepository {
  constructor(private readonly storage: StorageArea) {}

  private async all(): Promise<Conversation[]> {
    return (await this.storage.get<Conversation[]>(STORAGE_KEYS.conversations)) ?? [];
  }

  async get(id: string): Promise<Conversation | undefined> {
    return (await this.all()).find((item) => item.id === id);
  }

  async list(): Promise<Conversation[]> {
    return (await this.all()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async save(conversation: Conversation): Promise<void> {
    const items = await this.all();
    await this.storage.set(STORAGE_KEYS.conversations, [
      ...items.filter((item) => item.id !== conversation.id),
      conversation,
    ]);
  }

  async setPinned(id: string, pinned: boolean, updatedAt = Date.now()): Promise<void> {
    const conversation = await this.get(id);
    if (!conversation) return;
    await this.save({ ...conversation, pinned, updatedAt });
  }

  async setModel(id: string, model: string, updatedAt = Date.now()): Promise<Conversation | undefined> {
    const conversation = await this.get(id);
    if (!conversation) return undefined;
    const updated = { ...conversation, model, updatedAt };
    await this.save(updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const items = await this.all();
    await this.storage.set(STORAGE_KEYS.conversations, items.filter((item) => item.id !== id));
  }
}
