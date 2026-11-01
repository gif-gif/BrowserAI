import { STORAGE_KEYS } from '../../shared/constants/storage-keys';

/** What the print page renders: an answer's Markdown and the title used for the saved PDF. */
export interface PrintJob {
  title: string;
  content: string;
  createdAt: number;
}

const PRINT_JOB_TTL_MS = 10 * 60_000;

function isPrintJob(value: unknown): value is PrintJob {
  const candidate = value as Partial<PrintJob> | null;
  return typeof candidate?.title === 'string'
    && typeof candidate.content === 'string'
    && typeof candidate.createdAt === 'number';
}

/**
 * Hands an answer to the print page through chrome.storage.session, which the extension pages share
 * and Chrome clears on restart, so nothing is kept on disk.
 */
export async function savePrintJob(id: string, job: PrintJob): Promise<void> {
  await browser.storage.session.set({ [`${STORAGE_KEYS.printJobPrefix}${id}`]: job });
}

/** Reads and removes the job; a missing, damaged or stale job yields undefined. */
export async function takePrintJob(id: string, now = Date.now()): Promise<PrintJob | undefined> {
  const key = `${STORAGE_KEYS.printJobPrefix}${id}`;
  const stored = await browser.storage.session.get(key);
  await browser.storage.session.remove(key);
  const job = stored[key];
  if (!isPrintJob(job) || now - job.createdAt > PRINT_JOB_TTL_MS) return undefined;
  return job;
}

/** The first heading or line of an answer, used as the PDF's file name. */
export function printTitle(content: string, fallback: string): string {
  const line = content.split('\n').map((item) => item.replace(/^#+\s*|[*_`>]/g, '').trim()).find(Boolean);
  return (line ?? fallback).slice(0, 80);
}
