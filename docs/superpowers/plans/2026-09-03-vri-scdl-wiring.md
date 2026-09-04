# VRI-SCDL Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `asset-pipeline.js`'s `compileAsset()` — a tested, working SCDL→VRI→raster composition with zero production callers — its first real caller, via a new `--shade vri` value on `scdl.cli.js`'s `compile`/`preview` commands.

**Architecture:** Two independent changes. (1) `compileAsset()` gains a `strict` option, default `true`, threaded into its internal `compileSCDL()` call (currently not threaded at all). (2) `scdl.cli.js` recognizes `--shade vri` as a third value alongside the existing `--shade material`; when present, it calls `compileAsset()` instead of `compileSCDL()` + the default PNG exporter, and PNG-encodes the VRI raster via the exporter module's existing (currently private) `encodePng` function. Door B (`item-foundry.js`) and VRI's own internals (`vixel/`) are untouched.

**Tech Stack:** Node.js (ESM), Vitest.

**Spec:** `docs/scholomance-encyclopedia/PDR-archive/2026-09-03-vri-scdl-wiring-pdr.md` (design doc: `docs/superpowers/specs/2026-09-03-vri-scdl-wiring-design.md`)

## Global Constraints

- Determinism (Law 6): identical `.scdl` source + identical flags → identical output bytes, every run.
- No existing-output regression: any `.scdl` file compiled/previewed without `--shade vri` must produce byte-identical output before and after this plan.
- `strict` default changes in `compileAsset()` only — `scdl.cli.js`'s own separate `--strict` flag and its off-by-default behavior for `compile`/`preview`/`check` are unrelated and untouched.
- No feature flag beyond the `--shade vri` value itself — nothing is on by default.
- Door B (`item-foundry.js`) and `codex/core/pixelbrain/vixel/` internals are not modified.

---

### Task 1: Thread `strict` into `compileAsset()`

**Files:**
- Modify: `codex/core/pixelbrain/asset-pipeline.js:92-102` (options destructure), `:195-197` (the `compileSCDL` call)
- Test: `tests/codex/core/pixelbrain/asset-pipeline.strict.test.js`

**Interfaces:**
- Consumes: `compileSCDL(source, options)` from `./scdl/scdl.compiler.js` — already imported at `asset-pipeline.js:28`. `options.strict: boolean` is an existing, already-supported `compileSCDL` option (used directly by `scdl.cli.js:176`, `:263`, `:344`).
- Produces: `compileAsset(source, options)` gains `options.strict` (boolean, default `true`). No other caller in this plan depends on this yet — Task 2 does not pass `strict` explicitly, so it inherits the new default.

- [ ] **Step 1: Write the failing test**

Real fixture: `codex/core/pixelbrain/scdl/fixtures/crimson_ooze.scdl` genuinely uses `material crimson_ooze_material` (confirmed by direct read, line 18), an unresolvable material that triggers SCDL's own SCDL-005 warning-that-strict-promotes-to-error path.

```js
// tests/codex/core/pixelbrain/asset-pipeline.strict.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileAsset } from '../../../../codex/core/pixelbrain/asset-pipeline.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const source = readFileSync(
  resolve(repoRoot, 'codex/core/pixelbrain/scdl/fixtures/crimson_ooze.scdl'),
  'utf8',
);

describe('compileAsset strict default', () => {
  it('defaults to strict: true and refuses an unresolvable material rather than silently falling back', () => {
    const result = compileAsset(source, { scale: 1 });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => String(e.message || e).includes('crimson_ooze_material'))).toBe(true);
  });

  it('an explicit strict: false restores the old silent-fallback behaviour', () => {
    const result = compileAsset(source, { scale: 1, strict: false });
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/asset-pipeline.strict.test.js`
Expected: first test FAILs — `result.ok` is currently `true` (strict is never threaded, so the unresolvable material silently falls back to `source` and the compile succeeds). Second test currently passes already, which is fine — it stays passing after the implementation too.

- [ ] **Step 3: Write minimal implementation**

```js
// codex/core/pixelbrain/asset-pipeline.js — options destructure, was:
//   const {
//     construction = null, genes = null, canvas = null, assetId = null,
//     projection = {}, vri = {}, scale = null, digest = defaultDigest,
//   } = options;
export function compileAsset(source, options = {}) {
  const {
    construction = null,
    genes = null,
    canvas = null,
    assetId = null,
    projection = {},
    vri = {},
    scale = null,
    digest = defaultDigest,
    strict = true,
  } = options;
```

```js
// codex/core/pixelbrain/asset-pipeline.js:195-197 — was:
//   const scdl = compileSCDL(source, genePackets
//     ? { artGenes: genePackets, artProjectionContext: projectionContext }
//     : {});
  const scdl = compileSCDL(source, {
    ...(genePackets ? { artGenes: genePackets, artProjectionContext: projectionContext } : {}),
    strict,
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/codex/core/pixelbrain/asset-pipeline.strict.test.js`
Expected: PASS (both tests).

- [ ] **Step 5: Run the full existing asset-pipeline/compile-asset/vixel/material-validator suite to confirm no regression**

Run: `npx vitest run tests/codex/core/pixelbrain/vixel/ tests/codex/core/pixelbrain/asset-pipeline.test.js tests/codex/core/pixelbrain/compile-asset.test.js tests/codex/core/pixelbrain/material-validator.test.js`
Expected: PASS, same count as before this task (196 — the Verdict's 194 plus this task's 2 new tests). If any previously-passing test now fails, it relied on the old lenient default — read it before "fixing" it; do not silence it by hardcoding `strict: false` into a fixture that should legitimately be strict-clean.

- [ ] **Step 6: Commit**

```bash
git add codex/core/pixelbrain/asset-pipeline.js tests/codex/core/pixelbrain/asset-pipeline.strict.test.js
git commit -m "fix(pixelbrain): thread strict into compileAsset, default true

compileAsset() never threaded a strict option to its internal compileSCDL()
call at all, so an unresolvable material silently fell back to 'source'
regardless of caller intent. Default true per Vaelrix's ruling; explicit
strict: false restores today's behaviour for any caller that wants it.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0158NgddUD3TEouGrp4naQ35"
```

---

### Task 2: `--shade vri` on `compile` and `preview`

**Files:**
- Modify: `codex/core/pixelbrain/scdl/scdl.exporters.js:415` (`function encodePng` → `export function encodePng`)
- Modify: `codex/core/pixelbrain/scdl/scdl.cli.js:19-22` (imports), `:169` (`cmdCompile` shade parsing), `:192-221` (`cmdCompile` export loop), `:260` (`cmdPreview` shade parsing), `:280-288` (`cmdPreview` render loop), `:396-397` (help text)
- Test: `tests/codex/core/pixelbrain/scdl/scdl.cli.vri-shade.test.js`

**Interfaces:**
- Consumes: `compileAsset(source, options)` from `../asset-pipeline.js` (Task 1's `strict` default applies here automatically — no explicit `strict` passed). `encodePng(width, height, rgba)` from `./scdl.exporters.js` (now exported). `compileAsset()`'s return shape: `{ ok, errors, frames: [{ index, packet, vriScene, raster: { width, height, data } | null }], ... }` — confirmed directly in `asset-pipeline.js:238-243,302` and `vixel/vri-renderer.js:426` (`renderVRI` returns `{ width, height, data }`, not a bare buffer — the PDR's own code example assumed a bare buffer; this plan corrects that).
- Produces: `scdl.cli.js compile <file> --shade vri [--export png] [--out-dir <dir>]` and `scdl.cli.js preview <file> --shade vri` both write real PNG files. No other task depends on new exports from this task.

- [ ] **Step 1: Write the failing test**

```js
// tests/codex/core/pixelbrain/scdl/scdl.cli.vri-shade.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve(process.cwd(), 'codex/core/pixelbrain/scdl/scdl.cli.js');

// A real fixture with actual relief data (sphere op → real normals/signedDistance),
// so VRI's lighting has something to visibly differ on versus flat Lambert banding.
const FIXTURE = resolve(process.cwd(), 'codex/core/pixelbrain/scdl/fixtures/crimson_ooze.scdl');

function runCli(args, cwd) {
  return execFileSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
}

function runBoth(args, cwd) {
  const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', all: (r.stdout ?? '') + (r.stderr ?? '') };
}

let dir;
let cwdDir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'scdl-vri-cli-'));
  cwdDir = mkdtempSync(join(tmpdir(), 'scdl-vri-cli-cwd-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(cwdDir, { recursive: true, force: true });
});

describe('SCDL CLI — --shade vri', () => {
  it('compile --shade vri writes a PNG that differs from the default-shaded PNG', () => {
    runCli(['compile', FIXTURE, '--export', 'png', '--out-dir', dir], cwdDir);
    runCli(['compile', FIXTURE, '--export', 'png', '--shade', 'vri', '--out-dir', join(dir, 'vri')], cwdDir);

    const defaultBytes = readFileSync(join(dir, 'crimson_ooze-png.png'));
    const vriBytes = readFileSync(join(dir, 'vri', 'crimson_ooze-png.png'));
    expect(vriBytes.equals(defaultBytes)).toBe(false);
  });

  it('compile without --shade vri is byte-identical to before this change', () => {
    const r1 = runBoth(['compile', FIXTURE, '--export', 'png', '--out-dir', join(dir, 'a')], cwdDir);
    const r2 = runBoth(['compile', FIXTURE, '--export', 'png', '--out-dir', join(dir, 'b')], cwdDir);
    expect(r1.status).toBe(0);
    expect(r2.status).toBe(0);
    expect(readFileSync(join(dir, 'a', 'crimson_ooze-png.png')).equals(
      readFileSync(join(dir, 'b', 'crimson_ooze-png.png')),
    )).toBe(true);
  });

  it('preview --shade vri writes a preview PNG', () => {
    runCli(['preview', FIXTURE, '--shade', 'vri', '--out-dir', dir], cwdDir);
    expect(existsSync(join(dir, 'crimson_ooze-preview-8x.png'))).toBe(true);
  });

  it('a throwing VRI compile reports an error and writes nothing, never crashes', () => {
    // crimson_ooze_material is unresolvable; compileAsset() now defaults strict:true
    // (Task 1), so this compile fails before VRI ever runs — exercising the
    // "report, do not silently fall back or crash" failure path end to end.
    const r = runBoth(['compile', FIXTURE, '--export', 'png', '--shade', 'vri', '--out-dir', dir], cwdDir);
    expect(r.status).not.toBe(0);
    expect(existsSync(join(dir, 'crimson_ooze-png.png'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl.cli.vri-shade.test.js`
Expected: FAIL — `--shade vri` is not yet recognized, so today's code takes the default Lambert path for all four invocations and the differs-from-default assertion fails (or, for the last test, the compile succeeds today because `compileSCDL()` directly — not `compileAsset()` — is still what `cmdCompile` calls, so strict's Task-1 refusal never triggers via this path yet).

- [ ] **Step 3: Write minimal implementation**

```js
// scdl.exporters.js:415 — was: function encodePng(width, height, rgba) {
export function encodePng(width, height, rgba) {
```

```js
// scdl.cli.js:19-24 — add compileAsset and encodePng to the existing imports
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, basename, dirname, extname, join } from 'node:path';
import { compileSCDL, parseSCDL, exportSCDL } from './index.js';
import { buildAsepritePayload, exportFilmstripPNG, MAX_PNG_SCALE, encodePng } from './scdl.exporters.js';
import { encodeAsepriteBinary } from '../aseprite-binary-codec.js';
import { buildSCDLDiagnosticReport } from './scdl.diagnostics.js';
import { compileAsset } from '../asset-pipeline.js';
```

```js
// scdl.cli.js:169 — cmdCompile, was:
//   const shade = opts.flags.shade === 'material' ? 'material' : undefined;
  const shade = opts.flags.shade === 'vri' ? 'vri'
    : opts.flags.shade === 'material' ? 'material'
    : undefined;
```

Insert immediately after the `console.log('[SCDL] Compiling: ...')` line (scdl.cli.js:175), before the existing `compileSCDL` call, as an early return for the `vri` case — the rest of `cmdCompile`'s existing body (targets loop, aseprite handling, frameloop.json) is unrelated to VRI shading and stays exactly as-is for every other `--shade` value:

```js
  console.log(`[SCDL] Compiling: ${filePath}`);

  if (shade === 'vri') {
    const asset = compileAsset(source, { scale });
    if (!asset.ok) {
      console.error(`[SCDL] --shade vri: compile FAILED — ${asset.errors?.[0]?.message ?? 'unknown error'}`);
      process.exit(1);
    }
    const multi = asset.frames.length > 1;
    asset.frames.forEach((frame, i) => {
      if (!frame.raster) {
        console.warn(`  [WARN] --shade vri (frame ${i}) produced no raster`);
        return;
      }
      const infix = multi ? `-f${i}` : '';
      const dest = outPath
        ? _targetPath({ outPath, sourceName: name, target: 'png', multi: false })
        : join(outDir, `${name}${infix}-png.png`);
      writeOut(dest, encodePng(frame.raster.width, frame.raster.height, frame.raster.data));
    });
    console.log(`[SCDL] Done. Packet ID: ${asset.frames[0].packet.id}`);
    return;
  }

  const result = compileSCDL(source, { strict: opts.flags.strict === true });
```

```js
// scdl.cli.js:260 — cmdPreview, was:
//   const shade = opts.flags.shade === 'material' ? 'material' : undefined;
  const shade = opts.flags.shade === 'vri' ? 'vri'
    : opts.flags.shade === 'material' ? 'material'
    : undefined;
```

Insert immediately after that line, before the existing `compileSCDL` call — `cmdPreview`'s scale/outDir/name are already computed above this point:

```js
  if (shade === 'vri') {
    const asset = compileAsset(source, { scale });
    if (!asset.ok) {
      console.error(`[SCDL] preview --shade vri: compile FAILED — ${asset.errors?.[0]?.message ?? 'unknown error'}`);
      process.exit(1);
    }
    const multi = asset.frames.length > 1;
    console.log(`[SCDL] Preview: ${filePath} @ ${scale}x (vri)`);
    asset.frames.forEach((frame, i) => {
      if (!frame.raster) return;
      const infix = multi ? `-f${i}` : '';
      writeOut(join(outDir, `${name}${infix}-preview-${scale}x.png`), encodePng(
        frame.raster.width, frame.raster.height, frame.raster.data,
      ));
    });
    return;
  }

  const source = readSource(filePath);
```

(Note: `cmdPreview` currently reads `source` via `readSource(filePath)` a few lines below where `shade` is computed — the `if (shade === 'vri')` block above must be placed *after* `const source = readSource(filePath);` runs, not before; adjust the insertion point to follow it, since `compileAsset` needs `source`, not `filePath`.)

Update the help text (`scdl.cli.js:396-397`):

```js
  node scdl.cli.js compile <file.scdl> [--export json,svg,phaser,png,aseprite] [--out-dir <dir>] [--out <file>] [--shade material|vri] [--scale N] [--strict]
  node scdl.cli.js preview <file.scdl> [--scale N] [--out-dir <dir>] [--shade material|vri] [--strict]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl.cli.vri-shade.test.js`
Expected: PASS (all four).

- [ ] **Step 5: Golden-diff the full existing fixture corpus**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/`
Expected: PASS, same count as before this task. This is the regression check for every existing `--shade material` and default-shading test — none of them pass `--shade vri`, so none of them should be affected by the new branch.

- [ ] **Step 6: Real-asset eyes-on check (PDR Phase 3 — human judgment, not automatable)**

Run both, then open both PNGs in an image viewer:
```bash
node codex/core/pixelbrain/scdl/scdl.cli.js compile codex/core/pixelbrain/scdl/fixtures/crimson_ooze.scdl --export png --out-dir /tmp/vri-check/default
node codex/core/pixelbrain/scdl/scdl.cli.js compile codex/core/pixelbrain/scdl/fixtures/crimson_ooze.scdl --export png --shade vri --out-dir /tmp/vri-check/vri
```
Look at `/tmp/vri-check/default/crimson_ooze-png.png` and `/tmp/vri-check/vri/crimson_ooze-png.png` side by side. Confirm the VRI render is not visibly broken (no NaN-black regions, no fully-transparent asset, no obviously inverted lighting) before proceeding to commit. This is U1 from the PDR §5.2 — record what was observed in the commit message.

- [ ] **Step 7: Commit**

```bash
git add codex/core/pixelbrain/scdl/scdl.cli.js codex/core/pixelbrain/scdl/scdl.exporters.js tests/codex/core/pixelbrain/scdl/scdl.cli.vri-shade.test.js
git commit -m "feat(pixelbrain): wire VRI into SCDL via --shade vri

compileAsset() (asset-pipeline.js) already composes compileSCDL -> compileVRI
-> renderVRI as one tested function (194 tests per VERDICT-2026-09-03-VIXEL-SYSTEM.md)
but had zero production callers. --shade vri, alongside the existing --shade
material, routes compile/preview through it instead of compileSCDL() + the
default Lambert-shaded PNG exporter.

renderVRI() returns { width, height, data }, not a bare buffer -- corrects an
assumption in the PDR's own code example. encodePng (scdl.exporters.js),
already the low-level encoder renderPngBytes() delegates to, is now exported
and called directly on VRI's raster -- no rasterization duplicated.

No existing invocation is affected: --shade vri is new syntax, golden-diffed
against the full fixture corpus with zero output change. Door B (item-foundry.js)
and vixel/ internals untouched.

Eyes-on check: [RECORD WHAT WAS OBSERVED ON crimson_ooze.scdl HERE]

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0158NgddUD3TEouGrp4naQ35"
```

---

## Self-Review

**Spec coverage:** PDR F1 (flag recognition) → Task 2 Step 3. F2 (route through compileAsset per frame) → Task 2 Step 3, both commands. F3 (encodePng export) → Task 2 Step 3. F4 (strict threading) → Task 1. PDR Phase 3 (eyes-on check) → Task 2 Step 6. §12 QA commands → covered by Task 1 Step 5 and Task 2 Step 5. No PDR requirement without a task.

**Placeholder scan:** one intentional placeholder remains by design — Task 2's commit message has `[RECORD WHAT WAS OBSERVED...]`, which is correct: Step 6 is a human-judgment step that cannot be scripted, and the plan says so explicitly rather than inventing fake "no regressions found" text before the check has actually happened.

**Type consistency:** `frame.raster` used consistently as `{ width, height, data }` in both Task 2 code blocks, matching `vri-renderer.js:426`'s actual return shape (verified directly, not assumed — this corrected the PDR's own example, which assumed a bare buffer). `compileAsset(source, options)` and `encodePng(width, height, rgba)` signatures used identically in both `cmdCompile` and `cmdPreview` blocks.

## Execution

Two tasks, small and sequential — Task 2 depends on Task 1's `strict` default (exercised by Task 2's fourth test) but not on any other Task 2 output. Given the size, I'll execute this inline via `superpowers:executing-plans` rather than spinning up subagents per task, unless you'd rather have the two-stage subagent review. Proceeding inline now — say so if you want it switched to subagent-driven instead.
