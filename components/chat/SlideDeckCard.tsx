import { useState } from 'react';
import { buildPptx, downloadBlob } from '../../core/export/pptx-builder';
import { deckFileName, type SlideDeck } from '../../core/export/slide-deck';
import { useI18n } from '../../shared/i18n/I18nProvider';
import { getTheme } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';

interface SlideDeckCardProps {
  /** Undefined while the outline is still streaming or when it could not be parsed. */
  deck?: SlideDeck;
  pending?: boolean;
  /** Injected in tests; defaults to building the .pptx and downloading it. */
  savePptx?: (deck: SlideDeck, accentColor: string) => Promise<void>;
}

async function buildAndDownload(deck: SlideDeck, accentColor: string): Promise<void> {
  downloadBlob(await buildPptx(deck, accentColor), deckFileName(deck.title, 'pptx'));
}

export function SlideDeckCard({ deck, pending = false, savePptx = buildAndDownload }: SlideDeckCardProps) {
  const { messages } = useI18n();
  const { theme } = useTheme();
  const [state, setState] = useState<'idle' | 'working' | 'failed'>('idle');

  if (!deck) {
    return (
      <div className={`slide-deck slide-deck--${pending ? 'pending' : 'invalid'}`} role={pending ? 'status' : 'alert'}>
        <span className="slide-deck__icon" aria-hidden="true">PPT</span>
        <span className="slide-deck__title">{pending ? messages.slidesGenerating : messages.slidesInvalid}</span>
      </div>
    );
  }

  async function download(current: SlideDeck) {
    setState('working');
    try {
      await savePptx(current, getTheme(theme).color);
      setState('idle');
    } catch {
      setState('failed');
    }
  }

  return (
    <section className="slide-deck" aria-label={messages.slidesDeck}>
      <span className="slide-deck__icon" aria-hidden="true">PPT</span>
      <span className="slide-deck__title">{deck.title}</span>
      <small className="slide-deck__meta">{state === 'failed' ? messages.pptxFailed : messages.slidesCount(deck.slides.length + 1)}</small>
      <ol className="slide-deck__outline">
        {deck.slides.map((slide, index) => <li key={index}>{slide.title}</li>)}
      </ol>
      <button
        type="button"
        className="slide-deck__download"
        aria-label={messages.downloadPptxFor(deck.title)}
        disabled={state === 'working'}
        onClick={() => { void download(deck); }}
      >
        {state === 'working' ? messages.downloadingPptx : messages.downloadPptx}
      </button>
    </section>
  );
}
