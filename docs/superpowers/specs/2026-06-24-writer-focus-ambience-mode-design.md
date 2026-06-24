# Writer Focus & Ambience Mode — Design

**Date:** 2026-06-24
**Status:** Approved (design); pending spec review
**Surface:** Read/Scribe IDE (`src/pages/Read/`)

## Summary

A minimalist **focus mode** for the Scribe IDE, aimed at writers, novelists, and
poets. A red button engraved with **"M"** collapses the multi-panel IDE down to a
single, centered writing surface on the clean Scholomance dark page, and layers in
**mixable ambient soundscapes** (rain, café plaza, wind through a house) to deepen
focus.

"WordPad" was the user's shorthand for *strip it to a bare writing surface* — this
is **not** a retro Windows reskin. The Scholomance dark aesthetic and TrueSight
word-coloring are retained.

## Goals

- One-tap toggle (the engraved red **M**) into and out of a distraction-free writing layout.
- Hide all IDE chrome in focus mode: TopBar, StatusBar, left sidebar (files/tools),
  right panel (Oracle/score/analysis), ambient canvas decorations. Center the editor.
- The **same** editor instance stays mounted — document, cursor, and TrueSight
  coloring are never lost on toggle.
- A **layered ambience mixer**: Rain, Café Plaza, and Wind-through-a-house can all
  play simultaneously, each with its own on/off + volume, under one master volume.
- Mix settings persist across sessions.

## Non-Goals

- No retro WordPad cosmetic chrome (menu bar, B/I/U toolbar, white page, MS Sans Serif).
- No new editor — reuse the existing `ScrollEditor` (`LexicalScrollEditor.jsx`).
- No reuse of the heavy school-station `ambientPlayer.service.js` (different job:
  music tracks, resonance timelines, tuning states). The mixer is a separate,
  lightweight Web Audio engine.
- No mobile-specific layout in v1 (focus mode targets the desktop IDE layout; mobile
  behavior is "M button hidden" — see Open Items resolved below).

## User Experience

**Entering:** The engraved red **M** button lives in the IDE `TopBar`. Clicking it
sets `focusMode = true`. The `ide-layout-wrapper` gains a `--focus` modifier class
that hides chrome via CSS and centers the editor column. The `AmbienceTray` mounts
in a corner.

**In focus mode:**
- Editor is centered on the dark page, comfortable max line-width for prose.
- A small floating engraved **M** orb persists in a corner to exit (so the button is
  never lost when the TopBar is hidden).
- **Esc** also exits.
- The `AmbienceTray` shows three channels (Rain / Café Plaza / Wind) each with a
  toggle and a volume slider, plus a master slider. The tray is collapsible so it can
  shrink to a single small icon.

**Exiting:** Clicking the floating M or pressing Esc sets `focusMode = false`, removes
the `--focus` class (chrome restored), and **fades the ambience out** over ~400ms. The
mix configuration (which channels were on, their volumes, master) is remembered for
next time.

## Architecture (state-driven toggle, no remount)

```
ReadPage.jsx  (owns focusMode state)
├─ ide-layout-wrapper (+ "ide-layout-wrapper--focus" when focusMode)
│   ├─ TopBar            (hidden by CSS in focus)   ── hosts <FocusModeButton variant="bar">
│   ├─ PanelGroup        (side/right panels hidden by CSS in focus)
│   │   └─ ScrollEditor  (STAYS MOUNTED; centered by CSS in focus)
│   └─ StatusBar         (hidden by CSS in focus)
├─ <FocusModeButton variant="floating">  (only rendered in focus)
└─ <AmbienceTray>        (only rendered in focus)
        │
        └─ useAmbienceMixer()  ──>  ambienceMixer.service.js  ──> Web Audio graph
```

The center editor (`ScrollEditor`) must **not** remount on toggle. `ReadPage.jsx:544`
already documents that changing its key remounts and loses the document. Therefore
focus mode is implemented as a **CSS class on the wrapper**, never by conditionally
unmounting/replacing the editor subtree.

## Components

### 1. `src/lib/ambient/ambienceMixer.service.js` (framework-free)

Web Audio engine. No React imports. Singleton accessor `getAmbienceMixerService()`.

- **Graph:** for each channel `{ rain, cafe, wind }`: a looping `AudioBufferSourceNode`
  (or `MediaElementSource` from a looping `<audio>`) → per-channel `GainNode` →
  master `GainNode` → `AudioContext.destination`.
- **Lazy context:** `AudioContext` is created on first `start()` / first channel-enable,
  triggered by a user gesture (browser autoplay policy). Until then the service holds
  desired state only.
- **API:**
  - `setChannelEnabled(id: 'rain'|'cafe'|'wind', enabled: boolean)` — ramps that
    channel's gain to its stored volume (enable) or to 0 (disable) over a short fade.
  - `setChannelVolume(id, value0to1)` — sets stored volume; ramps live gain if enabled.
  - `setMasterVolume(value0to1)` — ramps master gain.
  - `start()` / `stop()` — `stop()` ramps master to 0 then suspends; `start()` resumes.
  - `getState()` — `{ contextState, master, channels: { id: { enabled, volume } } }`.
  - `subscribe(listener)` — returns unsubscribe; fires on any state change.
- **Gain ramps:** use `setTargetAtTime` / `linearRampToValueAtTime` (~120ms channel
  fades, ~400ms master fade-out) to avoid clicks. This is the crossfade/blend behavior.
- **Robustness:** a failed buffer load marks that channel `unavailable` in state
  (never throws to the UI); other channels keep working. Resumes context on the
  documented recovery gestures if suspended.

### 2. `src/hooks/useAmbienceMixer.ts`

React binding over the service.

- Subscribes to the service, exposes `{ state, setChannelEnabled, setChannelVolume,
  setMasterVolume, start, stop }`.
- **Persistence:** reads/writes `localStorage` key `scholomance.focus.ambience.v1` =
  `{ master:number, channels: { rain:{enabled,volume}, cafe:{...}, wind:{...} } }`,
  matching the existing `scholomance.*.v1` convention. Restores saved mix on mount
  (but does not autoplay until a gesture).
- Ensures the hidden audio container exists (mirrors `useAmbientPlayer`'s
  `ensureAmbientPlayerContainer` pattern).

### 3. `WriterFocusMode` (CSS, no new heavy component)

Implemented as:
- A `--focus` modifier on `.ide-layout-wrapper` in `src/pages/Read/IDE.css` that:
  hides `.scholomance` TopBar/StatusBar, the side `Panel`s and resize handles, the
  ambient canvas; sets the editor `Panel` to full width; applies a centered prose
  column (`max-width`, auto margins, generous line-height).
- Respects `prefers-reduced-motion` for the enter/exit transition (project already
  has `usePrefersReducedMotion`).

### 4. `src/pages/Read/AmbienceTray.jsx`

The mixer UI.

- Three channel rows: **Rain**, **Café Plaza**, **Wind through a house** — each a
  toggle button (`aria-pressed`) + a labeled `range` slider (`aria-label`).
- A **Master** slider.
- Collapsible to a single small icon button; expanded by default on first entry.
- Disabled/"unavailable" affordance per channel if its asset failed to load.
- Styling consistent with existing IDE panels (reuses IDE.css design tokens).

### 5. `src/pages/Read/FocusModeButton.jsx`

The engraved red **M** button.

- `variant="bar"` — sits in `TopBar` (via `IDEChrome.jsx`), engraved-M styling, red.
- `variant="floating"` — small corner orb rendered only in focus mode.
- `onToggle` prop; `aria-pressed={focusMode}`; `title`/`aria-label` ("Focus mode").
- The engraving ("M") and red treatment are CSS (no external asset).

### 6. Wiring in `src/pages/Read/ReadPage.jsx`

- `const [focusMode, setFocusMode] = useState(false);`
- Add `ide-layout-wrapper--focus` to the wrapper `className` when `focusMode`.
- Render `<FocusModeButton variant="bar">` in the TopBar area; render
  `<FocusModeButton variant="floating">` and `<AmbienceTray>` only when `focusMode`.
- Global `Esc` key handler (while `focusMode`) → `setFocusMode(false)`.
- On exit, call the mixer's `stop()` (fade out).

## Data Flow

1. User clicks **M** → `setFocusMode(true)` → wrapper `--focus` class → chrome hidden,
   editor centered → `AmbienceTray` + floating M mount.
2. User toggles **Rain** → `useAmbienceMixer.setChannelEnabled('rain', true)` → service
   lazily creates `AudioContext` (gesture satisfied), starts the rain loop, ramps its
   gain up → audio plays under master gain.
3. User drags **Café** volume → `setChannelVolume('cafe', v)` → stored + live gain
   ramp; mix persisted to `localStorage`.
4. Multiple enabled channels sum into the master gain → blended atmosphere.
5. User presses **Esc** / floating **M** → `setFocusMode(false)` → mixer `stop()`
   (master fades to 0, context suspends) → chrome restored. Mix config remembered.

## Audio Assets

- Source three **seamless, royalty-free CC0** loops: rain, café/coffee-plaza murmur,
  wind through a house.
- Store under `public/audio/ambience/` as `rain.mp3`, `cafe.mp3`, `wind.mp3`, with
  `.ogg` siblings as fallback where practical.
- Loops must be gapless (trimmed at zero-crossings) for clean looping.
- Record provenance/license in `public/audio/ambience/CREDITS.md`.
- User may swap in their own files later by replacing the assets (filenames are the
  contract).

## Persistence

- **Mix config** (`scholomance.focus.ambience.v1`): persists across sessions.
- **Focus mode itself:** not persisted — every load boots into the normal IDE.

## Error Handling & Edge Cases

- **Autoplay policy:** no audio until the first user gesture (the channel toggle is
  itself the gesture). Service holds intended state until the context can start.
- **Asset load failure:** that channel is marked `unavailable`; tray disables its
  controls; other channels and the editor are unaffected. Never throws to the UI.
- **Context suspended/interrupted** (tab backgrounded, OS): resume on the documented
  recovery gestures (`pointerdown`/`keydown`/`touchstart`).
- **Reduced motion:** layout transition becomes instant; audio behavior unchanged.
- **Editor integrity:** no remount on toggle (CSS-only chrome hiding) — guaranteed by
  not changing the editor subtree or its key.
- **Mobile:** focus-mode button hidden on the mobile IDE layout in v1 (the mobile
  layout is a separate `ide-layout-wrapper--mobile` branch); revisit later.

## Accessibility

- M button: `aria-pressed`, `aria-label`, keyboard-focusable; Esc to exit documented.
- Tray sliders: each `range` has an explicit `aria-label`; toggles use `aria-pressed`.
- Tray is reachable by keyboard; focus order sensible after entering focus mode.
- Axe check on the tray (mirrors existing `tests/accessibility.test.jsx` pattern).

## Testing

- **Unit — `ambienceMixer.service`** (mocked `AudioContext`): channel enable ramps
  gain to stored volume; disable ramps to 0; master scaling; `stop()` fades + suspends;
  failed load → `unavailable`, others unaffected; `subscribe` fires on changes.
- **Hook — `useAmbienceMixer`**: persistence round-trip to
  `scholomance.focus.ambience.v1`; restores saved mix on mount without autoplaying.
- **Component — `AmbienceTray`**: renders 3 channels + master; toggle/slider call the
  right setters; unavailable channel disables its controls.
- **Component — `FocusModeButton`**: `onToggle` fires; `aria-pressed` reflects state;
  both variants render.
- **Integration — `ReadPage`**: clicking M adds `--focus` class and mounts the tray;
  Esc removes it; editor element identity is unchanged across toggle (no remount).
- **a11y**: axe has no violations on the tray and the focus-mode button.

## File Manifest

**New:**
- `src/lib/ambient/ambienceMixer.service.js`
- `src/hooks/useAmbienceMixer.ts`
- `src/pages/Read/AmbienceTray.jsx`
- `src/pages/Read/FocusModeButton.jsx`
- `public/audio/ambience/{rain,cafe,wind}.{mp3,ogg}` + `CREDITS.md`
- Tests under `tests/` mirroring the existing structure.

**Modified:**
- `src/pages/Read/ReadPage.jsx` — `focusMode` state, wrapper class, render tray/button, Esc handler.
- `src/pages/Read/IDEChrome.jsx` — host the bar-variant M button in `TopBar`.
- `src/pages/Read/IDE.css` — `.ide-layout-wrapper--focus` rules, tray + button styling.

## Resolved Decisions (from brainstorming)

- Focus, not retro WordPad skin; Scholomance dark theme + TrueSight retained.
- Layered mixer (multiple sounds at once), each with volume + master.
- M button in TopBar + floating-in-focus + Esc to exit.
- Ambience fades out on exit; mix settings persist; focus mode does not.
- Assets: CC0 loops sourced into the repo; filenames are the swap contract.
