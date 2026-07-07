# VideoForge Connective Tissue Mutators PDR

**Document ID:** PDR-VIDEOFORGE-CONNECTIVE-TISSUE-MUTATORS-v1  
**Date:** 2026-06-30  
**Owner:** Vaelrix / Scholomance Coding  
**Status:** Ready for implementation  
**Change classification:** Structural, behavior-preserving first slice  
**Primary target:** VideoForge timeline/effects/transition/keyframe mutation layer  
**Core thesis:** UI components should stop hand-traversing `VideoProjectPacketV1` and instead mutate through centralized, testable adapters.

---

## 1. Summary

VideoForge currently has high-leverage duplication around clip updates, effect edits, keyframes, template defaults, and audio reactivity. The most dangerous pattern is repeated deep mutation of timeline state:

```ts
project.timeline.tracks.map(track => ({
  ...track,
  clips: track.clips.map(clip => ...)
}))
```

This pattern appears across `VideoForgePage.tsx`, `EffectsPanel.tsx`, and `TransitionPanel.tsx`, causing drift risk, nested state corruption risk, and slow feature expansion.

The fix is to introduce a small connective-tissue layer:

```text
VideoForge UI
  -> useTimelineMutator hook
  -> timelineMutator pure utility
  -> VideoProjectPacketV1 update
```

The first move is **not** a full architecture rewrite. It is a surgical refactor that centralizes these operations:

- `mutateClip`
- `addEffectToClip`
- `removeEffect`
- `updateEffectParam`
- `addLegacyTransition`
- `setTransformDefault`

After this spine is stable, the next adapters can be added safely:

- `EffectMutatorRegistry`
- `AnimatableMutator`
- `TemplateResolver`
- `AudioReactivityAdapter`

---

## 2. Why

### 2.1 Problem

VideoForge is crossing the threshold from a prototype editor into a packet-governed editing system. Once timeline operations include effects, transitions, keyframes, grouped clips, templates, green screen, audio reactivity, and PixelBrain bindings, duplicated timeline traversal becomes the main source of future bugs.

The current danger is not one broken function. It is many functions quietly knowing the packet tree.

### 2.2 Goal

Create a single mutation authority for timeline edits so UI panels become consumers of editing commands rather than packet-tree surgeons.

### 2.3 Risk Reduced

| Risk | Current failure mode | Mutator-layer fix |
|---|---|---|
| State corruption | Every component rebuilds nested timeline state differently | One tested mutation path |
| Feature drift | Effects logic duplicated across page and panels | Shared effect operations |
| Keyframe lock-in | Hardcoded string paths like `transform.position.x` | Generic animatable target adapter |
| Template rot | Fallback asset URLs duplicated | Single resolver facade |
| UI coupling | Audio reactivity locked inside one component | Headless adapter or hook |
| Regression fog | No small unit tests for mutation behavior | Pure utility test suite |

---

## 3. Architectural Principle

VideoForge should mirror the same packet discipline already used elsewhere in Scholomance systems:

```text
Canonical packet state
  -> adapter mutation
  -> render/UI projection
```

The UI may request edits, preview edits, and display edits. It should not independently invent packet traversal rules.

### 3.1 Design Laws

1. **Packet first:** edits target `VideoProjectPacketV1`, not UI-local shadow structures.
2. **Pure core first:** mutation utilities must be testable without React.
3. **Hook second:** React hooks wrap pure utilities for ergonomic UI use.
4. **No silent defaults:** every default transform/effect/template fallback lives in a named resolver.
5. **Preserve behavior first:** first PR should not alter feature behavior.
6. **Small slices:** extract one mutation class at a time.
7. **Stable identity:** unaffected tracks and clips keep object identity when possible.
8. **No packet-tree knowledge in panels:** panels call commands, not nested maps.
9. **Schema-aware growth:** grouped clips, nested compositions, and multi-track operations should require extension, not replacement.
10. **Regression tests before expansion:** lock the mutator before adding new feature types.

---

## 4. Top 5 Hidden Boons

| Rank | Disparity | Connective tissue | Boon | Risk reduced |
|---:|---|---|---|---|
| 1 | Clip mutation duplicated across deep `tracks -> clips` updates | `timelineMutator` plus `useTimelineMutator` | Safety and coherence boon | Prevents accidental nested state corruption |
| 2 | Effect logic duplicated in `EffectsPanel.tsx` and `VideoForgePage.tsx` | `EffectMutatorRegistry` | Velocity boon | New effect behavior implemented once |
| 3 | Keyframe logic locked to hardcoded paths | `AnimatableMutator` | Extensibility boon | Any property can become keyframeable |
| 4 | Template fallback logic duplicated | `TemplateResolver` | Lore and maintenance boon | Default visual/audio lore remains single-sourced |
| 5 | Audio reactivity trapped in main page component | `AudioReactivityAdapter` | UI and extensibility boon | Effects can bind to RMS/beats without page coupling |

---

## 5. Scope

### 5.1 In Scope

- Add pure timeline mutation utility.
- Add React hook wrapper.
- Replace duplicated clip/effect/transition/default-transform code paths.
- Add unit tests for all extracted behavior.
- Add a migration checklist for panels.
- Add top 10 pitfall guardrails.

### 5.2 Out of Scope for First PR

- Full keyframe rewrite.
- Full effect registry migration.
- Full audio reactivity service rewrite.
- Template browser redesign.
- New timeline features.
- Persistence format changes.
- UI design changes.
- Performance micro-optimization beyond reference preservation.

---

## 6. Dependency Check

Before implementation, inspect all consumers of timeline mutation.

### 6.1 Files to inspect

```text
src/pages/VideoForgePage.tsx
src/components/video-forge/EffectsPanel.tsx
src/components/video-forge/TransitionPanel.tsx
src/components/video-forge/TemplateBrowser.tsx
src/features/video-forge/**
src/types/**video*/**
src/lib/**video*/**
```

Adapt the paths to the actual repo layout.

### 6.2 Shared state to verify

- `project`
- `setProject`
- `selectedClipId`
- `selectedTrackId`
- undo/redo history
- project save/load serializer
- template application flow
- effect parameter panel props
- transition parameter panel props
- preview renderer consumers

### 6.3 Events to verify

- effect add
- effect remove
- effect parameter change
- transition add
- transform slider change
- default transform creation
- clip selection change
- template quick apply
- audio reactivity bind/apply
- keyframe add/update/delete

---

## 7. Proposed File Structure

```text
src/features/video-forge/
  lib/
    timelineMutator.ts
    effectMutatorRegistry.ts          # Phase 2
    animatableMutator.ts              # Phase 3
    templateResolver.ts               # Phase 4
    audioReactivityAdapter.ts         # Phase 5
  hooks/
    useTimelineMutator.ts
  tests/
    timelineMutator.test.ts
    effectMutatorRegistry.test.ts     # Phase 2
    animatableMutator.test.ts         # Phase 3
```

If the repo already has a VideoForge feature folder, use the existing convention instead of creating a parallel structure.

---

## 8. Phase 1: Timeline Mutation Spine

### 8.1 What changes

Create a pure utility that centralizes clip updates and common mutations.

### 8.2 Why

This removes the highest-risk duplicated nested traversal and gives every panel one safe mutation path.

### 8.3 Risk reduced

- Deep update drift.
- Missed track/clip spread bugs.
- Accidental mutation of old objects.
- No-op edits causing unnecessary rerenders.
- Future multi-track/grouped-clip blocker.

### 8.4 New file: `timelineMutator.ts`

```ts
export type ClipId = string;
export type EffectId = string;

export interface ClipEffect {
  id: EffectId;
  type: string;
  params?: Record<string, unknown>;
  enabled?: boolean;
}

export interface ClipTransform {
  position: { x: number; y: number };
  scale: { x: number; y: number };
  rotation: number;
  opacity: number;
}

export interface TimelineClip {
  id: ClipId;
  effects?: ClipEffect[];
  transform?: Partial<ClipTransform>;
  transition?: unknown;
  [key: string]: unknown;
}

export interface TimelineTrack {
  id?: string;
  clips: TimelineClip[];
  [key: string]: unknown;
}

export interface VideoProjectPacketV1Like {
  timeline: {
    tracks: TimelineTrack[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export type ClipMutator = (clip: TimelineClip) => TimelineClip;

export const DEFAULT_TRANSFORM: ClipTransform = Object.freeze({
  position: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  opacity: 1,
});

export function resolveClipTransform(transform?: Partial<ClipTransform>): ClipTransform {
  return {
    position: {
      x: transform?.position?.x ?? DEFAULT_TRANSFORM.position.x,
      y: transform?.position?.y ?? DEFAULT_TRANSFORM.position.y,
    },
    scale: {
      x: transform?.scale?.x ?? DEFAULT_TRANSFORM.scale.x,
      y: transform?.scale?.y ?? DEFAULT_TRANSFORM.scale.y,
    },
    rotation: transform?.rotation ?? DEFAULT_TRANSFORM.rotation,
    opacity: transform?.opacity ?? DEFAULT_TRANSFORM.opacity,
  };
}

export function mutateClip<TProject extends VideoProjectPacketV1Like>(
  project: TProject,
  clipId: ClipId,
  mutate: ClipMutator
): TProject {
  let projectChanged = false;

  const tracks = project.timeline.tracks.map((track) => {
    let trackChanged = false;

    const clips = track.clips.map((clip) => {
      if (clip.id !== clipId) return clip;

      const nextClip = mutate(clip);
      if (nextClip === clip) return clip;

      trackChanged = true;
      projectChanged = true;
      return nextClip;
    });

    return trackChanged ? { ...track, clips } : track;
  });

  if (!projectChanged) return project;

  return {
    ...project,
    timeline: {
      ...project.timeline,
      tracks,
    },
  };
}

export function setTransformDefault<TProject extends VideoProjectPacketV1Like>(
  project: TProject,
  clipId: ClipId
): TProject {
  return mutateClip(project, clipId, (clip) => ({
    ...clip,
    transform: resolveClipTransform(clip.transform),
  }));
}

export function addEffectToClip<TProject extends VideoProjectPacketV1Like>(
  project: TProject,
  clipId: ClipId,
  effect: ClipEffect
): TProject {
  return mutateClip(project, clipId, (clip) => ({
    ...clip,
    effects: [...(clip.effects ?? []), effect],
  }));
}

export function removeEffectFromClip<TProject extends VideoProjectPacketV1Like>(
  project: TProject,
  clipId: ClipId,
  effectId: EffectId
): TProject {
  return mutateClip(project, clipId, (clip) => ({
    ...clip,
    effects: (clip.effects ?? []).filter((effect) => effect.id !== effectId),
  }));
}

export function updateEffectParam<TProject extends VideoProjectPacketV1Like>(
  project: TProject,
  clipId: ClipId,
  effectId: EffectId,
  paramKey: string,
  value: unknown
): TProject {
  return mutateClip(project, clipId, (clip) => ({
    ...clip,
    effects: (clip.effects ?? []).map((effect) => {
      if (effect.id !== effectId) return effect;
      return {
        ...effect,
        params: {
          ...(effect.params ?? {}),
          [paramKey]: value,
        },
      };
    }),
  }));
}

export function addLegacyTransition<TProject extends VideoProjectPacketV1Like>(
  project: TProject,
  clipId: ClipId,
  transition: unknown
): TProject {
  return mutateClip(project, clipId, (clip) => ({
    ...clip,
    transition,
  }));
}
```

### 8.5 New file: `useTimelineMutator.ts`

```ts
import { useMemo } from 'react';
import {
  addEffectToClip,
  addLegacyTransition,
  mutateClip,
  removeEffectFromClip,
  setTransformDefault,
  updateEffectParam,
  type ClipEffect,
  type ClipId,
  type ClipMutator,
  type EffectId,
  type VideoProjectPacketV1Like,
} from '../lib/timelineMutator';

type SetProject<TProject> = (updater: (project: TProject) => TProject) => void;

export function useTimelineMutator<TProject extends VideoProjectPacketV1Like>(
  setProject: SetProject<TProject>
) {
  return useMemo(
    () => ({
      mutateClip(clipId: ClipId, mutator: ClipMutator) {
        setProject((project) => mutateClip(project, clipId, mutator));
      },

      setTransformDefault(clipId: ClipId) {
        setProject((project) => setTransformDefault(project, clipId));
      },

      addEffectToClip(clipId: ClipId, effect: ClipEffect) {
        setProject((project) => addEffectToClip(project, clipId, effect));
      },

      removeEffectFromClip(clipId: ClipId, effectId: EffectId) {
        setProject((project) => removeEffectFromClip(project, clipId, effectId));
      },

      updateEffectParam(
        clipId: ClipId,
        effectId: EffectId,
        paramKey: string,
        value: unknown
      ) {
        setProject((project) =>
          updateEffectParam(project, clipId, effectId, paramKey, value)
        );
      },

      addLegacyTransition(clipId: ClipId, transition: unknown) {
        setProject((project) => addLegacyTransition(project, clipId, transition));
      },
    }),
    [setProject]
  );
}
```

---

## 9. Migration Pattern

### 9.1 Old pattern

```ts
setProject((project) => ({
  ...project,
  timeline: {
    ...project.timeline,
    tracks: project.timeline.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => {
        if (clip.id !== selectedClipId) return clip;

        return {
          ...clip,
          effects: clip.effects?.map((effect) =>
            effect.id === effectId
              ? {
                  ...effect,
                  params: {
                    ...effect.params,
                    [paramKey]: value,
                  },
                }
              : effect
          ),
        };
      }),
    })),
  },
}));
```

### 9.2 New pattern

```ts
timelineMutator.updateEffectParam(
  selectedClipId,
  effectId,
  paramKey,
  value
);
```

### 9.3 Migration order

1. Add pure utility and tests.
2. Add hook wrapper.
3. Replace `VideoForgePage.tsx` local helpers.
4. Replace `EffectsPanel.tsx` local helpers.
5. Replace `TransitionPanel.tsx` local transition updates.
6. Verify no behavior changes.
7. Remove dead duplicated functions.
8. Add lint guard or code comment against manual nested timeline mutation.

---

## 10. Phase 2: EffectMutator Registry

### 10.1 What changes

Extract effect creation, update, reorder, toggle, and removal into a registry-backed adapter.

```text
EffectMutatorRegistry
  -> createEffect(type, overrides)
  -> updateEffectParam(effectId, key, value)
  -> toggleEffect(effectId, enabled)
  -> reorderEffect(effectId, direction)
  -> removeEffect(effectId)
```

### 10.2 Why

Effects become a modular system instead of a set of panel-specific conditionals.

### 10.3 Risk reduced

- Adding reorder only once.
- Adding default params only once.
- Prevents effect shape drift.
- Enables effect metadata UI from one source.

### 10.4 Acceptance criteria

- EffectsPanel and VideoForgePage do not each define effect logic.
- New effect types can be registered with defaults.
- Missing effect type fails loudly in dev.
- Effect list ordering is preserved unless reorder is called.

---

## 11. Phase 3: AnimatableMutator

### 11.1 What changes

Replace hardcoded keyframe path handling with a generic animatable adapter.

```text
AnimatableMutator
  -> getAnimatableTarget(project, targetRef)
  -> addKeyframe(target, propertyPath, keyframe)
  -> updateKeyframe(target, propertyPath, keyframeId, patch)
  -> deleteKeyframe(target, propertyPath, keyframeId)
```

### 11.2 Why

`transform.position.x` should not be a special universe. Effect params, shader uniforms, chroma key thresholds, and PixelBrain variables should all become keyframeable through the same shape.

### 11.3 Risk reduced

- Hardcoded path sprawl.
- Switch statement growth.
- Broken shader/effect keyframing later.
- Custom property lockout.

### 11.4 Proposed target reference

```ts
export type AnimatableTargetRef =
  | { kind: 'clip'; clipId: string }
  | { kind: 'effect'; clipId: string; effectId: string }
  | { kind: 'transition'; clipId: string; transitionId?: string }
  | { kind: 'shader'; clipId: string; shaderId: string };
```

---

## 12. Phase 4: TemplateResolver

### 12.1 What changes

Centralize template fallback assets and template defaulting logic.

```text
TemplateResolver
  -> resolveTemplateAssets(template)
  -> resolveFallbackAudio(template)
  -> resolveFallbackImage(template)
  -> validateTemplateAssetRefs(template)
```

### 12.2 Why

Hardcoded fallback URLs and default images must not live in both `TemplateBrowser.tsx` and `VideoForgePage.tsx`.

### 12.3 Risk reduced

- Dead fallback links.
- Mismatched default lore.
- UI-specific template behavior.
- Hard-to-test template apply flow.

### 12.4 Acceptance criteria

- One file owns default asset URLs.
- Quick apply and browser preview use the same resolver.
- Missing template asset resolves deterministically.
- Template resolver has unit tests.

---

## 13. Phase 5: AudioReactivityAdapter

### 13.1 What changes

Extract audio analysis and binding logic from the main page into a headless adapter or hook.

```text
AudioReactivityAdapter
  -> analyzeAudioClip(audioAsset)
  -> getAudioFeatures(clipId)
  -> bindFeatureToParam(binding)
  -> applyAudioReactivity(project, binding)
```

### 13.2 Why

Effects like Chroma Key, PixelBrain visualizers, brightness pulses, scale pulses, subtitles, spectrum overlays, and shader uniforms should be able to bind to RMS/beats without touching `VideoForgePage.tsx`.

### 13.3 Risk reduced

- Main page bloat.
- EffectsPanel cannot access audio features.
- Audio features tied to one UI flow.
- Repeated audio analysis.

### 13.4 Proposed binding shape

```ts
export interface AudioReactiveBinding {
  id: string;
  sourceClipId: string;
  targetClipId: string;
  targetKind: 'effect-param' | 'transform' | 'shader-uniform';
  targetPath: string;
  feature: 'rms' | 'peak' | 'beat' | 'spectralCentroid' | 'lowBand' | 'midBand' | 'highBand';
  scale: number;
  offset: number;
  smoothingMs: number;
}
```

---

## 14. Top 10 Most Common Pitfalls

| Rank | Pitfall | Symptom | Prevention | Retest |
|---:|---|---|---|---|
| 1 | Mutating nested clip objects in place | Undo/redo breaks, React misses updates, old refs change unexpectedly | Always return new clip object from mutator | Edit effect param, undo, redo, save/load |
| 2 | Rebuilding every track/clip on every edit | Timeline rerenders heavily, scrubbing gets sluggish | Preserve references for unaffected tracks/clips | Profile slider drag and scrub preview |
| 3 | Returning a new project for no-op edits | Infinite-ish update churn, unnecessary history entries | Return original project if clip/effect not found or value unchanged | Update missing clip ID and verify same object |
| 4 | Duplicating defaults in UI panels | Transform/effect defaults diverge between panels | Centralize defaults in resolver/registry | Add same effect from two entry points |
| 5 | Allowing optional arrays to stay undefined at mutation sites | `clip.effects?.map` silently skips updates | Normalize with `effects ?? []` inside mutator | Update effect on fresh clip with no effects array |
| 6 | Hardcoding animatable paths too early | New keyframe targets require switch edits everywhere | Use `AnimatableTargetRef` plus path resolver | Keyframe transform and effect param |
| 7 | Coupling adapter logic to React state | Cannot unit test without rendering components | Pure utility first, hook wrapper second | Run unit tests without jsdom if possible |
| 8 | Ignoring undo/history semantics | Timeline changes work but history snapshots are wrong | Verify whether undo stores object refs or serialized snapshots | Add effect, change param, undo twice |
| 9 | Hiding invalid IDs as successful updates | Buttons appear to work but state is unchanged | Dev diagnostics for missing clip/effect IDs | Trigger stale selected clip and confirm warning/error path |
| 10 | Refactoring too many systems in one PR | Breakage source becomes unclear | Phase mutation spine before registry/keyframes/audio | Keep PR 1 limited to known equivalent behavior |

---

## 15. Regression-Aware QA Checklist

### 15.1 Unit tests for `timelineMutator.ts`

- [ ] `mutateClip` updates only the matching clip.
- [ ] `mutateClip` returns the original project when clip is missing.
- [ ] `mutateClip` preserves unaffected track references.
- [ ] `mutateClip` preserves unaffected clip references.
- [ ] `addEffectToClip` appends an effect to an empty effect list.
- [ ] `addEffectToClip` appends an effect to an existing effect list.
- [ ] `removeEffectFromClip` removes only the matching effect ID.
- [ ] `removeEffectFromClip` does not modify unrelated effects.
- [ ] `updateEffectParam` updates only the matching effect.
- [ ] `updateEffectParam` preserves existing params.
- [ ] `setTransformDefault` fills missing transform fields.
- [ ] `setTransformDefault` preserves existing transform fields.
- [ ] `addLegacyTransition` preserves all other clip fields.

### 15.2 Integration tests or manual retests

- [ ] Add effect from EffectsPanel.
- [ ] Remove effect from EffectsPanel.
- [ ] Adjust effect slider rapidly.
- [ ] Add transition from TransitionPanel.
- [ ] Change transform defaults.
- [ ] Scrub after many edits.
- [ ] Save project.
- [ ] Reload project.
- [ ] Verify renderer reads updated clip state.
- [ ] Verify undo/redo if implemented.

### 15.3 Performance retests

- [ ] Slider drag does not stutter worse than before.
- [ ] Timeline scrub remains stable.
- [ ] Long project with many tracks updates only affected branch.
- [ ] No new memory leak from hook memoization.

---

## 16. Suggested Test Fixture

```ts
const project = {
  id: 'project-1',
  timeline: {
    tracks: [
      {
        id: 'track-1',
        clips: [
          { id: 'clip-1', effects: [] },
          { id: 'clip-2', effects: [{ id: 'fx-1', type: 'blur', params: { amount: 5 } }] },
        ],
      },
      {
        id: 'track-2',
        clips: [{ id: 'clip-3', effects: [] }],
      },
    ],
  },
};
```

Required assertions:

```ts
expect(next.timeline.tracks[0]).not.toBe(project.timeline.tracks[0]);
expect(next.timeline.tracks[1]).toBe(project.timeline.tracks[1]);
expect(next.timeline.tracks[0].clips[0]).toBe(project.timeline.tracks[0].clips[0]);
expect(next.timeline.tracks[0].clips[1]).not.toBe(project.timeline.tracks[0].clips[1]);
```

---

## 17. Rollback Plan

If the refactor causes UI regressions:

1. Keep `timelineMutator.ts` and its tests.
2. Revert only callsite migrations.
3. Re-migrate one component at a time.
4. Compare old helper output to new mutator output using snapshot tests.
5. Do not delete old helpers until new utility passes parity tests.

---

## 18. Acceptance Criteria

The PDR is complete when:

- [ ] `timelineMutator.ts` exists and passes unit tests.
- [ ] `useTimelineMutator.ts` exists and wraps the pure utility.
- [ ] `VideoForgePage.tsx` no longer owns duplicate effect mutation helpers.
- [ ] `EffectsPanel.tsx` no longer manually deep-mutates timeline clips.
- [ ] `TransitionPanel.tsx` calls shared transition mutation.
- [ ] Default transform logic is centralized.
- [ ] No user-facing behavior changes in PR 1.
- [ ] Save/load still works.
- [ ] Undo/redo still works if present.
- [ ] Manual QA checklist passes.

---

## 19. Implementation PR Plan

### PR 1: Mutation Spine

**Type:** Structural  
**Behavior change:** None intended  
**Files:**

```text
src/features/video-forge/lib/timelineMutator.ts
src/features/video-forge/hooks/useTimelineMutator.ts
tests/features/video-forge/timelineMutator.test.ts
```

**Callsites:**

```text
VideoForgePage.tsx
EffectsPanel.tsx
TransitionPanel.tsx
```

### PR 2: Effect Registry

**Type:** Structural with minor internal behavior normalization  
**Behavior change:** None intended for existing effects  
**Adds:** effect defaults, effect metadata, effect operation registry.

### PR 3: Animatable Mutator

**Type:** Architectural  
**Behavior change:** Keyframe system becomes path/target-generic  
**Adds:** generic keyframe support for effect params and shader uniforms.

### PR 4: Template Resolver

**Type:** Structural  
**Behavior change:** Missing template assets resolve through one deterministic path  
**Adds:** single source for fallback image/audio/template lore.

### PR 5: Audio Reactivity Adapter

**Type:** Architectural  
**Behavior change:** Audio feature binding becomes available outside main page  
**Adds:** headless feature extraction and parameter binding.

---

## 20. Next Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| Packet type mismatch | Proposed `VideoProjectPacketV1Like` may not match actual repo types | Replace temporary interfaces with real imports after inspection |
| Undo stack surprise | Ref preservation may change history behavior | Test undo/redo before deleting old helpers |
| Panel prop churn | Panels may receive old helpers as props | Migrate props in a separate commit from utility creation |
| Keyframe timing | Existing keyframe paths may rely on exact strings | Defer keyframe refactor to Phase 3 |
| Template coupling | Template quick apply may also create clips | Isolate resolver after timeline mutator stabilizes |
| Audio analysis cache | Reactivity may depend on component-local state | Extract only after mutation API is stable |

---

## 21. Final Architecture Target

```text
ProjectAdapter
  -> TimelineMutator
  -> ClipMutator
  -> EffectMutatorRegistry
  -> TransitionMutator
  -> AnimatableMutator
  -> TemplateResolver
  -> AudioReactivityAdapter
```

The end state is a VideoForge architecture where panels issue commands, adapters mutate packets, and the UI becomes a cockpit instead of a bloodstream.

