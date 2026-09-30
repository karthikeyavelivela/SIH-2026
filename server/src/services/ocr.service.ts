import { env } from '../config/env';

/**
 * OCR for KYC pre-checks, with tesseract.js (English, Telugu, Hindi).
 *
 * Off unless DOC_OCR_ENABLED=true: the engine is heavy, it downloads its
 * language data on first use, and a deploy should choose to run it. When it is
 * off, or anything goes wrong, callers get null and the upload simply has no
 * pre-check; the reviewer is unaffected.
 *
 * One recognition at a time, each in its own short-lived worker, so a busy
 * moment queues rather than piling up engines in a small server's memory.
 */
export const OCR_TIMEOUT_MS = 30_000;
export const OCR_LANGS = 'eng+tel+hin';

export interface OcrResult {
  text: string;
  /** 0-100, tesseract's own mean confidence. */
  confidence: number;
}

export function ocrEnabled(): boolean {
  return env.DOC_OCR_ENABLED === true;
}

let queue: Promise<unknown> = Promise.resolve();

export async function recognizeImage(image: Buffer, langs: string = OCR_LANGS): Promise<OcrResult | null> {
  if (!ocrEnabled()) return null;
  const run = queue.then(() => recognizeNow(image, langs));
  queue = run.catch(() => undefined);
  return run.catch(() => null);
}

async function recognizeNow(image: Buffer, langs: string): Promise<OcrResult> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(langs, 1, env.OCR_LANG_PATH ? { langPath: env.OCR_LANG_PATH } : {});
  try {
    const result = await Promise.race([
      worker.recognize(image),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('ocr_timeout')), OCR_TIMEOUT_MS)),
    ]);
    return { text: result.data.text ?? '', confidence: result.data.confidence ?? 0 };
  } finally {
    await worker.terminate().catch(() => undefined);
  }
}
