# Blender Synthesis Bridge — Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Companion document:** `docs/superpowers/specs/2026-07-30-blender-synthesis-bridge-design.md`.
Read it first. It carries the reasoning and the measurements; this plan carries the steps.

**Goal:** Land one PixelBrain `.pbrain` asset in Blender as a native attribute
field, render it twice to an identical pixel receipt, and mint a `RENDER`-domain
SCD64 checksum that reports `REPRODUCED`.

**Architecture:** Blender is the **Synthesis Engine** — authority over light,
motion and volume, nothing else. PixelBrain remains the single producer of asset
truth. A JS-side bridge projects packets onto a Python-safe wire; a Blender addon
decodes, verifies the seal by string equality, applies to `bpy`, and emits a raw
claim plus a metadata-free pixel dump. **The JS side does all hashing.** This
mirrors `PolarisOS/packages/defold-bridge` exactly; read that package before
starting.

**Tech Stack:** Node 20 ESM (`.js`, no build step, matching `codex/core/pixelbrain/`),
Vitest 4, Blender 5.2.0 LTS embedded Python 3.13.13, numpy 2.3.4.

---

## Global Constraints

Copied verbatim from the spec. Every task's requirements implicitly include these.

- **Blender binary is `~/opt/blender/blender`.** Native linux-x64 5.2.0 LTS, build
  hash `fbe6228777e7`. Never use the Steam `blender.exe` (Windows/Proton).
- **Always pass `--factory-startup`** to Blender so behaviour never depends on
  user prefs or installed addons.
- **The consumer never computes a hash and never mints a receipt.** Python
  decodes, verifies, applies, and reports raw strings. All hashing is JS-side.
- **Quantized integers are canonical.** Never send float64 as truth. Every wire
  numeric is an int32 with a declared scale. The float in `bpy` is derived.
- **Every wire numeric must fit int32.** ID custom properties raise
  `OverflowError` at `2**31`.
- **No nulls anywhere in the wire.** `None` on an RNA property raises `TypeError`.
  Nullable strings become `""`.
- **Names carry no identity.** `bpy.data.*.new("x")` twice yields `x`, `x.001`
  silently. Packet IDs live in ID custom properties; lookup is by custom
  property, never `.name`.
- **Never validate an enum by enumerating RNA.** `view_transform` reports only
  `['NONE']` from RNA while the live value is `AgX`. Validate against a pinned
  allowlist in JS.
- **Never probe capability with `hasattr` on `bpy.ops`.** It always returns
  `True`. Use `dir()` or `get_rna_type()`.
- **Colour policy is declared per wire.** `EXACT` ⇒
  `view_settings.view_transform = 'Standard'`, `look = 'None'`, images
  `Non-Color`. `SYNTHESIZED` ⇒ `AgX` permitted. Mixing both in one output is
  refused, not resolved.
- **Determinism checksums are taken over a raw float32 pixel dump, never over an
  image file.** EXR headers contain a wall-clock timestamp and a render-duration
  string; a file hash fails 100% of the time.
- **Cycles settings for any determinism-checked render:** `device='CPU'`,
  `use_animated_seed=False`, explicit `seed`, `threads_mode='FIXED'`. Only a CPU
  device exists on this machine (`CUEW initialization failed`).
- **Test command:** `npx vitest run <path>` for JS. Python is tested by invoking
  Blender headless (Task 3 builds that harness).
- **Commit after every task.** Never `git add -A` — this repository always has a
  dirty tree. Stage only the paths named in the task.

### Decisions taken to unblock work

The spec left three questions open. These defaults are chosen so implementation
is not blocked; the repository owner may override any of them.

1. **Bridge location: `codex/core/blender-bridge/`**, `.js` ESM, no build step —
   matching `codex/core/pixelbrain/`, which owns the packets it consumes. Tests
   at `tests/codex/core/blender-bridge/`. Addon at
   `blender/addons/scholomance_pixelbrain/`.
2. **Energy bindings stay strict.** No implicit energy→shader mapping, including
   `PHOTONIC`. Task 6 ships exactly one *declared* binding as the worked pattern.
3. **`SYNTH_CLASS` and `COLOR_LAW` are independent axes**, as specified.
   `SYNTH_CLASS` is the verification-rule axis (`RASTER | SYNTHESIZED | VOLUME |
   SIMULATED`); colour policy lives in `COLOR_LAW`.

---

## File Structure

| File | Responsibility |
|---|---|
| `codex/core/blender-bridge/quantize.js` | int32 quantization with declared scales; the numeric law |
| `codex/core/blender-bridge/intern.js` | string→int interning for categorical fields |
| `codex/core/blender-bridge/wire.js` | `.pbrain` → Python-safe wire projection |
| `codex/core/blender-bridge/render-scd64.js` | `RENDER` slot aliases, canonical derivations, verdict lattice |
| `codex/core/blender-bridge/receipt.js` | parse addon claim → mint receipt → compare |
| `codex/core/blender-bridge/energy-bindings.js` | declared, graded energy→shader bindings registry |
| `codex/core/blender-bridge/index.js` | public exports |
| `blender/addons/scholomance_pixelbrain/__init__.py` | addon registration |
| `blender/addons/scholomance_pixelbrain/packet.py` | decode wire, verify seal, error taxonomy |
| `blender/addons/scholomance_pixelbrain/ingest.py` | wire → point cloud + named attributes |
| `blender/addons/scholomance_pixelbrain/palette.py` | school palette node group |
| `blender/addons/scholomance_pixelbrain/render_claim.py` | configure render, dump float32 pixels, emit claim |
| `blender/addons/scholomance_pixelbrain/classify.py` | cold/warm path-dependence classifier |
| `scripts/blender-bridge-e2e.mjs` | end-to-end driver: wire → Blender → receipt → verdict |

---

## Task 1: Quantization and interning — the numeric law

**Files:**
- Create: `codex/core/blender-bridge/quantize.js`
- Create: `codex/core/blender-bridge/intern.js`
- Test: `tests/codex/core/blender-bridge/quantize.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `quantize(value, scale) -> number` (int32); `dequantize(int, scale) -> number`;
  `INT32_MAX = 2147483647`; `SCALES` frozen object; `QuantizeError`.
  `internTable(strings) -> { table: Record<string,number>, lookup(s) -> number }`.

- [ ] **Step 1: Write the failing test**

```js
/**
 * Quantization law: the integer IS the value. Blender RNA floats are float32,
 * so a float64 that crosses the boundary is a different number coming back.
 * Quantizing at the producer makes the float derived and never authoritative.
 */
import { describe, it, expect } from 'vitest';
import { quantize, dequantize, INT32_MAX, SCALES, QuantizeError } from '../../../../codex/core/blender-bridge/quantize.js';
import { internTable } from '../../../../codex/core/blender-bridge/intern.js';

describe('quantize', () => {
  it('rounds to an integer at the declared scale', () => {
    expect(quantize(0.14285714285714285, 1e6)).toBe(142857);
    expect(quantize(0.5, 1000)).toBe(500);
    expect(quantize(-0.25, 1000)).toBe(-250);
  });

  it('round-trips through float32 without drift because the int is truth', () => {
    const q = quantize(0.14285714285714285, 1e6);
    const asFloat32 = Math.fround(dequantize(q, 1e6));
    expect(quantize(asFloat32, 1e6)).toBe(q);
  });

  it('refuses values that would exceed int32', () => {
    expect(() => quantize(3000, 1e6)).toThrow(QuantizeError);
    expect(() => quantize(1, INT32_MAX + 1)).toThrow(QuantizeError);
  });

  it('refuses non-finite input rather than emitting a null', () => {
    expect(() => quantize(NaN, 1000)).toThrow(QuantizeError);
    expect(() => quantize(Infinity, 1000)).toThrow(QuantizeError);
  });

  it('publishes frozen per-field scales', () => {
    expect(Object.isFrozen(SCALES)).toBe(true);
    expect(SCALES.UNIT).toBe(1e6);
    expect(SCALES.PIXEL).toBe(1);
  });

  it('is deterministic across repeated calls', () => {
    const a = Array.from({ length: 50 }, () => quantize(0.1234567, 1e6));
    expect(new Set(a).size).toBe(1);
  });
});

describe('internTable', () => {
  it('assigns stable ids in sorted order, not insertion order', () => {
    const a = internTable(['hilt', 'blade', 'pommel']);
    const b = internTable(['pommel', 'blade', 'hilt']);
    expect(a.table).toEqual(b.table);
    expect(a.table.blade).toBe(0);
  });

  it('maps null and undefined to a reserved sentinel id', () => {
    const t = internTable(['blade', null]);
    expect(t.lookup(null)).toBe(-1);
    expect(t.lookup(undefined)).toBe(-1);
  });

  it('throws on an unknown string rather than inventing an id', () => {
    const t = internTable(['blade']);
    expect(() => t.lookup('unknown')).toThrow(/not interned/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codex/core/blender-bridge/quantize.test.js`
Expected: FAIL — cannot resolve `codex/core/blender-bridge/quantize.js`.

- [ ] **Step 3: Write minimal implementation**

`codex/core/blender-bridge/quantize.js`:

```js
/**
 * Quantization law for the Blender wire.
 *
 * Blender RNA float properties are C float32: assigning 0.1234567890123456789
 * to object.location[0] reads back 0.12345679104328156. Rather than treat that
 * as loss to be tolerated, the quantized integer is DEFINED as the canonical
 * value. The float in bpy is derived and never authoritative, so truncation
 * cannot cause a receipt to diverge.
 *
 * ID custom properties are int32: 2**31 raises OverflowError. Every wire
 * numeric must therefore fit.
 */

export const INT32_MAX = 2147483647;
export const INT32_MIN = -2147483648;

export class QuantizeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QuantizeError';
  }
}

/** Declared per-field scales. A field's scale is part of the wire contract. */
export const SCALES = Object.freeze({
  /** Normalized [0,1] fields: emphasis, energy value, contrast delta. */
  UNIT: 1e6,
  /** Integer grid coordinates. Already integral. */
  PIXEL: 1,
  /** Camera matrix and world-space transforms. */
  TRANSFORM: 1e5,
});

export function quantize(value, scale) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new QuantizeError(`value must be a finite number, got ${value}`);
  }
  if (!Number.isFinite(scale) || scale <= 0 || scale > INT32_MAX) {
    throw new QuantizeError(`scale must be a positive finite number <= INT32_MAX, got ${scale}`);
  }
  const q = Math.round(value * scale);
  if (q > INT32_MAX || q < INT32_MIN) {
    throw new QuantizeError(`quantized value ${q} exceeds int32 (value=${value}, scale=${scale})`);
  }
  return q;
}

export function dequantize(int, scale) {
  if (!Number.isInteger(int)) {
    throw new QuantizeError(`expected an integer, got ${int}`);
  }
  return int / scale;
}
```

`codex/core/blender-bridge/intern.js`:

```js
/**
 * String interning for categorical wire fields.
 *
 * ShaderNodeAttribute outputs only Color, Vector, Factor and Alpha — a shader
 * cannot read a STRING attribute, even though STRING attributes exist and
 * GeometryNodeInputNamedAttribute accepts them. Categorical PixelBrain fields
 * (partId, shading, motifRole, squareAmpClass, source) are therefore interned
 * to INT so the shader path can consume them.
 *
 * Ids are assigned in SORTED order so the table is a pure function of the value
 * set. Insertion-order ids would make the wire depend on packet traversal order
 * and break SCENE_GRAPH reproducibility.
 */

/** Reserved id for null / undefined / absent. Never collides with a real id. */
export const ABSENT_ID = -1;

export function internTable(values) {
  const distinct = [...new Set(values.filter((v) => v !== null && v !== undefined))]
    .map(String)
    .sort();

  const table = Object.create(null);
  distinct.forEach((s, i) => {
    table[s] = i;
  });

  return Object.freeze({
    table: Object.freeze({ ...table }),
    lookup(value) {
      if (value === null || value === undefined) return ABSENT_ID;
      const key = String(value);
      if (!(key in table)) {
        throw new Error(`"${key}" is not interned in this table`);
      }
      return table[key];
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/codex/core/blender-bridge/quantize.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add codex/core/blender-bridge/quantize.js codex/core/blender-bridge/intern.js tests/codex/core/blender-bridge/quantize.test.js
git commit -m "feat(blender-bridge): quantization law and categorical interning

The quantized integer is DEFINED as canonical rather than treated as lossy
transport. Blender RNA floats are float32, so a float64 crossing the boundary
returns a different number; making the int authoritative removes the drift by
construction. Ids are assigned in sorted order so the intern table does not
depend on packet traversal order."
```

---

## Task 2: The wire projection

**Files:**
- Create: `codex/core/blender-bridge/wire.js`
- Test: `tests/codex/core/blender-bridge/wire.test.js`

**Reference:** read `PolarisOS/packages/defold-bridge/src/wire.js` (or `.ts`) first.
This is the same shape with a different hazard set. Note that Blender does **not**
need the `*Count` fields Lua required — Python distinguishes `[]` from `{}`.

**Real packet to test against:** `output/holy_fire_claymore.pbrain` — 788
coordinates, canvas `{gridSize:1, height:112, width:64}`, checksum
`{algorithm:'FNV-1a-32', scope:'canonical JSON excluding this checksum object', value:'6DB23A1A'}`.
A coordinate looks like:

```json
{"color":"#DCB430","emphasis":0.14285714285714285,
 "energies":[{"type":2,"value":0.18469902801805357}],
 "isMotif":false,"isRim":true,"localContrastDelta":0.1748,"motifRole":null,
 "nx":0,"ny":0,"partId":"blade","preSquareColor":"#D4AF37","shading":"core",
 "slot":1,"snappedX":30,"snappedY":8,"source":"sketch",
 "squareAmp":"square-sharpness-contrast","squareAmpClass":"edge",
 "squareAmpIntensityRating":0.6517,"squareAmpMaterial":"source",
 "structuralEnergy":0.18469902801805357,"x":30,"y":8,"z":0}
```

**Interfaces:**
- Consumes: `quantize`, `SCALES` from Task 1; `internTable`, `ABSENT_ID` from Task 1.
- Produces: `toPythonWire(packet, { colorPolicy }) -> PythonWirePacket`;
  `serializeWirePacket(packet, opts) -> string`; `assertNoNulls(value, path?)`;
  `WireError`. Wire shape:
  `{ wireVersion: 1, packetId, kind, colorPolicy, canvas:{width,height,gridSize},
     scales:{...}, intern:{ partId:{}, shading:{}, motifRole:{}, squareAmpClass:{}, source:{} },
     attributes:{ name -> int32[] }, positions:{ x:int32[], y:int32[], z:int32[] },
     colors:{ color:int32[], preSquareColor:int32[] }, energy:{ '0'..'7' -> int32[] },
     coordinateCount, sourceChecksum, absentId }`
  The seal IS `sourceChecksum` (the packet's own `FNV-1a-32` value) — there is no
  separate `seal` field. Slice 1 has one producer and no server, so the packet
  checksum is the only integrity tag on the wire.

- [ ] **Step 1: Write the failing test**

```js
/**
 * Wire projection tests. The hazard set is Blender's, not Lua's:
 * no nulls (None on an RNA property raises TypeError), int32 only,
 * categoricals interned (shaders cannot read STRING attributes),
 * and colour policy declared rather than inferred.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { toPythonWire, serializeWirePacket, assertNoNulls, WireError } from '../../../../codex/core/blender-bridge/wire.js';

const packet = JSON.parse(readFileSync('output/holy_fire_claymore.pbrain', 'utf8'));

describe('toPythonWire', () => {
  it('projects every coordinate into parallel int32 attribute arrays', () => {
    const w = toPythonWire(packet, { colorPolicy: 'EXACT' });
    expect(w.coordinateCount).toBe(788);
    expect(w.positions.x).toHaveLength(788);
    expect(w.attributes.pb_emphasis).toHaveLength(788);
    expect(Number.isInteger(w.attributes.pb_emphasis[0])).toBe(true);
  });

  it('quantizes emphasis at the UNIT scale', () => {
    const w = toPythonWire(packet, { colorPolicy: 'EXACT' });
    expect(w.attributes.pb_emphasis[0]).toBe(142857);
    expect(w.scales.pb_emphasis).toBe(1e6);
  });

  it('interns partId to int and publishes the table', () => {
    const w = toPythonWire(packet, { colorPolicy: 'EXACT' });
    expect(typeof w.intern.partId.blade).toBe('number');
    expect(Number.isInteger(w.attributes.pb_part_id[0])).toBe(true);
  });

  it('maps a null categorical to ABSENT_ID rather than emitting null', () => {
    const w = toPythonWire(packet, { colorPolicy: 'EXACT' });
    expect(w.attributes.pb_motif_role).toContain(-1);
  });

  it('emits exactly eight energy channels, zero-filled where absent', () => {
    const w = toPythonWire(packet, { colorPolicy: 'EXACT' });
    expect(Object.keys(w.energy).sort()).toEqual(['0','1','2','3','4','5','6','7']);
    expect(w.energy['2'][0]).toBe(184699);
    expect(w.energy['7'].every((v) => v === 0)).toBe(true);
  });

  it('contains no nulls anywhere', () => {
    const w = toPythonWire(packet, { colorPolicy: 'EXACT' });
    expect(() => assertNoNulls(w)).not.toThrow();
  });

  it('carries the source checksum verbatim for string-equality verification', () => {
    const w = toPythonWire(packet, { colorPolicy: 'EXACT' });
    expect(w.sourceChecksum).toBe('6DB23A1A');
  });

  it('refuses an unknown colour policy instead of defaulting', () => {
    expect(() => toPythonWire(packet, { colorPolicy: 'PRETTY' })).toThrow(WireError);
    expect(() => toPythonWire(packet, {})).toThrow(WireError);
  });

  it('is deterministic — same packet yields byte-identical JSON', () => {
    const a = serializeWirePacket(packet, { colorPolicy: 'EXACT' });
    const b = serializeWirePacket(packet, { colorPolicy: 'EXACT' });
    expect(a).toBe(b);
  });
});

describe('assertNoNulls', () => {
  it('names the path of the offending null', () => {
    expect(() => assertNoNulls({ a: { b: [1, null] } })).toThrow(/\$\.a\.b\[1\]/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codex/core/blender-bridge/wire.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`codex/core/blender-bridge/wire.js`:

```js
/**
 * wire — .pbrain packet → Python-safe wire projection.
 *
 * The projection is not a no-op, and its rules differ from the Defold bridge's.
 * Blender/Python hazards:
 *   - None on an RNA property raises TypeError            -> no nulls
 *   - RNA floats are float32                              -> int32 + declared scale
 *   - ShaderNodeAttribute cannot read STRING attributes   -> categoricals interned
 *   - datablock names silently collide-rename             -> ids in custom props
 *   - view_transform enum is dynamic (RNA says ['NONE'])  -> pinned allowlist here
 *
 * Blender does NOT need Lua's *Count fields: Python distinguishes [] from {}.
 */

import { quantize, SCALES } from './quantize.js';
import { internTable, ABSENT_ID } from './intern.js';

export class WireError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WireError';
  }
}

export const WIRE_VERSION = 1;
export const COLOR_POLICIES = Object.freeze(['EXACT', 'SYNTHESIZED']);
export const ENERGY_CHANNELS = 8;

/** Scalar coordinate fields carried as quantized attributes. */
const SCALAR_FIELDS = Object.freeze({
  pb_emphasis: { key: 'emphasis', scale: SCALES.UNIT },
  pb_local_contrast_delta: { key: 'localContrastDelta', scale: SCALES.UNIT },
  pb_square_amp_intensity: { key: 'squareAmpIntensityRating', scale: SCALES.UNIT },
  pb_structural_energy: { key: 'structuralEnergy', scale: SCALES.UNIT },
  pb_slot: { key: 'slot', scale: SCALES.PIXEL },
  pb_nx: { key: 'nx', scale: SCALES.UNIT },
  pb_ny: { key: 'ny', scale: SCALES.UNIT },
});

/** Boolean coordinate fields carried as 0/1. */
const BOOL_FIELDS = Object.freeze({
  pb_is_rim: 'isRim',
  pb_is_motif: 'isMotif',
});

/** Categorical fields interned to int. */
const CATEGORICAL_FIELDS = Object.freeze({
  pb_part_id: 'partId',
  pb_shading: 'shading',
  pb_motif_role: 'motifRole',
  pb_square_amp_class: 'squareAmpClass',
  pb_source: 'source',
});

function hexToInt(hex) {
  if (typeof hex !== 'string') return 0;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  return parseInt(m[1], 16);
}

export function toPythonWire(packet, options = {}) {
  const { colorPolicy } = options;
  if (!COLOR_POLICIES.includes(colorPolicy)) {
    throw new WireError(
      `colorPolicy must be one of ${COLOR_POLICIES.join(' | ')}, got ${JSON.stringify(colorPolicy)}`,
    );
  }
  const coords = packet.coordinates;
  if (!Array.isArray(coords) || coords.length === 0) {
    throw new WireError('packet.coordinates must be a non-empty array');
  }

  const intern = {};
  for (const [attr, key] of Object.entries(CATEGORICAL_FIELDS)) {
    intern[key] = internTable(coords.map((c) => c[key]));
  }

  const attributes = {};
  const scales = {};

  for (const [attr, { key, scale }] of Object.entries(SCALAR_FIELDS)) {
    attributes[attr] = coords.map((c) => quantize(Number(c[key] ?? 0), scale));
    scales[attr] = scale;
  }
  for (const [attr, key] of Object.entries(BOOL_FIELDS)) {
    attributes[attr] = coords.map((c) => (c[key] ? 1 : 0));
    scales[attr] = SCALES.PIXEL;
  }
  for (const [attr, key] of Object.entries(CATEGORICAL_FIELDS)) {
    attributes[attr] = coords.map((c) => intern[key].lookup(c[key]));
    scales[attr] = SCALES.PIXEL;
  }

  const energy = {};
  for (let t = 0; t < ENERGY_CHANNELS; t += 1) {
    energy[String(t)] = coords.map((c) => {
      const hit = (c.energies ?? []).find((e) => e.type === t);
      return quantize(hit ? Number(hit.value) : 0, SCALES.UNIT);
    });
  }

  const wire = {
    wireVersion: WIRE_VERSION,
    packetId: String(packet.bytecode ?? ''),
    kind: String(packet.kind ?? ''),
    colorPolicy,
    canvas: {
      width: packet.canvas.width,
      height: packet.canvas.height,
      gridSize: packet.canvas.gridSize,
    },
    coordinateCount: coords.length,
    scales,
    intern: Object.fromEntries(Object.entries(intern).map(([k, v]) => [k, v.table])),
    positions: {
      x: coords.map((c) => quantize(Number(c.x), SCALES.PIXEL)),
      y: coords.map((c) => quantize(Number(c.y), SCALES.PIXEL)),
      z: coords.map((c) => quantize(Number(c.z ?? 0), SCALES.PIXEL)),
    },
    colors: {
      color: coords.map((c) => hexToInt(c.color)),
      preSquareColor: coords.map((c) => hexToInt(c.preSquareColor)),
    },
    energy,
    sourceChecksum: String(packet.checksum?.value ?? ''),
    absentId: ABSENT_ID,
  };

  assertNoNulls(wire);
  return wire;
}

export function serializeWirePacket(packet, options) {
  return JSON.stringify(toPythonWire(packet, options));
}

export function assertNoNulls(value, path = '$') {
  if (value === null || value === undefined) {
    throw new WireError(`Null found at ${path} — None on an RNA property raises TypeError`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoNulls(item, `${path}[${i}]`));
  } else if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) assertNoNulls(v, `${path}.${k}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/codex/core/blender-bridge/wire.test.js`
Expected: PASS, 10 tests. If `pb_emphasis[0]` is not `142857`, the first
coordinate's `emphasis` is not `1/7` — print `packet.coordinates[0].emphasis` and
correct the expected value rather than the implementation.

- [ ] **Step 5: Commit**

```bash
git add codex/core/blender-bridge/wire.js tests/codex/core/blender-bridge/wire.test.js
git commit -m "feat(blender-bridge): Python-safe wire projection

Derived from Blender's hazard set rather than copied from toLuaWire. Drops the
*Count fields Lua needed (Python distinguishes [] from {}), keeps no-nulls for a
different reason (None on an RNA property raises TypeError), and adds int32
quantization plus categorical interning because ShaderNodeAttribute cannot read
STRING attributes."
```

---

## Task 3: Blender test harness and packet decode

**Files:**
- Create: `blender/addons/scholomance_pixelbrain/__init__.py`
- Create: `blender/addons/scholomance_pixelbrain/packet.py`
- Create: `blender/tests/test_packet.py`
- Create: `scripts/blender-test.sh`

**Interfaces:**
- Consumes: the wire JSON produced by Task 2.
- Produces: `decode_wire(text) -> dict`; `verify_seal(wire, expected) -> bool`;
  `PacketError`; `WIRE_VERSION = 1`. Shell harness
  `scripts/blender-test.sh <test_file.py>` exits non-zero on failure.

- [ ] **Step 1: Write the failing test**

`blender/tests/test_packet.py`:

```python
"""
Packet decode tests. Run headless via scripts/blender-test.sh.

The consumer NEVER computes a hash. verify_seal compares strings and nothing
else. This is not style: RNA float properties are float32, so a value that has
passed through bpy cannot be rehashed to agreement with the producer.
"""
import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "addons"))

from scholomance_pixelbrain.packet import decode_wire, verify_seal, PacketError, WIRE_VERSION

FAILURES = []

def check(name, fn):
    try:
        fn()
        print(f"  ok    {name}")
    except AssertionError as e:
        FAILURES.append(name); print(f"  FAIL  {name}: {e}")
    except Exception as e:
        FAILURES.append(name); print(f"  ERROR {name}: {type(e).__name__}: {e}")

def _wire(**over):
    w = {"wireVersion": 1, "packetId": "WP", "kind": "k", "colorPolicy": "EXACT",
         "canvas": {"width": 2, "height": 2, "gridSize": 1}, "coordinateCount": 1,
         "scales": {"pb_emphasis": 1000000}, "intern": {"partId": {"blade": 0}},
         "positions": {"x": [0], "y": [0], "z": [0]},
         "colors": {"color": [0], "preSquareColor": [0]},
         "attributes": {"pb_emphasis": [142857]},
         "energy": {str(i): [0] for i in range(8)},
         "sourceChecksum": "6DB23A1A", "absentId": -1}
    w.update(over); return w

def t_decodes():
    w = decode_wire(json.dumps(_wire()))
    assert w["coordinateCount"] == 1, w["coordinateCount"]

def t_rejects_version():
    try:
        decode_wire(json.dumps(_wire(wireVersion=99))); assert False, "should refuse"
    except PacketError: pass

def t_rejects_null():
    try:
        decode_wire(json.dumps(_wire(packetId=None))); assert False, "should refuse"
    except PacketError: pass

def t_rejects_length_mismatch():
    try:
        decode_wire(json.dumps(_wire(coordinateCount=5))); assert False, "should refuse"
    except PacketError: pass

def t_seal_equality_only():
    w = decode_wire(json.dumps(_wire()))
    assert verify_seal(w, "6DB23A1A") is True
    assert verify_seal(w, "DEADBEEF") is False

def t_bpy_available():
    import bpy
    assert bpy.app.version[:2] == (5, 2), bpy.app.version

for n, f in list(globals().items()):
    if n.startswith("t_"): check(n[2:], f)

print(f"\n{len(FAILURES)} failure(s)")
sys.exit(1 if FAILURES else 0)
```

`scripts/blender-test.sh`:

```bash
#!/usr/bin/env bash
# Run a Python test file inside Blender headless.
# --factory-startup is mandatory: it stops behaviour depending on user prefs.
set -euo pipefail
BLENDER="${BLENDER:-$HOME/opt/blender/blender}"
TEST_FILE="$1"
"$BLENDER" -b --factory-startup --python "$TEST_FILE" -- "${@:2}"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
chmod +x scripts/blender-test.sh
./scripts/blender-test.sh blender/tests/test_packet.py
```
Expected: FAIL — `ModuleNotFoundError: No module named 'scholomance_pixelbrain'`.

- [ ] **Step 3: Write minimal implementation**

`blender/addons/scholomance_pixelbrain/__init__.py`:

```python
"""
Scholomance PixelBrain — Blender addon (Synthesis Engine consumer).

This addon is a CONSUMER. It never computes a hash, never mints a receipt, and
never re-derives asset truth. It decodes a sealed wire packet, verifies the seal
by string equality, applies it to bpy, and reports a raw claim.

That is not a stylistic choice. Blender RNA float properties are C float32:
assigning 0.1234567890123456789 to object.location[0] reads back
0.12345679104328156. A value that has passed through bpy cannot be rehashed to
agreement with the producer. ID custom properties are the documented exception
(float64-exact) and are where the seal and the quantization scales ride —
carried, never computed.
"""

bl_info = {
    "name": "Scholomance PixelBrain",
    "author": "Scholomance",
    "version": (0, 1, 0),
    "blender": (5, 2, 0),
    "location": "View3D > Sidebar > Scholomance",
    "description": "PixelBrain synthesis bridge — consumes sealed wire packets",
    "category": "Import-Export",
}


def register():
    pass


def unregister():
    pass
```

`blender/addons/scholomance_pixelbrain/packet.py`:

```python
"""Wire decode and seal verification. No hashing happens in this file, ever."""

import json

WIRE_VERSION = 1
COLOR_POLICIES = ("EXACT", "SYNTHESIZED")
ENERGY_CHANNELS = 8

_REQUIRED = (
    "wireVersion", "packetId", "kind", "colorPolicy", "canvas", "coordinateCount",
    "scales", "intern", "positions", "colors", "attributes", "energy",
    "sourceChecksum", "absentId",
)


class PacketError(Exception):
    """Raised on any malformed wire. Never best-effort, never partial."""


def _assert_no_none(value, path="$"):
    if value is None:
        raise PacketError(f"null at {path}: None on an RNA property raises TypeError")
    if isinstance(value, list):
        for i, v in enumerate(value):
            _assert_no_none(v, f"{path}[{i}]")
    elif isinstance(value, dict):
        for k, v in value.items():
            _assert_no_none(v, f"{path}.{k}")


def decode_wire(text):
    try:
        wire = json.loads(text)
    except (ValueError, TypeError) as exc:
        raise PacketError(f"wire is not valid JSON: {exc}") from exc

    if not isinstance(wire, dict):
        raise PacketError(f"wire must be an object, got {type(wire).__name__}")

    missing = [k for k in _REQUIRED if k not in wire]
    if missing:
        raise PacketError(f"wire missing required keys: {', '.join(missing)}")

    if wire["wireVersion"] != WIRE_VERSION:
        raise PacketError(
            f"wireVersion {wire['wireVersion']} != supported {WIRE_VERSION}"
        )

    if wire["colorPolicy"] not in COLOR_POLICIES:
        raise PacketError(f"unknown colorPolicy {wire['colorPolicy']!r}")

    _assert_no_none(wire)

    n = wire["coordinateCount"]
    if not isinstance(n, int) or n <= 0:
        raise PacketError(f"coordinateCount must be a positive int, got {n!r}")

    for group in ("positions", "colors", "attributes", "energy"):
        for name, arr in wire[group].items():
            if len(arr) != n:
                raise PacketError(
                    f"{group}.{name} has {len(arr)} values, expected {n}"
                )
            for v in arr:
                if not isinstance(v, int) or isinstance(v, bool):
                    raise PacketError(
                        f"{group}.{name} must contain int32 only, found {type(v).__name__}"
                    )

    if sorted(wire["energy"].keys()) != [str(i) for i in range(ENERGY_CHANNELS)]:
        raise PacketError("energy must carry exactly channels 0..7")

    return wire


def verify_seal(wire, expected):
    """String equality and nothing else. See the module docstring in __init__."""
    return wire.get("sourceChecksum") == expected
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/blender-test.sh blender/tests/test_packet.py`
Expected: `0 failure(s)`, exit 0, 6 checks ok.

- [ ] **Step 5: Commit**

```bash
git add blender/addons/scholomance_pixelbrain/__init__.py blender/addons/scholomance_pixelbrain/packet.py blender/tests/test_packet.py scripts/blender-test.sh
git commit -m "feat(blender-bridge): addon skeleton, wire decode, headless test harness

The addon is a consumer: decode, verify the seal by string equality, apply,
report. It never hashes. RNA floats are float32, so a value that has passed
through bpy cannot be rehashed to agreement with the producer."
```

---

## Task 4: Attribute-first ingest

**Files:**
- Create: `blender/addons/scholomance_pixelbrain/ingest.py`
- Create: `blender/tests/test_ingest.py`

**Interfaces:**
- Consumes: `decode_wire` from Task 3.
- Produces: `ingest_wire(wire) -> bpy.types.Object` — a point cloud whose
  `attributes` carry every wire attribute, with `intern`, `scales`, `packetId`
  and `sourceChecksum` stored as ID custom properties.
  `find_by_packet_id(packet_id) -> Object | None`.

**Why point cloud, not mesh:** the packet is a set of coordinates with per-point
semantics. A `PointCloud` datablock carries POINT-domain attributes without
inventing topology the packet does not describe.

- [ ] **Step 1: Write the failing test**

`blender/tests/test_ingest.py`:

```python
"""
Ingest tests. Proves the semantic record crosses as a Blender attribute FIELD,
and that identity survives a name collision.
"""
import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "addons"))
import bpy
from scholomance_pixelbrain.packet import decode_wire
from scholomance_pixelbrain.ingest import ingest_wire, find_by_packet_id

FAILURES = []

def check(name, fn):
    try:
        fn(); print(f"  ok    {name}")
    except AssertionError as e:
        FAILURES.append(name); print(f"  FAIL  {name}: {e}")
    except Exception as e:
        FAILURES.append(name); print(f"  ERROR {name}: {type(e).__name__}: {e}")

WIRE = json.dumps({
    "wireVersion": 1, "packetId": "WP-CLAYMORE-HOLY", "kind": "k",
    "colorPolicy": "EXACT", "canvas": {"width": 64, "height": 112, "gridSize": 1},
    "coordinateCount": 3, "scales": {"pb_emphasis": 1000000},
    "intern": {"partId": {"blade": 0, "hilt": 1}},
    "positions": {"x": [0, 1, 2], "y": [0, 1, 2], "z": [0, 0, 0]},
    "colors": {"color": [14464560, 0, 0], "preSquareColor": [0, 0, 0]},
    "attributes": {"pb_emphasis": [142857, 0, 0], "pb_part_id": [0, 1, -1]},
    "energy": {str(i): [0, 0, 0] for i in range(8)},
    "sourceChecksum": "6DB23A1A", "absentId": -1,
})

def t_creates_pointcloud_with_positions():
    obj = ingest_wire(decode_wire(WIRE))
    assert len(obj.data.attributes["position"].data) == 3

def t_carries_named_attributes_as_int():
    obj = ingest_wire(decode_wire(WIRE))
    a = obj.data.attributes["pb_emphasis"]
    assert a.data_type == "INT", a.data_type
    vals = [d.value for d in a.data]
    assert vals[0] == 142857, vals

def t_carries_all_eight_energy_channels():
    obj = ingest_wire(decode_wire(WIRE))
    for i in range(8):
        assert f"pb_energy_{i}" in obj.data.attributes, i

def t_scales_survive_as_float64_custom_props():
    obj = ingest_wire(decode_wire(WIRE))
    assert obj["pb_scales"]["pb_emphasis"] == 1000000

def t_identity_survives_name_collision():
    a = ingest_wire(decode_wire(WIRE))
    b = ingest_wire(decode_wire(WIRE))
    assert a.name != b.name, "Blender should have collide-renamed the second"
    assert a["pb_packet_id"] == b["pb_packet_id"] == "WP-CLAYMORE-HOLY"

def t_lookup_is_by_custom_property_not_name():
    ingest_wire(decode_wire(WIRE))
    found = find_by_packet_id("WP-CLAYMORE-HOLY")
    assert found is not None and found["pb_packet_id"] == "WP-CLAYMORE-HOLY"

for n, f in list(globals().items()):
    if n.startswith("t_"): check(n[2:], f)
print(f"\n{len(FAILURES)} failure(s)")
sys.exit(1 if FAILURES else 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/blender-test.sh blender/tests/test_ingest.py`
Expected: FAIL — `No module named 'scholomance_pixelbrain.ingest'`.

- [ ] **Step 3: Write minimal implementation**

`blender/addons/scholomance_pixelbrain/ingest.py`:

```python
"""
Attribute-first ingest.

A .pbrain coordinate is a 24-field semantic record, not a pixel. The
correspondence worth building is therefore "per-coordinate semantic record <->
Blender attribute field": both are a named value per domain element, and
Geometry Nodes is a field-processing engine. Every PixelBrain semantic becomes a
first-class Blender field that GN and shaders can read.

Identity does NOT live in the datablock name: bpy.data.*.new("x") twice yields
"x" and "x.001" silently. Packet ids live in ID custom properties, which also
preserve float64 exactly and so safely carry the scales and the seal.
"""

import bpy

PACKET_ID_KEY = "pb_packet_id"
CHECKSUM_KEY = "pb_source_checksum"
SCALES_KEY = "pb_scales"
INTERN_KEY = "pb_intern"
POLICY_KEY = "pb_color_policy"


def ingest_wire(wire):
    n = wire["coordinateCount"]
    pc = bpy.data.pointclouds.new(f"pb_{wire['packetId']}")
    pc.points.add(n)

    xs, ys, zs = wire["positions"]["x"], wire["positions"]["y"], wire["positions"]["z"]
    flat = []
    for i in range(n):
        flat.extend((float(xs[i]), float(ys[i]), float(zs[i])))
    pc.attributes["position"].data.foreach_set("vector", flat)

    for name, values in wire["attributes"].items():
        attr = pc.attributes.new(name=name, type="INT", domain="POINT")
        attr.data.foreach_set("value", list(values))

    for channel, values in wire["energy"].items():
        attr = pc.attributes.new(name=f"pb_energy_{channel}", type="INT", domain="POINT")
        attr.data.foreach_set("value", list(values))

    for name, values in wire["colors"].items():
        attr = pc.attributes.new(name=f"pb_color_{name}", type="INT", domain="POINT")
        attr.data.foreach_set("value", list(values))

    obj = bpy.data.objects.new(f"pb_{wire['packetId']}", pc)
    bpy.context.scene.collection.objects.link(obj)

    # Custom properties: float64-exact and int32-capped. Carried, never computed.
    obj[PACKET_ID_KEY] = wire["packetId"]
    obj[CHECKSUM_KEY] = wire["sourceChecksum"]
    obj[POLICY_KEY] = wire["colorPolicy"]
    obj[SCALES_KEY] = dict(wire["scales"])
    obj[INTERN_KEY] = {k: dict(v) for k, v in wire["intern"].items()}
    return obj


def find_by_packet_id(packet_id):
    """Lookup by custom property. Never by .name — names silently drift."""
    for obj in bpy.data.objects:
        if obj.get(PACKET_ID_KEY) == packet_id:
            return obj
    return None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/blender-test.sh blender/tests/test_ingest.py`
Expected: `0 failure(s)`, 6 checks ok.

If `bpy.data.pointclouds` does not exist in 5.2, discover the correct collection
with:
`~/opt/blender/blender -b --factory-startup --python-expr "import bpy; print([a for a in dir(bpy.data) if 'point' in a or 'cloud' in a])"`
and use what it prints. Do **not** silently fall back to a mesh — that would
invent topology the packet does not describe. Record whatever you find in the
module docstring.

- [ ] **Step 5: Commit**

```bash
git add blender/addons/scholomance_pixelbrain/ingest.py blender/tests/test_ingest.py
git commit -m "feat(blender-bridge): attribute-first ingest of .pbrain coordinates

A coordinate is a 24-field semantic record, not a pixel, so it crosses as a
Blender attribute field — the same shape Geometry Nodes already processes.
Identity lives in ID custom properties because datablock names collide-rename
silently."
```

---

## Task 5: RENDER SCD64 domain and the verdict lattice

**Files:**
- Create: `codex/core/blender-bridge/render-scd64.js`
- Test: `tests/codex/core/blender-bridge/render-scd64.test.js`

**Reference:** `src/core/scd64/constants.ts` (slot names, `ART_SLOT_ALIASES`,
`SCD64_REGEX`), `src/core/scd64/compareSCD64.ts`, `src/core/scd64/parseSCD64.ts`.
SCD64 is **8 slots × 8 hex chars = 64 chars**, each slot
`sha256(its own disjoint canonical string).slice(0,8)` uppercased. Slot 0 takes a
2-char version byte prefix plus 6 hex.

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `RENDER_SLOT_ALIASES`; `buildRenderCanonicals(inputs) -> {slot, canonical}[]`;
  `renderSCD64(inputs) -> string` (64 uppercase hex);
  `classifyDivergence(a, b) -> { verdict, differentBlocks, relationship }`
  with `verdict` in `REPRODUCED | NONDETERMINISTIC | RESYNTHESIZED | INERT | UNRELATED`;
  `SYNTH_CLASSES = ['RASTER','SYNTHESIZED','VOLUME','SIMULATED']`.

- [ ] **Step 1: Write the failing test**

```js
/**
 * RENDER domain over the preserved eight-slot SCD64 contract.
 *
 * Seven slots are CAUSES, the eighth (PIXEL_RECEIPT) is the EFFECT. That
 * asymmetry is what turns a comparison into a diagnosis.
 */
import { describe, it, expect } from 'vitest';
import {
  RENDER_SLOT_ALIASES, renderSCD64, classifyDivergence, SYNTH_CLASSES,
} from '../../../../codex/core/blender-bridge/render-scd64.js';

const base = {
  synthClass: 'RASTER', versionByte: '02',
  frame: { width: 160, height: 160, pixelAspect: 1, frameIndex: 1, cameraMatrix: [1,0,0,0] },
  engine: { blenderVersion: '5.2.0', buildHash: 'fbe6228777e7', engine: 'CYCLES', device: 'CPU' },
  light: { seed: 7, samples: 64, adaptive: false, adaptiveThreshold: 0, bounces: 12, clamp: 0, shutterOpen: 0, shutterClose: 0, timeSamples: 1 },
  denoise: { enabled: false, denoiser: 'NONE', inputPasses: 'NONE' },
  color: { viewTransform: 'Standard', look: 'None', display: 'sRGB', format: 'OPEN_EXR', depth: '32' },
  scene: { graphHash: 'abc123', seeds: [], packetSeals: ['6DB23A1A'] },
  pixelReceipt: 'f532f7533c562315',
};

describe('renderSCD64', () => {
  it('preserves the eight-slot wire contract', () => {
    expect(Object.keys(RENDER_SLOT_ALIASES)).toHaveLength(8);
    expect(RENDER_SLOT_ALIASES.BUGCLASS).toBe('SYNTH_CLASS');
    expect(RENDER_SLOT_ALIASES.VERDICT).toBe('PIXEL_RECEIPT');
  });

  it('emits 64 uppercase hex characters', () => {
    expect(renderSCD64(base)).toMatch(/^[0-9A-F]{64}$/);
  });

  it('is deterministic across 100 iterations', () => {
    const s = new Set(Array.from({ length: 100 }, () => renderSCD64(base)));
    expect(s.size).toBe(1);
  });

  it('slots are independent — changing one cause moves exactly one slot', () => {
    const a = renderSCD64(base);
    const b = renderSCD64({ ...base, light: { ...base.light, samples: 128 } });
    const blocks = (s) => s.match(/.{8}/g);
    const diff = blocks(a).filter((v, i) => v !== blocks(b)[i]);
    expect(diff).toHaveLength(1);
  });

  it('refuses an unknown synthClass rather than defaulting', () => {
    expect(() => renderSCD64({ ...base, synthClass: 'PRETTY' })).toThrow();
    expect(SYNTH_CLASSES).toContain('SIMULATED');
  });
});

describe('classifyDivergence', () => {
  it('REPRODUCED when nothing differs', () => {
    const a = renderSCD64(base);
    expect(classifyDivergence(a, a).verdict).toBe('REPRODUCED');
  });

  it('NONDETERMINISTIC when only PIXEL_RECEIPT differs', () => {
    const a = renderSCD64(base);
    const b = renderSCD64({ ...base, pixelReceipt: 'deadbeefdeadbeef' });
    const r = classifyDivergence(a, b);
    expect(r.verdict).toBe('NONDETERMINISTIC');
    expect(r.differentBlocks).toEqual(['PIXEL_RECEIPT']);
  });

  it('RESYNTHESIZED when a cause and the receipt both differ', () => {
    const a = renderSCD64(base);
    const b = renderSCD64({ ...base, light: { ...base.light, samples: 128 }, pixelReceipt: 'deadbeefdeadbeef' });
    const r = classifyDivergence(a, b);
    expect(r.verdict).toBe('RESYNTHESIZED');
    expect(r.differentBlocks).toContain('LIGHT_BUDGET');
  });

  it('INERT when a cause differs but the receipt does not', () => {
    const a = renderSCD64(base);
    const b = renderSCD64({ ...base, light: { ...base.light, adaptive: true } });
    const r = classifyDivergence(a, b);
    expect(r.verdict).toBe('INERT');
    expect(r.differentBlocks).toEqual(['LIGHT_BUDGET']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codex/core/blender-bridge/render-scd64.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`codex/core/blender-bridge/render-scd64.js`:

```js
/**
 * SCD64 RENDER domain.
 *
 * Reuses the physical eight-slot contract, exactly as ART_SLOT_ALIASES already
 * establishes as precedent. Seven slots are CAUSES; the eighth is the EFFECT.
 * That asymmetry turns compareSCD64ByBlocks into a diagnosis rather than a
 * comparison.
 *
 * Slot independence is load-bearing. Each slot hashes its OWN disjoint canonical
 * string, so each slot's avalanche property is contained inside the slot. That is
 * what makes block comparison a LOCALIZATION over eight independent categorical
 * facts rather than the checksum-as-embedding false friend (SCR-023). The
 * warning still binds: never cluster or interpolate on the match count.
 */

import { createHash } from 'node:crypto';

export const SCD64_SLOT_NAMES = Object.freeze([
  'BUGCLASS', 'COORDSYS', 'INVARIANT', 'MAGNITUDE',
  'MASKING', 'GATE', 'PROPAGATE', 'VERDICT',
]);

export const RENDER_SLOT_ALIASES = Object.freeze({
  BUGCLASS: 'SYNTH_CLASS',
  COORDSYS: 'FRAME_SYS',
  INVARIANT: 'ENGINE_LAW',
  MAGNITUDE: 'LIGHT_BUDGET',
  MASKING: 'DENOISE',
  GATE: 'COLOR_LAW',
  PROPAGATE: 'SCENE_GRAPH',
  VERDICT: 'PIXEL_RECEIPT',
});

/** Verification-rule axis. NOT the colour axis — colour lives in COLOR_LAW. */
export const SYNTH_CLASSES = Object.freeze(['RASTER', 'SYNTHESIZED', 'VOLUME', 'SIMULATED']);

const RECEIPT_ALIAS = 'PIXEL_RECEIPT';

function stable(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

export function buildRenderCanonicals(i) {
  if (!SYNTH_CLASSES.includes(i.synthClass)) {
    throw new Error(`unknown synthClass ${JSON.stringify(i.synthClass)}`);
  }
  return [
    { slot: 'SYNTH_CLASS', canonical: `SYNTH_CLASS:${i.synthClass}` },
    { slot: 'FRAME_SYS', canonical: `FRAME_SYS:${stable(i.frame)}` },
    { slot: 'ENGINE_LAW', canonical: `ENGINE_LAW:${stable(i.engine)}` },
    { slot: 'LIGHT_BUDGET', canonical: `LIGHT_BUDGET:${stable(i.light)}` },
    { slot: 'DENOISE', canonical: `DENOISE:${stable(i.denoise)}` },
    { slot: 'COLOR_LAW', canonical: `COLOR_LAW:${stable(i.color)}` },
    { slot: 'SCENE_GRAPH', canonical: `SCENE_GRAPH:${stable(i.scene)}` },
    { slot: RECEIPT_ALIAS, canonical: `PIXEL_RECEIPT:${i.pixelReceipt}` },
  ];
}

export function renderSCD64(inputs) {
  const versionByte = String(inputs.versionByte ?? '02').toUpperCase();
  if (!/^[0-9A-F]{2}$/.test(versionByte)) {
    throw new Error(`versionByte must be 2 hex chars, got ${versionByte}`);
  }
  return buildRenderCanonicals(inputs)
    .map(({ slot, canonical }) => {
      const hex = createHash('sha256').update(canonical, 'utf8').digest('hex').toUpperCase();
      return slot === 'SYNTH_CLASS' ? versionByte + hex.slice(0, 6) : hex.slice(0, 8);
    })
    .join('');
}

export function parseBlocks(scd64) {
  if (!/^[0-9A-F]{64}$/.test(scd64)) throw new Error(`not a valid SCD64: ${scd64}`);
  return scd64.match(/.{8}/g);
}

export function classifyDivergence(a, b) {
  const ab = parseBlocks(a);
  const bb = parseBlocks(b);
  const aliases = SCD64_SLOT_NAMES.map((n) => RENDER_SLOT_ALIASES[n]);

  const differentBlocks = aliases.filter((_, i) => ab[i] !== bb[i]);
  const matchingBlocks = 8 - differentBlocks.length;
  const receiptDiffers = differentBlocks.includes(RECEIPT_ALIAS);
  const causesDiffer = differentBlocks.filter((n) => n !== RECEIPT_ALIAS);

  let relationship;
  if (matchingBlocks === 8) relationship = 'IDENTICAL';
  else if (matchingBlocks >= 6) relationship = 'MUTATION';
  else if (matchingBlocks >= 4) relationship = 'RELATED_FAMILY';
  else if (matchingBlocks >= 2) relationship = 'WEAK_NEIGHBOR';
  else relationship = 'UNRELATED';

  let verdict;
  if (differentBlocks.length === 0) verdict = 'REPRODUCED';
  else if (receiptDiffers && causesDiffer.length === 0) verdict = 'NONDETERMINISTIC';
  else if (receiptDiffers) verdict = 'RESYNTHESIZED';
  else verdict = 'INERT';

  return Object.freeze({ verdict, differentBlocks, causesDiffer, matchingBlocks, relationship });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/codex/core/blender-bridge/render-scd64.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add codex/core/blender-bridge/render-scd64.js tests/codex/core/blender-bridge/render-scd64.test.js
git commit -m "feat(blender-bridge): SCD64 RENDER domain and four-verdict lattice

Seven cause slots plus PIXEL_RECEIPT over the preserved eight-slot contract.
The cause/effect asymmetry yields REPRODUCED / NONDETERMINISTIC / RESYNTHESIZED
/ INERT. INERT — a declared input changed but the pixels did not — is the
mechanical falsifier for declared-but-unimplemented inputs."
```

---

## Task 6: Render, pixel dump, claim — and the declared energy binding

**Files:**
- Create: `blender/addons/scholomance_pixelbrain/render_claim.py`
- Create: `blender/addons/scholomance_pixelbrain/palette.py`
- Create: `codex/core/blender-bridge/energy-bindings.js`
- Create: `blender/tests/test_render_claim.py`
- Test: `tests/codex/core/blender-bridge/energy-bindings.test.js`

**Interfaces:**
- Consumes: `decode_wire` (Task 3), `ingest_wire` (Task 4).
- Produces: Python `apply_color_policy(scene, policy)`;
  `configure_deterministic_render(scene, seed, samples, threads=8)`;
  `dump_pixels_f32(filepath) -> str` (path to `.f32`);
  `emit_claim(scene, wire, dump_path) -> dict` — raw strings and ints only, no
  hashing. Python `school_node_group(school)`. JS
  `ENERGY_BINDINGS`, `resolveBinding(channel) -> binding | null`.

**Energy binding law:** the bridge carries the energy vector and does **not**
interpret it. Every shader mapping is declared with its correspondence strength.
Exactly one binding ships in slice 1, as the worked pattern.

- [ ] **Step 1: Write the failing tests**

`tests/codex/core/blender-bridge/energy-bindings.test.js`:

```js
/**
 * The bridge carries the energy vector; it does not interpret it. Every shader
 * mapping is a declared, graded binding. Implicit defaults here would recreate
 * SCR-017's forbidden wire (material name -> procedural texture, graded FA,
 * explicitly not to be used for code generation).
 */
import { describe, it, expect } from 'vitest';
import { ENERGY_BINDINGS, resolveBinding, ENERGY_TYPE_NAMES } from '../../../../codex/core/blender-bridge/energy-bindings.js';

describe('energy bindings', () => {
  it('names all eight PixelBrain energy channels', () => {
    expect(ENERGY_TYPE_NAMES).toEqual([
      'RESONANT','PHOTONIC','STRUCTURAL','THERMAL','KINETIC','ENTROPIC','SHIELDING','RADIANT',
    ]);
  });

  it('declares exactly one binding in slice 1', () => {
    expect(Object.keys(ENERGY_BINDINGS)).toEqual(['PHOTONIC']);
  });

  it('every binding carries an explicit correspondence strength', () => {
    for (const b of Object.values(ENERGY_BINDINGS)) {
      expect(['ID','SC','FA','MT']).toContain(b.strength);
      expect(b.rationale.length).toBeGreaterThan(20);
      expect(b.shaderInput).toBeTruthy();
    }
  });

  it('returns null for an unbound channel rather than guessing', () => {
    expect(resolveBinding('THERMAL')).toBeNull();
    expect(resolveBinding('STRUCTURAL')).toBeNull();
    expect(resolveBinding('PHOTONIC')).not.toBeNull();
  });

  it('throws on an unknown channel name', () => {
    expect(() => resolveBinding('SPICY')).toThrow(/unknown energy channel/);
  });
});
```

`blender/tests/test_render_claim.py`:

```python
"""
Determinism proof inside Blender.

The checksum is taken over a raw float32 pixel dump, never over an image file:
EXR headers carry a wall-clock timestamp and a render-duration string, so two
identical renders differ by 7 bytes in the container. A file hash is a check
that cannot PASS.
"""
import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "addons"))
import bpy, numpy as np
from scholomance_pixelbrain.render_claim import (
    apply_color_policy, configure_deterministic_render, dump_pixels_f32, emit_claim,
)

FAILURES = []
OUT = os.environ.get("PB_OUT", "/tmp/pb_render_test")
os.makedirs(OUT, exist_ok=True)

def check(name, fn):
    try:
        fn(); print(f"  ok    {name}")
    except AssertionError as e:
        FAILURES.append(name); print(f"  FAIL  {name}: {e}")
    except Exception as e:
        FAILURES.append(name); print(f"  ERROR {name}: {type(e).__name__}: {e}")

def t_exact_policy_pins_standard_view_transform():
    sc = bpy.context.scene
    apply_color_policy(sc, "EXACT")
    assert sc.view_settings.view_transform == "Standard", sc.view_settings.view_transform
    assert sc.view_settings.look == "None", sc.view_settings.look

def t_mixed_policy_is_refused():
    try:
        apply_color_policy(bpy.context.scene, "PRETTY"); assert False, "should refuse"
    except ValueError: pass

def t_render_is_pixel_identical_twice():
    sc = bpy.context.scene
    apply_color_policy(sc, "EXACT")
    configure_deterministic_render(sc, seed=7, samples=16)
    sc.render.resolution_x = sc.render.resolution_y = 64
    a = dump_pixels_f32(os.path.join(OUT, "a"))
    b = dump_pixels_f32(os.path.join(OUT, "b"))
    pa = np.fromfile(a, dtype=np.float32); pb = np.fromfile(b, dtype=np.float32)
    assert pa.size > 0, "empty dump — nothing was measured"
    assert np.array_equal(pa, pb), "pixel payload differed between two runs"

def t_claim_contains_no_hash():
    sc = bpy.context.scene
    claim = emit_claim(sc, {"sourceChecksum": "6DB23A1A", "colorPolicy": "EXACT",
                            "packetId": "WP"}, os.path.join(OUT, "a.f32"))
    assert claim["engine"] == "blender"
    assert claim["sourceChecksum"] == "6DB23A1A"
    assert "pixelReceipt" not in claim, "the consumer must not mint a receipt"
    assert claim["observed"]["viewTransform"] == "Standard"

for n, f in list(globals().items()):
    if n.startswith("t_"): check(n[2:], f)
print(f"\n{len(FAILURES)} failure(s)")
sys.exit(1 if FAILURES else 0)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/codex/core/blender-bridge/energy-bindings.test.js
./scripts/blender-test.sh blender/tests/test_render_claim.py
```
Expected: both FAIL on missing modules.

- [ ] **Step 3: Write minimal implementations**

`codex/core/blender-bridge/energy-bindings.js`:

```js
/**
 * Declared energy -> shader bindings.
 *
 * The bridge carries the eight-channel energy vector as raw named attributes and
 * does NOT interpret it. A mapping onto a shader input is always an explicit,
 * graded binding: PHOTONIC -> emission is arguably structural, THERMAL ->
 * blackbody is FA at best, and STRUCTURAL / KINETIC / SHIELDING / RESONANT have
 * no optical analogue at all. Implicit defaults would recreate SCR-017's
 * forbidden wire in a new place.
 */

/** Index order matches ENERGY_TYPES in codex/core/pixelbrain/voxel-volume.js. */
export const ENERGY_TYPE_NAMES = Object.freeze([
  'RESONANT', 'PHOTONIC', 'STRUCTURAL', 'THERMAL',
  'KINETIC', 'ENTROPIC', 'SHIELDING', 'RADIANT',
]);

export const ENERGY_BINDINGS = Object.freeze({
  PHOTONIC: Object.freeze({
    channel: 'PHOTONIC',
    attribute: 'pb_energy_1',
    shaderInput: 'Emission Strength',
    strength: 'SC',
    rationale:
      'Both sides denote light emitted by the element rather than reflected. '
      + 'NOT preserved: PixelBrain photonic energy is unitless and unbounded '
      + 'while Emission Strength is radiometric, so the mapping needs a declared '
      + 'scale and cannot be treated as physically calibrated.',
  }),
});

export function resolveBinding(channel) {
  if (!ENERGY_TYPE_NAMES.includes(channel)) {
    throw new Error(`unknown energy channel: ${channel}`);
  }
  return ENERGY_BINDINGS[channel] ?? null;
}
```

`blender/addons/scholomance_pixelbrain/render_claim.py`:

```python
"""
Deterministic render configuration, metadata-free pixel dump, and claim emission.

This module hashes nothing. It reports what bpy ACTUALLY held after assignment,
which may differ from what the wire requested (RNA floats are float32). The JS
bridge compares requested against observed; a mismatch is its own finding.
"""

import os
import bpy
import numpy as np

COLOR_POLICIES = ("EXACT", "SYNTHESIZED")


def apply_color_policy(scene, policy):
    if policy not in COLOR_POLICIES:
        raise ValueError(f"unknown colour policy {policy!r}; expected one of {COLOR_POLICIES}")
    if policy == "EXACT":
        # Default is AgX, a filmic tone map that would silently reshape every
        # authored luminance band. The value-sketch law requires absolute [0,1].
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
    return policy


def configure_deterministic_render(scene, seed, samples, threads=8):
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"          # only a CPU device exists on this machine
    scene.cycles.seed = int(seed)
    scene.cycles.use_animated_seed = False
    scene.cycles.samples = int(samples)
    scene.cycles.use_adaptive_sampling = False
    scene.cycles.use_denoising = False
    scene.render.threads_mode = "FIXED"
    scene.render.threads = int(threads)
    scene.render.image_settings.file_format = "OPEN_EXR"
    scene.render.image_settings.color_depth = "32"
    scene.render.image_settings.exr_codec = "NONE"
    return scene


def dump_pixels_f32(basepath):
    """
    Render and write the raw float32 pixel payload to <basepath>.f32.

    Metadata-free by construction. The EXR beside it is for humans; the .f32 is
    what the bridge hashes.
    """
    scene = bpy.context.scene
    scene.render.filepath = basepath
    bpy.ops.render.render(write_still=True)

    img = bpy.data.images.load(basepath + ".exr")
    arr = np.empty(len(img.pixels), dtype=np.float32)
    img.pixels.foreach_get(arr)
    bpy.data.images.remove(img)

    out = basepath + ".f32"
    arr.tofile(out)
    return out


def emit_claim(scene, wire, dump_path):
    """Raw strings and ints only. No hashing. The bridge mints the receipt."""
    return {
        "engine": "blender",
        "packetId": wire["packetId"],
        "sourceChecksum": wire["sourceChecksum"],
        "colorPolicy": wire["colorPolicy"],
        "pixelDumpPath": os.path.abspath(dump_path),
        "observed": {
            "blenderVersion": bpy.app.version_string.split()[0],
            "buildHash": bpy.app.build_hash.decode() if isinstance(bpy.app.build_hash, bytes) else str(bpy.app.build_hash),
            "engine": scene.render.engine,
            "device": scene.cycles.device,
            "seed": int(scene.cycles.seed),
            "samples": int(scene.cycles.samples),
            "adaptive": bool(scene.cycles.use_adaptive_sampling),
            "denoise": bool(scene.cycles.use_denoising),
            "viewTransform": scene.view_settings.view_transform,
            "look": scene.view_settings.look,
            "resolutionX": int(scene.render.resolution_x),
            "resolutionY": int(scene.render.resolution_y),
            "threads": int(scene.render.threads),
        },
    }
```

`blender/addons/scholomance_pixelbrain/palette.py`:

```python
"""
School palette as a reusable shader node group.

Hex values in SCHOOL_PALETTE are sRGB display values; shader inputs are
scene-linear. Under EXACT policy the authored hex must survive byte-exact, so
the conversion applied is recorded in the COLOR_LAW slot rather than assumed.
"""

import bpy

SCHOOL_PALETTE = {
    "SONIC":   {"primary": "#7c3aed", "accent": "#a78bfa", "glow": "#7c3aed"},
    "PSYCHIC": {"primary": "#06b6d4", "accent": "#67e8f9", "glow": "#06b6d4"},
    "ALCHEMY": {"primary": "#d946ef", "accent": "#f0abfc", "glow": "#d946ef"},
    "WILL":    {"primary": "#f97316", "accent": "#fb923c", "glow": "#f97316"},
    "VOID":    {"primary": "#71717a", "accent": "#a1a1aa", "glow": "#71717a"},
    "default": {"primary": "#c5a26f", "accent": "#f1e7c8", "glow": "#c5a26f"},
}


def hex_to_srgb(hex_str):
    h = hex_str.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def school_node_group(school, linearize=True):
    """Create (or return) a node group exposing the school's three colours."""
    name = f"pb_school_{school}"
    if name in bpy.data.node_groups:
        return bpy.data.node_groups[name]

    colors = SCHOOL_PALETTE.get(school, SCHOOL_PALETTE["default"])
    ng = bpy.data.node_groups.new(name, "ShaderNodeTree")
    out = ng.nodes.new("NodeGroupOutput")

    for role in ("primary", "accent", "glow"):
        ng.interface.new_socket(role, in_out="OUTPUT", socket_type="NodeSocketColor")

    for i, role in enumerate(("primary", "accent", "glow")):
        rgb = ng.nodes.new("ShaderNodeRGB")
        srgb = hex_to_srgb(colors[role])
        vals = tuple(srgb_to_linear(c) for c in srgb) if linearize else srgb
        rgb.outputs[0].default_value = (*vals, 1.0)
        ng.links.new(rgb.outputs[0], out.inputs[i])

    ng["pb_linearized"] = bool(linearize)
    return ng
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/codex/core/blender-bridge/energy-bindings.test.js
./scripts/blender-test.sh blender/tests/test_render_claim.py
```
Expected: 5 JS tests PASS; 4 Python checks ok.

If `bpy.app.build_hash` does not exist, find the right attribute with
`--python-expr "import bpy; print([a for a in dir(bpy.app) if 'hash' in a or 'build' in a])"`
and use it. The expected value is `fbe6228777e7`.

- [ ] **Step 5: Commit**

```bash
git add codex/core/blender-bridge/energy-bindings.js tests/codex/core/blender-bridge/energy-bindings.test.js blender/addons/scholomance_pixelbrain/render_claim.py blender/addons/scholomance_pixelbrain/palette.py blender/tests/test_render_claim.py
git commit -m "feat(blender-bridge): deterministic render, pixel dump, claim, energy bindings

The checksum is taken over a raw float32 pixel dump because EXR headers carry a
timestamp and a render duration — a file hash is a check that cannot pass. The
claim reports what bpy ACTUALLY held, so requested-vs-observed drift is itself a
finding. EXACT colour policy pins Standard view transform; AgX would silently
reshape every authored luminance band. Exactly one energy binding ships, graded."
```

---

## Task 7: Receipt minting and the end-to-end verdict

**Files:**
- Create: `codex/core/blender-bridge/receipt.js`
- Create: `codex/core/blender-bridge/index.js`
- Create: `scripts/blender-bridge-e2e.mjs`
- Test: `tests/codex/core/blender-bridge/receipt.test.js`

**Interfaces:**
- Consumes: `renderSCD64`, `classifyDivergence` (Task 5); the claim shape (Task 6).
- Produces: `parseBlenderClaim(raw) -> ParsedClaim`; `mintReceipt(claim, sceneInputs) -> { scd64, verdict? }`;
  `compareReceipts(a, b) -> classifyDivergence result`; `ClaimError`.

- [ ] **Step 1: Write the failing test**

```js
/**
 * The bridge mints. Blender claims. Both engines' claims pass through one hash
 * function, so a receipt diff is real divergence in what was drawn rather than
 * hash drift between two implementations.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseBlenderClaim, mintReceipt, compareReceipts, ClaimError } from '../../../../codex/core/blender-bridge/receipt.js';

const dir = mkdtempSync(join(tmpdir(), 'pb-'));
const dump = join(dir, 'a.f32');
writeFileSync(dump, Buffer.from(new Float32Array([0.1, 0.2, 0.3]).buffer));

const claim = {
  engine: 'blender', packetId: 'WP', sourceChecksum: '6DB23A1A', colorPolicy: 'EXACT',
  pixelDumpPath: dump,
  observed: {
    blenderVersion: '5.2.0', buildHash: 'fbe6228777e7', engine: 'CYCLES', device: 'CPU',
    seed: 7, samples: 64, adaptive: false, denoise: false,
    viewTransform: 'Standard', look: 'None', resolutionX: 160, resolutionY: 160, threads: 8,
  },
};

describe('parseBlenderClaim', () => {
  it('accepts a well-formed claim', () => {
    expect(parseBlenderClaim(claim).engine).toBe('blender');
  });

  it('refuses a claim that carries a receipt — consumers must not mint', () => {
    expect(() => parseBlenderClaim({ ...claim, pixelReceipt: 'x' })).toThrow(/must not mint/);
  });

  it('refuses EXACT policy with a non-Standard view transform', () => {
    const bad = { ...claim, observed: { ...claim.observed, viewTransform: 'AgX' } };
    expect(() => parseBlenderClaim(bad)).toThrow(ClaimError);
  });

  it('refuses a wrong engine', () => {
    expect(() => parseBlenderClaim({ ...claim, engine: 'pixi' })).toThrow(ClaimError);
  });
});

describe('mintReceipt', () => {
  it('hashes the pixel dump, not the claim', () => {
    const r = mintReceipt(parseBlenderClaim(claim), { synthClass: 'RASTER', frame: {}, scene: {} });
    expect(r.scd64).toMatch(/^[0-9A-F]{64}$/);
    expect(r.pixelReceipt).toMatch(/^[0-9a-f]{16}$/);
  });

  it('two mints of the same dump and settings are REPRODUCED', () => {
    const opts = { synthClass: 'RASTER', frame: {}, scene: {} };
    const a = mintReceipt(parseBlenderClaim(claim), opts);
    const b = mintReceipt(parseBlenderClaim(claim), opts);
    expect(compareReceipts(a, b).verdict).toBe('REPRODUCED');
  });

  it('a different dump with identical settings is NONDETERMINISTIC', () => {
    const other = join(dir, 'b.f32');
    writeFileSync(other, Buffer.from(new Float32Array([9, 9, 9]).buffer));
    const opts = { synthClass: 'RASTER', frame: {}, scene: {} };
    const a = mintReceipt(parseBlenderClaim(claim), opts);
    const b = mintReceipt(parseBlenderClaim({ ...claim, pixelDumpPath: other }), opts);
    expect(compareReceipts(a, b).verdict).toBe('NONDETERMINISTIC');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codex/core/blender-bridge/receipt.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`codex/core/blender-bridge/receipt.js`:

```js
/**
 * receipt — parse a Blender claim, mint the receipt, compare.
 *
 * Blender never computes a hash and never mints a receipt. It reports a claim
 * (seal, observed settings, pixel dump path); the bridge mints in JS. Both
 * engines' claims pass through one hash function, so a receipt diff is real
 * divergence in what was drawn rather than drift between two hash
 * implementations.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { renderSCD64, classifyDivergence } from './render-scd64.js';

export class ClaimError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ClaimError';
  }
}

export function parseBlenderClaim(raw) {
  if (!raw || typeof raw !== 'object') throw new ClaimError('claim must be an object');
  if (raw.engine !== 'blender') throw new ClaimError(`expected engine "blender", got ${raw.engine}`);
  if ('pixelReceipt' in raw || 'scd64' in raw) {
    throw new ClaimError('claim carries a receipt — the consumer must not mint one');
  }
  const o = raw.observed;
  if (!o || typeof o !== 'object') throw new ClaimError('claim.observed is required');
  if (raw.colorPolicy === 'EXACT' && o.viewTransform !== 'Standard') {
    throw new ClaimError(
      `EXACT policy requires view_transform 'Standard', observed '${o.viewTransform}' — `
      + 'AgX would silently reshape every authored luminance band',
    );
  }
  if (typeof raw.pixelDumpPath !== 'string' || !raw.pixelDumpPath) {
    throw new ClaimError('claim.pixelDumpPath is required');
  }
  return Object.freeze({ ...raw, observed: Object.freeze({ ...o }) });
}

export function mintReceipt(claim, sceneInputs = {}) {
  const bytes = readFileSync(claim.pixelDumpPath);
  if (bytes.length === 0) {
    throw new ClaimError(`pixel dump ${claim.pixelDumpPath} is empty — nothing was measured`);
  }
  const pixelReceipt = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  const o = claim.observed;

  const scd64 = renderSCD64({
    synthClass: sceneInputs.synthClass ?? 'RASTER',
    versionByte: sceneInputs.versionByte ?? '02',
    frame: {
      width: o.resolutionX, height: o.resolutionY, pixelAspect: 1,
      frameIndex: sceneInputs.frameIndex ?? 1,
      cameraMatrix: sceneInputs.cameraMatrix ?? [],
    },
    engine: {
      blenderVersion: o.blenderVersion, buildHash: o.buildHash,
      engine: o.engine, device: o.device,
    },
    light: {
      seed: o.seed, samples: o.samples, adaptive: o.adaptive,
      adaptiveThreshold: o.adaptiveThreshold ?? 0,
      bounces: o.bounces ?? 0, clamp: o.clamp ?? 0,
      shutterOpen: o.shutterOpen ?? 0, shutterClose: o.shutterClose ?? 0,
      timeSamples: o.timeSamples ?? 1,
    },
    denoise: { enabled: o.denoise, denoiser: o.denoiser ?? 'NONE', inputPasses: o.inputPasses ?? 'NONE' },
    color: {
      viewTransform: o.viewTransform, look: o.look,
      display: o.display ?? 'sRGB', format: 'OPEN_EXR', depth: '32',
    },
    scene: {
      graphHash: sceneInputs.graphHash ?? '',
      seeds: sceneInputs.seeds ?? [],
      packetSeals: [claim.sourceChecksum],
    },
    pixelReceipt,
  });

  return Object.freeze({ scd64, pixelReceipt, packetId: claim.packetId, engine: 'blender' });
}

export function compareReceipts(a, b) {
  return classifyDivergence(a.scd64, b.scd64);
}
```

`codex/core/blender-bridge/index.js`:

```js
export * from './quantize.js';
export * from './intern.js';
export * from './wire.js';
export * from './render-scd64.js';
export * from './receipt.js';
export * from './energy-bindings.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/codex/core/blender-bridge/receipt.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the end-to-end driver**

`scripts/blender-bridge-e2e.mjs`:

```js
#!/usr/bin/env node
/**
 * End-to-end: .pbrain -> wire -> Blender -> pixel dump -> receipt -> verdict.
 * Renders twice and asserts REPRODUCED. Exit non-zero on any other verdict.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { serializeWirePacket } from '../codex/core/blender-bridge/wire.js';
import { parseBlenderClaim, mintReceipt, compareReceipts } from '../codex/core/blender-bridge/receipt.js';

const BLENDER = process.env.BLENDER ?? join(homedir(), 'opt/blender/blender');
const PACKET = process.argv[2] ?? 'output/holy_fire_claymore.pbrain';
const dir = mkdtempSync(join(tmpdir(), 'pb-e2e-'));

const packet = JSON.parse(readFileSync(PACKET, 'utf8'));
const wirePath = join(dir, 'wire.json');
writeFileSync(wirePath, serializeWirePacket(packet, { colorPolicy: 'EXACT' }));
console.log(`wire: ${wirePath} (${packet.coordinates.length} coordinates)`);

function renderOnce(tag) {
  const claimPath = join(dir, `${tag}.claim.json`);
  execFileSync(
    BLENDER,
    ['-b', '--factory-startup', '--python', 'blender/scripts/e2e_render.py',
     '--', wirePath, join(dir, tag), claimPath],
    { stdio: 'inherit' },
  );
  return parseBlenderClaim(JSON.parse(readFileSync(claimPath, 'utf8')));
}

const opts = { synthClass: 'RASTER', graphHash: 'e2e' };
const a = mintReceipt(renderOnce('run1'), opts);
const b = mintReceipt(renderOnce('run2'), opts);
const result = compareReceipts(a, b);

console.log(`\nrun1 ${a.scd64}\nrun2 ${b.scd64}`);
console.log(`pixelReceipt: ${a.pixelReceipt} / ${b.pixelReceipt}`);
console.log(`\nverdict: ${result.verdict}  differentBlocks: ${result.differentBlocks.join(', ') || 'none'}`);

if (result.verdict !== 'REPRODUCED') {
  console.error(`\nFAIL: expected REPRODUCED, got ${result.verdict}`);
  process.exit(1);
}
console.log('\nPASS: REPRODUCED');
```

`blender/scripts/e2e_render.py`:

```python
"""Headless side of the e2e driver: ingest the wire, render, dump, write claim."""
import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "addons"))
import bpy
from scholomance_pixelbrain.packet import decode_wire
from scholomance_pixelbrain.ingest import ingest_wire
from scholomance_pixelbrain.render_claim import (
    apply_color_policy, configure_deterministic_render, dump_pixels_f32, emit_claim,
)

wire_path, basepath, claim_path = sys.argv[sys.argv.index("--") + 1:][:3]
wire = decode_wire(open(wire_path, encoding="utf8").read())
ingest_wire(wire)

sc = bpy.context.scene
apply_color_policy(sc, wire["colorPolicy"])
configure_deterministic_render(sc, seed=7, samples=16)
sc.render.resolution_x = sc.render.resolution_y = 96

dump = dump_pixels_f32(basepath)
claim = emit_claim(sc, wire, dump)
with open(claim_path, "w", encoding="utf8") as fh:
    json.dump(claim, fh)
print("CLAIM", claim_path)
```

Run: `node scripts/blender-bridge-e2e.mjs`
Expected: `PASS: REPRODUCED`, exit 0.

- [ ] **Step 6: Run the whole suite**

```bash
npx vitest run tests/codex/core/blender-bridge/
./scripts/blender-test.sh blender/tests/test_packet.py
./scripts/blender-test.sh blender/tests/test_ingest.py
./scripts/blender-test.sh blender/tests/test_render_claim.py
node scripts/blender-bridge-e2e.mjs
```
Expected: all green. **Do not file any failure as "pre-existing" without running
it on a clean checkout first.**

- [ ] **Step 7: Commit**

```bash
git add codex/core/blender-bridge/receipt.js codex/core/blender-bridge/index.js tests/codex/core/blender-bridge/receipt.test.js scripts/blender-bridge-e2e.mjs blender/scripts/e2e_render.py
git commit -m "feat(blender-bridge): receipt minting and end-to-end REPRODUCED proof

The bridge mints, Blender claims. Both engines' claims pass through one hash
function so a receipt diff is real divergence rather than drift between two hash
implementations. parseBlenderClaim refuses a claim carrying a receipt, and
refuses EXACT policy under a non-Standard view transform."
```

---

## Task 8: Cold/warm classifier as an admission gate

**Files:**
- Create: `blender/addons/scholomance_pixelbrain/classify.py`
- Create: `blender/tests/test_classify.py`
- Create: `docs/blender-bridge-feature-classes.md`

**Why this task exists:** the spec measured motion blur as conservative,
geometry nodes as a pure DAG, and rigid-body simulation as path-dependent.
Cold-starting a simulated frame silently returns the **un-simulated** state, so
distributing a frame range across workers is silently wrong for simulated
content. Cloth, fluid, particles, softbody, boids and dynamic paint are
**unclassified**. This task makes classification mechanical so the list cannot
rot.

**Interfaces:**
- Consumes: nothing.
- Produces: `classify_feature(setup_fn, evaluate_fn, target_frame=24) -> 'CONSERVATIVE' | 'PATH_DEPENDENT'`;
  `ClassifyError` raised when the evaluation yields no data.

- [ ] **Step 1: Write the failing test**

`blender/tests/test_classify.py`:

```python
"""
Cold/warm classifier tests.

Evaluate frame N directly (cold) versus after stepping frames 1..N (warm). A
conservative process is unaffected; a path-dependent one diverges.

The empty-result guard is load-bearing: an earlier version of this experiment
reported cold == warm for geometry nodes because BOTH produced zero vertices.
sha256 of nothing equals sha256 of nothing, and it read as a green pass.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "addons"))
import bpy, numpy as np
from scholomance_pixelbrain.classify import classify_feature, ClassifyError

FAILURES = []

def check(name, fn):
    try:
        fn(); print(f"  ok    {name}")
    except AssertionError as e:
        FAILURES.append(name); print(f"  FAIL  {name}: {e}")
    except Exception as e:
        FAILURES.append(name); print(f"  ERROR {name}: {type(e).__name__}: {e}")

def t_keyframes_are_conservative():
    def setup():
        cube = bpy.data.objects["Cube"]
        cube.location = (0, 0, 0); cube.keyframe_insert("location", frame=1)
        cube.location = (0, 0, 5); cube.keyframe_insert("location", frame=48)
    def evaluate():
        dg = bpy.context.evaluated_depsgraph_get()
        m = bpy.data.objects["Cube"].evaluated_get(dg).matrix_world
        return [c for row in m for c in row]
    assert classify_feature(setup, evaluate) == "CONSERVATIVE"

def t_rigid_body_is_path_dependent():
    def setup():
        bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, -3))
        bpy.ops.rigidbody.object_add(); bpy.context.active_object.rigid_body.type = "PASSIVE"
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 5))
        bpy.ops.rigidbody.object_add(); bpy.context.active_object.rigid_body.type = "ACTIVE"
        bpy.context.scene.rigidbody_world.point_cache.frame_end = 60
    def evaluate():
        dg = bpy.context.evaluated_depsgraph_get()
        objs = sorted([o for o in bpy.data.objects
                       if o.rigid_body and o.rigid_body.type == "ACTIVE"], key=lambda z: z.name)
        return [c for o in objs for row in o.evaluated_get(dg).matrix_world for c in row]
    assert classify_feature(setup, evaluate) == "PATH_DEPENDENT"

def t_empty_evaluation_is_refused_not_passed():
    try:
        classify_feature(lambda: None, lambda: [])
        assert False, "an empty evaluation must raise, never report CONSERVATIVE"
    except ClassifyError: pass

for n, f in list(globals().items()):
    if n.startswith("t_"): check(n[2:], f)
print(f"\n{len(FAILURES)} failure(s)")
sys.exit(1 if FAILURES else 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/blender-test.sh blender/tests/test_classify.py`
Expected: FAIL — `No module named 'scholomance_pixelbrain.classify'`.

- [ ] **Step 3: Write minimal implementation**

`blender/addons/scholomance_pixelbrain/classify.py`:

```python
"""
Cold/warm path-dependence classifier — the admission gate for any Blender
feature entering the suite.

An endpoint checksum is valid exactly when the process is conservative. Measured
on 2026-07-30 with Blender 5.2.0 LTS:

  motion blur       cold == warm  -> CONSERVATIVE
  geometry nodes    cold == warm  -> CONSERVATIVE (pure DAG)
  rigid body        cold != warm  -> PATH_DEPENDENT

Cold-starting a simulated frame returns the UN-SIMULATED state and Blender
reports nothing wrong, so a distributed render of simulated content is silently
incorrect. PATH_DEPENDENT features require the chained receipt.
"""

import hashlib
import bpy
import numpy as np


class ClassifyError(Exception):
    """Raised when an evaluation produced no data — the test measured nothing."""


def _digest(values):
    arr = np.asarray(values, dtype=np.float32)
    if arr.size == 0:
        raise ClassifyError(
            "evaluation returned no data; a comparison of two empty results "
            "is a check that cannot fail"
        )
    return hashlib.sha256(arr.tobytes()).hexdigest()[:16]


def _run(setup_fn, evaluate_fn, target_frame, warm):
    bpy.ops.wm.read_factory_settings(use_empty=False)
    setup_fn()
    scene = bpy.context.scene
    if warm:
        for f in range(1, target_frame + 1):
            scene.frame_set(f)
    else:
        scene.frame_set(target_frame)
    return _digest(evaluate_fn())


def classify_feature(setup_fn, evaluate_fn, target_frame=24):
    cold = _run(setup_fn, evaluate_fn, target_frame, warm=False)
    warm = _run(setup_fn, evaluate_fn, target_frame, warm=True)
    return "CONSERVATIVE" if cold == warm else "PATH_DEPENDENT"
```

`docs/blender-bridge-feature-classes.md`:

```markdown
# Blender feature path-dependence classes

No Blender feature enters the synthesis suite until it has passed the cold/warm
classifier (`blender/addons/scholomance_pixelbrain/classify.py`) and had its
class recorded here. `PATH_DEPENDENT` features require the chained receipt;
`CONSERVATIVE` features verify against `PIXEL_RECEIPT` directly.

| Feature | Class | Date | Evidence |
|---|---|---|---|
| Keyframed transforms | CONSERVATIVE | 2026-07-30 | `test_classify.py` |
| Motion blur | CONSERVATIVE | 2026-07-30 | cold == warm == `673a690b655459ad` |
| Geometry nodes | CONSERVATIVE | 2026-07-30 | cold == warm == `91220804123e6dac`, 8640 verts |
| Rigid body | PATH_DEPENDENT | 2026-07-30 | cold z=`3.000000` vs warm z=`−1.466180` |
| Cloth | **unclassified** | — | — |
| Fluid | **unclassified** | — | — |
| Particles | **unclassified** | — | — |
| Softbody | **unclassified** | — | — |
| Boids | **unclassified** | — | — |
| Dynamic paint | **unclassified** | — | — |

Unclassified is **not** "probably fine". Rigid body happened to be reproducible
run-to-run; that is not a promise about the others, any of which could be
nondeterministic *as well as* path-dependent.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/blender-test.sh blender/tests/test_classify.py`
Expected: `0 failure(s)`, 3 checks ok.

If `bpy.ops.wm.read_factory_settings` misbehaves across repeated calls in one
process, run cold and warm as two separate Blender invocations instead — that is
how the original measurement was taken, and it is the more honest isolation.

- [ ] **Step 5: Commit**

```bash
git add blender/addons/scholomance_pixelbrain/classify.py blender/tests/test_classify.py docs/blender-bridge-feature-classes.md
git commit -m "feat(blender-bridge): cold/warm path-dependence classifier and feature register

An endpoint checksum is valid exactly when the process is conservative. The
classifier is mechanical so the register cannot rot, and it refuses an empty
evaluation rather than reporting CONSERVATIVE — an earlier hand-run of this
experiment compared two empty results and read as a green pass."
```

---

## Task 9: Registry entries and spec reconciliation

**Files:**
- Modify: `docs/scholomance-encyclopedia/Scholomance White Papers/SCHOLOMANCE_SEMANTIC_CORRESPONDENCE_REGISTRY.md`
- Modify: `docs/superpowers/specs/2026-07-30-blender-synthesis-bridge-design.md`

- [ ] **Step 1: Add SCR-026 through SCR-029**

Append to §2 following the exact entry schema (`Strength`, `Preserved`,
`NOT preserved`, `Math`, `Directionality`, `Evidence`, `Notes`). Default for a
new entry is `FA`; only claim `SC` where a test in this plan demonstrates
structure preservation.

- **SCR-026: Reproducible build ↔ render receipt determinism.** Evidence: the
  six-variant pixel-identity measurement, plus `receipt.test.js` REPRODUCED /
  NONDETERMINISTIC cases and `blender-bridge-e2e.mjs`.
- **SCR-027: Structured-record Hamming distance ↔ SCD64 block comparison.** `SC`,
  conditional on slot independence. Evidence: the slot-independence test in
  `render-scd64.test.js` (changing one cause moves exactly one slot). Cite
  SCR-023 as the contrast case and state that `similarity` remains unusable as a
  metric — only `differentBlocks` localization is preserved.
- **SCR-028: Conservative vs non-conservative field ↔ endpoint vs chained
  checksum validity.** `SC`. Evidence: `test_classify.py` and
  `docs/blender-bridge-feature-classes.md`.
- **SCR-029: Attribute field ↔ per-coordinate semantic record.** Claim `SC` only
  if `test_ingest.py` demonstrates round-trip fidelity; otherwise leave at `FA`
  and say so.

- [ ] **Step 2: Update the summary matrix in §3 and increment the version**

Bump `1.1.0` and add a §5 reclassification-log row. Also resolve the `AMBIGUOUS`
citation §7.2 rule 2 predicts for SCR-002's bare `scd64/`: the implementation is
`src/core/scd64`; `src/diagnostics/scd64` is UI only.

- [ ] **Step 3: Record any spec divergence**

If implementation forced a departure from the spec — a different point-cloud API,
a different `build_hash` attribute, cold/warm needing separate processes — add it
to the spec's *Verification limits*. **The territory wins.** Do not quietly leave
the spec describing something that was not built.

- [ ] **Step 4: Commit**

```bash
git add "docs/scholomance-encyclopedia/Scholomance White Papers/SCHOLOMANCE_SEMANTIC_CORRESPONDENCE_REGISTRY.md" docs/superpowers/specs/2026-07-30-blender-synthesis-bridge-design.md
git commit -m "docs: register SCR-026..029 and reconcile the Blender bridge spec

Grades claimed only where a test in this slice demonstrates the preservation.
Also resolves SCR-002's AMBIGUOUS scd64/ citation: src/core/scd64 is the
implementation, src/diagnostics/scd64 is UI only."
```

---

## Deferred — explicitly NOT in slice 1

Named so nobody builds them by accident:

- **Chained receipt for `SIMULATED` content.** Designed in the spec
  (`PIXEL_RECEIPT(N) = sha256(pixel_dump_N ‖ digest_{N−1})`, `digest₀` = packet
  seal) but not built. Slice 1 renders single frames only. Do not render a
  simulated sequence until this exists.
- **HTTP + `bpy.app.timers` live transport.** Slice 1 reads wire JSON from disk.
  Disk must keep working regardless, so CI never needs a server.
- **Intent flow** (`intent.js`, panels emitting intents, packet mutation, re-seal).
- **Compositor work.** Note for whoever starts it: `Scene.node_tree` is **removed**
  in 5.2; use `scene.compositing_node_group`. `Scene.use_nodes` and
  `Material.use_nodes` are deprecated for removal in 6.0.
- **Audio reactivity.** `bpy.ops.graph.sound_bake` **does not exist**; it is
  `graph.sound_to_samples`. Word-level alignment already exists at
  `public/data/alignment/<uuid>.alignment-v1.json`.
- **Cross-engine receipt diff against Remotion.** The falsifier the spec's organ
  roles depend on. Needs a Remotion-side claim emitter.
- **Voxel volumes.** `pyopenvdb` is absent from the bundled Python, so the
  volume→VDB grid wire is unavailable; a mesh or Geometry Nodes mesh-to-volume
  route is a different correspondence with different losses.
