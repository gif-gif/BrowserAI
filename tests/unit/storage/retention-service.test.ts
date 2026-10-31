import { describe, expect, it } from 'vitest';
import { RetentionService } from '../../../storage/retention-service';
import { ConversationRepository } from '../../../storage/conversation-repository';
import { PreferencesRepository } from '../../../storage/preferences-repository';
import { TabBindingRepository } from '../../../storage/tab-binding-repository';
import { FakeStorageArea } from '../../setup/fake-storage';
import type { Conversation } from '../../../shared/types/chat';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 100 * DAY;

function conversation(id: string, ageDays: number, pinned = false): Conversation {
  return {
    id,
    title: id,
    messages: [],
    
    model: 'model-1',
    promptVersion: 'v1',
    pinned,
    createdAt: NOW - ageDays * DAY,
    updatedAt: NOW - ageDays * DAY,
  };
}

function setup() {
  const storage = new FakeStorageArea();
  const conversations = new ConversationRepository(storage);
  const preferences = new PreferencesRepository(storage);
  const bindings = new TabBindingRepository(storage);
  const retention = new RetentionService(conversations, preferences, bindings, { now: () => NOW });
  return { conversations, preferences, bindings, retention };
}

describe('RetentionService', () => {
  it('removes expired ordinary conversations but retains pinned conversations', async () => {
    const { conversations, preferences, retention } = setup();
    await preferences.save({ retentionDays: 30, pageAccessMode: 'active-tab', selectionButtonEnabled: true, documentContextCharacters: 40_000, attachmentMaxBytes: 5 * 1024 * 1024, siteDenylist: [] });
    await conversations.save(conversation('recent', 10));
    await conversations.save(conversation('expired', 31));
    await conversations.save(conversation('pinned', 90, true));

    const result = await retention.cleanup();

    expect(result.deletedIds).toEqual(['expired']);
    expect((await conversations.list()).map((item) => item.id)).toEqual(['recent', 'pinned']);
  });

  it('removes every expired conversation without concurrent repository write loss', async () => {
    const { conversations, preferences, retention } = setup();
    await preferences.save({ retentionDays: 7, pageAccessMode: 'active-tab', selectionButtonEnabled: true, documentContextCharacters: 40_000, attachmentMaxBytes: 5 * 1024 * 1024, siteDenylist: [] });
    await conversations.save(conversation('old-a', 20));
    await conversations.save(conversation('old-b', 15));
    await conversations.save(conversation('recent', 2));

    expect((await retention.cleanup()).deletedIds).toEqual(['old-b', 'old-a']);
    expect((await conversations.list()).map((item) => item.id)).toEqual(['recent']);
  });

  it('keeps no-persistence conversations while active and removes them after the tab session closes', async () => {
    const { conversations, preferences, bindings, retention } = setup();
    await preferences.save({ retentionDays: 0, pageAccessMode: 'active-tab', selectionButtonEnabled: true, documentContextCharacters: 40_000, attachmentMaxBytes: 5 * 1024 * 1024, siteDenylist: [] });
    await conversations.save(conversation('active', 0));
    await bindings.save({ tabId: 7, conversationId: 'active', pageUrl: 'https://example.com', navigationKey: 'nav-1', updatedAt: NOW });

    await retention.cleanup();
    expect(await conversations.get('active')).toBeDefined();

    await bindings.remove(7);
    await retention.cleanup();
    expect(await conversations.get('active')).toBeUndefined();
  });

  it('previews a shorter retention change and applies it only after confirmation', async () => {
    const { conversations, preferences, retention } = setup();
    await conversations.save(conversation('old', 20));
    const preview = await retention.setRetention(7, { confirmed: false });

    expect(preview).toMatchObject({ requiresConfirmation: true, affectedCount: 1 });
    expect((await preferences.get()).retentionDays).toBe(30);
    expect(await conversations.get('old')).toBeDefined();

    const applied = await retention.setRetention(7, { confirmed: true });
    expect(applied).toMatchObject({ requiresConfirmation: false, affectedCount: 1 });
    expect((await preferences.get()).retentionDays).toBe(7);
    expect(await conversations.get('old')).toBeUndefined();
  });

  it('clears every unpinned conversation and its tab binding while preserving pinned history', async () => {
    const { conversations, bindings, retention } = setup();
    await conversations.save(conversation('ordinary-a', 1));
    await conversations.save(conversation('ordinary-b', 2));
    await conversations.save(conversation('pinned', 3, true));
    await conversations.save(conversation('active', 4));
    await bindings.save({ tabId: 9, conversationId: 'active', pageUrl: 'https://example.com', navigationKey: 'nav', updatedAt: NOW });

    expect((await retention.clearUnpinned()).deletedIds).toEqual(['ordinary-a', 'ordinary-b', 'active']);
    expect((await conversations.list()).map((item) => item.id)).toEqual(['pinned']);
    expect(await bindings.get(9)).toBeUndefined();
  });
});
