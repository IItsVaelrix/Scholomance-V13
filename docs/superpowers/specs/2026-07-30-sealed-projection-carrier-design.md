# Sealed Projection Carrier — Design

**Date:** 2026-07-30
**Status:** Proposed
**Supersedes discussion of:** "interlocutor" negotiating layer (denied), "melanin" adaptive frames (denied)
**Depends on:** `codex/core/blender-bridge/`, `codex/core/pixelbrain/temporal/`, commit `e0cee0f9`

---

## 1. The problem, measured

PixelBrain produces several kinds of output. Exactly one of them can cross into
Blender.

| Output | Contract | Crosses today |
|---|---|---|
| Render packet | `pixelbrain.render.v1` | Yes — the only thing the wire carries |
| Construction IR | `PB-GEOMETRY-CONSTRUCTION-v1` | No |
| Temporal frames | `PB-TEMPORAL-COMPILED-v1` | No — `formatForWire` emits an unreadable shape |
| SCDNA art genes | art-direction intent | No |
| Render-fidelity intermediates | 8 AMP stages | No — only final coordinates |

`wire.js:toPythonWire` reads `packet.coordinates/canvas/bytecode/kind/checksum`.
`ingest.py:ingest_wire` reads `coordinateCount/positions/attributes/colors/energy`.
`temporal-compiler.js:formatForWire` emits `frame/time/projectionChecksum/
vertices/energyBindings/partIds`. The third intersects neither of the first two:
a temporal frame handed to `ingest_wire` raises `KeyError: 'coordinateCount'`.

**This is a real gap.** It is also narrower than it looks — see §2.

### 1.1 The prior constraint that must not be forgotten

Twenty-four named attributes already cross and land on the POINT domain, in
exactly the shape Geometry Nodes reads. **Nothing reads them.** Measured
2026-07-30: two assets differing only in colour, plus a PHOTONIC-energised
variant, all render to the same pixel hash `437f1e1a`. Widening what crosses
while the existing channel is unconsumed reproduces the declared-but-
unimplemented pathology at higher cost.

---

## 2. What was tested, and what came back

Three Concept Chemistry runs, each gated on *winner beats every control* — never
on `STABLE_MIN`, which no candidate in any run reached. Scripts:
`scripts/concept-chem-interlocutor.mjs`, `scripts/concept-chem-melanin-fiche.mjs`.

### 2.1 The negotiating interlocutor — DENIED

| Reading | hand | encyclopedia |
|---|---|---|
| `H/interlocutor-negotiates` | 0.1259 (−0.1803) | 0.2856 (−0.0853) |
| `A/second-projection-not-negotiation` | **0.3111 (+0.0049)** | **0.5052 (+0.1343)** |

Below the bar in both runs. Polarity separated **against** consumer-initiation
twice (−0.1201, −0.0586): the engine consistently prefers the producer declaring
what may be had. `control/false-friend-coverage` — *"any boundary that fails to
carry every producer format is a defect"* — scored 0.3709, the **top control** in
the corpus run, beating most real candidates. That inference is seductive and
wrong: a boundary that narrows is a projection working.

### 2.2 Melanin (frames adapting to observed reads) — DENIED

The run existed to answer one question: is "responds to observed reads" distinct
from "consumer requests"?

| Separation | hand | encyclopedia |
|---|---|---|
| melanin vs `control/false-friend-request` | **−0.0978** | **−0.0126** |
| melanin vs `control/false-friend-polarity` (forecast) | +0.0641 | +0.0342 |

It is not distinct. In the hand run the request framing outranks it outright.
Melanin *is* distinguishable from prediction — "the light already landed" is real
— but that was never the contested axis. Usage-driven feedback is a request with
a delay, and the request framing was already denied in §2.1.

**Do not rebuild this.** It is recorded here with numbers precisely so the idea
is not rediscovered as novel in three months.

### 2.3 The carrier — SUPPORTED

| Reading | hand | encyclopedia |
|---|---|---|
| `H/fiche-carrier` | 0.1893 (−0.1350) | **0.5001 (+0.1866)** |
| `A/second-projection-plain` (incumbent) | 0.3102 | **0.5052** |

Tied with the incumbent in the corpus run (−0.0051). That is the correct result:
the carrier is not a rival to "more sealed projections", it is *packaging* for
it.

### 2.4 Honest limits of this evidence

- The **hand-corpus runs have low discriminative power** on this question:
  `control/law-violation` was the top control in both melanin runs and the
  highest-scoring item overall in one. When a control beats the field, that run
  ranks nothing. The corpus runs carry the weight here.
- **Every corpus-run PMI was negative** (`REPULSION`, −0.156 to −10.000). No
  framing in this question — including the recommended one — has paragraph-level
  precedent in the encyclopedia. Treat all of §2 as ordinal direction, not
  endorsement.
- `lawNote` did **not** flag `control/law-violation` ("let the consumer hash and
  mint its own receipt") as a violation; it returned `LAW_NEUTRAL` while scoring
  the strongest bond in the field (+0.4506). The law gate is not a safety net.

---

## 3. Design

One sealed carrier holding several **complete** projections behind a manifest.

```
PB-CARRIER-v1
├── manifest: [ { kind, frameId, schema, checksum }, … ]
├── root:     digest binding every frame checksum in manifest order
├── frames:   { <frameId>: <complete projection packet> }
└── seal:     carrier checksum
```

### 3.1 Laws it must obey

These are not preferences. They are the bridge's founding constraints, and the
carrier is only worth building if it preserves them.

1. **One producer.** The producer decides what is on the carrier. The consumer
   selects which frame to *read*; it never influences what is *sent*.
   Selecting from a fixed sealed carrier is not negotiation — this is the
   distinction that survives §2.1, and the design dies without it.
2. **The consumer never computes a hash.** Verification is string equality at
   every level: frame checksum vs its manifest entry; manifest checksum vs a
   value supplied through a path independent of the carrier. A Merkle-style
   proof is *not* permitted, because computing one means hashing.
3. **The expected seal arrives independently.** Per `e0cee0f9`: handing the
   consumer a packet and asking it to check the packet against its own embedded
   checksum compares the packet to itself and cannot fail.
4. **Ship the carrier whole.** See §4.

### 3.2 Frame kinds (initial)

Only two at first. See §5 for why the list is short.

| Kind | Contract | Consumer |
|---|---|---|
| `render` | existing wire projection | `ingest.py` (unchanged) |
| `temporal` | per-frame state + `projectionChecksum` | new; replaces `formatForWire` |

`construction`, `gene`, and `amp` frames are **deferred**, not designed. They are
added when a consumer reads them, never in anticipation.

---

## 4. Explicitly not in this design

- **Negotiation / capability declaration.** Denied §2.1. A consumer that declares
  capabilities and selects its own receipt family is a second author of
  requirements and breaks law 1.
- **Melanin / adaptive frames.** Denied §2.2.
- **Lazy frames fetched on demand.** `A/lazy-frames-on-demand` cleared the bar in
  the corpus run (0.3347, +0.0212) and is still excluded, because it reintroduces
  the request/response exchange that §2.1 denied — the carrier stays
  producer-initiated *only if it ships whole*. Ship it entire or admit the design
  chose negotiation. There is a payload ceiling behind this (a 30 MB payload has
  OOM-killed this backend before); let that constraint force *fewer frames*, not
  lazy fetch.
- **A new wire format.** The existing render projection is unchanged and remains
  a frame on the carrier.

---

## 5. Sequencing

**Nothing on this list may start before the one above it is measurably done.**

1. **Fix the dead letter.** `formatForWire` emits a shape `ingest_wire` cannot
   read. Make it emit a real wire packet, or delete it. Independent of this
   design; needed regardless.
2. **Consume what already crosses.** Bind `pb_color_*` to shading so colour
   reaches a pixel. `A/consume-before-widening` cleared the bar in the corpus run
   (0.3268, +0.0133). Until two assets differing only in colour produce different
   receipts, adding frames adds unread data.
3. **Then** the carrier, with `render` + `temporal` only.

---

## 6. Falsifiers

This codebase's recurring defect is checks that cannot fail — three were found in
this bridge on 2026-07-30 alone (a receipt describing the factory cube, a seal
compared against itself, an unreachable `FAIL` branch). The carrier gets its
falsifiers written before its implementation.

| Claim | Falsifier | Fails today? |
|---|---|---|
| Frames are independent | Corrupting frame A's bytes must not change frame B's checksum | n/a |
| The manifest binds the frames | Swapping two frames' contents must change `root` | n/a |
| Verification can fail | A tampered frame must be refused, with the refusal observable | n/a |
| The consumer never hashes | Static check: no digest call in `blender/addons/` | passes now |
| Colour reaches pixels | Two assets differing only in colour must produce different receipts | **FAILS** (`437f1e1a`) |
| Different assets differ | `blender/tests/test_render_visibility.py` | passes since `e0cee0f9` |

The last two are the model: each is a statement that *could* be false and is
checked by running the real thing, not by asserting a recomputation of it.

---

## 7. Open questions

1. **Frame checksum family.** `render` frames receipt against pixels; `temporal`
   frames against `projectionChecksum`. Does the manifest record which family per
   frame, or does the carrier mandate one? Recording it per frame edges toward
   the consumer choosing a receipt family, which §2.1 denied — resolve before
   implementing.
2. **Re-seal granularity.** Changing one frame changes `root`, so every consumer
   sees a changed carrier even where its own frame is byte-identical. Acceptable,
   or does the manifest need a per-frame revision?
3. **Does the temporal layer need the carrier at all**, or does fixing
   `formatForWire` (§5.1) close the only real gap? If §5.1 and §5.2 land and
   nothing else is blocked, this design may not need to be built. That outcome
   should be welcomed, not resisted.
