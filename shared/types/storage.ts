export type RetentionDays = 0 | 7 | 30 | 90 | -1;

export interface RetentionChangeResult {
  requiresConfirmation: boolean;
  affectedCount: number;
  retentionDays: RetentionDays;
}
export type PageAccessMode = 'active-tab' | 'all-sites';

export interface Preferences {
  retentionDays: RetentionDays;
  pageAccessMode: PageAccessMode;
  selectionButtonEnabled: boolean;
  documentContextCharacters: number;
  attachmentMaxBytes: number;
  siteDenylist: string[];
}

export interface TabSessionBinding {
  tabId: number;
  conversationId: string;
  pageUrl: string;
  navigationKey: string;
  updatedAt: number;
}
