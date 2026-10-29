import {
  DEFAULT_CONTEXT_LIMITS,
  MAX_DOCUMENT_CONTEXT_CHARACTERS,
  MIN_DOCUMENT_CONTEXT_CHARACTERS,
} from '../shared/constants/context-limits';
import { STORAGE_KEYS } from '../shared/constants/storage-keys';
import {
  DEFAULT_ATTACHMENT_MAX_BYTES,
  MAX_ATTACHMENT_MAX_BYTES,
  MIN_ATTACHMENT_MAX_BYTES,
} from '../shared/constants/attachment-limits';
import type { Preferences } from '../shared/types/storage';
import type { StorageArea } from './storage-area';

export const DEFAULT_PREFERENCES: Preferences = {
  retentionDays: 30,
  pageAccessMode: 'active-tab',
  selectionButtonEnabled: true,
  documentContextCharacters: DEFAULT_CONTEXT_LIMITS.documentCharacters,
  attachmentMaxBytes: DEFAULT_ATTACHMENT_MAX_BYTES,
  siteDenylist: [],
};

export class PreferencesRepository {
  constructor(private readonly storage: StorageArea) {}

  async get(): Promise<Preferences> {
    const preferences = {
      ...DEFAULT_PREFERENCES,
      ...(await this.storage.get<Partial<Preferences>>(STORAGE_KEYS.preferences)),
    };
    if (
      !Number.isInteger(preferences.documentContextCharacters)
      || preferences.documentContextCharacters < MIN_DOCUMENT_CONTEXT_CHARACTERS
      || preferences.documentContextCharacters > MAX_DOCUMENT_CONTEXT_CHARACTERS
    ) {
      preferences.documentContextCharacters = DEFAULT_PREFERENCES.documentContextCharacters;
    }
    if (
      !Number.isInteger(preferences.attachmentMaxBytes)
      || preferences.attachmentMaxBytes < MIN_ATTACHMENT_MAX_BYTES
      || preferences.attachmentMaxBytes > MAX_ATTACHMENT_MAX_BYTES
    ) {
      preferences.attachmentMaxBytes = DEFAULT_PREFERENCES.attachmentMaxBytes;
    }
    return preferences;
  }

  async save(preferences: Preferences): Promise<void> {
    await this.storage.set(STORAGE_KEYS.preferences, preferences);
  }
}
