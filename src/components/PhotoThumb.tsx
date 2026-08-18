import { useEffect, useState } from 'react';
import { getPhoto } from '../lib/photos';

/**
 * A stored receipt photo. The image lives in IndexedDB, so it arrives async and
 * may not arrive at all — a failed read leaves a placeholder rather than
 * breaking the expense row it belongs to.
 */
export function PhotoThumb({ photoId, alt }: { photoId: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;

    getPhoto(photoId)
      .then((blob) => {
        if (!blob || revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(null));

    // Object URLs pin the blob in memory until they are released.
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoId]);

  if (!url) return <span className="thumb" aria-hidden />;
  return <img className="thumb" src={url} alt={alt} />;
}
