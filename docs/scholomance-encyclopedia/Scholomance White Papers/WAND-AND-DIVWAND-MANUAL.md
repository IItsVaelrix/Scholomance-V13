# Scholomance Vectorized Art Manual: Fairly Odd Wand & DivWand

**Purpose:** Authoritative guide for AI agents to produce **VECTORIZED ART** and structured DOM assets using the only approved, bounded, deterministic mechanisms in the Scholomance engine.

The Fairly Odd Wand is the canonical system for **vectorized art** — clean, mathematical, role-tagged coordinate paths (not pixels, not raw SVG strings). The DIV Wand is for structured, verifiable DOM layouts.

Both systems solve the unbounded emission problem by requiring schema-validated JSON proposals that are evaluated fail-closed and produce auditable artifacts.

---

## 1. Vectorized Art via the Fairly Odd Wand

### What "Vectorized Art" Means Here

Vectorized art in Scholomance is **formula-evaluated coordinate paths** that represent clean geometric and stroke-based shapes:

- Polylines and closed silhouettes (`edge_trace`)
- Variable-width pressure-simulated strokes (`mathematical_stroke`)
- Smooth parametric curves and orbits (`parametric_curve`)
- Organic spirals and subdivisions (`fibonacci`, `fractal_iter`)
- Text as vector glyphs (`vectorized_text`)
- Full multi-part figures assembled via `composite`

These paths are:
- Deterministic (same proposal + seed → identical points)
- Tagged with `role` / `partId` / `material`
- The source of truth for high-fidelity construction
- Exportable as `vectorPaths` (array of `{ role, points: [{x,y}, ...] }`)
- Primary input for character models via `vectorWand`
- Superior to raster for reference, SVG derivation, animation, and re-sampling

**Never emit raw SVG `<path d="...">` strings, imperative canvas calls, or final raster images as your primary creative output for vectorized art.** The Wand is the mechanism that produces the clean vector paths. Use it.

### Core Flow (Wand → Vectorized Art)

1. **Propose** a formula (or composite) using the approved grammar.
2. **Validate** fail-closed against the schema (depth ≤ 4 for composites).
3. **Evaluate** → array of `{ x, y, role?, partId?, ... }` coordinate points.
4. **Bridge** (recommended for characters/assets):
   - `forgeCharacterFromWandVector(wandProposal, baseSpec)` 
   - Returns model containing `vectorPaths` (THE vectorized art), fills, and diagnostics.
5. **Consume**:
   - Embed `vectorPaths` or the whole `vectorWand` proposal into `CHARACTER-SPEC-v1`.
   - Export clean vector data / derive SVG.
   - Feed to PixelBrain for rasterized sprites (Wand paths have priority).
   - Render via Role Dispatcher in scenes.

### Recommended Formula Dialects for Vectorized Art

| Dialect              | Best For                              | Key Parameters                              | Notes |
|----------------------|---------------------------------------|---------------------------------------------|-------|
| `edge_trace`        | Silhouettes, heads, hair outlines, closed shapes, hard edges | `tracePath: [{x,y}, ...]` (world) or `unitTracePath` (0-1) | Primary tool for clean vector boundaries. Supports closed traces for fills. |
| `mathematical_stroke` | Limbs, bodies, hair strands, variable-width strokes with pressure/bleed | `cx, cy, length, angle, baseWidth, widthVariation, frequency, density, bleed, n` | Simulates artistic strokes mathematically. Emits center + edge + bleed points. **Actively supported** in the vector art evaluation + `forgeCharacterFromWandVector` path even if not yet enumerated in the baseline schema file. |
| `parametric_curve`  | Sigils, halos, orbits, smooth repeating forms | `cx, cy, a, b, c, n` (samples up to 2048) | Classic Lissajous-style curves. |
| `fibonacci`         | Organic spirals, leaf/branch patterns | `iterations` (≤12), `scale` | Golden-ratio subdivision. |
| `fractal_iter`      | Recursive detail, vines, ornament    | `iterations` (≤6), `baseShape` ("triangle"|"square"|"circle") | Bounded recursion. |
| `vectorized_text`   | In-world glyphs, labels as vector    | `text` (≤32 chars), `fontSize`, `cx, cy, spacing` | Produces coordinate glyphs. |
| `composite`         | Complete figures / scenes            | `children: [{role, anchor:{x,y}, size?, formula, material?, ...}]` | The master tool. Build heads + hair + body + limbs as one proposal. |

**Composite is the workhorse for real vectorized art.** Each child gets a semantic `role` (e.g. `head`, `hair`, `leftArm`, `body`, `sigil.core`). Anchors and relative sizes position sub-formulas inside the target canvas.

### Proposal Formats

Agents may emit either style. The bridge accepts both.

**Simple (for direct evaluation):**
```json
{
  "coordinateFormula": {
    "type": "composite",
    "children": [ ... ]
  }
}
```

**Full AI Proposal (preferred when using /wand or registrar):**
```json
{
  "rationale": "Clear description of visual intent and why these formulas match it.",
  "confidence": 0.92,
  "reviewRequired": false,
  "sourceIntentHash": "optional-pdr-hash",
  "proposedFormula": {
    "role": "character.chibi.vaelrix",
    "material": "void",
    "formula": { "type": "composite", "children": [...] }
  }
}
```

Pass the inner `proposedFormula` (or the whole thing) to `forgeCharacterFromWandVector`.

### Concrete Vectorized Art Example (Chibi Character)

Minimal complete example (head + body stroke). Expand children for hair/limbs as needed.

```json
{
  "coordinateFormula": {
    "type": "composite",
    "children": [
      {
        "role": "head",
        "formula": {
          "type": "edge_trace",
          "tracePath": [
            {"x":14,"y":6},{"x":24,"y":4},{"x":34,"y":6},
            {"x":36,"y":14},{"x":34,"y":22},{"x":24,"y":24},
            {"x":14,"y":22},{"x":12,"y":14}
          ]
        }
      },
      {
        "role": "body",
        "formula": {
          "type": "mathematical_stroke",
          "parameters": {
            "cx": 24, "cy": 30, "length": 14, "angle": 90,
            "baseWidth": 10, "widthVariation": 0.2, "frequency": 0.3,
            "density": 1.5, "n": 32
          }
        }
      }
    ]
  }
}
```

**Bridge usage (the step that actually yields vectorized art):**

```js
// Preferred in app/UI contexts:
import { forgeCharacterFromWandVector } from '../src/lib/pixelbrain.adapter.js';
// Or direct from the engine:
import { forgeCharacterFromWandVector } from '../codex/core/pixelbrain/character-foundry.js';

const model = forgeCharacterFromWandVector(wandProposal, {
  canvas: { width: 48, height: 48 },
  materials: { skin: 'skin_light', hair: 'hair_violet' }
});

console.log('Vector paths (THE vectorized art):', model.vectorPaths?.length);
console.log(model.vectorPaths); // [{ role, points: [...], svgPath? }, ...]
```

The system now supports the full procedural-to-vector pipeline:
- `math_expression` AST (trig, mod, noise, variables x/y/t)
- Direct `pointsToSVGPath` (no raster required)
- Pure modifiers (chaikin, offset, affine) composed immutably
- `seed` + `precision` contract on proposals for determinism

Store the original proposal under `vectorWand` in a `CHARACTER-SPEC-v1` for round-trippable assets.

**Note on schemas:** The baseline `presets/schemas/formula.schema.json` enumerates the core dialects. The evaluator and `forgeCharacterFromWandVector` actively support `mathematical_stroke` (and composite role/anchor handling) for character vector art. Use what the runtime accepts for production vectorized results and validate in the `/wand` cockpit.

### Using Vectorized Art in Production

- **In CHARACTER-SPEC-v1**: Add top-level `"vectorWand": <the proposal or coordinateFormula object>`.
  The foundry will take the high-priority vectorWand path.

- **SVG Export**: The raw `vectorPaths` are clean and can be turned into SVG `<path>` elements. For filled styled output use the PixelBrain `characterToSVG` renderer on the resulting fills (or build directly from points).

- **PixelBrain / Raster**: Wand vectors are converted to emphasis-weighted cells with stroke-aware logic (center, edges, bleed). This produces higher-quality input than hand-drawn pixels for many assets.

- **Scene Rendering**: Coordinates flow through the Role Dispatcher. Register drawers for new roles.

- **Reference & Iteration**: The `/wand` cockpit shows live plotting + a special "VECTORIZED ART" character preview pane when it detects character/chibi roles.

---

## 2. DIV Wand (Structured DOM Layouts)

The DIV Wand is **not** for vectorized art. It is for bounded, verifiable UI/DOM component authoring.

### Overview
Emit recursive layout trees (`container` + `element` nodes) instead of raw JSX/HTML. The sandbox renders them, measures real box geometry, and prevents layout bugs before code lands.

Key constraints:
- Max recursion depth 5
- Payload size ≤ 64KB
- Strict flex/grid rules + computed vs declared verification

Use the DIV Wand for cards, HUDs, buttons, panels, and any React surface that must be geometrically correct.

**Access:** `/div-wand` route. Submit proposals → live DOM + inspector HUD.

---

## 3. Agent Workflow for Vectorized Art (Do This)

When asked to create vectorized art (icons, sigils, props, characters, magical effects, etc.):

1. **Identify the target** — Is this 2D vector geometry / character construction? (Fairly Odd Wand)  
   Or is it a DOM UI surface? (DIV Wand)

2. **Extract or invent clear visual intent** — Even if starting from a process doc, derive a specific subject (e.g., "a chibi caster with distinct hair silhouette and strong limb strokes").

3. **Choose primary dialects**:
   - Closed shapes / outlines → `edge_trace`
   - Expressive strokes → `mathematical_stroke`
   - Curves / repetition → `parametric_curve` or `fibonacci`
   - Full assemblies → `composite` with explicit `role`s

4. **Draft the JSON proposal** — Stay strictly inside the schema. Use composite for anything non-trivial. Assign meaningful roles.

5. **Test in the /wand cockpit** (strongly recommended):
   - Paste the proposal.
   - Watch real-time coordinate plot.
   - Trigger the live character vector model preview (it calls `forgeCharacterFromWandVector` internally).
   - Fix any `REJECTED` or evaluation issues immediately.

6. **Bridge to artifact**:
   - Call `forgeCharacterFromWandVector(...)` (or equivalent adapter).
   - Capture `vectorPaths`.
   - For characters: include the proposal as `vectorWand` in a CHARACTER-SPEC.
   - For props/effects: register the evaluated coordinates or store the proposal.

7. **Iterate with data** — Adjust parameters, anchors, or add sub-formulas. Re-evaluate. Compare vectorPaths and final raster.

8. **Register / persist** — Use the formula registrar for proposals that pass review. Source intent hashes help traceability.

**Never**:
- Output a finished SVG file directly as the creative act.
- Use free-form image generation for final vectorized assets.
- Bypass the schema with custom drawing logic.

### Vectorized Art Success Checklist (for Agents)

- [ ] Proposal uses only supported formula types (edge_trace, mathematical_stroke, parametric_curve, composite, etc.).
- [ ] Composite children each declare a clear `role`.
- [ ] Validated without rejection in the `/wand` cockpit.
- [ ] Live coordinate plot looks like the intended shape.
- [ ] `forgeCharacterFromWandVector(...)` succeeds and returns `vectorPaths.length > 0`.
- [ ] `vectorPaths` are captured / embedded (as `vectorWand` in CHARACTER-SPEC when appropriate).
- [ ] Result is deterministic and traceable to the proposal JSON.

---

## 4. Best Practices & Guards

- **Bound everything.** Composites max depth 4. `mathematical_stroke` and `edge_trace` have practical point budgets. The evaluators and bridge will surface problems.
- **Role discipline.** Good roles (`head`, `hair_cap`, `leftArm`, `sigil.primary`, `body_core`) make downstream PixelBrain, rendering, and editing vastly easier.
- **Material & palette hints.** Supply `material` and `paletteChannel` where relevant.
- **Start simple, compose up.** One good `edge_trace` head + two `mathematical_stroke` limbs is better than a 200-point monolith.
- **Use the cockpit diagnostics.** Schema rejections, point counts, and the VECTORIZED ART preview are your friends.
- **Treat vectorPaths as the artifact.** The evaluated points + roles are the portable, versionable, auditable representation of the art.
- **Vectorized art feeds everything else.** It is the preferred high-fidelity source for both pixel output and any future SVG/vector renderers.

---

## 5. Quick Reference

**Wand entry point:** `/wand`

**Key runtime functions (for agents with code access):**
- `validateProposal(proposal)`
- `evaluateFormula({ coordinateFormula: ... }, canvas)`
- `forgeCharacterFromWandVector(wandProposal, baseSpec, opts)` → `{ vectorPaths, fills, canvas, ... }`

**Schema files:**
- `presets/schemas/formula.schema.json`
- `presets/schemas/formula-proposal.schema.json`

**To embed in characters:**
```json
{
  "contract": "CHARACTER-SPEC-v1",
  ...
  "vectorWand": { ...proposal or coordinateFormula... }
}
```

**Output that matters:**
- `vectorPaths` — the vectorized art (clean, role-tagged paths)
- Derived fills for raster/PixelBrain
- SVG when rendered through the appropriate path builder

---

This manual supersedes earlier high-level descriptions. Its goal is to make **successful production of vectorized art** the default outcome for any agent that follows it.

The Wand grants wishes. The grammar is the bound. The `vectorPaths` are the art.