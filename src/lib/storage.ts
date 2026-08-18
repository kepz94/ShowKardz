/**
 * Device storage: how much is used, and whether the browser may throw it away.
 *
 * This matters more here than in most apps. Receipt photos live on this device
 * and nowhere else, so eviction is not a cache miss — it is the permanent loss
 * of the only copy.
 *
 * WebKit deletes all script-written storage for an origin with no user
 * interaction in seven days of browser use. Two things exempt an origin: being
 * installed to the Home Screen (which gets its own days-of-use counter), and
 * being granted persistence through navigator.storage.persist(). This module
 * asks for the second; the first is a product requirement in the SRD.
 */

export interface StorageReport {
  /** Bytes this origin is using, when the browser will say. */
  usageBytes: number | null;
  /** Bytes it is allowed, when the browser will say. */
  quotaBytes: number | null;
  /** True when the browser has promised not to evict this origin. */
  persisted: boolean;
  /** False when the browser does not implement the Storage API at all. */
  supported: boolean;
}

/**
 * Ask the browser not to evict this origin. Safe to call on every launch —
 * an origin already granted persistence simply reports true again.
 */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function readStorage(): Promise<StorageReport> {
  if (!navigator.storage?.estimate) {
    return { usageBytes: null, quotaBytes: null, persisted: false, supported: false };
  }
  try {
    const { usage, quota } = await navigator.storage.estimate();
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    return {
      usageBytes: usage ?? null,
      quotaBytes: quota ?? null,
      persisted,
      supported: true,
    };
  } catch {
    return { usageBytes: null, quotaBytes: null, persisted: false, supported: false };
  }
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** Sizes as a person reads them: no decimal unless it says something. */
export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value < 10 && unit > 0 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded} ${UNITS[unit]}`;
}
