import React from 'react';
import type { TimelineClip, VideoProjectPacketV1 } from './video-project-packet';
import { getValueAtFrame } from './keyframe-engine';
import { ChromaKey } from '../remotion/ChromaKey';

export interface EffectParameterDefinition {
  id: string;
  label: string;
  type: 'number' | 'color' | 'boolean';
  min?: number;
  max?: number;
  step?: number;
  default: number | string | boolean;
}

export interface VideoEffectDefinition {
  id: string;
  name: string;
  category: 'transform' | 'color' | 'blur' | 'crop' | 'mask' | 'stylize' | 'utility' | 'keying';
  parameters: EffectParameterDefinition[];
  defaultParams: Record<string, any>;
  render: (input: EffectRenderInput) => React.ReactNode;
}

export interface EffectRenderInput {
  children: React.ReactNode;
  params: Record<string, any>; // evaluated values at current frame
  frame: number;
  clip: TimelineClip;
  project: VideoProjectPacketV1;
  localFrame: number; // frame relative to clip start
}

const effects: Record<string, VideoEffectDefinition> = {};

/** Register an effect. Called at module load. */
export function registerEffect(def: VideoEffectDefinition) {
  effects[def.id] = def;
}

export function getEffect(id: string): VideoEffectDefinition | undefined {
  return effects[id];
}

export function getAllEffects(): VideoEffectDefinition[] {
  return Object.values(effects);
}

/** Evaluate params that may contain keyframed values */
export function evaluateEffectParams(
  rawParams: Record<string, any>,
  frame: number
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(rawParams)) {
    if (val && typeof val === 'object' && 'defaultValue' in val) {
      result[key] = getValueAtFrame(val, frame);
    } else {
      result[key] = val;
    }
  }
  return result;
}

// ============================================
// BUILT-IN EFFECTS (Phase 5)
// ============================================

// 1. Fade (multiplicative opacity)
registerEffect({
  id: 'fade',
  name: 'Fade',
  category: 'transform',
  parameters: [
    { id: 'amount', label: 'Amount', type: 'number', min: 0, max: 1, step: 0.01, default: 1 },
  ],
  defaultParams: { amount: 1 },
  render: ({ children, params }) => {
    const a = Math.max(0, Math.min(1, params.amount ?? 1));
    return React.createElement('div', { style: { opacity: a, width: '100%', height: '100%' } }, children);
  },
});

// 2. Blur
registerEffect({
  id: 'blur',
  name: 'Gaussian Blur',
  category: 'blur',
  parameters: [
    { id: 'radius', label: 'Radius (px)', type: 'number', min: 0, max: 50, step: 0.5, default: 0 },
  ],
  defaultParams: { radius: 0 },
  render: ({ children, params }) => {
    const r = params.radius ?? 0;
    return React.createElement('div', { style: { filter: `blur(${r}px)`, width: '100%', height: '100%' } }, children);
  },
});

// 3. Brightness / Contrast / Saturate (color grade basic)
registerEffect({
  id: 'color-grade',
  name: 'Color Grade',
  category: 'color',
  parameters: [
    { id: 'brightness', label: 'Brightness', type: 'number', min: 0, max: 2, step: 0.01, default: 1 },
    { id: 'contrast', label: 'Contrast', type: 'number', min: 0, max: 2, step: 0.01, default: 1 },
    { id: 'saturate', label: 'Saturation', type: 'number', min: 0, max: 2, step: 0.01, default: 1 },
    { id: 'hue', label: 'Hue Rotate (deg)', type: 'number', min: -180, max: 180, step: 1, default: 0 },
  ],
  defaultParams: { brightness: 1, contrast: 1, saturate: 1, hue: 0 },
  render: ({ children, params }) => {
    const b = params.brightness ?? 1;
    const c = params.contrast ?? 1;
    const s = params.saturate ?? 1;
    const h = params.hue ?? 0;
    const filter = `brightness(${b}) contrast(${c}) saturate(${s}) hue-rotate(${h}deg)`;
    return React.createElement('div', { style: { filter, width: '100%', height: '100%' } }, children);
  },
});

// 4. Crop
registerEffect({
  id: 'crop',
  name: 'Crop',
  category: 'crop',
  parameters: [
    { id: 'left', label: 'Left %', type: 'number', min: 0, max: 100, step: 0.5, default: 0 },
    { id: 'top', label: 'Top %', type: 'number', min: 0, max: 100, step: 0.5, default: 0 },
    { id: 'right', label: 'Right %', type: 'number', min: 0, max: 100, step: 0.5, default: 0 },
    { id: 'bottom', label: 'Bottom %', type: 'number', min: 0, max: 100, step: 0.5, default: 0 },
  ],
  defaultParams: { left: 0, top: 0, right: 0, bottom: 0 },
  render: ({ children, params }) => {
    const l = params.left ?? 0;
    const t = params.top ?? 0;
    const r = params.right ?? 0;
    const b = params.bottom ?? 0;
    const clip = `rect(${t}% ${100 - r}% ${100 - b}% ${l}%)`;
    return React.createElement('div', { style: { clipPath: clip, width: '100%', height: '100%', overflow: 'hidden' } }, children);
  },
});

// 5. Tint (simple color overlay)
registerEffect({
  id: 'tint',
  name: 'Tint',
  category: 'color',
  parameters: [
    { id: 'color', label: 'Color', type: 'color', default: '#ff0000' },
    { id: 'amount', label: 'Amount', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
  ],
  defaultParams: { color: '#ff0000', amount: 0.5 },
  render: ({ children, params }) => {
    const amt = params.amount ?? 0.5;
    const color = params.color ?? '#ff0000';
    return React.createElement('div', { style: { position: 'relative', width: '100%', height: '100%' } },
      children,
      React.createElement('div', {
        style: {
          position: 'absolute',
          inset: 0,
          backgroundColor: color,
          opacity: amt,
          mixBlendMode: 'multiply',
          pointerEvents: 'none',
        }
      })
    );
  },
});

// 6. Pixel Dissolve (stylize / glitchy)
registerEffect({
  id: 'pixel-dissolve',
  name: 'Pixel Dissolve',
  category: 'stylize',
  parameters: [
    { id: 'amount', label: 'Amount', type: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'size', label: 'Pixel Size', type: 'number', min: 1, max: 32, step: 1, default: 4 },
  ],
  defaultParams: { amount: 0, size: 4 },
  render: ({ children, params, frame }) => {
    const amt = params.amount ?? 0;
    const size = params.size ?? 4;
    const seed = Math.floor(frame / 2) % 100;
    const opacity = amt;
    return React.createElement('div', { style: { position: 'relative', width: '100%', height: '100%' } },
      children,
      React.createElement('div', {
        style: {
          position: 'absolute',
          inset: 0,
          background: `repeating-conic-gradient(#000 ${size}px, transparent 0 ${size * 2}px)`,
          opacity,
          mixBlendMode: 'screen',
          transform: `translate(${seed % 3}px, ${Math.floor(seed / 3) % 3}px)`,
          pointerEvents: 'none',
        }
      })
    );
  },
});

// 7. Simple Mask (rect for now)
registerEffect({
  id: 'mask-rect',
  name: 'Rect Mask',
  category: 'mask',
  parameters: [
    { id: 'x', label: 'X %', type: 'number', min: 0, max: 100, default: 0 },
    { id: 'y', label: 'Y %', type: 'number', min: 0, max: 100, default: 0 },
    { id: 'w', label: 'Width %', type: 'number', min: 0, max: 100, default: 100 },
    { id: 'h', label: 'Height %', type: 'number', min: 0, max: 100, default: 100 },
    { id: 'feather', label: 'Feather', type: 'number', min: 0, max: 20, default: 0 },
  ],
  defaultParams: { x: 0, y: 0, w: 100, h: 100, feather: 0 },
  render: ({ children, params }) => {
    const { x = 0, y = 0, w = 100, h = 100, feather = 0 } = params;
    const clip = `inset(${y}% ${100 - x - w}% ${100 - y - h}% ${x}% round ${feather}px)`;
    return React.createElement('div', { style: { clipPath: clip, width: '100%', height: '100%', overflow: 'hidden' } }, children);
  },
});

// 8. Chroma Key / Green Screen (Phase 6)
registerEffect({
  id: 'chroma-key',
  name: 'Chroma Key',
  category: 'keying',
  parameters: [
    { id: 'keyColor', label: 'Key Color', type: 'color', default: '#00ff00' },
    { id: 'threshold', label: 'Threshold', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
    { id: 'softness', label: 'Softness', type: 'number', min: 0, max: 1, step: 0.01, default: 0.15 },
    { id: 'spillSuppression', label: 'Spill Suppression', type: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
  ],
  defaultParams: { keyColor: '#00ff00', threshold: 0.35, softness: 0.15, spillSuppression: 0.6 },
  render: ({ children, params, clip, project }) => {
    // Find the asset for video/image clips
    const asset = project.assets.find((a) => a.id === clip.assetId);
    const isVideoOrImage = clip.kind === 'video' || clip.kind === 'image';

    if (isVideoOrImage && asset?.url) {
      const keyCol = typeof params.keyColor === 'string' ? params.keyColor : (params.keyColor?.defaultValue || '#00ff00');
      const thresh = typeof params.threshold === 'number' ? params.threshold : (params.threshold?.defaultValue ?? 0.35);
      const soft = typeof params.softness === 'number' ? params.softness : (params.softness?.defaultValue ?? 0.15);
      const spill = typeof params.spillSuppression === 'number' ? params.spillSuppression : (params.spillSuppression?.defaultValue ?? 0.6);

      return React.createElement(ChromaKey, {
        src: asset.url,
        keyColor: keyCol,
        threshold: thresh,
        softness: soft,
        spillSuppression: spill,
        style: { width: '100%', height: '100%' },
      });
    }

    // Fallback: just return children
    return children;
  },
});

export { effects };