/** A browser tab the user can mention with “@” in the composer. */
export interface TabCandidate {
  tabId: number;
  title: string;
  url: string;
  active: boolean;
  supported: boolean;
}

/** Minimal metadata returned after the background extracted another tab. Page text stays in the service worker. */
export interface TabContextSummary {
  tabId: number;
  snapshotId: string;
  title: string;
  url: string;
  truncated: boolean;
}

export interface MentionedTab {
  tabId: number;
  title: string;
  url: string;
  status: 'loading' | 'ready' | 'error';
  snapshotId?: string;
  truncated?: boolean;
  errorMessage?: string;
}
