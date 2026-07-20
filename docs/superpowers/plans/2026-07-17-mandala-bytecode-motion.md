# Mandala Bytecode Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace uncapped FFT canvas mandala with BPM+seed bytecode IR driving SVG transforms + optional thin canvas.

**Architecture:** `compileMandalaProgram(seed,bpm)` → `evalMandala(program,t)` → `MandalaStage` applies CSS vars; thin canvas ≤8 strokes ≤15fps, off on Deck/reduced-motion.

**Tech Stack:** React, SVG/CSS, vitest, existing `computeFingerprint` hash

## Global Constraints

- No live FFT on mandala (Mode A)
- No Math.random / Date.now in mandala eval
- Thin canvas OFF when `(pointer: coarse)` or `prefers-reduced-motion`
- No `lighter` composite; no spectral bars on orb

---

### Task 1: IR compile + eval + tests

- [ ] Create `src/pages/Visualiser/mandala/mandalaBytecode.ts`
- [ ] Create `tests/pages/Visualiser/mandalaBytecode.test.ts` (determinism, BPM phase)
- [ ] Run vitest — pass

### Task 2: MandalaStage UI

- [ ] Create `MandalaStage.tsx` + `MandalaStage.css`
- [ ] SVG rings/merkaba/core; rAF or interval ~12Hz for CSS vars
- [ ] Optional thin canvas gated as per spec

### Task 3: Wire page

- [ ] `BytecodeVisualiserPage` uses `MandalaStage` with fingerprint hash + pacing.bpm; drop `getByteFrequencyData` from orb
- [ ] Smoke: tests still pass
