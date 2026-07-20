import { VideoTemplateDefinition, VideoProjectPacketV1, VideoAssetRecord, createEmptyProject } from './video-project-packet';
import { AudioReactivityAdapter } from './audio-reactivity-adapter';

export type { VideoTemplateDefinition } from './video-project-packet';

/** Registry of available templates */
const templates: VideoTemplateDefinition[] = [];

export function registerTemplate(def: VideoTemplateDefinition) {
  templates.push(def);
}

export function getAllTemplates(): VideoTemplateDefinition[] {
  return templates;
}

export function getTemplate(id: string): VideoTemplateDefinition | undefined {
  return templates.find(t => t.id === id);
}

// ==========================================
// BUILT-IN TEMPLATES (Phase 2)
// ==========================================

// 1. Lyric Video Template
registerTemplate({
  id: 'lyric-video',
  name: 'Lyric Video',
  description: 'Audio + timed text lines over a background. Great for songs.',
  requiredAssets: [
    { id: 'audio', kind: 'audio', label: 'Audio Track', required: true },
    { id: 'background', kind: 'image', label: 'Background Image / Video', required: false },
  ],
  createProjectPacket: (input: Record<string, VideoAssetRecord>): VideoProjectPacketV1 => {
    const p = createEmptyProject('Lyric Video');
    if (input.audio) {
      p.assets.push(input.audio);
    }
    if (input.background) {
      p.assets.push(input.background);
    }
    return p;
  },
});

// 2. Music Visualizer
registerTemplate({
  id: 'music-visualizer',
  name: 'Music Visualizer',
  description: 'Audio reactive bars + centered logo / text.',
  requiredAssets: [
    { id: 'audio', kind: 'audio', label: 'Audio', required: true },
    { id: 'logo', kind: 'image', label: 'Center Logo / PixelBrain', required: false },
  ],
  createProjectPacket: (input: Record<string, VideoAssetRecord>): VideoProjectPacketV1 => {
    const p = createEmptyProject('Music Visualizer');
    if (input.audio) {
      p.assets.push(input.audio);
    }
    if (input.logo) {
      p.assets.push(input.logo);
    }
    return p;
  },
});

// 3. Windows 98 Visualizer
registerTemplate({
  id: 'win98-visualizer',
  name: 'Windows 98 Visualizer',
  description: 'Nostalgic reactive hallways and UI frames.',
  requiredAssets: [
    { id: 'audio', kind: 'audio', label: 'Audio', required: true },
    { id: 'background', kind: 'image', label: 'Wallpaper', required: false },
  ],
  createProjectPacket: (input: Record<string, VideoAssetRecord>): VideoProjectPacketV1 => {
    let p = createEmptyProject('Windows 98 Visualizer');
    const durationFrames = 900; 

    if (input.audio) p.assets.push(input.audio);
    if (input.background) p.assets.push(input.background);

    if (input.audio) {
      p.timeline.tracks[0].clips.push({
        id: 'clip-audio', trackId: 't-audio-1', assetId: input.audio.id, kind: 'audio',
        startFrame: 0, durationFrames, opacity: { defaultValue: 1 },
        transform: { position: { x: { defaultValue: 0 }, y: { defaultValue: 0 } }, scale: { x: { defaultValue: 1 }, y: { defaultValue: 1 } }, rotation: { defaultValue: 0 }, anchor: { x: 0.5, y: 0.5 } },
        effects: [], transitions: [], keyframes: []
      });
    }

    p.timeline.tracks[1].clips.push({
      id: 'clip-bg', trackId: 't-vbg-1', assetId: input.background?.id, kind: input.background ? 'image' : 'solid',
      startFrame: 0, durationFrames, opacity: { defaultValue: 1 },
      transform: { position: { x: { defaultValue: 0 }, y: { defaultValue: 0 } }, scale: { x: { defaultValue: 1 }, y: { defaultValue: 1 } }, rotation: { defaultValue: 0 }, anchor: { x: 0.5, y: 0.5 } },
      metadata: input.background ? undefined : { color: '#008080' },
      effects: [], transitions: [], keyframes: []
    });

    p.timeline.tracks[2].clips.push({
      id: 'clip-win98-ui', trackId: 't-text-1', kind: 'template',
      metadata: { templateType: 'win98-window', text: 'PLAYING...' },
      startFrame: 0, durationFrames, opacity: { defaultValue: 1 },
      transform: { position: { x: { defaultValue: 0 }, y: { defaultValue: 0 } }, scale: { x: { defaultValue: 1 }, y: { defaultValue: 1 } }, rotation: { defaultValue: 0 }, anchor: { x: 0.5, y: 0.5 } },
      effects: [], transitions: [], keyframes: []
    });

    if (input.audio && input.audio.audioAnalysis) {
      p = AudioReactivityAdapter.applyAudioReactivity(p, {
        id: 'bind-win98-scale', sourceAssetId: input.audio.id, targetRef: { kind: 'clip', clipId: 'clip-win98-ui' },
        targetPath: 'transform.scale.x', feature: 'beat', scale: 0.05, offset: 1.0
      }, durationFrames);

      p = AudioReactivityAdapter.applyAudioReactivity(p, {
        id: 'bind-win98-scale-y', sourceAssetId: input.audio.id, targetRef: { kind: 'clip', clipId: 'clip-win98-ui' },
        targetPath: 'transform.scale.y', feature: 'beat', scale: 0.05, offset: 1.0
      }, durationFrames);
    }

    return p;
  },
});
