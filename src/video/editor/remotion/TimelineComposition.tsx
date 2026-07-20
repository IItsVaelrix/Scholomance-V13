import React, { Suspense, lazy } from 'react';
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import type {
  ClipTransitionBinding,
  LegacyClipTransitionBinding,
  VideoProjectPacketV1,
  TimelineClip,
  TimelineTrack,
} from '../core/video-project-packet';
import { ClipRenderer } from './ClipRenderer';
import { EffectStackRenderer } from './EffectStackRenderer';
import { getValueAtFrame } from '../core/keyframe-engine';
import { TransitionRenderer } from './TransitionRenderer';

const PixelBrainLayerRenderer = lazy(() => import('./PixelBrainLayerRenderer').then(m => ({ default: m.PixelBrainLayerRenderer })));

interface TimelineCompositionProps {
  project: VideoProjectPacketV1;
}

/**
 * Phase 3 — Remotion Render Compiler
 * The packet is compiled into a Remotion composition tree.
 *
 * Structure:
 *   TimelineComposition
 *     ├─ Audio sources (top level)
 *     └─ Tracks (by order)
 *          └─ Clips (as Sequences)
 *               └─ EffectStackRenderer (transform + opacity + future effects)
 *                    └─ ClipRenderer (source content)
 */
export function TimelineComposition({ project }: TimelineCompositionProps) {
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();

  const canvas = project.canvas;
  const background = canvas.backgroundColor || '#050505';

  // Sort tracks (lower order = rendered first = background layers)
  const sortedTracks = [...project.timeline.tracks]
    .sort((a, b) => a.order - b.order)
    .filter((t) => t.visible);

  // Mount audio clips at the root level with correct source timing.
  // Audio respects its own Sequence window + sourceStartFrame.
  const audioElements = project.timeline.tracks.flatMap((track) =>
    track.clips
      .filter((c) => c.kind === 'audio' && c.assetId)
      .map((clip) => {
        const asset = project.assets.find((a) => a.id === clip.assetId);
        if (!asset?.url) return null;

        const sourceStart = clip.sourceStartFrame ?? 0;
        const vol = getValueAtFrame(
          clip.volume ?? { defaultValue: 1 },
          frame
        );

        return (
          <Sequence
            key={`audio-${clip.id}`}
            from={clip.startFrame}
            durationInFrames={clip.durationFrames}
          >
            <Audio
              src={asset.url}
              startFrom={sourceStart}
              volume={Math.max(0, Math.min(1, vol))}
            />
          </Sequence>
        );
      })
  );

  return (
    <AbsoluteFill
      style={{
        width,
        height,
        background,
        overflow: 'hidden',
      }}
    >
      {/* Audio layer — always on top in the composition sense */}
      {audioElements}

      {/* Visual tracks */}
      {sortedTracks.map((track) => (
        <TrackRenderer key={track.id} track={track} project={project} frame={frame} />
      ))}

      {/* Basic transition support (Phase 5) - simple crossfade on overlaps */}
      {renderBasicTransitions(project, frame)}

      {/* Dev HUD */}
      {import.meta.env.DEV && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 12,
            color: '#64748b',
            opacity: 0.65,
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        >
          FORGE • F:{frame} / {canvas.durationFrames} • {project.title}
        </div>
      )}
    </AbsoluteFill>
  );
}

function TrackRenderer({
  track,
  project,
  frame,
}: {
  track: TimelineTrack;
  project: VideoProjectPacketV1;
  frame: number;
}) {
  if (!track.visible) return null;

  return (
    <>
      {track.clips.map((clip) => (
        <Sequence
          key={clip.id}
          from={clip.startFrame}
          durationInFrames={clip.durationFrames}
        >
          <ClipWrapper clip={clip} project={project} globalFrame={frame} />
        </Sequence>
      ))}
    </>
  );
}

/**
 * ClipWrapper applies the effect stack (transform/opacity + registered effects)
 * around the actual source content.
 */
function ClipWrapper({
  clip,
  project,
  globalFrame,
}: {
  clip: TimelineClip;
  project: VideoProjectPacketV1;
  globalFrame: number;
}) {
  const isActive = globalFrame >= clip.startFrame && globalFrame < clip.startFrame + clip.durationFrames;
  if (!isActive) return null;

  if (clip.kind === 'pixelbrain') {
    const asset = project.assets.find((a) => a.id === clip.assetId);
    return (
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <EffectStackRenderer clip={clip} frame={globalFrame} project={project}>
          <Suspense fallback={null}>
            <PixelBrainLayerRenderer packet={asset?.pixelBrainPacket} />
          </Suspense>
        </EffectStackRenderer>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <EffectStackRenderer clip={clip} frame={globalFrame} project={project}>
        <ClipRenderer clip={clip} project={project} frame={globalFrame} />
      </EffectStackRenderer>
    </AbsoluteFill>
  );
}

/**
 * Basic crossfade transition support for Phase 5.
 * When multiple clips overlap on a track we composite a simple fade.
 */
function renderBasicTransitions(project: VideoProjectPacketV1, frame: number) {
  const result: React.ReactNode[] = [];

  for (const track of project.timeline.tracks) {
    if (!track.visible) continue;

    for (let i = 0; i < track.clips.length - 1; i++) {
      const fromClip = track.clips[i];
      const toClip = track.clips[i + 1];

      const isLegacy = (
        transition: LegacyClipTransitionBinding | ClipTransitionBinding,
      ): transition is LegacyClipTransitionBinding => 'side' in transition;
      const outTransition = fromClip.transitions?.find((transition) =>
        isLegacy(transition)
          ? transition.side === 'out'
          : transition.fromClipId === fromClip.id && transition.toClipId === toClip.id
      );
      const inTransition = toClip.transitions?.find((transition) =>
        isLegacy(transition)
          ? transition.side === 'in'
          : transition.fromClipId === fromClip.id && transition.toClipId === toClip.id
      );
      
      const transition = outTransition || inTransition;
      if (!transition) continue;

      const duration = Math.max(0, Math.round(transition.durationFrames));

      const overlapStart = Math.max(
        fromClip.startFrame + fromClip.durationFrames - duration,
        toClip.startFrame - duration
      );

      const overlapEnd = overlapStart + duration;

      if (frame >= overlapStart && frame <= overlapEnd) {
        result.push(
          <TransitionRenderer
            key={`trans-${transition.id}`}
            fromClip={fromClip}
            toClip={toClip}
            transition={transition}
            frame={frame}
            overlapStart={overlapStart}
            overlapEnd={overlapEnd}
            durationFrames={duration}
          />
        );
      }
    }
  }

  return result;
}
