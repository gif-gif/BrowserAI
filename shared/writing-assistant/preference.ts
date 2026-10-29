import { STORAGE_KEYS } from '../constants/storage-keys';

export const DEFAULT_WRITING_ASSISTANT_ENABLED = true;

export function resolveWritingAssistantEnabled(value: unknown): boolean {
  return typeof value === 'boolean' ? value : DEFAULT_WRITING_ASSISTANT_ENABLED;
}

export async function loadWritingAssistantEnabled(): Promise<boolean> {
  if (typeof browser === 'undefined' || !browser.storage?.local?.get) {
    return DEFAULT_WRITING_ASSISTANT_ENABLED;
  }

  const stored = await browser.storage.local.get(STORAGE_KEYS.writingAssistantEnabled);
  return resolveWritingAssistantEnabled(stored[STORAGE_KEYS.writingAssistantEnabled]);
}

export async function saveWritingAssistantEnabled(enabled: boolean): Promise<void> {
  if (typeof browser === 'undefined' || !browser.storage?.local?.set) return;
  await browser.storage.local.set({ [STORAGE_KEYS.writingAssistantEnabled]: enabled });
}
