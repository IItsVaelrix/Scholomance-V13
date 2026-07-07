import React, { useEffect, useRef } from 'react';
import { useCurrentFrame, useVideoConfig, AbsoluteFill } from 'remotion';
import type { AudioAnalysis } from './editor/core/audio-analysis';
import type { SchoolId } from './geometry/schoolPalette';
import { renderMandalaFrame } from './geometry/mandalaRenderer';

export interface SacredGeometryVisualizerProps {
  audioAnalysis?: AudioAnalysis;
  schoolId?: SchoolId;
}

export function SacredGeometryVisualizer({
  audioAnalysis,
  schoolId = 'default',
}: SacredGeometryVisualizerProps) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderMandalaFrame({ ctx, width, height, frame, fps, audioAnalysis, schoolId });
  }, [frame, width, height, fps, audioAnalysis, schoolId]);

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </AbsoluteFill>
  );
}
