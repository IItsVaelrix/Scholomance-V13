# PixelBrain at Maturity: A Theoretical Paper on Runtime Asset Synthesis for Phaser 4

## Status

**THEORY — NOT CANON.** This document is speculative. It describes what I (Claude,
having just audited the current system) *think* PixelBrain becomes if its own
trajectory is carried to completion. It makes no claim about the present. Every
section that describes today's system cites the file that proves it; every section
that describes the future is written in the conditional and should be read that way.

This paper exists per a standing instruction to write it now, distinct from the
separate standing instruction (`project-pixelbrain-s-rating-paper-trigger`) to write
the *actual, current-state* capability paper once a fresh `/savage-audit` returns an
S. That paper will describe what PixelBrain **is**. This one describes what I think
it could **become** — write from the trajectory, verify nothing here against
production behavior.

As of this writing (2026-09-05, commit `e501f89c`), the AMP activation substrate this
paper leans on hardest is graded **B-**: real, tested, and shipped, with a known
drift-detection gap and 23 of 39 AMPs still outside its authority. That grade is the
floor this theory is built on top of, not a ceiling it's already cleared.

---

## 1. What Actually Exists Today (the launching pad)

Four real subsystems, each independently documented and tested, currently run as
**parallel, only loosely-coupled** pipelines:

| Subsystem | What it does today | Where |
|---|---|---|
| **SCDL compiler** | Parses a vector/cell asset DSL (paths, symmetry, materials, booleans) into a coordinate packet through a fixed pass pipeline | `codex/core/pixelbrain/scdl/` |
| **VRI (Vixel Render IR)** | Compiles an SCDL packet into a frozen, checksummed lighting/material/atmosphere scene, then deterministically renders it to RGBA in 7 fixed passes | `codex/core/pixelbrain/vixel/`, canon: `ARCH-2026-09-04-VIXEL-RENDER-IR.md` |
| **AMP activation substrate** | Decides *which* of PixelBrain's asset-modification passes a given item spec needs, as checksummed, queryable data instead of a scattered `if` — 16 of 39 real AMPs wired so far, `item` pipeline only | `codex/core/pixelbrain/amp-substrate/` |
| **Phaser combat/world layer** | Loads pre-baked PNG frame sequences at scene preload and plays them as sprite animations; procedural effects (e.g. ice-smoke) are generated ad hoc at runtime via Canvas ImageData, entirely outside PixelBrain | `src/phaser/*.js`, `src/game/combat/*.js` |

The load-bearing fact for everything below: **the Phaser layer does not know PixelBrain
exists.** `combatSceneShared.js`'s `preloadPlayerRigAssets()` loads static files from
`/generated-assets/IdealHuman/IdealHuman-f0-png.png` through `f8`— nine pre-rendered
frames, baked once, offline, before the game ever runs. PixelBrain today is a *build-time
compiler*. Phaser 4 is a *runtime consumer of its output*, with a filesystem path as the
entire interface between them.

Everything in this paper is one question: **what happens when that filesystem path
becomes a function call?**

---

## 2. What "Fully Mature" Has to Mean First

Before any of the runtime capabilities below are plausible, three things that are
*not yet true* would need to become true — this is the actual maturity bar, not a
hand-wave:

1. **All 39 AMPs wired, all 8 named pipelines live**, not just `item`'s 16. The
   design spec already named the remaining seven
   (`docs/superpowers/specs/2026-09-04-amp-relevance-full-wiring-design.md` §7):
   `chestplate-fidelity`, `render-fidelity`, `voxel-world`, `character`,
   `image-lattice`, `cross-cutting`, `runtime`. Two of those AMPs (`gear-glide-amp`,
   `hair-flow-amp`) don't gate on spec content at all — they're always-relevant by
   nature, which the schema already supports (`appliesTo: []`). One
   (`shadow-perception-amp`) has no confirmed real caller yet. Full wiring means
   resolving that, not asserting it.
2. **The drift hole closed.** Today `pilot-relevance.generated.js` (browser-safe,
   what the hot path reads) and `pilot-relevance/*.json` (the CLI/DB's source) are
   two representations of the same data with a doc-comment promising they stay in
   sync and zero tests checking it. A mature system that claims to be the single
   arbiter for a live game's visual decisions cannot have an undetectable split-brain
   in its own data.
3. **VRI Door B stops being opt-in.** Per the VRI canon's own "Open Surfaces"
   section: *"No production caller forces it yet; adoption is a per-caller
   decision."* Everything in §3 below assumes VRI-rendered output is the *default*
   path for anything Phaser touches, not an opt-in flag nobody has flipped.

None of what follows is real until those three are. I'm stating that up front because
this codebase's own documentation culture (`ARCH-2026-09-04-VIXEL-RENDER-IR.md`'s
"Open Surfaces (honest)" section, the VIXEL verdict series) treats an unmarked
aspiration as a lie by omission. I don't want this paper to be the next thing a future
audit has to correct.

---

## 3. Theoretical Capability I: Live, Checksum-Deduplicated Asset Synthesis

**The mechanism that makes this plausible, already built:** every layer in the real
pipeline — the SCDL packet, the VRI scene, the raster — is **content-addressed**.
`asset-pipeline.js`'s `PB-ASSET-LINEAGE-v1` chain already records
construction-checksum → packet-id → scene-checksum → raster-digest for every frame
compiled today, for exactly one reason: so identical inputs are provably identical
outputs. That property doesn't currently save any work — it's an audit trail. At
maturity, it becomes a cache key.

**The theory:** a loot table spawns "a `void_gold` chestplate with a `holyfire`
enchant" at runtime. Today, that spec either doesn't exist as a rendered sprite yet
(needs an offline forge pass) or exists as one of a small hand-authored set. At
maturity: `forgeItemAsset(spec)` runs in-process, `selectActiveAmps('item', spec,
records)` decides which of the (by then) full AMP roster actually applies, VRI
compiles and renders it, and the resulting raster's digest is checked against a
runtime cache *before* a single pixel is uploaded to the GPU. If a hundred players
each get their own "roll" on the same enchant combination, the fortieth one that
resolves to a byte-identical checksum costs a cache lookup, not a render. Phaser 4's
own texture manager becomes the cache's storage layer — a texture keyed by
`raster-digest` instead of by a filename, added once via `scene.textures.addBase64`
or an equivalent runtime-texture API, reused forever after.

This is not a new idea bolted onto PixelBrain — it is the *literal, stated purpose*
of `PB-ASSET-LINEAGE-v1` finally being spent on something other than proving its own
honesty.

---

## 4. Theoretical Capability II: One Light, Everywhere

**What's real:** VRI's lighting model is physically-motivated and law-compliant —
`direction` is a to-light vector, lighting is multiplicative and
reference-normalized, no RNG, byte-identical on repeated compiles (`ARCH-2026-09-04-
VIXEL-RENDER-IR.md`, Invariant 2, Law 6). Every VRI-rendered item today is lit
according to *some* fixed light direction, baked into the raster at compile time.

**What's missing, and what makes it theoretical:** nothing today threads a Phaser
scene's actual light source (its camera angle, its time-of-day system, its
per-region ambient tint) back into `compileVRI`'s light `direction` parameter before
an item's sprite is generated. The two systems each have an opinion about where the
light is, and they've never been introduced.

**The theory:** at maturity, a scene's key-light direction becomes a parameter the
runtime asset-synthesis call from §3 passes straight through to VRI. An item picked
up at dusk on the eastern battlements renders with light raking from the correct
angle for that scene, at the moment it's synthesized — not a fixed studio angle
baked in once and reused everywhere regardless of context. Because VRI's lighting is
already deterministic and multiplicative rather than learned or randomized, this
isn't a rendering-quality gamble — it's threading one already-correct number through
a boundary that currently stops at the compiler's default. The synthetic-relief
technique (`PB-VRI-RELIEF-v1`) — which already projects authored value-ramp rank
onto the key light's in-plane direction for cells with no real geometry — is exactly
the mechanism that would make a foundry item's *shading*, not just its unlit base
color, respond to where in the world it actually is.

The honest caveat this section owes the reader, in the house style: VRI's own canon
already states Door C (character rendering) is a rasterizer-swap, not a lighting
upgrade, because character cells carry baked shading and no material/vector
identity. The same honest limit would apply to any live-lighting claim for
characters specifically, unless the character pipeline separately gains the vector
identity items already have. This capability is genuinely available for `item`
today's-AMP-covered assets; it is *not* free for the character pipeline without
separate work this paper is not claiming has happened.

---

## 5. Theoretical Capability III: Enchantment as a Live Re-Skin, Not a New Item

**What's real:** an AMP relevance record's `appliesTo` predicate reads spec fields
like `parts.profile`, `class`, `archetype` — the same fields a live gameplay system
already mutates when an item is enchanted, socketed, or upgraded. The selector that
decides which AMPs activate (`amp-selector.js`) is a pure function: same spec in,
same activation set out, no hidden state.

**The theory:** enchanting an item in-session doesn't need to swap in a
pre-authored "enchanted variant" sprite from a finite art budget. It mutates the
spec's `parts` array (adding the `holyfire_motif` profile the existing
`holyfire-motif-amp` pilot record already gates on, real today), re-runs
`selectActiveAmps` against the *same* spec object, gets back a new activation set
that now includes `holyfire-motif-amp`, and re-forges. Because the pipeline is
deterministic and checksum-addressed (§3), re-forging the same base item with one
added enchant produces a texture that differs from the unenchanted version by
exactly the pixels the enchant's AMP actually touches — verifiable by diffing the two
rasters, not by trusting that the artist remembered to keep the variants consistent.
The player sees a live re-skin. The engine sees a cache miss on one new checksum.

This is the single clearest case in this paper where the theory is *closer* than it
looks: nothing about it requires new architecture, only wiring the remaining AMPs
and removing the opt-in flag from §2. It requires zero new ideas — it requires
finishing the ones already checked in.

---

## 6. Theoretical Capability IV: A Rig That Answers to the Game, Not Just the Forge

**What's real:** PixelBrain has an actual limb rig — forward-kinematics joint
angles driving per-segment `.scdl` sources (`armRig.js`, referenced in memory as the
first genuinely-rigged legs in the repository, `photo1_lit`). Phaser's combat layer
today loads a fixed 9-frame walk cycle as static PNGs
(`combatSceneShared.js:9-19`) — a joint-angle rig compiled once into a handful of
baked poses.

**The theory:** at maturity, the rig's joint-angle parameters become something a
live Phaser 4 animation system can drive continuously, not just sample at 9 fixed
export points. A character's stride length responding to actual movement speed, a
called shot changing an arm's raised angle mid-swing, a wounded-limb debuff visibly
shortening a stride — all of these are "evaluate the rig at a joint-angle vector the
game computed this frame" rather than "which of nine pre-baked frames is closest."
The constraint this has to survive, honestly stated: the rig's `.scdl` → VRI/raster
path is not yet fast enough to run at 60fps per limb per frame for a whole combat
roster — this capability depends on the runtime-cache mechanism from §3 doing enough
of the work that only *genuinely new* joint-angle configurations ever hit the
compiler, with interpolation between cached rasters filling the gaps. Absent that,
this stays a build-time rig, just a more expressive one.

---

## 7. Theoretical Capability V: "Why Does This Look Like This" as a Dev Tool, Not an Audit Trail

**What's real:** the lineage chain (§3) already lets `verifyLineage()` re-derive
every downstream identity from a construction checksum, and the innate immune
layer's `LINEAGE-0F0D` rule already consumes exported lineage sidecars to catch
corruption (`ARCH-2026-09-04-VIXEL-RENDER-IR.md`, Immunity Coupling). Right now this
exists purely as a correctness guard — it fires when something is *wrong*.

**The theory:** the same chain, surfaced as a dev-mode overlay inside a live Phaser
4 scene, turns "why does this sword look like that" from a question that requires
re-running a CLI into a click. Select a rendered sprite in-scene, and the overlay
walks construction checksum → SCDL packet → VRI scene checksum → raster digest,
showing which AMPs activated and why (the `amp_activation_log` table already records
`activated`/`skipped` with reasons, per spec, per selection — this data exists
today, just never rendered anywhere a human looks at it during play). This
specifically serves the exact failure mode this session's own audit found in `Task
9`'s parked risk: if an AMP's registry record is ever edited in a way that changes
what a live scene renders, a lineage-aware dev overlay is the fastest possible way
to notice, days before a player report does.

---

## 8. What Phaser 4 Specifically Has to Offer This, Honestly Scoped

I have not done a deep audit of the Phaser 4 API surface for this paper — the
package is pinned (`phaser: ^4.2.1`) and in real use across combat, world, and read-
mode scenes, but I'm not going to cite specific Phaser 4 methods I haven't verified
against this repository's actual usage. What I *can* say with confidence, because
it's true of any modern WebGL-backed 2D engine and Phaser 4 specifically markets
itself on it: a runtime texture manager that accepts dynamically-generated bitmap
data keyed by an arbitrary string, and a render-pipeline model that doesn't require
every texture to originate from a preload-time file load, are baseline capabilities
of the engine generation. That is the *only* Phaser-side requirement this entire
paper depends on. Everything above is a PixelBrain-side capability; Phaser 4's job
in this theory is small and specific: accept a checksum-keyed bitmap at runtime
instead of only at preload. If that assumption is wrong for this specific pinned
version, this whole paper's Phaser-facing half needs re-grounding before anyone
acts on it — which is exactly the kind of thing a reader should verify against the
actual Phaser 4 changelog before treating any of this as a plan.

---

## 9. Falsifiers — What Would Prove This Wrong

In the spirit of this codebase's own verdict culture, here is what should make a
future reader distrust this paper rather than act on it:

- If a fresh `/savage-audit` of the full AMP system (all 8 pipelines, not just
  `item`) does not reach at least A- before any of §3–§7 is attempted, the
  foundation this paper stands on isn't load-bearing yet. Build the foundation
  first — see `project-pixelbrain-s-rating-paper-trigger`.
- If the per-frame cost of `forgeItemAsset` → VRI compile → VRI render, measured
  headed (not headless — per `project-web-perf-measure-headed`, headless
  environments rasterize differently and do not predict real frame cost), exceeds a
  single frame budget by an order of magnitude even for a cache *miss*, §3's
  "synthesize live, cache the checksum" model needs a background-thread or
  pre-warm strategy this paper does not currently propose.
- If character cells never gain real material/vector identity (VRI Door C's
  honest limit, unresolved as of this writing), §4 and §6's claims narrow to
  `item`-pipeline assets only — armor and weapons, not the characters wearing them.
- If nobody closes the drift hole named in §2.2, none of this should ship, because
  a live game consuming PixelBrain output would inherit that split-brain as a
  runtime bug instead of a documentation footnote.

---

## 10. Closing

Every mechanism in this paper is a *composition* of something already built and
tested, not an invention: checksummed lineage becomes a cache key, a deterministic
light model becomes a live parameter, a pure selector function becomes a live
re-skin trigger, a debugging chain becomes a dev overlay. That's the honest reason I
believe this direction over some other one — I'm not proposing PixelBrain grow a new
organ, I'm proposing it finally get to use the organs it already has for something
other than proving to an auditor that they work. Whether it gets there depends
entirely on the unglamorous work named in §2, none of which is done yet, and none of
which this paper should be mistaken for having done on its behalf.
