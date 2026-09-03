# Documentation Map

This directory centralizes project documentation for faster AI/team navigation.

## Making a pixel-art asset (start here)

This is the part of the repository with the most code and the fewest signs
pointing at it, so: **there are two ways to author an asset, and which one you
want depends on whether you are drawing a shape or generating a family.**

| | Door A — **SCDL** (text DSL) | Door B — **ITEM-SPEC-v1** (JS spec) |
|---|---|---|
| You write | a `.scdl` file: canvas, palette, parts, polygons, booleans, symmetry, frames | a nested JS object consumed by `item-foundry.js` |
| Best for | one specific, hand-designed asset — a particular sword, a 4-frame idle loop | procedural families — N chestplate variants, class-driven silhouettes |
| Start | `scholomance-encyclopedia/Scholomance White Papers/SCDL_AUTHORING_GUIDE.md` | `scholomance-encyclopedia/Scholomance White Papers/PIXELBRAIN_AGENT_OPERATING_MANUAL.md` |
| Run it | `npm run scdl -- compile <file.scdl> --export png,svg` then `npm run scdl -- preview <file.scdl>` | `node scripts/generate-<asset>.mjs` |
| Output | beside the source `.scdl` | `output/foundry/<name>/` (gitignored) |
| Compiler reference | `SCDL_COMPILER_WHITE_PAPER.md` | `VERIFIED_ASSET_PIPELINE_WHITE_PAPER.md` |

If you are new, **use Door A.** It has a CLI, error codes with line:col
positions, and a documented authoring guide that a first-time author has
followed end-to-end successfully. Door B reaches further (SDF geometry,
heraldry, quantization, ~50 composed effect passes) but its specs do not today
reliably produce the asset you described without imperative touching-up — see
the flagged finding in `2026-09-03-pixelbrain-pipeline-ux-savage-audit.md`.

Two things that are not in either doc and used to be impossible to find:

- **`codex/core/pixelbrain/EFFECT_CATALOG.md`** — every effect/AMP pass, what it
  does, and whether it is actually wired into a live code path.
  Regenerate or query with `npm run effects`.
- **`codex/core/pixelbrain/OUTPUTS.md`** — where generated assets land and which
  of them git actually tracks (most do not, deliberately).

Both are reachable from an AI assistant too: the collab MCP server registers
`asset_scdl`, `asset_effects_list`, and `asset_output_conventions`.

## Folders

- `ai/`: AI-specific architecture, onboarding, and instruction docs.
- `architecture/`: system architecture and feature integration plans.
- `operations/`: deployment and build runbooks.
- `project/`: changelog and migration guides.
- `reports/`: audits, bug reports, and review outputs.
- `references/`: source/reference material used by scripts and analysis.

## Key Starting Points

- `ai/AI_README_ARCHITECTURE.md`
- `ai/ONBOARDING_JUNIOR.md`
- `architecture/BACKEND_INFRASTRUCTURE_EXPLAINED.md`
- `operations/DEPLOY_RENDER.md`
- `operations/DICT_BUILD.md`

## Notes

- Root keeps only high-signal entry docs (`README.md`, `CLAUDE.md`, `GEMINI.md`, `TODO.md`).
- Dataset scripts now resolve `docs/references/DATA-SET 1.md` first, with legacy root fallback.
