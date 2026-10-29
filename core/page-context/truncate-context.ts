import type { ContextLimits } from '../../shared/types/context';

export interface TruncationMetadata {
  originalCharacterCount: number;
  submittedCharacterCount: number;
  truncated: boolean;
}

export interface TruncatedText {
  text: string;
  metadata: TruncationMetadata;
}

export interface PageContextTextInput {
  title: string;
  selection?: string;
  document?: string;
}

export interface TruncatedPageContext {
  title: TruncatedText;
  selection?: TruncatedText;
  document?: TruncatedText;
  metadata: TruncationMetadata;
}

function truncateText(text: string, limit: number): TruncatedText {
  const submitted = text.slice(0, limit);
  return {
    text: submitted,
    metadata: {
      originalCharacterCount: text.length,
      submittedCharacterCount: submitted.length,
      truncated: submitted.length < text.length,
    },
  };
}

export function truncatePageContext(
  input: PageContextTextInput,
  limits: ContextLimits,
): TruncatedPageContext {
  const title = truncateText(input.title, limits.titleCharacters);
  const selection = input.selection === undefined
    ? undefined
    : truncateText(input.selection, limits.selectionCharacters);
  const document = input.document === undefined
    ? undefined
    : truncateText(input.document, limits.documentCharacters);
  const parts = [title, selection, document].filter((part): part is TruncatedText => part !== undefined);

  return {
    title,
    ...(selection ? { selection } : {}),
    ...(document ? { document } : {}),
    metadata: {
      originalCharacterCount: parts.reduce((total, part) => total + part.metadata.originalCharacterCount, 0),
      submittedCharacterCount: parts.reduce((total, part) => total + part.metadata.submittedCharacterCount, 0),
      truncated: parts.some((part) => part.metadata.truncated),
    },
  };
}
