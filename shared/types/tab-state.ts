import type { Conversation } from './chat';
import type { ExtractedPageContext } from './context';

export type PageContextState =
  | { status: 'preparing' }
  | { status: 'ready'; snapshot: ExtractedPageContext }
  | { status: 'changed'; previousSnapshotId?: string }
  | { status: 'unavailable'; reason: 'PAGE_UNSUPPORTED' | 'PAGE_PERMISSION_REQUIRED' | 'CONTEXT_EXTRACTION_FAILED'; message?: string; canAllowOnce?: boolean };

export interface ActiveTabState {
  tabId: number;
  url: string;
  navigationKey: string;
  conversation: Conversation;
  context: PageContextState;
}
