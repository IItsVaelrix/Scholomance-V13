import React from 'react';
import type { TimelineClip, VideoProjectPacketV1 } from '../core/video-project-packet';
import { getValueAtFrame } from '../core/keyframe-engine';
import {
  getEffect,
  evaluateEffectParams,
  VideoEffectDefinition,
} from '../core/effect-registry';
import { getRmsAtFrame, getBeatPulse } from '../core/audio-analysis';

interface EffectStackRendererProps {
  clip: TimelineClip;
  frame: number;
  project: VideoProjectPacketV1;
  children: React.ReactNode;
}

/**
 * EffectStackRenderer (Phase 5)
 *
 * Applies built-in transform + opacity, then stacks registered effects
 * in the order defined on the clip.
 */
export function EffectStackRenderer({ clip, frame, project, children }: EffectStackRendererProps) {
  const posX = getValueAtFrame(clip.transform.position.x, frame);
  const posY = getValueAtFrame(clip.transform.position.y, frame);
  let scaleX = getValueAtFrame(clip.transform.scale.x, frame);
  let scaleY = getValueAtFrame(clip.transform.scale.y, frame);
  const rot = getValueAtFrame(clip.transform.rotation, frame, 'angle');
  let baseOpacity = getValueAtFrame(clip.opacity, frame);

  // Phase 8: Live audio reactivity (RMS drives scale, beat pulses opacity)
  const audioAsset = project.assets.find(a => a.kind === 'audio' && a.audioAnalysis);
  if (audioAsset?.audioAnalysis) {
    const rms = getRmsAtFrame(audioAsset.audioAnalysis, frame);
    const beat = getBeatPulse(audioAsset.audioAnalysis, frame, 10);

    // Subtle reactivity on scale if not heavily keyframed
    if (!clip.transform.scale.x.keyframes?.length || clip.transform.scale.x.keyframes.length < 3) {
      const mod = 1 + rms * 0.6 + beat * 0.3;
      scaleX *= mod;
      scaleY *= mod;
    }

    // Beat pulse on opacity
    if (!clip.opacity.keyframes?.length || clip.opacity.keyframes.length < 3) {
      baseOpacity = Math.min(1, baseOpacity * (0.6 + beat * 0.7));
    }
  }

  let content: React.ReactNode = children;

  // Apply registered effects in declared order
  const sortedEffects = [...(clip.effects || [])].sort((a, b) => a.order - b.order);

  for (const effInst of sortedEffects) {
    if (!effInst.enabled) continue;

    const def: VideoEffectDefinition | undefined = getEffect(effInst.effectId);
    if (!def) continue;

    const evaluatedParams = evaluateEffectParams(effInst.params || def.defaultParams, frame);

    const localFrame = frame - clip.startFrame;

    content = def.render({
      children: content,
      params: evaluatedParams,
      frame,
      clip,
      project,
      localFrame,
    });
  }

  const transform = `translate3d(${posX}px, ${posY}px, 0) scale(${scaleX}, ${scaleY}) rotate(${rot}deg)`;
  const origin = `${clip.transform.anchor.x * 100}% ${clip.transform.anchor.y * 100}%`;

  return (
    <div
      style={{
        transform,
        transformOrigin: origin,
        opacity: baseOpacity,
        willChange: 'transform, opacity',
        width: '100%',
        height: '100%',
        position: 'relative',
      }}
    >
      {content}
    </div>
  );
}
