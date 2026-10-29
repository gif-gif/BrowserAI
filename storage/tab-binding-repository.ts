import { STORAGE_KEYS } from '../shared/constants/storage-keys';
import type { TabSessionBinding } from '../shared/types/storage';
import type { StorageArea } from './storage-area';

export class TabBindingRepository {
  constructor(private readonly storage: StorageArea) {}

  private async all(): Promise<TabSessionBinding[]> {
    return (await this.storage.get<TabSessionBinding[]>(STORAGE_KEYS.tabBindings)) ?? [];
  }

  async list(): Promise<TabSessionBinding[]> {
    return this.all();
  }

  async get(tabId: number): Promise<TabSessionBinding | undefined> {
    return (await this.all()).find((item) => item.tabId === tabId);
  }

  async save(binding: TabSessionBinding): Promise<void> {
    const items = await this.all();
    await this.storage.set(STORAGE_KEYS.tabBindings, [
      ...items.filter((item) => item.tabId !== binding.tabId),
      binding,
    ]);
  }

  async removeConversation(conversationId: string): Promise<void> {
    const items = await this.all();
    await this.storage.set(STORAGE_KEYS.tabBindings, items.filter((item) => item.conversationId !== conversationId));
  }

  async remove(tabId: number): Promise<void> {
    const items = await this.all();
    await this.storage.set(STORAGE_KEYS.tabBindings, items.filter((item) => item.tabId !== tabId));
  }
}
