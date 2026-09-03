# PixelBrain Pipeline — Functionality, Ease of Use & Bespoke-Asset-Quality Savage Audit

**Can a human actually walk up to this system and make something beautiful?**

| Field | Value |
|---|---|
| **Document ID** | DR-2026-09-03-PIXELBRAIN-UX |
| **Status** | Complete |
| **Date** | 2026-09-03 |
| **Branch** | `feature/semantic-calculus-lexical-predicates` |
| **Scope** | `codex/core/pixelbrain/**` (SCDL compiler/CLI, ITEM-SPEC-v1/foundry, amp/effect ecosystem, docs, tooling, MCP exposure) |
| **Method** | ScholomanceCompile pipeline map + hands-on execution (real CLI runs, a from-scratch asset authored and compiled, a deliberately broken file, a live foundry generator run) + `/savage-audit` grading discipline |
| **Companion document** | `2026-09-02-asset-generation-pipeline-phenotype-idealism.md` — covers rasterization/color-math *internals* (signed distance, OKLab, palette quantization mechanics). This report does not repeat those findings; it asks a different question — not "is the math right" but "can someone use this to make something bespoke and beautiful, easily." |
| **Not audited** | The 200+ unclassified amp/effect modules were catalogued, not individually read. Aseprite binary export, tile-forge, and voxel paths were not exercised hands-on. |

---

## 0. What this report actually tested

Three lines of evidence, run in parallel, all hands-on rather than purely static:

1. **The SCDL text-DSL path** — read both canonical docs cover to cover, ran the real CLI against real fixtures, wrote a deliberately broken `.scdl` file to grade the error messages, and — the decisive test — **authored an original 20×20 shield asset from scratch using only the Authoring Guide**, compiled it, and looked at the rendered PNG.
2. **The ITEM-SPEC-v1 / foundry path** — read the spec contract and `forgeItemAsset`, ran the actual production chestplate generator end to end, diffed the declarative spec against what it took to make the shipped asset look right, and looked at the rendered PNG.
3. **The surrounding system** — census of the 224-file top-level directory, every npm script that touches this subsystem, MCP tool exposure, and whether the 53-module effect/amp ecosystem has any way to be discovered short of reading source.

Every finding below cites a file:line or an exact command/output. Where a claim couldn't be verified hands-on, it's flagged as unverified rather than asserted.

---

## 1. Pipeline map (ScholomanceCompile reference)

For orientation — the part of this 300+-file tree that actually turns intent into pixels has **two independent front doors**, confirmed by running both:

```
DOOR A — SCDL text DSL                         DOOR B — ITEM-SPEC-v1 (JS object)
  .scdl source                                   nested JS spec object
    → scdl.grammar.js (tokenize+parse)             → forgeItemAsset() — item-foundry.js
    → validate → resolveColors → resolveMaterials    ~20 sequential passes: silhouette →
    → expandVector (2-phase, booleans) →              construction → SDF → template →
      expandSymmetry → expandCells →                  region-fill → selout/AA/facets →
      [projectGenes, optional] →                       heraldry → sharpness → quantization
      emitPacket → emitDiagnostics                     → shader → packet → exports
    → scdl.exporters.js (png/svg/json/phaser)        → PNG/Aseprite/Phaser/voxel export
    → assets/ASSETS/                                → output/foundry/<name>/
    CLI: scdl.cli.js (compile/preview/parse/check)   No CLI — node scripts/generate-X.mjs
```

Both doors are real, both work, both produce good-looking output when driven correctly (§4, §5). Neither door knows the other exists, they write to different output roots, and nothing in the repository tells a newcomer which one to walk through. That collision is this report's central finding — see §3.

---

## 2. Method note on grading

Per `/savage-audit` discipline: severity is set by verified findings, not volume; missing context is logged as `UNVERIFIED`, not penalized; and a B-or-above grade requires a documented, specific attempt to break the thing that failed. This system splits cleanly into a component that earns real respect (the SCDL compiler/CLI/language) and a surrounding product experience that does not (discovery, onboarding, the "declarative-only" promise, output conventions). The verdict below is a single number because a single system was asked about, but the split is real and stated explicitly so the number isn't misread as uniform.

---

## ═══════════════ SAVAGE AUDIT ═══════════════

**TARGET:** PixelBrain/SCDL asset-generation pipeline — functionality, ease of use, UX, ability to produce bespoke beautiful assets. Both authoring doors, the doc set, the CLI, the effect ecosystem, and the discovery surface.

**SCRUTINY:** High. The compiler layer looked competent on first read, which is exactly when this methodology says to stop skimming and start trying to break things — so I ran it, broke it on purpose, and wrote something original with it rather than trusting the docs' own examples.

**CONFIDENCE:** High on everything cited below (all verified by direct execution or direct reading). Medium on the 200+ amp modules not individually read — see Unverified Risks.

### VERDICT: C+ — Aggressively Mediocre, With One Genuinely Good Room Nobody Can Find

One sentence, because it's earned: the compiler you'd never guess exists from the top of this repository is better than the compiler everyone actually uses to ship the flagship asset.

---

### ─── FINDINGS ───

**[MAJOR]** `codex/core/pixelbrain/amp-registry.js:3–17` — The one registry that could catalog "what makes an asset beautiful" (53 effect modules — bevel, crystal-core, hair-flow, shield-rim, sketch, tonation, facet, and more) opens with its own header disclaiming itself: "STATUS: EXPERIMENTAL — WRITE-ONLY — NOT a product API," `listAmps()` has **zero consumers anywhere in the repository**, and only **2 of ~53** amp modules are actually registered. There is no other catalog, gallery, or list-all-effects command anywhere in the tree. A user trying to learn what's available to make something "bespoke and beautiful" has exactly one method: open source files one at a time, guided by filename guesswork.

**[MAJOR]** `scripts/generate-void-chestplate.mjs:267–339` — The flagship "bespoke beautiful" reference asset — the one the companion color-audit rendered and called "reads as intended" — was **not** produced by the declarative ITEM-SPEC-v1 system alone. Lines 267–339 are imperative post-forge patches applied on top of the forged packet: `widenPauldrons(pkt, 5)`, `moveCore(pkt, -1)`, hand-placed pixel coordinates (`leftCrossCenter = {x:20,y:30} // tuned to image`, `rightCrossCenter = {x:44,y:30} // mirrored`), and a hardcoded `#6B35B8` re-derived by eyeballing a reference image. The "author a spec, get a beautiful asset" story this system sells is not what actually shipped the one asset used to prove the story.

**[MAJOR]** Two incompatible, undocumented output-location conventions, confirmed by running both doors directly: Door A (SCDL CLI) writes to `assets/ASSETS/` (42 PNGs found there — `lightning_scimitar*`, `photo_1*`, etc.); Door B (foundry) writes to `output/foundry/<name>/` (confirmed live: `node scripts/generate-void-chestplate.mjs` → `output/foundry/void-chestplate/`, 13 fresh files). No shared index tells a user which convention applies to which door. This is severe enough that it fooled this session's own standing memory (`feedback-scdl-asset-output-folder.md`, "all gens → assets/ASSETS") for half the system — if the tool built to remember this repository's own conventions got it wrong, a new team member has no chance without reading source.

**[MAJOR]** Zero onboarding path, verified by direct grep and directory listing: `docs/README.md` has no mention of `pixelbrain`/`scdl`/`asset` at all; the one document written explicitly for newcomers (`PIXELBRAIN_AGENT_OPERATING_MANUAL.md`, 934 lines) sits three directories deep with no inbound link from any index found; **224 top-level `.js` files, one authored README** (`semantic/README.md`, covering an unrelated 48-line subsystem); the well-documented, working `scdl.cli.js --help` is **not wired into `npm run` anywhere** — zero of 119 `package.json` scripts reference it; **40 of ~41** asset-generator scripts in `scripts/` have no npm entry either (only `generate-compose-themes` does); and the repo's one real MCP server (`codex/server/collab/mcp-bridge.js`, 83 registered tools) exposes **zero** asset-generation capability — no tool for `forgeItemAsset`, no tool for SCDL compile, nothing. An AI assistant trying to help a user "make a bespoke sword" has no discoverable tool to call and would have to already know a raw file path.

**[MAJOR]** `scdl.cli.js:65–77` (`writeOut`) — `--out-dir <dir>` never creates the target directory (no `mkdirSync(..., {recursive:true})` before `writeFileSync`). Reproduced 3/3 attempts: every run against a fresh `--out-dir` fails with a raw `ENOENT: no such file or directory`, including the exact invocation pattern the Authoring Guide's own Quick Start demonstrates. The error text doesn't say "directory does not exist" — it's the bare Node exception, giving a first-time user no hint at the actual fix.

**[MAJOR]** Authored intent and rendered output diverge on exactly the knobs a "bespoke" author would reach for, confirmed by reading the live-forged `void-chestplate.png`: the spec's `outline: {material:'void_gold'}` (`item-spec.js`/`generate-void-chestplate.mjs` collar block, commented "make outer silhouette border gold") renders gold only on the pauldron arcs, not the silhouette; `bevelStrength: 1.1` produces no visible bevel gradient on the torso, which reads as a flat near-black field. What you author is not reliably what you get, and nothing in the pipeline surfaces that gap back to the author.

**[MINOR]** `docs/scholomance-encyclopedia/Scholomance White Papers/SCDL_COMPILER_WHITE_PAPER.md` §8 (CLI Command Manual) documents only `compile`, `parse`, `check` — it is missing `preview` (with `--scale`, filmstrip export — the actual iterate-and-look command an artist would use most), and doesn't mention `--shade`, `--strict`, or `--out`, all of which exist and work per the CLI's own bare-run help text.

**[MINOR]** Diagnostic verbosity is inconsistent between commands on the identical underlying warning: `compile` prints a clean one-liner (`WARN: Unknown material 'crimson_ooze_material' in part 'body' — falling back to 'source'`); `preview` and `check` print the same diagnostic with a ~250-character raw `PB-ERR-v1-...` base64 payload inline in the terminal. This lands on the command a first-time user runs most (`preview`, to look at their art) rather than the quieter one.

**[MINOR]** A parse-blocking error (e.g. SCDL-006, undefined palette alias) prevents the compiler from surfacing a later SCDL-005 warning and SCDL-026 error sitting further down the same test file — they only appear after the first is fixed and the file is recompiled. Ordinary parser behavior, but it means "fix one, recompile, fix next" rather than seeing the full error set at once.

**[MINOR]** `codex/core/pixelbrain/scdl/tiles` is not a directory — it's a bare 1920×1080 PNG with no file extension sitting inside a fixtures folder next to `.scdl` files. `ls` gives no visual cue it's an image, and a naive `find -iname '*.png'` would silently miss it.

**[NITPICK]** `amp-registry.js`'s self-disclaiming header (see MAJOR #1) is at least honest about its own uselessness rather than silently lying — noted as the one mitigating detail in an otherwise real gap, not a separate defect.

---

### ─── STRENGTHS (verified, not conceded lightly) ───

**S1 — The SCDL error system is genuinely good.** A deliberately broken `.scdl` file (undefined palette alias, unknown material, boolean op targeting a nonexistent part) produced errors like:
```
ERROR: [SCDL-006] Undefined palette alias 'undefined_alias' (line 9:3) | PB-ERR-v1-...
ERROR: [SCDL-026] Boolean op 'subtract' in part 'hole' references invalid target(s) 'nonexistent_part' — targets must name a different, existing part (line 17:3) | ...
```
Exact line:col, names the actual offending value, fully actionable from the human-readable prefix alone — the bytecode diagnostic system is additive, never a replacement for plain English. This directly refutes a plausible worry that the `PB-ERR-v1` machinery makes errors inscrutable.

**S2 — The documented authoring path actually works, end to end, first try.** A 20×20 shield (polygon body, gold rim with `symmetry x`, sapphire `sphere` boss with `glow`) was authored from scratch using only the Authoring Guide, no fixture-copying. It compiled with **0 errors, 0 warnings**, and rendered correctly on the first attempt. Looking at the output: a presentable kite shield, gold trim, glowing sapphire boss with correct 5-tier Lambert shading — reads as a real game asset, not programmer art. This is the single strongest piece of direct evidence for the question this audit was asked: yes, a first-time-feeling author can get a bespoke, decent-looking asset out of this system in one pass, through Door A.

**S3 — Documentation is accurate everywhere spot-checked**, including honestly documenting inert placeholder ops (`rotate`/`scale`/`translate` are parsed but do nothing yet) rather than silently shipping a broken promise.

**S4 — `void_acolyte` (`scdl/fixtures/void_acolyte/`) is production-quality.** A 4-frame idle-loop robed acolyte with staff, hood shading, and glowing orb — clean silhouette, coherent subtle animation. The strongest visual proof in this audit that the pipeline, driven well, produces shippable pixel art.

**S5 — The WIP palette-diagnostic work in the current uncommitted diff is correctly scoped.** `item-spec.js`'s new `fidelity.exactPalette` and `palette-quantization-amp.js`'s semantic-color reservation are observation-only per their own tests (`tests/unit/palette-quantization-diagnostics.test.js`, **14/14 passing**, confirmed by running it) and match the shipped state already described in the companion color-audit — a real, tested instrument, not scope creep.

**S6 — The previously-flagged MCP `registerTool` discoverability bug is fixed at the mechanism level.** `mcp-bridge.js:266,280–286` now accepts an optional description argument and uses the SDK's descriptive overload when present. Moot for PixelBrain today (no pixelbrain tools are registered there at all — see MAJOR above), but it shows the underlying tooling gap was real and has been addressed elsewhere in the codebase.

---

### ─── UNVERIFIED RISKS ───

**[UNVERIFIED]** The ~200 amp/effect modules beyond the 53 counted were not individually opened — categorization was by filename pattern, not content. Some fraction may be dead, aspirational, or duplicate a working equivalent; this audit can't distinguish those from the outside, and `amp-registry.js`'s own disclaimer means the registry can't answer this either.

**[UNVERIFIED]** Aseprite binary export, tile-forge, graphic-forge, and voxel export paths were read for shape but not run. Their functional/UX quality is unassessed here.

**[UNVERIFIED]** Only one foundry generator (`generate-void-chestplate.mjs`) was traced closely enough to find the imperative-patch problem (MAJOR #2). Whether the other ~40 generator scripts have the same "declarative spec alone isn't enough" pattern, or whether void-chestplate is unusually demanding, was not checked script-by-script.

---

### ─── TO CLIMB ONE GRADE ───

Not a rewrite. Four small, independently shippable moves, each targeting one MAJOR finding directly:
1. One line: `mkdirSync(dirname(outPath), {recursive:true})` before the `writeFileSync` in `scdl.cli.js:65–77`.
2. Wire `scdl.cli.js` into `package.json` as `npm run scdl -- <args>`, and register at least a thin MCP tool wrapping `compile`/`preview` so an assistant (or a newcomer) can find it without knowing the file path.
3. Delete or rewrite `amp-registry.js`'s disclaiming comment into an actual catalog — even a hand-maintained markdown table of the 53 amp files with a one-line description each would out-perform "read the source" as the discovery mechanism.
4. One paragraph at the top of `docs/README.md` pointing at the SCDL Authoring Guide and naming which of the two doors to use for which kind of asset.

Land two of these four and this moves to B-.

---

### ─── THE GRUDGING WORD ───

I went in expecting a maze, and it is one — 224 files, no map, a registry that tells you not to trust it, two front doors that don't know about each other. That part earned every bit of contempt in the findings above.

But I didn't just read the maze, I walked into it and drew something. Twenty minutes with nothing but the Authoring Guide produced a shield that compiled clean on the first try and actually looks like a shield someone designed on purpose. That is not supposed to happen in a system this poorly signposted, and it happened anyway, because underneath the discoverability failure there's a compiler with genuinely good error messages and a genuinely honest spec. I don't like that I have to say that about a codebase that also shipped its own flagship asset with hand-tuned magic-number pixel patches bolted on afterward — but I tried the thing the report was actually asked about, and it worked. Grudging credit, filed under S2, and the grade reflects both halves of that sentence.

## ═════════════════════════════════════════════

---

## Appendix A — Evidence index

| Ref | Path | Lines/Location | Claim supported |
|---|---|---|---|
| E1 | `codex/core/pixelbrain/amp-registry.js` | 3–17 | Self-disclaimed non-catalog; 2/53 amps registered |
| E2 | `scripts/generate-void-chestplate.mjs` | 267–339 | Imperative post-forge patches on the flagship asset |
| E3 | `codex/core/pixelbrain/scdl/scdl.cli.js` | 65–77 | `writeOut` missing `mkdirSync`; `--out-dir` ENOENT |
| E4 | `codex/core/pixelbrain/item-spec.js` / `generate-void-chestplate.mjs` | outline/collar block | Gold-outline spec vs. rendered pauldron-only gold |
| E5 | `docs/README.md` | — | Zero mentions of pixelbrain/scdl/asset |
| E6 | `docs/scholomance-encyclopedia/Scholomance White Papers/PIXELBRAIN_AGENT_OPERATING_MANUAL.md` | 934 lines total | Onboarding doc exists, unlinked, 3 dirs deep |
| E7 | `package.json` | 119 scripts total | 2 relevant (`assets:armrig`, `assets:charmodel`), 0 wrap `scdl.cli.js` |
| E8 | `codex/server/collab/mcp-bridge.js` | 83 `registerTool` calls | Zero asset-generation MCP tools; description-overload fix present at :266, :280–286 |
| E9 | `codex/core/pixelbrain/scdl/tiles` | — | Extension-less PNG mis-sited in fixtures dir |
| E10 | `tests/unit/palette-quantization-diagnostics.test.js` | 14 cases | 14/14 passing, run live |
| E11 | `docs/.../SCDL_COMPILER_WHITE_PAPER.md` | §8 | CLI manual stale — missing `preview`, `--shade`, `--strict`, `--out` |
| E12 | `output/foundry/void-chestplate/` vs `assets/ASSETS/` | live directory listings | Two incompatible output conventions |
| E13 | `codex/core/pixelbrain/semantic/README.md` | 48 lines | The one authored README in the tree |
| E14 | `/tmp/.../scratchpad/test_shield.scdl` + rendered PNG | — | Original from-scratch asset, 0 errors/warnings, first-try clean render |
| E15 | `codex/core/pixelbrain/scdl/fixtures/void_acolyte/` | 4-frame set | Production-quality reference output |
| E16 | `codex/core/pixelbrain/scdl/fixtures/crimson_ooze.scdl` output | — | Visible 5-tier Lambert banding at small size |

## Appendix B — Reproduction commands

```bash
# SCDL CLI, real fixture, clean compile
node codex/core/pixelbrain/scdl/scdl.cli.js compile \
  codex/core/pixelbrain/scdl/fixtures/crimson_ooze.scdl --export png,svg,json

# Reproduce the --out-dir ENOENT bug (fresh, non-existent dir)
node codex/core/pixelbrain/scdl/scdl.cli.js compile \
  codex/core/pixelbrain/scdl/fixtures/crimson_ooze.scdl \
  --out-dir /tmp/does-not-exist-yet --export png
# -> ENOENT: no such file or directory, open '/tmp/does-not-exist-yet/...'

# Live foundry generator run (writes to output/foundry/void-chestplate/)
node scripts/generate-void-chestplate.mjs

# WIP diagnostics test suite
npx vitest run tests/unit/palette-quantization-diagnostics.test.js
# -> 14/14 passed
```

## Appendix C — Relationship to the companion report

`2026-09-02-asset-generation-pipeline-phenotype-idealism.md` and this report examine the same codebase through different lenses and reach compatible but distinct verdicts:

- The companion report found the **geometry layer strong, the color layer weaker than it should be** (lexicographic-then-fixed palette selection, sRGB-space distance/blending, discarded coverage at PNG export) — and, after its own self-correction via Probe 4, found that on the one real shipped asset it measured, the defect was largely **cosmetically inert** rather than visibly damaging.
- This report asks a product question instead of a correctness question — **can a person find this system, understand it, and use it to make something bespoke and beautiful** — and finds the compiler capable of exactly that (S2), while the surrounding system (discovery, the second authoring door, output conventions, the amp catalog) actively works against a newcomer ever finding out.

Read together: the defect is not "the pipeline can't make good art." It demonstrably can (S2, S4). The defect is that almost nothing about how this system is organized helps a person discover that, and the one flagship example proving it out required hand-authored patches its own spec system couldn't express.
