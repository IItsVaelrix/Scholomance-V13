import { AbsoluteFill } from 'remotion';
import type {
  TimelineClip,
  ClipTransitionBinding,
  LegacyClipTransitionBinding,
} from '../core/video-project-packet';

interface TransitionRendererProps {
  fromClip: TimelineClip;
  toClip: TimelineClip;
  transition: ClipTransitionBinding | LegacyClipTransitionBinding;
  frame: number;
  overlapStart: number;
  overlapEnd: number;
  durationFrames: number;
}

function deterministicJitter(transitionId: string, frame: number, salt: string) {
  const input = `${transitionId}:${frame}:${salt}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (((hash >>> 0) / 0xffffffff) - 0.5) * 80;
}

export function TransitionRenderer({
  transition,
  frame,
  overlapStart,
  overlapEnd,
  durationFrames,
}: TransitionRendererProps) {
  if (frame < overlapStart || frame > overlapEnd) return null;

  const t = Math.max(0, Math.min(1, (frame - overlapStart) / Math.max(1, durationFrames)));

  switch (transition.transitionId) {
    case 'wipe-left': {
      // Hide the cut at t=0.5 with a full black sweep.
      const w = t < 0.5 ? t * 200 : (1 - t) * 200;
      return (
        <AbsoluteFill style={{ zIndex: 50, pointerEvents: 'none', justifyContent: 'center', alignItems: 'flex-end' }}>
          <div style={{ position: 'absolute', top: 0, right: 0, width: `${Math.min(100, w)}%`, height: '100%', backgroundColor: 'black' }} />
        </AbsoluteFill>
      );
    }
    case 'dip-to-color': {
      const color = (transition.params?.color as string) || 'black';
      const opacity = t < 0.5 ? t * 2 : 2 - t * 2;
      return (
        <AbsoluteFill style={{ backgroundColor: color, opacity, zIndex: 50, pointerEvents: 'none' }} />
      );
    }
    case 'glitch': {
      const opacity = t < 0.5 ? t * 2 : 2 - t * 2;
      const x1 = deterministicJitter(transition.id, frame, 'x1');
      const y1 = deterministicJitter(transition.id, frame, 'y1');
      const x2 = deterministicJitter(transition.id, frame, 'x2');
      const y2 = deterministicJitter(transition.id, frame, 'y2');
      return (
        <AbsoluteFill style={{ zIndex: 50, pointerEvents: 'none', opacity, mixBlendMode: 'difference' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'cyan', transform: `translate3d(${x1}px, ${y1}px, 0)` }} />
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'red', transform: `translate3d(${x2}px, ${y2}px, 0)` }} />
        </AbsoluteFill>
      );
    }
    case 'crossfade':
    default: {
      const fade = Math.sin(t * Math.PI); 
      return (
        <AbsoluteFill style={{ backgroundColor: 'black', opacity: fade, zIndex: 50, pointerEvents: 'none' }} />
      );
    }
  }
}
