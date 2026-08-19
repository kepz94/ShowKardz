/**
 * Google Cloud Vision, called straight from the browser.
 *
 * There is no server in this stack, so the request goes direct with an API key.
 * That key CANNOT be kept secret — anything the browser sends, a reader can
 * read. Two things bound the exposure instead, and both are console settings
 * rather than code:
 *
 *   1. an HTTP-referrer restriction, so the key only works from this app's
 *      domain;
 *   2. a quota cap on the Vision API, so even a bypassed restriction cannot
 *      run up a bill.
 *
 * The key is injected at build time from a repository secret, so it is not in
 * git history — but it IS in the published bundle, by necessity. Treat it as
 * public and rely on the two limits above.
 *
 * Free tier is 1,000 units per month; text detection is $1.50 per 1,000 after
 * that. One unit is one image.
 */
import { pickCardText, type CardRead, type VisionAnnotation } from './vision';

const ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';

/** Empty when the build had no key — the UI must say so rather than fail. */
export const VISION_KEY: string = import.meta.env.VITE_VISION_KEY ?? '';

export const visionConfigured = (): boolean => VISION_KEY !== '';

/** Blob → base64 payload, without the data: prefix Vision does not want. */
async function toBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // Chunked: a single spread over a few hundred thousand bytes blows the stack.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export class VisionError extends Error {}

/**
 * Read the printed text off a card image.
 *
 * TEXT_DETECTION rather than DOCUMENT_TEXT_DETECTION: a card is sparse text in
 * a picture, not a page of prose.
 */
export async function readCard(blob: Blob): Promise<CardRead> {
  if (!visionConfigured()) throw new VisionError('Card reading is not set up on this build');

  const body = {
    requests: [{
      image: { content: await toBase64(blob) },
      features: [{ type: 'TEXT_DETECTION', maxResults: 40 }],
    }],
  };

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(VISION_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new VisionError('No connection — read the card later, on wifi');
  }

  if (!response.ok) {
    // Surface what Google actually said: "referer blocked" and "quota exceeded"
    // need completely different fixes, and a generic failure hides which it is.
    let detail = `${response.status}`;
    try {
      const err = await response.json() as { error?: { message?: string } };
      if (err.error?.message) detail = err.error.message;
    } catch { /* keep the status */ }
    throw new VisionError(detail);
  }

  const data = await response.json() as {
    responses?: { textAnnotations?: VisionAnnotation[]; error?: { message?: string } }[];
  };
  const first = data.responses?.[0];
  if (first?.error?.message) throw new VisionError(first.error.message);

  // textAnnotations[0] is the whole block; the individual words follow.
  const annotations = (first?.textAnnotations ?? []).slice(1);
  return pickCardText(annotations);
}
