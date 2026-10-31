import { STORAGE_KEYS } from '../shared/constants/storage-keys';
import type { StorageArea } from './storage-area';
import { DEFAULT_PREFERENCES } from './preferences-repository';
import { DEFAULT_NEW_CHAT_SHORTCUTS } from '../shared/new-chat-shortcuts/preference';
import { DEFAULT_APPEARANCE, isAppearancePreference } from '../shared/theme/appearance';
import { DEFAULT_FLOATING_CHAT_LAYOUT, isFloatingChatLayout } from '../shared/types/floating-chat';
import { PROVIDER_ENDPOINT_MODES, PROVIDER_TYPES, type ProviderType } from '../shared/types/provider';

const VERSION = 8;

export async function runMigrations(storage: StorageArea): Promise<void> {
  const current = (await storage.get<number>(STORAGE_KEYS.migrations)) ?? 0;
  if (current >= VERSION) return;
  if (current < 1) {
    const preferences = await storage.get(STORAGE_KEYS.preferences);
    if (!preferences) await storage.set(STORAGE_KEYS.preferences, DEFAULT_PREFERENCES);
  }
  if (current < 2) {
    // v2: user-defined “/” skills, kept as a list beside the other preferences.
    const skills = await storage.get(STORAGE_KEYS.skills);
    if (!Array.isArray(skills)) await storage.set(STORAGE_KEYS.skills, []);
  }
  if (current < 3) {
    // v3: provider configs gained a selectable request format (OpenAI-compatible or Anthropic Messages).
    // Configs saved earlier are all OpenAI-compatible; make the type and its endpoint explicit.
    const configs = await storage.get<unknown>(STORAGE_KEYS.providerConfigs);
    if (Array.isArray(configs)) {
      await storage.set(STORAGE_KEYS.providerConfigs, configs.map((config: unknown) => {
        if (!config || typeof config !== 'object') return config;
        const record = config as Record<string, unknown>;
        const type: ProviderType = PROVIDER_TYPES.includes(record.type as ProviderType)
          ? record.type as ProviderType
          : 'openai-compatible';
        return { ...record, type, endpointMode: PROVIDER_ENDPOINT_MODES[type] };
      }));
    }
  }
  if (current < 4) {
    // v4: 浏览技能 now mirrors Chrome's built-in skills. Saved skills, including copies of the old
    // catalog, start over so 您的技能 holds only what is added from the new catalog.
    await storage.set(STORAGE_KEYS.skills, []);
  }
  if (current < 5) {
    // v5: the new-conversation suggestions can be swapped for saved skills. Start from the four
    // built-in quick actions that were shown before.
    const shortcuts = await storage.get(STORAGE_KEYS.newChatShortcuts);
    if (!Array.isArray(shortcuts)) await storage.set(STORAGE_KEYS.newChatShortcuts, DEFAULT_NEW_CHAT_SHORTCUTS);
  }
  if (current < 6) {
    // v6: light / dark appearance beside the accent color. Everyone starts by following Chrome.
    const appearance = await storage.get(STORAGE_KEYS.appearancePreference);
    if (!isAppearancePreference(appearance)) await storage.set(STORAGE_KEYS.appearancePreference, DEFAULT_APPEARANCE);
  }
  if (current < 7) {
    // v7: the floating chat moved into the page; remember where the user put it and how big it is.
    const layout = await storage.get(STORAGE_KEYS.floatingChatLayout);
    if (!isFloatingChatLayout(layout)) await storage.set(STORAGE_KEYS.floatingChatLayout, DEFAULT_FLOATING_CHAT_LAYOUT);
  }
  if (current < 8) {
    // v8: every conversation uses the one Gateway in settings, so conversations no longer record their own.
    const conversations = await storage.get<unknown>(STORAGE_KEYS.conversations);
    if (Array.isArray(conversations)) {
      await storage.set(STORAGE_KEYS.conversations, conversations.map((conversation: unknown) => {
        if (!conversation || typeof conversation !== 'object') return conversation;
        const rest = { ...conversation as Record<string, unknown> };
        delete rest.providerId;
        return rest;
      }));
    }
  }
  await storage.set(STORAGE_KEYS.migrations, VERSION);
}
