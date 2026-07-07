# PDR: Scholomance Remotion Forge, Phase 2 Advanced Features

## Status

- **Document type:** Product Design Report / engineering handoff
- **Revision:** Gemini-owned implementation rewrite
- **Source:** Revised from the Phase 2 Advanced Features PDR uploaded as `Pasted markdown.md`
- **Primary owner:** Gemini
- **Escalation owner:** Deck

---

## 0. Owner(s)

- **Gemini:** Full implementation owner for Phase 2.
- **Gemini-Core:** packet schema extensions, effect registry interfaces, transition registry, deterministic timeline engine, template definitions, asset registry contracts.
- **Gemini-Compiler:** Remotion compiler bridge, `TransitionRenderer`, `EffectRenderer`, `PixelBrainLayerRenderer`, frame-indexed effect evaluation.
- **Gemini-UI:** video editor UI, effects panels, transition UX, Template Browser, template wizard UI, feature-flagged `/video-forge` changes.
- **Gemini-Media:** FFmpeg post-processing pipelines, proxy asset generation, server upload endpoints, audio analysis precomputation.
- **Gemini-QA:** unit tests, regression tests, deterministic render checks, feature-flag validation, Phase 1 compatibility verification.
- **Escalation owner:** Deck.

### Ownership rule

Gemini owns every implementation domain for this PDR. There are no Codex-owned or Claude-owned implementation boundaries in Phase 2. The internal Gemini lanes exist only to preserve engineering seams and reduce accidental cross-layer coupling.

---

## 1. Context

The Scholomance Remotion Forge currently supports basic timeline editing and opacity keyframes. Phase 2 upgrades it into a production-grade video editor surface with professional compositing features:

- effects registry
- transitions
- reusable templates
- true PixelBrain lattice rendering
- green-screen chroma keying
- deterministic audio-reactive effects
- proxy asset pipeline
- Remotion compiler bridge extensions

The editor behaves like a packet-driven CapCut or After Effects. Every advanced feature must serialize into `VideoProjectPacket-v1`. Remotion remains the deterministic compiler target. It reads normalized project packets and translates them into React DOM, video, canvas, and WebGL output.

```text
VideoProjectPacket-v1
  -> deterministic timeline engine
  -> Remotion compiler bridge
  -> editor preview or final export
```

---

## 2. Target Integration Area

- `src/video/editor/core/*` for engine, schema, registries, asset registry, and deterministic evaluation.
- `src/video/editor/remotion/*` for Remotion compiler bridge and render components.
- `src/video/editor/effects/*` for effect modules.
- `scripts/` for FFmpeg, asset proxy, and audio analysis pipelines.
- `/video-forge` for UI adjustments.

---

## 3. Core Concept

`VideoProjectPacket-v1` is the source of truth for the editor. UI panels, Remotion components, proxy workers, and template wizards are consumers or writers of that packet. No layer is allowed to invent its own hidden canonical state.

```text
UI edits packet state.
Core validates packet state.
Compiler reads packet state.
Media workers enrich asset records.
Remotion renders packet state.
```

### PixelBrain rule

PixelBrain layers must consume canonical PixelBrain packets, such as `PixelBrainAssetPacket` or `pixelbrain.render.v1`. The renderer may project those packets into Three.js, WebGL, canvas, SVG, or Remotion output, but it must not derive canonical geometry from rendered pixels, screenshots, Three.js meshes, shader output, or DOM layout.

```text
PixelBrain packet is canonical.
Rendered output is projection.
```

---

## 4. Implementation Philosophy

Treat this as a real engineering handoff for Gemini and future maintainers.

- Prefer small composable edits.
- Preserve Phase 1 behavior unless a change is explicitly required.
- Extend schemas backward-compatibly.
- Use adapter layers where existing contracts are uncertain.
- Never hide canonical state in local UI-only objects.
- Evaluate time-sensitive behavior by absolute frame index.
- Avoid `Math.random()`, `Date.now()`, `performance.now()`, and live audio analysis in canonical paths.
- Write tests before broad UI exposure.

---

## 5. Ownership & Law Compliance

This PDR complies with `VAELRIX_LAW.md`.

Gemini owns the full Phase 2 implementation across schema, editor UI, Remotion compiler, PixelBrain rendering bridge, effects registry, FFmpeg asset processing, and QA. Ownership is organized by internal Gemini lanes only.

Cross-domain data must pass through explicit schema contracts:

- `VideoProjectPacket-v1` remains the source of truth for video editor state.
- Remotion remains the deterministic compile target.
- PixelBrain packets remain canonical for lattice-derived visual layers.
- Proxy assets are preview accelerators, not canonical export sources.
- Audio analysis JSON is precomputed and indexed by frame.

---

## 6. Executive Summary

Phase 2 implements advanced editing capabilities required for production-level output. The upgrade adds:

- full effect registry
- blur, color grade, crop, masking, tint, dissolve, chroma key, and audio-reactive effects
- transition bindings for crossfade, wipe, dip-to-color, and glitch transitions
- template engine for lyric videos and visualizers
- true PixelBrain packet rendering in Remotion
- asset upload and FFmpeg proxy generation
- deterministic audio analysis records
- feature-flagged UI panels for effects, transitions, and templates

The blast radius is confined to the video editor, its packet schema, the Remotion compiler bridge, and media processing scripts. Existing site functions must remain unaffected.

---

## 7. Out of Scope / Non-Goals

- Real-time multiplayer collaborative timeline editing. Deferred to Phase 3.
- 3D model importing beyond native PixelBrain lattices.
- Direct-to-YouTube API upload from inside Forge UI.
- Custom WebAssembly audio DSP plugins.
- Replacing Remotion as the compiler target.
- Deriving PixelBrain canonical geometry from rendered output.
- Rewriting Phase 1 timeline behavior without a direct compatibility reason.

---

## 8. Spec Sheet

### Functional Spec

#### Effects

Support these Phase 2 effects:

- Blur
- Color Grade
- Crop
- Masking
- Tint
- Dissolve
- Chroma Key
- Audio Reactive

Effects must evaluate deterministically from:

```text
project packet + clip id + absolute frame index + precomputed analysis records
```

Effects must not depend on live browser state, wall-clock time, random number generators, or host-dependent measurements.

#### Transitions

Support:

- crossfade
- wipe
- dip-to-color
- glitch

Transitions are relationships between clips, not merely local effects attached to one clip. A transition must be resolvable by either explicit clip IDs or a deterministic timeline resolver.

Preferred Phase 2 contract:

```text
fromClipId + toClipId + durationFrames + transitionId
```

Fallback resolver only when explicit IDs are absent:

```text
trackId + clip ordering + side + overlapPolicy
```

#### Templates

Provide a wizard UI to instantiate predefined project packets:

- Lyric Video
- Visualizer

Templates must output complete `VideoProjectPacket-v1` structures and must not produce one-off JSON shapes.

#### PixelBrain

Implement `<PixelBrainLayerRenderer>` that consumes canonical PixelBrain packet input and renders it inside Remotion.

Allowed inputs:

- `PixelBrainAssetPacket`
- `pixelbrain.render.v1`
- `pixelbrain.export.v1` only when explicitly marked as render-safe

Forbidden canonical sources:

- screenshot pixels
- canvas output
- Three.js mesh state
- shader output
- SVG paths as source of truth

#### Asset Pipeline

Uploaded video assets trigger a media pipeline that:

1. stores the original asset
2. computes a stable cryptographic hash
3. generates a 720p proxy for editor preview
4. preserves aspect ratio
5. stores asset metadata in the asset registry
6. leaves the original as the final export source

#### Audio Analysis

Audio-reactive effects read precomputed analysis records.

Canonical rule:

```text
Audio-reactive effects read analysis[frame].
They do not analyze live audio during canonical render.
```

### Non-Functional Spec

#### Determinism

- Same packet and same asset hashes must produce same render output.
- Effects must evaluate by absolute frame index.
- No `Math.random()` in canonical paths.
- No `Date.now()` in canonical paths.
- No `performance.now()` in canonical paths.
- No live WebAudio analysis in canonical render paths.

#### Performance

The editor should target:

- 60fps for timeline interaction and panel responsiveness.
- stable 30fps preview playback with proxy assets.
- measurable performance budgets for 1, 3, and 5 active effect layers.

Performance success is measured, not guessed.

#### Backward Compatibility

- Existing Phase 1 opacity keyframes must load and render unchanged.
- New fields in `VideoProjectPacket-v1` must be optional or backward-compatible.
- `ENABLE_FORGE_PHASE_2=false` must restore Phase 1 editor behavior.

---

## 9. Change Classification

### Architectural

- Introduces FFmpeg server-side hooks for proxy generation.
- Adds audio analysis precomputation.
- Adds Remotion compiler bridge components for effects, transitions, and PixelBrain rendering.

### Structural

- Expands `VideoProjectPacket-v1` schema.
- Adds `transition-registry.ts`.
- Adds `template-registry.ts`.
- Adds or expands `asset-registry.ts`.
- Adds effect contracts and evaluators.

### Behavioral

- Users can apply chroma key.
- Users can add transitions.
- Users can instantiate templates.
- Users can render PixelBrain layers as timeline clips.
- Users can use audio-reactive visuals from precomputed analysis.

### Cosmetic

- Adds Effects Panel.
- Adds Transitions Panel.
- Adds Template Browser.
- Adds proxy and analysis status indicators.

---

## 10. Assumptions and Unknowns

### Assumptions

- The current `@remotion/player` can handle canvas and WebGL injections if proxy media is used.
- Existing timeline clip models can be extended without a destructive migration.
- Existing opacity keyframes can be generalized into effect parameter keyframes.
- FFmpeg is available in the environment that runs media scripts.

### Unknowns

- Exact performance hit of concurrent audio-reactive effects over many clips.
- Exact cost of PixelBrain WebGL layers inside Remotion preview.
- Whether existing asset storage already has a durable place for proxy metadata.
- Whether existing upload endpoints can support long-running proxy status updates.

---

## 11. Open Questions / Escalations

### ESCALATION: Audio Reactive Determinism

Does the audio analysis happen live in the browser during preview, or is it precomputed by a Node worker upon asset upload?

**Decision:** Precompute via Gemini-Media using FFmpeg or Node audio analysis. Store results in `AudioAnalysisRecord` and reference by asset ID and source hash.

### ESCALATION: Transition Identity

Should transitions be explicit clip-to-clip records or local clip decorations?

**Decision:** Use explicit `fromClipId` and `toClipId` where possible. Local `side` transitions are supported only as backward-compatible sugar and must resolve through a deterministic timeline resolver.

### ESCALATION: PixelBrain Renderer Authority

Can the Remotion PixelBrain renderer mutate or infer canonical geometry?

**Decision:** No. It consumes canonical PixelBrain packets only. Rendered output is projection.

---

## 12. Architecture / File Map

### Gemini-Core: Engine & Schemas

- `src/video/editor/core/effect-registry.ts` modified or expanded
- `src/video/editor/core/transition-registry.ts` new
- `src/video/editor/core/template-registry.ts` new
- `src/video/editor/core/timeline-engine.ts` modified
- `src/video/editor/core/asset-registry.ts` modified or new
- `src/video/editor/core/audio-analysis-registry.ts` new or integrated into asset registry
- `src/video/editor/core/video-project-packet.ts` modified only through backward-compatible extension fields
- `src/video/editor/schemas/Clip.v1.schema.ts` modified

### Gemini-Compiler: Remotion Bridge

- `src/video/editor/remotion/TransitionRenderer.tsx` new
- `src/video/editor/remotion/EffectRenderer.tsx` new or expanded
- `src/video/editor/remotion/PixelBrainLayerRenderer.tsx` new
- `src/video/editor/remotion/TimelineComposition.tsx` modified
- `src/video/editor/remotion/evaluateFrameEffects.ts` new or integrated into compiler bridge

### Gemini-UI: Editor Surface

- `src/pages/VideoForge/EffectsPanel.tsx` new
- `src/pages/VideoForge/TransitionPanel.tsx` new
- `src/pages/VideoForge/TemplateBrowser.tsx` new
- `src/pages/VideoForge/AssetStatusPanel.tsx` new or integrated
- `/video-forge` route modified behind `ENABLE_FORGE_PHASE_2`

### Gemini-Media: Backend & FFmpeg

- `scripts/asset-proxy-worker.mjs` new
- `scripts/audio-analysis-worker.mjs` new or integrated into proxy worker
- `src/api/asset-upload.ts` new or extended endpoint
- asset registry persistence updated with `proxyUrl`, `hash`, `status`, dimensions, duration, and analysis metadata

### Gemini-QA: Tests

- `src/video/editor/core/__tests__/transition-registry.test.ts`
- `src/video/editor/core/__tests__/effect-registry.test.ts`
- `src/video/editor/core/__tests__/video-project-packet.phase2.test.ts`
- `src/video/editor/core/__tests__/asset-registry.test.ts`
- `scripts/__tests__/asset-proxy.test.mjs`
- `scripts/__tests__/audio-analysis.test.mjs`
- `src/video/editor/remotion/__tests__/transition-renderer.test.tsx`
- `src/video/editor/remotion/__tests__/pixelbrain-layer-renderer.test.tsx`

---

## 13. Step-by-Step Implementation Plan

### Phase 1: Gemini-Media Asset Pipeline

**Milestone:** Uploaded assets generate 720p proxies, cryptographic hashes, and stable asset records.

**Tasks:**

- Add or extend asset upload endpoint.
- Store original asset URL.
- Compute stable hash from original file bytes.
- Generate 720p proxy using FFmpeg.
- Preserve source aspect ratio.
- Persist proxy status.
- Preserve original as final export source.

**Exit Criteria:**

- `asset-proxy-worker.mjs` converts a 4K video to a 720p proxy.
- Proxy preserves aspect ratio.
- Asset Registry stores `url`, `proxyUrl`, `hash`, `status`, dimensions, duration, fps, and kind.
- Final export path still uses the original asset URL.

### Phase 2: Gemini-Core Schemas & Registries

**Milestone:** `VideoProjectPacket-v1` supports Phase 2 effects, transitions, templates, PixelBrain clips, proxy assets, and audio analysis records.

**Tasks:**

- Add `VideoEffectBinding`.
- Add `EffectKeyframe`.
- Add `ClipTransitionBinding`.
- Add `VideoAssetRecord`.
- Add `AudioAnalysisRecord`.
- Add `VideoTemplateDefinition`.
- Add effect registry.
- Add transition registry.
- Add template registry.
- Keep old Phase 1 packet fields valid.

**Exit Criteria:**

- Schema tests pass.
- Old opacity-keyframe packets still load.
- New fields are optional or backward-compatible.
- Invalid effect or transition IDs fail loudly.

### Phase 3: Gemini-Compiler Remotion Bridge

**Milestone:** Effects, transitions, and PixelBrain layers compile from packet state into Remotion components.

**Tasks:**

- Implement `EffectRenderer`.
- Implement `TransitionRenderer`.
- Implement `PixelBrainLayerRenderer`.
- Add transition overlap resolver.
- Add frame-indexed effect evaluation.
- Ensure audio-reactive effects read `AudioAnalysisRecord` by frame.

**Exit Criteria:**

- A hardcoded Phase 2 packet renders crossfade, chroma key, blur, and PixelBrain lattice layer in `@remotion/player`.
- Rendering the same packet twice produces identical key-frame hashes.
- Invalid PixelBrain packet fails loudly.

### Phase 4: Gemini-UI Editor Integration

**Milestone:** Users can add effects, transitions, and templates from `/video-forge`.

**Tasks:**

- Add Effects Panel.
- Add Transition Panel.
- Add Template Browser.
- Add asset proxy status display.
- Add audio analysis status display.
- Gate new panels behind `ENABLE_FORGE_PHASE_2`.

**Exit Criteria:**

- UI writes only to `VideoProjectPacket-v1`.
- No hidden UI-only state becomes canonical.
- Disabling the feature flag hides Phase 2 panels and preserves Phase 1 behavior.

### Phase 5: Gemini-Core/Gemini-UI Template Engine

**Milestone:** Lyric Video and Visualizer templates instantiate valid project packets.

**Tasks:**

- Define template registry.
- Add required asset input schema per template.
- Add wizard UI.
- Emit valid `VideoProjectPacket-v1`.
- Add default effects and transitions from template definitions.

**Exit Criteria:**

- User can create a new Lyric Video project.
- User can create a new Visualizer project.
- Template output passes packet validation.
- Template output renders in Remotion preview.

### Phase 6: Gemini-QA Regression & Rollout

**Milestone:** Phase 2 is safely hidden behind `ENABLE_FORGE_PHASE_2` until tests pass.

**Tasks:**

- Add core unit tests.
- Add Remotion bridge tests.
- Add media worker tests.
- Add Phase 1 compatibility tests.
- Add deterministic render sample tests.
- Verify rollback behavior.

**Exit Criteria:**

- Rollback returns editor to Phase 1 opacity-only behavior.
- No packet migration is required for Phase 1 projects.
- All required QA checklist items pass.

---

## 14. Required Contracts

### 14.1 VideoEffectBinding

```ts
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
```

### 14.2 EffectKeyframe

```ts
export interface EffectKeyframe {
  frame: number;
  param: string;
  value: number | string | boolean;
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'step';
}
```

### 14.3 ClipTransitionBinding

```ts
export interface ClipTransitionBinding {
  id: string;
  transitionId: 'crossfade' | 'wipe-left' | 'dip-to-color' | 'glitch';
  fromClipId: string;
  toClipId: string;
  durationFrames: number;
  overlapPolicy?: 'explicit-overlap' | 'auto-overlap' | 'reject-gap';
  params: Record<string, unknown>;
}
```

### 14.4 LegacyClipTransitionBinding

Use only as compatibility sugar when a packet already stores transition intent on one clip.

```ts
export interface LegacyClipTransitionBinding {
  id: string;
  transitionId: 'crossfade' | 'wipe-left' | 'dip-to-color' | 'glitch';
  side: 'in' | 'out';
  durationFrames: number;
  params: Record<string, unknown>;
}
```

### 14.5 VideoAssetRecord

```ts
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
```

### 14.6 AudioAnalysisRecord

```ts
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
```

### 14.7 PixelBrainLayerClip

```ts
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
```

### 14.8 VideoTemplateDefinition

```ts
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
```

### 14.9 RenderCompilerContext

```ts
export interface RenderCompilerContext {
  fps: number;
  width: number;
  height: number;
  isPreview: boolean;
  assetsById: Map<string, VideoAssetRecord>;
  audioAnalysisById: Map<string, AudioAnalysisRecord>;
}
```

---

## 15. Pivotal Code Examples

### 15.1 Transition Binding Schema Expansion, Gemini-Core

```ts
// src/video/editor/schemas/Clip.v1.schema.ts
export interface ClipTransitionBinding {
  id: string;
  transitionId: 'crossfade' | 'wipe-left' | 'dip-to-color' | 'glitch';
  fromClipId: string;
  toClipId: string;
  durationFrames: number;
  overlapPolicy?: 'explicit-overlap' | 'auto-overlap' | 'reject-gap';
  params: Record<string, unknown>;
}
```

### 15.2 Transition Overlap Calculation, Gemini-Core

```ts
// src/video/editor/core/timeline-engine.ts
export function getTransitionRenderWindow(args: {
  fromClip: TimelineClip;
  toClip: TimelineClip;
  transition: ClipTransitionBinding;
}) {
  const { fromClip, toClip, transition } = args;
  const duration = Math.max(0, Math.round(transition.durationFrames));

  const overlapStart = Math.max(
    fromClip.startFrame + fromClip.durationFrames - duration,
    toClip.startFrame - duration
  );

  const overlapEnd = overlapStart + duration;

  return {
    fromClipId: fromClip.id,
    toClipId: toClip.id,
    overlapStart,
    overlapEnd,
    durationFrames: duration,
  };
}
```

### 15.3 Effect Evaluation, Gemini-Core

```ts
// src/video/editor/core/effect-registry.ts
export function evaluateEffectParams(args: {
  effect: VideoEffectBinding;
  frame: number;
  audio?: AudioAnalysisRecord;
}) {
  const { effect, frame, audio } = args;
  const baseParams = { ...effect.params };

  for (const keyframe of effect.keyframes ?? []) {
    if (keyframe.frame === frame) {
      baseParams[keyframe.param] = keyframe.value;
    }
  }

  if (effect.effectId === 'audio-reactive') {
    const rms = audio?.channels.rms[frame] ?? 0;
    baseParams.amount = rms;
  }

  return baseParams;
}
```

### 15.4 PixelBrain Layer Renderer Bridge, Gemini-Compiler

```tsx
// src/video/editor/remotion/PixelBrainLayerRenderer.tsx
import { ThreeCanvas } from '@remotion/three';
import { useCurrentFrame, useVideoConfig } from 'remotion';

export function PixelBrainLayerRenderer({ packet }: { packet: unknown }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  assertPixelBrainRenderSafePacket(packet);

  return (
    <ThreeCanvas width={width} height={height}>
      <ambientLight intensity={0.5} />
      <LatticeGeometry packet={packet} timeOverride={frame / fps} />
    </ThreeCanvas>
  );
}
```

### 15.5 Asset Proxy Mapping, Gemini-Core

```ts
// src/video/editor/core/asset-registry.ts
export function getOptimalAssetUrl(asset: VideoAssetRecord, isPreview: boolean): string {
  if (isPreview && asset.proxyUrl && asset.status === 'ready') {
    return asset.proxyUrl;
  }

  return asset.originalUrl || asset.url;
}
```

### 15.6 Audio Analysis Data Precomputation, Gemini-Media and Gemini-Core Contract

```ts
// scripts/audio-analysis-worker.mjs
export async function extractAudioAnalysis(filePath, fps) {
  const rms = await executeFfmpegRmsExtraction(filePath, fps);
  const bands = await executeFfmpegBandExtraction(filePath, fps);

  return {
    fps,
    channels: {
      rms,
      bass: bands.bass,
      mid: bands.mid,
      treble: bands.treble,
    },
  };
}
```

---

## 16. Glossary

### Proxy Asset

A low-resolution, compressed version of a media file used strictly for smooth playback in the editor UI.

### PixelBrain Lattice

The deterministic coordinate substrate of PixelBrain visual assets. In Forge, PixelBrain lattice packets are render inputs, not UI guesses.

### Audio-Reactive

A visual parameter that maps to precomputed decibel, RMS, or frequency data at a specific frame.

### Compile Target

Remotion is the compile target. It is not the source of project truth.

### Transition Binding

A relationship between two clips over a frame range.

### Effect Binding

A deterministic operation attached to a clip or layer and evaluated by frame index.

---

## 17. Q&A: Implementation Concerns

### Q1: How do transitions work if clips sit on the same track?

A transition conceptually overlaps two clips. Gemini-Core resolves the overlap window. Gemini-Compiler may temporarily render the incoming clip on a virtual sibling layer during Remotion compilation to allow both clips to render during the overlap.

### Q2: If an effect needs variation, how do we keep it deterministic?

Do not use `Math.random()`. Use a seeded deterministic function from stable inputs:

```text
clipId + effectId + frame + projectSeed
```

### Q3: How does the UI know when a proxy is ready?

`VideoAssetRecord.status` tracks `processing`, `ready`, or `failed`. Gemini-UI displays status and swaps preview URLs only when `status === 'ready'`.

### Q4: Does chroma key run in the browser?

Yes for preview. It should use the same deterministic shader or CPU-fallback parameter contract used by final Remotion export.

### Q5: What happens if an audio-reactive effect has no audio analysis?

The effect falls back to a static baseline and logs a non-fatal diagnostic. It must not silently invent random motion.

### Q6: Can templates create custom packet shapes?

No. Templates must emit valid `VideoProjectPacket-v1`.

### Q7: Can PixelBrain rendering write back to the PixelBrain packet?

No. Rendering is projection only. Edits must go through explicit packet editing workflows.

---

## 18. QA Plan

### Commands

```bash
pnpm test src/video/editor/core
pnpm test src/video/editor/remotion
pnpm test scripts
```

### Focused Unit Test: Transition Overlap

```ts
import { test, expect } from 'vitest';
import { getTransitionRenderWindow } from '../timeline-engine';

test('transition overlap calculates deterministic window', () => {
  const fromClip = { id: 'a', startFrame: 0, durationFrames: 100 };
  const toClip = { id: 'b', startFrame: 90, durationFrames: 100 };
  const transition = {
    id: 't1',
    transitionId: 'crossfade',
    fromClipId: 'a',
    toClipId: 'b',
    durationFrames: 10,
    params: {},
  };

  const result = getTransitionRenderWindow({ fromClip, toClip, transition });

  expect(result.overlapStart).toBe(90);
  expect(result.overlapEnd).toBe(100);
  expect(result.durationFrames).toBe(10);
});
```

### Gemini Full-Ownership QA Checklist

- [ ] Verify no remaining Codex or Claude ownership labels exist in this PDR.
- [ ] Verify every implementation task is assigned to a Gemini lane.
- [ ] Load a Phase 1 `.scholovid.json` and confirm opacity keyframes still work.
- [ ] Add Blur, Chroma Key, and Color Grade to the same clip and confirm deterministic frame output.
- [ ] Add crossfade between two overlapping clips and confirm both clips render during overlap.
- [ ] Upload vertical 9:16 4K video and confirm proxy preserves aspect ratio.
- [ ] Confirm final export uses original asset URL, not proxy URL.
- [ ] Confirm audio-reactive effects read precomputed `analysis[frame]`, not live browser audio.
- [ ] Confirm PixelBrain layer accepts only canonical PixelBrain packet input.
- [ ] Disable `ENABLE_FORGE_PHASE_2` and confirm Phase 1 editor behavior returns intact.

---

## 19. Regression Risks and Specific Retest Checklist

### Risk: Existing opacity keyframes break

**Layer:** core timeline/effect evaluation.

**Cause:** Effect generalization could change opacity behavior.

**Retest:** Load a Phase 1 `.scholovid.json` with opacity fade. Verify identical preview behavior.

### Risk: Proxy swapping stretches aspect ratio

**Layer:** media pipeline and UI preview.

**Cause:** Proxy worker may output fixed dimensions without preserving source aspect.

**Retest:** Upload a vertical 9:16 4K video. Verify proxy preserves exact 9:16 layout in inspector and preview.

### Risk: Final export accidentally uses proxy

**Layer:** asset URL resolver.

**Cause:** Preview URL may leak into final export compile context.

**Retest:** Render final export and assert `getOptimalAssetUrl(asset, false)` returns original URL.

### Risk: Transition resolver chooses wrong clips

**Layer:** timeline engine.

**Cause:** Legacy side-based transition sugar lacks explicit clip IDs.

**Retest:** Test adjacent clips, separated clips, same-track clips, cross-track clips, and overlapping clips.

### Risk: PixelBrain renderer swallows invalid packet

**Layer:** compiler bridge.

**Cause:** Renderer might blank-screen instead of failing loudly.

**Retest:** Pass malformed PixelBrain packet. Expect validation error or diagnostic, not silent empty render.

### Risk: Audio-reactive effect drifts between preview and export

**Layer:** audio analysis and effect evaluation.

**Cause:** Preview uses live audio while export uses precomputed data.

**Retest:** Confirm both preview and export read the same `AudioAnalysisRecord` by frame.

---

## 20. Rollout Plan

### Feature Flag

```text
ENABLE_FORGE_PHASE_2
```

### Incomplete but Safe

- New Effects Panel remains hidden until registry and renderer are implemented.
- New Transition Panel remains hidden until transition resolver and renderer are implemented.
- Template Browser remains hidden until template packets validate.
- Proxy worker may populate asset registry before UI depends on it.
- Audio analysis worker may populate analysis records before audio-reactive UI is exposed.

### Rollback

Disable `ENABLE_FORGE_PHASE_2`. The editor falls back to Phase 1 opacity-only rendering. No packet migration should be required.

---

## 21. Definition of Done

- [ ] `asset-proxy-worker.mjs` generates 720p proxies on upload.
- [ ] Proxy generation preserves source aspect ratio.
- [ ] Final export uses original asset source.
- [ ] `AudioAnalysisRecord` is generated and referenced by audio-reactive effects.
- [ ] Chroma Key, Blur, and Color Grade are registered in `effect-registry.ts`.
- [ ] `TransitionRenderer` crossfades two overlapping clips.
- [ ] `PixelBrainLayerRenderer` renders a canonical PixelBrain packet.
- [ ] Invalid PixelBrain packet fails loudly.
- [ ] `TemplateBrowser` wizard instantiates valid Lyric Video and Visualizer packets.
- [ ] Old Phase 1 opacity keyframe project loads unchanged.
- [ ] All new modules have meaningful tests.
- [ ] Preview playback targets stable 30fps with proxy media.
- [ ] Timeline and panel interactions target 60fps.
- [ ] `ENABLE_FORGE_PHASE_2=false` restores Phase 1 behavior.

---

## 22. Final Architectural Verdict

**Complete with acceptable risk, after schema tightening.**

The architecture cleanly extends the existing packet-to-compiler pipeline. The Gemini-only ownership model is simpler than the mixed Codex/Claude/Gemini split, but it must preserve internal Gemini lanes to prevent schema, UI, media, and compiler code from collapsing into one tangled implementation surface.

The final principle:

```text
Gemini owns the forge.
Gemini lanes preserve the seams.
VideoProjectPacket-v1 remains the law.
Remotion compiles.
PixelBrain packets stay canonical.
FFmpeg serves preview, not truth.
```

---

## 23. References

- `src/video/editor/core/video-project-packet.ts` for the core source of truth.
- `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260630-REMOTION-PIXELBRAIN-FORGE-FOUNDATION.md` for Phase 1 MVP status.
- `src/video/editor/remotion/TimelineComposition.tsx` for the Remotion compiler target.
- `PIXELBRAIN_AGENT_OPERATING_MANUAL.md` for PixelBrain lattice authority and deterministic packet discipline.
- `PIXELBRAIN_LANGUAGE_WHITE_PAPER.md` for PixelBrain language and bytecode discipline.

---

## 24. Post-Implementation Report Handoff

Upon completion, Gemini must write the PIR to:

```text
docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260715-REMOTION-FORGE-PHASE-2.md
```

The PIR must include:

- implemented files
- changed schemas
- feature flag behavior
- test commands and results
- remaining risks
- rollback notes
- screenshots or render hashes where applicable
