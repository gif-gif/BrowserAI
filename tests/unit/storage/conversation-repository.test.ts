import { describe, expect, it } from 'vitest';
import { ConversationRepository } from '../../../storage/conversation-repository';
import { STORAGE_KEYS } from '../../../shared/constants/storage-keys';
import { runMigrations } from '../../../storage/migrations';
import { FakeStorageArea } from '../../setup/fake-storage';

const conversation = (id: string, updatedAt: number) => ({ id, title: id, messages: [], model: 'm1', promptVersion: 'v1', pinned: false, createdAt: updatedAt, updatedAt });

describe('ConversationRepository', () => {
  it('lists newest conversations first and supports model, pin, and delete updates', async () => {
    const repo = new ConversationRepository(new FakeStorageArea());
    await repo.save(conversation('old', 1));
    await repo.save(conversation('new', 2));
    expect((await repo.list()).map((item) => item.id)).toEqual(['new', 'old']);
    await repo.setModel('old', 'm2', 3);
    expect(await repo.get('old')).toMatchObject({ model: 'm2', updatedAt: 3 });
    await repo.setPinned('old', true, 4);
    expect((await repo.get('old'))?.pinned).toBe(true);
    await repo.delete('new');
    expect(await repo.get('new')).toBeUndefined();
  });

  it('drops the per-conversation Gateway in the v8 migration and keeps the chosen model', async () => {
    const storage = new FakeStorageArea();
    await storage.set(STORAGE_KEYS.migrations, 7);
    await storage.set(STORAGE_KEYS.conversations, [{ ...conversation('c1', 1), providerId: '', model: 'm2' }]);
    await runMigrations(storage);
    const [migrated] = await new ConversationRepository(storage).list();
    expect(migrated).not.toHaveProperty('providerId');
    expect(migrated).toMatchObject({ id: 'c1', model: 'm2' });
  });
});
