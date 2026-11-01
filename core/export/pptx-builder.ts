import type PptxGenJS from 'pptxgenjs';
import type { SlideDeck } from './slide-deck';

const PPTX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const FONT = 'Microsoft YaHei';
const INK = '202124';
const MUTED = '5F6368';

type PptxConstructor = new () => PptxGenJS;

/** Builds a 16:9 deck with a title slide and one bullet slide per outline entry. */
export async function buildPptx(
  deck: SlideDeck,
  accentColor: string,
  loadPptx: () => Promise<PptxConstructor> = async () => (await import('pptxgenjs')).default,
): Promise<Blob> {
  const Pptx = await loadPptx();
  const pptx = new Pptx();
  const accent = accentColor.replace('#', '').toUpperCase();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = deck.title;

  const cover = pptx.addSlide();
  cover.background = { color: 'FFFFFF' };
  cover.addShape('rect', { x: 0, y: 0, w: 0.28, h: 7.5, fill: { color: accent }, line: { color: accent } });
  cover.addText(deck.title, { x: 0.9, y: 2.4, w: 11.5, h: 1.4, fontFace: FONT, fontSize: 40, bold: true, color: INK, valign: 'bottom', fit: 'shrink' });
  if (deck.subtitle) {
    cover.addText(deck.subtitle, { x: 0.9, y: 3.95, w: 11.5, h: 1, fontFace: FONT, fontSize: 20, color: MUTED, valign: 'top', fit: 'shrink' });
  }

  deck.slides.forEach((item, index) => {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addShape('rect', { x: 0.6, y: 1.32, w: 1.2, h: 0.06, fill: { color: accent }, line: { color: accent } });
    slide.addText(item.title, { x: 0.6, y: 0.4, w: 12.1, h: 0.9, fontFace: FONT, fontSize: 28, bold: true, color: INK, valign: 'bottom', fit: 'shrink' });
    if (item.bullets.length) {
      slide.addText(
        item.bullets.map((bullet) => ({ text: bullet, options: { bullet: { indent: 18 }, breakLine: true } })),
        { x: 0.6, y: 1.65, w: 12.1, h: 5.2, fontFace: FONT, fontSize: 18, color: INK, valign: 'top', paraSpaceAfter: 10, fit: 'shrink' },
      );
    }
    slide.addText(String(index + 2), { x: 12.2, y: 6.95, w: 0.6, h: 0.3, fontFace: FONT, fontSize: 10, color: MUTED, align: 'right' });
    if (item.notes) slide.addNotes(item.notes);
  });

  const data = await pptx.write({ outputType: 'arraybuffer' }) as ArrayBuffer;
  return new Blob([data], { type: PPTX_MIME_TYPE });
}

/** Saves a Blob through a temporary link; needs no "downloads" permission. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
