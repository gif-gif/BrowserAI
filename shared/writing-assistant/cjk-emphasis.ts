/**
 * CommonMark only closes `**` when the run is right-flanking, so the common
 * model output `**摘要：**正文` (punctuation inside, CJK right after) stays as
 * literal asterisks. Moving the trailing punctuation outside the bold —
 * `**摘要**：正文` — lets it close while the text reads the same. Code is left
 * untouched.
 */
const CLOSING_AFTER_PUNCTUATION = /\*\*([^*\n]*?[^\s\p{P}\p{S}*])([\p{P}\p{S}]+)\*\*(?=[^\s\p{P}\p{S}])/gu;
const CODE = /(```[\s\S]*?```|`[^`\n]*`)/u;

export function fixCjkEmphasis(markdown: string): string {
  return markdown
    .split(CODE)
    .map((part, index) => (index % 2 === 1 ? part : part.replace(CLOSING_AFTER_PUNCTUATION, '**$1**$2')))
    .join('');
}
