import type { StorageArea } from '../../storage/storage-area';

export class FakeStorageArea implements StorageArea {
  private values = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> { return this.values.get(key) as T | undefined; }
  async set<T>(key: string, value: T): Promise<void> { this.values.set(key, structuredClone(value)); }
  async remove(key: string): Promise<void> { this.values.delete(key); }
  snapshot(): Record<string, unknown> { return Object.fromEntries(this.values); }
}
