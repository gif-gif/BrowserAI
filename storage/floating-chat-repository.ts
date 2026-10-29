import { STORAGE_KEYS } from '../shared/constants/storage-keys';
import {
  DEFAULT_FLOATING_CHAT_LAYOUT,
  isFloatingChatLayout,
  type FloatingChatLayout,
} from '../shared/types/floating-chat';
import type { StorageArea } from './storage-area';

/**
 * Which tabs show the in-page floating chat (session storage, so a service-worker restart keeps
 * it but a browser restart, which reuses tab ids, does not) and the last position and size.
 */
export class FloatingChatRepository {
  constructor(
    private readonly session: StorageArea,
    private readonly local: StorageArea,
  ) {}

  async openTabs(): Promise<number[]> {
    const tabs = await this.session.get<unknown>(STORAGE_KEYS.floatingChatTabs);
    return Array.isArray(tabs) ? tabs.filter((tabId): tabId is number => Number.isInteger(tabId)) : [];
  }

  async isOpen(tabId: number): Promise<boolean> {
    return (await this.openTabs()).includes(tabId);
  }

  async markOpen(tabId: number): Promise<void> {
    const tabs = await this.openTabs();
    if (!tabs.includes(tabId)) await this.session.set(STORAGE_KEYS.floatingChatTabs, [...tabs, tabId]);
  }

  /** Returns whether the tab was showing the floating chat. */
  async markClosed(tabId: number): Promise<boolean> {
    const tabs = await this.openTabs();
    if (!tabs.includes(tabId)) return false;
    await this.session.set(STORAGE_KEYS.floatingChatTabs, tabs.filter((item) => item !== tabId));
    return true;
  }

  async getLayout(): Promise<FloatingChatLayout> {
    const layout = await this.local.get<unknown>(STORAGE_KEYS.floatingChatLayout);
    return isFloatingChatLayout(layout) ? layout : DEFAULT_FLOATING_CHAT_LAYOUT;
  }

  async saveLayout(layout: FloatingChatLayout): Promise<void> {
    await this.local.set(STORAGE_KEYS.floatingChatLayout, layout);
  }
}
