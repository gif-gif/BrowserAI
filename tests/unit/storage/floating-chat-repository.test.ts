import { describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '../../../shared/constants/storage-keys';
import { FloatingChatRepository } from '../../../storage/floating-chat-repository';
import { runMigrations } from '../../../storage/migrations';
import { DEFAULT_FLOATING_CHAT_LAYOUT } from '../../../shared/types/floating-chat';
import { FakeStorageArea } from '../../setup/fake-storage';

describe('FloatingChatRepository', () => {
  it('tracks open tabs in session storage', async () => {
    const session = new FakeStorageArea();
    const repo = new FloatingChatRepository(session, new FakeStorageArea());
    await repo.markOpen(7);
    await repo.markOpen(7);
    expect(await repo.openTabs()).toEqual([7]);
    expect(await repo.isOpen(7)).toBe(true);
    expect(await repo.markClosed(7)).toBe(true);
    expect(await repo.markClosed(7)).toBe(false);
    expect(await repo.isOpen(7)).toBe(false);
  });

  it('falls back to the default layout for invalid saved values', async () => {
    const local = new FakeStorageArea();
    const repo = new FloatingChatRepository(new FakeStorageArea(), local);
    expect(await repo.getLayout()).toEqual(DEFAULT_FLOATING_CHAT_LAYOUT);
    await local.set(STORAGE_KEYS.floatingChatLayout, { x: 0, y: 0, width: 10, height: 10 });
    expect(await repo.getLayout()).toEqual(DEFAULT_FLOATING_CHAT_LAYOUT);
    await repo.saveLayout({ x: 10, y: 20, width: 480, height: 600 });
    expect(await repo.getLayout()).toEqual({ x: 10, y: 20, width: 480, height: 600 });
  });

  it('seeds the default layout in the v7 migration and keeps a saved one', async () => {
    const fresh = new FakeStorageArea();
    await fresh.set(STORAGE_KEYS.migrations, 6);
    await runMigrations(fresh);
    expect(fresh.snapshot()[STORAGE_KEYS.floatingChatLayout]).toEqual(DEFAULT_FLOATING_CHAT_LAYOUT);

    const kept = new FakeStorageArea();
    const saved = { x: 5, y: 6, width: 400, height: 500 };
    await kept.set(STORAGE_KEYS.migrations, 6);
    await kept.set(STORAGE_KEYS.floatingChatLayout, saved);
    await runMigrations(kept);
    expect(kept.snapshot()[STORAGE_KEYS.floatingChatLayout]).toEqual(saved);
  });
});
