# ConstellationOS Living Answer (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the ConstellationOS answer plate from a stack of bordered cards into a single breathing constellation — a procedurally-generated hero figure drawn from the answer's real data, plus a de-carded body — all deterministic SVG + CSS with no new runtime deps.

**Architecture:** Unchanged Compose division of labour — the packet *gates* (`validateComposeScene`), the shell *paints* (`ComposedResultShell`), and failure *stays local* (falls back to `PlainResultShell`). A new pure geometry function in `skyChart.js` computes the figure from packet fields by rule (phonemes = atoms; genome/rarity/cadence = reaction conditions); the seed touches only twinkle + the gold lodestar, never a coordinate.

**Tech Stack:** React (JSX), SVG, CSS, TypeScript Compose scene packets, Vitest (jsdom) for tests, SCDL v1.1 (`scdl.cli.js`) for the fixed glyph/palette vocabulary.

## Global Constraints

Copied verbatim from `docs/superpowers/specs/2026-07-23-constellationos-living-answer-design.md`. Every task's requirements implicitly include this section.

- **No new runtime dependencies.** No three.js, no WebGL, no WASM, no `math.js`.
- **Determinism / VAELRIX Law 6:** no `Math.random`, no `Date.now`. Every generated value derives from `pageBytecode` via the existing pure hashes (`fnv1a32`, `seededUnit`) in `skyChart.js`. Same query → same `pageBytecode` → same figure forever.
- **Geometry has NO positional jitter.** Node positions are a pure function of the packet formula. The seed may choose only the *animation route* (twinkle) and the *lodestar highlight* — never a coordinate, never the analysis.
- **Backend-truth (`BUGPATTERN_COLOR_DRAGON`):** the figure READS backend-confirmed rarity band, phoneme strings, stress digits, and `dominantVowelFamily` straight from the packet. It NEVER recomputes phonological or rarity truth on the frontend — not even on the degraded path.
- **Gold = the singular answer** (lodestar nucleus, evidenced verdict, seal) only. The phoneme star field takes rarity *temperature* color (blue…red), never gold.
- **All motion is reduced-motion gated.** Breathing uses seeded opacity/glow only — never `transform` (which would clobber SVG positioning attributes).
- **Failure stays local (PDR §7.8):** a broken figure or failed scene contract must degrade to `PlainResultShell`; it can never take the answer down.
- **Test command:** `npx vitest run tests/qa/features/<file>` from repo root `/home/deck/Downloads/Scholomance-V12-main`.

---

### Task 1: Rarity → stellar spectral ramp (pure helper)

Adds the OBAFGKM temperature ramp as a pure function in `skyChart.js`. Rarer = hotter/bluer/brighter, keyed strictly to the backend rarity band. This is a leaf function with no dependencies, so it lands first.

**Files:**
- Modify: `src/pages/Constellation/skyChart.js` (append after `plateRevealFor`, ~line 195)
- Test: `tests/qa/features/constellation-hero-figure.test.js` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `raritySpectral(rarity)` where `rarity` is `{ band: number, max: number, label?: string } | null`, returning `{ spectralClass: string, color: string, brightness: number, normalized: number }`. `spectralClass` ∈ `'O'|'B'|'A'|'F'|'G'|'K'|'M'|'unknown'`; `color` is a hex string; `brightness` ∈ `[0,1]`; `normalized` ∈ `[0,1]`. Convention: **higher `band` = rarer = higher `normalized` = hotter/bluer/brighter**. `rarity === null` → the neutral `'unknown'` class (amethyst), and this is NOT a recomputation of rarity truth — it is the honest absence of it.

- [ ] **Step 1: Write the failing test**

Create `tests/qa/features/constellation-hero-figure.test.js`:

```js
/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { raritySpectral } from '../../../src/pages/Constellation/skyChart.js';

describe('raritySpectral — OBAFGKM ramp keyed to the backend rarity band', () => {
  it('maps a rare (high-band) word to a hot blue class and a common one to cool red', () => {
    const rare = raritySpectral({ band: 9, max: 9, label: 'rare' });
    const common = raritySpectral({ band: 1, max: 9, label: 'common' });
    expect(rare.spectralClass).toBe('O');
    expect(common.spectralClass).toBe('M');
    // Rarer burns brighter (photonic selection).
    expect(rare.brightness).toBeGreaterThan(common.brightness);
  });

  it('normalizes strictly from band/max and clamps to [0,1]', () => {
    expect(raritySpectral({ band: 5, max: 9 }).normalized).toBeCloseTo(5 / 9, 5);
    expect(raritySpectral({ band: 20, max: 9 }).normalized).toBe(1);
    expect(raritySpectral({ band: -3, max: 9 }).normalized).toBe(0);
  });

  it('returns the neutral unknown class (amethyst) when rarity is absent — never a recomputed value', () => {
    const none = raritySpectral(null);
    expect(none.spectralClass).toBe('unknown');
    expect(none.color).toBe('#8b7cff'); // --cos-amethyst
  });

  it('does not derive rarity from anything but the band (backend-truth)', () => {
    // Same band, wildly different max normalization — color follows normalized band only.
    const a = raritySpectral({ band: 8, max: 9 });
    const b = raritySpectral({ band: 8, max: 9, label: 'IGNORED' });
    expect(a.color).toBe(b.color);
    expect(a.spectralClass).toBe(b.spectralClass);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/constellation-hero-figure.test.js`
Expected: FAIL with "raritySpectral is not a function" (or import error).

- [ ] **Step 3: Write minimal implementation**

Append to `src/pages/Constellation/skyChart.js`:

```js
/* ─── Rarity → stellar spectral temperature (Living Answer, Phase 1) ──────
   A real OBAFGKM ramp keyed to the BACKEND rarity band: rarer words burn
   hotter, bluer, and brighter (astronomically faithful — hot blue stars are
   rare and massive, cool red stars common). Backend-truth: the only inputs are
   rarity.band / rarity.max; nothing here recomputes rarity. `null` rarity is the
   honest "unknown" class, not a frontend guess. */

/** Ordered hot→cool. Thresholds are on normalized rarity (1 = rarest/hottest). */
const SPECTRAL_RAMP = Object.freeze([
  { min: 0.85, spectralClass: 'O', color: '#9db4ff' }, // blue-white, hot, rare
  { min: 0.70, spectralClass: 'B', color: '#aec6ff' },
  { min: 0.55, spectralClass: 'A', color: '#eaf0ff' }, // white
  { min: 0.40, spectralClass: 'F', color: '#fdf4d8' }, // yellow-white
  { min: 0.28, spectralClass: 'G', color: '#ffe9a8' }, // yellow
  { min: 0.15, spectralClass: 'K', color: '#ffc27a' }, // orange
  { min: 0.00, spectralClass: 'M', color: '#ff9d7a' }, // red, cool, common
]);

const AMETHYST = '#8b7cff'; // --cos-amethyst — the neutral when rarity is unknown

/**
 * @param {{ band: number, max: number, label?: string } | null | undefined} rarity
 * @returns {{ spectralClass: string, color: string, brightness: number, normalized: number }}
 */
export function raritySpectral(rarity) {
  if (!rarity || typeof rarity.band !== 'number' || typeof rarity.max !== 'number' || rarity.max <= 0) {
    return { spectralClass: 'unknown', color: AMETHYST, brightness: 0.7, normalized: 0.5 };
  }
  const normalized = Math.max(0, Math.min(1, rarity.band / rarity.max));
  const band = SPECTRAL_RAMP.find((b) => normalized >= b.min) || SPECTRAL_RAMP[SPECTRAL_RAMP.length - 1];
  // Rarer burns brighter: 0.55 (common) … 1.0 (rarest).
  const brightness = 0.55 + normalized * 0.45;
  return { spectralClass: band.spectralClass, color: band.color, brightness, normalized };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/constellation-hero-figure.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Constellation/skyChart.js tests/qa/features/constellation-hero-figure.test.js
git commit -m "feat(constellation): rarity → OBAFGKM stellar spectral ramp"
```

---

### Task 2: `heroFigure(packet)` — the generation law (pure geometry)

The core "reaction": phonemes are atoms grouped into syllable rosettes chained on a spine; cadence sets the rosette symmetry, vowel family the spine curvature, rarity the star temperature, stress the brightest nuclei, and the seed only the gold lodestar. Pure + deterministic. This is the largest task; its tests are the determinism and backend-truth falsifiers the spec's "Testing" section requires.

**Files:**
- Modify: `src/pages/Constellation/skyChart.js` (append after `raritySpectral`)
- Test: `tests/qa/features/constellation-hero-figure.test.js` (extend)

**Interfaces:**
- Consumes: `raritySpectral` (Task 1); `fnv1a32`, `seededUnit` (existing in `skyChart.js`).
- Produces: `heroFigure(packet)` returning:
  ```
  {
    viewBox: '0 0 100 60',
    degraded: boolean,
    spectralClass: string,
    nodes: Array<{ id: string, x: number, y: number, phoneme: string,
                   isVowel: boolean, stressed: boolean, magnitude: number,
                   color: string, isLodestar: boolean }>,
    edges: Array<[number, number]>,          // indices into nodes, sequential chain
    rosettes: Array<{ index: number, center: { x: number, y: number },
                      symmetry: string, nodeIndices: number[] }>,
    lodestarNodeId: string | null,
    seed: number,
  }
  ```
  Coordinates live in a `0..100 × 0..60` box. `symmetry` ∈ `'bilateral'|'radial'|'spiral'`.

- [ ] **Step 1: Write the failing test**

Append to `tests/qa/features/constellation-hero-figure.test.js`:

```js
import { heroFigure } from '../../../src/pages/Constellation/skyChart.js';

const basePacket = {
  pageBytecode: 'COS-PAGE-v1-BRIGHT-WOUND-001',
  query: { raw: 'wound', normalized: 'wound', kind: 'word', tokenCount: 1, graphemeCount: 5 },
  leximancy: { rarity: { band: 9, max: 9, label: 'rare' } },
  rhymeAstrology: {
    phonemes: ['W', 'UW1', 'N', 'D'],
    cadenceFamily: 'iambic-adjacent',
    dominantVowelFamily: 'back',
  },
  phraseGenome: { syllables: 1, devicesHint: [], schoolHint: 'PSYCHIC' },
};

describe('heroFigure — the generation law (reaction)', () => {
  it('makes one node per phoneme and ignites the stressed vowel as the brightest', () => {
    const fig = heroFigure(basePacket);
    expect(fig.nodes).toHaveLength(4);
    const stressed = fig.nodes.filter((n) => n.stressed);
    expect(stressed).toHaveLength(1); // UW1
    // Stressed vowel is the brightest magnitude atom.
    const max = Math.max(...fig.nodes.map((n) => n.magnitude));
    expect(stressed[0].magnitude).toBe(max);
  });

  it('groups phonemes into `syllables` rosettes chained on a spine', () => {
    const twoSyl = { ...basePacket, phraseGenome: { ...basePacket.phraseGenome, syllables: 2 } };
    const fig = heroFigure(twoSyl);
    expect(fig.rosettes).toHaveLength(2);
    // Rosette centers advance along the spine (strictly increasing x).
    expect(fig.rosettes[1].center.x).toBeGreaterThan(fig.rosettes[0].center.x);
    // Every node belongs to exactly one rosette.
    const claimed = fig.rosettes.flatMap((r) => r.nodeIndices).sort((a, b) => a - b);
    expect(claimed).toEqual(fig.nodes.map((_, i) => i));
  });

  it('colors every star by the rarity temperature — not gold', () => {
    const fig = heroFigure(basePacket);
    expect(fig.spectralClass).toBe('O'); // band 9/9
    for (const n of fig.nodes) expect(n.color).toBe('#9db4ff');
  });

  it('is byte-identical geometry for the same packet (Law 6)', () => {
    expect(heroFigure(basePacket)).toEqual(heroFigure(basePacket));
  });

  it('the seed moves ONLY the lodestar, never a coordinate (anti-jitter law)', () => {
    const a = heroFigure(basePacket);
    const b = heroFigure({ ...basePacket, pageBytecode: 'A-COMPLETELY-DIFFERENT-SEED' });
    // Coordinates are identical regardless of seed…
    expect(a.nodes.map((n) => [n.x, n.y])).toEqual(b.nodes.map((n) => [n.x, n.y]));
    // …exactly one node is the lodestar in each…
    expect(a.nodes.filter((n) => n.isLodestar)).toHaveLength(1);
    expect(b.nodes.filter((n) => n.isLodestar)).toHaveLength(1);
  });

  it('regenerates a figure from graphemes when the rhyme channel is degraded', () => {
    const degraded = { ...basePacket, rhymeAstrology: null };
    const fig = heroFigure(degraded);
    expect(fig.degraded).toBe(true);
    expect(fig.nodes.length).toBe(degraded.query.graphemeCount); // 5 generic atoms
    // Rarity truth is still read from leximancy, never recomputed.
    expect(fig.spectralClass).toBe('O');
  });

  it('reads stress from the packet digit and never re-derives it (backend-truth)', () => {
    // Frontend-derivable heuristics (e.g. "first vowel is stressed") would ignite N.
    // The packet says UW1 is the only stress; the figure must agree with the packet.
    const fig = heroFigure(basePacket);
    const igniteable = fig.nodes.filter((n) => n.stressed).map((n) => n.phoneme);
    expect(igniteable).toEqual(['UW1']);
  });

  it('bends the spine by vowel family (front tightens, back broadens)', () => {
    const front = heroFigure({ ...basePacket, phraseGenome: { ...basePacket.phraseGenome, syllables: 3 },
      rhymeAstrology: { ...basePacket.rhymeAstrology, dominantVowelFamily: 'front', phonemes: ['IH1','Z','AH0','N','T','S'] } });
    const back = heroFigure({ ...basePacket, phraseGenome: { ...basePacket.phraseGenome, syllables: 3 },
      rhymeAstrology: { ...basePacket.rhymeAstrology, dominantVowelFamily: 'back', phonemes: ['IH1','Z','AH0','N','T','S'] } });
    const arch = (fig) => Math.min(...fig.rosettes.map((r) => r.center.y));
    // Front vowels tighten (taller arch = smaller min-y) than back vowels.
    expect(arch(front)).toBeLessThan(arch(back));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/constellation-hero-figure.test.js`
Expected: FAIL with "heroFigure is not a function".

- [ ] **Step 3: Write minimal implementation**

Append to `src/pages/Constellation/skyChart.js`:

```js
/* ─── The hero figure — the "reaction" (Living Answer, Phase 1) ───────────
   Phonemes are atoms; genome + rarity + cadence + vowel family are the reaction
   conditions, applied BY RULE (WAND_CHEMICAL_STROKE_PROPAGATION: no sampling, no
   score-and-pick). Geometry is a pure function of the packet — the seed touches
   ONLY the gold lodestar (twinkle is applied at render time). Backend-truth:
   stress digits, phonemes, vowel family and rarity band are READ, never
   recomputed (BUGPATTERN_COLOR_DRAGON). */

const HERO_VIEW_W = 100;
const HERO_VIEW_H = 60;
const HERO_MID_Y = 34;          // spine midline
const ROSETTE_RADIUS = 6.5;

/** Front vowels tighten the arch (taller), back vowels broaden it (flatter). */
function spineAmplitude(vowelFamily) {
  const fam = String(vowelFamily || '').toLowerCase();
  if (fam.includes('front')) return 16;
  if (fam.includes('back')) return 7;
  return 11; // central / unknown
}

/** Cadence picks the rosette symmetry operator (replication catalyst). */
function cadenceSymmetry(cadenceFamily) {
  const c = String(cadenceFamily || '').toLowerCase();
  if (c.includes('anapest') || c.includes('dactyl') || c.includes('tern')) return 'radial';
  if (c.includes('spiral') || c.includes('free') || c.includes('irregular')) return 'spiral';
  return 'bilateral'; // iambic/trochaic/binary/default
}

/** Split a list into `groups` contiguous, as-even-as-possible chunks. */
function chunkEvenly(list, groups) {
  const g = Math.max(1, Math.min(groups, list.length || 1));
  const out = Array.from({ length: g }, () => []);
  const per = (list.length || 0) / g;
  for (let i = 0; i < list.length; i += 1) out[Math.min(g - 1, Math.floor(i / per))].push(i);
  return out;
}

/** Place k atoms around a center by the symmetry operator. Pure geometry. */
function placeRosette(center, k, symmetry) {
  const pts = [];
  for (let j = 0; j < k; j += 1) {
    if (symmetry === 'bilateral') {
      const side = j % 2 === 0 ? -1 : 1;
      const rank = Math.floor(j / 2) + (k > 1 ? 0.5 : 0);
      pts.push({ x: center.x + side * (rank / Math.max(1, k)) * ROSETTE_RADIUS * 1.6,
                 y: center.y + (j % 2 === 0 ? -1 : 1) * (rank * 0.6) });
    } else if (symmetry === 'radial') {
      const a = (j / k) * Math.PI * 2 - Math.PI / 2;
      pts.push({ x: center.x + Math.cos(a) * ROSETTE_RADIUS, y: center.y + Math.sin(a) * ROSETTE_RADIUS });
    } else { // spiral
      const a = (j / Math.max(1, k)) * Math.PI * 2.4 - Math.PI / 2;
      const r = ROSETTE_RADIUS * (0.35 + (j / Math.max(1, k)) * 0.65);
      pts.push({ x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r });
    }
  }
  return pts;
}

/**
 * @param {import('./types.js').ConstellationPhase1Packet} packet
 */
export function heroFigure(packet) {
  const rhyme = packet.rhymeAstrology;
  const degraded = !rhyme || !Array.isArray(rhyme.phonemes) || rhyme.phonemes.length === 0;

  // Atoms. On the degraded path, regenerate generic (consonant-like) atoms from
  // the grapheme count so there is always A figure — but NEVER recompute stress
  // or vowel family, which are phonological truth the backend owns.
  const phonemes = degraded
    ? Array.from({ length: Math.max(1, packet.query?.graphemeCount || 1) }, (_, i) => `g${i}`)
    : rhyme.phonemes.map(String);

  const symmetry = cadenceSymmetry(degraded ? '' : rhyme.cadenceFamily);
  const amp = spineAmplitude(degraded ? '' : rhyme.dominantVowelFamily);
  const syllables = Math.max(1, packet.phraseGenome?.syllables || 1);
  const groups = chunkEvenly(phonemes, syllables);
  const spectral = raritySpectral(packet.leximancy?.rarity ?? null);

  // Rosette centers on the spine arc.
  const rosettes = groups.map((nodeIndices, index) => {
    const t = groups.length === 1 ? 0.5 : index / (groups.length - 1);
    const x = 12 + t * 76;
    const y = HERO_MID_Y - Math.sin(Math.PI * t) * amp;
    return { index, center: { x, y }, symmetry, nodeIndices };
  });

  // Atoms placed around their rosette center.
  const nodes = [];
  rosettes.forEach((r) => {
    const local = placeRosette(r.center, r.nodeIndices.length, symmetry);
    r.nodeIndices.forEach((globalIdx, j) => {
      const ph = phonemes[globalIdx];
      const isVowel = /[012]$/.test(ph); // ARPAbet vowels carry a stress digit; degraded atoms never do
      const stressed = /[12]$/.test(ph);
      const magnitude = stressed ? 1.5 : isVowel ? 1.0 : 0.6;
      const p = local[j];
      nodes.push({
        id: `hf${globalIdx}`,
        x: Number(p.x.toFixed(3)),
        y: Number(p.y.toFixed(3)),
        phoneme: ph,
        isVowel,
        stressed,
        magnitude,
        color: spectral.color,
        isLodestar: false,
      });
    });
  });

  // Reorder nodes back into phoneme sequence so edges chain the utterance.
  nodes.sort((a, b) => Number(a.id.slice(2)) - Number(b.id.slice(2)));
  const edges = [];
  for (let i = 0; i + 1 < nodes.length; i += 1) edges.push([i, i + 1]);

  // Lodestar: the seed ignites ONE nucleus gold. Prefer stressed vowels; the seed
  // chooses among them (or among all nodes when none is stressed). Motion/highlight
  // only — never a coordinate.
  const seed = fnv1a32(packet.pageBytecode || 'COS-HERO-v1');
  const candidates = nodes.map((n, i) => (n.stressed ? i : -1)).filter((i) => i >= 0);
  const pool = candidates.length ? candidates : nodes.map((_, i) => i);
  let lodestarNodeId = null;
  if (pool.length) {
    const pick = pool[Math.floor(seededUnit(seed, 7) * pool.length) % pool.length];
    nodes[pick].isLodestar = true;
    lodestarNodeId = nodes[pick].id;
  }

  return {
    viewBox: `0 0 ${HERO_VIEW_W} ${HERO_VIEW_H}`,
    degraded,
    spectralClass: spectral.spectralClass,
    nodes,
    edges,
    rosettes,
    lodestarNodeId,
    seed,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/constellation-hero-figure.test.js`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Constellation/skyChart.js tests/qa/features/constellation-hero-figure.test.js
git commit -m "feat(constellation): heroFigure — deterministic sound-bones geometry"
```

---

### Task 3: Add the `hero-figure` Compose part + spectral design tokens (re-seal the contract)

The figure is only allowed to paint if the scene contract validates it. This task declares `hero-figure` as the FIRST anatomy part and adds the spectral-ramp + glow design tokens, then re-seals the golden checksum in both existing contract tests. Adding the part changes `sourceChecksum`, so the two golden constants (`GOLDEN_CHECKSUM` in the packet test, and `data-compose-scene` in the shell test) must be updated to the newly-emitted value — that reseal is the whole point of the golden test.

**Files:**
- Modify: `src/core/compose/migrated/ConstellationResult.ts:44-81` (RESULT_PARTS), `:104-123` (RESULT_VISUALS)
- Modify: `tests/qa/features/compose-constellation-result-packet.test.ts:27` (GOLDEN_CHECKSUM) and `:41-48` (expected id list)
- Modify: `tests/qa/features/compose-constellation-result-shell.test.tsx:64` (checksum) and `:73-80` (expected parts list)

**Interfaces:**
- Consumes: existing `emitPbUiScene` / `emitPbLayout` (unchanged).
- Produces: `RESULT_PARTS` now begins with `{ id: 'hero-figure', role: 'img', label: 'Sound-bones constellation figure', description: ... }`; `RESULT_VISUALS` gains `star-spectral` and `hero-glow` token attachments. `ConstellationResultPartId` union now includes `'hero-figure'`.

- [ ] **Step 1: Update the contract source**

In `src/core/compose/migrated/ConstellationResult.ts`, prepend the hero part to `RESULT_PARTS` (before `masthead`):

```ts
export const RESULT_PARTS = [
  {
    id: 'hero-figure',
    role: 'img',
    label: 'Sound-bones constellation figure',
    description:
      'The answer drawn as a constellation — phoneme atoms in syllable rosettes, rarity temperature, seeded lodestar.',
  },
  {
    id: 'masthead',
    role: 'region',
    label: 'Phrase identity plate',
    description: 'The query as asked — kind, intent, scale, and the page seal.',
  },
  // …the remaining five parts UNCHANGED…
```

Add two token visuals to `RESULT_VISUALS` (after `scrim-void`):

```ts
  'star-spectral': {
    kind: 'token',
    tokenPath: 'color.spectral',
    cssProperty: 'fill',
    placementSlot: 'figure',
  },
  'hero-glow': {
    kind: 'token',
    tokenPath: 'effect.glow',
    cssProperty: 'filter',
    placementSlot: 'figure',
  },
```

Note: `hero-figure` is a `container`-kind scene node (a known kind), and the two new visuals are only *declared* — they are not added to the root's `visualRefs`, so validation (which only checks that root `visualRefs` resolve) stays green. No layout change: `hero-figure` stacks full-width like the masthead (no `layoutRef`).

- [ ] **Step 2: Run the contract tests to observe the checksum drift**

Run: `npx vitest run tests/qa/features/compose-constellation-result-packet.test.ts`
Expected: FAIL — the id-order assertion now lists `constellation-result.hero-figure` first, and the determinism test prints the NEW `sourceChecksum` (e.g. `expected 'scd64:XXXXXXXXXXXX' to be 'scd64:c05a1427d4252bfc'`). Copy the actual emitted `scd64:…` value from the failure output.

- [ ] **Step 3: Re-seal the golden checksum and expected orders**

In `tests/qa/features/compose-constellation-result-packet.test.ts`:
- Set `const GOLDEN_CHECKSUM = 'scd64:<the value printed in Step 2>';`
- Prepend `'constellation-result.hero-figure',` to the expected id array at lines 41-48.

In `tests/qa/features/compose-constellation-result-shell.test.tsx`:
- Set the `data-compose-scene` expectation (line 64) to the same `scd64:<value>`.
- Prepend `'hero-figure',` to the expected `parts` array at lines 73-80.

- [ ] **Step 4: Run both contract tests to verify they pass**

Run: `npx vitest run tests/qa/features/compose-constellation-result-packet.test.ts`
Expected: PASS.

(The shell test will still fail its parts-order assertion until Task 4 renders the hero section — that is expected and handled in Task 4. Do not "fix" it here by editing the shell.)

- [ ] **Step 5: Commit**

```bash
git add src/core/compose/migrated/ConstellationResult.ts tests/qa/features/compose-constellation-result-packet.test.ts tests/qa/features/compose-constellation-result-shell.test.tsx
git commit -m "feat(constellation): declare hero-figure part + spectral tokens, re-seal contract"
```

---

### Task 4: Render `HeroFigure` at the top of the composed shell

The visible payoff: a new plate that paints the figure as temperature-colored SVG stars with a gold lodestar and seeded twinkle, above the masthead. Uses `SPARK_PATH` for star glyphs (SCDL vocabulary is layered later, in Task 6). The degraded note rides the figure's own `degraded` flag.

**Files:**
- Modify: `src/pages/Constellation/ConstellationResultShell.jsx` (import `heroFigure`, `twinkleFor`; add `HeroFigure` component; render it first inside `ComposedResultShell`)
- Test: `tests/qa/features/compose-constellation-result-shell.test.tsx` (extend)

**Interfaces:**
- Consumes: `heroFigure` (Task 2), `SPARK_PATH`, `twinkleFor` (existing), the `hero-figure` part from Task 3.
- Produces: a `<section data-compose-part="hero-figure">` containing `<svg class="constellation-result-hero">` with `.constellation-result-hero__star`, `.constellation-result-hero__spark`, `.constellation-result-hero__lodestar`, and `.constellation-result-hero__edge` elements.

- [ ] **Step 1: Write the failing test**

Append to `tests/qa/features/compose-constellation-result-shell.test.tsx` inside the `describe('composed answer plate', …)` block:

```tsx
it('renders the hero figure first, temperature-colored, with exactly one gold lodestar', () => {
  const { container } = render(<ConstellationResultShell packet={basePacket} />);
  const parts = Array.from(container.querySelectorAll('[data-compose-part]')).map((n) =>
    n.getAttribute('data-compose-part'),
  );
  expect(parts[0]).toBe('hero-figure'); // top of the plate
  const hero = container.querySelector('.constellation-result-hero');
  expect(hero).toBeTruthy();
  // 10 phonemes → 10 star nodes; exactly one is the lodestar.
  expect(hero!.querySelectorAll('.constellation-result-hero__lodestar')).toHaveLength(1);
  const stars = hero!.querySelectorAll('.constellation-result-hero__star, .constellation-result-hero__spark');
  expect(stars.length).toBe(10);
});

it('sets no twinkle animation on hero stars under reduced motion', () => {
  const { container } = render(<ConstellationResultShell packet={basePacket} reducedMotion={true} />);
  const stars = Array.from(
    container.querySelectorAll('.constellation-result-hero [style]'),
  ) as HTMLElement[];
  expect(stars.every((s) => s.style.animationDuration === '')).toBe(true);
});
```

Also update the existing `'tags all six anatomy plates in declared order'` test (now seven parts) — change its expected array to begin with `'hero-figure',`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/compose-constellation-result-shell.test.tsx`
Expected: FAIL — `.constellation-result-hero` not found; parts[0] is `masthead`.

- [ ] **Step 3: Implement `HeroFigure` and render it**

In `src/pages/Constellation/ConstellationResultShell.jsx`, extend the import (line 29):

```jsx
import { phonemeArc, plateRevealFor, heroFigure, twinkleFor, SPARK_PATH } from './skyChart.js';
```

Add the component just above `ComposedResultShell` (after `GenomeBody`):

```jsx
/* ─── The hero figure: the answer drawn as a living constellation ──────────
   Pure geometry from `heroFigure(packet)`; the seed touches only the lodestar
   and per-star twinkle. Gold is reserved for the single lodestar nucleus — every
   other star takes the rarity temperature color. Reduced motion drops twinkle. */
function HeroFigure({ packet, reducedMotion }) {
  const fig = heroFigure(packet);
  return (
    <svg
      className="constellation-result-hero"
      viewBox={fig.viewBox}
      role="img"
      aria-label={`Constellation of the answer — ${fig.nodes.length} stars, spectral class ${fig.spectralClass}${fig.degraded ? ', partial sky' : ''}`}
      data-degraded={String(fig.degraded)}
    >
      {fig.edges.map(([a, b]) => (
        <line
          key={`e${a}-${b}`}
          x1={fig.nodes[a].x} y1={fig.nodes[a].y}
          x2={fig.nodes[b].x} y2={fig.nodes[b].y}
          className="constellation-result-hero__edge"
        />
      ))}
      {fig.nodes.map((nd, i) => {
        const twinkle = reducedMotion
          ? undefined
          : (() => {
              const t = twinkleFor(fig.seed, i);
              return { animationDelay: `${t.delaySec}s`, animationDuration: `${t.durationSec}s` };
            })();
        if (nd.isLodestar) {
          return (
            <path
              key={nd.id}
              d={SPARK_PATH}
              transform={`translate(${nd.x} ${nd.y}) scale(${2.4 * nd.magnitude})`}
              className="constellation-result-hero__lodestar"
              style={twinkle}
            />
          );
        }
        if (nd.stressed || nd.isVowel) {
          return (
            <path
              key={nd.id}
              d={SPARK_PATH}
              transform={`translate(${nd.x} ${nd.y}) scale(${1.4 * nd.magnitude})`}
              className="constellation-result-hero__spark"
              style={{ ...twinkle, fill: nd.color }}
            />
          );
        }
        return (
          <circle
            key={nd.id}
            cx={nd.x} cy={nd.y} r={0.9 + nd.magnitude}
            className="constellation-result-hero__star"
            style={{ ...twinkle, fill: nd.color }}
          />
        );
      })}
    </svg>
  );
}
```

Inside `ComposedResultShell`, render the hero plate FIRST (immediately after the `{isDegraded ? … }` degraded banner, before the masthead `<section>`):

```jsx
      {/* ── Plate 0 · Hero figure: the answer as a living constellation ── */}
      <section
        className="constellation-result-plate constellation-result-plate--hero"
        data-compose-part="hero-figure"
        aria-label="Sound-bones constellation figure"
        style={nextReveal()}
      >
        <HeroFigure packet={packet} reducedMotion={reducedMotion} />
      </section>
```

- [ ] **Step 4: Run the shell tests to verify they pass**

Run: `npx vitest run tests/qa/features/compose-constellation-result-shell.test.tsx`
Expected: PASS (including the updated seven-part order and the fallback test — the hero figure only exists in the composed shell, so `PlainResultShell` still shows four sections).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Constellation/ConstellationResultShell.jsx tests/qa/features/compose-constellation-result-shell.test.tsx
git commit -m "feat(constellation): render the hero constellation figure atop the answer"
```

---

### Task 5: De-card the body — spine, star-anchors, breathing (CSS)

Dissolve the bordered plates into one constellation: remove plate borders/scrim, run a hairline spine down the left, swap the roman-numeral pill overline for a ✦ star-anchor, lift reading text with a soft text-shadow, and add seeded breathing to the gold "answer" moments — all reduced-motion gated. Style the hero figure's stars/lodestar/edges too.

**Files:**
- Modify: `src/pages/Constellation/ConstellationPage.css` (the composed-plate block, lines ~304-319 scrim, ~660-700 plate/overline, ~549-557 reduced-motion, plus new hero + spine rules)
- Modify: `src/pages/Constellation/ConstellationResultShell.jsx` (overline markup: the ✦ star-anchor glyph — CSS `::before` handles it, no JSX change needed unless the anchor needs an element; see Step 1)
- Test: `tests/qa/features/compose-constellation-result-shell.test.tsx` (one structural assertion)

**Interfaces:**
- Consumes: existing `--cos-*` variables and the `.constellation-result-plate__overline` structure.
- Produces: `.constellation-result-shell--composed` gains a left spine; `.constellation-result-plate--hero` sizing; hero star classes styled by the inline `fill` from Task 4; `.constellation-result-plate__overline::before` becomes a ✦ (not a roman numeral).

- [ ] **Step 1: Write the failing test**

Append to the `describe('composed answer plate', …)` block in `compose-constellation-result-shell.test.tsx`:

```tsx
it('anchors each section overline with a star, not a numbered pill', () => {
  // The de-carded body drops the roman-numeral counter; the ✦ anchor is CSS
  // ::before content, so we assert the class contract the CSS binds to exists
  // on every plate heading.
  const { container } = render(<ConstellationResultShell packet={basePacket} />);
  const overlines = container.querySelectorAll('.constellation-result-plate__overline');
  expect(overlines.length).toBeGreaterThanOrEqual(6);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/compose-constellation-result-shell.test.tsx -t "anchors each section overline"`
Expected: PASS on structure IF overlines already carry the class — if so, this test is a guard for the CSS contract and will pass immediately; proceed to the CSS regardless. (If it fails because count < 6, the hero plate has no overline by design; lower the threshold to match the number of headed plates — masthead, meaning, sound, genome, verdict, provenance = 6.)

- [ ] **Step 3: De-card the CSS**

In `src/pages/Constellation/ConstellationPage.css`:

(a) Remove the scrim on `.constellation-result-shell` (lines ~310-318) — replace the `background: linear-gradient(...)` with a soft text-lift instead:

```css
.constellation-result-shell {
  counter-reset: cos-sec;
  padding: 1.5rem;
  max-width: 48rem;
  margin: 0 auto;
  width: 100%;
  /* De-carded: no scrim panel. Reading text lifts off the star field with a soft
     per-line shadow instead of a surface. */
  text-shadow: 0 1px 10px rgba(5, 6, 15, 0.85), 0 0 2px rgba(5, 6, 15, 0.9);
}
```

(b) Drop the plate borders and add the left spine (replace the `.constellation-result-plate` + `+ .constellation-result-plate` rules ~671-672):

```css
.constellation-result-shell--composed { position: relative; }
/* One hairline spine wiring the star-anchors into a single figure. */
.constellation-result-shell--composed::before {
  content: '';
  position: absolute;
  left: 0.35rem; top: 1rem; bottom: 1rem;
  width: 1px;
  background: linear-gradient(180deg, transparent, var(--cos-hair) 12%, var(--cos-hair) 88%, transparent);
  pointer-events: none;
}
.constellation-result-plate { padding: 1.75rem 0 1.25rem; }
.constellation-result-plate + .constellation-result-plate { border-top: none; }
```

(c) Swap the roman-numeral pill for a ✦ star-anchor (replace `.constellation-result-plate__overline::before` ~690-700):

```css
.constellation-result-plate__overline::before {
  content: '✦';
  color: var(--cos-amethyst);
  font-size: 0.8rem;
  text-shadow: 0 0 8px rgba(139, 124, 255, 0.6);
  margin-left: -1.15rem; /* sit the anchor on the spine */
}
```

(d) Style the hero figure and its gold lodestar (add after the `.constellation-result-arc__spark` block ~756):

```css
.constellation-result-plate--hero { padding-top: 0.5rem; }
.constellation-result-hero {
  display: block;
  width: 100%;
  max-width: 34rem;
  height: 9rem;
  margin: 0.5rem auto 0.75rem;
}
.constellation-result-hero__edge {
  stroke: var(--cos-amethyst);
  stroke-opacity: 0.22;
  stroke-width: 0.25;
  stroke-linecap: round;
}
/* fill comes inline from the rarity temperature (Task 4). */
.constellation-result-hero__star { opacity: 0.9; }
.constellation-result-hero__spark { filter: drop-shadow(0 0 1.2px rgba(255, 255, 255, 0.5)); }
.constellation-result-hero__lodestar {
  fill: var(--cos-gold);
  filter: drop-shadow(0 0 2.5px rgba(232, 201, 106, 0.9));
}
/* Seeded breathing — opacity only (never transform: it would clobber SVG coords). */
.constellation-result-hero__star,
.constellation-result-hero__spark,
.constellation-result-hero__lodestar { animation: cos-twinkle var(--cos-harmonic) ease-in-out infinite; }
```

(e) Gate all the new motion under reduced motion (extend the block ~549-557):

```css
@media (prefers-reduced-motion: reduce) {
  .constellation-search--breathe .constellation-search__ring,
  .constellation-sky--animate .constellation-sky__star,
  .constellation-sky--animate .constellation-sky__nebula,
  .constellation-sky--animate .constellation-sky__dust,
  .constellation-stage--animate .constellation-result-shell--composed .constellation-result-plate,
  .constellation-result-hero__star,
  .constellation-result-hero__spark,
  .constellation-result-hero__lodestar { animation: none; }
}
```

- [ ] **Step 3b: Breathe the gold "answer" moments and the chips (spec: breathing body)**

The gold moments (verdict mark, seal glyph) pulse on a page-seeded phase; the chip
"star-field pills" twinkle on a deterministic `nth-child` stagger. Both are
reduced-motion gated by the block in (e).

In `ConstellationResultShell.jsx`, inside `ComposedResultShell`, derive the seed once
(near `const reveal = …`):

```jsx
  const heroSeed = fnv1a32(pageBytecode || 'COS-HERO-v1');
  const goldPulse = (i) =>
    reducedMotion ? undefined : { animationDelay: `${twinkleFor(heroSeed, i).delaySec}s` };
```

Add `fnv1a32` to the `skyChart.js` import line. Then give the verdict mark and seal
glyph a seeded pulse — change:

```jsx
            <span className="constellation-result-verdict-mark" aria-hidden="true" style={goldPulse(101)}>✦</span>
```
```jsx
          <span className="constellation-result-seal__glyph" aria-hidden="true" style={goldPulse(202)}>❖</span>
```

In `ConstellationPage.css`, add (after the hero rules in (d)):

```css
/* Gold answer moments breathe on a page-seeded phase (delay set inline). */
.constellation-result-verdict-mark,
.constellation-result-seal__glyph { animation: cos-twinkle var(--cos-harmonic) ease-in-out infinite; }
/* Chips become faint star-field pills that twinkle on a deterministic stagger. */
.constellation-result-chip { animation: cos-twinkle calc(var(--cos-harmonic) * 1.3) ease-in-out infinite; }
.constellation-result-chip:nth-child(3n) { animation-delay: 0.9s; }
.constellation-result-chip:nth-child(3n + 1) { animation-delay: 1.7s; }
```

Extend the reduced-motion block in (e) to also list
`.constellation-result-verdict-mark`, `.constellation-result-seal__glyph`, and
`.constellation-result-chip` in the `animation: none` group.

- [ ] **Step 4: Run the shell suite + verify headed**

Run: `npx vitest run tests/qa/features/compose-constellation-result-shell.test.tsx`
Expected: PASS.

Then verify the *look* headed (jsdom cannot: glow/fill-rate must be measured on a real GPU per the project's headed-measurement law). Run the dev server and screenshot the result plate on a cool Deck:

Run: `npm run dev` then load `http://localhost:5173` → ConstellationOS → submit a query → confirm: no card borders, a left spine with ✦ anchors, temperature-colored hero stars, a single gold lodestar, gentle twinkle. Toggle OS reduced-motion and confirm the field goes still.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Constellation/ConstellationPage.css tests/qa/features/compose-constellation-result-shell.test.tsx
git commit -m "feat(constellation): de-card the body — spine, star-anchors, breathing"
```

---

### Task 6: SCDL glyph + palette vocabulary (fixed vocabulary, vector consumption)

Author the *invariant* visual vocabulary as SCDL v1.1 and consume the compiled model's `fills`/`palette` as vectors, with `SPARK_PATH` staying the deterministic fallback. This is the design-language formalization; it is last because the figure is already fully working on `SPARK_PATH` — SCDL is an enhancement, not a dependency. If the team prefers, this task can be deferred to its own follow-up spec without blocking Phase 1's visible outcome.

**Files:**
- Create: `assets/scdl/cos-star.scdl` (the canonical 4-point star glyph)
- Create: `assets/scdl/cos-star.model.json` (compiled output, checked in)
- Modify: `src/pages/Constellation/skyChart.js` (export `HERO_STAR_FILLS` loaded from the compiled model, falling back to `SPARK_PATH`)
- Test: `tests/qa/features/constellation-hero-figure.test.js` (extend)

**Interfaces:**
- Consumes: `codex/core/pixelbrain/scdl/scdl.cli.js` (compile step, build-time only).
- Produces: `heroStarGlyph()` in `skyChart.js` returning `{ fills: Array<{ d: string, palette?: string }> } | null` (null → callers use `SPARK_PATH`). The compiled JSON is imported statically so no runtime SCDL parsing ships.

- [ ] **Step 1: Author the SCDL star glyph**

Create `assets/scdl/cos-star.scdl` — a 4-point star centered on the origin, in the SCDL idiom used by existing fixtures (model on the `void_acolyte`/fixtures conventions; see `codex/core/pixelbrain/scdl/fixtures/`). Keep it a single filled polygon so consumption is a clean `fills` read:

```
# cos-star — canonical 4-point constellation star (Living Answer vocabulary)
sprite cos-star 2x2
frame default
  polygon star4 points=(1,0)(1.28,0.72)(2,1)(1.28,1.28)(1,2)(0.72,1.28)(0,1)(0.72,0.72) fill=#eaf0ff
```

(Adjust syntax to whatever `node codex/core/pixelbrain/scdl/scdl.cli.js check assets/scdl/cos-star.scdl` accepts — see Step 2. Model humanoids/fixtures precedent lives in `generated-assets/*/**.scdl`.)

- [ ] **Step 2: Validate and compile the glyph**

Run: `node codex/core/pixelbrain/scdl/scdl.cli.js check assets/scdl/cos-star.scdl`
Expected: no diagnostics (fix grammar per any error codes until clean).

Run: `node codex/core/pixelbrain/scdl/scdl.cli.js compile assets/scdl/cos-star.scdl --export json --out assets/scdl/cos-star.model.json`
Expected: `[SCDL] Written: assets/scdl/cos-star.model.json`. Inspect it — confirm it contains a `fills` (SVG-path) array and a `palette`.

- [ ] **Step 3: Write the failing test**

Append to `tests/qa/features/constellation-hero-figure.test.js`:

```js
import { heroStarGlyph } from '../../../src/pages/Constellation/skyChart.js';

describe('heroStarGlyph — SCDL vector vocabulary with SPARK_PATH fallback', () => {
  it('exposes compiled SCDL fills as vector paths (or null to signal the fallback)', () => {
    const glyph = heroStarGlyph();
    if (glyph !== null) {
      expect(Array.isArray(glyph.fills)).toBe(true);
      expect(glyph.fills.length).toBeGreaterThan(0);
      expect(typeof glyph.fills[0].d).toBe('string'); // a real SVG path, not a raster blit
    } else {
      expect(glyph).toBeNull(); // callers fall back to SPARK_PATH
    }
  });
});
```

- [ ] **Step 4: Implement the loader with fallback**

Add to `src/pages/Constellation/skyChart.js`:

```js
import cosStarModel from '../../../assets/scdl/cos-star.model.json';

/**
 * The compiled SCDL star glyph as vector `fills`. SCDL owns the INVARIANT
 * vocabulary; per-query geometry stays formula-driven SVG. Returns null if the
 * compiled model is unavailable or shape-unexpected — callers then use SPARK_PATH,
 * the deterministic fallback (spec: "SPARK_PATH is the fallback").
 * @returns {{ fills: Array<{ d: string, palette?: string }> } | null}
 */
export function heroStarGlyph() {
  const fills = cosStarModel?.fills;
  if (!Array.isArray(fills) || fills.length === 0 || typeof fills[0]?.d !== 'string') return null;
  return { fills };
}
```

(If the vite JSON import path differs, adjust the relative path; the file is `assets/scdl/cos-star.model.json` at repo root.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/constellation-hero-figure.test.js`
Expected: PASS.

- [ ] **Step 6: Wire the glyph into HeroFigure (optional vector upgrade)**

In `ConstellationResultShell.jsx`, at the top of `HeroFigure`, resolve the glyph once and use its first fill path in place of `SPARK_PATH` when present:

```jsx
  const glyph = heroStarGlyph();
  const starPath = glyph?.fills?.[0]?.d ?? SPARK_PATH;
```

Then replace the two `d={SPARK_PATH}` occurrences in `HeroFigure` with `d={starPath}`. (Import `heroStarGlyph` alongside the other `skyChart.js` imports.) Re-run the shell suite — the star count and lodestar assertions are path-agnostic, so they stay green:

Run: `npx vitest run tests/qa/features/compose-constellation-result-shell.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add assets/scdl/cos-star.scdl assets/scdl/cos-star.model.json src/pages/Constellation/skyChart.js src/pages/Constellation/ConstellationResultShell.jsx tests/qa/features/constellation-hero-figure.test.js
git commit -m "feat(constellation): SCDL star vocabulary, consumed as vector fills"
```

---

## Final verification

- [ ] Run the whole Constellation feature slice: `npx vitest run tests/qa/features/constellation-hero-figure.test.js tests/qa/features/compose-constellation-result-packet.test.ts tests/qa/features/compose-constellation-result-shell.test.tsx` — all green.
- [ ] Run the SCD64 fossil self-check: `npm run scd64:intellisense` — no new fossils.
- [ ] Headed screenshot pass on a cool Deck (`DISPLAY=:0`, localhost:5173) confirming: living constellation hero, de-carded spine + ✦ anchors, temperature stars, single gold lodestar, gentle seeded twinkle, and a fully still field under reduced motion.
- [ ] Confirm the plain fallback is untouched: force the scene invalid (the existing fallback test) and confirm four plain sections with no hero figure.

## Notes for the executor

- **Do not** commit unless the branch owner asks (repo convention: commits are explicit). The `git commit` steps above are the intended sequence; run them only if commits are wanted in this session — otherwise stage and leave for review.
- The working tree already carries in-progress heteronym work (`packets.ts`, `ConstellationPage.*`, `skyChart.js`, `ConstellationResultShell.jsx`, and untracked test files). Rebase your edits on top; do not revert those changes.
- Phase 2 (three.js parallax) and Phase 3 (WASM figure kernel) are explicitly out of scope and get their own spec → plan cycles.
