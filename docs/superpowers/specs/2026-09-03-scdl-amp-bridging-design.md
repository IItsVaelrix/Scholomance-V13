# Design: Bridging the Amp/Effect Ecosystem into SCDL

**Status:** Approved by Vaelrix in conversation 2026-09-03; ready for PDR.
**Classification:** Architectural.
**Prior art:** `divtube_downloader/DATA REPORTS/2026-09-03-pixelbrain-pipeline-ux-savage-audit.md` (the audit that found the gap), commit `4cb9421a` (Qwen's discoverability fixes, landed same day — `EFFECT_CATALOG.md`, MCP asset tools, CLI diagnostics unification).

## 1. Problem

SCDL (Door A, the text DSL) and the item-foundry (Door B, `forgeItemAsset`'s JS-object pipeline) are the two ways to produce a PixelBrain asset. Door B imports and uses roughly 20 of the codebase's 53 effect/amp modules directly (`crystal-core`, `heraldry`, `hair-flow`, `facet`, `shield-rim`, `jewelry`, and others — confirmed by import-graph, see `EFFECT_CATALOG.md`). Door A's own pass pipeline (`codex/core/pixelbrain/scdl/passes/`) touches almost none of that vocabulary. An SCDL author cannot reach any of it from the language.

This was originally logged in the 2026-09-03 audit as a *discoverability* problem (amps were unregistered, uncataloged). Commit `4cb9421a` fixed discoverability: `EFFECT_CATALOG.md` is now a generated, accurate inventory (44/53 WIRED, 6 generator-only, 3 confirmed ORPHAN). That fix did not change reachability — the catalog tells you the 44 amps exist; it does not let SCDL invoke any of them. The gap this design closes is that second, harder problem: SCDL was built as a language specifically so it could be extended, and extending it to reach the amp ecosystem is additive capability work that nobody had done, as distinct from the repair work the audit's punch list scoped.

## 2. Decisions made (in conversation, in order)

1. **Scope: amp-bridging only.** Not `rotate`/`scale`/`translate` (also inert placeholders in the grammar) — deferred, separately small enough not to need this process.
2. **Mechanism: one generic `apply <amp-id> { param: value }` grammar statement**, backed by a required per-amp declared schema — not bespoke grammar per amp (too much surface), not a blind untyped passthrough (loses SCDL's error-message quality, S1 in the audit).
3. **Scope is per-amp, not uniform**: `apply` is valid inside a `part { }` block for part-scoped amps, or at the top level for packet-scoped amps. The schema declares which.
4. **Adapter strategy**: one shared adapter for amps whose signature fits `(fills, spec-slice, silhouette)`; a bespoke adapter, written only when that specific amp is bridged, for anything that doesn't fit that shape.
5. **CLI UX: interactive**, not print-and-paste. `scdl amps add <amp-id> <file.scdl>` walks the schema fields one at a time.
6. **Visual confirmation before commit**: the interactive flow renders the result as an ANSI/terminal-block preview, **side by side** (before vs. after, same terminal lines, `BEFORE`/`AFTER` labels), not sequential — so a 1:1 comparison against intent is a single glance, not a memory exercise.
7. **Renderer location: Node-native**, as a new export target (`ansi`) in `scdl.exporters.js`, next to `png`/`svg`/`json`/`phaser`. Checked whether the Python cockpit (`divtube_downloader`) already had this — it has `rich`+`Pillow` installed but no image→terminal-blocks renderer built with them (only usage of `Pillow` in the tree is `thumbnail_engine.py`, unrelated). Node-native avoids a subprocess round-trip and reuses the packet data already in memory for the PNG exporter.
8. **On confirm: auto-insert.** The CLI writes the `apply` block directly into the target `.scdl` file at the location chosen during the walkthrough, then runs a real (non-preview) compile to confirm it still compiles clean.

## 3. Correction found while grounding the design in code (post-conversation, pre-PDR)

The "shared adapter" idea in decision 4 assumed most Door-B amps need only a *little* translation glue. Checking three candidates directly:

| Amp | Signature | Coupling |
|---|---|---|
| `crystal-core-amp.js:30` `applyCrystalCore(fills, spec, silhouette)` | Hard-gates on `spec.class !== 'armor'` / `spec.archetype` not containing `'chestplate'`, then searches `spec.parts` for `id === 'center_core'` or `profile?.startsWith('gem.socket.void')` | **ITEM-SPEC-v1-coupled.** `class`/`archetype`/`profile` are foundry-only vocabulary with no SCDL equivalent. A bridge would have to fabricate a fake archetype tag to pass the gate. |
| `shield-rim-amp.js:6` `applyShieldRimTemplate(template, silhouette, spec)` | Same pattern: `spec.class !== 'armor' \|\| spec.archetype !== 'kite_shield'`, then `spec.parts.find(p => p.id === 'rim' \|\| p.id === 'trim')` | Same problem as crystal-core. |
| `heraldry-amp.js:130` `applyHeraldryTemplate(template, silhouette, spec)` | Gates on `spec.heraldry` — an array of author-declared emblem entries (`{cx, cy, style: {effect}}` etc.) | **Honest coupling.** The gate *is* the author's real intent, not a synthetic category tag. |
| `hair-flow-amp.js:291` `generateHairFlowCells(config)` | No `fills`/`spec`/`silhouette` at all — just a `config` object (seed, canvas, taper, paletteRoles) normalized by `normalizeHairFlowConfig` | **No foundry coupling at all.** The cleanest possible bridge target. |

Consequence: crystal-core and shield-rim are **not** good first bridges — bridging them honestly requires either fabricating fake ITEM-SPEC-v1 metadata (a lie the SCDL author would have to author, defeating the point) or a small decoupling refactor on the Door-B side to split "find the target cells" from "apply the effect," which is out of scope for this PDR and would need its own change. Heraldry and hair-flow are real, clean, honestly-bridgeable pilots and are recommended instead — see the PDR's Phase 1 scope.

## 4. What this design explicitly does not cover

- `rotate`/`scale`/`translate` (separate, smaller, deferred).
- Bridging all 44 amps — this is one-amp-at-a-time additive work; most amps stay Door-B-only until someone deliberately bridges them.
- Any decoupling refactor of amps whose current signature assumes ITEM-SPEC-v1 (crystal-core, shield-rim, and unaudited others likely sharing the pattern) — flagged as a prerequisite for bridging *those specific amps* in a later phase, not attempted here.
- MCP exposure of the interactive CLI flow — the three MCP asset tools added in `4cb9421a` are request/response; an interactive multi-turn prompt doesn't map onto that shape without its own design work, which this PDR does not attempt.

## Spec self-review

- Placeholder scan: none found — no TBD/TODO left unresolved.
- Internal consistency: §3's correction changes the pilot amp choice from what was said in conversation (crystal-core) to heraldry — stated explicitly as a correction, not silently substituted, matching this project's "measure, don't rationalize" norm.
- Scope check: focused enough for one PDR — the amp-bridging mechanism plus two pilot amps. Bridging additional amps beyond the two pilots is explicitly future work, not folded in here.
- Ambiguity check: "shared adapter" now has a concrete acceptance test (does the amp's own gate logic reference ITEM-SPEC-v1-only vocabulary or not) rather than being a vibe call per-amp.
