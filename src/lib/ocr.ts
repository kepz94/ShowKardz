/**
 * On-device card reading. Free, no API key, no account, no per-scan cost.
 *
 * Tesseract runs in a worker in the browser, so the card image never leaves the
 * phone — which fits this app's shape: photos are device-local by decision
 * (ADR-001), and now the reading of them is too.
 *
 * Everything is self-hosted from /ocr/ rather than a CDN: the engine and the
 * language data are ~12 MB, fetched once on first use and then cached by the
 * browser. A CDN would be smaller to ship and one more thing to be down.
 *
 * The engine is loaded lazily and kept alive between cards — startup is the
 * expensive part, and a dealer scanning a stack pays it once.
 */
import { pickCardText, type CardRead, type VisionAnnotation } from './vision';

type TesseractWorker = {
  recognize: (
    image: Blob,
    options?: Record<string, unknown>,
    output?: Record<string, boolean>,
  ) => Promise<{ data: TesseractData }>;
  terminate: () => Promise<unknown>;
};

interface Bbox { x0: number; y0: number; x1: number; y1: number }
interface TesseractLine { text?: string; bbox?: Bbox; confidence?: number }
interface TesseractData {
  text?: string;
  lines?: TesseractLine[];
  blocks?: { paragraphs?: { lines?: TesseractLine[] }[] }[] | null;
}

const BASE = `${import.meta.env.BASE_URL}ocr`;

let workerPromise: Promise<TesseractWorker> | null = null;

/** One worker for the whole session: starting it is what costs seconds. */
function getWorker(): Promise<TesseractWorker> {
  workerPromise ??= (async () => {
    const { createWorker } = await import('tesseract.js');
    return await createWorker('eng', 1, {
      workerPath: `${BASE}/worker.min.js`,
      corePath: `${BASE}/`,
      langPath: BASE,
      // The self-hosted language file is not gzipped; saying so avoids a
      // failed .gz fetch on every load.
      gzip: false,
    }) as unknown as TesseractWorker;
  })();
  return workerPromise;
}

/** Release the engine — worth doing when leaving the scan screen for good. */
export async function releaseReader(): Promise<void> {
  const pending = workerPromise;
  if (!pending) return;
  workerPromise = null;
  try {
    (await pending).terminate();
  } catch { /* already gone */ }
}

/** Tesseract lines carry a bbox; pickCardText wants Vision-shaped vertices. */
function toAnnotations(data: TesseractData): VisionAnnotation[] {
  const fromBlocks = (data.blocks ?? [])
    .flatMap((b) => b?.paragraphs ?? [])
    .flatMap((p) => p?.lines ?? []);
  const lines = (data.lines?.length ? data.lines : fromBlocks) ?? [];

  return lines
    .filter((l) => (l.text ?? '').trim() !== '')
    .map((l) => {
      const b = l.bbox;
      return {
        description: (l.text ?? '').trim(),
        boundingPoly: b
          ? { vertices: [
              { x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 },
              { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 },
            ] }
          : undefined,
      };
    });
}

export class OcrError extends Error {}

/**
 * How long a single card gets before the read is abandoned.
 *
 * Measured, not guessed: a clean high-contrast card reads in about a second,
 * while a low-contrast foil image can run past sixty with no sign of stopping —
 * layout analysis finds endless structure in gradient noise. Tesseract offers no
 * way to cancel a running job, so the only way out is to destroy the worker.
 */
export const READ_TIMEOUT_MS = 15000;

export class OcrTimeout extends OcrError {
  constructor() {
    super('This one is taking too long to read — usually foil or low contrast');
  }
}

/** Read the printed text off a card image, entirely on this device. */
export async function readCardOnDevice(blob: Blob): Promise<CardRead> {
  let worker: TesseractWorker;
  try {
    worker = await getWorker();
  } catch {
    // A failed engine load must not poison every later attempt.
    workerPromise = null;
    throw new OcrError('The card reader could not start on this device');
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // blocks is OFF by default, and without it the response carries only a
    // flat text string — no per-line boxes, so nothing to choose a name by
    // printed size. Asking for it is what makes the extraction possible.
    const job = worker.recognize(blob, {}, { text: true, blocks: true });

    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new OcrTimeout()), READ_TIMEOUT_MS);
    });

    const { data } = await Promise.race([job, timeout]);
    return pickCardText(toAnnotations(data));
  } catch (err) {
    if (err instanceof OcrTimeout) {
      // The job keeps running inside the worker and would burn the phone's
      // battery for nothing, so the worker is destroyed rather than reused.
      void releaseReader();
      throw err;
    }
    throw new OcrError('That photo could not be read');
  } finally {
    clearTimeout(timer);
  }
}
