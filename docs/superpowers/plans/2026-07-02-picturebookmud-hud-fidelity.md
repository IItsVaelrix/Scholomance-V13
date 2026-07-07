# pictureBookMUD Full-Fidelity HUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the PixelBrain MMORPG UI from flat prototype panels to a professional HUD: deterministic lattice-generated parchment chrome with layered depth, per-panel painter modules, and a full layout edit mode (drag-move, resize, z-order, persistence).

**Architecture:** Pure seeded lattice generators produce `PixelBrainCell[]` chrome that is baked once to offscreen canvases and blitted per frame; a painter registry replaces the monolithic renderer's per-id `if` chain; a new interaction controller adds edit mode on top of the existing layout engine, with an anchor-aware inverse mapping and localStorage persistence.

**Tech Stack:** Vanilla ES modules (Node ≥20), Canvas 2D, Vitest 2.x (already in the submodule), Playwright (already at mother-repo root). **No new npm dependencies.**

**Spec:** `docs/superpowers/specs/2026-07-02-picturebookmud-hud-fidelity-design.md`

## Global Constraints

- All implementation happens inside the **`Scholomance OS/` git submodule** (`/home/deck/Downloads/Scholomance-V12-main/Scholomance OS/`). Commit there. The mother repo gets one submodule-pointer commit at the end.
- Run tests from the submodule root: `cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && npm test` (vitest run, ESM).
- **Determinism law:** no `Math.random`, `Date.now`, or `performance.now` anywhere under `client/pixelbrain-ui/`. All animation keys off `currentTick`.
- `picture_book_mud` is the default theme. Other themes (`void_obsidian` etc., cycled with `T`) must keep working via the legacy `drawPixelPanel` path — never crash.
- The existing suite (esp. `tests/ui-system.test.js`) must stay green after every task.
- **Never import `client/pixelbrain-ui/renderers/canvasRenderer.js` in vitest tests** — it imports `/codex/core/pixelbrain/scdl/index.js` (a browser-absolute path) which Node cannot resolve. Test the modules it delegates to instead.
- Panel chrome may overshoot the panel rect by at most `CHROME_PAD = 8` cells (shadow, deckle).
- Painter signature everywhere: `paint(ctx, node, rect, theme, tick, gameState, helpers)` with `rect = {x, y, w, h}` and `helpers = { chromeCache, drawHudAsset, drawPixelPanel, scdlItems }`.

## File Structure

```txt
Scholomance OS/client/pixelbrain-ui/
  core/
    latticeRng.js        NEW  seeded PRNG (FNV-1a hash + mulberry32)
    latticeChrome.js     NEW  panel/disc chrome generators → PixelBrainCell[]
    latticeMotifs.js     NEW  waxSeal, compassRose, ropeSocket, cornerFlourish
    layoutEngine.js      MOD  bringToFront, setNodeScreenRect (inverse anchors)
    layoutStore.js       NEW  serialize/apply layout + localStorage store
    interaction.js       NEW  edit mode: hit zones, drag-move, resize, snap
    uiManager.js         MOD  wire interaction, L/R keys, persistence, cursor
  renderers/
    chromeCache.js       NEW  bake cells → offscreen canvas, keyed cache
    canvasRenderer.js    MOD  becomes compositor: chrome blit + painter dispatch
  panels/
    index.js             NEW  PANEL_PAINTERS / TYPE_PAINTERS / CHROME_VARIANTS
    playerFrame.js       NEW  target of Task 6
    targetFrame.js       NEW  Task 6
    bar.js               NEW  inked gauge (type painter), Task 6
    hotbar.js            NEW  Task 7 (container + slot painter + spell input)
    minimap.js           NEW  Task 8
    questTracker.js      NEW  Task 8 (tracker + quest text painter)
    chat.js              NEW  Task 8
    bossAlerts.js        NEW  Task 9
    partyFrames.js       NEW  Task 9
    limbDiorama.js       NEW  Task 9 (moved from canvasRenderer)
  presets/
    defaultLayout.js     MOD  frame/hotbar/tracker geometry updates (Tasks 6-8)

Scholomance OS/tests/
  helpers/fakeCtx.js     NEW  recording Canvas2D stub for painter tests
  lattice-rng.test.js    NEW
  lattice-chrome.test.js NEW
  chrome-cache.test.js   NEW
  panel-painters.test.js NEW
  layout-editing.test.js NEW
  layout-store.test.js   NEW
  interaction.test.js    NEW

Scholomance OS/scripts/
  hud-screenshot.mjs     NEW  Playwright visual verification harness
```

---

### Task 1: Deterministic PRNG utilities

**Files:**
- Create: `Scholomance OS/client/pixelbrain-ui/core/latticeRng.js`
- Test: `Scholomance OS/tests/lattice-rng.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `hashStringToSeed(str: string): number` (uint32), `mulberry32(seed: number): () => number` (floats in [0,1)), `makePanelRng(panelId: string, w: number, h: number): () => number`. Tasks 2–3 call `makePanelRng`.

- [ ] **Step 1: Write the failing test**

```js
// Scholomance OS/tests/lattice-rng.test.js
import { describe, it, expect } from 'vitest';
import { hashStringToSeed, mulberry32, makePanelRng } from '../client/pixelbrain-ui/core/latticeRng.js';

describe('latticeRng', () => {
  it('same seed produces identical sequences', () => {
    const a = mulberry32(1234);
    const b = mulberry32(1234);
    expect(Array.from({ length: 32 }, () => a())).toEqual(Array.from({ length: 32 }, () => b()));
  });

  it('different seeds diverge', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('hashStringToSeed is stable and uint32', () => {
    const h = hashStringToSeed('player_frame');
    expect(h).toBe(hashStringToSeed('player_frame'));
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });

  it('makePanelRng varies by panel id and by size', () => {
    const base = makePanelRng('chat_panel', 260, 120)();
    expect(makePanelRng('quest_tracker', 260, 120)()).not.toBe(base);
    expect(makePanelRng('chat_panel', 264, 120)()).not.toBe(base);
  });

  it('values stay in [0, 1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i += 1) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && npx vitest run tests/lattice-rng.test.js`
Expected: FAIL — cannot resolve `../client/pixelbrain-ui/core/latticeRng.js`.

- [ ] **Step 3: Write the implementation**

```js
// Scholomance OS/client/pixelbrain-ui/core/latticeRng.js
// Deterministic seeded randomness for PixelBrain lattice chrome.
// Law: no Math.random / Date.now anywhere under client/pixelbrain-ui/.

export function hashStringToSeed(str) {
  let h = 2166136261 >>> 0; // FNV-1a 32-bit
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One rng per (panelId, w, h): a panel's chrome is stable for a given size
// and re-noises deterministically when resized.
export function makePanelRng(panelId, w, h) {
  return mulberry32(hashStringToSeed(`${panelId}|${w}x${h}`));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && npx vitest run tests/lattice-rng.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit (in the submodule)**

```bash
cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS"
git add client/pixelbrain-ui/core/latticeRng.js tests/lattice-rng.test.js
git commit -m "feat(hud): add deterministic seeded PRNG for lattice chrome"
```

---

### Task 2: Lattice motif generators

**Files:**
- Create: `Scholomance OS/client/pixelbrain-ui/core/latticeMotifs.js`
- Test: `Scholomance OS/tests/lattice-chrome.test.js` (motif describe block; Task 3 extends this file)

**Interfaces:**
- Consumes: nothing (motifs receive an `rng` where they need noise).
- Produces (all return `PixelBrainCell[]` with `partId: 'motif'`, `isMotif: true`):
  - `waxSeal(rng, cx, cy, r): cells` — wax colors are fixed (`#8c2f2f` body, `#5e1f1f` ring, `#f0e3c0` sigil), not themed.
  - `compassRose(cx, cy, r, inkColor): cells`
  - `ropeSocket(rng, w, h, inkColor): cells` — stitch dashes around the rect `(0,0,w,h)`.
  - `cornerFlourish(w, h, inkColor): cells` — ink curls at the 4 corners of `(0,0,w,h)`.

- [ ] **Step 1: Write the failing test**

```js
// Scholomance OS/tests/lattice-chrome.test.js
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../client/pixelbrain-ui/core/latticeRng.js';
import { waxSeal, compassRose, ropeSocket, cornerFlourish } from '../client/pixelbrain-ui/core/latticeMotifs.js';

const INK = '#5c4538';

describe('latticeMotifs', () => {
  it('waxSeal is deterministic and centered', () => {
    const a = waxSeal(mulberry32(9), 20, 20, 9);
    const b = waxSeal(mulberry32(9), 20, 20, 9);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    a.forEach((c) => {
      expect(Math.hypot(c.x - 20, c.y - 20)).toBeLessThanOrEqual(9.5);
      expect(c.partId).toBe('motif');
      expect(c.isMotif).toBe(true);
    });
  });

  it('compassRose stays within its radius', () => {
    const cells = compassRose(60, 60, 40, INK);
    expect(cells.length).toBeGreaterThan(0);
    cells.forEach((c) => expect(Math.hypot(c.x - 60, c.y - 60)).toBeLessThanOrEqual(40.5));
  });

  it('ropeSocket stitches hug the rect perimeter', () => {
    const cells = ropeSocket(mulberry32(3), 48, 48, INK);
    expect(cells.length).toBeGreaterThan(0);
    cells.forEach((c) => {
      const nearEdge = c.x <= 3 || c.y <= 3 || c.x >= 44 || c.y >= 44;
      expect(nearEdge).toBe(true);
    });
  });

  it('cornerFlourish emits cells near all four corners', () => {
    const cells = cornerFlourish(100, 60, INK);
    const corners = [[0, 0], [99, 0], [0, 59], [99, 59]];
    corners.forEach(([cx, cy]) => {
      expect(cells.some((c) => Math.hypot(c.x - cx, c.y - cy) <= 10)).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && npx vitest run tests/lattice-chrome.test.js`
Expected: FAIL — cannot resolve `latticeMotifs.js`.

- [ ] **Step 3: Write the implementation**

```js
// Scholomance OS/client/pixelbrain-ui/core/latticeMotifs.js
// Hand-drawn lattice motifs stamped into pictureBookMUD panel chrome.
// Pure + deterministic: same inputs → identical PixelBrainCell[].

function motifCell(x, y, color) {
  return { x: Math.round(x), y: Math.round(y), partId: 'motif', color, isMotif: true };
}

// Filled wax disc with a darker pressed ring and a pale sigil cross.
export function waxSeal(rng, cx, cy, r) {
  const cells = [];
  for (let y = -r; y <= r; y += 1) {
    for (let x = -r; x <= r; x += 1) {
      const d = Math.hypot(x, y);
      if (d > r) continue;
      // lumpy wax edge
      if (d > r - 1.2 && rng() < 0.35) continue;
      let color = '#8c2f2f';
      if (d > r - 1.6) color = '#5e1f1f';
      else if (Math.abs(d - r * 0.65) < 0.8) color = '#5e1f1f'; // pressed ring
      cells.push(motifCell(cx + x, cy + y, color));
    }
  }
  // sigil cross in pale wax
  for (let i = -Math.floor(r * 0.35); i <= Math.floor(r * 0.35); i += 1) {
    cells.push(motifCell(cx + i, cy, '#f0e3c0'));
    cells.push(motifCell(cx, cy + i, '#f0e3c0'));
  }
  return cells;
}

// Ring + 8 spokes + longer cardinal ticks, angle-stepped (deterministic).
export function compassRose(cx, cy, r, inkColor) {
  const cells = [];
  const steps = Math.max(48, Math.floor(r * 8));
  for (let i = 0; i < steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    cells.push(motifCell(cx + Math.cos(t) * r, cy + Math.sin(t) * r, inkColor));
    cells.push(motifCell(cx + Math.cos(t) * r * 0.55, cy + Math.sin(t) * r * 0.55, inkColor));
  }
  for (let s = 0; s < 8; s += 1) {
    const t = (s / 8) * Math.PI * 2;
    const len = s % 2 === 0 ? r : r * 0.7; // cardinals longer
    for (let d = r * 0.15; d <= len; d += 1) {
      cells.push(motifCell(cx + Math.cos(t) * d, cy + Math.sin(t) * d, inkColor));
    }
  }
  return cells;
}

// Stitch dashes (3 on / 3 off) around the rect perimeter, with knot dots at corners.
export function ropeSocket(rng, w, h, inkColor) {
  const cells = [];
  const stitch = (x, y, i) => {
    if (i % 6 < 3) cells.push(motifCell(x, y, inkColor));
  };
  for (let x = 2; x < w - 2; x += 1) {
    stitch(x, 1, x);
    stitch(x, h - 2, x + 3); // offset so top/bottom stitches alternate
  }
  for (let y = 2; y < h - 2; y += 1) {
    stitch(1, y, y);
    stitch(w - 2, y, y + 3);
  }
  // corner knots (2x2, with one deterministic "loose thread" cell)
  [[1, 1], [w - 3, 1], [1, h - 3], [w - 3, h - 3]].forEach(([kx, ky]) => {
    for (let dy = 0; dy < 2; dy += 1) {
      for (let dx = 0; dx < 2; dx += 1) cells.push(motifCell(kx + dx, ky + dy, inkColor));
    }
    if (rng() < 0.5) cells.push(motifCell(kx + (rng() < 0.5 ? -1 : 2), ky - 1, inkColor));
  });
  return cells;
}

// Quarter-circle ink curls + a dot at each corner of (0,0,w,h).
export function cornerFlourish(w, h, inkColor) {
  const cells = [];
  const curl = (cx, cy, sx, sy) => {
    for (let i = 0; i <= 12; i += 1) {
      const t = (i / 12) * (Math.PI / 2);
      cells.push(motifCell(cx + sx * Math.cos(t) * 5, cy + sy * Math.sin(t) * 5, inkColor));
    }
    cells.push(motifCell(cx + sx * 7, cy + sy * 2, inkColor)); // trailing dot
  };
  curl(6, 6, 1, 1);
  curl(w - 7, 6, -1, 1);
  curl(6, h - 7, 1, -1);
  curl(w - 7, h - 7, -1, -1);
  return cells;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && npx vitest run tests/lattice-chrome.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS"
git add client/pixelbrain-ui/core/latticeMotifs.js tests/lattice-chrome.test.js
git commit -m "feat(hud): add deterministic lattice motif generators (wax seal, compass rose, stitches, flourish)"
```

---

### Task 3: Panel + disc chrome generators

**Files:**
- Create: `Scholomance OS/client/pixelbrain-ui/core/latticeChrome.js`
- Modify (extend): `Scholomance OS/tests/lattice-chrome.test.js`

**Interfaces:**
- Consumes: `makePanelRng` (Task 1); `waxSeal`, `compassRose`, `ropeSocket`, `cornerFlourish` (Task 2).
- Produces:
  - `CHROME_PAD = 8` — max cell overshoot beyond the panel rect (baker and compositor both use it).
  - `chromeTones(theme): { shadow, shadowSoft, board, boardEdge, parchment: [base, dark, light], hatch, rim, rimBleed }`
  - `deckledEdgeOffsets(rng, length, base = 3, amplitude = 2): number[]` — smoothed torn-edge offsets.
  - `generatePanelChrome({ id, w, h, theme, variant = 'panel' }): PixelBrainCell[]` — variants: `'panel'` (+ cornerFlourish), `'tracker'` (+ waxSeal top-right + cornerFlourish), `'slot'` (tight deckle base 1/amp 1, + ropeSocket stitches), `'hotbar'` (same as panel, no flourish).
  - `generateDiscChrome({ id, size, theme }): PixelBrainCell[]` — circular parchment lens with deckled rim + baked compassRose (for `minimap_orb`).
- Layer `partId` values painted back-to-front by cell order: `shadow`, `board`, `parchment`, `rim`, `motif`.

- [ ] **Step 1: Add failing tests**

Append to `Scholomance OS/tests/lattice-chrome.test.js`:

```js
import { THEMES } from '../client/pixelbrain-ui/core/themeRegistry.js';
import {
  CHROME_PAD,
  deckledEdgeOffsets,
  generatePanelChrome,
  generateDiscChrome,
} from '../client/pixelbrain-ui/core/latticeChrome.js';

const theme = THEMES.pictureBookMUD;

describe('generatePanelChrome', () => {
  const spec = { id: 'player_frame', w: 292, h: 84, theme };

  it('is byte-identical across calls (determinism law)', () => {
    expect(generatePanelChrome(spec)).toEqual(generatePanelChrome(spec));
  });

  it('re-noises when size changes', () => {
    const a = JSON.stringify(generatePanelChrome(spec));
    const b = JSON.stringify(generatePanelChrome({ ...spec, w: 296 }));
    expect(a).not.toBe(b);
  });

  it('contains every chrome layer', () => {
    const parts = new Set(generatePanelChrome(spec).map((c) => c.partId));
    ['shadow', 'board', 'parchment', 'rim', 'motif'].forEach((p) => expect(parts.has(p)).toBe(true));
  });

  it('never exceeds the CHROME_PAD overshoot budget', () => {
    generatePanelChrome(spec).forEach((c) => {
      expect(c.x).toBeGreaterThanOrEqual(-CHROME_PAD);
      expect(c.x).toBeLessThan(spec.w + CHROME_PAD);
      expect(c.y).toBeGreaterThanOrEqual(-CHROME_PAD);
      expect(c.y).toBeLessThan(spec.h + CHROME_PAD);
    });
  });

  it('slot variant differs from panel variant', () => {
    const a = JSON.stringify(generatePanelChrome({ id: 'slot_1', w: 48, h: 48, theme, variant: 'slot' }));
    const b = JSON.stringify(generatePanelChrome({ id: 'slot_1', w: 48, h: 48, theme, variant: 'panel' }));
    expect(a).not.toBe(b);
  });

  it('rim cells carry isRim', () => {
    const rims = generatePanelChrome(spec).filter((c) => c.partId === 'rim');
    expect(rims.length).toBeGreaterThan(0);
    rims.forEach((c) => expect(c.isRim).toBe(true));
  });
});

describe('deckledEdgeOffsets', () => {
  it('stays within [base, base+amplitude] after smoothing', () => {
    const rng = () => 0.999; // max jitter
    deckledEdgeOffsets(rng, 50, 3, 2).forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(5);
    });
  });
});

describe('generateDiscChrome', () => {
  const spec = { id: 'minimap_orb', size: 120, theme };

  it('is deterministic', () => {
    expect(generateDiscChrome(spec)).toEqual(generateDiscChrome(spec));
  });

  it('cells stay inside the padded disc bounds', () => {
    generateDiscChrome(spec).forEach((c) => {
      expect(c.x).toBeGreaterThanOrEqual(-CHROME_PAD);
      expect(c.x).toBeLessThan(120 + CHROME_PAD);
      expect(c.y).toBeGreaterThanOrEqual(-CHROME_PAD);
      expect(c.y).toBeLessThan(120 + CHROME_PAD);
    });
  });

  it('bakes a compass rose motif', () => {
    expect(generateDiscChrome(spec).some((c) => c.partId === 'motif')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && npx vitest run tests/lattice-chrome.test.js`
Expected: FAIL — cannot resolve `latticeChrome.js`. (The 4 motif tests still pass.)

- [ ] **Step 3: Write the implementation**

```js
// Scholomance OS/client/pixelbrain-ui/core/latticeChrome.js
// Deterministic PixelBrain lattice chrome for pictureBookMUD panels.
// Every panel is a stack of lattice layers, painted back-to-front in cell
// order: shadow → board → parchment (grain + crosshatch) → rim → motif.
// Pure functions: same inputs → identical PixelBrainCell[] (see types.js).

import { makePanelRng } from './latticeRng.js';
import { waxSeal, compassRose, ropeSocket, cornerFlourish } from './latticeMotifs.js';

export const CHROME_PAD = 8;   // max cell overshoot beyond the panel rect
const SHADOW_OFF = 5;          // cast-shadow offset ("lifted page")

export function chromeTones(theme) {
  return {
    shadow: 'rgba(60, 45, 35, 0.20)',
    shadowSoft: 'rgba(60, 45, 35, 0.10)',
    board: '#8a6f52',
    boardEdge: '#6e563e',
    parchment: [theme.palette.panel, '#e0cfa6', '#f0e3c0'], // base, dark fleck, light fleck
    hatch: 'rgba(92, 69, 56, 0.30)',
    rim: theme.palette.rim,
    rimBleed: 'rgba(92, 69, 56, 0.35)',
  };
}

// Smoothed per-column / per-row torn-paper offsets.
export function deckledEdgeOffsets(rng, length, base = 3, amplitude = 2) {
  const raw = Array.from({ length }, () => base + Math.floor(rng() * (amplitude + 1)));
  const out = new Array(length);
  for (let i = 0; i < length; i += 1) {
    const a = raw[Math.max(0, i - 1)];
    const b = raw[i];
    const c = raw[Math.min(length - 1, i + 1)];
    out[i] = Math.max(base, Math.min(base + amplitude, Math.round((a + b + c) / 3)));
  }
  return out;
}

export function generatePanelChrome({ id, w, h, theme, variant = 'panel' }) {
  const rng = makePanelRng(`${variant}:${id}`, w, h);
  const tones = chromeTones(theme);
  const cells = [];
  const push = (x, y, partId, color, extra) => cells.push({ x, y, partId, color, ...extra });

  // Deckled sheet contour — all layers reference it.
  const tight = variant === 'slot';
  const base = tight ? 1 : 3;
  const amp = tight ? 1 : 2;
  const topOff = deckledEdgeOffsets(rng, w, base, amp);
  const botOff = deckledEdgeOffsets(rng, w, base, amp);
  const leftOff = deckledEdgeOffsets(rng, h, base, amp);
  const rightOff = deckledEdgeOffsets(rng, h, base, amp);
  const inSheet = (x, y) =>
    x >= 0 && x < w && y >= 0 && y < h &&
    y >= topOff[x] && y <= h - 1 - botOff[x] &&
    x >= leftOff[y] && x <= w - 1 - rightOff[y];

  // 1. Cast shadow: offset rect, only the band not hidden behind the board,
  //    with a dithered falloff fringe.
  for (let y = SHADOW_OFF; y < h + SHADOW_OFF; y += 1) {
    for (let x = SHADOW_OFF; x < w + SHADOW_OFF; x += 1) {
      if (x < w && y < h) continue; // covered by the board
      const fringe = Math.max(x - w, y - h); // 0..SHADOW_OFF-1
      if (fringe >= 2 && rng() < 0.35 + fringe * 0.15) continue;
      push(x, y, 'shadow', fringe < 2 ? tones.shadow : tones.shadowSoft);
    }
  }

  // 2. Backing board: visible through the deckle bites near the edges.
  const boardBand = base + amp + 5;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const nearEdge = x < boardBand || y < boardBand || x >= w - boardBand || y >= h - boardBand;
      if (!nearEdge || inSheet(x, y)) continue;
      const outline = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      push(x, y, 'board', outline ? tones.boardEdge : tones.board);
    }
  }

  // 3. Parchment sheet: grain flecks + woodcut crosshatch along inner bottom/right.
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!inSheet(x, y)) continue;
      const v = rng();
      let color = tones.parchment[0];
      if (v < 0.05) color = tones.parchment[1];
      else if (v > 0.97) color = tones.parchment[2];
      push(x, y, 'parchment', color);

      const distBottom = (h - 1 - botOff[x]) - y;
      const distRight = (w - 1 - rightOff[y]) - x;
      const band = Math.min(distBottom, distRight);
      if (band >= 1 && band < 6 && (x + y) % 4 === 0) {
        push(x, y, 'parchment', tones.hatch, { shading: 'crosshatch' });
      }
    }
  }

  // 4. Ink border traces the deckled contour, with wet-nib bleed inward.
  for (let x = 0; x < w; x += 1) {
    push(x, topOff[x], 'rim', tones.rim, { isRim: true });
    push(x, h - 1 - botOff[x], 'rim', tones.rim, { isRim: true });
    if (rng() < 0.35) push(x, topOff[x] + 1, 'rim', tones.rimBleed, { isRim: true });
    if (rng() < 0.35) push(x, h - 2 - botOff[x], 'rim', tones.rimBleed, { isRim: true });
  }
  for (let y = 0; y < h; y += 1) {
    push(leftOff[y], y, 'rim', tones.rim, { isRim: true });
    push(w - 1 - rightOff[y], y, 'rim', tones.rim, { isRim: true });
    if (rng() < 0.35) push(leftOff[y] + 1, y, 'rim', tones.rimBleed, { isRim: true });
    if (rng() < 0.35) push(w - 2 - rightOff[y], y, 'rim', tones.rimBleed, { isRim: true });
  }

  // 5. Variant motifs.
  if (variant === 'panel') {
    cells.push(...cornerFlourish(w, h, tones.rim));
  } else if (variant === 'tracker') {
    cells.push(...cornerFlourish(w, h, tones.rim));
    cells.push(...waxSeal(rng, w - 16, 16, 9));
  } else if (variant === 'slot') {
    cells.push(...ropeSocket(rng, w, h, tones.rim));
  }
  // 'hotbar': plain sheet — slots carry their own stitches.

  return cells;
}

// Circular parchment lens (minimap): deckled rim, grain, baked compass rose,
// offset shadow crescent.
export function generateDiscChrome({ id, size, theme }) {
  const rng = makePanelRng(`disc:${id}`, size, size);
  const tones = chromeTones(theme);
  const cells = [];
  const c = (size - 1) / 2;
  const rOuter = c;
  const steps = 128;
  const deckle = deckledEdgeOffsets(rng, steps, 3, 2);
  const angleIdx = (dx, dy) =>
    Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * steps) % steps;

  // Shadow crescent (disc offset by +4,+4, not covered by the board disc).
  for (let y = 0; y < size + SHADOW_OFF; y += 1) {
    for (let x = 0; x < size + SHADOW_OFF; x += 1) {
      const dShifted = Math.hypot(x - 4 - c, y - 4 - c);
      const dBoard = Math.hypot(x - c, y - c);
      if (dShifted <= rOuter && dBoard > rOuter) {
        if (rng() < 0.3) continue;
        cells.push({ x, y, partId: 'shadow', color: tones.shadow });
      }
    }
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - c;
      const dy = y - c;
      const dist = Math.hypot(dx, dy);
      if (dist > rOuter) continue;
      const rParch = rOuter - deckle[angleIdx(dx, dy)];
      if (dist > rParch) {
        cells.push({ x, y, partId: 'board', color: dist > rOuter - 1.5 ? tones.boardEdge : tones.board });
      } else if (dist > rParch - 1.5) {
        cells.push({ x, y, partId: 'rim', color: tones.rim, isRim: true });
      } else {
        const v = rng();
        let color = tones.parchment[0];
        if (v < 0.05) color = tones.parchment[1];
        else if (v > 0.97) color = tones.parchment[2];
        cells.push({ x, y, partId: 'parchment', color });
      }
    }
  }

  cells.push(...compassRose(c, c, rOuter * 0.62, 'rgba(92, 69, 56, 0.45)'));
  return cells;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && npx vitest run tests/lattice-chrome.test.js`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS"
git add client/pixelbrain-ui/core/latticeChrome.js tests/lattice-chrome.test.js
git commit -m "feat(hud): deterministic parchment panel + disc lattice chrome generators"
```

---

### Task 4: Chrome baker + cache

**Files:**
- Create: `Scholomance OS/client/pixelbrain-ui/renderers/chromeCache.js`
- Test: `Scholomance OS/tests/chrome-cache.test.js`

**Interfaces:**
- Consumes: `generatePanelChrome`, `generateDiscChrome`, `CHROME_PAD` (Task 3).
- Produces:
  - `paintCells(ctx, cells, offsetX = 0, offsetY = 0): void` — 1×1 fillRect per cell.
  - `class ChromeCache { constructor(createCanvas?) ; get(id, variant, w, h, theme): canvas ; invalidateNode(id): void ; clear(): void }`
  - `get` bakes once per key `` `${variant}|${id}|${w}x${h}|${theme.id}` ``; the baked canvas is `(w + 2*CHROME_PAD) × (h + 2*CHROME_PAD)` and callers blit it at `(x - CHROME_PAD, y - CHROME_PAD)`. `variant === 'disc'` routes to `generateDiscChrome` with `size = w`.
  - `createCanvas(w, h)` is injectable so vitest (no DOM) can pass a fake; default uses `document.createElement('canvas')`.

- [ ] **Step 1: Write the failing test**

```js
// Scholomance OS/tests/chrome-cache.test.js
import { describe, it, expect } from 'vitest';
import { THEMES } from '../client/pixelbrain-ui/core/themeRegistry.js';
import { CHROME_PAD } from '../client/pixelbrain-ui/core/latticeChrome.js';
import { ChromeCache, paintCells } from '../client/pixelbrain-ui/renderers/chromeCache.js';

const theme = THEMES.pictureBookMUD;

function makeFakeCanvasFactory(created) {
  return (w, h) => {
    const ctx = { fillStyle: null, ops: 0, fillRect() { this.ops += 1; } };
    const canvas = { width: w, height: h, ctx, getContext: () => ctx };
    created.push(canvas);
    return canvas;
  };
}

describe('ChromeCache', () => {
  it('bakes once per (variant, id, size, theme) key', () => {
    const created = [];
    const cache = new ChromeCache(makeFakeCanvasFactory(created));
    const a = cache.get('player_frame', 'panel', 292, 84, theme);
    const b = cache.get('player_frame', 'panel', 292, 84, theme);
    expect(a).toBe(b);
    expect(created.length).toBe(1);
    expect(created[0].ctx.ops).toBeGreaterThan(0);
  });

  it('pads the baked canvas by CHROME_PAD on every side', () => {
    const created = [];
    const cache = new ChromeCache(makeFakeCanvasFactory(created));
    cache.get('chat_panel', 'panel', 260, 120, theme);
    expect(created[0].width).toBe(260 + CHROME_PAD * 2);
    expect(created[0].height).toBe(120 + CHROME_PAD * 2);
  });

  it('a new size is a new bake (resize-safe, never stretched)', () => {
    const created = [];
    const cache = new ChromeCache(makeFakeCanvasFactory(created));
    cache.get('chat_panel', 'panel', 260, 120, theme);
    cache.get('chat_panel', 'panel', 300, 140, theme);
    expect(created.length).toBe(2);
  });

  it('invalidateNode evicts only that node id', () => {
    const created = [];
    const cache = new ChromeCache(makeFakeCanvasFactory(created));
    cache.get('chat_panel', 'panel', 260, 120, theme);
    cache.get('quest_tracker', 'tracker', 200, 220, theme);
    cache.invalidateNode('chat_panel');
    cache.get('quest_tracker', 'tracker', 200, 220, theme); // still cached
    expect(created.length).toBe(2);
    cache.get('chat_panel', 'panel', 260, 120, theme); // re-baked
    expect(created.length).toBe(3);
  });

  it('disc variant bakes (minimap route)', () => {
    const created = [];
    const cache = new ChromeCache(makeFakeCanvasFactory(created));
    cache.get('minimap_orb', 'disc', 120, 120, theme);
    expect(created[0].ctx.ops).toBeGreaterThan(0);
  });

  it('paintCells honors offsets', () => {
    const calls = [];
    const ctx = { fillStyle: null, fillRect: (...a) => calls.push(a) };
    paintCells(ctx, [{ x: -2, y: 3, partId: 'shadow', color: '#000' }], 8, 8);
    expect(calls[0]).toEqual([6, 11, 1, 1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && npx vitest run tests/chrome-cache.test.js`
Expected: FAIL — cannot resolve `chromeCache.js`.

- [ ] **Step 3: Write the implementation**

```js
// Scholomance OS/client/pixelbrain-ui/renderers/chromeCache.js
// Bakes deterministic lattice chrome to offscreen canvases so the per-frame
// cost of a panel is one drawImage blit (PDR §15: HUD under 2 ms).

import { generatePanelChrome, generateDiscChrome, CHROME_PAD } from '../core/latticeChrome.js';

export function paintCells(ctx, cells, offsetX = 0, offsetY = 0) {
  for (const cell of cells) {
    ctx.fillStyle = cell.color;
    ctx.fillRect(offsetX + cell.x, offsetY + cell.y, 1, 1);
  }
}

function defaultCreateCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

export class ChromeCache {
  constructor(createCanvas = defaultCreateCanvas) {
    this.createCanvas = createCanvas;
    this.baked = new Map(); // key -> canvas
  }

  key(id, variant, w, h, themeId) {
    return `${variant}|${id}|${w}x${h}|${themeId}`;
  }

  get(id, variant, w, h, theme) {
    const k = this.key(id, variant, w, h, theme.id);
    let canvas = this.baked.get(k);
    if (!canvas) {
      const cells = variant === 'disc'
        ? generateDiscChrome({ id, size: w, theme })
        : generatePanelChrome({ id, w, h, theme, variant });
      canvas = this.createCanvas(w + CHROME_PAD * 2, h + CHROME_PAD * 2);
      paintCells(canvas.getContext('2d'), cells, CHROME_PAD, CHROME_PAD);
      this.baked.set(k, canvas);
    }
    return canvas;
  }

  invalidateNode(id) {
    for (const k of [...this.baked.keys()]) {
      if (k.split('|')[1] === id) this.baked.delete(k);
    }
  }

  clear() {
    this.baked.clear();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && npx vitest run tests/chrome-cache.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS"
git add client/pixelbrain-ui/renderers/chromeCache.js tests/chrome-cache.test.js
git commit -m "feat(hud): offscreen chrome baking cache keyed by panel, size, and theme"
```

---

### Task 5: Painter registry + compositor dispatch in canvasRenderer

**Files:**
- Create: `Scholomance OS/client/pixelbrain-ui/panels/index.js`
- Create: `Scholomance OS/tests/helpers/fakeCtx.js`
- Modify: `Scholomance OS/client/pixelbrain-ui/renderers/canvasRenderer.js`
- Test: `Scholomance OS/tests/panel-painters.test.js`

**Interfaces:**
- Consumes: `ChromeCache`, `CHROME_PAD` (Tasks 3–4).
- Produces:
  - `panels/index.js` exports `PANEL_PAINTERS` (id → painter), `TYPE_PAINTERS` (type → painter), `CHROME_VARIANTS` (id → variant string; default `'panel'`). All start EMPTY except `CHROME_VARIANTS = { minimap_orb: 'disc', quest_tracker: 'tracker', combat_hotbar: 'hotbar' }`; Tasks 6–9 register painters.
  - `canvasRenderer` gains `this.chromeCache = new ChromeCache()` and `this.helpers = { chromeCache, drawHudAsset, drawPixelPanel, scdlItems }`.
  - In `renderNode`, for `picture_book_mud`: panels blit baked chrome instead of `drawPixelPanel`; painter dispatch runs `PANEL_PAINTERS[node.id] ?? TYPE_PAINTERS[node.type]` before falling back to the legacy switch.
  - `tests/helpers/fakeCtx.js` exports `makeFakeCtx(log?)` — a recording Canvas2D stub (`measureText` returns `{ width: 0 }`).
- Note for the implementer: `canvasRenderer.js` cannot be imported by vitest (browser-absolute SCDL import) — the test covers `panels/index.js` and `fakeCtx` only; renderer changes are verified by the app still booting (Step 6) and by the existing suite.

- [ ] **Step 1: Write the failing test**

```js
// Scholomance OS/tests/panel-painters.test.js
import { describe, it, expect } from 'vitest';
import { PANEL_PAINTERS, TYPE_PAINTERS, CHROME_VARIANTS } from '../client/pixelbrain-ui/panels/index.js';
import { makeFakeCtx } from './helpers/fakeCtx.js';

describe('panel painter registry', () => {
  it('exposes registry objects', () => {
    expect(PANEL_PAINTERS).toBeTypeOf('object');
    expect(TYPE_PAINTERS).toBeTypeOf('object');
  });

  it('maps chrome variants for special panels', () => {
    expect(CHROME_VARIANTS.minimap_orb).toBe('disc');
    expect(CHROME_VARIANTS.quest_tracker).toBe('tracker');
    expect(CHROME_VARIANTS.combat_hotbar).toBe('hotbar');
  });

  it('every registered painter is a function', () => {
    [...Object.values(PANEL_PAINTERS), ...Object.values(TYPE_PAINTERS)].forEach((p) => {
      expect(p).toBeTypeOf('function');
    });
  });
});

describe('makeFakeCtx', () => {
  it('records calls and survives arbitrary canvas API usage', () => {
    const ctx = makeFakeCtx();
    ctx.fillStyle = '#fff';
    ctx.save();
    ctx.fillRect(0, 0, 4, 4);
    ctx.beginPath();
    ctx.arc(1, 1, 2, 0, Math.PI);
    ctx.restore();
    expect(ctx.calls.some(([name]) => name === 'fillRect')).toBe(true);
    expect(ctx.measureText('abc')).toEqual({ width: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && npx vitest run tests/panel-painters.test.js`
Expected: FAIL — cannot resolve `panels/index.js`.

- [ ] **Step 3: Write the registry and fake ctx**

```js
// Scholomance OS/client/pixelbrain-ui/panels/index.js
// Painter registry for the PixelBrain compositor.
// Tasks 6-9 register per-panel painters here; unregistered nodes fall back to
// the legacy renderers inside canvasRenderer.js until they are migrated.

export const PANEL_PAINTERS = {};

export const TYPE_PAINTERS = {};

// Chrome variant per panel id (default 'panel'); see latticeChrome.js.
export const CHROME_VARIANTS = {
  minimap_orb: 'disc',
  quest_tracker: 'tracker',
  combat_hotbar: 'hotbar',
};
```

```js
// Scholomance OS/tests/helpers/fakeCtx.js
// Recording Canvas2D stub for painter tests (vitest runs without a DOM).

export function makeFakeCtx(log = []) {
  return new Proxy({}, {
    get(target, prop) {
      if (prop === 'calls') return log;
      if (prop === 'measureText') return (text) => { log.push(['measureText', [text]]); return { width: 0 }; };
      return (...args) => { log.push([prop, args]); };
    },
    set(target, prop, value) {
      log.push(['set:' + String(prop), [value]]);
      return true;
    },
  });
}
```

- [ ] **Step 4: Wire the compositor into canvasRenderer.js**

In `Scholomance OS/client/pixelbrain-ui/renderers/canvasRenderer.js`:

Add imports at the top:

```js
import { ChromeCache } from './chromeCache.js';
import { CHROME_PAD } from '../core/latticeChrome.js';
import { PANEL_PAINTERS, TYPE_PAINTERS, CHROME_VARIANTS } from '../panels/index.js';
```

In the constructor, after `this.scdlItems = new Map();` add:

```js
    this.chromeCache = new ChromeCache();
    this.helpers = {
      chromeCache: this.chromeCache,
      drawHudAsset: this.drawHudAsset.bind(this),
      drawPixelPanel: this.drawPixelPanel.bind(this),
      scdlItems: this.scdlItems,
    };
```

Replace the panel-background block in `renderNode` (the block starting `this.ctx.globalAlpha = node.ambientAlpha ?? 0.92;` down to the end of the `else if (node.type === 'panel')` branch) with:

```js
    this.ctx.globalAlpha = node.ambientAlpha ?? 0.92;
    if (theme.id === 'picture_book_mud' && (node.type === 'panel' || node.id === 'combat_hotbar')) {
      const variant = CHROME_VARIANTS[node.id] ?? 'panel';
      const bw = Math.max(1, Math.round(w));
      const bh = Math.max(1, Math.round(h));
      const baked = this.chromeCache.get(node.id, variant, bw, bh, theme);
      this.ctx.drawImage(baked, Math.round(x) - CHROME_PAD, Math.round(y) - CHROME_PAD);
    } else if (node.id === 'combat_hotbar') {
      this.drawHudAsset('hotbar', x, y, w, h) || this.drawPixelPanel(x, y, w, h, theme);
    } else if (node.type === 'panel') {
      this.drawPixelPanel(x, y, w, h, theme, {
        fill: node.id === 'boss_alerts' ? 'rgba(80, 8, 18, 0.86)' : theme.palette.background,
        weight: node.id === 'boss_alerts' ? 2 : 1
      });
    }
```

Replace the `// ── NODE-SPECIFIC CUSTOM RENDERERS` switch with painter dispatch that falls back to the legacy methods:

```js
    const rect = { x, y, w, h };
    const painter = PANEL_PAINTERS[node.id] ?? TYPE_PAINTERS[node.type];
    if (painter) {
      painter(this.ctx, node, rect, theme, currentTick, gameState, this.helpers);
    } else {
      switch (node.type) {
        case 'bar':
          this.renderBar(node, x, y, w, h, theme);
          break;
        case 'slot':
          this.renderSlot(node, x, y, w, h, theme, currentTick);
          break;
        case 'text':
          this.renderTextNode(node, x, y, w, h, theme);
          break;
        default:
          if (node.id === 'player_frame') this.renderPlayerStats(node, x, y, w, h, theme, gameState);
          if (node.id === 'target_frame') this.renderTargetStats(node, x, y, w, h, theme, gameState);
          if (node.id === 'minimap_orb') this.renderMinimapRadar(node, x, y, w, h, theme, gameState, currentTick);
          if (node.id === 'chat_panel') this.renderChatBox(node, x, y, w, h, theme, gameState);
          if (node.id === 'spell_writing_panel') this.renderSpellInput(node, x, y, w, h, theme);
          if (node.id === 'boss_alerts') this.renderBossAlert(node, x, y, w, h, theme, currentTick);
          if (node.id === 'skill_tree_panel') this.renderSkillTree(node, x, y, w, h, theme, currentTick);
          if (node.id === 'inventory_panel') this.renderInventory(node, x, y, w, h, theme, gameState);
          if (node.id === 'limb_targeting_panel') this.renderLimbTargeting(node, x, y, w, h, theme, gameState);
          break;
      }
    }
```

Note: `renderMinimapRadar`'s picture_book_mud branch previously drew its own disc; the disc chrome now comes from the blit, but the legacy method still runs for content (letters, dots). Delete ONLY its disc-background drawing lines (the first `arc`/`fill`/`stroke` group and inner ring) inside the `picture_book_mud` branch, keeping cardinal letters, player X, and party dots. Minimap content gets fully rewritten in Task 8.

- [ ] **Step 5: Run the tests**

Run: `cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && npx vitest run tests/panel-painters.test.js && npm test`
Expected: new tests PASS; full suite green.

- [ ] **Step 6: Visual smoke check**

Run: `cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && CLIENTS=0 npm run dev` (background), then open `http://localhost:8085` in a browser (or take a quick Playwright screenshot from the mother repo root).
Expected: HUD renders with parchment-stack chrome (shadow, board edge peeking through torn edges, grain, ink border). No console errors. Stop the server afterwards.

- [ ] **Step 7: Commit**

```bash
cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS"
git add client/pixelbrain-ui/panels/index.js client/pixelbrain-ui/renderers/canvasRenderer.js tests/helpers/fakeCtx.js tests/panel-painters.test.js
git commit -m "feat(hud): compositor dispatch — baked lattice chrome blit + painter registry"
```

---

### Task 6: Player frame, target frame, and inked gauge bars

**Files:**
- Create: `Scholomance OS/client/pixelbrain-ui/panels/bar.js`
- Create: `Scholomance OS/client/pixelbrain-ui/panels/playerFrame.js`
- Create: `Scholomance OS/client/pixelbrain-ui/panels/targetFrame.js`
- Modify: `Scholomance OS/client/pixelbrain-ui/panels/index.js`
- Modify: `Scholomance OS/client/pixelbrain-ui/presets/defaultLayout.js` (player/target frame geometry)
- Modify: `Scholomance OS/client/pixelbrain-ui/renderers/canvasRenderer.js` (delete `renderBar`, `renderPlayerStats`, `renderTargetStats` and their legacy dispatch lines)
- Test: `Scholomance OS/tests/panel-painters.test.js` (extend)

**Interfaces:**
- Consumes: registry (Task 5), painter signature from Global Constraints.
- Produces: `paintBar`, `paintPlayerFrame`, `paintTargetFrame` registered as `TYPE_PAINTERS.bar`, `PANEL_PAINTERS.player_frame`, `PANEL_PAINTERS.target_frame`. Bindings still write `node.props.value` on bars; `animationEngine` still writes `node.cooldownProgress` on slots — do not rename these.

- [ ] **Step 1: Add failing painter tests**

Append to `Scholomance OS/tests/panel-painters.test.js`:

```js
import { THEMES } from '../client/pixelbrain-ui/core/themeRegistry.js';
import { paintBar } from '../client/pixelbrain-ui/panels/bar.js';
import { paintPlayerFrame } from '../client/pixelbrain-ui/panels/playerFrame.js';
import { paintTargetFrame } from '../client/pixelbrain-ui/panels/targetFrame.js';

const theme = THEMES.pictureBookMUD;
const rect = { x: 20, y: 20, w: 292, h: 84 };
const gameState = {
  player: { stats: { health: { current: 500, max: 2000 }, mana: { current: 10, max: 100 } } },
  target: { name: 'INK SLIME', level: 12 },
};

function paintTwice(painter, node, tick = 120) {
  const a = [];
  const b = [];
  painter(makeFakeCtx(a), node, rect, theme, tick, gameState, {});
  painter(makeFakeCtx(b), node, rect, theme, tick, gameState, {});
  return [a, b];
}

describe('frame painters', () => {
  it('paintBar is deterministic per tick and draws hatch strokes', () => {
    const node = { id: 'player_health_bar', type: 'bar', props: { value: 0.6, colorKey: 'health' } };
    const [a, b] = paintTwice(paintBar, node);
    expect(a).toEqual(b);
    expect(a.filter(([n]) => n === 'stroke').length).toBeGreaterThan(4);
  });

  it('paintBar clamps out-of-range values without throwing', () => {
    const node = { id: 'x', type: 'bar', props: { value: 7, colorKey: 'mana' } };
    expect(() => paintBar(makeFakeCtx(), node, rect, theme, 0, gameState, {})).not.toThrow();
  });

  it('paintPlayerFrame renders name, seal, and low-health cracks deterministically', () => {
    const node = { id: 'player_frame', type: 'panel', props: { title: 'VALERIUS', level: 60 } };
    const [a, b] = paintTwice(paintPlayerFrame, node);
    expect(a).toEqual(b);
    const texts = a.filter(([n]) => n === 'fillText').map(([, args]) => args[0]);
    expect(texts).toContain('VALERIUS');
    expect(texts).toContain('60');
  });

  it('paintTargetFrame shows target name and level badge', () => {
    const node = { id: 'target_frame', type: 'panel', props: { title: 'X', level: 1 } };
    const log = [];
    paintTargetFrame(makeFakeCtx(log), node, rect, theme, 0, gameState, {});
    const texts = log.filter(([n]) => n === 'fillText').map(([, args]) => args[0]);
    expect(texts).toContain('INK SLIME');
    expect(texts).toContain('12');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && npx vitest run tests/panel-painters.test.js`
Expected: FAIL — cannot resolve `panels/bar.js`.

- [ ] **Step 3: Write the bar painter**

```js
// Scholomance OS/client/pixelbrain-ui/panels/bar.js
// Inked gauge: carved parchment groove, crosshatch ink fill, meniscus edge,
// quarter rune ticks, ink-splatter cracks at low health.

export function paintBar(ctx, node, rect, theme, tick) {
  const { x, y, w, h } = rect;
  const val = Math.max(0, Math.min(1, node.props?.value ?? 1));
  const colorKey = node.props?.colorKey ?? 'health';
  const ink = theme.palette[colorKey] ?? theme.palette.rim;

  // Carved groove: recessed paper + inner shadow lip (top/left)
  ctx.fillStyle = '#d6c69f';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(92, 69, 56, 0.25)';
  ctx.fillRect(x, y, w, 2);
  ctx.fillRect(x, y, 2, h);
  ctx.strokeStyle = theme.palette.rim;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // Quarter rune ticks
  ctx.strokeStyle = 'rgba(92, 69, 56, 0.4)';
  ctx.lineWidth = 1;
  for (let q = 1; q < 4; q += 1) {
    const tx = x + (w * q) / 4;
    ctx.beginPath();
    ctx.moveTo(tx, y + 2);
    ctx.lineTo(tx, y + h - 2);
    ctx.stroke();
  }

  // Crosshatch ink fill
  const fillW = Math.round((w - 4) * val);
  if (fillW > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 2, y + 2, fillW, h - 4);
    ctx.clip();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.5;
    for (let o = -h; o < fillW + h; o += 4) {
      ctx.beginPath();
      ctx.moveTo(x + 2 + o, y);
      ctx.lineTo(x + 2 + o + h, y + h);
      ctx.stroke();
    }
    // second hatch direction when above half: reads as "denser ink"
    if (val > 0.5) {
      for (let o = 0; o < fillW + h; o += 6) {
        ctx.beginPath();
        ctx.moveTo(x + 2 + o, y + h);
        ctx.lineTo(x + 2 + o + h, y);
        ctx.stroke();
      }
    }
    ctx.restore();
    // Ink meniscus leading edge
    ctx.fillStyle = ink;
    ctx.fillRect(x + 2 + Math.max(0, fillW - 2), y + 2, 2, h - 4);
  }

  // Low-health ink-splatter cracks, tick-pulsed
  if (colorKey === 'health' && val < 0.3) {
    const pulse = 0.5 + 0.5 * Math.sin(tick * 0.08);
    ctx.strokeStyle = `rgba(171, 43, 43, ${(0.35 + 0.4 * pulse).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.55, y);
    ctx.lineTo(x + w * 0.6, y + h * 0.6);
    ctx.lineTo(x + w * 0.53, y + h);
    ctx.moveTo(x + w * 0.8, y + h);
    ctx.lineTo(x + w * 0.75, y + h * 0.4);
    ctx.stroke();
  }
}
```

- [ ] **Step 4: Write the frame painters**

```js
// Scholomance OS/client/pixelbrain-ui/panels/playerFrame.js
// Player nameplate: portrait plaque with illuminated capital, serif name,
// wax level seal, low-health damage cracks. Bars are child nodes → bar.js.

export function paintPlayerFrame(ctx, node, rect, theme, tick, gameState) {
  const { x, y } = rect;
  const name = node.props?.title ?? 'VALERIUS';
  const level = node.props?.level ?? 60;
  const hp = gameState?.player?.stats?.health;
  const hpRatio = hp ? hp.current / hp.max : 1;

  // Portrait plaque: double ink frame on a lighter parchment inset
  ctx.fillStyle = '#e4d4ae';
  ctx.fillRect(x + 16, y + 16, 52, 52);
  ctx.strokeStyle = theme.palette.rim;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 16.5, y + 16.5, 51, 51);
  ctx.strokeStyle = 'rgba(92, 69, 56, 0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 20.5, y + 20.5, 43, 43);

  // Illuminated capital as the portrait glyph
  ctx.fillStyle = theme.palette.danger;
  ctx.font = `bold 30px ${theme.typography.titleFont}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.charAt(0), x + 42, y + 44);
  ctx.strokeStyle = theme.palette.rim;
  ctx.lineWidth = 0.5;
  ctx.strokeText(name.charAt(0), x + 42, y + 44);

  // Name in title serif
  ctx.fillStyle = theme.palette.textPrimary;
  ctx.font = `bold 13px ${theme.typography.titleFont}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(name, x + 78, y + 26);

  // Wax level seal overlapping the plaque corner
  const sx = x + 64;
  const sy = y + 66;
  ctx.fillStyle = '#8c2f2f';
  ctx.beginPath();
  ctx.arc(sx, sy, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#5e1f1f';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(sx, sy, 6.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#f0e3c0';
  ctx.font = `bold 8px ${theme.typography.numberFont}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(level), sx, sy);

  // Low-health damage cracks across the plaque, tick-pulsed
  if (hpRatio < 0.3) {
    const pulse = 0.5 + 0.5 * Math.sin(tick * 0.08);
    ctx.strokeStyle = `rgba(171, 43, 43, ${(0.3 + 0.45 * pulse).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 22, y + 18);
    ctx.lineTo(x + 32, y + 34);
    ctx.lineTo(x + 27, y + 50);
    ctx.moveTo(x + 58, y + 22);
    ctx.lineTo(x + 48, y + 38);
    ctx.stroke();
  }
}
```

```js
// Scholomance OS/client/pixelbrain-ui/panels/targetFrame.js
// Enemy nameplate: serif name, inked diamond level badge, hostility tag.

export function paintTargetFrame(ctx, node, rect, theme, tick, gameState) {
  const { x, y, w, h } = rect;
  const name = gameState?.target?.name ?? node.props?.title ?? 'TARGET';
  const level = gameState?.target?.level ?? node.props?.level ?? '?';

  ctx.fillStyle = theme.palette.textPrimary;
  ctx.font = `bold 13px ${theme.typography.titleFont}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(name, x + 16, y + 26);

  // Level in an inked diamond badge at the right edge
  const bx = x + w - 26;
  const by = y + 22;
  ctx.strokeStyle = theme.palette.danger;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(bx, by - 11);
  ctx.lineTo(bx + 11, by);
  ctx.lineTo(bx, by + 11);
  ctx.lineTo(bx - 11, by);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = theme.palette.danger;
  ctx.font = `bold 9px ${theme.typography.numberFont}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(level), bx, by);

  // Hostility tag in sepia beneath the bars
  ctx.fillStyle = theme.palette.textSecondary;
  ctx.font = `8px ${theme.typography.bodyFont}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('HOSTILE — INK-BOUND', x + 16, y + h - 6);
}
```

Register in `Scholomance OS/client/pixelbrain-ui/panels/index.js` — **keep the `CHROME_VARIANTS` export from Task 5 unchanged**, only fill the painter objects:

```js
import { paintBar } from './bar.js';
import { paintPlayerFrame } from './playerFrame.js';
import { paintTargetFrame } from './targetFrame.js';

export const PANEL_PAINTERS = {
  player_frame: paintPlayerFrame,
  target_frame: paintTargetFrame,
};

export const TYPE_PAINTERS = {
  bar: paintBar,
};

// CHROME_VARIANTS stays exactly as defined in Task 5.
```

- [ ] **Step 5: Update frame geometry in defaultLayout.js**

Replace the `player_frame` and `target_frame` roots (keep their ids and child ids exactly — bindings and tests reference them):

```js
    // 1. Player HUD Frame
    {
      id: 'player_frame',
      type: 'panel',
      anchor: 'top_left',
      position: { x: 20, y: 20 },
      size: { w: 292, h: 84 },
      locked: false,
      visible: true,
      props: { title: 'VALERIUS', level: 60 },
      children: [
        {
          id: 'player_health_bar',
          type: 'bar',
          anchor: 'top_left',
          position: { x: 78, y: 34 },
          size: { w: 196, h: 16 },
          props: { value: 1.0, colorKey: 'health' }
        },
        {
          id: 'player_mana_bar',
          type: 'bar',
          anchor: 'top_left',
          position: { x: 78, y: 56 },
          size: { w: 196, h: 10 },
          props: { value: 1.0, colorKey: 'mana' }
        }
      ]
    },

    // 2. Target HUD Frame
    {
      id: 'target_frame',
      type: 'panel',
      anchor: 'top',
      position: { x: -146, y: 20 },
      size: { w: 292, h: 84 },
      locked: false,
      visible: true,
      props: { title: 'VOID ABERRATION', level: 62 },
      children: [
        {
          id: 'target_health_bar',
          type: 'bar',
          anchor: 'top_left',
          position: { x: 16, y: 34 },
          size: { w: 232, h: 16 },
          props: { value: 1.0, colorKey: 'health' }
        },
        {
          id: 'target_cast_bar',
          type: 'bar',
          anchor: 'top_left',
          position: { x: 16, y: 56 },
          size: { w: 232, h: 8 },
          props: { value: 0.0, colorKey: 'energy' }
        }
      ]
    },
```

Also update `limb_targeting_panel.position` to `{ x: -146, y: 112 }` so it stays under the taller target frame.

- [ ] **Step 6: Delete the legacy methods**

In `canvasRenderer.js` delete `renderBar`, `renderPlayerStats`, `renderTargetStats` entirely, and delete their fallback dispatch lines (`case 'bar':` block, `if (node.id === 'player_frame')`, `if (node.id === 'target_frame')`) from the legacy switch.

- [ ] **Step 7: Run tests + visual check + commit**

Run: `cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && npm test`
Expected: full suite PASS.
Visual: relaunch `CLIENTS=0 npm run dev`, confirm plaque/seal/gauges on both frames.

```bash
cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS"
git add client/pixelbrain-ui/panels/ client/pixelbrain-ui/presets/defaultLayout.js client/pixelbrain-ui/renderers/canvasRenderer.js tests/panel-painters.test.js
git commit -m "feat(hud): full-fidelity player/target frames and inked gauge bars"
```

---

### Task 7: Hotbar, slots, and spell input

**Files:**
- Create: `Scholomance OS/client/pixelbrain-ui/panels/hotbar.js`
- Modify: `Scholomance OS/client/pixelbrain-ui/panels/index.js`
- Modify: `Scholomance OS/client/pixelbrain-ui/presets/defaultLayout.js` (hotbar geometry)
- Modify: `Scholomance OS/client/pixelbrain-ui/renderers/canvasRenderer.js` (delete `renderSlot`, `renderSpellInput` + dispatch lines)
- Test: `Scholomance OS/tests/panel-painters.test.js` (extend)

**Interfaces:**
- Consumes: registry (Task 5), `helpers.chromeCache` / `helpers.scdlItems` / `helpers.drawPixelPanel`, `CHROME_PAD` (Task 3).
- Produces: `paintSlot` (`TYPE_PAINTERS.slot`), `paintSpellInput` (`PANEL_PAINTERS.spell_writing_panel`). Slots keep reading `node.cooldownProgress` (written by animationEngine) and `node.props.item` / `node.props.keybind` / `node.props.name`.

- [ ] **Step 1: Add failing tests**

Append to `tests/panel-painters.test.js`:

```js
import { paintSlot, paintSpellInput } from '../client/pixelbrain-ui/panels/hotbar.js';

describe('hotbar painters', () => {
  const slotRect = { x: 100, y: 500, w: 48, h: 48 };

  it('paintSlot draws keybind tab and ability glyph without chrome helpers', () => {
    const node = { id: 'slot_1', type: 'slot', props: { keybind: '1', name: 'IGN' } };
    const log = [];
    paintSlot(makeFakeCtx(log), node, slotRect, theme, 0, gameState, {});
    const texts = log.filter(([n]) => n === 'fillText').map(([, a]) => a[0]);
    expect(texts).toContain('1');
    expect(texts).toContain('IGN');
  });

  it('paintSlot cooldown shows ink-burn wipe and seconds', () => {
    const node = { id: 'slot_2', type: 'slot', props: { keybind: '2', name: 'GLA' }, cooldownProgress: 0.5 };
    const log = [];
    paintSlot(makeFakeCtx(log), node, slotRect, theme, 10, gameState, {});
    expect(log.some(([n]) => n === 'arc')).toBe(true);
    const texts = log.filter(([n]) => n === 'fillText').map(([, a]) => a[0]);
    expect(texts.some((t) => /s$/.test(String(t)))).toBe(true);
  });

  it('paintSpellInput renders placeholder deterministically', () => {
    const node = { id: 'spell_writing_panel', type: 'panel', props: { placeholder: 'TYPE RUNIC FORMULA...' } };
    const a = [];
    const b = [];
    paintSpellInput(makeFakeCtx(a), node, { x: 0, y: 0, w: 340, h: 36 }, theme, 42, gameState, {});
    paintSpellInput(makeFakeCtx(b), node, { x: 0, y: 0, w: 340, h: 36 }, theme, 42, gameState, {});
    expect(a).toEqual(b);
    expect(a.filter(([n]) => n === 'fillText').map(([, x]) => x[0])).toContain('TYPE RUNIC FORMULA...');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && npx vitest run tests/panel-painters.test.js`
Expected: FAIL — cannot resolve `panels/hotbar.js`.

- [ ] **Step 3: Write the implementation**

```js
// Scholomance OS/client/pixelbrain-ui/panels/hotbar.js
// Hotbar slots as stitched parchment sockets: slot chrome via ChromeCache,
// SCDL item art, ink-burn cooldown wipe, parchment keybind tab.

import { CHROME_PAD } from '../core/latticeChrome.js';

export function paintSlot(ctx, node, rect, theme, tick, gameState, helpers) {
  const { x, y, w, h } = rect;

  // Socket chrome (stitched sheet) — baked per slot id/size
  if (theme.id === 'picture_book_mud' && helpers?.chromeCache) {
    const baked = helpers.chromeCache.get(node.id, 'slot', Math.round(w), Math.round(h), theme);
    ctx.drawImage(baked, Math.round(x) - CHROME_PAD, Math.round(y) - CHROME_PAD);
  } else if (helpers?.drawHudAsset && helpers.drawHudAsset('slot', x, y, w, h)) {
    // legacy asset path for non-storybook themes
  } else if (helpers?.drawPixelPanel) {
    helpers.drawPixelPanel(x, y, w, h, theme, { fill: theme.palette.panelDeep || '#05060d', weight: 1 });
  }

  // SCDL item art (compiled lattice packet), else ability glyph label
  const cd = node.cooldownProgress ?? 0;
  const packet = node.props?.item ? helpers?.scdlItems?.get(node.props.item) : null;
  if (packet && packet.geometry?.coordinates) {
    const cw = packet.canvas?.width || 64;
    const chp = packet.canvas?.height || 64;
    const pad = 6;
    const scaleX = (w - pad * 2) / cw;
    const scaleY = (h - pad * 2) / chp;
    ctx.save();
    packet.geometry.coordinates.forEach((c) => {
      ctx.fillStyle = c.color;
      ctx.fillRect(x + pad + c.x * scaleX, y + pad + c.y * scaleY, Math.max(1, scaleX), Math.max(1, scaleY));
    });
    ctx.restore();
  } else if (cd === 0 && node.props?.name) {
    ctx.fillStyle = theme.palette.textPrimary;
    ctx.font = `bold 10px ${theme.typography.titleFont}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.props.name, x + w / 2, y + h / 2 + 2);
  }

  // Ink-burn cooldown: charring radial wipe + ember leading edge + seconds
  if (cd > 0) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.fillStyle = 'rgba(34, 25, 21, 0.45)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, w * 0.72, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cd, false);
    ctx.closePath();
    ctx.fill();
    const a = -Math.PI / 2 + Math.PI * 2 * cd;
    ctx.strokeStyle = '#7a4a1f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * w * 0.6, cy + Math.sin(a) * w * 0.6);
    ctx.stroke();
    ctx.fillStyle = theme.palette.textPrimary;
    ctx.font = `bold 11px ${theme.typography.numberFont}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${(cd * 6).toFixed(1)}s`, cx, cy);
  }

  // Keybind: tiny parchment tab, top-left
  if (node.props?.keybind) {
    ctx.fillStyle = '#e4d4ae';
    ctx.fillRect(x + 3, y + 3, 11, 11);
    ctx.strokeStyle = theme.palette.rim;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 3.5, y + 3.5, 10, 10);
    ctx.fillStyle = theme.palette.textPrimary;
    ctx.font = `bold 7px ${theme.typography.numberFont}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.props.keybind, x + 8.5, y + 9);
  }
}

// Writing strip: ruled ink line, sepia placeholder, tick-blinking quill caret.
export function paintSpellInput(ctx, node, rect, theme, tick) {
  const { x, y, w, h } = rect;
  const val = (typeof document !== 'undefined' && document.getElementById('rune-input')?.value) || '';

  ctx.strokeStyle = 'rgba(92, 69, 56, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 10, y + h - 9);
  ctx.lineTo(x + w - 10, y + h - 9);
  ctx.stroke();

  const text = val || node.props?.placeholder || 'TYPE RUNIC FORMULA...';
  ctx.fillStyle = val ? theme.palette.textPrimary : theme.palette.textSecondary;
  ctx.font = `11px ${theme.typography.numberFont}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 12, y + h / 2);

  if (val && Math.floor(tick / 30) % 2 === 0) {
    const tw = ctx.measureText(text).width;
    ctx.fillRect(x + 14 + tw, y + 6, 1.5, h - 14);
  }
}
```

Register in `panels/index.js` (add to the existing imports/objects):

```js
import { paintSlot, paintSpellInput } from './hotbar.js';

// in PANEL_PAINTERS:
  spell_writing_panel: paintSpellInput,
// in TYPE_PAINTERS:
  slot: paintSlot,
```

- [ ] **Step 4: Update hotbar geometry in defaultLayout.js**

Replace the `combat_hotbar` root (48px slots, 56px pitch):

```js
    // 6. Action Hotbar
    {
      id: 'combat_hotbar',
      type: 'panel',
      anchor: 'bottom',
      position: { x: 0, y: 20 },
      size: { w: 360, h: 72 },
      locked: false,
      visible: true,
      children: [
        { id: 'slot_1', type: 'slot', anchor: 'top_left', position: { x: 16, y: 12 }, size: { w: 48, h: 48 }, props: { keybind: '1', name: 'IGN' } },
        { id: 'slot_2', type: 'slot', anchor: 'top_left', position: { x: 72, y: 12 }, size: { w: 48, h: 48 }, props: { keybind: '2', name: 'GLA' } },
        { id: 'slot_3', type: 'slot', anchor: 'top_left', position: { x: 128, y: 12 }, size: { w: 48, h: 48 }, props: { keybind: '3', name: 'SAN' } },
        { id: 'slot_4', type: 'slot', anchor: 'top_left', position: { x: 184, y: 12 }, size: { w: 48, h: 48 }, props: { keybind: '4', name: 'VOI' } },
        { id: 'slot_5', type: 'slot', anchor: 'top_left', position: { x: 240, y: 12 }, size: { w: 48, h: 48 }, props: { keybind: '5', name: 'FUL' } },
        { id: 'slot_6', type: 'slot', anchor: 'top_left', position: { x: 296, y: 12 }, size: { w: 48, h: 48 }, props: { keybind: '6', name: 'FRA' } }
      ]
    },
```

- [ ] **Step 5: Delete legacy methods**

In `canvasRenderer.js` delete `renderSlot` and `renderSpellInput`, plus their fallback dispatch lines (`case 'slot':` block and the `spell_writing_panel` line).

- [ ] **Step 6: Run tests + visual check + commit**

Run: `cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && npm test`
Expected: PASS. Visual: slots show stitched sockets; pressing `1`–`6` shows the ink-burn wipe.

```bash
cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS"
git add client/pixelbrain-ui/panels/ client/pixelbrain-ui/presets/defaultLayout.js client/pixelbrain-ui/renderers/canvasRenderer.js tests/panel-painters.test.js
git commit -m "feat(hud): stitched hotbar sockets, ink-burn cooldowns, quill spell input"
```

---

### Task 8: Minimap, quest tracker, and chat

**Files:**
- Create: `Scholomance OS/client/pixelbrain-ui/panels/minimap.js`
- Create: `Scholomance OS/client/pixelbrain-ui/panels/questTracker.js`
- Create: `Scholomance OS/client/pixelbrain-ui/panels/chat.js`
- Modify: `Scholomance OS/client/pixelbrain-ui/panels/index.js`
- Modify: `Scholomance OS/client/pixelbrain-ui/presets/defaultLayout.js` (quest item offsets)
- Modify: `Scholomance OS/client/pixelbrain-ui/renderers/canvasRenderer.js` (delete `renderMinimapRadar`, `renderChatBox`, `renderTextNode` + dispatch lines)
- Test: `Scholomance OS/tests/panel-painters.test.js` (extend)

**Interfaces:**
- Consumes: registry, painter signature. Disc chrome is blitted by the compositor (variant `'disc'`) — the minimap painter draws content only.
- Produces: `paintMinimap` (`PANEL_PAINTERS.minimap_orb`), `paintQuestTracker` (`PANEL_PAINTERS.quest_tracker`), `paintText` (`TYPE_PAINTERS.text` — handles quest objective entries with checkbox + progress thread), `paintChat` (`PANEL_PAINTERS.chat_panel`). Chat keeps `node.props.activeTab` (uiManager click logic depends on it).

- [ ] **Step 1: Add failing tests**

Append to `tests/panel-painters.test.js`:

```js
import { paintMinimap } from '../client/pixelbrain-ui/panels/minimap.js';
import { paintQuestTracker, paintText } from '../client/pixelbrain-ui/panels/questTracker.js';
import { paintChat } from '../client/pixelbrain-ui/panels/chat.js';

describe('minimap / quest / chat painters', () => {
  it('paintMinimap renders cardinals and party motes tick-deterministically', () => {
    const node = { id: 'minimap_orb', type: 'panel', props: { zoom: 1 } };
    const gs = { party: [{ hp: 1 }, { hp: 0.5 }] };
    const a = [];
    const b = [];
    paintMinimap(makeFakeCtx(a), node, { x: 0, y: 0, w: 120, h: 120 }, theme, 77, gs, {});
    paintMinimap(makeFakeCtx(b), node, { x: 0, y: 0, w: 120, h: 120 }, theme, 77, gs, {});
    expect(a).toEqual(b);
    const texts = a.filter(([n]) => n === 'fillText').map(([, x]) => x[0]);
    ['N', 'S', 'E', 'W'].forEach((c) => expect(texts).toContain(c));
  });

  it('paintText draws quest objectives with progress thread', () => {
    const node = { id: 'quest_item_1', type: 'text', props: { text: 'AETHER SHARDS: 4/10' } };
    const log = [];
    paintText(makeFakeCtx(log), node, { x: 10, y: 40, w: 180, h: 14 }, theme, 0, gameState, {});
    expect(log.filter(([n]) => n === 'fillText').map(([, x]) => x[0])).toContain('AETHER SHARDS: 4/10');
    expect(log.some(([n]) => n === 'strokeRect')).toBe(true); // checkbox rune
  });

  it('paintText marks completed objectives with a check', () => {
    const node = { id: 'quest_item_2', type: 'text', props: { text: 'DONE: 3/3' } };
    const log = [];
    paintText(makeFakeCtx(log), node, { x: 10, y: 60, w: 180, h: 14 }, theme, 0, gameState, {});
    expect(log.filter(([n]) => n === 'lineTo').length).toBeGreaterThan(1);
  });

  it('paintQuestTracker draws illuminated capital title', () => {
    const node = { id: 'quest_tracker', type: 'panel', props: { title: 'QUEST LOG' } };
    const log = [];
    paintQuestTracker(makeFakeCtx(log), node, { x: 0, y: 0, w: 200, h: 220 }, theme, 0, gameState, {});
    const texts = log.filter(([n]) => n === 'fillText').map(([, x]) => x[0]);
    expect(texts).toContain('Q');
    expect(texts).toContain('UEST LOG');
  });

  it('paintChat renders active tab messages with channel ink', () => {
    const node = { id: 'chat_panel', type: 'panel', props: { activeTab: 'COMBAT' } };
    const gs = { chatLogs: { COMBAT: ['Your IGNITE dealt 42 Fire damage.'] } };
    const log = [];
    paintChat(makeFakeCtx(log), node, { x: 20, y: 600, w: 260, h: 120 }, theme, 0, gs, {});
    const texts = log.filter(([n]) => n === 'fillText').map(([, x]) => x[0]);
    expect(texts.some((t) => String(t).includes('IGNITE'))).toBe(true);
    expect(texts).toContain('COMBAT');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && npx vitest run tests/panel-painters.test.js`
Expected: FAIL — cannot resolve `panels/minimap.js`.

- [ ] **Step 3: Write the implementations**

```js
// Scholomance OS/client/pixelbrain-ui/panels/minimap.js
// Arcane lens content: cardinal letters, inked player X, party motes,
// zone-name ribbon. The parchment disc + compass rose are baked chrome.

export function paintMinimap(ctx, node, rect, theme, tick, gameState) {
  const { x, y, w, h } = rect;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const radius = w / 2 - 10;

  ctx.fillStyle = theme.palette.textPrimary;
  ctx.font = `bold 10px ${theme.typography.titleFont}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', cx, cy - radius + 9);
  ctx.fillText('S', cx, cy + radius - 9);
  ctx.fillText('E', cx + radius - 9, cy);
  ctx.fillText('W', cx - radius + 9, cy);

  // Player: inked X marker
  ctx.strokeStyle = theme.palette.danger;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 3, cy - 3);
  ctx.lineTo(cx + 3, cy + 3);
  ctx.moveTo(cx + 3, cy - 3);
  ctx.lineTo(cx - 3, cy + 3);
  ctx.stroke();

  // Party motes drift deterministically with tick
  if (Array.isArray(gameState?.party)) {
    gameState.party.forEach((member, i) => {
      const angle = i * 1.2 + tick * 0.01;
      const px = cx + Math.cos(angle) * radius * 0.55;
      const py = cy + Math.sin(angle) * radius * 0.55;
      ctx.fillStyle = theme.palette.rimCool ?? theme.palette.success;
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Zone ribbon pinned under the lens
  ctx.fillStyle = '#e4d4ae';
  ctx.fillRect(cx - 44, y + h - 8, 88, 14);
  ctx.strokeStyle = theme.palette.rim;
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - 43.5, y + h - 7.5, 87, 13);
  ctx.fillStyle = theme.palette.textSecondary;
  ctx.font = `8px ${theme.typography.bodyFont}`;
  ctx.fillText('THE ATRIUM', cx, y + h - 1);
}
```

```js
// Scholomance OS/client/pixelbrain-ui/panels/questTracker.js
// Living codex: illuminated capital title, ink-drip divider; objective text
// nodes get a checkbox rune and a glowing progress thread.

export function paintQuestTracker(ctx, node, rect, theme) {
  const { x, y, w } = rect;
  const title = node.props?.title ?? 'QUEST LOG';

  ctx.fillStyle = theme.palette.danger;
  ctx.font = `bold 18px ${theme.typography.titleFont}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title.charAt(0), x + 12, y + 24);
  const capW = ctx.measureText(title.charAt(0)).width;

  ctx.fillStyle = theme.palette.textPrimary;
  ctx.font = `bold 11px ${theme.typography.titleFont}`;
  ctx.fillText(title.slice(1), x + 14 + capW, y + 24);

  // Ink-drip divider
  ctx.strokeStyle = theme.palette.rim;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 10, y + 30);
  ctx.lineTo(x + w - 12, y + 30);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + w - 12, y + 32, 1.5, 0, Math.PI * 2);
  ctx.stroke();
}

// Generic text painter; quest_item_* entries get objective treatment.
export function paintText(ctx, node, rect, theme) {
  const { x, y, w } = rect;
  const text = node.props?.text;
  if (!text) return;

  ctx.font = `10px ${theme.typography.numberFont}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  if (!node.id.startsWith('quest_item')) {
    ctx.fillStyle = theme.palette.textSecondary;
    ctx.fillText(text, x, y);
    return;
  }

  const m = text.match(/(\d+)\s*\/\s*(\d+)/);
  const done = m && Number(m[1]) >= Number(m[2]);

  // Checkbox rune
  ctx.strokeStyle = theme.palette.rim;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, 7, 7);
  if (done) {
    ctx.strokeStyle = theme.palette.success;
    ctx.beginPath();
    ctx.moveTo(x + 1, y + 4);
    ctx.lineTo(x + 3.5, y + 6.5);
    ctx.lineTo(x + 7, y + 1);
    ctx.stroke();
  }

  ctx.fillStyle = done ? theme.palette.success : theme.palette.textSecondary;
  ctx.fillText(text, x + 12, y);

  // Progress thread beneath the entry
  if (m) {
    const ratio = Math.min(1, Number(m[1]) / Math.max(1, Number(m[2])));
    ctx.strokeStyle = 'rgba(92, 69, 56, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 12, y + 13);
    ctx.lineTo(x + w - 4, y + 13);
    ctx.stroke();
    if (ratio > 0) {
      ctx.strokeStyle = theme.palette.energy;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 12, y + 13);
      ctx.lineTo(x + 12 + (w - 16) * ratio, y + 13);
      ctx.stroke();
    }
  }
}
```

```js
// Scholomance OS/client/pixelbrain-ui/panels/chat.js
// Spellbound message stream: parchment folder tabs (selected tab lifts),
// channel-inked message lines.

const CHANNEL_INK = { SAY: 'textPrimary', PARTY: 'mana', GUILD: 'success', COMBAT: 'danger' };
const TABS = ['SAY', 'PARTY', 'GUILD', 'COMBAT'];

export function paintChat(ctx, node, rect, theme, tick, gameState) {
  const { x, y, w } = rect;
  const active = node.props?.activeTab ?? 'SAY';
  const tabW = Math.floor((w - 16) / TABS.length);

  TABS.forEach((tab, i) => {
    const tx = x + 8 + i * tabW;
    const selected = tab === active;
    const ty = selected ? y - 6 : y - 2;
    const th = selected ? 20 : 16;
    ctx.fillStyle = selected ? '#f0e3c0' : '#dbccab';
    ctx.fillRect(tx, ty, tabW - 3, th);
    ctx.strokeStyle = theme.palette.rim;
    ctx.lineWidth = selected ? 1.5 : 1;
    ctx.strokeRect(tx + 0.5, ty + 0.5, tabW - 4, th - 1);
    ctx.fillStyle = selected ? theme.palette.textPrimary : theme.palette.textSecondary;
    ctx.font = `bold 8px ${theme.typography.titleFont}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tab, tx + (tabW - 3) / 2, ty + th / 2);
  });

  const lines = gameState?.chatLogs?.[active] ?? [];
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `9px ${theme.typography.numberFont}`;
  const ink = theme.palette[CHANNEL_INK[active]] ?? theme.palette.textSecondary;
  lines.slice(-5).forEach((line, idx) => {
    ctx.fillStyle = ink;
    ctx.fillText(`> ${String(line).toUpperCase()}`, x + 10, y + 24 + idx * 15);
  });
}
```

Register in `panels/index.js`:

```js
import { paintMinimap } from './minimap.js';
import { paintQuestTracker, paintText } from './questTracker.js';
import { paintChat } from './chat.js';

// in PANEL_PAINTERS:
  minimap_orb: paintMinimap,
  quest_tracker: paintQuestTracker,
  chat_panel: paintChat,
// in TYPE_PAINTERS:
  text: paintText,
```

- [ ] **Step 4: Nudge quest entries down in defaultLayout.js**

In the `quest_tracker` root, change `quest_item_1.position` to `{ x: 12, y: 42 }` and `quest_item_2.position` to `{ x: 12, y: 64 }` (clears the new title + divider).

- [ ] **Step 5: Delete legacy methods**

In `canvasRenderer.js` delete `renderMinimapRadar`, `renderChatBox`, `renderTextNode`, plus their fallback dispatch lines (`case 'text':` block, `minimap_orb` and `chat_panel` lines).

- [ ] **Step 6: Run tests + visual check + commit**

Run: `cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && npm test`
Expected: PASS. Visual: minimap lens with baked compass rose + ribbon; tracker with wax seal chrome + threads; chat folder tabs lift when clicked.

```bash
cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS"
git add client/pixelbrain-ui/panels/ client/pixelbrain-ui/presets/defaultLayout.js client/pixelbrain-ui/renderers/canvasRenderer.js tests/panel-painters.test.js
git commit -m "feat(hud): arcane lens minimap, living codex quest tracker, folder-tab chat"
```

---

### Task 9: Boss alerts, party frames, limb diorama

**Files:**
- Create: `Scholomance OS/client/pixelbrain-ui/panels/bossAlerts.js`
- Create: `Scholomance OS/client/pixelbrain-ui/panels/partyFrames.js`
- Create: `Scholomance OS/client/pixelbrain-ui/panels/limbDiorama.js`
- Modify: `Scholomance OS/client/pixelbrain-ui/panels/index.js`
- Modify: `Scholomance OS/client/pixelbrain-ui/renderers/canvasRenderer.js` (delete `renderBossAlert`, `renderLimbTargeting` + dispatch lines)
- Test: `Scholomance OS/tests/panel-painters.test.js` (extend)

**Interfaces:**
- Consumes: registry, painter signature.
- Produces: `paintBossAlert` (`PANEL_PAINTERS.boss_alerts`), `paintPartyFrames` + `paintPartyMember` (`PANEL_PAINTERS.party_frames`, `party_member_1..4`), `paintLimbDiorama` (`PANEL_PAINTERS.limb_targeting_panel`). Limb panel keeps `node.props.selectedLimb` (uiManager click zones depend on it). After this task the legacy switch in `canvasRenderer.js` handles ONLY `skill_tree_panel` and `inventory_panel` (content out of scope; they still get panel chrome).

- [ ] **Step 1: Add failing tests**

Append to `tests/panel-painters.test.js`:

```js
import { paintBossAlert } from '../client/pixelbrain-ui/panels/bossAlerts.js';
import { paintPartyMember } from '../client/pixelbrain-ui/panels/partyFrames.js';
import { paintLimbDiorama } from '../client/pixelbrain-ui/panels/limbDiorama.js';

describe('alert / party / diorama painters', () => {
  it('paintBossAlert shakes text and pulses sigil rings deterministically', () => {
    const node = { id: 'boss_alerts', type: 'panel', props: { text: 'SPREAD!', severity: 'danger' } };
    const a = [];
    const b = [];
    paintBossAlert(makeFakeCtx(a), node, { x: 0, y: 0, w: 340, h: 48 }, theme, 33, gameState, {});
    paintBossAlert(makeFakeCtx(b), node, { x: 0, y: 0, w: 340, h: 48 }, theme, 33, gameState, {});
    expect(a).toEqual(b);
    expect(a.filter(([n]) => n === 'arc').length).toBeGreaterThanOrEqual(2);
    expect(a.filter(([n]) => n === 'fillText').map(([, x]) => x[0])).toContain('SPREAD!');
  });

  it('paintPartyMember shows name, gauge, and WOUNDED tag when low', () => {
    const node = { id: 'party_member_4', type: 'panel', props: { name: 'Rogue', hp: 0.2 } };
    const log = [];
    paintPartyMember(makeFakeCtx(log), node, { x: 5, y: 145, w: 90, h: 40 }, theme, 0, gameState, {});
    const texts = log.filter(([n]) => n === 'fillText').map(([, x]) => x[0]);
    expect(texts).toContain('ROGUE');
    expect(texts).toContain('WOUNDED');
  });

  it('paintLimbDiorama highlights the selected limb crosshair', () => {
    const node = { id: 'limb_targeting_panel', type: 'panel', props: { selectedLimb: 'HEAD' } };
    const log = [];
    paintLimbDiorama(makeFakeCtx(log), node, { x: 0, y: 0, w: 292, h: 160 }, theme, 0, gameState, {});
    expect(log.some(([n]) => n === 'strokeRect')).toBe(true); // crosshair box
    const texts = log.filter(([n]) => n === 'fillText').map(([, x]) => x[0]);
    expect(texts).toContain('AIM: HEAD');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && npx vitest run tests/panel-painters.test.js`
Expected: FAIL — cannot resolve `panels/bossAlerts.js`.

- [ ] **Step 3: Write the implementations**

```js
// Scholomance OS/client/pixelbrain-ui/panels/bossAlerts.js
// Urgent sigil scrap: red ink wash over the parchment chrome, expanding
// sigil rings, shaking title — all keyed to tick.

export function paintBossAlert(ctx, node, rect, theme, tick) {
  const { x, y, w, h } = rect;
  const danger = node.props?.severity === 'danger';
  const shake = danger ? Math.sin(tick * 0.9) * 1.5 : 0;

  ctx.fillStyle = danger ? 'rgba(171, 43, 43, 0.18)' : 'rgba(181, 109, 40, 0.15)';
  ctx.fillRect(x + 4, y + 4, w - 8, h - 8);

  const phase = (tick % 60) / 60;
  ctx.strokeStyle = `rgba(171, 43, 43, ${(0.6 * (1 - phase)).toFixed(3)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + 20, y + h / 2, 6 + phase * 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + w - 20, y + h / 2, 6 + phase * 10, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = theme.palette.danger;
  ctx.font = `bold 12px ${theme.typography.titleFont}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(node.props?.text ?? 'ALERT', x + w / 2 + shake, y + h / 2);
}
```

```js
// Scholomance OS/client/pixelbrain-ui/panels/partyFrames.js
// Fellowship roster: container title + mini parchment cards with inked
// hp gauges and a WOUNDED stamp under 35%.

export function paintPartyFrames(ctx, node, rect, theme) {
  const { x, y } = rect;
  ctx.fillStyle = theme.palette.textPrimary;
  ctx.font = `bold 10px ${theme.typography.titleFont}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('FELLOWSHIP', x + 8, y + 8);
}

export function paintPartyMember(ctx, node, rect, theme) {
  const { x, y, w, h } = rect;
  const hp = Math.max(0, Math.min(1, node.props?.hp ?? 1));

  ctx.fillStyle = theme.palette.textPrimary;
  ctx.font = `bold 9px ${theme.typography.titleFont}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText((node.props?.name ?? '?').toUpperCase(), x + 8, y + 14);

  // Mini inked gauge
  const gx = x + 8;
  const gy = y + 19;
  const gw = w - 16;
  const gh = 8;
  ctx.fillStyle = '#d6c69f';
  ctx.fillRect(gx, gy, gw, gh);
  ctx.strokeStyle = theme.palette.rim;
  ctx.lineWidth = 1;
  ctx.strokeRect(gx + 0.5, gy + 0.5, gw - 1, gh - 1);
  if (hp > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(gx + 1, gy + 1, (gw - 2) * hp, gh - 2);
    ctx.clip();
    ctx.strokeStyle = theme.palette.health;
    for (let o = -gh; o < gw; o += 3) {
      ctx.beginPath();
      ctx.moveTo(gx + o, gy);
      ctx.lineTo(gx + o + gh, gy + gh);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (hp < 0.35) {
    ctx.fillStyle = theme.palette.danger;
    ctx.font = `7px ${theme.typography.numberFont}`;
    ctx.fillText('WOUNDED', x + 8, y + h - 4);
  }
}
```

```js
// Scholomance OS/client/pixelbrain-ui/panels/limbDiorama.js
// Bestiary page: ink-sketched slime with limb callouts and a crosshair on
// the selected limb. Moved from canvasRenderer.renderLimbTargeting; the
// panel sheet itself is baked chrome now.

export function paintLimbDiorama(ctx, node, rect, theme, tick, gameState) {
  const { x, y, w } = rect;
  const selected = node.props?.selectedLimb ?? 'TORSO';
  const cx = x + w / 2;
  const cy = y + rect.h / 2;

  ctx.save();
  ctx.strokeStyle = theme.palette.rim;
  ctx.lineWidth = 1.25;
  ctx.fillStyle = '#ebdcb9';

  // Base (Legs)
  ctx.beginPath();
  ctx.ellipse(cx, y + 96, 32, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Main Body (Torso)
  ctx.beginPath();
  ctx.moveTo(cx - 32, y + 96);
  ctx.bezierCurveTo(cx - 40, y + 40, cx + 40, y + 40, cx + 32, y + 96);
  ctx.fill();
  ctx.stroke();

  // Pseudopods (Arms)
  ctx.beginPath();
  ctx.moveTo(cx - 28, y + 80);
  ctx.quadraticCurveTo(cx - 50, y + 60, cx - 38, y + 90);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 28, y + 80);
  ctx.quadraticCurveTo(cx + 50, y + 60, cx + 38, y + 90);
  ctx.stroke();

  // Core Nucleus (Head) + pupil
  ctx.beginPath();
  ctx.arc(cx, y + 70, 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = theme.palette.danger;
  ctx.beginPath();
  ctx.arc(cx, y + 70, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Crosshair on the selected limb
  const limbCoords = {
    HEAD: { rx: 0, ry: -10, size: 20 },
    TORSO: { rx: 0, ry: 16, size: 30 },
    ARMS: { rx: -35, ry: 10, size: 20 },
    LEGS: { rx: 0, ry: 35, size: 40 },
  };
  const tgt = limbCoords[selected];
  if (tgt) {
    const tx = cx + tgt.rx;
    const ty = cy + tgt.ry;
    ctx.strokeStyle = theme.palette.danger;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tx - tgt.size / 2, ty - tgt.size / 2, tgt.size, tgt.size);
    ctx.beginPath();
    ctx.moveTo(tx - tgt.size / 2 - 4, ty);
    ctx.lineTo(tx + tgt.size / 2 + 4, ty);
    ctx.moveTo(tx, ty - tgt.size / 2 - 4);
    ctx.lineTo(tx, ty + tgt.size / 2 + 4);
    ctx.stroke();
  }

  // Callout labels + pointer lines
  ctx.fillStyle = theme.palette.textSecondary;
  ctx.font = `bold 9px ${theme.typography.numberFont}`;
  ctx.strokeStyle = 'rgba(92, 69, 56, 0.35)';
  ctx.lineWidth = 1;

  ctx.textAlign = 'left';
  ctx.fillText('[1] NUCLEUS', x + 15, y + 25);
  ctx.beginPath();
  ctx.moveTo(x + 75, y + 25);
  ctx.lineTo(cx - 10, y + 65);
  ctx.stroke();

  ctx.fillText('[2] MEMBRANE', x + 15, y + 65);
  ctx.beginPath();
  ctx.moveTo(x + 85, y + 65);
  ctx.lineTo(cx - 20, y + 75);
  ctx.stroke();

  ctx.textAlign = 'right';
  ctx.fillText('PSEUDOPODS [3]', x + w - 15, y + 65);
  ctx.beginPath();
  ctx.moveTo(x + w - 95, y + 65);
  ctx.lineTo(cx + 35, y + 80);
  ctx.stroke();

  ctx.fillText('BASE [4]', x + w - 15, y + 105);
  ctx.beginPath();
  ctx.moveTo(x + w - 65, y + 105);
  ctx.lineTo(cx + 20, y + 96);
  ctx.stroke();

  // Target caption
  const targetName = gameState?.target?.name ?? 'INK SLIME';
  ctx.fillStyle = theme.palette.danger;
  ctx.font = `bold 10px ${theme.typography.titleFont}`;
  ctx.textAlign = 'center';
  ctx.fillText(targetName, cx, y + 148);
  ctx.fillStyle = theme.palette.textSecondary;
  ctx.font = `9px ${theme.typography.bodyFont}`;
  ctx.fillText(`AIM: ${selected}`, cx, y + 160);

  ctx.restore();
}
```

Register in `panels/index.js`:

```js
import { paintBossAlert } from './bossAlerts.js';
import { paintPartyFrames, paintPartyMember } from './partyFrames.js';
import { paintLimbDiorama } from './limbDiorama.js';

// in PANEL_PAINTERS:
  boss_alerts: paintBossAlert,
  party_frames: paintPartyFrames,
  party_member_1: paintPartyMember,
  party_member_2: paintPartyMember,
  party_member_3: paintPartyMember,
  party_member_4: paintPartyMember,
  limb_targeting_panel: paintLimbDiorama,
```

- [ ] **Step 4: Delete legacy methods**

In `canvasRenderer.js` delete `renderBossAlert` and `renderLimbTargeting` and their dispatch lines. The legacy switch now only handles `skill_tree_panel` and `inventory_panel`.

- [ ] **Step 5: Run tests + visual check + commit**

Run: `cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && npm test`
Expected: PASS. Visual: press `H` for the diorama; boss alert fires from server events; party frames appear when `party_frames.visible` is toggled.

```bash
cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS"
git add client/pixelbrain-ui/panels/ client/pixelbrain-ui/renderers/canvasRenderer.js tests/panel-painters.test.js
git commit -m "feat(hud): sigil boss alerts, fellowship party cards, bestiary limb diorama"
```

---

### Task 10: Layout engine — z-order + inverse anchor mapping

**Files:**
- Modify: `Scholomance OS/client/pixelbrain-ui/core/layoutEngine.js`
- Test: `Scholomance OS/tests/layout-editing.test.js`

**Interfaces:**
- Consumes: existing `UILayoutEngine` (`roots`, `flatNodesMap`, `resolve()`, `viewportWidth/Height`) and `resolveNodeScreenLayout`.
- Produces:
  - `UILayoutEngine.bringToFront(id): void` — moves a root to the end of `roots` (paint order = z-order; renderer already paints in array order).
  - `UILayoutEngine.setNodeScreenRect(id, { x, y, w, h }): boolean` — inverse of anchor resolution: converts a desired screen rect into `node.position`/`node.size` for the node's anchor, then re-resolves that node. Tasks 11–13 rely on both.

- [ ] **Step 1: Write the failing test**

```js
// Scholomance OS/tests/layout-editing.test.js
import { describe, it, expect } from 'vitest';
import { UILayoutEngine } from '../client/pixelbrain-ui/core/layoutEngine.js';

const ANCHORS = ['top_left', 'top', 'top_right', 'left', 'center', 'right', 'bottom_left', 'bottom', 'bottom_right'];

function makeEngine() {
  const engine = new UILayoutEngine(1280, 800);
  return engine;
}

function makeNode(id, anchor) {
  return { id, type: 'panel', anchor, position: { x: 10, y: 10 }, size: { w: 100, h: 50 }, visible: true };
}

describe('setNodeScreenRect', () => {
  ANCHORS.forEach((anchor) => {
    it(`round-trips through anchor "${anchor}"`, () => {
      const engine = makeEngine();
      engine.addRootNode(makeNode('p', anchor));
      engine.resolve();
      const ok = engine.setNodeScreenRect('p', { x: 200, y: 120, w: 240, h: 96 });
      expect(ok).toBe(true);
      const l = engine.getNode('p').layout;
      expect(l.x).toBeCloseTo(200);
      expect(l.y).toBeCloseTo(120);
      expect(l.width).toBeCloseTo(240);
      expect(l.height).toBeCloseTo(96);
    });
  });

  it('survives a subsequent full resolve (anchor-aware persistence)', () => {
    const engine = makeEngine();
    engine.addRootNode(makeNode('p', 'bottom_right'));
    engine.resolve();
    engine.setNodeScreenRect('p', { x: 900, y: 600, w: 200, h: 100 });
    engine.resolve();
    const l = engine.getNode('p').layout;
    expect(l.x).toBeCloseTo(900);
    expect(l.y).toBeCloseTo(600);
  });

  it('keeps the panel glued to its anchor when the viewport resizes', () => {
    const engine = makeEngine();
    engine.addRootNode(makeNode('p', 'bottom_right'));
    engine.resolve();
    engine.setNodeScreenRect('p', { x: 1280 - 220, y: 800 - 120, w: 200, h: 100 });
    engine.updateViewportSize(1920, 1080);
    const l = engine.getNode('p').layout;
    expect(l.x).toBeCloseTo(1920 - 220);
    expect(l.y).toBeCloseTo(1080 - 120);
  });

  it('returns false for unknown ids', () => {
    expect(makeEngine().setNodeScreenRect('nope', { x: 0, y: 0, w: 10, h: 10 })).toBe(false);
  });
});

describe('bringToFront', () => {
  it('moves the root to the end of paint order', () => {
    const engine = makeEngine();
    engine.addRootNode(makeNode('a', 'top_left'));
    engine.addRootNode(makeNode('b', 'top_left'));
    engine.addRootNode(makeNode('c', 'top_left'));
    engine.bringToFront('a');
    expect(engine.roots.map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && npx vitest run tests/layout-editing.test.js`
Expected: FAIL — `setNodeScreenRect is not a function`.

- [ ] **Step 3: Write the implementation**

Add to the `UILayoutEngine` class in `layoutEngine.js`:

```js
  bringToFront(id) {
    const idx = this.roots.findIndex(r => r.id === id);
    if (idx >= 0 && idx < this.roots.length - 1) {
      this.roots.push(this.roots.splice(idx, 1)[0]);
    }
  }

  // Inverse of resolveNodeScreenLayout: convert a desired screen rect into
  // anchor-relative position/size so the panel stays glued to its anchor
  // across viewport resizes.
  setNodeScreenRect(id, rect) {
    const node = this.flatNodesMap.get(id);
    if (!node) return false;
    const scale = node.scale ?? 1.0;
    const vw = this.viewportWidth;
    const vh = this.viewportHeight;
    node.size = { w: Math.round(rect.w / scale), h: Math.round(rect.h / scale) };
    const sw = node.size.w * scale;
    const sh = node.size.h * scale;

    let px;
    let py;
    switch (node.anchor) {
      case 'top':          px = rect.x - (vw / 2 - sw / 2); py = rect.y; break;
      case 'top_right':    px = vw - rect.x - sw;           py = rect.y; break;
      case 'left':         px = rect.x;                     py = rect.y - (vh / 2 - sh / 2); break;
      case 'center':       px = rect.x - (vw / 2 - sw / 2); py = rect.y - (vh / 2 - sh / 2); break;
      case 'right':        px = vw - rect.x - sw;           py = rect.y - (vh / 2 - sh / 2); break;
      case 'bottom_left':  px = rect.x;                     py = vh - rect.y - sh; break;
      case 'bottom':       px = rect.x - (vw / 2 - sw / 2); py = vh - rect.y - sh; break;
      case 'bottom_right': px = vw - rect.x - sw;           py = vh - rect.y - sh; break;
      case 'top_left':
      default:             px = rect.x;                     py = rect.y; break;
    }
    node.position = { x: Math.round(px), y: Math.round(py) };
    resolveNodeScreenLayout(node, null, vw, vh);
    return true;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && npx vitest run tests/layout-editing.test.js && npm test`
Expected: all PASS (13 new tests; full suite green).

- [ ] **Step 5: Commit**

```bash
cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS"
git add client/pixelbrain-ui/core/layoutEngine.js tests/layout-editing.test.js
git commit -m "feat(hud): layout z-order and anchor-aware inverse screen-rect mapping"
```

---

### Task 11: Layout persistence

**Files:**
- Create: `Scholomance OS/client/pixelbrain-ui/core/layoutStore.js`
- Test: `Scholomance OS/tests/layout-store.test.js`

**Interfaces:**
- Consumes: `UILayoutEngine` (`roots`, `getNode`, `bringToFront`, `resolve`).
- Produces (PDR §25 `SavedUILayout` shape):
  - `LAYOUT_STORAGE_KEY = 'pixelbrain.ui.layout.v1'`
  - `serializeLayout(layoutEngine, themeId, tick = 0): SavedUILayout` — `{ layoutId, themeId, updatedAtTick, order: string[], nodes: [{ id, anchor, position, size, visible, locked }] }` (roots only; children follow their parent).
  - `applyLayout(layoutEngine, saved): boolean` — applies snapshots to matching roots, skips stale/unknown ids, restores z-order, then `resolve()`.
  - `class LayoutStore { constructor(storage) ; save(layoutEngine, themeId, tick) ; load(layoutEngine): boolean ; reset() }` — `storage` is any localStorage-shaped object (injectable for tests).

- [ ] **Step 1: Write the failing test**

```js
// Scholomance OS/tests/layout-store.test.js
import { describe, it, expect } from 'vitest';
import { UILayoutEngine } from '../client/pixelbrain-ui/core/layoutEngine.js';
import { LAYOUT_STORAGE_KEY, serializeLayout, applyLayout, LayoutStore } from '../client/pixelbrain-ui/core/layoutStore.js';

function makeMemoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function makeEngine() {
  const engine = new UILayoutEngine(1280, 800);
  engine.addRootNode({ id: 'a', type: 'panel', anchor: 'top_left', position: { x: 20, y: 20 }, size: { w: 100, h: 50 }, visible: true, locked: false });
  engine.addRootNode({ id: 'b', type: 'panel', anchor: 'bottom', position: { x: 0, y: 20 }, size: { w: 200, h: 60 }, visible: false, locked: true });
  engine.resolve();
  return engine;
}

describe('layoutStore', () => {
  it('serialize → apply round-trips positions, sizes, flags, and z-order', () => {
    const src = makeEngine();
    src.setNodeScreenRect('a', { x: 300, y: 200, w: 140, h: 70 });
    src.bringToFront('a');
    const saved = serializeLayout(src, 'picture_book_mud', 99);

    const dst = makeEngine();
    expect(applyLayout(dst, saved)).toBe(true);
    const a = dst.getNode('a');
    expect(a.layout.x).toBeCloseTo(300);
    expect(a.layout.y).toBeCloseTo(200);
    expect(a.size).toEqual({ w: 140, h: 70 });
    expect(dst.getNode('b').visible).toBe(false);
    expect(dst.roots.map((r) => r.id)).toEqual(['b', 'a']);
    expect(saved.themeId).toBe('picture_book_mud');
    expect(saved.updatedAtTick).toBe(99);
  });

  it('skips stale node ids without failing', () => {
    const saved = serializeLayout(makeEngine(), 't');
    saved.nodes.push({ id: 'ghost_panel', anchor: 'top_left', position: { x: 0, y: 0 }, size: { w: 1, h: 1 }, visible: true, locked: false });
    saved.order.push('ghost_panel');
    expect(applyLayout(makeEngine(), saved)).toBe(true);
  });

  it('applyLayout rejects malformed payloads', () => {
    expect(applyLayout(makeEngine(), null)).toBe(false);
    expect(applyLayout(makeEngine(), { nodes: 'nope' })).toBe(false);
  });

  it('LayoutStore save/load/reset against injectable storage', () => {
    const storage = makeMemoryStorage();
    const store = new LayoutStore(storage);
    const src = makeEngine();
    src.setNodeScreenRect('a', { x: 500, y: 400, w: 100, h: 50 });
    store.save(src, 'picture_book_mud', 5);
    expect(storage.getItem(LAYOUT_STORAGE_KEY)).toBeTruthy();

    const dst = makeEngine();
    expect(store.load(dst)).toBe(true);
    expect(dst.getNode('a').layout.x).toBeCloseTo(500);

    store.reset();
    expect(store.load(makeEngine())).toBe(false);
  });

  it('LayoutStore.load tolerates corrupt JSON', () => {
    const storage = makeMemoryStorage();
    storage.setItem(LAYOUT_STORAGE_KEY, '{not json');
    expect(new LayoutStore(storage).load(makeEngine())).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && npx vitest run tests/layout-store.test.js`
Expected: FAIL — cannot resolve `layoutStore.js`.

- [ ] **Step 3: Write the implementation**

```js
// Scholomance OS/client/pixelbrain-ui/core/layoutStore.js
// SavedUILayout persistence (PDR §25): serialize root-panel geometry,
// visibility, lock state, and z-order; restore on boot.

export const LAYOUT_STORAGE_KEY = 'pixelbrain.ui.layout.v1';

export function serializeLayout(layoutEngine, themeId, tick = 0) {
  return {
    layoutId: 'layout.custom.v1',
    themeId,
    updatedAtTick: tick,
    order: layoutEngine.roots.map((r) => r.id),
    nodes: layoutEngine.roots.map((r) => ({
      id: r.id,
      anchor: r.anchor,
      position: { ...r.position },
      size: { ...r.size },
      visible: r.visible !== false,
      locked: r.locked === true,
    })),
  };
}

export function applyLayout(layoutEngine, saved) {
  if (!saved || !Array.isArray(saved.nodes)) return false;
  for (const snap of saved.nodes) {
    const node = layoutEngine.getNode(snap.id);
    if (!node) continue; // stale panel id from an older build — skip
    node.anchor = snap.anchor;
    node.position = { ...snap.position };
    node.size = { ...snap.size };
    node.visible = snap.visible;
    node.locked = snap.locked;
  }
  if (Array.isArray(saved.order)) {
    saved.order.forEach((id) => layoutEngine.bringToFront(id));
  }
  layoutEngine.resolve();
  return true;
}

export class LayoutStore {
  constructor(storage) {
    this.storage = storage;
  }

  save(layoutEngine, themeId, tick) {
    this.storage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(serializeLayout(layoutEngine, themeId, tick)));
  }

  load(layoutEngine) {
    const raw = this.storage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return false;
    try {
      return applyLayout(layoutEngine, JSON.parse(raw));
    } catch {
      return false;
    }
  }

  reset() {
    this.storage.removeItem(LAYOUT_STORAGE_KEY);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && npx vitest run tests/layout-store.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS"
git add client/pixelbrain-ui/core/layoutStore.js tests/layout-store.test.js
git commit -m "feat(hud): SavedUILayout serialization and localStorage-backed layout store"
```

---

### Task 12: Interaction controller — edit mode drag/resize

**Files:**
- Create: `Scholomance OS/client/pixelbrain-ui/core/interaction.js`
- Test: `Scholomance OS/tests/interaction.test.js`

**Interfaces:**
- Consumes: `UILayoutEngine` (`roots`, `viewportWidth/Height`, `bringToFront`, `setNodeScreenRect`).
- Produces:
  - `HANDLE_SIZE = 10`, `GRID_SNAP = 4`, `MIN_PANEL = { w: 80, h: 36 }`
  - `snap(v): number` — nearest 4px.
  - `hitZone(layout, px, py): 'move'|'n'|'s'|'e'|'w'|'ne'|'nw'|'se'|'sw'|null` — `layout` is a node's `{x, y, width, height}`.
  - `class UIInteractionController { constructor({ layoutEngine, onLayoutChanged, onNodeResized }) ; editMode ; hover ; drag ; toggleEditMode(): boolean ; pointerDown(px, py): boolean ; pointerMove(px, py): boolean ; pointerUp(): boolean ; topPanelAt(px, py) }`
  - `onNodeResized(nodeId)` fires during resize drags (Task 13 uses it to invalidate chrome); `onLayoutChanged(nodeId)` fires on drop (Task 13 persists there). `pointerDown` returns `true` when the event was consumed (uiManager must then skip game-click handling).

- [ ] **Step 1: Write the failing test**

```js
// Scholomance OS/tests/interaction.test.js
import { describe, it, expect } from 'vitest';
import { UILayoutEngine } from '../client/pixelbrain-ui/core/layoutEngine.js';
import { snap, hitZone, UIInteractionController, GRID_SNAP, MIN_PANEL } from '../client/pixelbrain-ui/core/interaction.js';

function makeWorld() {
  const engine = new UILayoutEngine(1280, 800);
  engine.addRootNode({ id: 'a', type: 'panel', anchor: 'top_left', position: { x: 100, y: 100 }, size: { w: 200, h: 100 }, visible: true, locked: false });
  engine.addRootNode({ id: 'lockedp', type: 'panel', anchor: 'top_left', position: { x: 500, y: 100 }, size: { w: 100, h: 100 }, visible: true, locked: true });
  engine.resolve();
  const events = { changed: [], resized: [] };
  const ctl = new UIInteractionController({
    layoutEngine: engine,
    onLayoutChanged: (id) => events.changed.push(id),
    onNodeResized: (id) => events.resized.push(id),
  });
  ctl.toggleEditMode();
  return { engine, ctl, events };
}

describe('snap / hitZone', () => {
  it('snaps to the 4px grid', () => {
    expect(snap(101)).toBe(100);
    expect(snap(102)).toBe(104);
  });

  it('classifies zones', () => {
    const l = { x: 100, y: 100, width: 200, height: 100 };
    expect(hitZone(l, 200, 150)).toBe('move');
    expect(hitZone(l, 102, 102)).toBe('nw');
    expect(hitZone(l, 298, 198)).toBe('se');
    expect(hitZone(l, 200, 102)).toBe('n');
    expect(hitZone(l, 102, 150)).toBe('w');
    expect(hitZone(l, 50, 50)).toBe(null);
  });
});

describe('UIInteractionController', () => {
  it('does nothing outside edit mode', () => {
    const { ctl } = makeWorld();
    ctl.toggleEditMode(); // back off
    expect(ctl.pointerDown(200, 150)).toBe(false);
  });

  it('drag-moves a panel with grid snap and fires onLayoutChanged on drop', () => {
    const { engine, ctl, events } = makeWorld();
    expect(ctl.pointerDown(200, 150)).toBe(true);
    ctl.pointerMove(253, 251); // dx=53, dy=101
    const l = engine.getNode('a').layout;
    expect(l.x % GRID_SNAP).toBe(0);
    expect(l.y % GRID_SNAP).toBe(0);
    expect(l.x).toBeCloseTo(152);
    expect(l.y).toBeCloseTo(200);
    ctl.pointerUp();
    expect(events.changed).toEqual(['a']);
  });

  it('se-handle resize grows the panel and fires onNodeResized', () => {
    const { engine, ctl, events } = makeWorld();
    ctl.pointerDown(298, 198); // se corner
    ctl.pointerMove(338, 238); // dx=40, dy=40 → snaps cleanly
    const l = engine.getNode('a').layout;
    expect(l.width).toBeCloseTo(240);
    expect(l.height).toBeCloseTo(140);
    expect(events.resized).toContain('a');
  });

  it('resize clamps at MIN_PANEL', () => {
    const { engine, ctl } = makeWorld();
    ctl.pointerDown(298, 198);
    ctl.pointerMove(0, 0);
    const l = engine.getNode('a').layout;
    expect(l.width).toBeGreaterThanOrEqual(MIN_PANEL.w);
    expect(l.height).toBeGreaterThanOrEqual(MIN_PANEL.h);
  });

  it('move clamps inside the viewport', () => {
    const { engine, ctl } = makeWorld();
    ctl.pointerDown(200, 150);
    ctl.pointerMove(-500, -500);
    const l = engine.getNode('a').layout;
    expect(l.x).toBeGreaterThanOrEqual(0);
    expect(l.y).toBeGreaterThanOrEqual(0);
  });

  it('ignores locked panels but tracks hover on unlocked ones', () => {
    const { ctl } = makeWorld();
    expect(ctl.pointerDown(550, 150)).toBe(false);
    ctl.pointerMove(200, 150);
    expect(ctl.hover).toEqual({ nodeId: 'a', zone: 'move' });
  });

  it('pointerDown brings the panel to front', () => {
    const { engine, ctl } = makeWorld();
    engine.addRootNode({ id: 'c', type: 'panel', anchor: 'top_left', position: { x: 0, y: 0 }, size: { w: 50, h: 50 }, visible: true });
    engine.resolve();
    ctl.pointerDown(200, 150); // hits 'a'
    expect(engine.roots[engine.roots.length - 1].id).toBe('a');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && npx vitest run tests/interaction.test.js`
Expected: FAIL — cannot resolve `interaction.js`.

- [ ] **Step 3: Write the implementation**

```js
// Scholomance OS/client/pixelbrain-ui/core/interaction.js
// Edit-mode interaction: hit zones, drag-move with grid snap, 8-direction
// resize with min clamp, z-order raise. Screen-space only; anchor math is
// delegated to UILayoutEngine.setNodeScreenRect.

export const HANDLE_SIZE = 10;
export const GRID_SNAP = 4;
export const MIN_PANEL = { w: 80, h: 36 };

export function snap(v) {
  return Math.round(v / GRID_SNAP) * GRID_SNAP;
}

export function hitZone(layout, px, py) {
  const { x, y, width: w, height: h } = layout;
  const inside = px >= x && px <= x + w && py >= y && py <= y + h;
  if (!inside) return null;
  const nearL = px - x <= HANDLE_SIZE;
  const nearR = x + w - px <= HANDLE_SIZE;
  const nearT = py - y <= HANDLE_SIZE;
  const nearB = y + h - py <= HANDLE_SIZE;
  if (nearT && nearL) return 'nw';
  if (nearT && nearR) return 'ne';
  if (nearB && nearL) return 'sw';
  if (nearB && nearR) return 'se';
  if (nearT) return 'n';
  if (nearB) return 's';
  if (nearL) return 'w';
  if (nearR) return 'e';
  return 'move';
}

export class UIInteractionController {
  constructor({ layoutEngine, onLayoutChanged, onNodeResized }) {
    this.layoutEngine = layoutEngine;
    this.onLayoutChanged = onLayoutChanged ?? (() => {});
    this.onNodeResized = onNodeResized ?? (() => {});
    this.editMode = false;
    this.drag = null;  // { nodeId, zone, startX, startY, startRect }
    this.hover = null; // { nodeId, zone }
  }

  toggleEditMode() {
    this.editMode = !this.editMode;
    this.drag = null;
    this.hover = null;
    return this.editMode;
  }

  topPanelAt(px, py) {
    for (let i = this.layoutEngine.roots.length - 1; i >= 0; i -= 1) {
      const root = this.layoutEngine.roots[i];
      if (root.visible === false || root.locked) continue;
      const l = root.layout;
      if (l && px >= l.x && px <= l.x + l.width && py >= l.y && py <= l.y + l.height) return root;
    }
    return null;
  }

  pointerDown(px, py) {
    if (!this.editMode) return false;
    const node = this.topPanelAt(px, py);
    if (!node) return false;
    this.layoutEngine.bringToFront(node.id);
    this.drag = {
      nodeId: node.id,
      zone: hitZone(node.layout, px, py),
      startX: px,
      startY: py,
      startRect: { x: node.layout.x, y: node.layout.y, w: node.layout.width, h: node.layout.height },
    };
    return true;
  }

  pointerMove(px, py) {
    if (!this.editMode) return false;
    if (!this.drag) {
      const node = this.topPanelAt(px, py);
      this.hover = node ? { nodeId: node.id, zone: hitZone(node.layout, px, py) } : null;
      return false;
    }
    const { zone, startX, startY, startRect, nodeId } = this.drag;
    const dx = px - startX;
    const dy = py - startY;
    let { x, y, w, h } = startRect;

    if (zone === 'move') {
      x = snap(startRect.x + dx);
      y = snap(startRect.y + dy);
    } else {
      if (zone.includes('w')) { x = snap(startRect.x + dx); w = startRect.w + (startRect.x - x); }
      if (zone.includes('e')) { w = snap(startRect.w + dx); }
      if (zone.includes('n')) { y = snap(startRect.y + dy); h = startRect.h + (startRect.y - y); }
      if (zone.includes('s')) { h = snap(startRect.h + dy); }
      w = Math.max(MIN_PANEL.w, w);
      h = Math.max(MIN_PANEL.h, h);
    }

    x = Math.max(0, Math.min(x, this.layoutEngine.viewportWidth - w));
    y = Math.max(0, Math.min(y, this.layoutEngine.viewportHeight - h));
    this.layoutEngine.setNodeScreenRect(nodeId, { x, y, w, h });
    if (zone !== 'move') this.onNodeResized(nodeId);
    return true;
  }

  pointerUp() {
    if (!this.drag) return false;
    const id = this.drag.nodeId;
    this.drag = null;
    this.onLayoutChanged(id);
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && npx vitest run tests/interaction.test.js && npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS"
git add client/pixelbrain-ui/core/interaction.js tests/interaction.test.js
git commit -m "feat(hud): edit-mode interaction controller (hit zones, snap move, 8-way resize)"
```

---

### Task 13: Wire edit mode into uiManager + edit overlays

**Files:**
- Modify: `Scholomance OS/client/pixelbrain-ui/core/uiManager.js`
- Modify: `Scholomance OS/client/pixelbrain-ui/renderers/canvasRenderer.js` (add `drawEditOverlays`, extend `render` signature)
- Test: existing suite must stay green (uiManager is browser-coupled; behavior is covered by Task 12 unit tests + Task 14 visual verification)

**Interfaces:**
- Consumes: `UIInteractionController` (Task 12), `LayoutStore` (Task 11), `ChromeCache.invalidateNode` (Task 4), `bringToFront` (Task 10).
- Produces:
  - `L` toggles edit mode (sits beside the existing H/I/K/O panel toggles); `R` while in edit mode resets to the default layout.
  - `renderer.render(layoutEngine, currentTick, gameState, interaction = null)` — 4th param drives overlays.
  - `renderer.drawEditOverlays(layoutEngine, interaction)` — dashed ink outline, ink corner brackets on unlocked panels, panel-id label.
  - Layout auto-saves on drop, auto-loads on boot.

- [ ] **Step 1: Wire uiManager**

Add imports at the top of `uiManager.js`:

```js
import { UIInteractionController } from './interaction.js';
import { LayoutStore, serializeLayout, applyLayout } from './layoutStore.js';
```

In `init(canvasElement)`, after `this.layoutEngine.resolve();` (step 4 comment) add:

```js
    // 4b. Layout editing + persistence
    this.layoutStore = new LayoutStore(window.localStorage);
    this.interaction = new UIInteractionController({
      layoutEngine: this.layoutEngine,
      onLayoutChanged: () => {
        this.layoutStore.save(this.layoutEngine, themeRegistry.getCurrentTheme().id, this.currentTick);
      },
      onNodeResized: (id) => {
        this.renderer.chromeCache.invalidateNode(id);
      },
    });
    // Pristine default snapshot for the reset action (nodes mutate in place).
    this.defaultLayoutSnapshot = serializeLayout(this.layoutEngine, themeRegistry.getCurrentTheme().id, 0);
    this.layoutStore.load(this.layoutEngine);
```

Replace the existing `canvasElement.addEventListener('mousedown', ...)` block (step 7 comment) with:

```js
    // 7. Pointer handling: edit mode first, then game clicks
    const toCanvas = (e) => {
      const rect = this.canvasElement.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    canvasElement.addEventListener('mousedown', (e) => {
      const p = toCanvas(e);
      if (this.interaction.pointerDown(p.x, p.y)) {
        e.stopPropagation();
        return;
      }
      this.handleCanvasClick(e);
    });

    const EDIT_CURSORS = {
      move: 'move',
      n: 'ns-resize', s: 'ns-resize',
      e: 'ew-resize', w: 'ew-resize',
      nw: 'nwse-resize', se: 'nwse-resize',
      ne: 'nesw-resize', sw: 'nesw-resize',
    };

    window.addEventListener('mousemove', (e) => {
      const p = toCanvas(e);
      this.interaction.pointerMove(p.x, p.y);
      const zone = this.interaction.drag?.zone ?? this.interaction.hover?.zone;
      canvasElement.style.cursor =
        this.interaction.editMode && zone ? (EDIT_CURSORS[zone] ?? 'default') : 'default';
    });

    window.addEventListener('mouseup', () => {
      this.interaction.pointerUp();
    });
```

In `handleInput(e)`, add alongside the other key handlers:

```js
    // L = layout edit mode
    if (key === 'l') {
      const on = this.interaction.toggleEditMode();
      eventBus.publish('CHAT_MESSAGE_RECEIVED', {
        body: `[SYSTEM] LAYOUT EDIT MODE ${on ? 'ON — drag panels, corners resize, R resets' : 'OFF — layout saved'}`
      });
      if (!on) {
        this.layoutStore.save(this.layoutEngine, themeRegistry.getCurrentTheme().id, this.currentTick);
      }
    }

    // R (edit mode only) = reset layout to defaults
    if (key === 'r' && this.interaction?.editMode) {
      this.layoutStore.reset();
      applyLayout(this.layoutEngine, this.defaultLayoutSnapshot);
      this.renderer.chromeCache.clear();
      eventBus.publish('CHAT_MESSAGE_RECEIVED', { body: '[SYSTEM] LAYOUT RESET TO DEFAULT' });
    }
```

In the `key === 't'` theme-cycling handler, after `this.renderer.cachedRoutes.clear();` add:

```js
      this.renderer.chromeCache.clear();
```

In `tick()`, change the render call to pass the interaction state:

```js
    this.renderer.render(this.layoutEngine, this.currentTick, this.mockGameState, this.interaction);
```

- [ ] **Step 2: Add overlays to canvasRenderer**

Change the `render` signature and append the overlay pass:

```js
  render(layoutEngine, currentTick, gameState, interaction = null) {
    this.clear();
    this.ctx.imageSmoothingEnabled = false;
    const theme = themeRegistry.getCurrentTheme();

    layoutEngine.roots.forEach(node => {
      this.renderNode(node, theme, currentTick, gameState);
    });

    this.renderTooltips(layoutEngine, theme, gameState);
    this.drawEditOverlays(layoutEngine, interaction, theme);
  }

  // Edit-mode chrome: dashed ink outline, corner brackets, panel-id label.
  drawEditOverlays(layoutEngine, interaction, theme) {
    if (!interaction?.editMode) return;
    layoutEngine.roots.forEach(root => {
      if (root.visible === false || !root.layout) return;
      const l = root.layout;
      this.ctx.save();
      this.ctx.setLineDash([6, 4]);
      this.ctx.strokeStyle = root.locked ? 'rgba(107, 84, 71, 0.5)' : theme.palette.danger;
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeRect(l.x - 2.5, l.y - 2.5, l.width + 5, l.height + 5);
      this.ctx.setLineDash([]);

      if (!root.locked) {
        const b = 10;
        this.ctx.strokeStyle = theme.palette.rim;
        this.ctx.lineWidth = 2;
        [
          [l.x, l.y, 1, 1],
          [l.x + l.width, l.y, -1, 1],
          [l.x, l.y + l.height, 1, -1],
          [l.x + l.width, l.y + l.height, -1, -1],
        ].forEach(([cx, cy, sx, sy]) => {
          this.ctx.beginPath();
          this.ctx.moveTo(cx + sx * b, cy);
          this.ctx.lineTo(cx, cy);
          this.ctx.lineTo(cx, cy + sy * b);
          this.ctx.stroke();
        });
      }

      this.ctx.fillStyle = theme.palette.textSecondary;
      this.ctx.font = `9px ${theme.typography.numberFont}`;
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'bottom';
      this.ctx.fillText(root.id.toUpperCase(), l.x, l.y - 5);
      this.ctx.restore();
    });
  }
```

- [ ] **Step 3: Run the suite**

Run: `cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && npm test`
Expected: full suite PASS (no unit test imports uiManager/canvasRenderer; this guards against regressions elsewhere).

- [ ] **Step 4: Manual verification**

Launch `CLIENTS=0 npm run dev`, open `http://localhost:8085`, and verify:
1. `L` → dashed outlines + brackets + labels appear; chat logs the mode message.
2. Drag the player frame — it moves with 4px snapping; cursor is `move`.
3. Drag the chat panel's SE corner — panel grows, parchment chrome re-noises (deckle changes) instead of stretching.
4. Reload the page — the edited layout persists.
5. `L` then `R` — layout returns to defaults; reload confirms reset.
6. `T` ×5 (cycle back to storybook) — no crash on any theme.
Stop the server afterwards.

- [ ] **Step 5: Commit**

```bash
cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS"
git add client/pixelbrain-ui/core/uiManager.js client/pixelbrain-ui/renderers/canvasRenderer.js
git commit -m "feat(hud): L-key layout edit mode with ink overlays, persistence, and R reset"
```

---

### Task 14: Visual verification harness + final checks

**Files:**
- Create: `Scholomance OS/scripts/hud-screenshot.mjs`
- Verify: everything.

**Interfaces:**
- Consumes: the running dev server (`CLIENTS=0 npm run dev` → client on `http://localhost:8085`), Playwright from the mother repo's `node_modules` (script must be RUN FROM THE MOTHER REPO ROOT so module resolution finds it).
- Produces: screenshots under the mother repo's `tmp/` — reviewed by eye (the agent reads the PNGs) per spec §5.

- [ ] **Step 1: Write the screenshot harness**

```js
// Scholomance OS/scripts/hud-screenshot.mjs
// Visual verification for the pictureBookMUD HUD (spec §5).
// Run from the MOTHER repo root (playwright resolves from its node_modules):
//   1. cd "Scholomance OS" && CLIENTS=0 npm run dev   (background)
//   2. cd .. && node "Scholomance OS/scripts/hud-screenshot.mjs"
import { chromium } from 'playwright';

const BASE = process.env.HUD_URL ?? 'http://localhost:8085';
const OUT = process.env.HUD_OUT ?? 'tmp';
const sizes = [
  { w: 1280, h: 800, tag: 'deck' },
  { w: 1920, h: 1080, tag: 'desktop' },
];

const browser = await chromium.launch();
for (const { w, h, tag } of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(BASE);
  await page.waitForTimeout(2500); // let assets/SCDL compile settle

  await page.screenshot({ path: `${OUT}/hud-${tag}-default.png` });

  // Edit mode overlays
  await page.keyboard.press('l');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/hud-${tag}-edit.png` });

  // Drag the player frame toward center, then resize the chat panel
  await page.mouse.move(170, 60);
  await page.mouse.down();
  await page.mouse.move(Math.floor(w * 0.4), Math.floor(h * 0.4), { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/hud-${tag}-edited.png` });

  // Persistence: exit edit mode, reload, re-shoot
  await page.keyboard.press('l');
  await page.reload();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/hud-${tag}-persisted.png` });

  // Reset for the next run
  await page.keyboard.press('l');
  await page.keyboard.press('r');
  await page.keyboard.press('l');
  await page.waitForTimeout(300);
  await page.close();
}
await browser.close();
console.log('[hud-screenshot] wrote screenshots to', OUT);
```

- [ ] **Step 2: Run it**

```bash
cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && CLIENTS=0 npm run dev &  # background
sleep 4
cd /home/deck/Downloads/Scholomance-V12-main && node "Scholomance OS/scripts/hud-screenshot.mjs"
# then kill the dev server
```

Expected: 8 PNGs in `tmp/`. **Read each screenshot** and verify against the spec's visual language: layered shadow/board/parchment depth, deckled edges, ink borders, motifs (wax seal on tracker, compass rose in minimap, stitched slots), edit overlays, moved layout persisting after reload.

- [ ] **Step 3: Full suite + mother-repo checks**

```bash
cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS" && npm test
cd /home/deck/Downloads/Scholomance-V12-main && npm run scd64:intellisense
```

Expected: suite green; SCD64 IntelliSense self-check reports no fossils in the diff (this check is mandatory before claiming done — standing feedback).

- [ ] **Step 4: Commit the harness (submodule), then the pointer bump (mother repo)**

```bash
cd "/home/deck/Downloads/Scholomance-V12-main/Scholomance OS"
git add scripts/hud-screenshot.mjs
git commit -m "test(hud): playwright visual verification harness for the storybook HUD"

cd /home/deck/Downloads/Scholomance-V12-main
git add "Scholomance OS"
git commit -m "feat(hud): commit submodule update with pictureBookMUD full-fidelity HUD and layout edit mode"
```

Note: the mother repo has other pending submodule changes in its worktree — stage ONLY the `Scholomance OS` path, nothing else.

---

## Self-Review Notes (already applied)

- Spec coverage: visual layers (Task 3), generators+determinism (Tasks 1–3), baking/no-stretch resize (Task 4 + 12), painter modules (Tasks 5–9), edit mode L-key/move/resize/z-order (Tasks 12–13), persistence + reset (Tasks 11, 13), vitest + playwright verification (all tasks + 14). Hidden panels (inventory/skill tree/social) intentionally keep legacy content per spec's out-of-scope list.
- Hover-lift/pressed depth states from spec §1 are deliberately folded into the edit-overlay treatment this pass (hover = bracket highlight); combat hover states land with a future interaction pass — panels have no non-edit hover semantics yet.
- Type consistency: painter signature `(ctx, node, rect, theme, tick, gameState, helpers)` is uniform; `ChromeCache.get(id, variant, w, h, theme)` everywhere; layout mutation only via `setNodeScreenRect`.
