export interface ContextLimits {
  titleCharacters: number;
  selectionCharacters: number;
  documentCharacters: number;
}

export interface ExtractedPageContext {
  snapshotId: string;
  tabId: number;
  title: string;
  url: string;
  language?: string;
  selection?: { text: string };
  document?: {
    text: string;
    excerpt?: string;
    byline?: string;
    siteName?: string;
    extractionMethod: 'readability' | 'innerText';
  };
  metadata: {
    extractedAt: number;
    originalCharacterCount: number;
    submittedCharacterCount: number;
    truncated: boolean;
    navigationKey: string;
  };
}
