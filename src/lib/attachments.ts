/**
 * Photos are device-local. Records sync; images do not.
 *
 * A receipt or card record carries only a photo ID. The image itself lives in
 * this device's IndexedDB and is never uploaded, which keeps the sync payload
 * small and costs nothing to run — the deliberate trade is that the image
 * exists on exactly one device and cannot be recovered if that device is lost.
 *
 * The consequence this module exists to handle: on any OTHER device the record
 * arrives with a photo ID that resolves to nothing. That is the normal state,
 * not a failure, and the UI has to say which of the three it is rather than
 * showing an unexplained empty box.
 */
export type PhotoState =
  /** The record never had a photo. */
  | 'none'
  /** The image is on this device and can be shown. */
  | 'local'
  /** A photo was taken, on a different device. Not lost, just not here. */
  | 'elsewhere';

export function photoState(photoId: string | undefined, heldLocally: boolean): PhotoState {
  if (!photoId) return 'none';
  return heldLocally ? 'local' : 'elsewhere';
}
