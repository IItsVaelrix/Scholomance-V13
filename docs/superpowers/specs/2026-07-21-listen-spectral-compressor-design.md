# Listen Page Dual-Trace FFT Spectral Dynamics Console Design Specification

## Overview
Redesign the Phoneme Density compressor on the `ListenPage` / `ComposeSignalChamberAdapter.tsx` into a **Dual-Trace FFT Spectral Dynamics Console** with a strictly locked fixed-height layout. This solves two core issues:
1. Prevents any dynamic container expanding, shrinking, or shifting in the HUD sidebar during playback.
2. Replaces the generic compressor graphic with a dual-trace spectral frequency graph displaying real-time FFT energy curves, dynamic threshold ceiling bending, and spectral gain reduction intersection fills.

---

## 1. Zero-Shift Fixed-Height Layout Contract
* **Target File:** `src/pages/Listen/ComposeSignalChamberAdapter.tsx`
* **CSS File:** `src/pages/Listen/ListenPage.css`
* **Console Container Dimensions:**
  * Fixed height: `height: 190px; flex-shrink: 0; overflow: hidden;`
  * `data-compose-kind="phoneme-compressor-unit"`
  * `data-compose-part="compressorConsole"`
* **Permanent Limiter Banner Slot:**
  * `.compressor-limiter-banner` occupies a permanent `22px` height reservation in the flex layout.
  * Inactive state: `opacity: 0; visibility: hidden; pointer-events: none;`
  * Active limiting state (`phonemeWarning === true`): `opacity: 1; visibility: visible;`
  * **Result:** Zero vertical layout shifts, expanding, or shrinking when warning states trigger during audio playback.

---

## 2. Dual-Trace FFT Spectral Dynamics Graph (SVG Canvas)
* **ViewBox:** `0 0 160 70` SVG micro-canvas.
* **Logarithmic Grid & Frequency Axes:**
  * Vertical reference lines at `100Hz` ($x=35$), `1kHz` ($x=85$), and `10kHz` ($x=135$).
  * Horizontal $-12\text{ dB}$ threshold guide line ($y=22$).
* **Trace A (Input Spectral Energy Contour):**
  * Smooth cubic bezier path (`path d="..."`) depicting spectral energy across Low ($150\text{Hz}$), Mid ($1.5\text{kHz}$), and High ($6\text{kHz}$) phoneme formants.
  * Filled with a subtle teal gradient (`rgba(0, 207, 200, 0.25)` to `rgba(133, 143, 167, 0.05)`).
* **Trace B (Dynamic Threshold Ceiling & Suppression Fill):**
  * Top ceiling line at $y=22$.
  * When `smoothedSignal > 0.75`, the ceiling line bends downward over high-energy spectral peaks.
  * The intersection area between Trace A and Trace B fills in glowing red (`var(--ritual-danger, #ff4444)`), visually highlighting frequency-specific attenuation ($0\text{ dB}$ to $-18\text{ dB}$).
* **Smooth Animation:**
  * Driven by 12% EMA exponential signal smoothing (`smoothedSignal`) and CSS transition rules (`transition: all 0.18s cubic-bezier(0, 0, 0.2, 1)`) for 60 FPS jitter-free playback.

---

## 3. Controls & Data-Compose Attributes
* **Attributes:**
  * `data-compose-kind="phoneme-compressor-unit"`
  * `data-compose-part="compressorConsole"`
  * `data-compose-status="NORMAL" | "ATTENUATING" | "LIMITING"`
  * `data-compose-part="transferCurve"`
* **Readouts:**
  * Header: `SPECTRAL_DYNAMICS_C1`
  * Ratio Badge: `1:1 LINEAR` | `4:1 COMPRESSING` | `∞:1 HARD LIMIT`
  * Parameter Readouts: `THRESH: -12.0 dB`, `GR: {gainReductionDb} dB`
  * Phase Buttons: `CONSONANT` and `VOWEL` phase mode filters.

---

## 4. Verification Plan
1. Update `tests/qa/features/compose-signal-chamber-kit.test.ts` to assert:
   - Fixed height console styling and permanent banner slot attribute.
   - Dual-trace SVG spectral graph elements (`.spectral-trace-a`, `.spectral-trace-b`).
2. Run Vitest suite to ensure 100% pass across all 26 test files (326 tests).
