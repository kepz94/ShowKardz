import { useEffect, useState } from 'react';
import { getPhoto } from '../lib/photos';
import { photoState, type PhotoState } from '../lib/attachments';

/**
 * A receipt photo, which lives only on the device that took it.
 *
 * Three outcomes, and the difference matters to the user: the image is here,
 * it was taken on another device, or the read failed. A blank square says none
 * of those, so none of them is rendered as a blank square.
 */
export function PhotoThumb({ photoId, alt }: { photoId: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<PhotoState | 'loading'>('loading');

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    getPhoto(photoId)
      .then((blob) => {
        if (cancelled) return;
        if (!blob) {
          setState(photoState(photoId, false));
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setState('local');
      })
      .catch(() => {
        if (!cancelled) setState('elsewhere');
      });

    // Object URLs pin the blob in memory until they are released.
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoId]);

  if (state === 'local' && url) return <img className="thumb" src={url} alt={alt} />;

  return (
    <span className={`thumb absent${state === 'loading' ? ' loading' : ''}`}
          title={state === 'loading' ? 'Loading the photo' : 'This photo is on another device'}
          aria-label={state === 'loading' ? 'Loading the photo' : 'Photo is on another device'}>
      {state === 'loading' ? '' : 'Other device'}
    </span>
  );
}
