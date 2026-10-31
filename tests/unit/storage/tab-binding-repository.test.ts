import { describe, expect, it } from 'vitest';
import { TabBindingRepository } from '../../../storage/tab-binding-repository';
import { ConversationRepository } from '../../../storage/conversation-repository';
import { FakeStorageArea } from '../../setup/fake-storage';

describe('TabBindingRepository', () => {
  it('removes a tab binding without deleting its conversation', async () => {
    const storage = new FakeStorageArea();
    const conversations = new ConversationRepository(storage);
    const bindings = new TabBindingRepository(storage);
    await conversations.save({ id: 'c1', title: 'c1', messages: [], model: 'm', promptVersion: 'v1', pinned: false, createdAt: 1, updatedAt: 1 });
    await bindings.save({ tabId: 1, conversationId: 'c1', pageUrl: 'https://a.test', navigationKey: 'n1', updatedAt: 1 });
    await bindings.remove(1);
    expect(await bindings.get(1)).toBeUndefined();
    expect(await conversations.get('c1')).toBeDefined();
  });
});
