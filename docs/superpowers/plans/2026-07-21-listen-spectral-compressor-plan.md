# Listen Page Dual-Trace FFT Spectral Dynamics Console Implementation Plan

> **Goal:** Transform the Phoneme Density compressor in `ComposeSignalChamberAdapter.tsx` into a **Dual-Trace FFT Spectral Dynamics Console** with a strictly locked fixed-height layout, eliminating layout shift (expand/shrink) and providing a multi-trace spectral graph.

---

## User Review Checkpoints
> [!IMPORTANT]
> The plan is broken down into small, verified tasks with test checkpoints after each task.

---

## Proposed Changes

### 1. `src/pages/Listen/ComposeSignalChamberAdapter.tsx`
- Lock container layout dimensions (`height: 190px; flex-shrink: 0; overflow: hidden;`).
- Permanently render `.compressor-limiter-banner` in the DOM layout slot (`height: 22px`) with `opacity: 0; visibility: hidden;` when inactive and `opacity: 1; visibility: visible;` when active.
- Render SVG micro-canvas (`0 0 160 70`) with logarithmic grid lines (`100Hz`, `1kHz`, `10kHz`).
- Render `.spectral-trace-a` (spectral FFT energy contour path) and `.spectral-trace-b` (dynamic threshold ceiling & suppression fill).

### 2. `src/pages/Listen/ListenPage.css`
- Add CSS rules locking `.compressor-console` to `height: 190px`, `flex-shrink: 0`, `overflow: hidden`.
- Add CSS rules for `.compressor-limiter-banner` fixed height reservation and opacity transition.
- Add CSS rules for `.spectral-trace-a`, `.spectral-trace-b`, and `.spectral-suppression-fill`.

### 3. `tests/qa/features/compose-signal-chamber-kit.test.ts`
- Add unit test cases asserting fixed container layout, permanent banner slot, and dual-trace SVG elements.

---

## Plan Tasks

### Task 1: Add Unit Tests for Dual-Trace FFT Spectral Dynamics Console
- **Files:** `tests/qa/features/compose-signal-chamber-kit.test.ts`
- **Steps:**
  1. Add tests checking for `.spectral-trace-a`, `.spectral-trace-b`, SVG viewBox `0 0 160 70`, and permanent `.compressor-limiter-banner` slot.
  2. Run `npx vitest run tests/qa/features/compose-signal-chamber-kit.test.ts` to confirm failure.
  3. Commit test updates.

### Task 2: Implement Fixed-Height Layout & Permanent Limiter Banner Slot
- **Files:** `src/pages/Listen/ComposeSignalChamberAdapter.tsx`, `src/pages/Listen/ListenPage.css`
- **Steps:**
  1. Set `.compressor-console` CSS height to `190px`, `flex-shrink: 0`, `overflow: hidden`.
  2. Permanently render `.compressor-limiter-banner` with fixed `22px` height reservation and toggle `opacity: 0` vs `opacity: 1`.
  3. Verify sidebar no longer expands or shrinks when limiting state toggles.

### Task 3: Implement Dual-Trace FFT Spectral Dynamics SVG Graph
- **Files:** `src/pages/Listen/ComposeSignalChamberAdapter.tsx`, `src/pages/Listen/ListenPage.css`
- **Steps:**
  1. Construct `0 0 160 70` SVG canvas with logarithmic grid lines (`100Hz`, `1kHz`, `10kHz`).
  2. Implement Trace A (`.spectral-trace-a`) spectral FFT energy curve driven by `smoothedSignal`.
  3. Implement Trace B (`.spectral-trace-b`) ceiling bending and red suppression fill (`.spectral-suppression-fill`) when attenuation occurs.
  4. Verify all tests in `tests/qa/features/compose-signal-chamber-kit.test.ts` pass.

### Task 4: Full Vitest Verification & Code Review
- **Steps:**
  1. Run `npm run build:tokens` and full Vitest test suite (`npx vitest run tests/qa/features/compose-*.test.ts`).
  2. Verify 326/326 tests pass across 26 test files.
  3. Invoke code review subagent to inspect changes.
