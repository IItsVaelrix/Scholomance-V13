# Karaoke Bytecode Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cheap karaoke playhead (DOM attribute flips) + BPM/seed bytecode CSS motion on Bytecode Visualiser and Album lyrics.

**Architecture:** Sibling to mandala IR — `compileKaraokeProgram` / `evalKaraoke` → `useKaraokeMotion` writes `--k-*` vars; `applyKaraokePlayhead` flips highlight/sung without per-word React prop storms.

**Tech Stack:** TypeScript, React, Vitest, CSS custom properties

## Global Constraints

- Schema `scholomance.karaoke.v1`; no Math.random/Date.now in eval
- No per-frame text-shadow; glow via `--k-word-glow` intensity only
- Surfaces: BytecodeVisualiserPage + AlbumLyrics only
- Truesight colors unchanged
- prefers-reduced-motion: pose at t=0, no motion RAF
- Same fingerprint seed family as mandala

---

## Task 1: karaokeBytecode IR + tests

**Files:**
- Create `tests/pages/Visualiser/karaokeBytecode.test.ts`
- Create `src/pages/Visualiser/karaoke/karaokeBytecode.ts`

- [x] Write failing determinism/BPM tests
- [x] Implement compile + eval
- [x] Confirm tests pass

## Task 2: karaokePlayhead helper + tests

**Files:**
- Create `tests/pages/Visualiser/karaokePlayhead.test.ts`
- Create `src/pages/Visualiser/karaoke/karaokePlayhead.ts`

- [x] Write failing tests (idempotent line/word flips)
- [x] Implement applyKaraokePlayhead
- [x] Confirm tests pass

## Task 3: useKaraokeMotion hook

**Files:**
- Create `src/pages/Visualiser/karaoke/useKaraokeMotion.ts`

- [x] Throttled RAF ~10–12 Hz writing `--k-line-pulse`, `--k-word-scale`, `--k-word-glow`

## Task 4: Wire BytecodeVisualiserPage + CSS

**Files:**
- Modify `BytecodeVisualiserPage.tsx`
- Modify `BytecodeVisualiser.css`

- [x] Seed from computeFingerprint; motion hook on lyrics root
- [x] Playhead via applyKaraokePlayhead; remove sung props from LyricLineRow re-render path
- [x] CSS consume `--k-*`

## Task 5: Wire AlbumLyrics + CSS

**Files:**
- Modify `AlbumLyrics.tsx`
- Modify `AlbumPage.css`

- [x] Same motion + playhead pattern
- [x] CSS consume `--k-*`

## Task 6: Verify

- [x] `npx vitest run tests/pages/Visualiser/karaokeBytecode.test.ts tests/pages/Visualiser/karaokePlayhead.test.ts`
