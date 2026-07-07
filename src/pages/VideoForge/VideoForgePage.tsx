import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { Player } from '@remotion/player';
import type { PlayerRef } from '@remotion/player';
import type { VideoProjectPacketV1, TimelineClip } from '../../video/editor/core/video-project-packet';
import {
  createEmptyProject,
  validateVideoProjectPacket,
  normalizeProject,
} from '../../video/editor/core/video-project-packet';
import { TimelineComposition } from '../../video/editor/remotion/TimelineComposition';
import { useTimelineMutator } from './hooks/useTimelineMutator';
import { useAnimatableMutator } from './hooks/useAnimatableMutator';
import { AnimatableMutator } from './lib/animatableMutator';
import {
  getAllEffects,
  getEffect,
} from '../../video/editor/core/effect-registry';
import { getAllTemplates, getTemplate } from '../../video/editor/core/template-registry';
import { TemplateResolver } from '../../video/editor/core/template-resolver';
import { EffectsPanel } from './EffectsPanel';
import { TransitionPanel } from './TransitionPanel';
import { TemplateBrowser } from './TemplateBrowser';
import { analyzeAudio, AudioAnalysis } from '../../video/editor/core/audio-analysis';
import { useAudioReactivity } from './hooks/useAudioReactivity';
import { AudioReactivityAdapter } from '../../video/editor/core/audio-reactivity-adapter';
import { getValueAtFrame } from '../../video/editor/core/keyframe-engine';
import {
  DEFAULT_FRAGMENT_SOURCE,
  createShaderPacket,
  hashShaderPacket,
} from '../../lib/pixelbrain.adapter.js';

import WandPage from '../Wand/WandPage';
import DivWandPage from '../DivWand/DivWandPage';
import PhotonicBridgeLab from '../internal/photonic-bridge/PhotonicBridgeLab';

const DEFAULT_FPS = 30;

type ForgeArtifactHandoff = {
  source: 'wand' | 'divwand' | 'photonic';
  kind: 'image' | 'pixelbrain';
  name: string;
  url?: string;
  width?: number;
  height?: number;
  pixelBrainPacket?: unknown;
  metadata?: Record<string, unknown>;
};

const WandPageWithForge = WandPage as ComponentType<{
  onSendToVideoForge?: (artifact: ForgeArtifactHandoff) => void;
}>;

const DivWandPageWithForge = DivWandPage as ComponentType<{
  onSendToVideoForge?: (artifact: ForgeArtifactHandoff) => void;
}>;

const PhotonicBridgeLabWithForge = PhotonicBridgeLab as ComponentType<{
  onSendToVideoForge?: (artifact: ForgeArtifactHandoff) => void;
}>;

function frameToTime(frame: number, fps = DEFAULT_FPS) {
  return (frame / fps).toFixed(2);
}

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function makeDefaultTransform() {
  return {
    position: { x: { defaultValue: 0 }, y: { defaultValue: 0 } },
    scale: { x: { defaultValue: 1 }, y: { defaultValue: 1 } },
    rotation: { defaultValue: 0 },
    anchor: { x: 0.5, y: 0.5 },
  };
}

export default function VideoForgePage() {
  const [project, setProject] = useState<VideoProjectPacketV1>(() => createEmptyProject('Scholomance Demo'));
  const [playhead, setPlayhead] = useState(0);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [exportFormat, setExportFormat] = useState<'mp4' | 'webm' | 'gif' | 'png-sequence' | 'json'>('mp4');
  const [exportQuality, setExportQuality] = useState(90);
  
  const [activeApp, setActiveApp] = useState<'timeline' | 'wand' | 'divwand' | 'photonic'>('timeline');

  // Timeline scale - dynamic to fill project duration (Phase 3 fidelity)
  const [zoomLevel, setZoomLevel] = useState(1);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(1100);

  // Measure timeline viewport for full-duration scaling
  useEffect(() => {
    const updateWidth = () => {
      if (timelineRef.current) {
        setTimelineViewportWidth(timelineRef.current.clientWidth || 1100);
      }
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    if (timelineRef.current) ro.observe(timelineRef.current);
    window.addEventListener('resize', updateWidth);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, []);

  // Drag state for timeline (move + edge trim)
  const [dragState, setDragState] = useState<{
    clipId: string;
    mode: 'move' | 'trim-start' | 'trim-end';
    startX: number;
    originalStart: number;
    originalDuration: number;
    originalTrackId: string;
  } | null>(null);

  // Undo / Redo — history of full packets (Phase 2 deliverable)
  const [history, setHistory] = useState<VideoProjectPacketV1[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const normalized = useMemo(() => normalizeProject(project), [project]);
  const durationFrames = normalized.canvas.durationFrames;
  const fps = normalized.canvas.fps || DEFAULT_FPS;

  // Base scale so the ENTIRE project duration exactly fits the viewport width.
  // This makes the timeline always represent the full project length proportionally.
  const baseScale = Math.max(0.05, timelineViewportWidth / Math.max(1, durationFrames));
  const pxPerFrame = baseScale * zoomLevel;

  const activeClip = useMemo(() => {
    if (!selectedClipId) return null;
    for (const t of normalized.timeline.tracks) {
      const c = t.clips.find((cc) => cc.id === selectedClipId);
      if (c) return c;
    }
    return null;
  }, [normalized, selectedClipId]);

  // Live preview via Remotion Player + ref for seeking from our playhead
  const playerRef = useRef<PlayerRef>(null);
  const playerProps = useMemo(() => ({ project: normalized }), [normalized]);

  // Keep Remotion Player in sync with our playhead (scrub)
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.seekTo(playhead);
    }
  }, [playhead]);

  // Packet-mutating updates that feed undo/redo
  const updateProject = useCallback((updater: (p: VideoProjectPacketV1) => VideoProjectPacketV1, options?: { skipHistory?: boolean }) => {
    setProject((prev) => {
      const next = updater({ ...prev });
      const stamped = { ...next, metadata: { ...next.metadata, updatedAt: new Date().toISOString() } };

      if (!options?.skipHistory) {
        // Push current state to history for undo
        setHistory((h) => {
          const newHistory = h.slice(0, historyIndex + 1);
          newHistory.push(prev);
          // Cap history size for memory
          if (newHistory.length > 40) newHistory.shift();
          return newHistory;
        });
        setHistoryIndex((idx) => Math.min(39, idx + 1));
      }

      return stamped;
    });
  }, [historyIndex]);

  const mutator = useTimelineMutator(updateProject);
  const animMutator = useAnimatableMutator(updateProject);
  const audioMutator = useAudioReactivity(updateProject);

  const undo = useCallback(() => {
    if (historyIndex < 0) return;
    const prevPacket = history[historyIndex];
    if (prevPacket) {
      setProject(prevPacket);
      setHistoryIndex((i) => i - 1);
      setStatus('Undo');
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex + 1 >= history.length) return;
    const nextPacket = history[historyIndex + 1];
    if (nextPacket) {
      setProject(nextPacket);
      setHistoryIndex((i) => i + 1);
      setStatus('Redo');
    }
  }, [history, historyIndex]);

  // === Visual Timeline helpers (Phase 2) ===
  function framesToPixels(frames: number) {
    return frames * pxPerFrame;
  }

  function pixelsToFrames(px: number) {
    return Math.round(px / pxPerFrame);
  }

  // Find clip under a given frame on a specific track (or any)
  function findClipAtFrame(trackId: string | null, frame: number): TimelineClip | null {
    const tracksToSearch = trackId
      ? normalized.timeline.tracks.filter((t) => t.id === trackId)
      : normalized.timeline.tracks;

    for (const t of tracksToSearch) {
      const hit = t.clips.find((c) => frame >= c.startFrame && frame < c.startFrame + c.durationFrames);
      if (hit) return hit;
    }
    return null;
  }

  // Update a clip's start/duration (used by drag + split)
  function mutateClip(clipId: string, mutatorFn: (clip: TimelineClip) => TimelineClip) {
    mutator.mutateClip(clipId, mutatorFn);
  }

  // Pointer drag handlers for visual timeline
  function beginDrag(e: React.PointerEvent, clipId: string, mode: 'move' | 'trim-start' | 'trim-end') {
    const clip = findClipInProject(clipId);
    if (!clip) return;

    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    setDragState({
      clipId,
      mode,
      startX: e.clientX,
      originalStart: clip.startFrame,
      originalDuration: clip.durationFrames,
      originalTrackId: clip.trackId,
    });
    setSelectedClipId(clipId);
  }

  function onDragMove(e: React.PointerEvent) {
    if (!dragState) return;

    const deltaPx = e.clientX - dragState.startX;
    const deltaFrames = pixelsToFrames(deltaPx);

    if (dragState.mode === 'move') {
      const newStart = Math.max(0, dragState.originalStart + deltaFrames);
      mutateClip(dragState.clipId, (c) => ({ ...c, startFrame: newStart }));
      // live playhead preview of the clip start when moving
      setPlayheadSafe(newStart);
    } else if (dragState.mode === 'trim-start') {
      const tentative = dragState.originalStart + deltaFrames;
      const maxStart = dragState.originalStart + dragState.originalDuration - 1;
      const newStart = Math.max(0, Math.min(tentative, maxStart));
      const newDur = dragState.originalDuration - (newStart - dragState.originalStart);
      if (newDur > 0) {
        mutateClip(dragState.clipId, (c) => ({ ...c, startFrame: newStart, durationFrames: newDur }));
      }
    } else if (dragState.mode === 'trim-end') {
      const newDur = Math.max(1, dragState.originalDuration + deltaFrames);
      mutateClip(dragState.clipId, (c) => ({ ...c, durationFrames: newDur }));
    }
  }

  function endDrag() {
    if (dragState) {
      setStatus(`Edited clip (${dragState.mode})`);
    }
    setDragState(null);
  }

  // Utility to locate a clip from current project state
  function findClipInProject(clipId: string): TimelineClip | null {
    for (const t of normalized.timeline.tracks) {
      const c = t.clips.find((cc) => cc.id === clipId);
      if (c) return c;
    }
    return null;
  }

  // Split clip at current playhead (Phase 2 deliverable)
  const splitClipAtPlayhead = useCallback(() => {
    const clip = selectedClipId ? findClipInProject(selectedClipId) : findClipAtFrame(null, playhead);
    if (!clip) {
      setStatus('No clip to split at playhead');
      return;
    }

    const local = playhead - clip.startFrame;
    if (local <= 0 || local >= clip.durationFrames) {
      setStatus('Playhead not inside clip interior');
      return;
    }

    const leftDur = local;
    const rightDur = clip.durationFrames - local;

    mutator.splitClip(clip.id, local, makeId('clip'));
    setStatus('Split clip at playhead');
  }, [normalized, playhead, updateProject, setStatus, selectedClipId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setPlayheadSafe = useCallback((f: number) => {
    const clamped = Math.max(0, Math.min(durationFrames - 1, Math.floor(f)));
    setPlayhead(clamped);
  }, [durationFrames]);

  // Basic timeline operations (packet mutating but producing new object)
  const addClip = (trackId: string, kind: TimelineClip['kind']) => {
    const track = normalized.timeline.tracks.find((t) => t.id === trackId);
    if (!track) return;

    const start = Math.max(0, Math.floor(playhead));
    const dur = kind === 'audio' ? Math.floor(fps * 8) : Math.floor(fps * 4);

    const newClip: TimelineClip = {
      id: makeId('clip'),
      trackId,
      kind,
      startFrame: start,
      durationFrames: dur,
      transform: {
        position: { x: { defaultValue: 0 }, y: { defaultValue: 0 } },
        scale: { x: { defaultValue: 1 }, y: { defaultValue: 1 } },
        rotation: { defaultValue: 0 },
        anchor: { x: 0.5, y: 0.5 },
      },
      opacity: { defaultValue: 1 },
      volume: kind === 'audio' ? { defaultValue: 1 } : undefined,
      effects: [],
      transitions: [],
      keyframes: [],
      metadata: {
        text: kind === 'text' ? 'NEW VERSE' : undefined,
        color: kind === 'text' ? '#f1e7c8' : undefined,
      },
    };

    if (kind === 'pixelbrain') {
      newClip.metadata = { ...newClip.metadata, pbNote: 'PixelBrain packet layer' };
    }
    if (kind === 'video' && !newClip.assetId) {
      // Auto-provision a demo video asset the first time
      const hasVideoAsset = normalized.assets.some((a) => a.kind === 'video');
      if (!hasVideoAsset) {
        const vidId = makeId('asset-video');
        // Using the same polarity track as example (works for demo)
        updateProject((p) => ({
          ...p,
          assets: [...p.assets, { id: vidId, kind: 'video', name: 'demo-video.mp3', url: 'https://cdn1.suno.ai/0ff1c2ee-6951-4f65-9204-4cbb2baf16fa.mp3' }],
        }), { skipHistory: true });
        newClip.assetId = vidId;
      }
    }

    mutator.addClip(trackId, newClip);

    setSelectedClipId(newClip.id);
    setStatus(`Added ${kind} clip`);
  };

  const deleteClip = (clipId: string) => {
    mutator.deleteClip(clipId);
    if (selectedClipId === clipId) setSelectedClipId(null);
    setStatus('Clip removed');
  };

  const moveClip = (clipId: string, deltaFrames: number) => {
    mutator.mutateClip(clipId, (c) => ({ ...c, startFrame: Math.max(0, c.startFrame + deltaFrames) }));
  };

  const trimClip = (clipId: string, deltaDur: number) => {
    mutator.mutateClip(clipId, (c) => ({ ...c, durationFrames: Math.max(1, c.durationFrames + deltaDur) }));
  };

  const setOpacityDefault = (clipId: string, val: number) => {
    mutator.setOpacityDefault(clipId, val);
  };

  const setTransformDefault = (clipId: string, prop: 'position.x' | 'position.y' | 'scale.x' | 'scale.y', val: number) => {
    mutator.setTransformDefault(clipId, prop, val);
  };

  // Phase 4: General keyframe management
  type AnimPropPath = 'opacity' | 'transform.position.x' | 'transform.position.y' | 'transform.scale.x' | 'transform.scale.y' | 'transform.rotation' | 'volume';

  function setAnimProp(clipId: string, path: AnimPropPath, newVal: { defaultValue: number; keyframes?: any[] }) {
    animMutator.setAnimatableProperty({ kind: 'clip', clipId }, path, newVal);
  }

  function addKeyframe(clipId: string, path: AnimPropPath, frame: number, value?: number, easing: any = 'linear') {
    const clip = findClipInProject(clipId);
    if (!clip) return;
    const prop = AnimatableMutator.getPropertyValue(clip, path);
    const v = value !== undefined ? value : getValueAtFrame(prop, frame);
    animMutator.addKeyframe({ kind: 'clip', clipId }, path, { frame, value: v, easing });
    setStatus(`Added ${path} keyframe`);
  }

  function deleteKeyframe(clipId: string, path: AnimPropPath, frame: number) {
    animMutator.deleteKeyframe({ kind: 'clip', clipId }, path, frame);
  }

  function updateKeyframe(clipId: string, path: AnimPropPath, oldFrame: number, updates: Partial<{frame: number; value: number; easing: any}>) {
    animMutator.updateKeyframe({ kind: 'clip', clipId }, path, oldFrame, updates);
  }

  // Phase 5 Effect helpers removed in favor of EffectMutatorRegistry

  // === Phase 7: Templates ===
  function applyTemplateQuick(templateId: string) {
    const tmpl = getTemplate(templateId);
    if (!tmpl) return;
    
    // Non-interactive quick apply
    const resolved = TemplateResolver.resolveTemplateAssets(tmpl, normalized);

    const newP = tmpl.apply(resolved, normalized);
    setProject(newP);
    setStatus(`Applied ${tmpl.name}`);
  }

  function openExportPanel() {
    setShowExportPanel(!showExportPanel);
  }

  function exportPacket() {
    // Already handled by saveProject, but with manifest
    const manifest = {
      exportedAt: new Date().toISOString(),
      packetId: normalized.projectId,
      title: normalized.title,
      format: 'json',
      canvas: normalized.canvas,
      tracks: normalized.timeline.tracks.length,
      assets: normalized.assets.length,
    };
    const blob = new Blob([JSON.stringify({ project: normalized, manifest }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${normalized.title.replace(/\s+/g, '_')}.scholovid+manifest.json`;
    a.click();
    setStatus('Exported packet + manifest');
  }

  async function exportDraftBrowser() {
    // Browser draft export using MediaRecorder on the Remotion player container (Phase 9)
    setStatus('Recording draft preview...');
    const playerContainer = document.querySelector('[data-remotion-player]') || 
                            document.querySelector('.remotion-player') || 
                            document.querySelector('video')?.parentElement ||
                            document.body;

    const durationSec = Math.min(8, durationFrames / fps);
    const chunks: Blob[] = [];
    let stream: MediaStream | null = null;

    try {
      if ((playerContainer as any).captureStream) {
        stream = (playerContainer as any).captureStream(30);
      } else if ((playerContainer as HTMLElement).tagName === 'VIDEO') {
        stream = (playerContainer as HTMLVideoElement).captureStream();
      }
    } catch {
      // Capture support varies by browser and player container.
    }

    if (!stream) {
      setStatus('Draft recording not supported here (use Full Render via CLI for production quality).');
      return;
    }

    const recorder = new MediaRecorder(stream, { 
      mimeType: 'video/webm;codecs=vp8' 
    });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${normalized.title.replace(/\s+/g, '_')}-draft.webm`;
      a.click();
      setStatus('Draft WebM exported (browser preview quality)');
    };

    recorder.start();

    const start = playhead;
    const end = Math.min(start + durationSec * fps, durationFrames);

    for (let f = start; f <= end; f += Math.max(1, Math.floor(fps / 6))) {
      setPlayheadSafe(f);
      // Give Remotion time to render the frame
      await new Promise(r => setTimeout(r, 55));
    }

    recorder.stop();
    stream.getTracks().forEach(t => t.stop());
  }

  function generateRenderCommand() {
    const ext = exportFormat === 'png-sequence' ? '' : `.${exportFormat}`;
    const out = `output/${normalized.projectId}${ext}`;
    let cmd = `node scripts/render-forge-video.mjs --packet ${normalized.projectId}.scholovid.json --format ${exportFormat} --out ${out}`;
    if ((exportFormat === 'mp4' || exportFormat === 'webm') && exportQuality < 95) {
      cmd += ` --quality ${exportQuality}`;
    }
    navigator.clipboard?.writeText(cmd);
    setStatus(`Render command copied for ${exportFormat}`);
    saveProject(); // convenience
  }

  // Phase 8: Analyze audio for reactivity
  async function analyzeSelectedAudio(assetId: string) {
    const asset = normalized.assets.find(a => a.id === assetId);
    if (!asset?.url || asset.kind !== 'audio') {
      setStatus('Select an audio asset first');
      return;
    }
    setStatus('Analyzing audio...');
    try {
      const analysis = await analyzeAudio(asset.url, fps);
      updateProject(p => {
        const assets = p.assets.map(a =>
          a.id === assetId ? { ...a, audioAnalysis: analysis } : a
        );
        return { ...p, assets };
      });
      setStatus(`Analyzed: ${analysis.beats.length} beats, BPM ~${analysis.bpm || '??'}`);
    } catch (e) {
      setStatus('Audio analysis failed (CORS or decode issue)');
      console.error(e);
    }
  }



  // Phase 8: Get current audio reactivity values for the playhead
  function getAudioFeatures() {
    // Find first audio asset with analysis
    const audioAsset = normalized.assets.find(a => a.kind === 'audio' && (a as any).audioAnalysis);
    const analysis = (audioAsset as any)?.audioAnalysis as AudioAnalysis | undefined;
    return AudioReactivityAdapter.getAudioFeatures(analysis, playhead);
  }

  // Apply simple audio reactivity to a property (adds keyframes driven by audio)
  function applyAudioReactivity(clipId: string, prop: 'scale' | 'opacity' | 'position.y', mode: 'rms' | 'beat') {
    const audioAsset = normalized.assets.find(a => a.kind === 'audio' && (a as any).audioAnalysis);
    if (!audioAsset) return;

    let targetPath = '';
    let scale = 1;
    let offset = 0;

    if (prop === 'scale') {
       targetPath = 'transform.scale.x';
       scale = mode === 'rms' ? 0.8 : 0.6;
       offset = 0.7;
       // Duplicate the binding for Y scale
       audioMutator.applyAudioReactivity({
         id: 'bind-scale-y', sourceAssetId: audioAsset.id, targetRef: { kind: 'clip', clipId },
         targetPath: 'transform.scale.y', feature: mode, scale, offset
       }, durationFrames);
    } else if (prop === 'opacity') {
       targetPath = 'opacity';
       scale = mode === 'beat' ? 0.7 : 0.5;
       offset = 0.3;
    } else if (prop === 'position.y') {
       targetPath = 'transform.position.y';
       scale = mode === 'rms' ? 120 : 80;
       offset = mode === 'rms' ? -60 : -40;
    }

    audioMutator.applyAudioReactivity({
       id: `bind-${prop}`,
       sourceAssetId: audioAsset.id,
       targetRef: { kind: 'clip', clipId },
       targetPath,
       feature: mode,
       scale,
       offset
    }, durationFrames);

    setStatus(`Applied ${mode} reactivity to ${prop}`);
  }

  // Collect unique keyframe frames for a clip (for visual markers)
  function getClipKeyframeFrames(clip: TimelineClip): number[] {
    const frames = new Set<number>();
    const props = [
      clip.opacity,
      clip.transform.position.x,
      clip.transform.position.y,
      clip.transform.scale.x,
      clip.transform.scale.y,
      clip.transform.rotation,
      clip.volume,
    ].filter(Boolean);
    for (const p of props) {
      if (p && p.keyframes) {
        p.keyframes.forEach((kf: any) => frames.add(kf.frame));
      }
    }
    return Array.from(frames).sort((a,b)=>a-b);
  }

  // Synthetic asset helpers (MVP)
  const importImageAsset = () => {
    const url = window.prompt('Enter Image URL:', '/island_arena.png');
    if (!url) return;
    const id = makeId('asset-img');
    mutator.addAsset({ id, kind: 'image', name: 'image.png', url, width: 1920, height: 1080 });
    setStatus('Image asset added');
  };

  const importAudioAsset = () => {
    const url = window.prompt('Enter Audio URL:', 'https://cdn1.suno.ai/0ff1c2ee-6951-4f65-9204-4cbb2baf16fa.mp3');
    if (!url) return;
    const id = makeId('asset-audio');
    mutator.addAsset({ id, kind: 'audio', name: 'audio.mp3', url });
    setStatus('Audio asset added');
  };

  const addTextClipDirect = () => {
    const track = normalized.timeline.tracks.find((t) => t.type === 'text');
    if (track) addClip(track.id, 'text');
  };

  const addPixelBrainClip = () => {
    const track = normalized.timeline.tracks.find((t) => t.type === 'pixelbrain') || normalized.timeline.tracks[3];
    if (track) addClip(track.id, 'pixelbrain');
  };

  const addWebGLShaderClip = () => {
    const track = normalized.timeline.tracks.find((t) => t.type === 'pixelbrain') || normalized.timeline.tracks[3];
    if (!track) {
      setStatus('No PixelBrain track available for shader');
      return;
    }

    const shaderId = makeId('shader');
    const packet = createShaderPacket({
      id: shaderId,
      label: 'Void Ripple WebGL Shader',
      fragmentSource: DEFAULT_FRAGMENT_SOURCE,
      canvas: {
        width: normalized.canvas.width,
        height: normalized.canvas.height,
      },
      deterministicSeed: 1701,
    });
    const checksum = hashShaderPacket(packet);
    const assetId = makeId('asset-shader');
    const clipId = makeId('clip-shader');
    const clip: TimelineClip = {
      id: clipId,
      trackId: track.id,
      kind: 'pixelbrain',
      startFrame: playhead,
      durationFrames: Math.floor(fps * 6),
      assetId,
      transform: makeDefaultTransform(),
      opacity: { defaultValue: 1 },
      effects: [],
      transitions: [],
      keyframes: [],
      metadata: {
        source: 'webgl-shader',
        label: packet.label,
        shaderId: packet.id,
        shaderChecksum: checksum,
      },
    };

    updateProject((p) => {
      const tracks = p.timeline.tracks.map((t) =>
        t.id === track.id ? { ...t, clips: [...t.clips, clip] } : t
      );

      return {
        ...p,
        assets: [
          ...p.assets,
          {
            id: assetId,
            kind: 'pixelbrain',
            name: packet.label,
            pixelBrainPacket: packet,
            metadata: {
              source: 'webgl-shader',
              shaderId: packet.id,
              shaderChecksum: checksum,
              contract: packet.contract,
            },
          },
        ],
        timeline: { ...p.timeline, tracks },
      };
    });
    setSelectedClipId(clipId);
    setStatus(`Added WebGL shader ${checksum}`);
  };

  const handleForgeArtifactHandoff = useCallback((artifact: ForgeArtifactHandoff) => {
    const clipKind: 'image' | 'pixelbrain' = artifact.kind === 'pixelbrain' ? 'pixelbrain' : 'image';
    const track = normalized.timeline.tracks.find((t) => t.type === clipKind)
      || normalized.timeline.tracks.find((t) => t.type === 'image');

    if (!track) {
      setStatus(`No ${clipKind} track available for ${artifact.source}`);
      return;
    }

    const assetId = makeId(`asset-${artifact.source}`);
    const clipId = makeId(`clip-${artifact.source}`);
    const asset = {
      id: assetId,
      kind: clipKind,
      name: artifact.name,
      url: artifact.url,
      width: artifact.width,
      height: artifact.height,
      pixelBrainPacket: artifact.pixelBrainPacket,
      metadata: {
        ...(artifact.metadata || {}),
        bridgeSource: artifact.source,
      },
    };

    const clip: TimelineClip = {
      id: clipId,
      trackId: track.id,
      kind: clipKind,
      startFrame: playhead,
      durationFrames: Math.floor(fps * 5),
      assetId,
      transform: makeDefaultTransform(),
      opacity: { defaultValue: 1 },
      effects: [],
      transitions: [],
      keyframes: [],
      metadata: {
        source: artifact.source,
        label: artifact.name,
      },
    };

    updateProject((p) => {
      const tracks = p.timeline.tracks.map((t) =>
        t.id === track.id ? { ...t, clips: [...t.clips, clip] } : t
      );

      return {
        ...p,
        assets: [...p.assets, asset],
        timeline: { ...p.timeline, tracks },
      };
    });
    setSelectedClipId(clipId);
    setActiveApp('timeline');
    setStatus(`${artifact.name} added from ${artifact.source}`);
  }, [fps, normalized.timeline.tracks, playhead, updateProject]);

  const addSolid = () => {
    const track = normalized.timeline.tracks.find((t) => t.type === 'image');
    if (track) addClip(track.id, 'solid');
  };

  const addVideoClip = () => {
    // For demo we add a video kind. Real flow would let user choose asset.
    const track = normalized.timeline.tracks.find((t) => t.type === 'video' || t.type === 'image');
    if (track) addClip(track.id, 'video');
  };

  // Save / Load
  const saveProject = () => {
    const manifest = {
      exportedAt: new Date().toISOString(),
      packetId: normalized.projectId,
      title: normalized.title,
      format: 'json',
      canvas: normalized.canvas,
      numTracks: normalized.timeline.tracks.length,
      numAssets: normalized.assets.length,
    };
    const bundle = { project: normalized, manifest };
    const json = JSON.stringify(bundle, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${normalized.title.replace(/\s+/g, '_').toLowerCase()}.scholovid.json`;
    a.click();
    setStatus('Project packet + manifest exported');
  };

  const loadProject = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (validateVideoProjectPacket(data)) {
          setProject(data);
          setSelectedClipId(null);
          setStatus('Project packet loaded');
        } else {
          setStatus('Invalid project packet (schema mismatch)');
        }
      } catch {
        setStatus('Failed to parse JSON');
      }
    };
    reader.readAsText(file);
  };

  // Autosave to localStorage (ephemeral, respects sovereign editor spirit for drafts)
  useEffect(() => {
    const key = 'scholomance.video-forge.lastProject';
    try {
      localStorage.setItem(key, JSON.stringify(normalized));
    } catch {
      /* non-fatal autosave */
    }
  }, [normalized]);

  useEffect(() => {
    const key = 'scholomance.video-forge.lastProject';
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (validateVideoProjectPacket(parsed)) {
          // Only load if current is the stock empty one
          if (project.title === 'Scholomance Demo' && project.assets.length === 0) {
            setProject(parsed);
          }
        }
      }
    } catch {
      /* ignore recovery fail */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts (Phase 2)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (mod && ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        redo();
        return;
      }

      if (e.key.toLowerCase() === 's' && !mod) {
        e.preventDefault();
        splitClipAtPlayhead();
        return;
      }

      if (e.key === 'ArrowRight') setPlayheadSafe(playhead + 1);
      if (e.key === 'ArrowLeft') setPlayheadSafe(playhead - 1);
      if (e.key.toLowerCase() === 'k') setPlayheadSafe(playhead + fps * 2);
      if ((e.key === ' ' || e.key === 'k') && document.activeElement?.tagName !== 'INPUT') {
        setPlayheadSafe(playhead + 5);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playhead, fps, setPlayheadSafe, undo, redo, splitClipAtPlayhead]);

  return (
    <div style={{ 
      padding: '12px 16px 20px', 
      color: '#e2e8f0', 
      background: '#050505', 
      minHeight: '100vh',
      fontFamily: "'Space Grotesk', system-ui, sans-serif"
    }}>
      {/* High-fidelity Intentional Banner — grimoire depth, top-left light source */}
      <div style={{
        marginBottom: 14,
        padding: '12px 22px 10px',
        background: 'linear-gradient(142deg, #1a1f2b 0%, #11151f 52%, #0b0e14 100%)',
        border: '1px solid #2c3344',
        borderRadius: '5px',
        boxShadow: '0 6px 18px rgba(0,0,0,0.75), inset 1px 1px 2px rgba(255,255,255,0.08), inset -3px -3px 8px rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Top-left light bevel / rim light */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, rgba(197,162,111,0.11) 0%, transparent 58%)',
          pointerEvents: 'none'
        }} />
        
        <div>
          <div style={{ 
            display: 'flex', 
            alignItems: 'baseline', 
            gap: 14,
            fontFamily: "'Georgia', serif",
            fontSize: 27,
            letterSpacing: '-0.03em',
            color: '#c5a26f'
          }}>
            SCHOLOMANCE
            <span style={{ 
              fontSize: 14, 
              color: '#f1e7c8', 
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '4px',
              opacity: 0.85,
              marginLeft: 2
            }}>REMOTION FORGE</span>
          </div>
          <div style={{ 
            fontSize: 10.5, 
            opacity: 0.6, 
            letterSpacing: '1px',
            marginTop: -1
          }}>
            PACKET IS LAW  •  REMOTION IS THE RENDERER  •  LIGHT FROM THE NORTHWEST
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => setProject(createEmptyProject('New Project'))} style={{fontSize:11}}>NEW</button>
          <button onClick={undo} disabled={historyIndex < 0} title="Ctrl/Cmd+Z" style={{fontSize:11}}>UNDO</button>
          <button onClick={redo} disabled={historyIndex + 1 >= history.length} title="Ctrl/Cmd+Shift+Z" style={{fontSize:11}}>REDO</button>
          <button onClick={saveProject} style={{fontSize:11}}>EXPORT PACKET</button>
          <TemplateBrowser
            project={normalized}
            setProject={setProject}
            setStatus={setStatus}
            setSelectedClipId={setSelectedClipId}
          />
          <button onClick={openExportPanel} style={{fontSize:11, background:'#1f3a2f', border:'1px solid #4ade80'}}>EXPORT (P9)</button>
          <button type="button" onClick={() => document.getElementById('forge-load-json')?.click()} style={{ cursor: 'pointer', fontSize:11 }}>
            LOAD
            <input id="forge-load-json" type="file" accept="application/json" style={{display:'none'}} onChange={(e)=>{const f=e.target.files?.[0]; if(f)loadProject(f);}} />
          </button>
          <span style={{margin:'0 3px',opacity:0.35}}>·</span>
          <button onClick={()=>{navigator.clipboard?.writeText(JSON.stringify(normalized,null,2));setStatus('copied');}} style={{fontSize:11}}>COPY</button>
          <button onClick={()=>{const c=`node scripts/render-forge-video.mjs --packet ${normalized.projectId}.scholovid.json`;navigator.clipboard?.writeText(c);setStatus('render');}} style={{fontSize:11}}>RENDER</button>
          <span style={{marginLeft:8,opacity:0.5,fontSize:11,fontFamily:'monospace'}}>{status}</span>
        </div>
      </div>

      {/* Embedded App Navigation */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <button onClick={() => setActiveApp('timeline')} style={{ background: activeApp === 'timeline' ? '#2c3344' : 'transparent', border: '1px solid #2c3344', color: activeApp === 'timeline' ? '#fff' : '#888', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>🎬 Video Forge Timeline</button>
        <button onClick={() => setActiveApp('wand')} style={{ background: activeApp === 'wand' ? '#2c3344' : 'transparent', border: '1px solid #2c3344', color: activeApp === 'wand' ? '#fff' : '#888', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>🪄 Canvas Wand Studio</button>
        <button onClick={() => setActiveApp('divwand')} style={{ background: activeApp === 'divwand' ? '#2c3344' : 'transparent', border: '1px solid #2c3344', color: activeApp === 'divwand' ? '#fff' : '#888', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>✨ Div Wand DOM Studio</button>
        <button onClick={() => setActiveApp('photonic')} style={{ background: activeApp === 'photonic' ? '#2c3344' : 'transparent', border: '1px solid #2c3344', color: activeApp === 'photonic' ? '#fff' : '#888', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Photonic Bridge Lab</button>
      </div>

      {activeApp === 'wand' && (
        <div style={{ border: '1px solid #2c3344', borderRadius: 6, overflow: 'hidden' }}>
          <WandPageWithForge onSendToVideoForge={handleForgeArtifactHandoff} />
        </div>
      )}

      {activeApp === 'divwand' && (
        <div style={{ border: '1px solid #2c3344', borderRadius: 6, overflow: 'hidden' }}>
          <DivWandPageWithForge onSendToVideoForge={handleForgeArtifactHandoff} />
        </div>
      )}

      {activeApp === 'photonic' && (
        <div style={{ border: '1px solid #2c3344', borderRadius: 6, overflow: 'hidden' }}>
          <PhotonicBridgeLabWithForge onSendToVideoForge={handleForgeArtifactHandoff} />
        </div>
      )}

      <div style={{ display: activeApp === 'timeline' ? 'block' : 'none' }}>
      {/* Preview + Media Bucket (top-right) */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        {/* Preview with depth */}
        <div style={{ 
          flex: 1,
          border: '1px solid #2c3344',
          background: 'linear-gradient(155deg, #11151f 0%, #0a0c12 100%)',
          padding: 10,
          boxShadow: '0 5px 14px rgba(0,0,0,0.65), inset 1px 1px 1px rgba(255,255,255,0.04), inset -2px -2px 5px rgba(0,0,0,0.5)',
          borderRadius: 4,
          position: 'relative'
        }}>
          {/* subtle top left rim */}
          <div style={{position:'absolute', top:0,left:0,width:'45%',height:1, background:'linear-gradient(to right, rgba(197,162,111,0.2),transparent)', pointerEvents:'none'}} />
          <div style={{ fontSize: 10.5, opacity: 0.55, marginBottom: 5, letterSpacing: '0.5px' }}>PREVIEW — LIGHT FROM TOP LEFT</div>
          <Player
            ref={playerRef}
            component={TimelineComposition as any}
            durationInFrames={durationFrames}
            fps={fps}
            compositionWidth={normalized.canvas.width}
            compositionHeight={normalized.canvas.height}
            style={{ 
              width: '100%', 
              background: '#000', 
              boxShadow: '0 8px 22px rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.03) inset' 
            }}
            controls
            loop
            inputProps={playerProps}
            initialFrame={playhead}
          />
          <div style={{ fontSize: 10.5, opacity: 0.5, marginTop: 5 }}>
            {playhead} / {durationFrames}  •  {frameToTime(playhead, fps)}s  •  {normalized.canvas.width}×{normalized.canvas.height}@{fps}
          </div>
        </div>

        {/* Media Bucket — top right corner */}
        <div style={{
          width: 248,
          border: '1px solid #2c3344',
          background: 'linear-gradient(148deg, #161b25 0%, #0f131b 100%)',
          padding: 10,
          boxShadow: '0 5px 14px rgba(0,0,0,0.65), inset 1px 1px 1px rgba(255,255,255,0.05), inset -2px -2px 5px rgba(0,0,0,0.45)',
          borderRadius: 4,
          display: 'flex',
          flexDirection: 'column',
          gap: 6
        }}>
          <div style={{ fontSize: 10.5, opacity: 0.6, letterSpacing: '0.5px', marginBottom: 2 }}>MEDIA BUCKET</div>

          {/* Import controls */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <button onClick={importImageAsset} style={{fontSize:10, padding:'2px 7px'}}>+ IMAGE</button>
            <button onClick={importAudioAsset} style={{fontSize:10, padding:'2px 7px'}}>+ AUDIO</button>
            <button onClick={addVideoClip} style={{fontSize:10, padding:'2px 7px'}}>+ VIDEO</button>
            <button onClick={addTextClipDirect} style={{fontSize:10, padding:'2px 7px'}}>+ TEXT</button>
            <button onClick={addPixelBrainClip} style={{fontSize:10, padding:'2px 7px'}}>+ PIXELBRAIN</button>
            <button onClick={addWebGLShaderClip} style={{fontSize:10, padding:'2px 7px'}}>+ SHADER</button>
            <button onClick={addSolid} style={{fontSize:10, padding:'2px 7px'}}>+ SOLID</button>
          </div>

          <div style={{ fontSize: 9.5, opacity: 0.45, margin: '4px 0 2px' }}>Assets ({normalized.assets.length}) — click to add</div>

        {/* Phase 7 quick templates */}
        <div style={{ borderTop: '1px solid #1f2937', paddingTop: 4, marginTop: 4 }}>
          <div style={{ fontSize: 9, opacity: 0.5, marginBottom: 2 }}>Templates</div>
          {getAllTemplates().slice(0,3).map(t => (
            <button key={t.id} onClick={() => applyTemplateQuick(t.id)} style={{ fontSize: 9, padding: '1px 4px', marginRight: 2 }}>{t.name.split(' ')[0]}</button>
          ))}
        </div>

          {/* Asset list */}
          <div style={{ 
            flex: 1, 
            overflowY: 'auto', 
            fontSize: 10.5, 
            maxHeight: 118,
            border: '1px solid #1f2937',
            background: '#0a0c12',
            padding: '3px 4px'
          }}>
            {normalized.assets.length === 0 && <div style={{opacity:0.4, fontSize:10}}>No media yet. Use buttons above.</div>}
            {normalized.assets.map((asset, idx) => (
              <button key={idx} type="button" style={{
                padding: '1px 4px', 
                margin: '1px 0',
                display: 'flex', 
                justifyContent: 'space-between',
                width: '100%',
                border: 0,
                background: 'transparent',
                color: 'inherit',
                textAlign: 'left',
                opacity: 0.85,
                cursor: 'pointer'
              }} onClick={() => {
                if (asset.kind === 'audio' && !asset.audioAnalysis) {
                  analyzeSelectedAudio(asset.id);
                  return;
                }
                // Quick add the asset as a clip on a sensible track
                const kind = asset.kind === 'video'
                  ? 'video'
                  : asset.kind === 'audio'
                    ? 'audio'
                    : asset.kind === 'pixelbrain'
                      ? 'pixelbrain'
                      : 'image';
                const t = normalized.timeline.tracks.find(tr => tr.type === kind || tr.type === 'image');
                if (t) {
                  const c: any = { 
                    id: makeId('clip'), 
                    trackId: t.id, 
                    kind, 
                    startFrame: playhead, 
                    durationFrames: Math.floor(fps*5), 
                    assetId: asset.id, 
                    transform: {position:{x:{defaultValue:0},y:{defaultValue:0}}, scale:{x:{defaultValue:1},y:{defaultValue:1}}, rotation:{defaultValue:0}, anchor:{x:0.5,y:0.5}}, 
                    opacity:{defaultValue:1}, 
                    volume: kind==='audio' ? {defaultValue: 1} : undefined,
                    effects:[], 
                    transitions:[], 
                    keyframes:[] 
                  };
                  updateProject(p => {
                    const tracks = p.timeline.tracks.map(tr => tr.id === t.id ? {...tr, clips:[...tr.clips, c]} : tr);
                    return {...p, timeline:{...p.timeline, tracks}};
                  });
                  setSelectedClipId(c.id);
                }
              }}>
                <span>{asset.name || asset.id}</span>
                <span style={{opacity:0.5}}>{asset.kind}{asset.audioAnalysis ? ' 🎵' : ''}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Simple transport */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <button onClick={() => setPlayheadSafe(0)}>⏮</button>
        <button onClick={() => setPlayheadSafe(playhead - 10)}>-10f</button>
        <input
          aria-label="Playhead"
          type="range"
          min={0}
          max={Math.max(1, durationFrames - 1)}
          value={playhead}
          onChange={(e) => setPlayheadSafe(parseInt(e.target.value, 10))}
          style={{ flex: 1 }}
        />
        <button onClick={() => setPlayheadSafe(playhead + 10)}>+10f</button>
        <button onClick={() => setPlayheadSafe(durationFrames - 1)}>⏭</button>
        <span style={{ fontFamily: 'monospace', marginLeft: 8 }}>{playhead} / {durationFrames}</span>
      </div>

      {/* Timeline controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
        <button onClick={splitClipAtPlayhead} title="Split at playhead (S)">SPLIT</button>
        <span style={{opacity:0.4}}>|</span>
        <span style={{ fontSize: 11, opacity: 0.65 }}>Zoom:</span>
        <button onClick={() => setZoomLevel(Math.max(0.25, zoomLevel / 1.3))}>−</button>
        <button onClick={() => setZoomLevel(Math.min(8, zoomLevel * 1.3))}>+</button>
        <button onClick={() => setZoomLevel(1)}>FIT</button>
        <span style={{ fontSize: 10, opacity: 0.45, marginLeft: 8 }}>
          Full project • {durationFrames} frames • {frameToTime(durationFrames, fps)}s
        </span>
      </div>

      {/* Visual Timeline — Full duration fit, depth, top-left lighting */}
      <div
        ref={timelineRef}
        style={{
          border: '1px solid #2c3344',
          background: 'linear-gradient(148deg, #0f131b 0%, #0a0c12 100%)',
          padding: 9,
          marginBottom: 12,
          userSelect: 'none',
          boxShadow: '0 5px 16px rgba(0,0,0,0.7), inset 1px 1px 1px rgba(255,255,255,0.03), inset -2px -2px 6px rgba(0,0,0,0.5)',
          borderRadius: 4
        }}
        onPointerMove={onDragMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, opacity: 0.7 }}>
          <div>TIMELINE — drag/move • edge trim • ruler seek • S=split • scales to full project</div>
          <div>Playhead {playhead} ({frameToTime(playhead)}s) / {durationFrames}</div>
        </div>

        {/* Ruler — equidistant across full project duration */}
        <div
          role="slider"
          aria-label="Timeline ruler"
          aria-valuenow={playhead}
          aria-valuemin={0}
          aria-valuemax={durationFrames-1}
          tabIndex={0}
          style={{
            height: 22,
            background: '#0b0e14',
            position: 'relative',
            marginBottom: 2,
            borderBottom: '1px solid #1f2937',
            cursor: 'pointer',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)'
          }}
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const newFrame = Math.max(0, Math.min(durationFrames - 1, pixelsToFrames(clickX)));
            setPlayheadSafe(newFrame);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') setPlayheadSafe(playhead + 1);
            if (e.key === 'ArrowLeft') setPlayheadSafe(playhead - 1);
          }}
        >
          {Array.from({ length: Math.ceil(durationFrames / Math.max(10, Math.floor(durationFrames / 26))) + 1 }).map((_, i) => {
            const interval = Math.max(10, Math.floor(durationFrames / 26));
            const f = i * interval;
            if (f > durationFrames) return null;
            const left = framesToPixels(f);
            return <div key={i} style={{position:'absolute', left:Math.min(left,timelineViewportWidth-2), top:1, fontSize:9, color:'#475569', pointerEvents:'none', fontFamily:'monospace'}}>{f}</div>;
          })}

          {/* Phase 8: Beat markers on ruler */}
          {(() => {
            const audio = normalized.assets.find(a => a.audioAnalysis);
            const beats = audio?.audioAnalysis?.beats || [];
            return beats.map((b, i) => {
              const left = framesToPixels(b);
              if (left < 0 || left > timelineViewportWidth) return null;
              return <div key={`beat-${i}`} style={{ position:'absolute', left, top: 18, width: 2, height: 4, background: '#22c55e', zIndex: 10, pointerEvents:'none' }} title={`Beat ${i}`} />;
            });
          })()}
          <div style={{
            position:'absolute', left:framesToPixels(playhead), top:0, bottom:0, width:2,
            background:'linear-gradient(to bottom, #f1e7c8, #c5a26f)',
            boxShadow:'0 0 7px #f1e7c8, 1px 0 0 rgba(255,255,255,0.2)', zIndex:20, pointerEvents:'none'
          }} />
        </div>

        {/* Track Lanes — full duration, depth, top-left lighting */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {normalized.timeline.tracks.slice().sort((a,b)=>a.order-b.order).map((track) => (
            <div key={track.id} style={{
              display:'flex', minHeight:54,
              background: track.visible ? '#11151f' : '#0a0c12',
              border: '1px solid #1f2937', position:'relative', overflow:'hidden',
              boxShadow: track.visible ? 'inset 0 1px 0 rgba(255,255,255,0.025)' : undefined
            }}>
                {/* Track label gutter */}
                <div
                  style={{
                    width: 108,
                    padding: '4px 8px',
                    fontSize: 11,
                    background: '#161a24',
                    borderRight: '1px solid #1f2937',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                  }}
                >
                  <div><strong>{track.name}</strong></div>
                  <div style={{ opacity: 0.5, fontSize: 10 }}>{track.type}</div>
                </div>

                {/* Clip surface */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`Track ${track.name} timeline`}
                  style={{
                    flex: 1,
                    position: 'relative',
                    height: 56,
                    background: 'repeating-linear-gradient(90deg, #11151f, #11151f 1px, transparent 1px, transparent 4px)',
                    cursor: 'pointer',
                  }}
                  onClick={(e) => {
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const frame = Math.max(0, Math.min(durationFrames - 1, pixelsToFrames(x)));
                    setPlayheadSafe(frame);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowRight') setPlayheadSafe(playhead + 1);
                    if (e.key === 'ArrowLeft') setPlayheadSafe(playhead - 1);
                  }}
                >
                  {track.clips.map((clip) => {
                    const isSelected = selectedClipId === clip.id;
                    const left = framesToPixels(clip.startFrame);
                    const width = Math.max(4, framesToPixels(clip.durationFrames));

                    const kindColor =
                      clip.kind === 'pixelbrain' ? '#6366f1' :
                      clip.kind === 'text' ? '#eab308' :
                      clip.kind === 'audio' ? '#22c55e' :
                      clip.kind === 'video' ? '#3b82f6' : '#64748b';

                    return (
                      <div
                        key={clip.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`${clip.kind} clip`}
                        onClick={(e) => { e.stopPropagation(); setSelectedClipId(clip.id); }}
                        onPointerDown={(e) => beginDrag(e, clip.id, 'move')}
                        onContextMenu={(e) => { e.preventDefault(); deleteClip(clip.id); }}
                        onKeyDown={(e) => { if (e.key === 'Delete' || e.key === 'Backspace') deleteClip(clip.id); }}
                        style={{
                          position: 'absolute',
                          top: 6,
                          left,
                          width,
                          height: 42,
                          background: kindColor,
                          opacity: isSelected ? 0.95 : 0.78,
                          border: isSelected ? '2px solid #f1e7c8' : '1px solid #0f172a',
                          borderRadius: 3,
                          boxSizing: 'border-box',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0 6px',
                          fontSize: 11,
                          color: '#0f172a',
                          fontWeight: 600,
                          cursor: dragState ? 'grabbing' : 'grab',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          boxShadow: isSelected ? '0 0 0 1px #f1e7c8' : undefined,
                          zIndex: isSelected ? 10 : 1,
                        }}
                      >
                        {/* Left trim handle */}
                        <div
                          onPointerDown={(e) => { e.stopPropagation(); beginDrag(e, clip.id, 'trim-start'); }}
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: 8,
                            cursor: 'col-resize',
                            background: 'rgba(255,255,255,0.35)',
                          }}
                        />

                        <div style={{ flex: 1, overflow: 'hidden', textAlign: 'center', pointerEvents: 'none' }}>
                          {clip.kind} {clip.metadata?.text ? String(clip.metadata.text).slice(0, 18) : ''}
                        </div>

                        {/* Keyframe markers (Phase 4) - diamonds for any keyframed prop */}
                        {getClipKeyframeFrames(clip).map((kfFrame, idx) => {
                          const rel = kfFrame - clip.startFrame;
                          if (rel < 0 || rel > clip.durationFrames) return null;
                          const pct = (rel / Math.max(1, clip.durationFrames)) * 100;
                          return (
                            <div
                              key={idx}
                              title={`KF @${kfFrame}`}
                              style={{
                                position: 'absolute',
                                left: `${pct}%`,
                                top: 3,
                                width: 5,
                                height: 5,
                                background: '#f1e7c8',
                                border: '1px solid #0f172a',
                                transform: 'translateX(-50%) rotate(45deg)',
                                zIndex: 15,
                                pointerEvents: 'none',
                                boxShadow: '0 0 2px #f1e7c8'
                              }}
                            />
                          );
                        })}

                        {/* Right trim handle */}
                        <div
                          onPointerDown={(e) => { e.stopPropagation(); beginDrag(e, clip.id, 'trim-end'); }}
                          style={{
                            position: 'absolute',
                            right: 0,
                            top: 0,
                            bottom: 0,
                            width: 8,
                            cursor: 'col-resize',
                            background: 'rgba(255,255,255,0.35)',
                          }}
                        />
                      </div>
                    );
                  })}

                  {/* Playhead line inside track */}
                  <div
                    style={{
                      position: 'absolute',
                      left: framesToPixels(playhead),
                      top: 0,
                      bottom: 0,
                      width: 2,
                      background: '#f1e7c8',
                      zIndex: 30,
                      pointerEvents: 'none',
                      boxShadow: '0 0 4px #f1e7c8',
                    }}
                  />
                </div>

                {/* Quick add button per track */}
                <button
                  onClick={() => addClip(track.id, track.type === 'pixelbrain' ? 'pixelbrain' : 'image')}
                  style={{ alignSelf: 'center', margin: '0 6px', fontSize: 11 }}
                >
                  +
                </button>
              </div>
            ))}
        </div>
      </div>

      {/* Inspector (Phase 2) */}
      {activeClip && (
        <div style={{ marginTop: 16, border: '1px solid #334155', background: '#0b0e14', padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 13, opacity: 0.7 }}>
              INSPECTOR • <strong>{activeClip.kind}</strong> • {activeClip.id}
            </div>
            <button onClick={() => deleteClip(activeClip.id)} style={{ color: '#f87171' }}>DELETE CLIP</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, marginBottom: 2 }}>Opacity (default + kfs)</div>
              <input
                id={`opacity-${activeClip.id}`}
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={activeClip.opacity.defaultValue}
                onChange={(e) => setOpacityDefault(activeClip.id, parseFloat(e.target.value))}
              />
              <span style={{ fontFamily: 'monospace', marginLeft: 6 }}>{activeClip.opacity.defaultValue.toFixed(2)}</span>
              <div style={{fontSize:9,opacity:0.6}}>KFs: {(activeClip.opacity.keyframes||[]).length}</div>
            </div>

            <div>
              <div style={{ fontSize: 11, marginBottom: 2 }}>Position X / Y (default)</div>
              <input
                type="range"
                min={-600}
                max={600}
                value={activeClip.transform.position.x.defaultValue}
                onChange={(e) => setTransformDefault(activeClip.id, 'position.x', parseFloat(e.target.value))}
              />
              <input
                type="range"
                min={-400}
                max={400}
                value={activeClip.transform.position.y.defaultValue}
                onChange={(e) => setTransformDefault(activeClip.id, 'position.y', parseFloat(e.target.value))}
              />
            </div>

            <div>
              <div style={{ fontSize: 11, marginBottom: 2 }}>Scale (default)</div>
              <input
                type="range"
                min={0.2}
                max={3}
                step={0.05}
                value={activeClip.transform.scale.x.defaultValue}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setTransformDefault(activeClip.id, 'scale.x', v);
                  setTransformDefault(activeClip.id, 'scale.y', v);
                }}
              />
            </div>

            {activeClip.kind === 'audio' && activeClip.volume && (
              <div>
                <div style={{ fontSize: 11, marginBottom: 2 }}>Volume (default)</div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={activeClip.volume.defaultValue}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    updateProject((p) => {
                      const tracks = p.timeline.tracks.map((t) => ({
                        ...t,
                        clips: t.clips.map((c) =>
                          c.id === activeClip.id
                            ? { ...c, volume: { ...(c.volume || {defaultValue:1}), defaultValue: v } }
                            : c
                        ),
                      }));
                      return { ...p, timeline: { ...p.timeline, tracks } };
                    });
                  }}
                />
                <span style={{ fontFamily: 'monospace', marginLeft: 6 }}>{activeClip.volume.defaultValue.toFixed(2)}</span>
              </div>
            )}

            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 11, marginBottom: 4, opacity: 0.8 }}>KEYFRAMES (Phase 4)</div>
              {/* Simple per-prop keyframe controls */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                <button onClick={() => addKeyframe(activeClip.id, 'opacity', playhead)} style={{fontSize:10}}>+ Opacity @ playhead</button>
                <button onClick={() => addKeyframe(activeClip.id, 'transform.position.x', playhead)} style={{fontSize:10}}>+ PosX</button>
                <button onClick={() => addKeyframe(activeClip.id, 'transform.position.y', playhead)} style={{fontSize:10}}>+ PosY</button>
                <button onClick={() => addKeyframe(activeClip.id, 'transform.scale.x', playhead)} style={{fontSize:10}}>+ Scale</button>
                <button onClick={() => addKeyframe(activeClip.id, 'transform.rotation', playhead)} style={{fontSize:10}}>+ Rot</button>
                {activeClip.kind === 'audio' && (
                  <button onClick={() => addKeyframe(activeClip.id, 'volume', playhead)} style={{fontSize:10}}>+ Volume</button>
                )}
              </div>

              {/* Keyframe list editor */}
              {(['opacity', 'transform.position.x', 'transform.position.y', 'transform.scale.x', 'transform.rotation', 'volume'] as AnimPropPath[])
                .filter(p => p !== 'volume' || activeClip.kind === 'audio')
                .map((path) => {
                  const prop = AnimatableMutator.getPropertyValue(activeClip, path);
                  const kfs = prop.keyframes || [];
                  const currentVal = getValueAtFrame(prop, playhead);
                  return (
                    <div key={path} style={{ marginBottom: 4, fontSize: 10, borderTop: '1px solid #222', paddingTop: 3 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{path} (now: {currentVal.toFixed(2)})</span>
                        <button onClick={() => addKeyframe(activeClip.id, path, playhead)} style={{fontSize:9}}>+@head</button>
                      </div>
                      {kfs.length > 0 && (
                        <div style={{ fontSize: 9, marginTop: 2 }}>
                          {kfs.map((kf: any, i: number) => (
                            <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center', margin: '1px 0' }}>
                              <input type="number" value={kf.frame} style={{width:50, fontSize:9}} onChange={(e) => updateKeyframe(activeClip.id, path, kf.frame, {frame: parseInt(e.target.value)} )} />
                              <input type="number" step="0.01" value={kf.value} style={{width:50, fontSize:9}} onChange={(e) => updateKeyframe(activeClip.id, path, kf.frame, {value: parseFloat(e.target.value)} )} />
                              <select value={kf.easing} style={{fontSize:9}} onChange={(e) => updateKeyframe(activeClip.id, path, kf.frame, {easing: e.target.value})}>
                                <option value="linear">linear</option>
                                <option value="easeIn">easeIn</option>
                                <option value="easeOut">easeOut</option>
                                <option value="easeInOut">easeInOut</option>
                                <option value="hold">hold</option>
                              </select>
                              <button onClick={() => deleteKeyframe(activeClip.id, path, kf.frame)} style={{fontSize:9, color:'#f77'}}>x</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>

            <div style={{ fontSize: 12 }}>
              <div>Start / Duration</div>
              <div style={{ fontFamily: 'monospace', marginBottom: 4 }}>
                {activeClip.startFrame} → +{activeClip.durationFrames} frames
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => moveClip(activeClip.id, -5)}>-5f</button>
                <button onClick={() => moveClip(activeClip.id, 5)}>+5f</button>
                <button onClick={() => trimClip(activeClip.id, -5)}>trim-</button>
                <button onClick={() => trimClip(activeClip.id, 5)}>trim+</button>
              </div>

              <div style={{ marginTop: 8, fontSize: 11, opacity: 0.7 }}>
                Live values (from compiler):
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 11 }}>
                X:{getValueAtFrame(activeClip.transform.position.x, playhead).toFixed(0)}{' '}
                Y:{getValueAtFrame(activeClip.transform.position.y, playhead).toFixed(0)}{' '}
                S:{getValueAtFrame(activeClip.transform.scale.x, playhead).toFixed(2)}{' '}
                R:{getValueAtFrame(activeClip.transform.rotation, playhead).toFixed(0)}°
                {activeClip.volume && ` Vol:${getValueAtFrame(activeClip.volume, playhead).toFixed(2)}`}
              </div>

              {/* Phase 8 Audio Reactivity Controls */}
              {(() => {
                const { rms, beat, hasAnalysis } = getAudioFeatures();
                if (!hasAnalysis) return <div style={{fontSize:9, opacity:0.5, marginTop:4}}>No audio analysis. Analyze an audio asset in Media Bucket.</div>;
                return (
                  <div style={{ marginTop: 6, fontSize: 10 }}>
                    <div>Audio: RMS {rms.toFixed(2)} | Beat {beat.toFixed(2)}</div>
                    <button onClick={() => applyAudioReactivity(activeClip.id, 'scale', 'rms')} style={{fontSize:9, marginRight:3}}>+ Scale to RMS</button>
                    <button onClick={() => applyAudioReactivity(activeClip.id, 'opacity', 'beat')} style={{fontSize:9, marginRight:3}}>+ Pulse on Beat</button>
                    <button onClick={() => applyAudioReactivity(activeClip.id, 'position.y', 'rms')} style={{fontSize:9}}>+ Y to RMS</button>
                  </div>
                );
              })()}
            </div>

            <EffectsPanel activeClip={activeClip} updateProject={updateProject} />
            <TransitionPanel activeClip={activeClip} updateProject={updateProject} />
          </div>

          {activeClip.kind === 'text' && (
            <div style={{ marginTop: 8 }}>
              <input
                value={(activeClip.metadata?.text as string) || ''}
                onChange={(e) =>
                  updateProject((p) => {
                    const tracks = p.timeline.tracks.map((t) => ({
                      ...t,
                      clips: t.clips.map((c) =>
                        c.id === activeClip.id ? { ...c, metadata: { ...c.metadata, text: e.target.value } } : c
                      ),
                    }));
                    return { ...p, timeline: { ...p.timeline, tracks } };
                  })
                }
                style={{ width: '100%', background: '#11151f', color: '#e2e8f0', border: '1px solid #334155', padding: 6 }}
              />
            </div>
          )}

          {activeClip.kind === 'pixelbrain' && (() => {
            const asset = normalized.assets.find((a) => a.id === activeClip.assetId) as any;
            const packet = asset?.pixelBrainPacket;
            if (!packet || packet.contract !== 'PB-SHADER-v1') return null;

            return (
              <div
                aria-label="Selected WebGL shader packet"
                style={{
                  marginTop: 8,
                  border: '1px solid #312e81',
                  background: '#0c1020',
                  color: '#c4b5fd',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 11,
                  padding: 8,
                }}
              >
                <div>WEBGL SHADER • {packet.contract}</div>
                <div>ID: {packet.id}</div>
                <div>HASH: {activeClip.metadata?.shaderChecksum || asset.metadata?.shaderChecksum || 'pending'}</div>
                <div>CANVAS: {packet.canvas?.width}x{packet.canvas?.height}</div>
              </div>
            );
          })()}
        </div>
      )}

      <div style={{ marginTop: 24, fontSize: 11, opacity: 0.5 }}>
        Phase 9 — Export Pipeline complete. Use the Export panel for formats + manifest. Browser Draft for quick previews. Full quality via CLI render script.
      </div>

      {/* Phase 9: Export Panel */}
      {showExportPanel && (
        <div style={{ 
          marginTop: 16, 
          padding: 16, 
          border: '1px solid #334155', 
          background: '#0b0e14',
          borderRadius: 6
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>Export Pipeline (Phase 9)</h3>
            <button onClick={() => setShowExportPanel(false)}>Close</button>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <label htmlFor="forge-export-format">
              Format:
              <select id="forge-export-format" value={exportFormat} onChange={e => setExportFormat(e.target.value as any)} style={{ marginLeft: 6 }}>
                <option value="mp4">MP4 (h264)</option>
                <option value="webm">WebM (vp8)</option>
                <option value="gif">GIF</option>
                <option value="png-sequence">PNG Sequence</option>
                <option value="json">Packet JSON + Manifest</option>
              </select>
            </label>

            {(exportFormat === 'mp4' || exportFormat === 'webm') && (
              <label htmlFor="forge-export-quality">
                Quality:
                <input
                  id="forge-export-quality"
                  type="range" 
                  min={60} 
                  max={100} 
                  value={exportQuality} 
                  onChange={e => setExportQuality(parseInt(e.target.value))} 
                  style={{ marginLeft: 6, verticalAlign: 'middle' }} 
                />
                <span style={{ marginLeft: 4 }}>{exportQuality}</span>
              </label>
            )}

            <button onClick={exportPacket}>Download Packet + Manifest</button>
            <button onClick={exportDraftBrowser} disabled={exportFormat === 'png-sequence' || exportFormat === 'json'}>
              Export Draft (Browser)
            </button>
            <button onClick={() => {
              const canvas = document.createElement('canvas');
              const player = document.querySelector('[data-remotion-player]') as HTMLElement;
              if (player) {
                // Approximate current frame capture
                canvas.width = normalized.canvas.width;
                canvas.height = normalized.canvas.height;
                const ctx = canvas.getContext('2d')!;
                ctx.fillStyle = '#050505';
                ctx.fillRect(0,0,canvas.width,canvas.height);
                ctx.fillStyle = '#fff';
                ctx.font = '24px monospace';
                ctx.fillText(`Frame ${playhead}`, 20, 40);
                const url = canvas.toDataURL('image/png');
                const a = document.createElement('a');
                a.href = url;
                a.download = `frame-${playhead}.png`;
                a.click();
              }
            }}>Current Frame PNG</button>
            <button onClick={generateRenderCommand}>
              Copy Full Render Command
            </button>
          </div>

          <div style={{ fontSize: 10, opacity: 0.6, marginTop: 8 }}>
            Browser Draft: quick low-quality recording of current preview. <br />
            Full quality / GIF / PNG seq: use the generated CLI command with the downloaded packet.
          </div>
        </div>
      )}
      </div> {/* End Timeline wrapper */}
    </div>
  );
}
