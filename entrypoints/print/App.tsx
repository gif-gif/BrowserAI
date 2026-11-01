import { useEffect, useState } from 'react';
import { SafeMarkdown } from '../../components/chat/SafeMarkdown';
import { takePrintJob, type PrintJob } from '../../core/export/print-export';
import { useI18n } from '../../shared/i18n/I18nProvider';
import './print.css';

interface PrintAppProps {
  /** Injected in tests. */
  loadJob?: (id: string) => Promise<PrintJob | undefined>;
  print?: () => void;
}

/**
 * “Export PDF”: renders one answer with print styles and opens Chrome's print dialog, where the user
 * picks “Save as PDF”. Chrome's own renderer handles CJK text, tables and code without bundled fonts.
 */
export default function App({ loadJob = takePrintJob, print = () => window.print() }: PrintAppProps) {
  const { messages } = useI18n();
  const [job, setJob] = useState<PrintJob | null | undefined>(undefined);

  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    let cancelled = false;
    void (id ? loadJob(id) : Promise.resolve(undefined))
      .catch(() => undefined)
      .then((loaded) => { if (!cancelled) setJob(loaded ?? null); });
    return () => { cancelled = true; };
  }, [loadJob]);

  useEffect(() => {
    if (!job) return;
    // Chrome suggests the document title as the PDF file name.
    document.title = job.title;
    const timer = setTimeout(print, 300);
    return () => clearTimeout(timer);
  }, [job, print]);

  if (job === undefined) return <main className="print-page"><p className="print-page__status">{messages.printPreparing}</p></main>;
  if (job === null) return <main className="print-page"><p className="print-page__status" role="alert">{messages.printJobMissing}</p></main>;

  return (
    <main className="print-page">
      <div className="print-page__toolbar">
        <span>{messages.printSaveAsPdfHint}</span>
        <button type="button" onClick={print}>{messages.printSaveAsPdf}</button>
      </div>
      <article className="print-page__content">
        <SafeMarkdown content={job.content} />
      </article>
    </main>
  );
}
