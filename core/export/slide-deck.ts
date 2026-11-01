import { z } from 'zod';

export const MAX_DECK_SLIDES = 30;
export const MAX_SLIDE_BULLETS = 8;

/** The outline a model writes inside a ```slides block; the side panel turns it into a .pptx file. */
export interface SlideDeck {
  title: string;
  subtitle?: string;
  slides: Array<{ title: string; bullets: string[]; notes?: string }>;
}

const text = (max: number) => z.string().trim().min(1).transform((value) => value.slice(0, max));
const optionalText = (max: number) => z.string().optional().transform((value) => value?.trim().slice(0, max) || undefined);

const slideDeckSchema = z.object({
  title: text(200),
  subtitle: optionalText(300),
  slides: z.array(z.object({
    title: text(200),
    bullets: z.array(z.string()).optional().transform((items) => (items ?? [])
      .map((item) => item.trim().slice(0, 500))
      .filter(Boolean)
      .slice(0, MAX_SLIDE_BULLETS)),
    notes: optionalText(4_000),
  })).min(1).transform((slides) => slides.slice(0, MAX_DECK_SLIDES)),
});

// A ```slides block, or a ```json block whose object has a "slides" array. An unclosed block runs to the end.
const DECK_BLOCK = /```(slides|json)[^\S\n]*\n([\s\S]*?)(```|$)/g;

export interface SlideDeckSplit {
  /** Markdown before the outline block. */
  before: string;
  /** Markdown after the outline block. */
  after: string;
  /** Undefined when the block is still streaming or its JSON is invalid. */
  deck?: SlideDeck;
  /** True when the block has no closing fence yet. */
  open: boolean;
}

export function parseSlideDeck(json: string): SlideDeck | undefined {
  try {
    const result = slideDeckSchema.safeParse(JSON.parse(json));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

/** Finds the slide outline in an answer; returns undefined when the answer has none. */
export function splitSlideDeck(content: string): SlideDeckSplit | undefined {
  for (const match of content.matchAll(DECK_BLOCK)) {
    const [block, language, body = '', closingFence] = match;
    const open = !closingFence;
    if (language === 'json' && !/"slides"\s*:/.test(body)) continue;
    const start = match.index ?? 0;
    return {
      before: content.slice(0, start).trimEnd(),
      after: content.slice(start + block.length).trimStart(),
      deck: open ? undefined : parseSlideDeck(body),
      open,
    };
  }
  return undefined;
}

/** A file name safe on every OS, from the deck title. */
export function deckFileName(title: string, extension: string): string {
  // eslint-disable-next-line no-control-regex
  const base = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return `${base || 'slides'}.${extension}`;
}

/** The deck as Markdown, so the print page shows it as headings and bullet lists. */
export function slideDeckToMarkdown(deck: SlideDeck): string {
  return [
    `# ${deck.title}`,
    ...(deck.subtitle ? [deck.subtitle] : []),
    ...deck.slides.map((slide) => [`## ${slide.title}`, ...slide.bullets.map((bullet) => `- ${bullet}`)].join('\n')),
  ].join('\n\n');
}

/** Replaces a finished outline block with readable Markdown; other content is returned unchanged. */
export function replaceSlideDeckWithMarkdown(content: string): string {
  const split = splitSlideDeck(content);
  if (!split?.deck) return content;
  return [split.before, slideDeckToMarkdown(split.deck), split.after].filter(Boolean).join('\n\n');
}
