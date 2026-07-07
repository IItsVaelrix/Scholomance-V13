import React, { useEffect, useRef } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';

interface ChromaKeyProps {
  src: string;
  keyColor: string; // e.g. '#00ff00'
  threshold: number; // 0-1
  softness: number; // 0-1
  spillSuppression: number; // 0-1
  despillColor?: string;
  style?: React.CSSProperties;
}

export const ChromaKey: React.FC<ChromaKeyProps> = ({
  src,
  keyColor,
  threshold = 0.4,
  softness = 0.1,
  spillSuppression = 0.5,
  despillColor = '#ffffff',
  style,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const processFrame = () => {
      if (video.readyState < 2) {
        requestAnimationFrame(processFrame);
        return;
      }

      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Parse key color
      const key = hexToRgb(keyColor);
      if (!key) return;

      const thresh = threshold * 255;
      const soft = softness * 255;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Distance to key color (simple Euclidean in RGB, can be improved with YUV)
        const dist = Math.sqrt(
          Math.pow(r - key.r, 2) +
          Math.pow(g - key.g, 2) +
          Math.pow(b - key.b, 2)
        );

        let alpha = 1;

        if (dist < thresh) {
          alpha = 0;
        } else if (dist < thresh + soft) {
          alpha = (dist - thresh) / soft;
        }

        // Spill suppression (desaturate towards despill color if green dominant)
        if (spillSuppression > 0 && g > r && g > b) {
          const spillFactor = Math.min(1, (g - Math.max(r, b)) / 50) * spillSuppression;
          const despill = hexToRgb(despillColor) || { r: 255, g: 255, b: 255 };

          data[i] = Math.round(r * (1 - spillFactor) + despill.r * spillFactor);
          data[i + 1] = Math.round(g * (1 - spillFactor) + despill.g * spillFactor);
          data[i + 2] = Math.round(b * (1 - spillFactor) + despill.b * spillFactor);
        }

        data[i + 3] = Math.round(255 * alpha);
      }

      ctx.putImageData(imageData, 0, 0);
    };

    const interval = setInterval(() => {
      // Sync video time roughly with Remotion frame
      if (video) {
        video.currentTime = (frame / fps) % (video.duration || 10);
      }
      processFrame();
    }, 1000 / 30); // ~30fps processing

    // Also listen to video events
    const handleLoaded = () => {
      processFrame();
    };
    video.addEventListener('loadeddata', handleLoaded);

    return () => {
      clearInterval(interval);
      video.removeEventListener('loadeddata', handleLoaded);
    };
  }, [src, keyColor, threshold, softness, spillSuppression, despillColor, frame, fps]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', ...style }}>
      <video
        ref={videoRef}
        src={src}
        style={{ display: 'none' }}
        muted
        playsInline
        crossOrigin="anonymous"
      />
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
    </div>
  );
};

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}
