# Design Spec: Phoneme Density Studio Dynamics Compressor UI

**Date:** 2026-07-21  
**Status:** Approved  
**Target File:** `src/pages/Listen/ComposeSignalChamberAdapter.tsx`  
**Associated CSS:** `src/pages/Listen/ListenPage.css`  

---

## 1. Executive Summary

This design transforms the **Phoneme Density** indicator in the Scholomance Listen Signal Chamber from a generic segment meter into an authentic **Studio Dynamics Compressor Console** (`PhonemeCompressorConsole`). 

The redesign maps the audio anti-exploit "returns decay" heuristic directly to studio audio dynamics concepts:
- **Input Level (`IN`)**: Real-time phoneme density signal level.
- **Gain Reduction (`GR`)**: Active suppression meter displaying dynamic gain reduction in dB (`0 dB` to `-18 dB`).
- **Transfer Function (Knee Graph)**: Live SVG visualization showing linear vs compressed dynamic response curve.
- **Limiter Status**: Dynamic ratio (`1:1` -> `4:1` -> `∞:1`) and anti-exploit alert banner.

---

## 2. Architecture & Component Contract

- **Container Component**: `ComposeSignalChamberAdapter` (`src/pages/Listen/ComposeSignalChamberAdapter.tsx`)
- **Compose Kind**: `phoneme-compressor-unit`
- **Schema Contract**: `SCHOL-COMPONENT-DEFINITION-v1`
- **Data Attributes**:
  - `data-compose-kind="phoneme-compressor-unit"`
  - `data-compose-part="compressorConsole"`
  - `data-compose-status="NORMAL" | "ATTENUATING" | "LIMITING"`
  - `data-compose-warning={phonemeWarning}`

---

## 3. Detailed Component Structure & Visual Anatomy

### 3.1 Header & Status Plate
- **Eyebrow Label**: `PHONEME_DYNAMICS_C1`
- **Limiter Mode Badge**: 
  - Normal ($S \le 0.50$): `1:1 LINEAR`
  - Attenuating ($0.50 < S \le 0.75$): `4:1 COMPRESSING`
  - Limiting ($S > 0.75$): `∞:1 HARD LIMIT` (Glows with `--ritual-danger` or `--ritual-warning`)

### 3.2 Dual Meter Bridge (`IN` & `GR`)
- **Input Meter (`IN`)**: Horizontal/vertical bar displaying signal density from 0% to 100%.
- **Gain Reduction Meter (`GR`)**: Reverse dynamic meter indicating active attenuation from $0\text{ dB}$ down to $-18\text{ dB}$.
  - Visual color shifts to amber (`--ritual-warning`) when $\text{GR} \le -3\text{ dB}$ and red (`--ritual-danger`) when $\text{GR} \le -8\text{ dB}$.

### 3.3 Dynamic Transfer Curve SVG Graph
- **Dimensions**: $100 \times 60$ viewbox micro-canvas.
- **Graph Elements**:
  - Grid background lines ($0\text{ dB}, -6\text{ dB}, -12\text{ dB}$).
  - Linear 45° dynamic response line.
  - Soft-knee bending point at $75\%$ input threshold.
  - Active signal point dot with pulse effect.
  - Line stroke color shifts based on active gain reduction state.

### 3.4 Parameters & Phase Controls
- **Threshold Readout**: `THRESH: -12.0 dB` (75% threshold marker)
- **Ratio Readout**: `RATIO: 1:1` / `4:1` / `∞:1`
- **Attack & Release**: `ATT: 12ms` | `REL: 150ms`
- **Phase Mode Buttons**: `CONSONANT` / `VOWEL` mode selector buttons with active highlight states.

### 3.5 Limiter Alert Banner
- **Message**: `⚠ HEURISTIC LIMITER ACTIVE - RETURNS DECAY`
- **Trigger**: Displayed with aria-live `assertive` when `phonemeWarning` is true.

---

## 4. Mathematical Model & Reactive Data Flow

1. **Signal Input ($S$)**: Derived from `signalLevel` ($0.0 \le S \le 1.0$).
2. **Gain Reduction Calculation**:
   $$\text{GR}_{\text{dB}} = \begin{cases} 0 & \text{if } S \le 0.75 \\ -(S - 0.75) \times 40 & \text{if } S > 0.75 \end{cases}$$
3. **Ratio Determination**:
   - $S < 0.50 \implies \text{Ratio} = \text{"1:1"}$
   - $0.50 \le S < 0.75 \implies \text{Ratio} = \text{"4:1"}$
   - $S \ge 0.75 \implies \text{Ratio} = \text{"∞:1"}$
4. **Hysteresis Threshold Protection**:
   - `phonemeWarning` becomes `true` when $S > 0.75$.
   - `phonemeWarning` resets to `false` when $S < 0.68$.

---

## 5. Verification & Testing Criteria

- **Unit Test Suite**: `tests/qa/features/compose-signal-chamber-kit.test.ts`
- **Test Assertions**:
  1. `data-compose-kind="phoneme-compressor-unit"` is rendered inside `ComposeSignalChamberAdapter`.
  2. Input meter (`IN`) correctly displays percentage from `signalLevel`.
  3. Gain reduction meter (`GR`) displays calculated dB attenuation when `signalLevel > 0.75`.
  4. Limiter status badge reflects correct ratio state (`1:1`, `4:1`, `∞:1`).
  5. SVG transfer curve element is present with `data-compose-part="transferCurve"`.
  6. Phase toggle buttons retain existing click callback behaviors.
