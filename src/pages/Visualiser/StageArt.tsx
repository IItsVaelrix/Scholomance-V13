import { useEffect, useState } from 'react';
import './StageArt.css';

export interface StageArtProps {
  /** Dedicated stage piece when present. */
  stageArtUrl?: string;
  /** Fallback when stageArtUrl is missing or fails to load. */
  coverUrl: string;
  title: string;
}

/**
 * Static stage image — full picture always visible; frame grows with the art.
 * No canvas, no RAF, no crop.
 */
export function StageArt({ stageArtUrl, coverUrl, title }: StageArtProps) {
  const preferred = (stageArtUrl || coverUrl || '').trim();
  const [src, setSrc] = useState(preferred);

  useEffect(() => {
    setSrc((stageArtUrl || coverUrl || '').trim());
  }, [stageArtUrl, coverUrl]);

  if (!src) {
    return (
      <div
        className="bcv-stage-art bcv-stage-art--empty"
        aria-hidden="true"
        title={title}
      />
    );
  }

  return (
    <div className="bcv-stage-art" aria-hidden="true">
      <img
        className="bcv-stage-art__img"
        src={src}
        alt=""
        draggable={false}
        decoding="async"
        onError={() => {
          if (stageArtUrl && src === stageArtUrl && coverUrl && coverUrl !== stageArtUrl) {
            setSrc(coverUrl);
            return;
          }
          setSrc('');
        }}
      />
    </div>
  );
}
