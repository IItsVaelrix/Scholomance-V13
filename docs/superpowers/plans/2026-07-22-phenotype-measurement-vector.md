# Phenotype Measurement Vector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the measurement half of the Visual Phenotype Calculus — six orthogonal quantizers that decompile a rendered DOM element into an SCD64 fingerprint, proven orthogonal by a directed 30-check matrix on real rendered pages.

**Architecture:** Pure functions in `src/core/phenotype/` convert computed styles and geometry into canonical terms; each axis declares an isolation contract naming its source and normalization. A dev-only harness route renders a target element whose physical properties are driven by URL params, letting Playwright mutate exactly one axis at a time. The orthogonality matrix asserts that each single-axis mutation flips exactly one block.

**Tech Stack:** TypeScript (strict), vitest for unit tests, Playwright + `sharp` for rendered-page measurement, React for the dev harness.

**Spec:** `docs/superpowers/specs/2026-07-22-visual-phenotype-calculus-design.md`

## Scope

This is **plan 1 of 3**. It delivers the measurement vector only — no intent packets, no claims, no gate. It is deliberately first because §9 criteria 3 and 5 (orthogonality) are the design's own falsifiers: if the axes are not orthogonal, the later plans change shape.

- **Plan 1 (this):** measurement vector — quantizers, isolation contracts, decompiler, orthogonality matrix
- **Plan 2:** claim layer — `AuthorityProfile`, salience ranking, predicated Predictions, `CausalHypothesisStatus` verdicts
- **Plan 3:** SCDL intent dialect, gate runtime, BytecodeHealth receipts, agent diagnosis deposit

## Global Constraints

- **Determinism (VAELRIX Law 6):** no `Math.random()`, no `Date.now()`, no wall-clock anywhere in `src/core/phenotype/`. Identical input must produce identical output.
- **No new dependencies.** `sharp` is already a project dependency; use it. No colour library — the LAB/LCh maths is implemented in Task 1.
- **TypeScript strict.** All new `src/core/phenotype/` files are `.ts` with explicit return types.
- **Motion (slot 7) is out of scope.** Six live axes in v1: luminance, chromaticity, stacking, size, shape, density.
- **An unmeasurable axis returns `null`, never a default.** A `null` axis marks the vector unmeasured for that slot. Never substitute a fallback value — per `SEMANTIC_KIND_CLARIFY_UNDERSPECIFIED`, "the soft Do is the failure this whole architecture exists to prevent."
- **Canonical term → block:** `sha256(term).digest('hex').toUpperCase().slice(0, 8)`, matching `src/core/scd64/generateSCD64FromSlots.ts`.

## File Structure

| File | Responsibility |
|---|---|
| `src/core/phenotype/color.ts` | sRGB parsing, linearization, WCAG luminance/contrast, LAB, LCh, hue distance |
| `src/core/phenotype/quantize/luminance.ts` | slot 1 — contrast ratio → tier |
| `src/core/phenotype/quantize/chromaticity.ts` | slot 4 — hue angle → palette role |
| `src/core/phenotype/quantize/stacking.ts` | slot 2 — z-index → tier |
| `src/core/phenotype/quantize/size.ts` | slot 3 — area ratio → tier |
| `src/core/phenotype/quantize/shape.ts` | slot 5 — radius ratio → tier |
| `src/core/phenotype/quantize/density.ts` | slot 6 — ink ratio → tier, plus clipped-area geometry |
| `src/core/phenotype/isolation.ts` | isolation contract type + the six declarations |
| `src/core/phenotype/vector.ts` | `MeasurementVector` type, `vectorToBlocks`, `vectorToSCD64` |
| `src/pages/_dev/PhenotypeHarness.jsx` | dev-only controlled-mutation target |
| `tests/qa/features/phenotype-color.test.ts` | Task 1 unit tests |
| `tests/qa/features/phenotype-quantize.test.ts` | Tasks 2–4 unit tests |
| `tests/qa/features/phenotype-vector.test.ts` | Task 5 unit tests |
| `tests/visual/phenotype-orthogonality.spec.ts` | Task 7 — the directed matrix |

---

### Task 1: Colour primitives

**Files:**
- Create: `src/core/phenotype/color.ts`
- Test: `tests/qa/features/phenotype-color.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `type Rgb = { r: number; g: number; b: number }`, `type Lab = { L: number; a: number; b: number }`, `type Lch = { L: number; C: number; h: number }`, `parseCssColor(css: string): Rgb | null`, `relativeLuminance(rgb: Rgb): number`, `contrastRatio(fg: Rgb, bg: Rgb): number`, `rgbToLab(rgb: Rgb): Lab`, `labToLch(lab: Lab): Lch`, `hueDistanceDeg(a: number, b: number): number`

- [ ] **Step 1: Write the failing test**

Create `tests/qa/features/phenotype-color.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  parseCssColor,
  relativeLuminance,
  contrastRatio,
  rgbToLab,
  labToLch,
  hueDistanceDeg,
} from '../../../src/core/phenotype/color';

const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };
const RED = { r: 255, g: 0, b: 0 };
const DARK_RED = { r: 128, g: 0, b: 0 };

describe('parseCssColor', () => {
  it('parses the rgb() form getComputedStyle returns', () => {
    expect(parseCssColor('rgb(255, 0, 0)')).toEqual(RED);
  });

  it('parses the rgba() form', () => {
    expect(parseCssColor('rgba(128, 0, 0, 0.5)')).toEqual(DARK_RED);
  });

  it('returns null for unparseable input rather than a default', () => {
    expect(parseCssColor('transparent')).toBeNull();
    expect(parseCssColor('')).toBeNull();
  });
});

describe('WCAG luminance and contrast', () => {
  it('gives white luminance 1 and black luminance 0', () => {
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 6);
    expect(relativeLuminance(BLACK)).toBeCloseTo(0, 6);
  });

  it('gives the canonical 21:1 for black on white', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 4);
  });

  it('is symmetric — order of arguments does not change the ratio', () => {
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(contrastRatio(BLACK, WHITE), 10);
  });
});

describe('rgbToLab', () => {
  it('places white at L*=100 with no chroma', () => {
    const lab = rgbToLab(WHITE);
    expect(lab.L).toBeCloseTo(100, 3);
    expect(lab.a).toBeCloseTo(0, 3);
    expect(lab.b).toBeCloseTo(0, 3);
  });

  it('matches published values for #FF0000', () => {
    const lab = rgbToLab(RED);
    expect(lab.L).toBeCloseTo(53.23, 1);
    expect(lab.a).toBeCloseTo(80.09, 1);
    expect(lab.b).toBeCloseTo(67.20, 1);
  });

  it('matches published values for #800000', () => {
    const lab = rgbToLab(DARK_RED);
    expect(lab.L).toBeCloseTo(25.53, 1);
    expect(lab.a).toBeCloseTo(48.05, 1);
    expect(lab.b).toBeCloseTo(38.06, 1);
  });
});

describe('labToLch — the isolation that makes slot 4 orthogonal to slot 1', () => {
  it('holds hue near-constant across a shade of the same colour', () => {
    const bright = labToLch(rgbToLab(RED));
    const dark = labToLch(rgbToLab(DARK_RED));
    expect(bright.h).toBeCloseTo(40.0, 0);
    expect(dark.h).toBeCloseTo(38.4, 0);
    expect(hueDistanceDeg(bright.h, dark.h)).toBeLessThan(2);
  });

  it('shows raw a*/b* would NOT have been stable — the reason hue is used', () => {
    const bright = rgbToLab(RED);
    const dark = rgbToLab(DARK_RED);
    expect(Math.abs(bright.a - dark.a)).toBeGreaterThan(30);
    expect(Math.abs(bright.b - dark.b)).toBeGreaterThan(28);
  });

  it('reports near-zero chroma for greys', () => {
    expect(labToLch(rgbToLab({ r: 128, g: 128, b: 128 })).C).toBeLessThan(0.5);
  });
});

describe('hueDistanceDeg', () => {
  it('wraps around 360', () => {
    expect(hueDistanceDeg(350, 10)).toBeCloseTo(20, 6);
    expect(hueDistanceDeg(10, 350)).toBeCloseTo(20, 6);
  });

  it('never exceeds 180', () => {
    expect(hueDistanceDeg(0, 181)).toBeCloseTo(179, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/phenotype-color.test.ts`
Expected: FAIL — `Failed to resolve import "../../../src/core/phenotype/color"`

- [ ] **Step 3: Write the implementation**

Create `src/core/phenotype/color.ts`:

```ts
/**
 * PHENOTYPE — colour primitives.
 *
 * Pure, deterministic (VAELRIX Law 6). No dependencies: the LAB/LCh maths is
 * short and the project has no colour library.
 *
 * Slot 1 (luminance) and slot 4 (chromaticity) must be orthogonal, which is
 * why chromaticity is keyed on the LCh HUE ANGLE and not on raw a*/b*: a* and
 * b* both move substantially under a tint or shade of the same hue, which
 * would couple slot 4 to slot 1. See spec §3.3.
 */

export type Rgb = { r: number; g: number; b: number };
export type Lab = { L: number; a: number; b: number };
export type Lch = { L: number; C: number; h: number };

const RGB_PATTERN = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*[\d.]+\s*)?\)$/;

/** Parse the `rgb()` / `rgba()` forms getComputedStyle returns. Null when unparseable — never a default. */
export function parseCssColor(css: string): Rgb | null {
  const match = RGB_PATTERN.exec(css.trim());
  if (!match) return null;
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
  };
}

function srgbToLinear(channel8: number): number {
  const cs = channel8 / 255;
  return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance(rgb: Rgb): number {
  return (
    0.2126 * srgbToLinear(rgb.r) +
    0.7152 * srgbToLinear(rgb.g) +
    0.0722 * srgbToLinear(rgb.b)
  );
}

/** WCAG contrast ratio. Symmetric in its arguments. */
export function contrastRatio(fg: Rgb, bg: Rgb): number {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

// D65 reference white.
const XN = 0.95047;
const YN = 1.0;
const ZN = 1.08883;
const DELTA = 6 / 29;

function pivot(t: number): number {
  return t > DELTA ** 3 ? Math.cbrt(t) : t / (3 * DELTA ** 2) + 4 / 29;
}

export function rgbToLab(rgb: Rgb): Lab {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);

  const x = 0.4124 * r + 0.3576 * g + 0.1805 * b;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = 0.0193 * r + 0.1192 * g + 0.9505 * b;

  const fx = pivot(x / XN);
  const fy = pivot(y / YN);
  const fz = pivot(z / ZN);

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

export function labToLch(lab: Lab): Lch {
  const C = Math.hypot(lab.a, lab.b);
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L: lab.L, C, h };
}

/** Shortest angular distance in degrees, 0..180. */
export function hueDistanceDeg(a: number, b: number): number {
  const diff = Math.abs(((a - b) % 360 + 360) % 360);
  return diff > 180 ? 360 - diff : diff;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/phenotype-color.test.ts`
Expected: PASS — 13 tests

- [ ] **Step 5: Commit**

```bash
git add src/core/phenotype/color.ts tests/qa/features/phenotype-color.test.ts
git commit -m "feat(phenotype): LAB/LCh colour primitives with hue-angle isolation"
```

---

### Task 2: Luminance and chromaticity quantizers

**Files:**
- Create: `src/core/phenotype/quantize/luminance.ts`
- Create: `src/core/phenotype/quantize/chromaticity.ts`
- Test: `tests/qa/features/phenotype-quantize.test.ts`

**Interfaces:**
- Consumes: `contrastRatio`, `parseCssColor`, `rgbToLab`, `labToLch`, `hueDistanceDeg` from Task 1
- Produces: `quantizeLuminance(fgCss: string, bgCss: string): LuminanceTerm | null` where `type LuminanceTerm = 'fail' | 'ui' | 'body' | 'high'`; `type PaletteRole = { name: string; hue: number }`; `quantizeChromaticity(cssColor: string, palette: readonly PaletteRole[], opts?: { hueToleranceDeg?: number; chromaFloor?: number }): string | null`

- [ ] **Step 1: Write the failing test**

Create `tests/qa/features/phenotype-quantize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { quantizeLuminance } from '../../../src/core/phenotype/quantize/luminance';
import { quantizeChromaticity } from '../../../src/core/phenotype/quantize/chromaticity';

const PALETTE = [
  { name: 'ember', hue: 40 },
  { name: 'verdant', hue: 140 },
  { name: 'abyss', hue: 260 },
] as const;

describe('quantizeLuminance', () => {
  it('tiers black on white as high', () => {
    expect(quantizeLuminance('rgb(0, 0, 0)', 'rgb(255, 255, 255)')).toBe('high');
  });

  it('tiers identical colours as fail', () => {
    expect(quantizeLuminance('rgb(120, 120, 120)', 'rgb(120, 120, 120)')).toBe('fail');
  });

  it('returns null when either colour is unparseable — never a default tier', () => {
    expect(quantizeLuminance('transparent', 'rgb(255, 255, 255)')).toBeNull();
  });

  it('places the WCAG boundaries at 3.0, 4.5 and 7.0', () => {
    // #767676 on white is ~4.54:1 — just into body.
    expect(quantizeLuminance('rgb(118, 118, 118)', 'rgb(255, 255, 255)')).toBe('body');
    // #949494 on white is ~3.03:1 — just into ui.
    expect(quantizeLuminance('rgb(148, 148, 148)', 'rgb(255, 255, 255)')).toBe('ui');
    // #ABABAB on white is ~2.32:1 — below 3.0.
    expect(quantizeLuminance('rgb(171, 171, 171)', 'rgb(255, 255, 255)')).toBe('fail');
  });
});

describe('quantizeChromaticity', () => {
  it('snaps #FF0000 (hue 40.0) to the ember role', () => {
    expect(quantizeChromaticity('rgb(255, 0, 0)', PALETTE)).toBe('ember');
  });

  it('snaps a shade of the same hue to the SAME role — the slot 1/slot 4 isolation', () => {
    expect(quantizeChromaticity('rgb(128, 0, 0)', PALETTE)).toBe('ember');
  });

  it('returns neutral for greys rather than a noisy hue role', () => {
    expect(quantizeChromaticity('rgb(128, 128, 128)', PALETTE)).toBe('neutral');
    expect(quantizeChromaticity('rgb(30, 30, 30)', PALETTE)).toBe('neutral');
  });

  it('returns off-palette past the hue tolerance rather than snapping silently', () => {
    // Hue ~196 — far from every role at the default 25 degree tolerance.
    expect(quantizeChromaticity('rgb(0, 180, 220)', PALETTE)).toBe('off-palette');
  });

  it('returns null when the colour is unparseable', () => {
    expect(quantizeChromaticity('transparent', PALETTE)).toBeNull();
  });

  it('is deterministic across repeated calls', () => {
    const runs = new Set(
      Array.from({ length: 100 }, () => quantizeChromaticity('rgb(255, 0, 0)', PALETTE)),
    );
    expect(runs.size).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/phenotype-quantize.test.ts`
Expected: FAIL — `Failed to resolve import ".../quantize/luminance"`

- [ ] **Step 3: Write the implementations**

Create `src/core/phenotype/quantize/luminance.ts`:

```ts
/**
 * Slot 1 — luminance relationship.
 *
 * ISOLATION CONTRACT
 *   source:        computed foreground/background colour pair
 *   normalization: WCAG contrast ratio
 *   pausedState:   n/a (static property)
 *
 * Read from computed styles, NEVER from screenshot pixels — that is what keeps
 * this axis orthogonal to slot 2 (stacking). The documented cost is blindness
 * to compositing; see spec §1.2.
 */

import { contrastRatio, parseCssColor } from '../color';

export type LuminanceTerm = 'fail' | 'ui' | 'body' | 'high';

/** WCAG boundaries. A published standard, not a tuning choice. */
const UI_MIN = 3.0;
const BODY_MIN = 4.5;
const HIGH_MIN = 7.0;

export function quantizeLuminance(fgCss: string, bgCss: string): LuminanceTerm | null {
  const fg = parseCssColor(fgCss);
  const bg = parseCssColor(bgCss);
  if (!fg || !bg) return null;

  const ratio = contrastRatio(fg, bg);
  if (ratio >= HIGH_MIN) return 'high';
  if (ratio >= BODY_MIN) return 'body';
  if (ratio >= UI_MIN) return 'ui';
  return 'fail';
}
```

Create `src/core/phenotype/quantize/chromaticity.ts`:

```ts
/**
 * Slot 4 — chromaticity.
 *
 * ISOLATION CONTRACT
 *   source:        computed colour, LCh hue angle only
 *   normalization: nearest palette role within a hue tolerance
 *   pausedState:   n/a (static property)
 *
 * Hue angle, not a*/b*: a* and b* both move substantially under a tint or
 * shade of the same hue, which would couple this axis to slot 1. Below the
 * chroma floor the hue angle is numerically unstable, so greys quantize to
 * `neutral` rather than to a noise-selected role (Law 6). See spec §3.3.
 */

import { hueDistanceDeg, labToLch, parseCssColor, rgbToLab } from '../color';

export type PaletteRole = { name: string; hue: number };

const DEFAULT_HUE_TOLERANCE_DEG = 25;
const DEFAULT_CHROMA_FLOOR = 5;

export function quantizeChromaticity(
  cssColor: string,
  palette: readonly PaletteRole[],
  opts: { hueToleranceDeg?: number; chromaFloor?: number } = {},
): string | null {
  const rgb = parseCssColor(cssColor);
  if (!rgb) return null;

  const hueTolerance = opts.hueToleranceDeg ?? DEFAULT_HUE_TOLERANCE_DEG;
  const chromaFloor = opts.chromaFloor ?? DEFAULT_CHROMA_FLOOR;

  const lch = labToLch(rgbToLab(rgb));
  if (lch.C < chromaFloor) return 'neutral';

  let best: PaletteRole | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const role of palette) {
    const distance = hueDistanceDeg(lch.h, role.hue);
    // Strict `<` keeps the first declared role on an exact tie — a total,
    // deterministic order over the palette (Law 6).
    if (distance < bestDistance) {
      bestDistance = distance;
      best = role;
    }
  }

  if (!best || bestDistance > hueTolerance) return 'off-palette';
  return best.name;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/phenotype-quantize.test.ts`
Expected: PASS — 10 tests

- [ ] **Step 5: Commit**

```bash
git add src/core/phenotype/quantize/luminance.ts src/core/phenotype/quantize/chromaticity.ts tests/qa/features/phenotype-quantize.test.ts
git commit -m "feat(phenotype): luminance and chromaticity quantizers"
```

---

### Task 3: Stacking, size and shape quantizers

**Files:**
- Create: `src/core/phenotype/quantize/stacking.ts`
- Create: `src/core/phenotype/quantize/size.ts`
- Create: `src/core/phenotype/quantize/shape.ts`
- Modify: `tests/qa/features/phenotype-quantize.test.ts` (append)

**Interfaces:**
- Consumes: `STACKING_TIERS` from `src/data/stacking_tiers.js`
- Produces: `quantizeStacking(zIndexCss: string): StackingTerm | null` where `type StackingTerm = 'base' | 'above' | 'overlay' | 'system'`; `quantizeSize(area: number, viewportArea: number): SizeTerm | null` where `type SizeTerm = 'glyph' | 'control' | 'panel' | 'region' | 'surface'`; `quantizeShape(input: { width: number; height: number; borderRadiusPx: number; clipPath: string }): ShapeTerm | null` where `type ShapeTerm = 'rect' | 'round' | 'pill' | 'circle' | 'notched'`

- [ ] **Step 1: Write the failing test**

Append to `tests/qa/features/phenotype-quantize.test.ts`:

```ts
import { quantizeStacking } from '../../../src/core/phenotype/quantize/stacking';
import { quantizeSize } from '../../../src/core/phenotype/quantize/size';
import { quantizeShape } from '../../../src/core/phenotype/quantize/shape';

describe('quantizeStacking', () => {
  it('maps the Law 10 tier values', () => {
    expect(quantizeStacking('0')).toBe('base');
    expect(quantizeStacking('10')).toBe('above');
    expect(quantizeStacking('100')).toBe('overlay');
    expect(quantizeStacking('1000')).toBe('system');
  });

  it('floors values between tiers to the tier below', () => {
    expect(quantizeStacking('7')).toBe('base');
    expect(quantizeStacking('99')).toBe('above');
    expect(quantizeStacking('5000')).toBe('system');
  });

  it('treats auto as base — an unpositioned element participates at base', () => {
    expect(quantizeStacking('auto')).toBe('base');
  });

  it('returns null for a non-numeric, non-auto value', () => {
    expect(quantizeStacking('inherit')).toBeNull();
  });
});

describe('quantizeSize', () => {
  const VIEWPORT = 1280 * 720; // 921600

  it('tiers by area ratio, log-spaced', () => {
    expect(quantizeSize(100, VIEWPORT)).toBe('glyph');        // ~0.0001
    expect(quantizeSize(2000, VIEWPORT)).toBe('control');     // ~0.0022
    expect(quantizeSize(20000, VIEWPORT)).toBe('panel');      // ~0.022
    expect(quantizeSize(150000, VIEWPORT)).toBe('region');    // ~0.16
    expect(quantizeSize(500000, VIEWPORT)).toBe('surface');   // ~0.54
  });

  it('is scale-invariant — doubling both element and viewport keeps the tier', () => {
    expect(quantizeSize(20000, VIEWPORT)).toBe(quantizeSize(40000, VIEWPORT * 2));
  });

  it('returns null for a zero or negative viewport', () => {
    expect(quantizeSize(100, 0)).toBeNull();
  });
});

describe('quantizeShape', () => {
  it('reports rect for a square corner', () => {
    expect(quantizeShape({ width: 200, height: 100, borderRadiusPx: 0, clipPath: 'none' })).toBe('rect');
  });

  it('reports round for a modest radius', () => {
    expect(quantizeShape({ width: 200, height: 100, borderRadiusPx: 12, clipPath: 'none' })).toBe('round');
  });

  it('reports pill when fully rounded on a non-square element', () => {
    expect(quantizeShape({ width: 200, height: 100, borderRadiusPx: 50, clipPath: 'none' })).toBe('pill');
  });

  it('reports circle when fully rounded on a square element', () => {
    expect(quantizeShape({ width: 100, height: 100, borderRadiusPx: 50, clipPath: 'none' })).toBe('circle');
  });

  it('reports notched whenever a clip-path is present, regardless of radius', () => {
    expect(
      quantizeShape({ width: 200, height: 100, borderRadiusPx: 0, clipPath: 'polygon(0 0, 100% 0, 100% 80%)' }),
    ).toBe('notched');
  });

  it('is radius-RATIO based, so a pill stays a pill at any scale', () => {
    const small = quantizeShape({ width: 100, height: 50, borderRadiusPx: 25, clipPath: 'none' });
    const large = quantizeShape({ width: 400, height: 200, borderRadiusPx: 100, clipPath: 'none' });
    expect(small).toBe('pill');
    expect(large).toBe('pill');
  });

  it('returns null for a zero-area element', () => {
    expect(quantizeShape({ width: 0, height: 100, borderRadiusPx: 0, clipPath: 'none' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/phenotype-quantize.test.ts`
Expected: FAIL — `Failed to resolve import ".../quantize/stacking"`

- [ ] **Step 3: Write the implementations**

Create `src/core/phenotype/quantize/stacking.ts`:

```ts
/**
 * Slot 2 — stacking.
 *
 * ISOLATION CONTRACT
 *   source:        computed z-index
 *   normalization: floor to the nearest VAELRIX Law 10 tier
 *   pausedState:   n/a (static property)
 */

import { STACKING_TIERS } from '../../../data/stacking_tiers.js';

export type StackingTerm = 'base' | 'above' | 'overlay' | 'system';

/** Descending so the first threshold met wins. */
const TIERS: readonly (readonly [StackingTerm, number])[] = [
  ['system', STACKING_TIERS.SYSTEM],
  ['overlay', STACKING_TIERS.OVERLAY],
  ['above', STACKING_TIERS.ABOVE],
  ['base', STACKING_TIERS.BASE],
];

export function quantizeStacking(zIndexCss: string): StackingTerm | null {
  const raw = zIndexCss.trim();
  // `auto` means the element creates no stacking context of its own.
  const z = raw === 'auto' ? 0 : Number(raw);
  if (!Number.isFinite(z)) return null;

  for (const [term, threshold] of TIERS) {
    if (z >= threshold) return term;
  }
  return 'base';
}
```

Create `src/core/phenotype/quantize/size.ts`:

```ts
/**
 * Slot 3 — size.
 *
 * ISOLATION CONTRACT
 *   source:        getBoundingClientRect area
 *   normalization: area / viewport area (ratio, never absolute px)
 *   pausedState:   n/a (static property)
 *
 * Ratio, not pixels: an absolute-px quantizer would rewrite its block at every
 * responsive breakpoint and the code would stop meaning anything. Boundaries
 * are ~10x apart so a 10% nudge never crosses one but a 2x change always does.
 */

export type SizeTerm = 'glyph' | 'control' | 'panel' | 'region' | 'surface';

const BOUNDARIES: readonly (readonly [SizeTerm, number])[] = [
  ['glyph', 0.0005],
  ['control', 0.005],
  ['panel', 0.05],
  ['region', 0.3],
];

export function quantizeSize(area: number, viewportArea: number): SizeTerm | null {
  if (!Number.isFinite(area) || !Number.isFinite(viewportArea)) return null;
  if (viewportArea <= 0 || area < 0) return null;

  const ratio = area / viewportArea;
  for (const [term, ceiling] of BOUNDARIES) {
    if (ratio < ceiling) return term;
  }
  return 'surface';
}
```

Create `src/core/phenotype/quantize/shape.ts`:

```ts
/**
 * Slot 5 — shape.
 *
 * ISOLATION CONTRACT
 *   source:        border-radius, width/height, clip-path
 *   normalization: radius / min(width, height) — a ratio, so a pill is a pill
 *                  at any scale
 *   pausedState:   n/a (static property)
 *
 * Geometry and clipping ONLY. This axis must never read painted extent, or it
 * would couple to slot 6 (density).
 */

export type ShapeTerm = 'rect' | 'round' | 'pill' | 'circle' | 'notched';

const ROUND_MIN = 0.05;
const FULL_MIN = 0.5;
/** Aspect within this of 1 counts as square. */
const SQUARE_TOLERANCE = 0.05;

export function quantizeShape(input: {
  width: number;
  height: number;
  borderRadiusPx: number;
  clipPath: string;
}): ShapeTerm | null {
  const { width, height, borderRadiusPx, clipPath } = input;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;

  // A clip-path dominates: the painted silhouette is no longer a rounded rect.
  if (clipPath && clipPath.trim() !== 'none') return 'notched';

  const shortSide = Math.min(width, height);
  const ratio = borderRadiusPx / shortSide;

  if (ratio < ROUND_MIN) return 'rect';
  if (ratio < FULL_MIN) return 'round';

  const aspect = width / height;
  return Math.abs(aspect - 1) <= SQUARE_TOLERANCE ? 'circle' : 'pill';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/phenotype-quantize.test.ts`
Expected: PASS — 24 tests total in the file

- [ ] **Step 5: Commit**

```bash
git add src/core/phenotype/quantize/stacking.ts src/core/phenotype/quantize/size.ts src/core/phenotype/quantize/shape.ts tests/qa/features/phenotype-quantize.test.ts
git commit -m "feat(phenotype): stacking, size and shape quantizers"
```

---

### Task 4: Density quantizer and clipped-area geometry

**Files:**
- Create: `src/core/phenotype/quantize/density.ts`
- Modify: `tests/qa/features/phenotype-quantize.test.ts` (append)

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `clippedRegionArea(input: { width: number; height: number; borderRadiusPx: number }): number`; `countInkPixels(raw: Buffer, channels: number, background: Rgb, threshold?: number): number`; `quantizeDensity(inkPixels: number, clippedArea: number): DensityTerm | null` where `type DensityTerm = 'sparse' | 'measured' | 'dense' | 'packed'`

- [ ] **Step 1: Write the failing test**

Append to `tests/qa/features/phenotype-quantize.test.ts`:

```ts
import {
  clippedRegionArea,
  countInkPixels,
  quantizeDensity,
} from '../../../src/core/phenotype/quantize/density';

describe('clippedRegionArea — the denominator that decouples density from shape', () => {
  it('is width*height for a square-cornered rect', () => {
    expect(clippedRegionArea({ width: 200, height: 100, borderRadiusPx: 0 })).toBeCloseTo(20000, 6);
  });

  it('gives pi*r^2 for a full circle', () => {
    // 100x100 with radius 50 is a circle: area = pi * 50^2 = 7853.98
    expect(clippedRegionArea({ width: 100, height: 100, borderRadiusPx: 50 })).toBeCloseTo(
      Math.PI * 2500,
      3,
    );
  });

  it('removes exactly the four corner offcuts for a rounded rect', () => {
    // w*h - (4 - pi) * r^2
    const expected = 200 * 100 - (4 - Math.PI) * 20 * 20;
    expect(clippedRegionArea({ width: 200, height: 100, borderRadiusPx: 20 })).toBeCloseTo(expected, 6);
  });

  it('clamps a radius larger than half the short side', () => {
    // Radius 400 on a 100-tall element cannot exceed 50.
    expect(clippedRegionArea({ width: 100, height: 100, borderRadiusPx: 400 })).toBeCloseTo(
      Math.PI * 2500,
      3,
    );
  });
});

describe('countInkPixels', () => {
  const BG = { r: 0, g: 0, b: 0 };

  it('counts pixels differing from the background beyond the threshold', () => {
    // 4 RGB pixels: black, black, white, white.
    const raw = Buffer.from([0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255, 255]);
    expect(countInkPixels(raw, 3, BG)).toBe(2);
  });

  it('ignores sub-threshold noise so anti-aliasing does not inflate density', () => {
    const raw = Buffer.from([2, 2, 2, 0, 0, 0]);
    expect(countInkPixels(raw, 3, BG)).toBe(0);
  });

  it('handles a 4-channel RGBA buffer by skipping alpha', () => {
    const raw = Buffer.from([255, 255, 255, 255, 0, 0, 0, 255]);
    expect(countInkPixels(raw, 4, BG)).toBe(1);
  });
});

describe('quantizeDensity', () => {
  it('tiers by ink ratio', () => {
    expect(quantizeDensity(50, 10000)).toBe('sparse');    // 0.005
    expect(quantizeDensity(1500, 10000)).toBe('measured'); // 0.15
    expect(quantizeDensity(4500, 10000)).toBe('dense');    // 0.45
    expect(quantizeDensity(9000, 10000)).toBe('packed');   // 0.90
  });

  it('is scale-invariant — same ratio at 4x the area gives the same tier', () => {
    expect(quantizeDensity(1500, 10000)).toBe(quantizeDensity(6000, 40000));
  });

  it('returns null for a zero clipped area rather than dividing by zero', () => {
    expect(quantizeDensity(10, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/phenotype-quantize.test.ts`
Expected: FAIL — `Failed to resolve import ".../quantize/density"`

- [ ] **Step 3: Write the implementation**

Create `src/core/phenotype/quantize/density.ts`:

```ts
/**
 * Slot 6 — density.
 *
 * ISOLATION CONTRACT
 *   source:        rasterized element pixels vs the resolved background colour
 *   normalization: ink / AREA INSIDE THE CLIPPED REGION, never / bounding box
 *   pausedState:   animations paused; sampled at a single settled frame
 *
 * The denominator is what decouples this axis from slot 5 (shape). With a
 * bounding-box denominator, a rect -> circle change alone would drop density by
 * (4 - pi) / 4 ~= 21% with no design change whatsoever, and the orthogonality
 * matrix would fail on the shape -> density pair. See spec §3.3.
 */

import type { Rgb } from '../color';

export type DensityTerm = 'sparse' | 'measured' | 'dense' | 'packed';

const BOUNDARIES: readonly (readonly [DensityTerm, number])[] = [
  ['sparse', 0.1],
  ['measured', 0.35],
  ['dense', 0.7],
];

/** Per-channel difference below which a pixel counts as background (anti-aliasing guard). */
const DEFAULT_INK_THRESHOLD = 8;

/**
 * Area of a rounded rectangle: the bounding box less the four corner offcuts.
 * Each corner removes (1 - pi/4) * r^2, so four remove (4 - pi) * r^2.
 * Exact for the circle case, where r = min(w, h) / 2.
 */
export function clippedRegionArea(input: {
  width: number;
  height: number;
  borderRadiusPx: number;
}): number {
  const { width, height } = input;
  const r = Math.min(input.borderRadiusPx, Math.min(width, height) / 2);
  return width * height - (4 - Math.PI) * r * r;
}

/** Count pixels in a raw buffer that differ from the background beyond the threshold. */
export function countInkPixels(
  raw: Buffer,
  channels: number,
  background: Rgb,
  threshold: number = DEFAULT_INK_THRESHOLD,
): number {
  let ink = 0;
  for (let i = 0; i + channels <= raw.length; i += channels) {
    const dr = Math.abs(raw[i] - background.r);
    const dg = Math.abs(raw[i + 1] - background.g);
    const db = Math.abs(raw[i + 2] - background.b);
    if (dr > threshold || dg > threshold || db > threshold) ink += 1;
  }
  return ink;
}

export function quantizeDensity(inkPixels: number, clippedArea: number): DensityTerm | null {
  if (!Number.isFinite(inkPixels) || !Number.isFinite(clippedArea)) return null;
  if (clippedArea <= 0 || inkPixels < 0) return null;

  const ratio = inkPixels / clippedArea;
  for (const [term, ceiling] of BOUNDARIES) {
    if (ratio < ceiling) return term;
  }
  return 'packed';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/phenotype-quantize.test.ts`
Expected: PASS — 34 tests total in the file

- [ ] **Step 5: Commit**

```bash
git add src/core/phenotype/quantize/density.ts tests/qa/features/phenotype-quantize.test.ts
git commit -m "feat(phenotype): density quantizer with clipped-region denominator"
```

---

### Task 5: Isolation contracts and the measurement vector

**Files:**
- Create: `src/core/phenotype/isolation.ts`
- Create: `src/core/phenotype/vector.ts`
- Test: `tests/qa/features/phenotype-vector.test.ts`

**Interfaces:**
- Consumes: the six term types from Tasks 2–4
- Produces: `type PhenotypeAxis = 'luminance' | 'stacking' | 'size' | 'chromaticity' | 'shape' | 'density'`; `LIVE_AXES: readonly PhenotypeAxis[]`; `ISOLATION: Record<PhenotypeAxis, IsolationContract>`; `type MeasurementVector = Record<PhenotypeAxis, string | null>`; `vectorToBlocks(vector, profileId): string[]`; `vectorToSCD64(vector, profileId, confirmed): string`; `UNMEASURED_BLOCK`

- [ ] **Step 1: Write the failing test**

Create `tests/qa/features/phenotype-vector.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ISOLATION, LIVE_AXES } from '../../../src/core/phenotype/isolation';
import {
  UNMEASURED_BLOCK,
  vectorToBlocks,
  vectorToSCD64,
  type MeasurementVector,
} from '../../../src/core/phenotype/vector';
import { parseSCD64 } from '../../../src/core/scd64/parseSCD64';

const PROFILE = 'A1B2C3';

const FULL: MeasurementVector = {
  luminance: 'high',
  stacking: 'base',
  size: 'panel',
  chromaticity: 'ember',
  shape: 'pill',
  density: 'measured',
};

describe('isolation contracts', () => {
  it('declares a contract for every live axis — no contract, no seal', () => {
    for (const axis of LIVE_AXES) {
      expect(ISOLATION[axis]).toBeDefined();
      expect(ISOLATION[axis].source.length).toBeGreaterThan(0);
      expect(ISOLATION[axis].normalization.length).toBeGreaterThan(0);
      expect(ISOLATION[axis].pausedState.length).toBeGreaterThan(0);
    }
  });

  it('excludes motion from v1', () => {
    expect(LIVE_AXES).toHaveLength(6);
    expect(LIVE_AXES).not.toContain('motion');
  });

  it('reads luminance from computed styles, not pixels — the stacking isolation', () => {
    expect(ISOLATION.luminance.source).toMatch(/computed/i);
    expect(ISOLATION.luminance.source).not.toMatch(/pixel|screenshot/i);
  });

  it('normalizes density by the clipped region, not the bounding box', () => {
    expect(ISOLATION.density.normalization).toMatch(/clipped/i);
    expect(ISOLATION.density.normalization).not.toMatch(/bounding box/i);
  });
});

describe('vectorToSCD64', () => {
  it('produces exactly 64 uppercase hex characters', () => {
    const code = vectorToSCD64(FULL, PROFILE, true);
    expect(code).toMatch(/^[0-9A-F]{64}$/);
    expect(parseSCD64(code)).toHaveLength(8);
  });

  it('puts the profile discriminator in slot 0 after the version byte', () => {
    const blocks = parseSCD64(vectorToSCD64(FULL, PROFILE, true));
    expect(blocks[0].slice(2)).toBe(PROFILE);
  });

  it('marks an unconfirmed vector with the predicted version byte', () => {
    const confirmed = parseSCD64(vectorToSCD64(FULL, PROFILE, true))[0].slice(0, 2);
    const predicted = parseSCD64(vectorToSCD64(FULL, PROFILE, false))[0].slice(0, 2);
    expect(confirmed).not.toBe(predicted);
  });

  it('is deterministic across 100 runs (Law 6)', () => {
    const codes = new Set(
      Array.from({ length: 100 }, () => vectorToSCD64(FULL, PROFILE, true)),
    );
    expect(codes.size).toBe(1);
  });
});

describe('vectorToBlocks', () => {
  it('changes exactly one block when exactly one axis term changes', () => {
    const before = vectorToBlocks(FULL, PROFILE);
    const after = vectorToBlocks({ ...FULL, size: 'region' }, PROFILE);

    const differing = before
      .map((block, i) => (block === after[i] ? null : i))
      .filter((i): i is number => i !== null);

    expect(differing).toEqual([3]); // slot 3 is size
  });

  it('renders an unmeasured axis as the sentinel block, never as a default term', () => {
    const blocks = vectorToBlocks({ ...FULL, density: null }, PROFILE);
    expect(blocks[6]).toBe(UNMEASURED_BLOCK);
  });

  it('gives a different block to the unmeasured sentinel than to any real term', () => {
    const measured = vectorToBlocks(FULL, PROFILE);
    expect(measured).not.toContain(UNMEASURED_BLOCK);
  });

  it('reserves slot 7 for motion and leaves it unmeasured in v1', () => {
    expect(vectorToBlocks(FULL, PROFILE)[7]).toBe(UNMEASURED_BLOCK);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/phenotype-vector.test.ts`
Expected: FAIL — `Failed to resolve import ".../phenotype/isolation"`

- [ ] **Step 3: Write the implementations**

Create `src/core/phenotype/isolation.ts`:

```ts
/**
 * PHENOTYPE — isolation contracts (spec §3.3).
 *
 * Orthogonality is not a property the axes have; it is a property the
 * decompiler CONSTRUCTS by defining each axis from a deliberately isolated
 * source with a deliberately chosen normalization. An axis without a declared
 * contract cannot be sealed into a profile.
 */

export type PhenotypeAxis =
  | 'luminance'
  | 'stacking'
  | 'size'
  | 'chromaticity'
  | 'shape'
  | 'density';

/** Slot order. Slot 0 is the profile discriminator; slot 7 is motion (not live in v1). */
export const AXIS_SLOTS: Readonly<Record<PhenotypeAxis, number>> = Object.freeze({
  luminance: 1,
  stacking: 2,
  size: 3,
  chromaticity: 4,
  shape: 5,
  density: 6,
});

export const LIVE_AXES: readonly PhenotypeAxis[] = Object.freeze([
  'luminance',
  'stacking',
  'size',
  'chromaticity',
  'shape',
  'density',
]);

export type IsolationContract = {
  source: string;
  normalization: string;
  pausedState: string;
};

export const ISOLATION: Readonly<Record<PhenotypeAxis, IsolationContract>> = Object.freeze({
  luminance: {
    source: 'computed foreground/background colour pair',
    normalization: 'WCAG contrast ratio',
    pausedState: 'n/a — static property',
  },
  stacking: {
    source: 'computed z-index',
    normalization: 'floor to nearest Law 10 tier',
    pausedState: 'n/a — static property',
  },
  size: {
    source: 'getBoundingClientRect area',
    normalization: 'area / viewport area (ratio, never absolute px)',
    pausedState: 'n/a — static property',
  },
  chromaticity: {
    source: 'computed colour, LCh hue angle only',
    normalization: 'nearest palette role within hue tolerance, chroma floor to neutral',
    pausedState: 'n/a — static property',
  },
  shape: {
    source: 'border-radius, width/height, clip-path — geometry only',
    normalization: 'radius / min(width, height)',
    pausedState: 'n/a — static property',
  },
  density: {
    source: 'rasterized element pixels vs resolved background',
    normalization: 'ink / area inside the clipped region',
    pausedState: 'animations paused, single settled frame',
  },
});
```

Create `src/core/phenotype/vector.ts`:

```ts
/**
 * PHENOTYPE — the measurement vector and its SCD64 encoding (spec §3).
 *
 * The SCD64 is a PURE MEASUREMENT FINGERPRINT. It carries no claims. Slot 0
 * holds the version byte plus the AuthorityProfile discriminator; slots 1..7
 * hold evidence axes. Authority is NOT here — a derived verdict sitting among
 * its own inputs would make slot 0 change "legitimately" for any result.
 *
 * Slot 0 is a discriminator, never the authoritative profile identity: six hex
 * characters is 24 bits. The full digest travels in BytecodeHealth context, the
 * observation receipt, and the profile registry (spec §3.1).
 */

import crypto from 'node:crypto';
import { AXIS_SLOTS, LIVE_AXES, type PhenotypeAxis } from './isolation';

export type MeasurementVector = Record<PhenotypeAxis, string | null>;

const BLOCK_COUNT = 8;

/** Version bytes distinguishing a gate-verified code from a merely declared one. */
export const CONFIRMED_VERSION_BYTE = 'E1';
export const PREDICTED_VERSION_BYTE = 'E0';

function blockFor(term: string): string {
  return crypto.createHash('sha256').update(term).digest('hex').toUpperCase().slice(0, 8);
}

/**
 * Sentinel for an axis that was not measured. Distinct from every real term
 * because no term is ever this string — unmeasured must never be mistakable
 * for measured-and-passing (spec §5.5).
 */
export const UNMEASURED_BLOCK = blockFor(' phenotype:unmeasured');

/** Eight blocks: slot 0 is `versionByte + profileId`, slots 1..7 are axis terms. */
export function vectorToBlocks(
  vector: MeasurementVector,
  profileId: string,
  confirmed = true,
): string[] {
  const versionByte = confirmed ? CONFIRMED_VERSION_BYTE : PREDICTED_VERSION_BYTE;
  const blocks: string[] = new Array(BLOCK_COUNT).fill(UNMEASURED_BLOCK);

  blocks[0] = `${versionByte}${profileId.toUpperCase()}`;

  for (const axis of LIVE_AXES) {
    const term = vector[axis];
    blocks[AXIS_SLOTS[axis]] = term === null || term === undefined ? UNMEASURED_BLOCK : blockFor(term);
  }

  return blocks;
}

export function vectorToSCD64(
  vector: MeasurementVector,
  profileId: string,
  confirmed = true,
): string {
  return vectorToBlocks(vector, profileId, confirmed).join('');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/phenotype-vector.test.ts`
Expected: PASS — 11 tests

- [ ] **Step 5: Commit**

```bash
git add src/core/phenotype/isolation.ts src/core/phenotype/vector.ts tests/qa/features/phenotype-vector.test.ts
git commit -m "feat(phenotype): isolation contracts and measurement vector encoding"
```

---

### Task 6: Controlled-mutation harness route

**Files:**
- Create: `src/pages/_dev/PhenotypeHarness.jsx`
- Modify: `src/main.jsx:64-100` (add the lazy import and route inside the existing `import.meta.env.DEV` block)

**Interfaces:**
- Consumes: nothing
- Produces: dev-only route `/__immune/phenotype` rendering `#phenotype-target` inside `#phenotype-stage`. Query params, all optional: `bg` (hex, default `#000000`), `fg` (hex, default `#ff0000`), `w` (px, default `200`), `h` (px, default `100`), `radius` (px, default `0`), `z` (int, default `0`), `ink` (0..1 fraction of the clipped region painted, default `0.2`), `clip` (`none` | `notch`, default `none`)

- [ ] **Step 1: Write the harness component**

Create `src/pages/_dev/PhenotypeHarness.jsx`:

```jsx
/**
 * PHENOTYPE HARNESS — dev-only controlled-mutation target.
 *
 * The orthogonality matrix (spec §3.4) needs to move exactly one physical
 * property at a time. Real app pages cannot do that: changing a button's size
 * also changes its text wrapping, its ink, and its neighbours. This harness
 * exposes each physical input as its own query parameter so a single mutation
 * really is single.
 *
 * This is NOT circular. The harness controls PHYSICAL properties (px, colours,
 * z-index, ink fraction); the quantizers derive TERMS from the rendered result.
 * If density's denominator were the bounding box, mutating `radius` alone would
 * still flip the density block — and the matrix would catch it.
 *
 * The ink is painted as a FRACTION OF THE CLIPPED REGION so that resizing the
 * target does not change its ink ratio. A size mutation that also changed
 * density would be the harness's fault, not the quantizer's.
 */

import React from 'react';
import { useSearchParams } from 'react-router-dom';

const NOTCH_CLIP = 'polygon(0 0, 100% 0, 100% 80%, 0 100%)';

export default function PhenotypeHarness() {
  const [params] = useSearchParams();

  const bg = params.get('bg') ?? '#000000';
  const fg = params.get('fg') ?? '#ff0000';
  const width = Number(params.get('w') ?? 200);
  const height = Number(params.get('h') ?? 100);
  const radius = Number(params.get('radius') ?? 0);
  const z = Number(params.get('z') ?? 0);
  const ink = Math.min(Math.max(Number(params.get('ink') ?? 0.2), 0), 1);
  const clip = params.get('clip') ?? 'none';

  // Ink is drawn as a centred bar covering `ink` of the target's area, so the
  // painted FRACTION is invariant under width/height changes.
  const inkHeight = height * ink;

  return (
    <div
      id="phenotype-stage"
      style={{
        position: 'fixed',
        inset: 0,
        margin: 0,
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        id="phenotype-target"
        style={{
          position: 'relative',
          width: `${width}px`,
          height: `${height}px`,
          borderRadius: `${radius}px`,
          zIndex: z,
          background: bg,
          color: fg,
          clipPath: clip === 'notch' ? NOTCH_CLIP : 'none',
          overflow: 'hidden',
        }}
      >
        <div
          id="phenotype-ink"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${(height - inkHeight) / 2}px`,
            height: `${inkHeight}px`,
            background: fg,
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Register the route**

In `src/main.jsx`, inside the existing `if (import.meta.env.DEV) {` block, add the lazy import beside the other harnesses:

```jsx
  const PhenotypeHarness = React.lazy(() =>
    import("./pages/_dev/PhenotypeHarness.jsx")
  );
```

and add this route object to the `devSpikeRoutes` array, after the `__immune/lexical` entry:

```jsx
    {
      // Visual Phenotype Calculus controlled-mutation harness (spec §3.4).
      path: "__immune/phenotype",
      element: (
        <React.Suspense fallback={null}>
          <PhenotypeHarness />
        </React.Suspense>
      ),
    },
```

- [ ] **Step 3: Verify the harness renders**

Run: `npm run dev`, then open `http://127.0.0.1:5173/__immune/phenotype?w=200&h=100&radius=50&ink=0.5`

Expected: a pill-shaped target on a black page, with a centred red bar covering half the target's height. Then change `radius=50` to `radius=0` in the URL — the target becomes square-cornered and the bar is unchanged. That second check is the point of the harness: `radius` moves shape and nothing else.

The route only exists under `import.meta.env.DEV`, so it is unreachable in a production build by construction — the same guard the other `__immune` harnesses use.

- [ ] **Step 4: Commit**

```bash
git add src/pages/_dev/PhenotypeHarness.jsx src/main.jsx
git commit -m "feat(phenotype): dev-only controlled-mutation harness route"
```

---

### Task 7: The directed orthogonality matrix

**Files:**
- Create: `tests/visual/phenotype-orthogonality.spec.ts`

**Interfaces:**
- Consumes: all six quantizers, `LIVE_AXES`, `vectorToBlocks`, the `__immune/phenotype` route
- Produces: the sealed pre-flight result — 30 directed checks that must all pass before any `AuthorityProfile` seals (spec §3.4, criteria 3 and 5)

- [ ] **Step 1: Write the failing test**

Create `tests/visual/phenotype-orthogonality.spec.ts`:

```js
import { test, expect } from "@playwright/test";
import sharp from "sharp";

import { quantizeLuminance } from "../../src/core/phenotype/quantize/luminance.ts";
import { quantizeChromaticity } from "../../src/core/phenotype/quantize/chromaticity.ts";
import { quantizeStacking } from "../../src/core/phenotype/quantize/stacking.ts";
import { quantizeSize } from "../../src/core/phenotype/quantize/size.ts";
import { quantizeShape } from "../../src/core/phenotype/quantize/shape.ts";
import {
  clippedRegionArea,
  countInkPixels,
  quantizeDensity,
} from "../../src/core/phenotype/quantize/density.ts";
import { LIVE_AXES, AXIS_SLOTS } from "../../src/core/phenotype/isolation.ts";
import { vectorToBlocks } from "../../src/core/phenotype/vector.ts";
import { parseCssColor } from "../../src/core/phenotype/color.ts";

const PROFILE = "A1B2C3";

const PALETTE = [
  { name: "ember", hue: 40 },
  { name: "verdant", hue: 140 },
  { name: "abyss", hue: 260 },
];

/** Baseline: every axis sits mid-tier, well clear of a boundary. */
const BASELINE = {
  bg: "#000000",
  fg: "#ff0000",
  w: 200,
  h: 100,
  radius: 0,
  z: 0,
  ink: 0.2,
  clip: "none",
};

/**
 * One mutation per axis. Each moves ONLY that axis's physical inputs and is
 * large enough to cross a tier boundary with room to spare.
 */
const MUTATIONS: Record<string, Record<string, string | number>> = {
  // Same hue family, far lower contrast against black: high -> fail.
  luminance: { fg: "#2a0d00" },
  // base -> overlay.
  stacking: { z: 100 },
  // panel -> surface (area ratio well past 0.3 at 1280x720).
  size: { w: 900, h: 700 },
  // ember (hue 40) -> abyss (hue ~264), luminance held near-constant.
  chromaticity: { fg: "#3a1fd6" },
  // rect -> pill.
  shape: { radius: 50 },
  // 0.2 -> 0.9: measured -> packed.
  density: { ink: 0.9 },
};

function buildUrl(overrides: Record<string, string | number>): string {
  const params = { ...BASELINE, ...overrides };
  const query = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ).toString();
  return `/__immune/phenotype?${query}`;
}

/** Decompile the rendered target into a MeasurementVector. Pixels and computed styles only. */
async function measure(page: import("@playwright/test").Page) {
  const target = page.locator("#phenotype-target");
  await target.waitFor({ state: "visible" });

  const styles = await target.evaluate((el) => {
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const ink = el.querySelector("#phenotype-ink");
    const inkCs = ink ? getComputedStyle(ink) : null;
    return {
      background: cs.backgroundColor,
      foreground: inkCs ? inkCs.backgroundColor : cs.color,
      zIndex: cs.zIndex,
      borderRadiusPx: parseFloat(cs.borderTopLeftRadius) || 0,
      clipPath: cs.clipPath,
      width: rect.width,
      height: rect.height,
      viewportArea: window.innerWidth * window.innerHeight,
    };
  });

  // Density: rasterize the element, count pixels differing from the background.
  const png = await target.screenshot({ animations: "disabled" });
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const background = parseCssColor(styles.background);

  let density = null;
  if (background && styles.clipPath.trim() === "none") {
    const inkPixels = countInkPixels(data, info.channels, background);
    const area = clippedRegionArea({
      width: styles.width,
      height: styles.height,
      borderRadiusPx: styles.borderRadiusPx,
    });
    density = quantizeDensity(inkPixels, area);
  }
  // A clip-path silhouette has no closed-form clipped area, so density is
  // UNMEASURED rather than approximated. Never substitute a default.

  return {
    luminance: quantizeLuminance(styles.foreground, styles.background),
    stacking: quantizeStacking(styles.zIndex),
    size: quantizeSize(styles.width * styles.height, styles.viewportArea),
    chromaticity: quantizeChromaticity(styles.foreground, PALETTE),
    shape: quantizeShape({
      width: styles.width,
      height: styles.height,
      borderRadiusPx: styles.borderRadiusPx,
      clipPath: styles.clipPath,
    }),
    density,
  };
}

test.describe("Phenotype orthogonality matrix (spec §3.4)", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test("baseline measures every live axis — no nulls to hide behind", async ({ page }) => {
    await page.goto(buildUrl({}));
    const vector = await measure(page);
    for (const axis of LIVE_AXES) {
      expect(vector[axis], `axis ${axis} must be measurable at baseline`).not.toBeNull();
    }
  });

  test("each mutation actually moves its own axis", async ({ page }) => {
    await page.goto(buildUrl({}));
    const baseline = await measure(page);

    for (const axis of LIVE_AXES) {
      await page.goto(buildUrl(MUTATIONS[axis]));
      const mutated = await measure(page);
      expect(
        mutated[axis],
        `mutation for ${axis} did not change its own term — the fixture is inert`,
      ).not.toBe(baseline[axis]);
    }
  });

  test("30 directed checks: mutating A never changes B's block", async ({ page }) => {
    await page.goto(buildUrl({}));
    const baselineBlocks = vectorToBlocks(await measure(page), PROFILE);

    const coupled = [];
    let checks = 0;

    for (const mutatedAxis of LIVE_AXES) {
      await page.goto(buildUrl(MUTATIONS[mutatedAxis]));
      const blocks = vectorToBlocks(await measure(page), PROFILE);

      for (const observedAxis of LIVE_AXES) {
        if (observedAxis === mutatedAxis) continue;
        checks += 1;

        const slot = AXIS_SLOTS[observedAxis];
        if (blocks[slot] !== baselineBlocks[slot]) {
          coupled.push(`${mutatedAxis} -> ${observedAxis}`);
        }
      }
    }

    // n * (n - 1) directed pairs, NOT C(n, 2). Direction matters: "mutate shape,
    // assert density unchanged" tests the density denominator, while "mutate
    // density, assert shape unchanged" tests whether the shape quantizer reads
    // painted extent. Different failure modes.
    expect(checks).toBe(LIVE_AXES.length * (LIVE_AXES.length - 1));
    expect(checks).toBe(30);

    // A coupled pair forces a redesign of the axes — never an amendment to this
    // assertion (spec §9).
    expect(coupled, `coupled axis pairs: ${coupled.join(", ")}`).toEqual([]);
  });

  test("slot 0 never moves under any evidence mutation", async ({ page }) => {
    await page.goto(buildUrl({}));
    const baselineBlocks = vectorToBlocks(await measure(page), PROFILE);

    for (const axis of LIVE_AXES) {
      await page.goto(buildUrl(MUTATIONS[axis]));
      const blocks = vectorToBlocks(await measure(page), PROFILE);
      expect(blocks[0], `slot 0 moved when mutating ${axis}`).toBe(baselineBlocks[0]);
    }
  });

  test("a clip-path leaves density unmeasured rather than approximated", async ({ page }) => {
    await page.goto(buildUrl({ clip: "notch" }));
    const vector = await measure(page);
    expect(vector.shape).toBe("notched");
    expect(vector.density).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/visual/phenotype-orthogonality.spec.ts --project=chromium --workers=1 --reporter=line`
Expected: FAIL. The harness route exists (Task 6) but the shape→density coupling has not been proven; the most likely first failure is one or more entries in `coupled`.

- [ ] **Step 3: Fix real couplings, never the assertion**

If `coupled` is non-empty, the failure names the pair. Diagnose against the isolation contract before touching anything:

| Reported pair | Likely cause | Fix |
|---|---|---|
| `shape -> density` | density denominator is the bounding box | use `clippedRegionArea` (Task 4) |
| `size -> density` | ink is a fixed px height, not a fraction | harness `ink` must scale with height (Task 6) |
| `stacking -> luminance` | contrast read from screenshot pixels | read the computed fg/bg pair (Task 2) |
| `chromaticity -> luminance` | palette swap changed lightness | pick an isoluminant mutation colour |
| `luminance -> chromaticity` | chromaticity keyed on a\*/b\* | key on the LCh hue angle (Task 2) |
| `density -> shape` | shape reads painted extent | shape must read border-radius only (Task 3) |

**Do not widen the assertion, add an exemption list, or mark a pair expected.** Per spec §7 trap 10, a coupled pair that gets rationalised is the failure mode this matrix exists to prevent.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/visual/phenotype-orthogonality.spec.ts --project=chromium --workers=1 --reporter=line`
Expected: PASS — 5 tests, with the matrix reporting `checks === 30` and `coupled === []`

- [ ] **Step 5: Run the full unit suite for regressions**

Run: `npx vitest run tests/qa/features/phenotype-color.test.ts tests/qa/features/phenotype-quantize.test.ts tests/qa/features/phenotype-vector.test.ts`
Expected: PASS — 58 tests

- [ ] **Step 6: Run the SCD64 fossil check**

Run: `npm run scd64:intellisense`
Expected: no new findings attributable to `src/core/phenotype/`

- [ ] **Step 7: Commit**

```bash
git add tests/visual/phenotype-orthogonality.spec.ts
git commit -m "test(phenotype): directed 30-check orthogonality matrix"
```

---

## Done When

- `npx vitest run tests/qa/features/phenotype-*.test.ts` passes (58 tests)
- `npx playwright test tests/visual/phenotype-orthogonality.spec.ts --project=chromium --workers=1` passes with `checks === 30`, `coupled === []`
- Every axis in `LIVE_AXES` has a populated `IsolationContract`
- No axis returns a defaulted term when its input is unmeasurable

## Deliberately Not In This Plan

Per spec §1.2 and the scope note above — these belong to plans 2 and 3, and no verdict from this plan may be cited as evidence about any of them:

- `AuthorityProfile`, salience ranking, primacy claims
- predicated `Prediction`s and `CausalHypothesisStatus` verdicts
- SCDL intent dialect and compiler passes
- BytecodeHealth receipts and gate-failure behaviour
- motion (slot 7)
- effective composited contrast — the known blind spot of reading contrast from computed styles
