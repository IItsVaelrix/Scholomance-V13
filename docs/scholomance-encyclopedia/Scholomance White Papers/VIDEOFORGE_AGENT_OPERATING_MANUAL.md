# VideoForge Agent Operating Manual
## A White Paper for AI Agents Modifying the Video Editor and Timeline Engine

## Bytecode Search Code
`SCHOL-ENC-BYKE-SEARCH-WP-VIDEOFORGE-AGENT-MANUAL`

**Date:** 2026-06-30  
**Audience:** AI agents, UI engineers, backend agents integrating Remotion  
**Scope:** VideoForge timeline engine, mutators, effect registry, template resolver, audio reactivity adapter, remotion rendering pipeline.  
**Primary Source Code:** `src/video/editor/core/`, `src/pages/VideoForge/lib/`  
**UI Surface:** `src/pages/VideoForge/`  
**Canonical PDRs:**  
- [`2026-06-30-videoforge-connective-tissue-mutators-pdr.md`](../PDR-archive/2026-06-30-videoforge-connective-tissue-mutators-pdr.md)
- [`scholomance-remotion-forge-phase-2-gemini-owned.md`](../PDR-archive/scholomance-remotion-forge-phase-2-gemini-owned.md)

---

## 1. What VideoForge Is

VideoForge is Scholomance's deterministic browser-based video editing engine. It is backed by Remotion.

It converts structured intent into a timeline composition:

```text
Intent / Asset Upload / Template Choice
  -> VideoProjectPacketV1Like
  -> pure mutator logic
  -> TimelineComposition (Remotion)
  -> Browser Player / Server-side MP4 Render
```

The core rule is simple:

```text
The project packet is the canonical source of truth.
```

VideoForge is not:
- an unstructured canvas where UI components hold local timeline state
- a spaghetti of nested `Array.map` calls inside React hooks
- a black box where audio reactivity directly mutates Remotion players

VideoForge is:
- a deterministic state machine
- a headless utility layer that wraps deep clone updates
- a registry-driven architecture for effects, templates, and transitions
- a scalable foundation for procedural video generation

---

## 2. The Non-Negotiable Laws

Every agent touching VideoForge must preserve these laws.

### 2.1 Pure Mutation Only
Never mutate a clip or project in-place. All state updates must go through the pure utility functions in `lib/` (e.g. `timelineMutator.ts`).
Deep updates are accomplished by creating shallow copies of nested arrays/objects.

### 2.2 No Timeline Logic in UI
UI components (`VideoForgePage.tsx`, `EffectsPanel.tsx`) must never traverse or splice the timeline array.
If a UI component needs to change a clip, it calls a React hook (e.g. `useTimelineMutator`), which delegates to a pure utility function.

### 2.3 The `AnimatableTargetRef` Paradigm
Keyframes are no longer hardcoded strings inside switch statements.
Any property that can be keyframed is targeted generically using `AnimatableTargetRef` via dot-paths:
```ts
{ kind: 'clip', clipId: 'abc' } // targetPath: 'transform.scale.x'
{ kind: 'effect', clipId: 'abc', effectId: 'xyz' } // targetPath: 'intensity'
```

### 2.4 Headless Reactivity
Audio analysis and audio keyframing must happen outside the UI. The `AudioReactivityAdapter` generates keyframes and feeds them into the `AnimatableMutator`. Do not compute RMS or beat pulses inside React component render cycles.

---

## 3. Where Things Live

### 3.1 Core Engine
Main directory:
```text
src/video/editor/core/
```

| File | Purpose |
|---|---|
| `video-project-packet.ts` | Canonical `VideoProjectPacketV1` and schema definitions |
| `effect-registry.ts` | Extensible registry defining how video effects render |
| `template-registry.ts` | Pre-built video templates and their placeholders |
| `template-resolver.ts` | Centralized fallback resolution for template assets |
| `audio-analysis.ts` | Web Audio API RMS/beat extraction math |
| `audio-reactivity-adapter.ts` | Headless engine generating reactivity keyframes |

### 3.2 Editor Logic (The Connective Tissue)
Main directory:
```text
src/pages/VideoForge/lib/
```

| File | Purpose |
|---|---|
| `timelineMutator.ts` | Pure utility for traversing the timeline and returning updated project packets |
| `effectMutatorRegistry.ts` | Pure utility for adding/updating/reordering effects |
| `animatableMutator.ts` | Pure utility for getting/setting generic keyframes via `AnimatableTargetRef` |

### 3.3 Hooks
Main directory:
```text
src/pages/VideoForge/hooks/
```

| File | Purpose |
|---|---|
| `useTimelineMutator.ts` | Exposes `timelineMutator` utilities to React |
| `useEffectMutator.ts` | Exposes `effectMutatorRegistry` utilities to React |
| `useAnimatableMutator.ts` | Exposes `animatableMutator` utilities to React |
| `useAudioReactivity.ts` | Exposes `AudioReactivityAdapter` utilities to React |

### 3.4 UI Components
Main directory:
```text
src/pages/VideoForge/
```

| File | Purpose |
|---|---|
| `VideoForgePage.tsx` | Main Workspace, timeline scrubbing, Remotion player |
| `EffectsPanel.tsx` | Effect management UI |
| `TemplateBrowser.tsx` | Template selection UI |
| `TransitionPanel.tsx` | Transition management UI |

---

## 4. Canonical Data Contracts

### 4.1 VideoProjectPacketV1Like
This is the root document. Do not create parallel data structures.

```ts
export interface VideoProjectPacketV1Like {
  id: string;
  version: number;
  timeline: {
    tracks: Array<{
      id: string;
      clips: TimelineClip[];
    }>;
  };
  assets: AssetRecord[];
}
```

### 4.2 AnimatableTargetRef
Used whenever you need to read or mutate a keyframable property.

```ts
export type AnimatableTargetRef =
  | { kind: 'clip'; clipId: string }
  | { kind: 'effect'; clipId: string; effectId: string }
  | { kind: 'transition'; clipId: string; transitionId?: string }
  | { kind: 'shader'; clipId: string; shaderId: string }; // NOTE: Shader rendering is officially on the roadmap and not fully implemented yet.
```

### 4.3 AudioReactiveBinding
Used to bind an audio asset's RMS or beat to a timeline property.

```ts
export interface AudioReactiveBinding {
  id: string;
  sourceAssetId: string;
  targetRef: AnimatableTargetRef;
  targetPath: string;
  feature: 'rms' | 'beat';
  scale: number;
  offset: number;
}
```

---

## 5. Common Agent Recipes

### 5.1 Using useTimelineMutator

When updating the timeline directly, wrap your state setter (`setProject`):

```tsx
const mutator = useTimelineMutator(setProject);

mutator.splitClip('clip-123', 30, 'new-clip-456');
```

### 5.2 Adding a Keyframe to a Clip
Do not manually splice arrays. Use the hook.

```tsx
// Inside a React component
const animMutator = useAnimatableMutator(setProject);

animMutator.addKeyframe(
  { kind: 'clip', clipId: 'my-clip-123' },
  'transform.scale.x', // Dot-path support
  { frame: 30, value: 1.5, easing: 'easeInOut' }
);
```

### 5.3 Editing an Effect Parameter
Do not attempt to map over `timeline.tracks.clips.effects`.

```tsx
// Inside a React component
const effectMutator = useEffectMutator(setProject);

effectMutator.updateEffectParam(
  'my-effect-123',
  'threshold',
  0.8
);
```

### 5.3 Writing a Pure Mutator Utility
If a feature requires a new way to mutate the project, put it in `lib/`.

```ts
// src/pages/VideoForge/lib/myCustomMutator.ts
import { mutateClip } from './timelineMutator';

export function rotateAndFade(project, clipId) {
  return mutateClip(project, clipId, (clip) => {
    return {
       ...clip,
       opacity: { defaultValue: 0.5 },
       transform: {
         ...clip.transform,
         rotation: { defaultValue: 45 }
       }
    };
  });
}
```

### 5.4 Creating a New Template
Templates go in `template-registry.ts`.

```ts
export const MyNewTemplate: VideoTemplateDefinition = {
  id: 'my-new-template',
  name: 'Cool Zoom',
  description: 'A cool zooming template',
  placeholders: [
    { id: 'mainVideo', label: 'Main Video', type: 'video' }
  ],
  apply: (resolvedPlaceholders, baseProject) => {
    // Generate new project
    return newProject;
  }
}
```

---

## 6. Anti-Patterns

Avoid these. They usually indicate a violation of the Connective Tissue architecture.

### 6.1 UI Components Traversing Timeline Arrays
**Bad:**
```tsx
const newTracks = project.timeline.tracks.map(t => ({
  ...t,
  clips: t.clips.map(c => c.id === id ? { ...c, opacity: 0.5 } : c)
}));
```

**Good:**
```tsx
timelineMutator.setOpacityDefault(id, 0.5);
```

### 6.2 Hardcoded Fallback Strings in UI
**Bad:**
```tsx
const defaultImage = '/island_arena.png';
```

**Good:**
```tsx
const resolved = TemplateResolver.resolveTemplateAssets(tmpl, project);
```

### 6.3 Mutating Keyframes Using String Matches
**Bad:**
```ts
if (path === 'transform.position.x') {
   clip.transform.position.x = newValue;
}
```

**Good:**
```ts
AnimatableMutator.setPropertyValue(clip, path, newValue);
```

---

## 7. Agent Decision Tree

Use this before editing.

### 7.1 I Need to Mutate the Timeline
Does the mutation logic exist in `lib/`?
- **Yes:** Expose it via the corresponding hook (`useTimelineMutator`, etc.) and call it from the UI.
- **No:** Write a pure function in `lib/`, add it to the hook, then call it from the UI.

### 7.2 I Need to Add a UI Panel
Ensure the UI Panel only consumes the `VideoProjectPacketV1Like` state via props, and updates state solely by executing methods on the mutator hooks.

### 7.3 I Need to Fix a Bug in Remotion Rendering
Changes go in `src/video/editor/remotion/`. Renderers (like `TimelineComposition.tsx` and `ClipRenderer.tsx`) consume the project packet and render HTML/CSS. They should never write to the project state.

### 7.4 I Need to Add an Audio Reactive Visualizer
Do not write math logic in the visualizer component. Add a new `AudioReactiveBinding`, let `AudioReactivityAdapter` generate the keyframes on the packet, and simply read the keyframes during rendering via `evaluateAnimatable(prop, frame)`.
