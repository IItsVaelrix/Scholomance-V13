# Where generated assets go — and what actually gets committed

Written because the 2026-09-03 asset-pipeline audit found two output conventions
that "no shared index tells a user which applies to which door," severe enough
to fool that session's own standing memory note about this repository's output
folder. Conventions that live only in `.gitignore` comments and generator
source are not discoverable, so they are written down here and linked from
`docs/README.md`.

**There are not two conventions. There are two doors, one rule, and one thing
nobody told you: almost none of the generated pixels are in git.**

---

## Door A — SCDL text DSL

```bash
npm run scdl -- compile <file.scdl> --export png,svg,json,aseprite
```

Writes **next to the source `.scdl` file**, never the CWD, named
`<asset>-<target>.<ext>` (multi-frame: `<asset>-f<N>-<target>.<ext>` plus
`<asset>-frameloop.json`). Override the directory with `--out-dir <dir>`, which
creates the directory if it is missing.

The Export Naming Law is why `assets/ASSETS/` appeared to be "the SCDL output
folder": it is just where some legacy `.scdl` sources happen to live, so that is
where their exports landed. Compiling a `.scdl` in `fixtures/` writes into
`fixtures/`. There is no central SCDL output directory.

`preview` is the exception by design: it writes `<asset>-preview-<N>x.png`
(+ `-strip.png` for loops) magnified enough to look at. Those sit outside the
Naming Law namespace and are never valid compiler inputs.

## Door B — ITEM-SPEC-v1 foundry

```bash
node scripts/generate-<asset>.mjs      # no npm wrapper yet for ~40 of these
```

Writes to `output/foundry/<name>/`. 37 asset directories currently sit there.
There is no declarative file to point at — the spec is a JS object inside the
generator script, so **the `.mjs` is the source of truth for a Door B asset.**

---

## The rule that bites: generated art is gitignored on purpose

| Extension | In git? | Why |
|---|---|---|
| `.scdl` | **yes** — 36 tracked in `assets/ASSETS/` | the editable source |
| `-frameloop.json` | **yes** | animation metadata, not a dump |
| `.aseprite` | 4 tracked (pre-rule) | `.gitignore:164` `*-aseprite.aseprite` now ignores fresh exports |
| `-png.png`, `.png` | **no** — `.gitignore:102` `*.png` | regenerable from source |
| `-json.json`, `-phaser.json`, `-svg.svg` | **no** — `.gitignore:106-108` | regenerable from source |
| `output/**` (all of Door B) | **no** — `.gitignore:147` | generated tree |

Measured, not asserted: `assets/ASSETS/` holds **42 PNGs on disk, 0 tracked**,
and 39 JSON files on disk, 1 tracked. The policy is deliberate — the `.gitignore`
comment reads *"regenerable build artifacts (the .scdl is the source, and
-frameloop.json manifests are kept)"* — but it is written in a file nobody reads
as authoring documentation.

**The trap this sets for a first-time contributor:** compile an asset, admire the
PNG, `git add -A`, push, and the art is silently absent for everyone else. The
fix is not to force-add the PNG. The fix is to commit the `.scdl` — a teammate
runs `npm run scdl -- compile` and reproduces every byte of it. If your asset is
only reproducible from a PNG, it is not a Door A asset.

Two consequences worth deciding about deliberately:

1. A Door B asset has **no committed artifact at all** — only its generator
   script. If the script drifts, the previous look is unrecoverable.
2. Any *hand-edited* raster (`_handedits/`, `assets/aspirations/`) is gitignored
   like every other PNG, i.e. one `git clean` away from being unrecoverable,
   because nothing regenerates it. Move hand-made art into a tracked path with an
   explicit `!` un-ignore rule before relying on it.
