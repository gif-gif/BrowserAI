const ZERO_WIDTH_CODE_POINTS = new Set([0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]);
const HORIZONTAL_WHITESPACE = /[^\S\n]+/g;

function removeInvisibleCharacters(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    const isControl = codePoint <= 0x1f && codePoint !== 0x09 && codePoint !== 0x0a && codePoint !== 0x0d;
    return isControl || codePoint === 0x7f || ZERO_WIDTH_CODE_POINTS.has(codePoint) ? '' : character;
  }).join('');
}

/** Normalizes extracted page text without interpreting it as markup. */
export function sanitizeText(value: string | null | undefined): string {
  if (!value) return '';

  return removeInvisibleCharacters(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2028\u2029]/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(HORIZONTAL_WHITESPACE, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
