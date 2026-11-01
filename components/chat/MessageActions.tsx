import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../shared/i18n/I18nProvider';
import { savePrintJob, printTitle } from '../../core/export/print-export';
import { replaceSlideDeckWithMarkdown } from '../../core/export/slide-deck';

interface MessageActionsProps {
  content: string;
  retryUserMessageId?: string;
  onRetry?: (userMessageId: string) => void;
  copyText?: (text: string) => Promise<void>;
  /** Opens the print page for the answer; injected in tests. */
  exportPdf?: (content: string, fallbackTitle: string) => Promise<void>;
}

async function writeClipboard(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
  await navigator.clipboard.writeText(text);
}

/** Hands the answer to the print page, which opens Chrome's print dialog so the user can save a PDF. */
async function openPrintPage(content: string, fallbackTitle: string): Promise<void> {
  const id = globalThis.crypto?.randomUUID?.() ?? `print-${Date.now()}`;
  const markdown = replaceSlideDeckWithMarkdown(content);
  await savePrintJob(id, { title: printTitle(markdown, fallbackTitle), content: markdown, createdAt: Date.now() });
  // tabs.create needs no "tabs" permission.
  await browser.tabs.create({ url: browser.runtime.getURL(`/print.html#${id}`) });
}

function PdfIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M12 11v6M9.5 14.5 12 17l2.5-2.5" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.8 9a8 8 0 1 1-.45 4M4 5v4h4" />
    </svg>
  );
}

export function MessageActions({
  content,
  retryUserMessageId,
  onRetry,
  copyText = writeClipboard,
  exportPdf = openPrintPage,
}: MessageActionsProps) {
  const { messages } = useI18n();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [exportFailed, setExportFailed] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
  }, []);

  async function copy() {
    try {
      await copyText(content);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setCopyState('idle'), 2_000);
  }

  async function exportAsPdf() {
    setExportFailed(false);
    try {
      await exportPdf(content, messages.appName);
    } catch {
      setExportFailed(true);
    }
  }

  return (
    <footer className="message-actions" aria-label={messages.answerActions}>
      {content && (
        <button type="button" onClick={() => { void copy(); }} aria-label={messages.copyAnswer}>
          <CopyIcon />
          <span>{copyState === 'copied' ? messages.copied : copyState === 'failed' ? messages.copyFailed : messages.copy}</span>
        </button>
      )}
      {content && (
        <button type="button" onClick={() => { void exportAsPdf(); }} aria-label={messages.exportPdfAnswer}>
          <PdfIcon />
          <span>{exportFailed ? messages.exportPdfFailed : messages.exportPdf}</span>
        </button>
      )}
      {retryUserMessageId && onRetry && (
        <button
          type="button"
          aria-label={messages.retryAnswer}
          data-retry-message-id={retryUserMessageId}
          onClick={() => onRetry(retryUserMessageId)}
        >
          <RetryIcon />
          <span>{messages.retry}</span>
        </button>
      )}
    </footer>
  );
}
