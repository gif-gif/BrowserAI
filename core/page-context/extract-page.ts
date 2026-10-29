import { Readability } from '@mozilla/readability';
import type { ContextLimits, ExtractedPageContext } from '../../shared/types/context';
import { createNavigationKey } from './navigation-key';
import { sanitizeText } from './sanitize-text';
import { truncatePageContext } from './truncate-context';

const DEFAULT_READABILITY_MINIMUM_CHARACTERS = 200;
const NON_CONTENT_SELECTORS = [
  'script',
  'style',
  'noscript',
  'template',
  'input',
  'textarea',
  'select',
  'option',
  'button',
].join(',');

export interface ExtractPageContextOptions {
  document: Document;
  tabId: number;
  limits: ContextLimits;
  selectionText?: string;
  navigationKey?: string;
  readabilityMinimumCharacters?: number;
  now?: () => number;
  createSnapshotId?: () => string;
}

function newSnapshotId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `snapshot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function textFromBody(document: Document): string {
  const body = document.body;
  if (!body) return '';
  const innerText = (body as HTMLElement).innerText;
  return typeof innerText === 'string' ? innerText : body.textContent ?? '';
}

function cloneForExtraction(document: Document): Document {
  const clone = document.cloneNode(true) as Document;
  clone.querySelectorAll(NON_CONTENT_SELECTORS).forEach((element) => element.remove());
  return clone;
}

export function extractPageContext(options: ExtractPageContextOptions): ExtractedPageContext {
  const {
    document,
    tabId,
    limits,
    selectionText,
    readabilityMinimumCharacters = DEFAULT_READABILITY_MINIMUM_CHARACTERS,
    now = Date.now,
    createSnapshotId = newSnapshotId,
  } = options;

  const sourceUrl = document.location?.href ?? '';
  const extractionDocument = cloneForExtraction(document);
  const readable = new Readability(extractionDocument).parse();
  const readableText = sanitizeText(readable?.textContent);
  const fallbackText = sanitizeText(textFromBody(extractionDocument));
  const useReadability = readableText.length >= readabilityMinimumCharacters;
  const documentText = useReadability ? readableText : fallbackText;
  const cleanTitle = sanitizeText(document.title || readable?.title || '');
  const cleanSelection = sanitizeText(selectionText);
  const truncated = truncatePageContext(
    {
      title: cleanTitle,
      ...(cleanSelection ? { selection: cleanSelection } : {}),
      ...(documentText ? { document: documentText } : {}),
    },
    limits,
  );

  return {
    snapshotId: createSnapshotId(),
    tabId,
    title: truncated.title.text,
    url: sourceUrl,
    ...(sanitizeText(document.documentElement.lang || readable?.lang)
      ? { language: sanitizeText(document.documentElement.lang || readable?.lang) }
      : {}),
    ...(truncated.selection?.text ? { selection: { text: truncated.selection.text } } : {}),
    ...(truncated.document?.text
      ? {
          document: {
            text: truncated.document.text,
            ...(sanitizeText(readable?.excerpt) ? { excerpt: sanitizeText(readable?.excerpt) } : {}),
            ...(sanitizeText(readable?.byline) ? { byline: sanitizeText(readable?.byline) } : {}),
            ...(sanitizeText(readable?.siteName) ? { siteName: sanitizeText(readable?.siteName) } : {}),
            extractionMethod: useReadability ? 'readability' as const : 'innerText' as const,
          },
        }
      : {}),
    metadata: {
      extractedAt: now(),
      ...truncated.metadata,
      navigationKey: options.navigationKey ?? createNavigationKey(sourceUrl),
    },
  };
}
