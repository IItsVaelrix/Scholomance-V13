# Blender Bridge — Fully Functional

**Date:** 2026-07-30
**Status:** Phases 0–6 IMPLEMENTED (2026-07-31). All eleven falsifiers green.
**Depends on:** `codex/core/blender-bridge/`, `blender/addons/scholomance_pixelbrain/`,
`codex/core/pixelbrain/temporal/`, commit `e0cee0f9`
**Incorporates:** `2026-07-30-sealed-projection-carrier-design.md` (§5 sequencing, §3 carrier laws)
**Measured against:** Blender 5.2.0 LTS (`fbe6228777e7`, build 2026-07-14), CPU device

---

## 1. Where the bridge actually is

All four E2Es were re-run against Blender 5.2.0 on 2026-07-30 rather than read
from notes.

| E2E | Reports | Reality |
|---|---|---|
| `blender-bridge-e2e` | REPRODUCED 8/8, `3FF3A358` | **Honest.** Asset-dependent since `e0cee0f9` |
| `blender-palette-e2e` | REPRODUCED, "determinism holds" | **Vacuous — measures nothing.** See §1.2 |
| `blender-sim-e2e` | `sim_manifest.json not found` | **Broken.** See §1.3 |
| `cross-engine-e2e` | CAUSES_DIVERGE, 4/7 | **Honest failure.** See §1.4 |

Summary: **geometry crosses and reaches pixels. Appearance does not, in any
channel.**

> **Superseded by Phases 0–2 (2026-07-31).** Appearance now reaches pixels:
> colour byte-exactly per coordinate, and the declared PHOTONIC binding through
> Emission Strength. The palette does *not* reach pixels and is no longer
> claimed to (§4.1). §1 below is retained as the measured starting state — the
> "Reality" column describes the bridge before the work, not now. See §5 for the
> before/after.

### 1.1 The meta-defect: Blender exits 0 on a traceback

`blender -b --python script.py` returns exit status **0** when the script raises
an uncaught exception. Confirmed directly:

```
AttributeError: 'RigidBodyWorld' object has no attribute 'steps_per_second'
Blender quit
BLENDER_EXIT=0
```

Every driver invokes Blender through `execSync`, which throws only on a non-zero
exit. So `catch` never fires, the `[blender] …` line filter yields an empty
string, and the driver reports whatever downstream symptom happens next. **A
Python error inside Blender is currently indistinguishable from success.**

This is listed first because it is the reason the other defects survived: three
broken things all looked fine.

### 1.2 The palette E2E cannot fail

The same claymore rendered under three schools:

| School | Pixel hash | Receipt SCD64 |
|---|---|---|
| ALCHEMY | `A4B6E16C7AF23A0A…` | `010B5CE9…50E85A13` |
| VOID | `A4B6E16C7AF23A0A…` | `010B5CE9…50E85A13` |
| WILL | `A4B6E16C7AF23A0A…` | `010B5CE9…50E85A13` |

Byte-identical pixels and identical receipts. Two independent causes:
`palette.py:apply_palette_to_material()` creates a node group and **never links
it to the material output** — it adds a floating `ShaderNodeGroup` and returns.
And `scene.py:prepare_render_scene()` assigns `materials[0] = pb_emission`, which
would clobber a palette material even if one were attached.

The "✓ Determinism holds. Two palette renders, identical pixels." verdict is
three photographs of the same constant-white silhouette.

### 1.3 The sim E2E is broken by a renamed RNA property

`sim_scene.py:83` sets `rb_world.steps_per_second`. Enumerating the live RNA on
5.2 returns only `substeps_per_frame` and `solver_iterations`. The property was
renamed in Blender 2.91 and the call site never followed.

The units are **not the same quantity**: `steps_per_second = 60` and
`substeps_per_frame = 60` describe different budgets. This is a re-declaration,
not a rename, and must be stated with its reasoning rather than carried across.

### 1.4 `COLOR_LAW` is declared to agree and constructed so it cannot

`render-scd64.js:102` builds the slot from
`viewTransform:look:displayDevice:format:colorDepth`. That is the **output file
format**. Blender writes `OPEN_EXR:32`; the Remotion canvas is RGBA8. They can
never match. Yet `expectedCrossEngineAgreement()` declares `COLOR_LAW:
SHOULD_AGREE`.

The declaration and the construction contradict each other. One of them is wrong;
this design says the construction is.

### 1.5 An alarming outcome shares a label with a benign one

`cross-engine.js:86`:

```js
if (!causesAgree && pixelsAgree) verdict = 'PIXELS_AGREE';
```

Two engines that consumed **different** inputs and produced **identical** pixels
is the most alarming result the comparison can yield. It is reported under the
same verdict as the benign `causesAgree && pixelsAgree`.

### 1.6 The dead letter

`temporal-compiler.js:formatForWire` emits:

```
{ frame, time, projectionChecksum, vertexCount, vertices[{x,y,partId,field}],
  energyBindings, partIds, wireVersion }
```

`ingest.py:ingest_wire` reads `{ coordinateCount, positions, attributes, colors,
energy }`. The two are disjoint — hence `KeyError: 'coordinateCount'`.

The vertices carry no `z` and no colour, because a temporal frame **is animation
state, not a render packet**. It must not be coerced into one.

---

## 2. The colour law, measured

The requirement: under `EXACT` policy, the rendered pixel beneath a coordinate,
converted linear→sRGB and quantized to 8-bit, equals that coordinate's authored
hex **exactly**.

This was proven feasible before being adopted, with a throwaway probe against
Blender 5.2 (6 specimens: `#DCB430`, `#4051B5`, `#FFFFFF`, `#000000`, `#7C3AED`,
`#06B6D4`).

### 2.1 It holds, and it holds conditionally

| samples | pixel filter | byte-exact |
|---|---|---|
| 1 | BOX 0.01 | **6/6** |
| 1 | Gaussian 1.5 | **6/6** |
| 16 | BOX 0.01 | 1/6 |
| 16 | Gaussian 1.5 | 1/6 |
| 64 | Gaussian 1.5 | **0/6** |

The first two rows were initially suspicious: a 1.5px Gaussian over *adjacent*
differing colours must blend neighbours. The scanline shows a perfect step
function — `x=29` α=0, `x=30..35` α=1, `x=36` α=0 — with zero bleed.

**The mechanism is `samples = 1`.** With one sample per pixel there is no
averaging; the filter only chooses *where* that sample lands, and sample 0 of a
symmetric filter lands at the centre. Byte-exactness comes from the sample count,
and the pixel filter is irrelevant at that count.

So `samples = 1` is not a tuning knob. It is part of the `EXACT` contract, and
`configure_deterministic_render` must stop accepting it as a caller preference
under that policy.

### 2.2 A second finding the probe was not looking for

At `samples > 1`, alpha falls to 0.625–0.875. A radius-0.5 disc covers
π/4 ≈ 78.5% of its pixel; the corners are empty. At `samples = 1` the single
centre sample always lands inside the disc, which is why alpha reads exactly
1.000000.

`ingest.py:POINT_RADIUS = 0.5` is documented as making neighbouring points "touch
without overlapping". True — and it leaves pixel corners uncovered. That is
invisible under the `EXACT` render law and would surface immediately under any
other. Recorded, not changed: raising it to ≥ 0.7071 (half-diagonal) would
circumscribe the pixel, at the cost of overlapping neighbours.

### 2.3 Scope of the law

Emission Strength scales emission, so a coordinate with `PHOTONIC ≠ 0` **cannot**
round-trip byte-exactly once Phase 2 lands. The law therefore reads:

> Under `EXACT` policy, at `PHOTONIC = 0`, the rendered pixel equals the authored
> hex byte-exactly.

Stating the scope up front is the difference between a law with a boundary and a
law with a hole. The round-trip falsifier runs against a zero-photonic asset.

---

## 3. Architecture

### 3.1 The colour law is computed once, JS-side

New `codex/core/blender-bridge/color-law.js` owns the transfer function and is
the single source of truth for both consumers.

```
wire.colors.linear = [q(r), q(g), q(b), …]      int32, flat 3N, scale 1e6
wire.colorLaw = {
  policy:        "EXACT",
  transfer:      "sRGB-IEC-61966-2-1",
  viewTransform: "Standard",
  look:          "None",
  samples:       1,
}
```

`wire.colors.color` (packed hex int) is retained for provenance.

Data flow:

```
authored hex
  → color-law.js  srgbToLinear (IEC 61966-2-1)
  → quantize @ 1e6                        [JS, producer]
  ────────────────────────────────────── wire
  → ingest.py   dequantize → FLOAT_COLOR "pb_albedo", POINT domain
  → scene.py    Attribute("pb_albedo") → Emission.Color, strength 1.0
  → Cycles      samples=1, Standard, look None, film_transparent
  → EXR f32 linear → .f32 dump           [Blender, consumer]
  ────────────────────────────────────── receipt
  → linear→sRGB, ×255, round == authored hex
```

Remotion consumes **the same declared linear values**, which is what makes
`COLOR_LAW` able to agree across engines honestly.

This also removes an existing inversion: `palette.py:hex_to_linear()` computes a
transfer function **consumer-side**, contrary to the bridge's founding rule that
the addon "applies values and reports what it applied".

### 3.2 Why not the alternatives

- **Python-side conversion in `ingest.py`.** Smaller wire, but the consumer then
  owns a transfer function, each engine implements it separately, and any drift
  shows up as a `COLOR_LAW` disagreement nobody can attribute.
- **Shader-side unpacking in the node graph.** Most Blender-native and avoids a
  redundant attribute, but the colour law becomes a node graph rather than a
  declared function, and cannot be compared against Remotion's.

### 3.3 Slot ownership

`COLOR_LAW` carries the declared colour contract:
`policy:transfer:viewTransform:look`.
Output file format moves to `ENGINE_LAW`, which is already `EXPECTED_DIVERGE`.

`samples` appears in the wire's `colorLaw` block but **not** in the `COLOR_LAW`
slot canonical. This is deliberate and the two are not in conflict: the wire
block declares `samples = 1` because it is a *precondition of the exactness
claim* (§2.1), while the SCD64 slot excludes it because sample count is already
carried by `LIGHT_BUDGET`. Putting it in both would make `COLOR_LAW` diverge for
a reason that is not about colour.

---

## 4. Phases

**Strictly sequenced. Nothing may start before the one above it is measurably
done.** Phase 0 is first because until it lands, every later phase can silently
"pass".

### Phase 0 — Driver honesty

Every generated Blender script wraps its body in `try/except` and writes a result
sentinel carrying an explicit `ok` flag plus the traceback text on failure. Every
driver requires the sentinel; its absence is a failure, not a missing file.

Falsifier 1 gates this phase.

### Phase 1 — Colour reaches pixels

- `color-law.js` — `srgbToLinear`, `linearToSrgb`, `hexIntToLinearTriple`, the
  `COLOR_LAW` descriptor.
- `wire.js` — emit `colors.linear` and `colorLaw`.
- `ingest.py` — dequantize into `FLOAT_COLOR` `pb_albedo` on POINT.
- `scene.py` — `Attribute("pb_albedo") → Emission.Color`.
- `render_claim.py` — enforce `samples = 1` under `EXACT`; refuse a caller
  override rather than honouring it.
- `palette.py` — **`apply_palette_to_material` is deleted.** See §4.1.

Falsifiers 2, 3, 4 gate this phase.

#### 4.1 The school palette has no declared route to pixels

Once `pb_albedo` drives `Emission.Color`, every pixel's colour is already
determined per-coordinate. A school palette is a per-*asset* accent, and there is
no declared binding that says what it should modulate. Inventing one — "glow
tints the rim", "accent drives specular" — would be exactly the SCR-017 violation
this design refuses for the seven unbound energy types. Art direction is not a
thing to guess at inside a repair.

So `apply_palette_to_material` is deleted rather than linked: it is an
unreachable path that has been reporting success for three schools at once.
`create_palette_node_group` survives, because the palette **does** cross
correctly and that is worth verifying.

Falsifier 4 therefore changes shape. It stops being a pixel claim, which it could
never honestly make, and becomes a crossing claim it can:

> The palette node group's RGB values equal the wire's declared linear values,
> and two different schools produce two different node groups.

Recorded plainly: **the school palette does not reach pixels after this work, and
is not claimed to.** Giving it a route is an art-direction decision with a
declared binding attached, and belongs in its own design.

### Phase 2 — Energy reaches pixels

Only `PHOTONIC` has a declared binding (grade FA → Emission Strength). Only
`PHOTONIC` is wired. The other seven remain raw attributes — SCR-017 forbids
inventing bindings to fill out the table.

Falsifier 5 gates this phase.

### Phase 3 — sim-e2e repair

`steps_per_second` → `substeps_per_frame`, with the step budget re-declared (§1.3)
rather than carried across. Add an RNA-presence guard that fails loudly on a
future rename instead of silently.

Falsifier 6 gates this phase.

### Phase 4 — cross-engine honesty

- Move file format out of `COLOR_LAW` into `ENGINE_LAW` (§1.4).
- Give `!causesAgree && pixelsAgree` its own verdict (§1.5).
- Remotion renders from the declared linear values.

Target: `CAUSES_AGREE + PIXELS_DIVERGE`, reached honestly rather than by the
current accident of Blender painting white while Remotion paints the asset.

Falsifier 7 gates this phase.

### Phase 5 — The dead letter

`formatForWire` emits a real `temporal` frame with its own contract, **and this
phase writes its consumer.** It is not coerced into a render packet (§1.6).

The consumer is written here rather than deferred because Phase 6 carries
`temporal` frames and a carrier frame kind with no reader is precisely the
declared-but-unimplemented pathology this work exists to remove. If Phase 6 is
ever descoped, `formatForWire` is deleted instead — but it does not survive
unread in either case.

### Phase 6 — PB-CARRIER-v1

```
PB-CARRIER-v1
├── manifest: [ { kind, frameId, schema, checksum }, … ]
├── root:     digest binding every frame checksum in manifest order
├── frames:   { <frameId>: <complete projection packet> }
└── seal:     carrier checksum
```

The four laws from the carrier design hold unchanged: one producer decides what
ships; the consumer never computes a hash (string equality only — a Merkle proof
is not permitted, because computing one means hashing); the expected seal arrives
by an independent path; the carrier ships whole.

Frame kinds: `render` and `temporal` only. `construction`, `gene`, and `amp` are
added when a consumer reads them, never in anticipation.

Falsifiers 8, 9, 10 gate this phase.

---

## 5. Falsifiers

Every row is a check that *can* fail. The "Today" column separates what was
measured in this session from what is carried forward — a distinction that
matters, because a carried result is a claim about a tree that has since changed.

Phases 0–2 are **implemented** (plan
`docs/superpowers/plans/2026-07-30-blender-bridge-phases-0-2.md`, commits
`f3e832ba`…`1595bab1`). The "After" column was observed on 2026-07-31, not
predicted.

| # | Claim | Falsifier | Before | After |
|---|---|---|---|---|
| 1 | A Blender failure is detected | Inject a deliberate traceback; driver must exit non-zero | **FAILS** | **PASSES** — `--self-test` |
| 2 | Colour is byte-exact | Probe pixels under known coords; must equal authored hex | no such check | **PASSES** — 6/6 |
| 3 | Colour reaches pixels | Two assets differing only in colour → different receipts | **FAILS** (`437f1e1a`) | **PASSES** — `F03189C3` vs `D844E220` |
| 4 | The palette crosses correctly (§4.1) | Node-group values == wire values; two schools → two node groups | no such check | **PASSES** — 3/3 roles differ |
| 5 | Energy reaches pixels | PHOTONIC variant vs baseline → different receipts | **FAILS** | **PASSES** |
| 6 | The sim chain holds | N chained receipts; cold-start refused | **FAILS** | **PASSES** — 3 distinct digests |
| 7 | Causes can be compared | Two engines, same packet → required slots agree | **FAILS** (4/7) | **PASSES** — `COLOR_LAW` MATCH, 5/7 |
| 8 | Frames are independent | Corrupt frame A ⇒ frame B's checksum unchanged | n/a | **PASSES** |
| 9 | The manifest binds frames | Swap two frames' contents ⇒ `root` changes | n/a | **PASSES** — reorder too |
| 10 | Tampering is refused | A tampered frame is refused, observably | n/a | **PASSES** — names the frame |
| 11 | The consumer never hashes | No digest on the receipt path in `blender/addons/` | *unverified* | **PASSES** — see §5.3 |

Rows 2 and 4 were marked "no such check exists" rather than FAILS. That was the
stronger statement: the palette E2E did not fail, it reported `✓ Determinism
holds` while measuring nothing (§1.2). An absent check and a red check are not
the same condition, and collapsing them is how the first one survives.

Row 3 was re-measured rather than assumed, with geometry held identical so that
colour is the only variable — the earlier `437f1e1a` result compared assets that
also differed structurally.

**Falsifier 2 asserts its own non-vacuity.** `blender/tests/test_color_roundtrip.py`
contains a test that requires the check to FAIL at 64 samples. Without it, a
round-trip that passed for the wrong reason would look identical to one that
passed for the right one.

Rows 6 and 7 went green in Phases 3–4 (plan
`docs/superpowers/plans/2026-07-31-blender-bridge-phases-3-5.md`, commits
`983ead9d`…`85b139c5`). All four E2E drivers now exit 0, which had never
happened before. Row 7's falsifier is restated: literal `CAUSES_AGREE` across
all seven slots was unreachable, because `ENGINE_LAW` is declared
`EXPECTED_DIVERGE`. It now reads "every slot the table marks `SHOULD_AGREE`
agrees" — see §5.2.

### 5.1 What Phases 0–2 changed about the measurements themselves

Three of this spec's own measuring instruments were wrong, and each was found by
a test written before the code:

- **`blender-test.sh` reported PASS for a file that raised at import.** Same
  exit-0 defect as §1.1, in the harness that validates everything else.
- **The colour falsifier counted background as a match.** Film is transparent
  black, so an empty pixel is a perfect `#000000` and a completely blank render
  scored 1/6. It now requires `alpha == 1`.
- **The camera was never in canvas space.** `frame_camera_on` fits *asset* bounds
  with a 1.15 margin, so a 64-wide canvas holding a 32-wide asset renders at
  `ortho_scale` 37.95 and pixel (x, y) is not coordinate (x, y). §3.1 declared
  canvas-space framing; the addon predated it and disagreed.

A fourth was in a verification loop written during execution:
`printf ... "$(basename $t)" "$?"` reports exit 0 for every file, because the
command substitution resets `$?` while the arguments are being built. It briefly
showed a known-red suite as green.

**Falsifier 2 is the model**, because its failure mode is demonstrated rather than
assumed: 6/6 at `samples=1`, 0/6 at `samples=64` with a Gaussian filter. A check
whose failure mode has been observed is worth more than one that has only ever
been green.

### 5.2 What Phases 3–5 found

Each defect below was hidden behind the one above it, and each was found by
running the thing rather than reading it:

- **`steps_per_second` was hiding a simulation that never ran.** With the
  `AttributeError` gone, every rigid body function turned out to read
  `obj.location.z` — but the solver writes to the evaluated depsgraph and never
  back to the authored transform, so the falling cube read `3.0` at every frame.
  `verify_scene_determinism` was comparing the constant `3.0` against the
  constant `3.0` and calling the simulation deterministic. It could not have
  failed for any simulation, including one that was not running.
- **`test_cold_vs_warm_divergence` did not test cold.** It conceded in a comment
  that it couldn't, and asserted only the warm side. Measured now: warm stepping
  gives `z = 3.000, 2.861, 2.306, 0.529, 0.500` at frames 1, 5, 10, 20, 30;
  cold seeking gives `3.000` at every one.
- **`healthy` was a check that could not PASS.** Defined as all seven causes
  matching, while `ENGINE_LAW` is declared `EXPECTED_DIVERGE` — unreachable for
  any correct pair of engines. It left the driver printing `✓ HEALTHY` while the
  module reported `healthy: false`. This is the mirror image of the pathology in
  §1.2, and worth naming as its own species: a check that cannot pass is
  eventually *disabled*, whereas a check that cannot fail is eventually *trusted*.
- **There were two claim builders.** `buildRemotionClaim` (used by tests) and
  `buildCanvasClaim` (used by the E2E). Fixing only the first left `COLOR_LAW`
  diverging in the E2E for a bookkeeping reason.

### 5.3 Falsifier 11 was never verified, and its wording was wrong

Row 11 was carried as "passes" from the original spec and re-recorded as
"measured 07-30" during Phases 0–2. **The grep was never run.** Running it in
Phase 6: `classify.py` imports `hashlib` and calls `sha256().hexdigest()` twice.

The law it states is also too broad as written. What matters is that no
consumer-computed digest reaches a **receipt** or a **verification decision** —
otherwise a receipt is self-attested and a seal compares a packet to itself.
`classify_feature` hashes two in-process states to test them for equality and
returns `CONSERVATIVE` or `PATH_DEPENDENT`; that result is a classification, and
never a receipt slot.

So the row is narrowed rather than declared green — and the narrowing is itself
checked, because an exemption nobody re-checks is how a narrowed law becomes no
law. `test_carrier_ingest.py` carries three assertions: the receipt path computes
no hash; `classify.py` imports nothing from the receipt, claim or packet modules
(if it ever does, its digests can reach a receipt and the exemption stops
holding); and the exempt list never grows to cover a module that mints claims.

The process lesson is the same one this spec keeps recording, turned on the
author: a row marked "measured" that was not measured is indistinguishable, from
the outside, from one that was.

### 5.4 What Phase 6 delivers, and what it does not

`PB-CARRIER-v1` ships. Measured end to end on 2026-07-31: a carrier holding a
788-coordinate render packet and a compiled temporal frame, sealed JS-side,
crossed into Blender, root verified by string equality against an independently
delivered value, both frames selected and ingested by their own readers — and a
wrong expected root refused.

**What the consumer cannot do, declared rather than implied.** Laws 2 and 3
bound it:

| tampering | consumer (string equality) | JS `verifyCarrier` |
|---|---|---|
| carrier substituted wholesale | detected | detected |
| `root` edited | detected | detected |
| a frame edited, `root` left alone | **NOT detected** | detected |
| a frame edited *and* `root` updated | detected | a different, self-consistent carrier |

The consumer verifies **identity**; this bridge's JS side verifies **integrity**.
Catching an edited frame means recomputing a checksum, which is hashing, which
law 2 forbids the consumer. A design implying otherwise would be claiming a check
it does not have — the shape of every defect in §1.

---

## 6. Explicitly not in this design

- **Bindings for the seven unbound energy types.** SCR-017. A binding is declared
  with a grade and evidence, or it does not exist.
- **Negotiation, capability declaration, adaptive frames, lazy frames.** Denied
  with numbers in the carrier design §2 and §4. Not reopened here.
- **`construction`, `gene`, `amp` carrier frames.** Deferred until a consumer
  reads them.
- **Changing `POINT_RADIUS`.** Recorded in §2.2 as a known property of the
  current encoding, not fixed as part of this work.
- **GPU rendering.** Only a CPU device exists on this machine (CUEW init fails).

---

## 7. Risks

- **Phase 2 narrows Phase 1's law.** Mitigated by declaring the `PHOTONIC = 0`
  scope in §2.3 before Phase 2 starts, and by running falsifier 2 against a
  zero-photonic asset.
- **Blender 5.2 RNA drift.** §1.3 is one instance; there will be others. The
  Phase 3 presence-guard pattern should be applied wherever the addon touches a
  renamed-prone property.
- **Falsifier 2's exactness could be brittle across Blender versions.** It is
  pinned to the version in the header. If a future Blender changes sample-0
  placement, the check fails loudly — which is the correct behaviour for a law
  that claims byte-exactness, and better than a tolerance that hides the change.
- **The carrier has a payload ceiling.** A 30 MB payload has OOM-killed this
  backend before. Let that force *fewer frames*, never lazy fetch.
