# Blender Bridge Phase 6 — PB-CARRIER-v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One sealed carrier holding several complete projections behind a manifest, so more than the render packet can cross into Blender.

**Architecture:** The producer seals `render` and `temporal` frames into a carrier with a manifest, a root binding every frame checksum in order, and a seal. Integrity verification is a JS-side recomputation. The consumer performs string equality only, against a root delivered by an independent path.

**Tech Stack:** Node 20 ESM + vitest, Blender 5.2.0 LTS embedded Python 3.13.

## Global Constraints

Everything from the phases 0–2 and 3–5 plans still applies. In addition:

- **Frame kinds are `render` and `temporal` only.** `construction`, `gene`, and `amp` are refused, not accepted-and-ignored. They are added when a consumer reads them.
- **The consumer never computes a hash.** No `hashlib`, no digest call, anywhere under `blender/addons/`. Falsifier 11 is a static check and must keep passing.
- **A Merkle proof is not permitted** — computing one means hashing, which the consumer may not do.
- **Ship the carrier whole.** No lazy frames, no fetch-on-demand. Denied in the carrier design §4 with numbers.
- **The expected root arrives by an independent path**, never read off the carrier being verified. `e0cee0f9` and the palette E2E both shipped a check that compared a packet to itself.

## The tension in law 2, resolved before coding

Law 2 says the consumer verifies by string equality and never hashes. Law 3 says
the expected seal arrives independently. Together these bound what the consumer
can detect, and the boundary must be **declared rather than implied**:

| tampering | consumer (string equality) | JS-side `verifyCarrier` |
|---|---|---|
| carrier substituted wholesale | **detected** — root ≠ expected | detected |
| `root` field edited | **detected** — root ≠ expected | detected |
| a frame's bytes edited, `root` left alone | **NOT detected** | **detected** |
| a frame's bytes edited *and* `root` updated to match | **detected** — root ≠ expected | not detected as tampering; it is a different, self-consistent carrier |

The consumer verifies **identity**, not **integrity**. Detecting an edited frame
requires recomputing its checksum, which is hashing, which the consumer may not
do. So integrity is a producer-side gate (`verifyCarrier`) and the consumer's
check answers a narrower question: *is this the carrier I was told to expect?*

Writing this down is the point. A design that implied the consumer could detect
frame tampering by string equality would be claiming a check it does not have —
the same shape as a receipt describing the factory cube.

---

## File Structure

- Create `codex/core/blender-bridge/carrier.js` — seal, verify, select.
- Create `tests/codex/core/blender-bridge/carrier.test.js`
- Create `blender/addons/scholomance_pixelbrain/carrier_ingest.py` — consumer-side selection + string-equality root check.
- Create `blender/tests/test_carrier_ingest.py`
- Modify `codex/core/blender-bridge/index.js` — export the carrier surface.
- Modify `docs/superpowers/specs/2026-07-30-blender-bridge-fully-functional-design.md` — falsifiers 8–10, status.

---

### Task 1: `carrier.js` — seal, verify, select

**Files:**
- Create: `codex/core/blender-bridge/carrier.js`
- Test: `tests/codex/core/blender-bridge/carrier.test.js`

**Interfaces:**
- Consumes: `sha256Hex` from `codex/core/pixelbrain/sha256.js`, `canonicalConstructionStringify` from `codex/core/pixelbrain/construction/construction-schema.js`. Neither is reimplemented — a second canonicaliser is the same mistake as the third copy of the sRGB transfer function.
- Produces:
  - `CARRIER_CONTRACT = 'PB-CARRIER-v1'`, `CARRIER_FRAME_KINDS = ['render', 'temporal']`
  - `frameChecksum(packet): string`
  - `sealCarrier(entries: [{kind, frameId, packet}]): carrier`
  - `verifyCarrier(carrier): { valid, reason, badFrames, rootMatches, sealMatches }`
  - `selectFrame(carrier, frameId): packet`
  - `class CarrierError extends Error`

Carrier shape:

```
{
  contract: 'PB-CARRIER-v1',
  manifest: [ { kind, frameId, schema, checksum }, … ],   // producer order
  root:     <digest over manifest checksums, in manifest order>,
  frames:   { <frameId>: <complete packet> },
  seal:     <digest over contract + root + canonical manifest>
}
```

- [ ] **Step 1: Write the failing test**

Create `tests/codex/core/blender-bridge/carrier.test.js`:

```js
/**
 * PB-CARRIER-v1. One producer decides what ships; the consumer selects which
 * frame to READ and never influences what is SENT.
 *
 * Integrity verification is JS-side and recomputes. The consumer's check is
 * string equality against an independently delivered root, and therefore
 * verifies IDENTITY, not INTEGRITY — see the plan's "tension in law 2" table.
 */
import { describe, it, expect } from 'vitest';
import {
  CARRIER_CONTRACT,
  CARRIER_FRAME_KINDS,
  frameChecksum,
  sealCarrier,
  verifyCarrier,
  selectFrame,
  CarrierError,
} from '../../../../codex/core/blender-bridge/carrier.js';

function renderPacket(id = 'r1') {
  return { packetId: id, coordinateCount: 2, positions: { x: [1, 2], y: [3, 4] } };
}
function temporalPacket(frame = 1) {
  return { contract: 'PB-TEMPORAL-FRAME-v1', frame, vertexCount: 1, positions: { x: [5], y: [6] } };
}
function twoFrames() {
  return [
    { kind: 'render', frameId: 'render-0', packet: renderPacket() },
    { kind: 'temporal', frameId: 'temporal-0', packet: temporalPacket() },
  ];
}

describe('sealCarrier', () => {
  it('names its contract and lists every frame in the manifest', () => {
    const c = sealCarrier(twoFrames());
    expect(c.contract).toBe(CARRIER_CONTRACT);
    expect(c.manifest.map((m) => m.frameId)).toEqual(['render-0', 'temporal-0']);
    expect(Object.keys(c.frames).sort()).toEqual(['render-0', 'temporal-0']);
  });

  it('is deterministic — the same frames seal to the same root', () => {
    expect(sealCarrier(twoFrames()).root).toBe(sealCarrier(twoFrames()).root);
  });

  it('refuses a frame kind no consumer reads', () => {
    // construction/gene/amp are deferred, not silently accepted. A carrier that
    // accepts a kind nothing reads reproduces the declared-but-unimplemented
    // pathology at carrier scale.
    expect(() => sealCarrier([{ kind: 'construction', frameId: 'c0', packet: {} }]))
      .toThrow(CarrierError);
    expect(CARRIER_FRAME_KINDS).toEqual(['render', 'temporal']);
  });

  it('refuses duplicate frame ids', () => {
    expect(() => sealCarrier([
      { kind: 'render', frameId: 'dup', packet: renderPacket('a') },
      { kind: 'render', frameId: 'dup', packet: renderPacket('b') },
    ])).toThrow(CarrierError);
  });

  it('refuses an empty carrier', () => {
    expect(() => sealCarrier([])).toThrow(CarrierError);
  });
});

describe('falsifier 8: frames are independent', () => {
  it('corrupting frame A does not change frame B checksum', () => {
    const c = sealCarrier(twoFrames());
    const before = c.manifest.find((m) => m.frameId === 'temporal-0').checksum;

    const tampered = structuredClone(c);
    tampered.frames['render-0'].coordinateCount = 999;
    const after = frameChecksum(tampered.frames['temporal-0']);

    expect(after).toBe(before);
  });
});

describe('falsifier 9: the manifest binds the frames', () => {
  it('swapping two frames contents changes the root', () => {
    const a = sealCarrier(twoFrames());
    const swapped = sealCarrier([
      { kind: 'render', frameId: 'render-0', packet: temporalPacket() },
      { kind: 'temporal', frameId: 'temporal-0', packet: renderPacket() },
    ]);
    expect(swapped.root).not.toBe(a.root);
  });

  it('reordering the manifest changes the root', () => {
    const forward = sealCarrier(twoFrames());
    const reversed = sealCarrier([...twoFrames()].reverse());
    expect(reversed.root).not.toBe(forward.root);
  });
});

describe('falsifier 10: tampering is refused, observably', () => {
  it('accepts an untampered carrier', () => {
    const r = verifyCarrier(sealCarrier(twoFrames()));
    expect(r.valid).toBe(true);
    expect(r.badFrames).toEqual([]);
  });

  it('names the tampered frame rather than failing vaguely', () => {
    const c = structuredClone(sealCarrier(twoFrames()));
    c.frames['render-0'].coordinateCount = 999;
    const r = verifyCarrier(c);
    expect(r.valid).toBe(false);
    expect(r.badFrames).toEqual(['render-0']);
    expect(r.reason).toContain('render-0');
  });

  it('detects an edited root even when every frame is intact', () => {
    const c = structuredClone(sealCarrier(twoFrames()));
    c.root = 'f'.repeat(64);
    const r = verifyCarrier(c);
    expect(r.valid).toBe(false);
    expect(r.rootMatches).toBe(false);
  });

  it('detects a frame deleted from frames but left in the manifest', () => {
    const c = structuredClone(sealCarrier(twoFrames()));
    delete c.frames['temporal-0'];
    expect(verifyCarrier(c).valid).toBe(false);
  });

  it('detects a frame present in frames but absent from the manifest', () => {
    // Law 4: the carrier ships whole and the manifest describes ALL of it. An
    // unlisted frame is cargo nobody declared.
    const c = structuredClone(sealCarrier(twoFrames()));
    c.frames.stowaway = renderPacket('x');
    expect(verifyCarrier(c).valid).toBe(false);
  });
});

describe('law 1: selecting does not influence what was sent', () => {
  it('returns the requested frame', () => {
    const c = sealCarrier(twoFrames());
    expect(selectFrame(c, 'temporal-0').contract).toBe('PB-TEMPORAL-FRAME-v1');
  });

  it('leaves the carrier byte-identical after selection', () => {
    const c = sealCarrier(twoFrames());
    const before = JSON.stringify(c);
    selectFrame(c, 'render-0');
    selectFrame(c, 'temporal-0');
    expect(JSON.stringify(c)).toBe(before);
  });

  it('refuses a frame id that is not on the carrier', () => {
    expect(() => selectFrame(sealCarrier(twoFrames()), 'nope')).toThrow(CarrierError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codex/core/blender-bridge/carrier.test.js`
Expected: FAIL — unresolved import.

- [ ] **Step 3: Implement**

Create `codex/core/blender-bridge/carrier.js`:

```js
/**
 * carrier — PB-CARRIER-v1. One sealed carrier holding several complete
 * projections behind a manifest.
 *
 * Four laws, from the sealed projection carrier design:
 *
 *   1. ONE PRODUCER decides what ships. The consumer selects which frame to
 *      READ; it never influences what is SENT. Selecting from a fixed sealed
 *      carrier is not negotiation — that distinction is what survived the
 *      denial of the negotiating-interlocutor design, and it dies if selection
 *      can mutate the carrier.
 *   2. THE CONSUMER NEVER COMPUTES A HASH. Its verification is string equality.
 *      A Merkle proof is not permitted, because computing one means hashing.
 *   3. THE EXPECTED ROOT ARRIVES INDEPENDENTLY. Verifying a carrier against a
 *      value read off that same carrier compares it to itself and cannot fail.
 *   4. SHIP THE CARRIER WHOLE. No lazy frames; a payload ceiling forces FEWER
 *      frames, never fetch-on-demand.
 *
 * WHAT THE CONSUMER CAN AND CANNOT DETECT — declared, not implied:
 *
 *   substituted carrier ............ consumer detects (root != expected)
 *   edited `root` .................. consumer detects (root != expected)
 *   edited frame, root left alone ... consumer does NOT detect
 *   edited frame + updated root ..... consumer detects (root != expected)
 *
 * The consumer verifies IDENTITY, not INTEGRITY: catching an edited frame means
 * recomputing its checksum, which is hashing, which law 2 forbids it. Integrity
 * is this module's job (verifyCarrier), run producer-side before shipping. A
 * design claiming otherwise would be asserting a check it does not have.
 */

import { sha256Hex } from '../pixelbrain/sha256.js';
import { canonicalConstructionStringify } from '../pixelbrain/construction/construction-schema.js';

export class CarrierError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CarrierError';
  }
}

export const CARRIER_CONTRACT = 'PB-CARRIER-v1';

/**
 * Only kinds a consumer actually reads. `construction`, `gene` and `amp` are
 * deferred: a carrier that accepts a kind nothing reads reproduces the
 * declared-but-unimplemented pathology at carrier scale.
 */
export const CARRIER_FRAME_KINDS = Object.freeze(['render', 'temporal']);

const FRAME_SCHEMA = Object.freeze({
  render: 'pixelbrain.render.v1',
  temporal: 'PB-TEMPORAL-FRAME-v1',
});

/** Content digest of one complete projection packet. */
export function frameChecksum(packet) {
  return sha256Hex(canonicalConstructionStringify(packet)).toUpperCase();
}

function computeRoot(manifest) {
  // Binds every frame checksum IN MANIFEST ORDER, so reordering is a different
  // carrier. The frameId is included so a checksum cannot be silently reassigned
  // to a different slot.
  return sha256Hex(
    manifest.map((m) => `${m.frameId}:${m.kind}:${m.checksum}`).join('|'),
  ).toUpperCase();
}

function computeSeal(root, manifest) {
  return sha256Hex(
    `${CARRIER_CONTRACT}:${root}:${canonicalConstructionStringify(manifest)}`,
  ).toUpperCase();
}

/**
 * Seal a set of complete projections into a carrier.
 * @param {Array<{kind: string, frameId: string, packet: object}>} entries
 */
export function sealCarrier(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new CarrierError('a carrier must hold at least one frame');
  }

  const seen = new Set();
  const manifest = [];
  const frames = {};

  for (const entry of entries) {
    const { kind, frameId, packet } = entry ?? {};
    if (!CARRIER_FRAME_KINDS.includes(kind)) {
      throw new CarrierError(
        `unknown frame kind ${JSON.stringify(kind)}. Known kinds: ` +
          `${CARRIER_FRAME_KINDS.join(', ')}. A kind is added when a consumer ` +
          'reads it, never in anticipation.',
      );
    }
    if (typeof frameId !== 'string' || frameId.length === 0) {
      throw new CarrierError('every frame needs a non-empty frameId');
    }
    if (seen.has(frameId)) {
      throw new CarrierError(`duplicate frameId ${JSON.stringify(frameId)}`);
    }
    if (!packet || typeof packet !== 'object') {
      throw new CarrierError(`frame ${frameId} carries no packet`);
    }
    seen.add(frameId);

    manifest.push(Object.freeze({
      kind,
      frameId,
      schema: FRAME_SCHEMA[kind],
      checksum: frameChecksum(packet),
    }));
    frames[frameId] = packet;
  }

  const root = computeRoot(manifest);

  return {
    contract: CARRIER_CONTRACT,
    manifest,
    root,
    frames,
    seal: computeSeal(root, manifest),
  };
}

/**
 * Recompute every checksum and confirm the carrier is internally consistent.
 * This is the INTEGRITY gate and it hashes — which is why it lives here and not
 * in the addon.
 */
export function verifyCarrier(carrier) {
  const fail = (reason, extra = {}) => Object.freeze({
    valid: false, reason, badFrames: Object.freeze([]),
    rootMatches: false, sealMatches: false, ...extra,
  });

  if (!carrier || typeof carrier !== 'object') return fail('carrier must be an object');
  if (carrier.contract !== CARRIER_CONTRACT) {
    return fail(`expected ${CARRIER_CONTRACT}, got ${JSON.stringify(carrier.contract)}`);
  }
  if (!Array.isArray(carrier.manifest) || carrier.manifest.length === 0) {
    return fail('carrier has no manifest');
  }
  if (!carrier.frames || typeof carrier.frames !== 'object') {
    return fail('carrier has no frames');
  }

  const badFrames = [];
  for (const entry of carrier.manifest) {
    const packet = carrier.frames[entry.frameId];
    if (packet === undefined) {
      badFrames.push(entry.frameId);
      continue;
    }
    if (frameChecksum(packet) !== entry.checksum) badFrames.push(entry.frameId);
  }

  // Law 4: the manifest describes the WHOLE carrier. A frame present in
  // `frames` but absent from the manifest is cargo nobody declared.
  const listed = new Set(carrier.manifest.map((m) => m.frameId));
  const unlisted = Object.keys(carrier.frames).filter((id) => !listed.has(id));

  const rootMatches = carrier.root === computeRoot(carrier.manifest);
  const sealMatches = carrier.seal === computeSeal(carrier.root, carrier.manifest);

  if (badFrames.length > 0) {
    return fail(
      `frame checksum mismatch: ${badFrames.join(', ')}`,
      { badFrames: Object.freeze(badFrames), rootMatches, sealMatches },
    );
  }
  if (unlisted.length > 0) {
    return fail(`frames absent from the manifest: ${unlisted.join(', ')}`, { rootMatches, sealMatches });
  }
  if (!rootMatches) return fail('root does not bind the manifest', { sealMatches });
  if (!sealMatches) return fail('seal does not cover the root and manifest', { rootMatches });

  return Object.freeze({
    valid: true,
    reason: 'ok',
    badFrames: Object.freeze([]),
    rootMatches: true,
    sealMatches: true,
  });
}

/**
 * Read one frame off the carrier. Law 1: this is SELECTION, not negotiation —
 * it cannot change what the producer sealed, so it never mutates the carrier.
 */
export function selectFrame(carrier, frameId) {
  const packet = carrier?.frames?.[frameId];
  if (packet === undefined) {
    const known = Object.keys(carrier?.frames ?? {}).join(', ') || '(none)';
    throw new CarrierError(
      `no frame ${JSON.stringify(frameId)} on this carrier. Available: ${known}. ` +
        'The consumer selects from what was sent; it cannot request more.',
    );
  }
  return packet;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/codex/core/blender-bridge/carrier.test.js
npx vitest run tests/codex/core/blender-bridge/
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add codex/core/blender-bridge/carrier.js tests/codex/core/blender-bridge/carrier.test.js
git commit -m "feat(blender-bridge): PB-CARRIER-v1"
```

---

### Task 2: The consumer side

**Files:**
- Create: `blender/addons/scholomance_pixelbrain/carrier_ingest.py`
- Test: `blender/tests/test_carrier_ingest.py`

**Interfaces:**
- Produces: `verify_carrier_root(carrier, expected_root)`, `select_frame(carrier, frame_id)`, `manifest_kinds(carrier)`, `CarrierRootMismatch`.

- [ ] **Step 1: Write the failing test**

Create `blender/tests/test_carrier_ingest.py` asserting: an untampered carrier with the correct independently-supplied root is accepted; a wrong expected root is refused; an empty expected root is refused (the `'' == ''` trap); selecting returns the frame; selecting an absent frame raises; and a static check that the module contains no digest call.

- [ ] **Step 2: Run to verify it fails**

Run: `./scripts/blender-test.sh blender/tests/test_carrier_ingest.py`
Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Implement** `carrier_ingest.py` with string-equality-only verification, refusing an empty expected root, and a module docstring stating plainly that it verifies identity and not integrity.

- [ ] **Step 4: Verify**

```bash
./scripts/blender-test.sh blender/tests/test_carrier_ingest.py
grep -rnE 'hashlib|sha256|md5|digest\(' blender/addons/ ; echo "exit=$? (want 1 — no matches)"
```

- [ ] **Step 5: Commit**

---

### Task 3: Export, re-measure, record

- [ ] **Step 1:** Add the carrier surface to `codex/core/blender-bridge/index.js`.
- [ ] **Step 2:** Run every JS suite, every Blender suite, and all four E2Es, capturing `$?` into a variable before any command substitution.
- [ ] **Step 3:** Update the spec: falsifiers 8–10 with observed results, status header to `Phases 0–6 IMPLEMENTED`.
- [ ] **Step 4:** Commit.

---

## Self-Review

**Spec coverage.** Carrier shape and the four laws → Task 1. Falsifiers 8, 9, 10 → Task 1's test blocks. Falsifier 11 (consumer never hashes) → Task 2 step 4. Frame kinds restricted to `render`/`temporal` → Task 1. Re-measurement → Task 3.

**Type consistency.** `CARRIER_CONTRACT` / `'PB-CARRIER-v1'` across both tasks. `frameId` is the key in `manifest[].frameId` and in `frames{}`. `root` and `seal` are uppercase hex strings from `sha256Hex(...).toUpperCase()`.

**Declared limitation, restated so it is not lost:** the consumer cannot detect a frame edited without a matching root update. That is a consequence of law 2, it is written into the module docstring, and it is tested only on the JS side where hashing is allowed.
