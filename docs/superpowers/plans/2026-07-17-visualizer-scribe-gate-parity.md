# Visualizer Scribe Gate Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Visualizer baked Truesight gates match Scribe (`buildResonanceGate` + multis), with no client hue fallback.

**Architecture:** Bake runs the same `findMultiRhymes(verseIR)` pass as panelAnalysis and stores `multis` in the artifact. Apply AMP already feeds multis into `buildResonanceGate`; remove `wordTruesight` when tokenData is missing.

**Tech Stack:** Node bake script, DeepRhymeEngine, multiRhyme.engine, visualizerTruesightAmp, vitest

## Global Constraints

- COLOR_DRAGON: never recompute hue via frontend G2P when gated without backend tokenData — leave uncolored
- ARCH_RULE_BACKEND_TRUTH_AUTHORITY: gate from baked connections + multis only
- Do not add live panel API or bytecode glow (Approach A only)

---

### Task 1: AMP — drop wordTruesight fallback + tests

**Files:**
- Modify: `src/lib/truesight/visualizerTruesightAmp.js`
- Modify: `tests/lib/truesight/visualizerTruesightAmp.test.js`

- [ ] Add failing test: gated charStart with multi lights word; gated without tokenData stays uncolored and does not use `#00ffaa` (wordTruesight mock)
- [ ] Remove `wordTruesight` import/call from apply path
- [ ] Run `npm run test:visualiser:truesight-amp` — pass

### Task 2: Bake — findMultiRhymes into artifact

**Files:**
- Modify: `scripts/bake-visualiser-truesight.mjs`
- Modify: `docs/superpowers/specs/2026-07-17-visualizer-truesight-amp-design.md` (note multis required)

- [ ] After analyzeDocument: compileVerseToIR + findMultiRhymes; write multis; log count
- [ ] Re-bake all tracks `--require-authority`
- [ ] Confirm Petrichor artifact `multis.length > 0` and apply gateSize ≈ Scribe (286)

### Task 3: Parity smoke (optional but preferred)

**Files:**
- Create: `tests/lib/truesight/visualizerScribeGateParity.test.js` (Node-only, skip if no sqlite)

- [ ] Compare Scribe-shaped gate vs applyVisualizerTruesight on Petrichor lyrics + baked artifact
- [ ] Expect gate size equality and zero tier diffs
