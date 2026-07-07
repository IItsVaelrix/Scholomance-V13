import React, { useEffect, useRef } from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import type { AudioAnalysis } from './editor/core/audio-analysis';
import { renderDarkStarFrame } from './geometry/darkStarRenderer';
import analysisRaw from './dark-star-mirror.analysis.json';

const analysis = analysisRaw as unknown as AudioAnalysis;

export interface DarkStarMirrorVisualizerProps {
  /** Caption text shown in the lower-third caption zone. Leave empty for none. */
  caption?: string;
}

export function DarkStarMirrorVisualizer({ caption = '' }: DarkStarMirrorVisualizerProps) {
  const frame = useCurrentFrame();
  const { width, height, fps, durationInFrames } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bloomRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderDarkStarFrame({ ctx, width, height, frame, fps, audioAnalysis: analysis });

    const bloomCanvas = bloomRef.current;
    if (bloomCanvas) {
      const bloomCtx = bloomCanvas.getContext('2d');
      if (bloomCtx) {
        bloomCtx.clearRect(0, 0, width, height);
        bloomCtx.drawImage(canvas, 0, 0);
      }
    }
  }, [frame, width, height, fps]);

  const opacity = interpolate(
    frame,
    [0, 30, durationInFrames - 30, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const driftX = Math.sin(frame / 20) * 8;
  const driftY = Math.cos(frame / 25) * 6;
  const rotate = Math.sin(frame / 35) * 0.5;
  const scale = 1.05;

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Audio src={staticFile('audio/dark-star-mirror.wav')} />

      {/* SVG Filter for Chromatic Aberration */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <filter id="aberration">
          <feOffset in="SourceGraphic" dx="-4" dy="0" result="red-shift" />
          <feOffset in="SourceGraphic" dx="4" dy="0" result="blue-shift" />
          <feOffset in="SourceGraphic" dx="0" dy="0" result="green-shift" />
          <feColorMatrix in="red-shift" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red" />
          <feColorMatrix in="green-shift" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green" />
          <feColorMatrix in="blue-shift" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue" />
          <feBlend mode="screen" in="red" in2="green" result="rg" />
          <feBlend mode="screen" in="rg" in2="blue" />
        </filter>
      </svg>

      <div style={{
        position: 'absolute', 
        inset: 0, 
        opacity, 
        transform: `translate(${driftX}px, ${driftY}px) rotate(${rotate}deg) scale(${scale})`
      }}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          style={{ 
            position: 'absolute',
            inset: 0,
            width: '100%', 
            height: '100%', 
            display: 'block',
            filter: 'url(#aberration) saturate(1.35) contrast(1.15) brightness(1.1)' 
          }}
        />

        {/* Bloom Canvas */}
        <canvas
          ref={bloomRef}
          width={width}
          height={height}
          style={{ 
            position: 'absolute',
            inset: 0,
            width: '100%', 
            height: '100%', 
            display: 'block',
            mixBlendMode: 'screen',
            filter: 'blur(24px) saturate(1.5)' 
          }}
        />

        {/* Cinematic Vignette Overlay */}
        <div 
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at center, rgba(0,0,0,0) 40%, rgba(0,0,0,0.75) 100%)',
            pointerEvents: 'none',
            zIndex: 4,
            mixBlendMode: 'multiply'
          }}
        />

        {/* VHS / CRT Overlay from DivWand */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.22) 50%), ' +
              'linear-gradient(90deg, rgba(255, 0, 0, 0.04), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.04))',
            backgroundSize: '100% 4px, 6px 100%',
            pointerEvents: 'none',
            zIndex: 5,
            opacity: 0.12,
          }}
        />

        {/* Animated Film Grain */}
        <div 
          style={{
            position: 'absolute',
            inset: '-10%',
            width: '120%',
            height: '120%',
            pointerEvents: 'none',
            zIndex: 6,
            opacity: 0.08,
            mixBlendMode: 'overlay',
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            transform: `translate(${(frame * 13) % 20}px, ${(frame * 17) % 20}px)`,
          }}
        />

      {/* ════════════════════════ CAPTION ZONE ════════════════════════
          Add caption text here. Two ways:
            1) Pass a `caption` prop via the Composition's defaultProps in
               src/video/Root.tsx (e.g. defaultProps={{ caption: 'Dark Star' }}).
            2) For TIMED captions, replace the `caption` value below with a
               frame-based lookup, e.g.:
                 const line = CAPTIONS.find(c => frame >= c.from && frame < c.to)?.text ?? '';
               then render {line} instead of {caption}.
          The zone sits in the lower third, inside the canvas border safe area. */}
      {caption ? (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '8%',
            transform: 'translateX(-50%)',
            maxWidth: '74%',
            textAlign: 'center',
            fontFamily: "'Georgia', serif",
            fontSize: 44,
            lineHeight: 1.4,
            color: '#f1e7c8',
            letterSpacing: '0.01em',
            padding: '16px 32px',
            background:
              'linear-gradient(180deg, rgba(8,10,18,0) 0%, rgba(8,10,18,0.55) 60%, rgba(8,10,18,0.7) 100%)',
            borderTop: '1px solid rgba(197,162,111,0.4)',
            textShadow:
              '0 2px 14px rgba(0,0,0,0.9), 0 0 26px rgba(99,102,241,0.35)',
            pointerEvents: 'none',
          }}
        >
          {caption}
        </div>
      ) : null}
      {/* ══════════════════════ END CAPTION ZONE ══════════════════════ */}
      </div>
    </AbsoluteFill>
  );
}
