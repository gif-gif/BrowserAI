import { describe, expect, it } from 'vitest';
import { TabSessionService } from '../../../core/chat/tab-session-service';
import { ConversationRepository } from '../../../storage/conversation-repository';
import { TabBindingRepository } from '../../../storage/tab-binding-repository';
import { FakeStorageArea } from '../../setup/fake-storage';

function setup() {
  const storage = new FakeStorageArea();
  let sequence = 0;
  const service = new TabSessionService(
    new ConversationRepository(storage),
    new TabBindingRepository(storage),
    async () => ({ model: 'model-1' }),
    { now: () => 100 + sequence, createId: () => `conversation-${++sequence}` },
  );
  return { service, conversations: new ConversationRepository(storage), bindings: new TabBindingRepository(storage) };
}

describe('TabSessionService', () => {
  it('creates one conversation and reuses it when the same tab is reopened', async () => {
    const { service, conversations } = setup();
    const first = await service.resolve(4, 'https://example.com/a', 'nav-a');
    const reopened = await service.resolve(4, 'https://example.com/a', 'nav-a');
    expect(reopened.conversation.id).toBe(first.conversation.id);
    expect(await conversations.list()).toHaveLength(1);
  });

  it('keeps active conversations independent across tabs and replaces only the current binding', async () => {
    const { service, conversations } = setup();
    const tabOne = await service.resolve(1, 'https://one.example', 'nav-1');
    const tabTwo = await service.resolve(2, 'https://two.example', 'nav-2');
    const replacement = await service.createNew(1, 'https://one.example', 'nav-1b');
    expect(tabOne.conversation.id).not.toBe(tabTwo.conversation.id);
    expect(replacement.id).not.toBe(tabOne.conversation.id);
    expect(await conversations.get(tabOne.conversation.id)).toBeUndefined();
    expect((await service.resolve(2, 'https://two.example', 'nav-2')).conversation.id).toBe(tabTwo.conversation.id);
  });

  it('deletes a replaced empty conversation', async () => {
    const { service, conversations } = setup();
    const original = await service.resolve(1, 'https://example.com', 'nav-1');

    await service.createNew(1, 'https://example.com', 'nav-2');

    expect(await conversations.get(original.conversation.id)).toBeUndefined();
  });

  it('keeps a replaced conversation that contains messages', async () => {
    const { service, conversations } = setup();
    const original = await service.resolve(1, 'https://example.com', 'nav-1');
    await conversations.save({
      ...original.conversation,
      messages: [{ id: 'm1', role: 'user', content: 'Hello', status: 'complete', createdAt: 1 }],
    });

    await service.createNew(1, 'https://example.com', 'nav-2');

    expect(await conversations.get(original.conversation.id)).toBeDefined();
  });

  it('removes a closed tab binding and its empty conversation', async () => {
    const { service, conversations, bindings } = setup();
    const resolved = await service.resolve(8, 'https://example.com', 'nav');
    await service.closeTab(8);
    expect(await bindings.get(8)).toBeUndefined();
    expect(await conversations.get(resolved.conversation.id)).toBeUndefined();
  });

  it('keeps a closed tab conversation that contains messages', async () => {
    const { service, conversations } = setup();
    const resolved = await service.resolve(8, 'https://example.com', 'nav');
    await conversations.save({
      ...resolved.conversation,
      messages: [{ id: 'm1', role: 'assistant', content: 'Hi', status: 'complete', createdAt: 1 }],
    });

    await service.closeTab(8);

    expect(await conversations.get(resolved.conversation.id)).toBeDefined();
  });

  it('does not delete an empty conversation while another tab is still bound to it', async () => {
    const { service, conversations, bindings } = setup();
    const resolved = await service.resolve(1, 'https://example.com/one', 'nav-1');
    await service.bindExisting(2, resolved.conversation.id, 'https://example.com/two', 'nav-2');

    await service.closeTab(1);

    expect(await conversations.get(resolved.conversation.id)).toBeDefined();
    expect(await bindings.get(2)).toMatchObject({ conversationId: resolved.conversation.id });
  });

  it('deletes the previous empty conversation when opening a saved conversation', async () => {
    const { service, conversations, bindings } = setup();
    const empty = await service.resolve(5, 'https://example.com/empty', 'nav-empty');
    await conversations.save({
      id: 'saved',
      title: 'Saved',
      messages: [{ id: 'm1', role: 'user', content: 'Saved message', status: 'complete', createdAt: 1 }],
      
      model: 'model-1',
      promptVersion: 'v1',
      pinned: false,
      createdAt: 1,
      updatedAt: 1,
    });

    await service.bindExisting(5, 'saved', 'https://example.com/saved', 'nav-saved');

    expect(await conversations.get(empty.conversation.id)).toBeUndefined();
    expect(await bindings.get(5)).toMatchObject({ conversationId: 'saved' });
  });

  it('binds an existing conversation to a tab and rejects a missing conversation', async () => {
    const { service, conversations, bindings } = setup();
    await conversations.save({
      id: 'saved', title: 'Saved', messages: [], model: 'model-1',
      promptVersion: 'v1', pinned: false, createdAt: 1, updatedAt: 1,
    });

    await service.bindExisting(5, 'saved', 'https://example.com/saved', 'nav-saved');
    expect(await bindings.get(5)).toMatchObject({ conversationId: 'saved', navigationKey: 'nav-saved' });
    await expect(service.bindExisting(5, 'missing', 'https://example.com', 'nav-missing')).rejects.toMatchObject({ code: 'INVALID_MESSAGE' });
  });
});
