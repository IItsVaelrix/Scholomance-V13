# SCDNA GENE: Character Skeleton Manifold (SCDNA-v1)

**Gene ID:** `SCHOL-ENC-SCDNA-GENE-CHAR-SKELETON-MANIFOLD-001`
**SourceKind:** Architecture
**Domain.Primary:** Pixel (secondary: character, sprite, animation, determinism)
**Canonical:** True · **Priority:** High · **Action:** route
**Activation Brains:** UI_BRAIN, PIXEL_BRAIN, CODE_BRAIN, RISK_BRAIN, TEST_BRAIN

**Inheritance:** All agents (Grok, Claude, Cursor, Gemini, any subagent or automated tool) **MUST** load and obey this gene whenever authoring, animating, editing, or reviewing a character sprite — via hand-SCDL, the PixelBrain character foundry, the face-composer, or the part-profile library.

**Enforcement:** This gene is the *constitution* of the character architecture. The skeleton stops being an optional dependency you may forget to consume and becomes a binding law for every character author. Violation triggers rollback, re-derivation from the manifold, and recompile (see Violation Protocol).

---

## Core Imperative

**Every character sprite is a chart of one canonical skeleton manifold.**

Bind every part to a named joint anchor; derive each facing as a projection **chart** of the same joints with its occlusion rule; author animation as a single **trajectory** on the manifold. A sprite is never drawn — it is *sampled* from the manifold.

> If you are placing a feature at a literal pixel coordinate, you are violating this gene. Features live at joints; pixels are where a chart happens to land them.

---

## 1. The Manifold (formal)

The character is not 15 sprite files. It is one low-dimensional object rendered many ways.

- **Base manifold `M`** — the skeleton's configuration space. A point `p ∈ M` is a full assignment of joint positions (the rest pose is the distinguished point `p₀`). Pose degrees of freedom (bob, hip-sway, shoulder-breathe, limb phase, held-item plant) are tangent directions on `M`.
- **Atlas of charts `{Π_θ}`** — each facing `θ ∈ {S, SE, E, NE, N, NW, W, SW}` is a projection `Π_θ : M → ℤ²` from joint space to the 2D cell grid, carrying an **occlusion rule `O_θ`** (which joints/features are visible, which are culled, whether the head renders as face or hair-dome). The eight charts are one atlas of one manifold — *not* eight independent drawings.
- **Fiber bundle `E → M`** — parts (hair, robe, eyes, sash, staff, scroll…) are **sections** of a bundle over the skeleton. Each part attaches at a named joint (its base point); its geometry (SCDL ops / profile mask) is the fiber. Consistency across facings is the *same section transported across every chart* — never re-authored per direction.
- **Animation = trajectory `γ(t) ⊂ M`** — a curve on the manifold, rendered as `Π_θ(γ(t))` per frame. **Walk** is a limit cycle; **idle** is a small oscillation about `p₀`; **cast/attack** is an excursion and return; **hurt** is an impulse; **death** is a terminal path off the cycle.

Determinism law: same `(p, θ, part-sections, seed)` → byte-identical packet. The manifold is the only source of truth; every rendered artifact is a pure function of it.

---

## 2. The Skeleton Atlas (canonical, normalized)

The manifold is authored in **normalized coordinates** `(u, v) ∈ [0,1]²` (`v` increases downward), so it is **canvas-agnostic** — the same rig drives the 32×48 profile system (`character-body-profiles.js`, `CW=32/CH=48`) and 48×64+ SCDL. A chart resolves `(u,v) → (round(u·W), round(v·H))` for the target canvas.

**Canonical joint basis** (the coordinate axes of `M`; mirrors the `buildSkeleton()` signature in `character-body-profiles.js`):

| Joint | u | v | Notes |
|---|---|---|---|
| `head.top` | 0.50 | 0.09 | crown |
| `head.center` | 0.50 | 0.23 | face sphere center |
| `head.chin` | 0.50 | 0.37 | |
| `face.eyeLeft` | 0.42 | 0.24 | glow-eye anchor |
| `face.eyeRight` | 0.58 | 0.24 | |
| `face.nose` | 0.50 | 0.29 | |
| `face.mouth` | 0.50 | 0.33 | |
| `face.earLeft` | 0.35 | 0.25 | |
| `face.earRight` | 0.65 | 0.25 | |
| `torso.shoulderL` | 0.34 | 0.42 | sleeve / arm root |
| `torso.shoulderR` | 0.66 | 0.42 | |
| `torso.hipL` | 0.40 | 0.66 | robe waist |
| `torso.hipR` | 0.60 | 0.66 | |
| `legs.kneeL` | 0.40 | 0.80 | |
| `legs.kneeR` | 0.60 | 0.80 | |
| `legs.ankleL` | 0.40 | 0.95 | boot |
| `legs.ankleR` | 0.60 | 0.95 | |

**Chart set `Π_θ`** — each facing is a turn parameter `t_θ ∈ [-1, +1]` (screen-right positive) applied as a horizontal parallax to face joints about `head.center`, plus an occlusion rule `O_θ`:

| θ | t_θ | Head render | Occlusion `O_θ` |
|---|---|---|---|
| S | 0 | face | both eyes, nose, mouth |
| SE | +0.5 | face | both eyes (far eye smaller), nose→right, mouth |
| E | +1 | face (profile) | near (right) eye + nose + lips only; cull far eye/ear |
| NE | +0.5 | hair-dome | cheek + near eye sliver; no full face |
| N | 0 | hair-dome | face empty (back) |
| NW | −0.5 | hair-dome | mirror of NE |
| W | −1 | face (profile) | mirror of E |
| SW | −0.5 | face | mirror of SE |

Parallax law: a face joint `j` projects to `u'_j = u_j + t_θ · k_j · (u_j − 0.50)` with feature-specific `k_j` (nose/near-eye lead the turn, far-eye/ear recede), then `O_θ` culls. **W/NW/SW are `hflip` of E/NE/SE** — authored once, mirrored (standard sprite practice; the runtime already does this via the `eo` sign in `bodyCells_east`).

This atlas is the machine-readable artifact both the foundry and SCDL authoring consume; it SHOULD be emitted as `codex/core/pixelbrain/character-skeleton-atlas.json` and imported, never re-typed.

---

## 3. Required Checks (conformance)

1. **Skeleton Anchor Resolution** — every face/limb feature resolves to a named joint (`face.eyeLeft`, `nose`, `mouth`, `torso.shoulderL`, `legs.ankleR`, …), not a literal cell. A part declares `attach: { at: "<joint>", offset: {du,dv} }`.
2. **Directional Projection** — each facing is `Π_θ` of the *same* joint table with its `O_θ`; diagonals are charts, not fresh drawings.
3. **Animation Trajectory** — every frame samples one `γ(t)`; walk = limit cycle, idle = oscillation about `p₀`, cast = excursion. No per-frame re-authoring of the base.
4. **Manifold Re-derivation** — editing a joint (or a part section) re-derives *all* charts and frames. A change that requires touching more than the manifold + the affected section is a violation of this gene.

---

## 4. Forbidden Drift (instant violation)

1. **No eyeballed face cells** — never place eyes/nose/mouth by hand-chosen coordinates. (This is the exact defect that produced the "fringe stabbing the face" and the muddy lower-face: features authored off-skeleton.)
2. **No per-direction re-derivation** — the 8 facings are charts of one joint set; never draw a direction independently.
3. **No independently approximated diagonals** — SE/NE/SW/NW are parallax charts of the manifold, mirrored where applicable.
4. **No magic numbers** — no SCDL op nor foundry call may place a feature at a literal not bound to a joint (offsets from a joint are fine and encouraged).
5. **No multi-file fixes** — if fixing a character requires the same edit in N sprite files, STOP: the manifold is being bypassed. Fix the manifold/section once.

---

## 5. Required Implementation (the way it must be)

The gene is the constitution; these existing modules are the **executable chart machinery** that must satisfy it:

- **`character-spec.js` (`CHARACTER-SPEC-v1`)** — the single character definition (build/height/gender + selected part profiles + materials). One character = one spec, not a folder of sprites.
- **`character-body-profiles.js`** — supplies the skeleton via `buildSkeleton()` and the per-direction silhouettes (`bodyCells_south/east/north`), guarded by `CHIBI_SILHOUETTE_GUARDS`. This is the chart machinery; the normalized atlas in §2 is its canonical source.
- **`character-face-composer.js`** — places face features onto skeleton anchors **per direction**, already implementing `O_θ` (north → no face; east/west → cull far eye, front-side nose). Using it is **mandatory** — it is why a conformant face cannot be stabbed by a fringe.
- **`part-profile-library.js` + hair/detail profiles** — reusable part *sections*; a character selects sections, it does not re-plot pixels.
- **Animation** — `codex/core/animation/amp/*` + `ADR-animation-signal-contract.md` express `γ(t)` as signals; walk/idle/cast are trajectories, not hand-authored frame deltas.
- **SCDL** — remains the fiber authoring + bespoke props/FX tool; its ops MUST reference resolved joint coordinates (from the atlas) rather than literals. Hand-SCDL is legal only when it conforms to the manifold.

**4 → 8 charts:** `CHARACTER-SPEC-v1` currently declares 4 cardinal `VALID_DIRECTIONS`. This gene extends the atlas to 8 by adding the diagonal parallax charts (§2); the four west-side charts are `hflip` of the east-side charts.

---

## 6. Verification Steps (every agent, every change)

1. **Anchor audit** — grep the new/edited character for literal face coordinates; every feature must trace to a joint. Literal face cells = fail.
2. **Chart identity** — render all 8 facings; confirm head height, eye spacing, and shoulder width are identical across facings (they are one manifold). Drift = fail.
3. **Occlusion** — N/NE/NW show no full face; E/W show one eye + nose; mirrors match. 
4. **Trajectory** — walk returns to its start pose (closed cycle); idle stays within a small neighborhood of `p₀`; no joint teleports between frames.
5. **Single-source proof** — perturb one joint on the manifold and confirm *all* charts/frames update from that one edit. If they don't, the character is not on the manifold.

---

## 7. Machine Gene (register in `steamdeck_brain/vaelrix_forcefield/scdna/compiler.json` under `genes`)

```json
"CHARACTER_SKELETON_MANIFOLD": {
  "version": "SCDNA-v1",
  "identity": { "stableId": "CHARACTER_SKELETON_MANIFOLD", "contentHash": "scdna-char-skeleton-manifold-v1", "sourceKind": "architecture" },
  "domain": { "primary": "pixel", "secondary": ["character", "sprite", "animation", "determinism"], "activationBrains": ["UI_BRAIN", "PIXEL_BRAIN", "CODE_BRAIN", "RISK_BRAIN", "TEST_BRAIN"] },
  "retrieval": { "lookupMode": "hybrid", "priority": 0.95, "confidence": 0.97, "originalConfidence": 0.97, "freshness": 0.9, "canonical": true, "minConfidence": 0.45 },
  "instruction": {
    "action": "route",
    "imperative": "Every character sprite is a chart of one canonical skeleton manifold. Bind every part to a named joint anchor; derive each facing as a projection chart (Π_θ) of the same joints with its occlusion rule; author animation as one trajectory on the manifold. Route character authoring through character-spec + part-profile-library + character-face-composer and the normalized skeleton atlas.",
    "forbiddenDrift": [
      "Do not place face features at eyeballed literal cell coordinates",
      "Do not derive the 8 directions as independent drawings",
      "Do not approximate diagonals independently of the manifold",
      "Do not let an SCDL op place a feature at a literal not bound to a joint",
      "Do not fix a character by editing the same thing across many sprite files"
    ],
    "requiredChecks": [
      "Every face/limb feature resolves to a named skeleton joint",
      "Each direction is Π_θ of the same joint table with its occlusion rule O_θ",
      "Animation frames sample one trajectory (walk=limit cycle, idle=oscillation, cast=excursion)",
      "A single manifold/section edit re-derives all charts and frames"
    ]
  },
  "risk": { "riskClass": "medium", "blastRadius": "cross_system", "staleRisk": 0.1, "misuseRisk": 0.2 },
  "english": {
    "shortMeaning": "Characters are charts+trajectories of one skeleton manifold, not hand-drawn per-direction sprites.",
    "expandedMeaning": "The skeleton joint set is the base manifold; the 8 facings are projection charts with occlusion rules; parts are fiber sections attached at joints; animation is a trajectory on the manifold. One edit re-derives everything.",
    "operatorInstruction": "Author a CHARACTER-SPEC + select part profiles; never hand-place face cells; reference the skeleton atlas for joint coordinates."
  },
  "lifecycle": { "status": "active", "contradictionCount": 0, "lastContradictionAtIndex": null, "degradationFactor": 0.85, "recoveryIncrement": 0.02, "deprecationThreshold": 0.45, "supersededBy": null, "quarantineReason": null }
}
```

---

## 8. Why This Gene Exists

We built the Battle Poet as 15 hand-authored SCDL sprite files. The consequences were exactly the failures a manifold prevents:

- The **face broke** ("the face is fucked up") because eyes/nose/mouth and the hair fringe were placed at eyeballed literals — a fringe spike was free to occupy the eye's location. On the manifold, features live at `face.*` joints; a fringe *cannot* land on the eye anchor.
- **Fixing one face took a `sed` across 9 files**, because the character had no single source. A manifold edit is one change.
- The **8 directions were hand-approximated**, so nothing guaranteed they were the same character (identical head height, eye spacing, build). Charts of one manifold guarantee it.
- A **second character** (Voidling, Sonic Thaumaturgist…) would have restarted from zero. On the manifold it is new fiber sections over the same skeleton — it inherits all facings and animations for free.

Characters are the world's actors. If each is a pile of drawings, the roster cannot scale, stay consistent, or be maintained. This gene makes the skeleton the law so a character is a *model*, not a sprite dump.

---

## Violation Protocol

Any character artifact that places features off-skeleton, derives a direction independently, or requires multi-file edits to change one feature is in violation. The agent must: **(1)** stop, **(2)** lift the character onto the manifold (CHARACTER-SPEC + atlas), **(3)** re-derive all charts/frames, **(4)** recompile. Repeated violation escalates via the LAW stack (`vaelrix-law.skill`, `law-enforcer-skill.md`).

**End of Gene.** Load order: reference in every relevant `AGENTS.md` / `CLAUDE.md` / `GROK.md`. Sibling genes: `SCDNA_Gene_Isometric_Asset_Integrity.md`, `SCDNA_Gene_Combat_Galaxy_Viewport_Fill.md`.
