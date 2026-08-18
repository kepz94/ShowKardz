/**
 * Receipt photos, made small enough to keep.
 *
 * A modern phone camera produces 3–8 MB per shot. A show weekend of receipts at
 * that size would blow past any browser storage budget, and none of that detail
 * is needed to read a total off a slip of paper — so every photo is redrawn to
 * a bounded long edge and re-encoded as JPEG before it is ever stored.
 */

/** The long edge every stored receipt photo is fitted into. */
export const MAX_EDGE = 1400;
const JPEG_QUALITY = 0.72;

export interface Size {
  width: number;
  height: number;
}

/**
 * Fit within a bounding square, preserving aspect ratio and never upscaling.
 * A dimension never rounds to zero — a 1px sliver is still an image, a 0px one
 * throws in canvas.
 */
export function fitWithin(width: number, height: number, max: number): Size {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };

  const scale = max / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Decode an image file.
 *
 * createImageBitmap is the fast path, but it is picky about formats and a photo
 * library holds whatever the phone has accumulated — screenshots, saved images,
 * things that arrived over messaging. An <img> element decodes a wider set, so
 * it stands behind the fast path rather than the upload simply failing.
 */
async function decode(file: File): Promise<{
  source: CanvasImageSource; width: number; height: number; release: () => void;
}> {
  try {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap, width: bitmap.width, height: bitmap.height,
      release: () => bitmap.close(),
    };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return {
        source: img, width: img.naturalWidth, height: img.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      };
    } catch {
      URL.revokeObjectURL(url);
      throw new Error('That file is not an image this device can read');
    }
  }
}

/** Read a photo, screenshot or uploaded image; shrink it; hand back a JPEG. */
export async function downscale(file: File): Promise<Blob> {
  const decoded = await decode(file);
  const { width, height } = fitWithin(decoded.width, decoded.height, MAX_EDGE);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    decoded.release();
    throw new Error('Could not prepare the image on this device');
  }
  ctx.drawImage(decoded.source, 0, 0, width, height);
  decoded.release();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  if (!blob) throw new Error('Could not prepare the image on this device');
  return blob;
}
