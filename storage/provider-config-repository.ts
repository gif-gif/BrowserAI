import { STORAGE_KEYS, providerSecretKey } from '../shared/constants/storage-keys';
import type { ProviderConfig, ProviderConfigDraft } from '../shared/types/provider';
import type { StorageArea } from './storage-area';

export class ProviderConfigRepository {
  constructor(
    private readonly storage: StorageArea,
    private readonly now: () => number = Date.now,
  ) {}

  private async all(): Promise<ProviderConfig[]> {
    return (await this.storage.get<ProviderConfig[]>(STORAGE_KEYS.providerConfigs)) ?? [];
  }

  async get(id: string): Promise<ProviderConfig | undefined> {
    return (await this.all()).find((config) => config.id === id);
  }

  async list(): Promise<ProviderConfig[]> {
    return this.all();
  }

  async save(draft: ProviderConfigDraft, apiKey?: string): Promise<ProviderConfig> {
    const configs = await this.all();
    const existing = configs.find((config) => config.id === draft.id);
    const timestamp = this.now();
    const config: ProviderConfig = {
      ...draft,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    await this.storage.set(
      STORAGE_KEYS.providerConfigs,
      [...configs.filter((item) => item.id !== draft.id), config],
    );
    if (apiKey?.trim()) await this.storage.set(providerSecretKey(draft.id), apiKey.trim());
    return config;
  }

  async getSecretForBackground(providerId: string): Promise<string | undefined> {
    return this.storage.get<string>(providerSecretKey(providerId));
  }

  async removeSecret(providerId: string): Promise<void> {
    await this.storage.remove(providerSecretKey(providerId));
  }

  async delete(providerId: string): Promise<void> {
    const configs = await this.all();
    await this.storage.set(STORAGE_KEYS.providerConfigs, configs.filter((item) => item.id !== providerId));
    await this.removeSecret(providerId);
  }
}
