# PDR: Scholomance Remotion Forge

## A Full Timeline Video Editor Built on Remotion, PixelBrain, Templates, Keyframes, Effects, and Export Contracts

## 1. Summary

**Project Name:** Scholomance Remotion Forge
**System Type:** Browser-based deterministic video editor
**Primary Renderer:** Remotion
**Canonical State:** `VideoProjectPacket-v1`
**Primary Goal:** Convert the current Remotion setup from a programmatic video renderer into a full editing environment with timeline tracks, keyframes, templates, transitions, animation presets, green screen, audio sync, PixelBrain visual layers, export presets, and reusable editing macros.

The editor should behave like a lightweight After Effects / CapCut / Windows Movie Maker hybrid, but with Scholomance DNA: structured state, deterministic rendering, bytecode errors, reusable templates, AI-readable packets, and Remotion as the final composition engine.

The core rule:

```text
The project packet is the edit.
Remotion is the renderer.
The preview is a projection.
Exports are compiled artifacts.
```

This prevents the editor from becoming a fragile pile of UI state. The UI edits the packet. Remotion reads the packet. Export compiles the packet.

---

## 2. Why

Your current Remotion setup already proves that programmatic video generation works. The missing layer is **authoring**.

Right now, the workflow is likely:

```text
idea -> code composition -> render
```

The target workflow becomes:

```text
assets -> timeline -> clips -> effects -> keyframes -> templates -> preview -> export
```

This unlocks:

1. **Manual editing** without rewriting code every time.
2. **Reusable templates** for lyric videos, shorts, visualizers, commentary, gameplay clips, album promos, and PixelBrain sequences.
3. **Keyframed control** for opacity, scale, position, rotation, blur, color, masks, audio-reactive effects, and green screen.
4. **AI-operable editing**, where agents can edit JSON safely instead of hallucinating React components.
5. **Deterministic render output**, because Remotion renders from a stable project packet.
6. **PixelBrain integration**, where generated lattices, shaders, and visual effects become first-class timeline layers.

The risk this reduces: without a packet-first editor, every new video becomes a one-off code ritual. Cool once, cursed at scale. This turns the spellbook into a machine.

---

## 3. Change Classification

**Architectural:** Introduces a video editor architecture around Remotion.

**Structural:** Adds timeline state, track models, clip schemas, keyframe engine, effect registry, asset registry, template registry, export service, and preview bridge.

**Behavioral:** Adds new editing behavior: drag clips, trim clips, layer clips, keyframe properties, apply transitions, chroma key video, render templates, and export.

**Cosmetic:** Adds editor panels, inspectors, timeline UI, waveform displays, preview controls, and template browsers.

---

## 4. Assumptions

1. Current Remotion setup already renders React-based compositions.
2. The app is web-based, likely Vite/React.
3. FFmpeg may be added for transcoding, thumbnailing, waveform extraction, proxy generation, and final muxing.
4. PixelBrain assets should remain canonical as packets, not raster screenshots.
5. The editor should support both human editing and AI editing.
6. The first version should prioritize local/browser authoring with possible Node backend helpers for heavy video processing.

---

## 5. Non-Negotiable Laws

### 5.1 Packet Authority

The editor must store the entire project in a canonical packet:

```ts
VideoProjectPacket-v1
```

The UI is not the source of truth. Remotion is not the source of truth. Exported MP4 files are not the source of truth.

### 5.2 Deterministic Render

Same packet plus same assets plus same render settings must produce the same output.

Avoid canonical dependence on:

```ts
Date.now()
Math.random()
performance.now()
ambient frame state
DOM layout measurements
```

Use seeded randomness, frame numbers, timeline time, deterministic hashes, and explicit project metadata.

### 5.3 Remotion as Compiler Target

Remotion should not be the editor state. Remotion should be the compiler target.

```text
VideoProjectPacket-v1 -> RemotionCompositionTree -> Render
```

### 5.4 Effects Are Processors

Effects should behave like registered processors, similar to your existing extension pattern. Each effect declares:

```ts
consumes
emits
parameters
default values
render behavior
preview behavior
validation
```

### 5.5 Keyframes Are Universal

Every animatable property should use the same keyframe model:

```ts
position.x
position.y
scale
rotation
opacity
blur
volume
chroma.threshold
mask.feather
shader.uniforms.intensity
```

No one-off animation systems per component.

### 5.6 Templates Are Editable Graphs

A template is not just a React component. A template is:

```text
tracks + clips + effects + keyframes + placeholders + constraints
```

React/Remotion renders it, but the template itself is data.

---

## 6. Core System Architecture

```text
┌──────────────────────────────────────────┐
│ Editor UI                                │
│ Timeline, preview, inspector, templates  │
└───────────────────┬──────────────────────┘
                    │ edits
                    ▼
┌──────────────────────────────────────────┐
│ VideoProjectPacket-v1                    │
│ canonical project state                  │
└───────────────────┬──────────────────────┘
                    │ compile
                    ▼
┌──────────────────────────────────────────┐
│ Remotion Composition Compiler            │
│ packet -> React composition tree         │
└───────────────────┬──────────────────────┘
                    │ preview/render
                    ▼
┌──────────────────────────────────────────┐
│ Remotion Preview + Render                │
│ browser preview, server export           │
└───────────────────┬──────────────────────┘
                    │ export
                    ▼
┌──────────────────────────────────────────┐
│ Export Pipeline                          │
│ mp4, webm, mov, gif, png sequence, json  │
└──────────────────────────────────────────┘
```

---

## 7. Proposed Directory Structure

```text
src/
  editor/
    video/
      components/
        VideoEditorPage.tsx
        TimelinePanel.tsx
        TimelineTrack.tsx
        TimelineClip.tsx
        PreviewViewport.tsx
        InspectorPanel.tsx
        KeyframeEditor.tsx
        EffectsPanel.tsx
        TemplateBrowser.tsx
        AssetBin.tsx
        ExportPanel.tsx

      core/
        video-project-packet.ts
        video-project-normalize.ts
        video-project-validate.ts
        timeline-engine.ts
        keyframe-engine.ts
        easing-engine.ts
        template-engine.ts
        effect-registry.ts
        transition-registry.ts
        asset-registry.ts
        render-compiler.ts
        export-pipeline.ts
        autosave-engine.ts
        undo-redo-engine.ts

      effects/
        fade.ts
        transform.ts
        blur.ts
        color-grade.ts
        chroma-key.ts
        mask.ts
        crop.ts
        speed-ramp.ts
        text-animation.ts
        pixelbrain-effect.ts
        audio-reactive.ts

      templates/
        lyric-video-template.ts
        short-form-caption-template.ts
        music-visualizer-template.ts
        podcast-clip-template.ts
        album-promo-template.ts
        pixelbrain-showcase-template.ts
        green-screen-reaction-template.ts

      remotion/
        RootComposition.tsx
        TimelineComposition.tsx
        ClipRenderer.tsx
        EffectStackRenderer.tsx
        TransitionRenderer.tsx
        TextRenderer.tsx
        PixelBrainLayerRenderer.tsx
        AudioRenderer.tsx

      schemas/
        VideoProjectPacket.v1.schema.ts
        Clip.v1.schema.ts
        Effect.v1.schema.ts
        Keyframe.v1.schema.ts
        Template.v1.schema.ts
```

---

## 8. Canonical Data Model

### 8.1 VideoProjectPacket-v1

```ts
type VideoProjectPacketV1 = {
  schema: 'scholomance.video.project.v1';
  projectId: string;
  title: string;

  canvas: {
    width: number;
    height: number;
    fps: number;
    durationFrames: number;
    backgroundColor: string;
  };

  timeline: {
    tracks: TimelineTrack[];
    markers: TimelineMarker[];
    snapping: TimelineSnappingConfig;
  };

  assets: AssetRecord[];

  templates: AppliedTemplateRecord[];

  renderSettings: {
    format: 'mp4' | 'webm' | 'mov' | 'gif' | 'png-sequence';
    codec?: string;
    bitrate?: string;
    audioCodec?: string;
    quality?: number;
  };

  metadata: {
    createdAt?: string;
    updatedAt?: string;
    generator: 'scholomance-remotion-forge';
    version: string;
  };

  diagnostics: VideoDiagnostic[];
};
```

### 8.2 Tracks

```ts
type TimelineTrack = {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image' | 'text' | 'shape' | 'pixelbrain' | 'adjustment';
  locked: boolean;
  muted: boolean;
  visible: boolean;
  height: number;
  order: number;
  clips: TimelineClip[];
};
```

### 8.3 Clips

```ts
type TimelineClip = {
  id: string;
  trackId: string;
  assetId?: string;

  kind:
    | 'video'
    | 'audio'
    | 'image'
    | 'text'
    | 'shape'
    | 'solid'
    | 'pixelbrain'
    | 'template'
    | 'adjustment';

  startFrame: number;
  durationFrames: number;
  sourceStartFrame?: number;
  sourceDurationFrames?: number;

  transform: TransformState;
  opacity: AnimatableNumber;
  effects: EffectInstance[];
  transitions: ClipTransitionBinding[];

  keyframes: KeyframeTrack[];

  metadata?: Record<string, unknown>;
};
```

### 8.4 Transform State

```ts
type TransformState = {
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
};
```

### 8.5 Universal Animatable Property

```ts
type AnimatableNumber = {
  defaultValue: number;
  keyframes?: Keyframe[];
};
```

### 8.6 Keyframes

```ts
type Keyframe = {
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
};
```

---

## 9. Timeline Engine

### 9.1 Required Features

The timeline must support:

* Multiple tracks
* Drag to move clip
* Drag edges to trim clip
* Split clip at playhead
* Ripple edit toggle
* Magnetic snapping
* Markers
* Zoom in/out
* Frame-accurate playhead
* Track lock
* Track mute
* Track visibility
* Clip grouping
* Nested templates
* Adjustment layers
* Timeline search
* Undo/redo

### 9.2 Timeline Operations

```ts
moveClip(clipId, targetTrackId, newStartFrame)
trimClipStart(clipId, newStartFrame)
trimClipEnd(clipId, newEndFrame)
splitClip(clipId, splitFrame)
duplicateClip(clipId)
deleteClip(clipId)
groupClips(clipIds)
ungroupClipGroup(groupId)
addMarker(frame, label)
setTrackVisibility(trackId, visible)
setTrackMuted(trackId, muted)
```

### 9.3 Collision Policy

Default behavior:

```text
If a clip is moved into another clip on the same track, do not overwrite.
Either block, ripple, or move to a new track depending on edit mode.
```

Edit modes:

```ts
type TimelineEditMode = 'overwrite' | 'insert' | 'ripple' | 'magnetic' | 'freeform';
```

---

## 10. Keyframe Engine

### 10.1 Supported Properties

Minimum keyframe targets:

```text
transform.position.x
transform.position.y
transform.scale.x
transform.scale.y
transform.rotation
opacity
volume
blur.amount
crop.left
crop.right
crop.top
crop.bottom
mask.feather
mask.expansion
chroma.threshold
chroma.softness
color.brightness
color.contrast
color.saturation
shader.uniforms.*
pixelbrain.material.intensity
```

### 10.2 Interpolation

```ts
evaluateKeyframes({
  keyframes,
  frame,
  defaultValue,
  interpolation,
});
```

Rules:

* Before first keyframe: use first value or default.
* After last keyframe: use last value.
* Between keyframes: interpolate by easing.
* `hold` keeps previous value.
* `angle` interpolation should avoid sudden 359° to 0° spins.
* `color` interpolation should use RGB or HSL mode explicitly.

### 10.3 Keyframe UX

* Diamond keyframe toggle beside every animatable property.
* Mini curve editor.
* Timeline lane expansion per clip.
* Copy/paste keyframes.
* Reverse keyframes.
* Scale keyframe timing.
* Snap keyframes to beats or markers.
* Keyframe presets.

---

## 11. Effects Registry

### 11.1 Effect Contract

```ts
type VideoEffectDefinition = {
  id: string;
  name: string;
  category:
    | 'transform'
    | 'color'
    | 'blur'
    | 'transition'
    | 'mask'
    | 'keying'
    | 'audio'
    | 'pixelbrain'
    | 'stylize'
    | 'utility';

  parameters: EffectParameterDefinition[];

  defaultParams: Record<string, unknown>;

  validate(params: Record<string, unknown>): EffectValidationResult;

  render(input: EffectRenderInput): React.ReactNode;
};
```

### 11.2 Effect Instance

```ts
type EffectInstance = {
  id: string;
  effectId: string;
  enabled: boolean;
  order: number;
  params: Record<string, AnimatableNumber | string | boolean | number>;
};
```

### 11.3 Required Effects

#### Transform

* Position
* Scale
* Rotation
* Anchor point
* Flip horizontal
* Flip vertical

#### Opacity

* Fade in
* Fade out
* Blink
* Pulse

#### Blur

* Gaussian blur
* Directional blur
* Motion blur
* Radial blur

#### Color

* Brightness
* Contrast
* Saturation
* Hue rotate
* Tint
* Duotone
* LUT placeholder
* Black and white
* Invert
* Posterize

#### Chroma Key / Green Screen

* Key color picker
* Threshold
* Softness
* Spill suppression
* Edge feather
* Matte preview
* Garbage mask
* Despill tint

#### Masking

* Rectangle mask
* Ellipse mask
* Polygon mask
* Feather
* Invert
* Track matte
* Alpha matte
* Luma matte

#### Crop

* Crop left/right/top/bottom
* Auto-fit
* Fill canvas
* Letterbox
* Vertical short crop

#### Time

* Speed change
* Freeze frame
* Reverse clip
* Hold frame
* Speed ramp

#### Text

* Typewriter
* Word pop
* Karaoke highlight
* Caption bounce
* Glitch text
* Stroke
* Shadow
* Background plate

#### Audio Reactive

* Scale to volume
* Glow to volume
* Shake to beat
* Lyric syllable pulse
* Bass hit flash
* Spectrum bars

#### PixelBrain

* PixelBrain packet layer
* Lattice zoom
* Shader packet layer
* Symmetry reveal
* Gear glide rotation
* Noise texture overlay
* Bytecode glyph crawl
* Construction-line reveal

---

## 12. Transitions

### 12.1 Transition Contract

```ts
type TransitionDefinition = {
  id: string;
  name: string;
  params: TransitionParameterDefinition[];
  render(input: TransitionRenderInput): React.ReactNode;
};
```

### 12.2 Required Transitions

* Crossfade
* Fade to black
* Fade to white
* Dip to color
* Slide left/right/up/down
* Push
* Wipe
* Radial wipe
* Zoom blur
* Spin
* Glitch cut
* Film burn
* Pixel dissolve
* Luma fade
* Mask reveal
* Whip pan
* Flash cut
* Stutter cut

### 12.3 Transition Storage

```ts
type ClipTransitionBinding = {
  id: string;
  transitionId: string;
  side: 'in' | 'out';
  durationFrames: number;
  params: Record<string, unknown>;
};
```

### 12.4 Transition Rule

Transitions should be compiled from clip overlap or explicit clip-side bindings.

```text
Clip A out transition + Clip B in transition -> transition render window
```

---

## 13. Template System

### 13.1 Template Contract

```ts
type VideoTemplateDefinition = {
  id: string;
  name: string;
  category:
    | 'lyric-video'
    | 'music-visualizer'
    | 'short-form'
    | 'podcast'
    | 'album-promo'
    | 'gameplay'
    | 'green-screen'
    | 'pixelbrain';

  placeholders: TemplatePlaceholder[];
  defaultProject: Partial<VideoProjectPacketV1>;
  constraints: TemplateConstraint[];
};
```

### 13.2 Placeholder Types

```ts
type TemplatePlaceholder =
  | { id: string; type: 'video'; label: string; required: boolean }
  | { id: string; type: 'audio'; label: string; required: boolean }
  | { id: string; type: 'image'; label: string; required: boolean }
  | { id: string; type: 'text'; label: string; required: boolean }
  | { id: string; type: 'color'; label: string; required: boolean }
  | { id: string; type: 'pixelbrain-packet'; label: string; required: boolean };
```

### 13.3 Required Templates

#### Lyric Video Template

* Audio track
* Background visual layer
* Lyric text layer
* Per-line timing
* Karaoke highlight mode
* Word pop animation
* Optional PixelBrain reactive layer

#### Music Visualizer Template

* Audio track
* Spectrum layer
* Waveform layer
* Center logo/image
* Beat flash
* BPM-synced rotation

#### Short-Form Caption Template

* 9:16 canvas
* Caption safe zone
* Auto text chunks
* Punch-in zooms
* Subtitle emphasis
* Progress bar

#### Album Promo Template

* Square or vertical canvas
* Album cover
* Track title
* Artist name
* Audio snippet
* Fade in/out
* Streaming CTA

#### Green Screen Reaction Template

* Background video/image
* Foreground keyed clip
* Chroma key effect
* Garbage matte
* Drop shadow
* Auto-fit layout

#### PixelBrain Showcase Template

* PixelBrain packet layer
* Construction-line intro
* Lattice reveal
* Shader pass
* Final art reveal
* Metadata title card

---

## 14. Green Screen System

### 14.1 Chroma Key Effect Parameters

```ts
type ChromaKeyParams = {
  keyColor: string;
  threshold: number;
  softness: number;
  spillSuppression: number;
  edgeFeather: number;
  matteView: boolean;
  despillColor?: string;
};
```

### 14.2 Implementation Strategy

MVP can use CSS/SVG/canvas filter approximation for preview, but production quality should use one of:

1. WebGL shader effect in preview.
2. Remotion canvas processing.
3. FFmpeg chromakey filter during export.
4. Hybrid: approximate preview, final FFmpeg pass.

### 14.3 QA Requirements

* Green background removal.
* Blue background removal.
* Hair/edge softness.
* Spill suppression.
* Transparent export compatibility.
* Preview and final render must not diverge beyond accepted tolerance.

---

## 15. Audio System

### 15.1 Required Audio Features

* Import audio
* Waveform preview
* Volume keyframes
* Fade in/out
* Crossfade
* Mute/solo
* Audio trim
* Beat markers
* BPM metadata
* Audio-reactive animation
* Export audio muxing

### 15.2 Audio Analysis Packet

```ts
type AudioAnalysisPacket = {
  assetId: string;
  durationSeconds: number;
  sampleRate: number;
  bpm?: number;
  beats: number[];
  peaks: number[];
  rms: number[];
  waveformPreview: number[];
};
```

### 15.3 Beat Sync

All beat-synced motion should use absolute timeline time, not accumulated frame deltas.

```ts
timeSeconds = frame / fps;
beatPhase = (timeSeconds * bpm / 60) % 1;
```

This follows the same principle as the existing Gear Glide style of absolute-time rotation.

---

## 16. Remotion Compiler

### 16.1 Compiler Responsibility

The compiler converts the project packet into renderable Remotion components.

```ts
compileVideoProjectToRemotion(project: VideoProjectPacketV1): RemotionCompositionPlan
```

### 16.2 Render Flow

```text
RootComposition
  -> TimelineComposition
    -> tracks sorted by order
      -> clips active at current frame
        -> source renderer
        -> effect stack
        -> transitions
        -> final layer
```

### 16.3 Clip Active Test

```ts
function isClipActive(clip, frame) {
  return frame >= clip.startFrame
    && frame < clip.startFrame + clip.durationFrames;
}
```

### 16.4 Clip Local Frame

```ts
function getClipLocalFrame(clip, globalFrame) {
  return globalFrame - clip.startFrame + (clip.sourceStartFrame ?? 0);
}
```

### 16.5 Effect Stack Rule

```text
Source -> Transform -> Effects -> Mask -> Transition -> Composite
```

Adjustment layers apply to all visible clips underneath within the adjustment layer time range.

---

## 17. PixelBrain Integration

### 17.1 PixelBrain as Timeline Layer

PixelBrain packets should be importable as timeline assets:

```ts
type PixelBrainAssetTimelineRecord = {
  assetId: string;
  kind: 'pixelbrain';
  packet: PixelBrainAssetPacket;
  renderMode: 'source' | 'material' | 'shader' | 'construction' | 'lattice';
};
```

### 17.2 PixelBrain Effects

* Lattice reveal
* Construction skeleton reveal
* Shader glow
* Symmetry unfold
* Material transmutation
* Beat pulse
* Coordinate drift
* Pixel dissolve
* Procedural noise overlay

### 17.3 Canonical Rule

Do not flatten PixelBrain assets into PNG unless export requires it. Store the packet and derive preview/render packets.

---

## 18. Asset Bin

### 18.1 Supported Asset Types

```text
video
audio
image
font
json
pixelbrain-packet
shader-packet
subtitle
template
```

### 18.2 Asset Record

```ts
type AssetRecord = {
  id: string;
  type: AssetType;
  name: string;
  sourceUri: string;
  thumbnailUri?: string;
  metadata: {
    width?: number;
    height?: number;
    durationFrames?: number;
    fps?: number;
    sampleRate?: number;
    channels?: number;
    sizeBytes?: number;
  };
};
```

### 18.3 Asset Processing

On import:

* Validate type.
* Probe metadata.
* Generate thumbnail.
* Generate waveform for audio.
* Generate proxy for heavy video.
* Register asset.
* Emit diagnostics.

---

## 19. Export Pipeline

### 19.1 Export Targets

* MP4 H.264
* MP4 H.265 optional
* WebM
* MOV with alpha optional
* GIF
* PNG sequence
* WAV audio
* Project JSON
* Template JSON
* PixelBrain-enhanced metadata packet

### 19.2 Export Presets

```ts
type ExportPreset =
  | 'youtube-1080p'
  | 'youtube-4k'
  | 'tiktok-vertical'
  | 'instagram-reel'
  | 'soundcloud-square'
  | 'transparent-overlay'
  | 'lossless-master'
  | 'draft-preview';
```

### 19.3 Export Settings

```ts
type ExportSettings = {
  preset: ExportPreset;
  width: number;
  height: number;
  fps: number;
  format: string;
  codec: string;
  bitrate: string;
  audioCodec: string;
  audioBitrate: string;
  includeAlpha?: boolean;
};
```

### 19.4 Export Flow

```text
Validate project
  -> resolve assets
  -> compile Remotion composition
  -> render frames/video
  -> mux audio
  -> run optional FFmpeg postprocess
  -> write artifact
  -> write export manifest
```

---

## 20. Undo / Redo

### 20.1 Command Pattern

Every edit should be a command:

```ts
type EditorCommand = {
  id: string;
  label: string;
  apply(project: VideoProjectPacketV1): VideoProjectPacketV1;
  revert(project: VideoProjectPacketV1): VideoProjectPacketV1;
};
```

### 20.2 Required Commands

* Add clip
* Move clip
* Trim clip
* Split clip
* Delete clip
* Add keyframe
* Move keyframe
* Delete keyframe
* Apply effect
* Remove effect
* Change effect parameter
* Apply template
* Import asset
* Change canvas
* Change export preset

---

## 21. Autosave and Versioning

### 21.1 Autosave

Autosave should store:

```text
project packet
asset references
editor view state
undo history optional
last preview frame
```

### 21.2 Project Versions

```ts
type ProjectSnapshot = {
  snapshotId: string;
  projectId: string;
  createdAt: string;
  label?: string;
  packet: VideoProjectPacketV1;
};
```

### 21.3 Recovery

If the editor crashes, recover from the latest valid packet.

If validation fails, surface a bytecode-style diagnostic instead of corrupting the project.

---

## 22. Error System

### 22.1 Diagnostic Categories

```ts
type VideoDiagnosticCategory =
  | 'SCHEMA'
  | 'ASSET'
  | 'TIMELINE'
  | 'KEYFRAME'
  | 'EFFECT'
  | 'RENDER'
  | 'EXPORT'
  | 'AUDIO'
  | 'PIXELBRAIN';
```

### 22.2 Example Error

```ts
{
  category: 'TIMELINE',
  severity: 'CRIT',
  code: 'CLIP_OUT_OF_BOUNDS',
  message: 'Clip starts before frame 0.',
  context: {
    clipId: 'clip_123',
    startFrame: -12
  }
}
```

### 22.3 Fatal Conditions

* Missing required asset.
* Clip references nonexistent track.
* Clip duration is zero or negative.
* Canvas width or height is zero.
* FPS is invalid.
* Effect parameter fails schema.
* Template placeholder is required but unresolved.
* Export target unsupported.
* Remotion compile fails.

---

## 23. MVP Milestones

### Phase 1: Packet Foundation

**Goal:** Create canonical project schema.

Deliverables:

* `VideoProjectPacket-v1`
* Normalizer
* Validator
* Asset registry
* Timeline model
* Keyframe model
* Basic tests

Success condition:

```text
A project packet can be created, validated, saved, loaded, and compiled into a blank Remotion composition.
```

### Phase 2: Basic Timeline Editor

**Goal:** Human-editable timeline.

Deliverables:

* Timeline UI
* Tracks
* Clips
* Drag/move
* Trim
* Split
* Delete
* Preview playhead
* Undo/redo

Success condition:

```text
User can import video/audio/image, arrange clips, preview the edit, and save project JSON.
```

### Phase 3: Remotion Render Compiler

**Goal:** Render real timeline through Remotion.

Deliverables:

* `TimelineComposition`
* Clip renderers
* Text renderer
* Image renderer
* Video renderer
* Audio renderer
* Transform renderer
* Opacity renderer

Success condition:

```text
The Remotion preview accurately renders the timeline packet.
```

### Phase 4: Keyframes

**Goal:** Universal animation system.

Deliverables:

* Keyframe UI
* Keyframe evaluator
* Easing engine
* Transform keyframes
* Opacity keyframes
* Volume keyframes

Success condition:

```text
User can animate position, scale, rotation, opacity, and volume over time.
```

### Phase 5: Effects and Transitions

**Goal:** Editing feels alive.

Deliverables:

* Effect registry
* Fade in/out
* Blur
* Color correction
* Crop
* Mask
* Crossfade
* Slide
* Wipe
* Glitch cut
* Pixel dissolve

Success condition:

```text
Effects can be stacked, reordered, keyframed, validated, previewed, and rendered.
```

### Phase 6: Green Screen

**Goal:** Real compositing.

Deliverables:

* Chroma key effect
* Color picker
* Threshold
* Softness
* Spill suppression
* Matte preview
* Garbage mask

Success condition:

```text
User can key green screen footage over another clip and export the result.
```

### Phase 7: Templates

**Goal:** Make repeatable video formats.

Deliverables:

* Template registry
* Placeholder system
* Lyric video template
* Music visualizer template
* Shorts caption template
* Album promo template
* PixelBrain showcase template
* Green screen reaction template

Success condition:

```text
User can pick a template, fill placeholders, customize timing, and render.
```

### Phase 8: Audio Reactive

**Goal:** Music video forge.

Deliverables:

* Waveform generation
* BPM detection input
* Beat markers
* Volume analysis
* Audio-reactive effects
* Lyric timing import

Success condition:

```text
Visual layers can pulse, rotate, scale, glow, or cut based on audio markers.
```

### Phase 9: Export Pipeline

**Goal:** Final usable editor.

Deliverables:

* Export panel
* MP4 export
* WebM export
* GIF export
* PNG sequence export
* Draft preview export
* Export manifest

Success condition:

```text
User can produce final video files from the timeline editor.
```

---

## 24. Full Feature Checklist

### Timeline

* [ ] Tracks
* [ ] Clips
* [ ] Trim
* [ ] Split
* [ ] Ripple edit
* [ ] Snapping
* [ ] Markers
* [ ] Clip groups
* [ ] Nested templates
* [ ] Adjustment layers
* [ ] Track mute
* [ ] Track lock
* [ ] Track visibility

### Preview

* [ ] Play/pause
* [ ] Frame step
* [ ] Zoom preview
* [ ] Safe zones
* [ ] Transparent checkerboard
* [ ] Fullscreen preview
* [ ] Render quality toggle

### Keyframes

* [ ] Add/delete keyframe
* [ ] Move keyframe
* [ ] Copy/paste keyframe
* [ ] Curve editor
* [ ] Easing presets
* [ ] Beat snapping
* [ ] Property lanes

### Effects

* [ ] Fade
* [ ] Transform
* [ ] Blur
* [ ] Color grade
* [ ] Crop
* [ ] Mask
* [ ] Chroma key
* [ ] Audio reactive
* [ ] PixelBrain layer effects
* [ ] Text animation

### Templates

* [ ] Lyric video
* [ ] Music visualizer
* [ ] Shorts captions
* [ ] Album promo
* [ ] Green screen reaction
* [ ] PixelBrain showcase
* [ ] Custom template save

### Export

* [ ] MP4
* [ ] WebM
* [ ] GIF
* [ ] PNG sequence
* [ ] Audio-only
* [ ] Project JSON
* [ ] Template JSON
* [ ] Export manifest

---

## 25. Specific Retest Steps

### Packet Validation

1. Create empty project.
2. Save project.
3. Reload project.
4. Validate schema.
5. Confirm no missing track/clip references.

### Timeline

1. Add three tracks.
2. Import image, video, audio.
3. Move clips across tracks.
4. Trim clip start and end.
5. Split clip at playhead.
6. Undo and redo every operation.

### Keyframes

1. Add opacity keyframes.
2. Add position keyframes.
3. Add scale keyframes.
4. Scrub timeline.
5. Confirm values interpolate correctly.
6. Export and compare preview behavior.

### Effects

1. Apply fade in.
2. Apply fade out.
3. Stack blur and color correction.
4. Disable one effect.
5. Reorder effects.
6. Confirm render changes match stack order.

### Green Screen

1. Add background image.
2. Add foreground green screen video.
3. Apply chroma key.
4. Adjust threshold and softness.
5. Toggle matte preview.
6. Export and inspect edges.

### Templates

1. Apply lyric template.
2. Fill text/audio placeholders.
3. Replace background.
4. Save as custom template.
5. Reopen and render.

### Export

1. Export draft MP4.
2. Export vertical short.
3. Export square SoundCloud promo.
4. Export PNG sequence.
5. Confirm audio sync.
6. Confirm duration matches project packet.

---

## 26. Risks

### Risk 1: UI State Becomes Canonical

**Danger:** Timeline UI mutates local state that diverges from packet.

**Mitigation:** All UI edits dispatch commands that produce a new packet.

### Risk 2: Preview and Export Diverge

**Danger:** Browser preview uses one effect implementation, final export uses another.

**Mitigation:** Shared effect parameters, shared evaluator, documented preview/export differences.

### Risk 3: Keyframe System Fragments

**Danger:** Text animations, transforms, effects, and audio all invent separate keyframe logic.

**Mitigation:** One universal keyframe evaluator.

### Risk 4: Green Screen Quality Is Weak

**Danger:** CSS-only chroma key looks bad.

**Mitigation:** Use shader/FFmpeg production pass after MVP.

### Risk 5: Remotion Components Become Hardcoded Templates

**Danger:** Templates become React code instead of editable project graphs.

**Mitigation:** Template definitions must emit timeline packets with placeholders.

### Risk 6: Heavy Videos Kill Browser Performance

**Danger:** Large files stall preview.

**Mitigation:** Proxy generation, thumbnails, waveform caching, preview quality toggle.

### Risk 7: Effects Become Unbounded

**Danger:** Effects become random bespoke components.

**Mitigation:** Registry contract with validation, categories, params, and test cases.

---

## 27. Recommended First Build Order

Build in this order:

```text
1. VideoProjectPacket-v1
2. Timeline packet operations
3. Remotion compiler
4. Minimal editor UI
5. Transform and opacity keyframes
6. Fade transitions
7. Asset bin
8. Audio waveform
9. Templates
10. Green screen
11. Export presets
12. PixelBrain advanced layers
```

The first slice should be tiny but complete:

```text
Import image + audio
place on timeline
keyframe opacity
preview in Remotion
export MP4
save/load project JSON
```

That is the seed crystal. Everything else grows from it.

---

## 28. Definition of Done

This project is “fully fledged” when:

1. A non-coder can assemble a video on a timeline.
2. A coder can generate/edit the same video through JSON.
3. Remotion can render the packet without manual composition edits.
4. Templates can be applied, customized, saved, and reused.
5. Effects can be stacked, keyframed, previewed, and exported.
6. Green screen compositing works well enough for real content.
7. Audio sync survives preview and export.
8. PixelBrain assets can appear as editable timeline layers.
9. Export presets produce platform-ready files.
10. Broken project states fail loudly with precise diagnostics.

---

## 29. North Star

Scholomance Remotion Forge should become:

```text
A deterministic video spellforge where timelines are packets,
effects are processors, templates are reusable rituals,
and Remotion is the final renderer.
```

Not just a video editor.

A machine that turns Vaelrix’s visuals, lyrics, PixelBrain assets, and audio into finished media without forcing every video to become a new engineering boss fight.
