# PDR: Scholomance Remotion Forge - Phase 2 Advanced Features

## Owner(s)
- **Codex:** packet schema extensions, effect registry interfaces, timeline deterministic engine, template definitions.
- **Claude:** Video editor UI, effects panels, timeline transition UX, template wizard UI.
- **Gemini:** FFmpeg post-processing pipelines, PixelBrain WebGL rendering integration, server-side asset proxies.
- **Escalation owner:** Deck

## Context (seed)
The Scholomance Remotion Forge currently supports basic timeline editing and opacity keyframes. This Phase 2 upgrade introduces professional-grade compositing features: a full effects registry, transitions, reusable templates, true PixelBrain lattice rendering, green-screen chroma keying, and a robust proxy asset pipeline. This bridges the gap between programmatic video generation and a fully featured timeline editor.

## Target Integration Area
- `src/video/editor/core/*` (engine, schema, registries)
- `src/video/editor/remotion/*` (Remotion compiler bridge)
- `src/video/editor/effects/*` (new effect modules)
- `scripts/` (FFmpeg and render pipelines)
- `/video-forge` (UI adjustments)

## Core Concept
The editor behaves like a packet-driven CapCut or After Effects. Every advanced feature—from an audio-reactive glitch transition to a fully realized PixelBrain shader layer—must serialize perfectly into `VideoProjectPacket-v1` JSON. Remotion remains the pure, deterministic compiler target that translates these JSON extensions into WebGL and React DOM elements.

## Implementation Philosophy
Treat this as a real engineering handoff for an AI coding agent and future maintainers. Prefer small composable edits, deterministic behavior, adapter layers where existing contracts are uncertain, and no unnecessary rewrites. Preserve existing behavior unless a change is explicitly justified.

## Ownership & Law Compliance
This PDR complies with `VAELRIX_LAW.md`. 
All core logic (`codex`, `schema`) is owned by Codex. All editor UI (`src/pages`, components) is owned by Claude. All server/FFmpeg scripts are owned by Gemini. Cross-domain data passes through explicit schema contracts (`VideoProjectPacket-v1`).

---

## Required Sections

### 1. Executive Summary
The Scholomance Remotion Forge currently supports foundational clip arrangements and simple opacity keyframes. This Phase 2 update implements advanced editing capabilities required for production-level output. We are adding a full effects registry (blur, masking, color grading, audio-reactive), transition bindings, a template engine (lyric videos, visualizers), real PixelBrain rendering (translating JSON packets to WebGL), chroma keying, and a production asset pipeline (proxies, server uploads). The blast radius is confined to the video editor and its Remotion compiler; existing site functions are unaffected.

### 2. Out of Scope / Non-Goals
- Real-time multiplayer collaborative timeline editing (deferred to Phase 3).
- 3D model importing beyond native PixelBrain lattices.
- Direct-to-YouTube API upload from within the Forge UI.
- Custom WebAssembly audio DSP plugins (we rely on standard Web Audio API and pre-computed analysis).

### 3. Spec Sheet
*   **Functional Spec:**
    *   *Effects:* Support Blur, Color Grade, Crop, Masking, Tint, Dissolve, and Chroma Key. Must evaluate deterministically based on frame index.
    *   *Transitions:* Support crossfade, wipe, dip-to-color. Defined as `ClipTransitionBinding` calculating overlap duration.
    *   *Templates:* Provide a wizard UI to instantiate predefined project packets (Lyric Video, Visualizer) with user-supplied assets.
    *   *PixelBrain:* Implement `<PixelBrainLayerRenderer>` that translates a PixelBrain JSON packet into a `@remotion/three` canvas.
    *   *Asset Pipeline:* Uploaded assets trigger a background FFmpeg job to generate a low-res 720p proxy for Editor playback, maintaining the original for the final export.
*   **Non-Functional Spec:**
    *   *Determinism:* 100% frame-deterministic. No `Math.random()` or `Date.now()`.
    *   *Latency:* UI must remain 60fps during editing. Editor preview playback must maintain 30fps using proxies.
*   **Contracts:** Extensions to `VideoProjectPacket-v1` schema to support `transitions` array on clips, and new `VideoTemplateDefinition` interfaces.

### 4. Change Classification
*   **Architectural:** Introduces FFmpeg server-side hooks for proxy generation.
*   **Structural:** Expands `VideoProjectPacket-v1` schema and adds `template-registry.ts`.
*   **Behavioral:** Users can now key out green screens, apply transitions, and use templates.
*   **Cosmetic:** Adds Effects Panel, Transitions UI, and Template Browser to `/video-forge`.

### 5. Assumptions and Unknowns
*   **Assumptions:** The current `@remotion/player` can handle `<canvas>` and WebGL injections without severe overhead if proxies are used.
*   **Unknowns:** The exact performance hit of concurrent audio-reactive effects over many clips. *Escalation:* May need a pre-bake step for audio waveform data if live WebAudio analysis bottlenecks rendering.

### 6. Open Questions / Escalations
`ESCALATION: Audio Reactive Determinism`
Does the audio analysis happen live in the browser during preview, or is it pre-computed by a Node worker upon asset upload? 
*Recommendation:* Pre-compute via server-side FFmpeg/Node into a JSON array of volume/frequency data and store it in the project packet to ensure perfect deterministic renders.

### 7. Architecture / File Map
*   **Codex (Engine & Schemas):**
    *   `src/video/editor/core/effect-registry.ts` (Expanding existing)
    *   `src/video/editor/core/transition-registry.ts` (New)
    *   `src/video/editor/core/template-registry.ts` (New)
    *   `src/video/editor/schemas/Clip.v1.schema.ts` (Modified)
*   **Claude (UI & Visuals):**
    *   `src/pages/VideoForge/EffectsPanel.tsx` (New)
    *   `src/pages/VideoForge/TemplateBrowser.tsx` (New)
    *   `src/video/editor/remotion/TransitionRenderer.tsx` (New)
    *   `src/video/editor/remotion/PixelBrainLayerRenderer.tsx` (New)
*   **Gemini (Backend & FFmpeg):**
    *   `scripts/asset-proxy-worker.mjs` (New)
    *   `src/api/asset-upload.ts` (New endpoint)

### 8. Step-by-Step Implementation Plan
*   **Phase 1: Asset Pipeline (Gemini)**
    *   *Approx Time:* 2 Days.
    *   *Milestone:* Asset uploads generate 720p proxies and return cryptographic hashes.
    *   *Exit Criteria:* `asset-proxy-worker.mjs` successfully converts a 4k video to a 720p proxy and updates the Asset Registry. Safe to run silently.
*   **Phase 2: Effects & Transitions Registry (Codex)**
    *   *Approx Time:* 2 Days.
    *   *Milestone:* Schema definitions for Transitions and advanced effects are written and validated.
    *   *Exit Criteria:* Unit tests for `evaluateEffectParams` and transition overlap calculations pass.
*   **Phase 3: Remotion Compilers (Claude)**
    *   *Approx Time:* 3 Days.
    *   *Milestone:* `TransitionRenderer` and `PixelBrainLayerRenderer` implemented.
    *   *Exit Criteria:* A hardcoded packet with transitions and a pixelbrain clip renders correctly in `@remotion/player`.
*   **Phase 4: UI integration (Claude)**
    *   *Approx Time:* 3 Days.
    *   *Milestone:* Users can drag-and-drop effects/transitions in the UI.
    *   *Exit Criteria:* UI state updates perfectly sync to the `VideoProjectPacket`.
*   **Phase 5: Template Engine (Codex & Claude)**
    *   *Approx Time:* 2 Days.
    *   *Milestone:* `TemplateBrowser` wizard injects a fully formed Lyric Video packet into the editor.
    *   *Exit Criteria:* User can click "New Lyric Video", provide MP3, and receive a working timeline.

### 9. Code Examples for the 5–10 Most Pivotal Changes

**1. Transition Binding Schema Expansion (Codex)**
```typescript
// src/video/editor/schemas/Clip.v1.schema.ts
export interface ClipTransitionBinding {
  id: string;
  transitionId: 'crossfade' | 'wipe-left' | 'glitch';
  side: 'in' | 'out';
  durationFrames: number;
  params: Record<string, unknown>;
}
```

**2. Transition Overlap Calculation (Codex)**
```typescript
// src/video/editor/core/timeline-engine.ts
export function getClipRenderWindow(clip: TimelineClip, transitions: ClipTransitionBinding[]) {
  let renderStart = clip.startFrame;
  let renderDuration = clip.durationFrames;
  
  const inTransition = transitions.find(t => t.side === 'in');
  if (inTransition) {
    // Expand render window backwards to accommodate overlap
    renderStart -= inTransition.durationFrames;
    renderDuration += inTransition.durationFrames;
  }
  return { renderStart, renderDuration };
}
```

**3. PixelBrain Layer Renderer Bridge (Claude)**
```tsx
// src/video/editor/remotion/PixelBrainLayerRenderer.tsx
import { ThreeCanvas } from '@remotion/three';
import { useCurrentFrame } from 'remotion';
import { LatticeGeometry } from './PixelBrainLattice'; // Adapter to existing codex

export const PixelBrainLayerRenderer = ({ packet }) => {
  const frame = useCurrentFrame();
  return (
    <ThreeCanvas width={1920} height={1080}>
       <ambientLight intensity={0.5} />
       {/* Sync PixelBrain internal clock directly to absolute frame index */}
       <LatticeGeometry packet={packet} timeOverride={frame / 30} />
    </ThreeCanvas>
  );
};
```

**4. Asset Proxy Mapping (Gemini)**
```typescript
// src/video/editor/core/asset-registry.ts
export function getOptimalAssetUrl(asset: AssetRecord, isPreview: boolean): string {
  if (isPreview && asset.proxyUrl) {
    return asset.proxyUrl;
  }
  return asset.url; // Original full res for final Remotion render
}
```

**5. Audio Analysis Data Pre-computation (Gemini/Codex)**
```typescript
// scripts/asset-proxy-worker.mjs
import ffmpeg from 'fluent-ffmpeg';
export async function extractAudioWaveform(filePath, fps) {
  // Extract RMS volume data per frame to ensure deterministic React rendering
  // Returns Array of numbers [0.1, 0.4, 0.8, ...] mapping to frame index
  return executeFfmpegVolumeFilter(filePath, fps);
}
```

### 10. Glossary
*   **Proxy Asset:** A low-resolution, highly compressed version of a media file used strictly for smooth playback in the editor UI.
*   **PixelBrain Lattice:** The deterministic 3D procedural geometries created by the PixelBrain engine.
*   **Audio-Reactive:** Visual parameters (like scale or opacity) that mathematically map to the decibel or frequency data of an audio track at a specific frame.
*   **Compile Target:** Treating Remotion not as the state, but as the dumb renderer that only reads final normalized JSON packets.

### 11. Q&A — Top 10 Most Confusing Implementation Concerns
**Q1:** How do transitions work if clips sit on the same track?
**A1:** They don't. A transition conceptually overlaps two clips. The `timeline-engine` will temporarily bump the incoming clip to a virtual sibling track during the Remotion compile phase to allow visual overlap.

**Q2:** If an effect uses `Math.random()`, how do we make it deterministic?
**A2:** Do not use `Math.random()`. Use a seeded PRNG (Pseudo-Random Number Generator) taking the absolute `frame` index and the `clip.id` as the seed.

**Q3:** How does the UI know when a proxy is ready?
**A3:** The `AssetRecord` schema has a `status: 'processing' | 'ready'` field. The UI polls or receives a WebSocket event, then hot-swaps the URL.

**Q4:** Does Green Screen (Chroma Key) run in browser?
**A4:** Yes, for preview we use a WebGL fragment shader effect applied over the video element via `@remotion/player`. Final export runs the exact same shader in Chrome via Remotion.

**Q5:** What happens if an Audio-Reactive effect has no audio on the track?
**A5:** It defaults to a static baseline value (e.g., scale 1.0) and logs a warning to the diagnostic console.

### 12. QA Plan
*   **File Paths:** `src/video/editor/core/__tests__/transition-registry.test.ts`, `scripts/__tests__/asset-proxy.test.mjs`.
*   **Commands:** 
    *   `pnpm test src/video/editor/core`
    *   `pnpm test scripts`
*   **Runnable Snippet:**
```typescript
import { test, expect } from 'vitest';
import { getClipRenderWindow } from '../timeline-engine';

test('Transition overlap expands render window', () => {
  const clip = { startFrame: 100, durationFrames: 50 };
  const transitions = [{ side: 'in', durationFrames: 10 }];
  const result = getClipRenderWindow(clip, transitions);
  expect(result.renderStart).toBe(90);
  expect(result.renderDuration).toBe(60);
});
```

### 13. Regression Risks and Specific Retest Checklist
*   **Risk:** `evaluateEffectParams` modification breaks existing opacity keyframes.
    *   *Retest:* Load a Phase 1 `.scholovid.json` with an opacity fade. Ensure it still evaluates correctly. Command: `pnpm run dev`, open `/video-forge`, load JSON, check preview.
*   **Risk:** Proxy swapping causes aspect ratio stretching.
    *   *Retest:* Upload a vertical 9:16 4K video. Ensure the 720p proxy maintains the exact 9:16 aspect ratio in the inspector properties.

### 14. Rollout Plan
*   **Feature Flag:** `ENABLE_FORGE_PHASE_2` in `.env.local`.
*   **Incomplete-but-safe:** The new Effects Panel and Transition UI remain hidden behind the flag until `TransitionRenderer` is fully implemented. The proxy worker can run silently in the background on asset upload and just populate the DB without the UI explicitly relying on it.
*   **Rollback:** Disable `ENABLE_FORGE_PHASE_2` flag. Editor falls back to Phase 1 opacity-only rendering.

### 15. Definition of Done
- [ ] `asset-proxy-worker.mjs` generates 720p proxies on upload.
- [ ] Chroma Key, Blur, and Color Grade are registered in `effect-registry.ts`.
- [ ] `TransitionRenderer` successfully crossfades two overlapping clips.
- [ ] `PixelBrainLayerRenderer` renders a lattice packet without throwing.
- [ ] `TemplateBrowser` wizard instantiates a valid Lyric Video packet.
- [ ] All new modules have >80% test coverage.
- [ ] Editor UI runs at >30fps during preview.

### 16. Final Architectural Verdict
`Complete with acceptable risk`
The architecture cleanly extends the existing packet-to-compiler pipeline. The primary risk is performance degradation from heavy WebGL and unoptimized video decodes, which is mitigated by the mandatory implementation of the proxy asset pipeline in Phase 1.

### 17. References
*   `src/video/editor/core/video-project-packet.ts` - The core source of truth.
*   `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260630-REMOTION-PIXELBRAIN-FORGE-FOUNDATION.md` - Phase 1 MVP status.
*   `src/video/editor/remotion/TimelineComposition.tsx` - The Remotion compiler target.

### 18. Post-Implementation Report Handoff
Upon completion, the implementation agent must write the PIR to:
`docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260715-REMOTION-FORGE-PHASE-2.md`
