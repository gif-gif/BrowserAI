import { describe, expect, it } from 'vitest';
import { ConversationRepository } from '../../../storage/conversation-repository';
import { FakeStorageArea } from '../../setup/fake-storage';

const conversation = (id: string, updatedAt: number) => ({ id, title: id, messages: [], providerId: 'p1', model: 'm1', promptVersion: 'v1', pinned: false, createdAt: updatedAt, updatedAt });

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
});
