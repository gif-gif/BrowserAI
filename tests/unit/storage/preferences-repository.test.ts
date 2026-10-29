import { describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '../../../shared/constants/storage-keys';
import { PreferencesRepository } from '../../../storage/preferences-repository';
import { runMigrations } from '../../../storage/migrations';
import { FakeStorageArea } from '../../setup/fake-storage';

describe('PreferencesRepository', () => {
  it('returns approved defaults', async () => {
    const repo = new PreferencesRepository(new FakeStorageArea());
    expect(await repo.get()).toMatchObject({
      retentionDays: 30,
      pageAccessMode: 'active-tab',
      selectionButtonEnabled: true,
      documentContextCharacters: 40_000,
      attachmentMaxBytes: 5 * 1024 * 1024,
    });
  });
  it('fills the context limit for preferences saved by an older version', async () => {
    const storage = new FakeStorageArea();
    await storage.set(STORAGE_KEYS.preferences, {
      retentionDays: 30,
      pageAccessMode: 'active-tab',
      selectionButtonEnabled: true,
      siteDenylist: [],
    });
    const repo = new PreferencesRepository(storage);
    expect((await repo.get()).documentContextCharacters).toBe(40_000);
  });
  it('fills the attachment limit for preferences saved by an older version', async () => {
    const storage = new FakeStorageArea();
    await storage.set(STORAGE_KEYS.preferences, {
      retentionDays: 30,
      pageAccessMode: 'active-tab',
      selectionButtonEnabled: true,
      documentContextCharacters: 40_000,
      siteDenylist: [],
    });
    const repo = new PreferencesRepository(storage);
    expect((await repo.get()).attachmentMaxBytes).toBe(5 * 1024 * 1024);
  });
  it('adds an empty skill list in the v2 migration', async () => {
    const fresh = new FakeStorageArea();
    await runMigrations(fresh);
    expect(fresh.snapshot()[STORAGE_KEYS.skills]).toEqual([]);
    expect(fresh.snapshot()[STORAGE_KEYS.migrations]).toBe(7);
  });
  it('clears saved skills in the v4 migration and keeps skills added afterwards', async () => {
    const upgraded = new FakeStorageArea();
    await upgraded.set(STORAGE_KEYS.migrations, 3);
    await upgraded.set(STORAGE_KEYS.skills, [{ id: 'a', name: 'hi', prompt: '打招呼', createdAt: 1, updatedAt: 1 }]);
    await runMigrations(upgraded);
    expect(upgraded.snapshot()[STORAGE_KEYS.skills]).toEqual([]);
    expect(upgraded.snapshot()[STORAGE_KEYS.migrations]).toBe(7);

    const added = [{ id: 'b', name: '摘要', prompt: '提炼', createdAt: 2, updatedAt: 2 }];
    await upgraded.set(STORAGE_KEYS.skills, added);
    await runMigrations(upgraded);
    expect(upgraded.snapshot()[STORAGE_KEYS.skills]).toEqual(added);
  });
  it('seeds the new-conversation suggestions with the quick actions in the v5 migration', async () => {
    const upgraded = new FakeStorageArea();
    await upgraded.set(STORAGE_KEYS.migrations, 4);
    await runMigrations(upgraded);
    expect(upgraded.snapshot()[STORAGE_KEYS.newChatShortcuts]).toEqual([
      { type: 'action', id: 'summarize' },
      { type: 'action', id: 'explain' },
      { type: 'action', id: 'translate' },
      { type: 'action', id: 'tech-stack' },
    ]);
    expect(upgraded.snapshot()[STORAGE_KEYS.migrations]).toBe(7);

    const custom = [{ type: 'skill', id: 'skill-1' }];
    const kept = new FakeStorageArea();
    await kept.set(STORAGE_KEYS.migrations, 4);
    await kept.set(STORAGE_KEYS.newChatShortcuts, custom);
    await runMigrations(kept);
    expect(kept.snapshot()[STORAGE_KEYS.newChatShortcuts]).toEqual(custom);
  });
  it('starts the appearance at follow-Chrome in the v6 migration and keeps a saved choice', async () => {
    const upgraded = new FakeStorageArea();
    await upgraded.set(STORAGE_KEYS.migrations, 5);
    await runMigrations(upgraded);
    expect(upgraded.snapshot()[STORAGE_KEYS.appearancePreference]).toBe('system');
    expect(upgraded.snapshot()[STORAGE_KEYS.migrations]).toBe(7);

    const kept = new FakeStorageArea();
    await kept.set(STORAGE_KEYS.migrations, 5);
    await kept.set(STORAGE_KEYS.appearancePreference, 'dark');
    await runMigrations(kept);
    expect(kept.snapshot()[STORAGE_KEYS.appearancePreference]).toBe('dark');
  });
  it('runs v1 migration idempotently', async () => {
    const storage = new FakeStorageArea();
    await runMigrations(storage);
    const first = storage.snapshot();
    await runMigrations(storage);
    expect(storage.snapshot()).toEqual(first);
  });
});

describe('provider config migration', () => {
  it('marks configs saved before v3 as OpenAI-compatible chat completions', async () => {
    const storage = new FakeStorageArea();
    await storage.set(STORAGE_KEYS.migrations, 2);
    await storage.set(STORAGE_KEYS.providerConfigs, [
      { id: 'legacy', name: 'Old', baseURL: 'https://gw.test/v1', model: 'm', defaultHeaders: {}, timeoutMs: 1, stream: true },
      { id: 'claude', name: 'Claude', type: 'anthropic-messages', endpointMode: 'chat-completions', baseURL: 'https://api.anthropic.com', model: 'c', defaultHeaders: {}, timeoutMs: 1, stream: true },
    ]);
    await runMigrations(storage);
    const configs = storage.snapshot()[STORAGE_KEYS.providerConfigs] as Array<Record<string, unknown>>;
    expect(configs.map(({ type, endpointMode }) => ({ type, endpointMode }))).toEqual([
      { type: 'openai-compatible', endpointMode: 'chat-completions' },
      { type: 'anthropic-messages', endpointMode: 'messages' },
    ]);
  });
});
