/**
 * VideoProjectPacket-v1
 * Canonical state for Scholomance Remotion Forge.
 * Packet is the edit. Remotion is the renderer.
 * All deterministic. No Date.now / Math.random in render paths.
 */

export const VIDEO_PROJECT_SCHEMA = 'scholomance.video.project.v1' as const;

export type VideoFormat = 'mp4' | 'webm' | 'mov' | 'gif' | 'png-sequence';

export interface CanvasSpec {
  width: number;
  height: number;
  fps: number;
  durationFrames: number;
  backgroundColor: string;
}

export interface TimelineSnappingConfig {
  enabled: boolean;
  beatSnap: boolean;
  frameSnap: boolean;
}

export interface TimelineMarker {
  id: string;
  frame: number;
  label?: string;
  color?: string;
}

export type TrackType =
  | 'video'
  | 'audio'
  | 'image'
  | 'text'
  | 'shape'
  | 'pixelbrain'
  | 'adjustment'
  | 'solid';

export interface TimelineTrack {
  id: string;
  name: string;
  type: TrackType;
  locked: boolean;
  muted: boolean;
  visible: boolean;
  height: number;
  order: number;
  clips: TimelineClip[];
}

export type ClipKind =
  | 'video'
  | 'audio'
  | 'image'
  | 'text'
  | 'shape'
  | 'solid'
  | 'pixelbrain'
  | 'template'
  | 'adjustment';

export interface AnimatableNumber {
  defaultValue: number;
  keyframes?: Keyframe[];
}

export interface TransformState {
  position: {
    x: AnimatableNumber;
    y: AnimatableNumber;
  };
  scale: {
    x: AnimatableNumber;
    y: AnimatableNumber;
  };
  rotation: AnimatableNumber;
  anchor: {
    x: number;
    y: number;
  };
}

export interface Keyframe {
  frame: number;
  value: number;
  easing:
    | 'linear'
    | 'easeIn'
    | 'easeOut'
    | 'easeInOut'
    | 'hold'
    | 'spring'
    | 'bounce'
    | 'customBezier';
  bezier?: [number, number, number, number];
  interpolation?: 'number' | 'angle' | 'color' | 'vector';
}

export interface EffectInstance {
  id: string;
  effectId: string;
  enabled: boolean;
  order: number;
  params: Record<string, AnimatableNumber | string | boolean | number>;
}

export interface EffectKeyframe {
  frame: number;
  param: string;
  value: number | string | boolean;
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'step';
}

export interface VideoEffectBinding {
  id: string;
  effectId:
    | 'blur'
    | 'color-grade'
    | 'crop'
    | 'mask'
    | 'tint'
    | 'dissolve'
    | 'chroma-key'
    | 'audio-reactive';
  enabled: boolean;
  order: number;
  params: Record<string, unknown>;
  keyframes?: EffectKeyframe[];
}

export interface LegacyClipTransitionBinding {
  id: string;
  transitionId: 'crossfade' | 'wipe-left' | 'dip-to-color' | 'glitch';
  side: 'in' | 'out';
  durationFrames: number;
  params: Record<string, unknown>;
}

export interface ClipTransitionBinding {
  id: string;
  transitionId: 'crossfade' | 'wipe-left' | 'dip-to-color' | 'glitch';
  fromClipId: string;
  toClipId: string;
  durationFrames: number;
  overlapPolicy?: 'explicit-overlap' | 'auto-overlap' | 'reject-gap';
  params: Record<string, unknown>;
}

export interface TimelineClip {
  id: string;
  trackId: string;
  assetId?: string;
  kind: ClipKind;

  startFrame: number;
  durationFrames: number;
  sourceStartFrame?: number;
  sourceDurationFrames?: number;

  transform: TransformState;
  opacity: AnimatableNumber;
  volume?: AnimatableNumber; // for audio clips, 0-1
  effects: (EffectInstance | VideoEffectBinding)[];
  transitions: (ClipTransitionBinding | LegacyClipTransitionBinding)[];

  keyframes: KeyframeTrack[]; // per-property tracks (future expansion)

  metadata?: Record<string, unknown>;
}

export interface KeyframeTrack {
  property: string; // e.g. "transform.position.x" | "opacity"
  keyframes: Keyframe[];
}

export interface VideoAssetRecord {
  id: string;
  kind: 'video' | 'audio' | 'image' | 'pixelbrain';
  url: string;
  originalUrl?: string;
  proxyUrl?: string;
  hash: string;
  status: 'processing' | 'ready' | 'failed';
  width?: number;
  height?: number;
  durationFrames?: number;
  fps?: number;
  aspectRatio?: string;
  analysisId?: string;
  diagnostics?: string[];
}

export interface AudioAnalysisRecord {
  id: string;
  assetId: string;
  fps: number;
  sourceHash: string;
  channels: {
    rms: number[];
    bass?: number[];
    mid?: number[];
    treble?: number[];
  };
}

export interface PixelBrainLayerClip {
  id: string;
  type: 'pixelbrain';
  startFrame: number;
  durationFrames: number;
  packet: unknown;
  packetContract:
    | 'PixelBrainAssetPacket'
    | 'pixelbrain.render.v1'
    | 'pixelbrain.export.v1';
  effects?: VideoEffectBinding[];
}

export interface VideoTemplateDefinition {
  id: string;
  name: string;
  description: string;
  requiredAssets: Array<{
    id: string;
    kind: 'video' | 'audio' | 'image' | 'pixelbrain';
    label: string;
    required: boolean;
  }>;
  createProjectPacket(input: Record<string, VideoAssetRecord>): VideoProjectPacketV1;
}

export interface AssetRecord {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'pixelbrain' | 'text' | 'solid';
  name: string;
  url?: string; // browser url or public path
  // For pixelbrain: the canonical packet reference (not raster)
  pixelBrainPacket?: unknown;
  durationFrames?: number;
  width?: number;
  height?: number;
  metadata?: Record<string, unknown>;
  // Audio analysis for Phase 8 reactivity
  audioAnalysis?: {
    bpm?: number;
    beats: number[];           // frame indices where beats occur
    rms: number[];             // RMS volume per window (0-1), length ~ durationFrames / window
    windowSize: number;        // frames per rms sample
    duration: number;          // seconds
  };
}

export interface AppliedTemplateRecord {
  id: string;
  templateId: string;
  resolvedPlaceholders: Record<string, string>;
}

export interface RenderSettings {
  format: VideoFormat;
  codec?: string;
  bitrate?: string;
  audioCodec?: string;
  quality?: number;
}

export interface VideoDiagnostic {
  category: 'SCHEMA' | 'ASSET' | 'TIMELINE' | 'KEYFRAME' | 'EFFECT' | 'RENDER' | 'EXPORT' | 'AUDIO' | 'PIXELBRAIN';
  severity: 'INFO' | 'WARN' | 'CRIT' | 'FATAL';
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface VideoProjectPacketV1 {
  schema: typeof VIDEO_PROJECT_SCHEMA;
  projectId: string;
  title: string;

  canvas: CanvasSpec;

  timeline: {
    tracks: TimelineTrack[];
    markers: TimelineMarker[];
    snapping: TimelineSnappingConfig;
  };

  assets: (AssetRecord | VideoAssetRecord)[];

  templates: AppliedTemplateRecord[];

  renderSettings: RenderSettings;

  metadata: {
    createdAt?: string;
    updatedAt?: string;
    generator: 'scholomance-remotion-forge';
    version: string;
  };

  diagnostics: VideoDiagnostic[];
}

export function createEmptyProject(title = 'Untitled Project'): VideoProjectPacketV1 {
  const now = new Date().toISOString();
  return {
    schema: VIDEO_PROJECT_SCHEMA,
    projectId: `vproj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    canvas: {
      width: 1920,
      height: 1080,
      fps: 30,
      durationFrames: 30 * 30, // 30s default
      backgroundColor: '#050505',
    },
    timeline: {
      tracks: [
        { id: 't-audio-1', name: 'Audio', type: 'audio', locked: false, muted: false, visible: true, height: 48, order: 0, clips: [] },
        { id: 't-vbg-1', name: 'Visual', type: 'image', locked: false, muted: false, visible: true, height: 64, order: 1, clips: [] },
        { id: 't-text-1', name: 'Lyrics/Text', type: 'text', locked: false, muted: false, visible: true, height: 64, order: 2, clips: [] },
        { id: 't-pb-1', name: 'PixelBrain', type: 'pixelbrain', locked: false, muted: false, visible: true, height: 64, order: 3, clips: [] },
      ],
      markers: [],
      snapping: { enabled: true, beatSnap: true, frameSnap: true },
    },
    assets: [],
    templates: [],
    renderSettings: {
      format: 'mp4',
      quality: 90,
    },
    metadata: {
      createdAt: now,
      updatedAt: now,
      generator: 'scholomance-remotion-forge',
      version: '1.0.0',
    },
    diagnostics: [],
  };
}

export function validateVideoProjectPacket(v: unknown): v is VideoProjectPacketV1 {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  if (p.schema !== VIDEO_PROJECT_SCHEMA) return false;
  if (typeof p.projectId !== 'string') return false;
  if (typeof p.title !== 'string') return false;
  if (!p.canvas || typeof p.canvas !== 'object') return false;
  const c = p.canvas as Record<string, unknown>;
  if (typeof c.width !== 'number' || c.width <= 0) return false;
  if (typeof c.height !== 'number' || c.height <= 0) return false;
  if (typeof c.fps !== 'number' || c.fps <= 0) return false;
  if (typeof c.durationFrames !== 'number' || c.durationFrames <= 0) return false;

  if (!p.timeline || typeof p.timeline !== 'object') return false;
  const t = p.timeline as Record<string, unknown>;
  if (!Array.isArray(t.tracks)) return false;
  if (!Array.isArray(t.markers)) return false;

  if (!Array.isArray(p.assets)) return false;
  if (!Array.isArray(p.templates)) return false;
  if (!p.renderSettings || typeof p.renderSettings !== 'object') return false;
  if (!p.metadata || typeof p.metadata !== 'object') return false;

  return true;
}

export function normalizeProject(p: VideoProjectPacketV1): VideoProjectPacketV1 {
  // Ensure stable ordering, clamp values, fill defaults. Pure function.
  const tracks = [...p.timeline.tracks]
    .sort((a, b) => a.order - b.order)
    .map((track, idx) => ({
      ...track,
      order: idx,
      clips: [...track.clips].sort((a, b) => a.startFrame - b.startFrame),
    }));

  return {
    ...p,
    timeline: {
      ...p.timeline,
      tracks,
    },
    diagnostics: p.diagnostics.filter((d) => d.severity !== 'FATAL'), // fatal are surfaced separately
  };
}

export function addDiagnostic(
  project: VideoProjectPacketV1,
  diag: VideoDiagnostic
): VideoProjectPacketV1 {
  return {
    ...project,
    diagnostics: [...project.diagnostics, diag],
    metadata: { ...project.metadata, updatedAt: new Date().toISOString() },
  };
}
