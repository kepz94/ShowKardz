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

/** Read a camera or file-picker image, shrink it, hand back a storable JPEG. */
export async function downscale(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_EDGE);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare the photo on this device');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  if (!blob) throw new Error('Could not prepare the photo on this device');
  return blob;
}
