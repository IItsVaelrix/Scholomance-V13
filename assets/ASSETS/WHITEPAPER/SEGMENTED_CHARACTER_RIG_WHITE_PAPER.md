# Segmented Character Model and Limb Rig White Paper
## A Working Manual for AI Agents

## Bytecode Search Code
`SCHOL-ENC-BYKE-SEARCH-WP-SEGMENTED-CHARACTER-RIG`

**Date:** 2026-08-31
**Audience:** AI agents authoring, animating, or extending character assets
**Scope:** Humanoid proportion canon, form-aware pixel shaders, segmented part generation, 2D forward-kinematics limb rig, pose-driven animation
**Primary source:**
- `codex/core/pixelbrain/humanoid-proportion-canon.js`
- `codex/core/pixelbrain/pixel-art-shaders.js`
- `scripts/build-character-model.mjs`
- `src/game/combat/armRig.js`
- `src/data/photo1RigConfig.js`, `src/data/void1RigConfig.js`

**Commit:** `208588a` — `feat(pixelbrain): generate segmented humanoid character models`

---

## 1. What This System Is, And What Problem It Solves

A character in this engine can be authored two ways. Know which one you are in
before you touch anything.

| | **Flat sprite** | **Segmented rig** (this paper) |
|---|---|---|
| Asset | one `.scdl`, one raster | one `.scdl` **per limb segment** |
| Animation | redraw geometry per frame | **rotate segments about joints** |
| New motion | new hand-drawn frames | new joint angles |
| Example | `Void1-walk.scdl` legs | `photo_1_lit` legs, Void1 arms |

**A flat shape that is relocated never reads as a limb.** This is the load-
bearing fact of this whole system. Translating a rectangle, stretching it,
bobbing the body it hangs off, widening it — all were tried on a real asset and
all were rejected on sight. What reads as a limb is a shape that **rotates
about a fixed joint**, with the child joint carried through the parent's
rotation. That requires the character to be cut into segments *before* any
animation work begins.

If you are asked to animate a character and the character is a single flat
drawing, the answer is not a cleverer per-frame redraw. The answer is to
segment it first.

---

## 2. System Map

```text
humanoid-proportion-canon.js       figure landmarks as FRACTIONS of height
        │                          (crotch at 1/2, knee at 3/4, elbow at waist…)
        ▼
   resolveCanon({top,height,centerX})  ->  { y, width, joints, headCount }
        │
        ▼
build-character-model.mjs          part occupancy (capsules / masses)
        │
        ▼
pixel-art-shaders.js               shadeCylinder (tubes) | shadeMass (heads)
        │                          -> [{x, y, color}]
        ▼
   one .scdl per part              drawn in SHARED canvas space, at rest
        │
        ▼ (SCDL CLI: compile --export json,png)
   one PNG per part
        │
        ▼
<character>RigConfig.js            joints + segment chains + named poses
        │
        ▼
armRig.js  solveArm(limb, angles)  -> [{key, jointX, jointY, angleRad}]
        │
        ▼
   compositor                      rotate each segment about its pivot,
                                   place at the solved joint
```

---

## 3. The Proportion Canon

`codex/core/pixelbrain/humanoid-proportion-canon.js`

Landmarks are **fractions of total figure height**, never pixel constants, so
one canon drives any canvas size. The fractions are the standard artistic
figure canon, adjusted for a stylized game sprite.

```js
import { resolveCanon, JOINT_OVERLAP } from './humanoid-proportion-canon.js';
const canon = resolveCanon({ top: 2, height: 44, centerX: 16 }); // 32x48 canvas
```

Resolved for the reference figure (**4.35 heads tall**, matching Void1):

| landmark | y | rule it satisfies |
|---|---|---|
| crown | 2 | — |
| chin | 12 | head = 1 unit |
| shoulder | 14 | — |
| chest | 18 | — |
| waist / **elbow** | 20 | *elbow meets the waist* |
| crotch | 25 | *crotch at half figure height* |
| wrist | 26 | *wrist meets the crotch* |
| fingertip | 30 | — |
| knee | 35 | *knee at three quarters height* |
| ankle | 44 | — |
| sole | 46 | — |

Femur (hip→knee) = 10, tibia (knee→ankle) = 9 — **femur ≥ tibia**, as canon
requires. Upper arm = forearm = 6.

Widths, also fractions of height: `head 8, shoulders 14, waist 10, hips 12,
upperArm 4, foreArm 4, hand 4, thigh 5, shin 4, foot 6`.

Resolved joints:

```
neck      (16,12)
shoulderL  (9,14)   shoulderR (23,14)
elbowL     (9,20)   elbowR    (23,20)
wristL     (9,26)   wristR    (23,26)
hipL      (13,25)   hipR      (19,25)
kneeL     (13,35)   kneeR     (19,35)
ankleL    (13,44)   ankleR    (19,44)
```

**The shoulder joint sits at the OUTER EDGE of the shoulder mass.** Insetting
it by half an arm-width buries the entire arm inside the torso silhouette and
only the hand shows. This was a real bug; the comment in the source records it.

### `JOINT_OVERLAP`

Every segment is drawn `JOINT_OVERLAP` (currently `1`) pixels **past its own
joint at both ends**. This is the cut-out-animation joint allowance. Without
it a rigged limb tears open at every bend. Do not remove it, and do not
"tidy" segments to end exactly at their pivots.

---

## 4. Form-Aware Shading

`codex/core/pixelbrain/pixel-art-shaders.js`

**The shader must match the form.** Three shading approaches were tried on a
real asset; two were rejected by the artist on sight.

| approach | result |
|---|---|
| flat fill + 1px edge line | *"as if you spray painted color that was matte… it looks finger painted"* — **rejected** |
| `applyCharacterFills` (bands by `y`) | vertical racing stripes on a 5px limb — **rejected** |
| cross-section shading | correct |

```js
import { shadeCylinder, shadeMass } from './pixel-art-shaders.js';

shadeCylinder(cells, ramp, { specular = true })  // limbs, torso — TUBES
shadeMass(cells, ramp, { lightX = -0.7, lightY = -0.7 }) // heads — MASSES
// both -> [{ x, y, color }]
```

- **A limb is a TUBE.** Shade across its cross-section, never down its length:
  `outline | highlight | body | shadow | outline`.
- **A head is a MASS.** Shade radially against the light vector. Its rim is
  *selective* (selout): on the lit side it lifts to `deep` instead of staying
  pure outline, so the silhouette is not uniformly black.
- `specular` adds a short hot run in the upper third only, so a highlight has
  a start and an end rather than striping the full length of the limb.
- Rows narrower than 4px are **all rim** and shade to mud. The shader drops
  outlines below that width, but the real fix is a wider limb.

### Ramps: value from the shader, hue from the subject

Shaders take a 5-tier ramp: `{ void, deep, body, frost, hi }`.

**Do not feed colours straight from a material-registry ramp.** `void_cloth`'s
anchors are navy; doing so recoloured a purple caster blue. Take the **value
structure** from the shader and the **hues** from the subject's own palette.
Material ids in SCDL are semantic labels — the authored palette hexes are what
render, unless transmutation or `--shade material` is invoked.

---

## 5. Generating a Character Model

```bash
npm run assets:charmodel        # scripts/build-character-model.mjs
```

Emits and compiles **14 parts** into `assets/ASSETS/Character model/`:

```
head model/    head
torso model/   torso
arms model/    armL-upper  armL-fore  armL-hand
               armR-upper  armR-fore  armR-hand
legs model/    legL-thigh  legL-shin  legL-foot
               legR-thigh  legR-shin  legR-foot
```

The generator is **deterministic** — verified by hashing all `.scdl` output
across two runs. If you change it, re-verify:

```bash
find "assets/ASSETS/Character model" -name "*.scdl" -print0 | sort -z \
  | xargs -0 sha256sum | sha256sum
```

> Use `-print0`/`-0`. These paths contain spaces; a bare `xargs` splits them
> and the check silently compares error output instead of files — a check that
> cannot fail is worse than no check.

**To make a new character:** change `RAMPS` (palette) and/or the `FIGURE` box
in `build-character-model.mjs`. Proportions come from the canon, so a new
character is a parameter set, not a redraw. Compiled PNGs are **gitignored**
(`.gitignore:102`, `*.png`) — only `.scdl` sources are tracked, so a fresh
clone must run the generator before art exists.

### Part authoring contract

Each part `.scdl`:
- declares the **full shared canvas** (`32x48`), not a cropped segment box;
- draws the part at its **rest position** in that shared space;
- extends `JOINT_OVERLAP` past each of its joints;
- is **generated** — the header says *do not hand-edit*. Change the generator,
  not the output.

This matches the existing Void1 arm-segment convention
(`generated-assets/Void1/Void1-armL-upper.scdl`).

---

## 6. The Rig

`src/game/combat/armRig.js` — pure 2D forward kinematics. Despite the name it
is **limb-generic**, not arm-specific.

```js
import { solveArm, anchorWorld, gripWorld } from './armRig.js';
const solved = solveArm(limb, [thighDeg, shinDeg, footDeg]);
// -> [{ key, jointX, jointY, angleRad }, ...]
```

Each segment rotates about its pivot; the child joint is the parent's
`childOffset` carried through the **accumulated** rotation. That accumulation
is what makes it a chain rather than three independent sprites.

### Rig config shape

```js
export const SOME_RIG = {
  left: {
    root: JOINTS.torso.hipL,        // arms may use `shoulder` instead
    mirror: false,
    segments: [
      { key: 'thigh', spriteKey: '…', pivot: {x,y}, childOffset: {x,y}, restAngleDeg: 0 },
      { key: 'shin',  spriteKey: '…', pivot: {x,y}, childOffset: {x,y}, restAngleDeg: 0 },
      { key: 'boot',  spriteKey: '…', pivot: {x,y}, childOffset: {x,y}, restAngleDeg: 0,
        solePoint: {x,y} },
    ],
  },
  right: { /* … */ },
};
```

**Conventions and gotchas:**

- **Root key:** arms name it `shoulder`, legs name it `root`. The solver
  resolves `limb.root || limb.shoulder`. Both work; do not "normalize" one
  away — `void1RigConfig.js` depends on `shoulder`.
- **Angle sign:** a **positive angle swings the child toward `-x`** (forward
  for a left-facing character).
- **`pivot` is in the segment sprite's own canvas space**; `jointX/jointY`
  from the solver is where that pivot must land. A compositor rotates the
  segment about `pivot` and translates so `pivot` sits on the solved joint.
- `mirror: true` flips the chain (used by Void1's left arm).
- `anchorWorld(limb, angles, key)` resolves a named anchor (`gripPoint`,
  `solePoint`) into canvas space — use it to attach a weapon to a hand.

### Animation is a pose table, not frames

`src/data/photo1RigConfig.js`:

```js
export const PHOTO1_LEG_POSES = {
  stand:    { left: [0, 0, 0],     right: [0, 0, 0] },
  contactL: { left: [24, -10, 0],  right: [-20, 12, 0] },
  passL:    { left: [4, -4, 0],    right: [-8, 30, 0] },
  contactR: { left: [-20, 12, 0],  right: [24, -10, 0] },
  passR:    { left: [-8, 30, 0],   right: [4, -4, 0] },
};
export const PHOTO1_WALK = { frames: [...], defaultDurationMs: 200, loop: true };
```

Editing an angle changes the gait. A run, limp, or kneel is a **new angle set
against the same sprites** — no redrawing. This is the payoff of segmentation.

---

## 7. Rendering

The runtime composite is Phaser-side; `src/game/combat/void1CombatVisuals.js`
is the reference consumer for the arm rig.

Compositor algorithm (nearest-neighbour — pixel art must not be interpolated):

```
for each segment, in paint order:
    solved = solveArm(limb, angles)[i]
    for each destination pixel (x,y):
        v = (x,y) - (solved.jointX, solved.jointY)
        u = R(-solved.angleRad) · v          # inverse-rotate
        sample source at round(pivot + u)    # nearest neighbour
        if opaque: write
```

Paint order used for a front-facing figure: far arm → far leg → near leg →
torso → head → near arm.

---

## 8. Verification Recipes

Run these before reporting any change as working.

**Joints must not tear.** Bend every chain hard and flood-fill: each limb must
remain a **single 4-connected component**. Current model at 45°: *327px in
exactly 4 components*. More than one component per limb means a joint opened.

**Generator determinism** — see §5 (use `-print0`).

**Rig regression** — `solveArm` is shared with Void1's arms. After touching
`armRig.js`, confirm a Void1 arm pose still resolves to the same joints.

**A pixel diff is a regression guard, never a success criterion.** For anything
judged by eye, a clean diff proves the code did what you told it to — not that
what you told it to do was right. Four consecutive "verified, 0 mismatches"
sprite changes in this system's history were rejected on sight. Render it,
zoom it, and *look*, on a mid-tone background — near-black art vanishes against
white and you will misjudge it.

---

## 9. Known Limitations

Stated plainly so no agent reports these as done:

1. **No Phaser wiring for `photo_1_lit`.** The parts, rig, and poses exist and
   render through a compositor, but `CombatArenaScene` does not load these
   textures. Wiring follows the `void1CombatVisuals.js` pattern.
2. **The generated model is a base mannequin.** Geometry, joints, and form
   shading are correct. It has no cloak, staff, long hair, or detailed face —
   it does not yet look like any specific character.
3. **SCDL has no bone primitive.** The rig lives entirely outside the
   compiler; SCDL only produces segment rasters. Do not look for joints in the
   grammar. (SCDL *does* have a shaded `sphere` op with a light vector.)
4. **`VOID1_JOINTS` declares leg joints that Void1 does not use.** Its legs are
   hand-redrawn polygons per frame in `Void1-walk.scdl`; only its **arms** are
   rigged. Do not assume a declared joint implies a built rig.
5. **Per-part rims read as cut-out stickers** at rest. Inherent to segmented
   rigging; mitigated by selout, not eliminated.

---

## 10. Failure Modes Recorded From Practice

Every entry below was a real rejected attempt on a real asset. Read this
section before proposing an animation approach.

| Attempt | Why it failed |
|---|---|
| 1px-wide foot column translating in x | reads as a tentacle — a hairline that slides is a worm, not a leg |
| block anchored at one corner, grown downward | reads as stretching in place, not moving |
| block translating to new absolute positions | still a relocating rectangle; no joint |
| whole-body 1px bob added | *"bobbing simulates the IDEA of movement"* |
| 1px `line` hinged at a fixed hip | correctly hinged, still a wire — width must match the body's visual weight (2–4px here) |
| legs appended **below** the existing dark hem | that hem **was** the boots; figure read boots → legs → boots. New geometry must **replace** the silhouette it occupies, not hang off it |
| 14-row legs on a 19-row torso | proportion is measured in rows against the torso; 9 was right |
| growing the canvas to make room | fit the existing footprint unless told otherwise |

**Two process rules that would have prevented most of the above:**

1. **Grep for an existing system before hand-authoring.** `armRig.js`,
   `anatomy-registry.js` (humanoid part topology with required joints), and
   `part-profile-library.js` (part-local cells + named anchors) all already
   existed. Five rejected attempts were spent hand-nudging pixels without
   looking. Start with:
   `grep -rn "solveArm\|pivot\|childOffset\|Rig\b" src/ codex/`
2. **Render and look before claiming success.** See §8.

---

## 11. Related Documents

- `SCDL_COMPILER_WHITE_PAPER.md` — the compiler that builds each part raster
- `SCDL_AUTHORING_GUIDE.md` — op catalogue, materials, frames/loops
- `PIXELBRAIN_AGENT_OPERATING_MANUAL.md` — the wider PixelBrain engine
- `.claude/skills/ScholomanceCompile/` — compiler engineering patterns

For frame-based (non-rigged) animation, SCDL's own `loop`/`frame` mechanism is
documented in the authoring guide, §5. Use it when a motion genuinely cannot be
expressed as joint rotation — not as a shortcut around segmenting a character.
