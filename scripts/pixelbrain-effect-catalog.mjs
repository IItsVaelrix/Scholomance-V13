#!/usr/bin/env node
/**
 * PixelBrain effect/AMP catalog generator.
 *
 * WHY THIS EXISTS (audit 2026-09-03, MAJOR #1)
 *   The only module that could answer "what effects are there to make an asset
 *   look good?" was amp-registry.js, whose own header disclaims it: 2 of ~40
 *   amps are registered, listAmps() had no consumers, and there was no other
 *   list-all-effects surface anywhere. A user's single discovery method was
 *   "open source files one at a time, guided by filename guesswork."
 *
 * WHAT THIS DOES DIFFERENTLY
 *   The catalog is DERIVED, not hand-maintained. A hand-written table of 40
 *   modules rots the moment someone adds the 41st — which is precisely how the
 *   registry fell out of sync in the first place. Every column below is
 *   measured from source on each run, and `--check` fails the build if the
 *   committed markdown no longer matches the tree.
 *
 * Usage:
 *   node scripts/pixelbrain-effect-catalog.mjs           # write codex/core/pixelbrain/EFFECT_CATALOG.md
 *   node scripts/pixelbrain-effect-catalog.mjs --check    # CI: exit 1 if committed md is stale
 *   node scripts/pixelbrain-effect-catalog.mjs --stdout   # print to stdout, do not write
 *   node scripts/pixelbrain-effect-catalog.mjs --json     # machine-readable (used by MCP tool)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_MD = join(ROOT, 'codex/core/pixelbrain/EFFECT_CATALOG.md');

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.venv', 'dist', 'build', '.gradle', '__pycache__',
  '.ruff_cache', 'output', '.next', 'vendor', 'Unity', 'unity_projects',
]);

// Files whose imports are evidence of production use vs. merely being tested.
const TEST_SEGS = /(^|\/)(tests?|__tests__)\//;
const SCRIPTS_SEG = /(^|\/)scripts\//;

function walk(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.github') continue;
    const abs = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(abs, acc);
    } else if (/\.(js|mjs)$/.test(e.name)) {
      acc.push(abs);
    }
  }
  return acc;
}

const ALL_JS = walk(join(ROOT, 'codex'))
  .concat(walk(join(ROOT, 'scripts')))
  .concat(walk(join(ROOT, 'tests')))


/** Every (importer, resolved-specifier) pair in the scanned tree. */
function buildImportGraph(files) {
  const graph = new Map(); // target abs path -> Set(importer abs path)
  // Both forms, deliberately: a first draft here matched only the parenthesized
  // `import('./x.js')` dynamic form, which silently reported 48 of 53 passes as
  // ORPHAN — a confidently wrong catalog is worse than the missing one it
  // replaced. Static `from './x.js'` is the form this codebase actually uses.
  const forms = [
    /(?:^|\s)from\s+['"](\.[^'"]+)['"]/g,          // import x from './y.js'
    /(?:^|\s)import\s+['"](\.[^'"]+)['"]/g,        // side-effect import './y.js'
    /import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g,      // await import('./y.js')
    /require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g,     // require('./y.js')
  ];
  for (const file of files) {
    let src;
    try { src = readFileSync(file, 'utf8'); } catch { continue; }
    const hits = new Set();
    for (const re of forms) {
      let m;
      while ((m = re.exec(src)) !== null) hits.add(m[1]);
    }
    for (const spec of hits) {
      const base = resolve(dirname(file), spec);
      for (const cand of [base, `${base}.js`, `${base}.mjs`, join(base, 'index.js')]) {
        if (existsSync(cand) && statSync(cand).isFile()) {
          if (!graph.has(cand)) graph.set(cand, new Set());
          graph.get(cand).add(file);
          break;
        }
      }
    }
  }
  return graph;
}

const GRAPH = buildImportGraph(ALL_JS);

/** First sentence of the module's leading /** block comment, if any. */
function extractSummary(src) {
  const block = /^\/\*\*([\s\S]*?)\*\//.exec(src) || /^\/\*([\s\S]*?)\*\//.exec(src);
  if (!block) return null;
  const lines = block[1]
    .split('\n')
    .map((l) => l.replace(/^\s*\*?\s?/, '').trimEnd())
    .filter((l) => l.length > 0);
  // Drop the filename echo line ("selout-amp.js") and any STATUS/banner noise.
  const body = lines.filter((l) =>
    !/^[\w.-]+\.(js|mjs)$/.test(l) && !/^[═─-]{3,}$/.test(l) && !/^={3,}$/.test(l));
  if (!body.length) return null;
  // First sentence, else first line.
  const first = body[0];
  const sentence = /^([^.!?]*[.!?])/.exec(first);
  let out = (sentence ? sentence[1] : first).trim();
  if (out.length < 12 && body[1]) out = `${out} ${body[1].trim()}`;
  return out.replace(/\s+/g, ' ').slice(0, 180);
}

function extractAmpId(src) {
  const m = /export const \w*_?AMP_ID\s*=\s*['"]([^'"]+)['"]/.exec(src);
  return m ? m[1] : null;
}

/**
 * Exported symbols, used as the fallback description.
 *
 * Roughly half these modules have no header comment. Rather than render rows of
 * "no summary — open a PR", say what the module actually offers: an
 * `exports: applyFoo, barBaz` row is immediately greppable and tells a caller
 * whether to open the file at all, which is the decision the catalog exists to
 * short-circuit.
 */
function extractExports(src) {
  const names = new Set();
  const pats = [
    /export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g,
    /export\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/g,
    /export\s*\{([^}]*)\}/g,
  ];
  for (const re of pats) {
    let m;
    while ((m = re.exec(src)) !== null) {
      if (m[1].includes(',')) {
        for (const part of m[1].split(',')) {
          const tok = part.trim().split(/\s+as\s+/)[0];
          if (/^[A-Za-z_$][\w$]*$/.test(tok)) names.add(tok);
        }
      } else if (/^[A-Za-z_$][\w$]*$/.test(m[1]) && m[1] !== 'default') {
        names.add(m[1]);
      }
    }
  }
  return [...names];
}

/** A comment line is only a summary if it actually describes something. */
function usableSummary(text) {
  if (!text) return null;
  const t = text.trim();
  if (t.length < 16) return null;
  if (/^[a-z0-9_.-]+\.$/i.test(t)) return null;   // "chunks-seam-amp."
  if (/^[A-Z0-9 -]+AMP\b/i.test(t) && t.length < 24) return null;
  return t;
}

function classify(importers) {
  const prod = [...importers].filter((f) => !TEST_SEGS.test(relative(ROOT, f)) && f !== undefined);
  const tests = [...importers].filter((f) => TEST_SEGS.test(relative(ROOT, f)));
  const scripts = prod.filter((f) => SCRIPTS_SEG.test(relative(ROOT, f)));
  const core = prod.filter((f) => !SCRIPTS_SEG.test(relative(ROOT, f)));
  if (core.length) return { tag: 'WIRED', detail: `${core.length} module(s)` };
  if (scripts.length) return { tag: 'GEN', detail: `${scripts.length} generator script(s)` };
  if (tests.length) return { tag: 'TEST-ONLY', detail: `${tests.length} test(s)` };
  return { tag: 'ORPHAN', detail: 'nothing imports it' };
}

function collectAmps() {
  const roots = [
    { dir: join(ROOT, 'codex/core/pixelbrain'), system: 'pixelbrain', depth: 1 },
    { dir: join(ROOT, 'codex/core/pixelbrain/amps'), system: 'microprocessor', depth: 99 },
    { dir: join(ROOT, 'codex/core/microprocessors'), system: 'microprocessor', depth: 1 },
  ];
  const found = [];
  for (const r of roots) {
    if (!existsSync(r.dir)) continue;
    const files = walk(r.dir).filter((f) =>
      (r.system === 'microprocessor' ? /\.(microprocessor|processor)\.js$|\.microprocessor\.js$/.test(f) || f.includes('/amps/') : true));
    for (const f of files) {
      const rel = relative(ROOT, f);
      const isTopAmp = r.system === 'pixelbrain' && rel.split('/').length === 4 && f.endsWith('-amp.js');
      const isMicro = r.system === 'microprocessor';
      if (!isTopAmp && !isMicro) continue;
      if (!f.endsWith('.js')) continue;
      found.push({ file: f, rel, system: r.system });
    }
  }
  // de-dup by path
  const seen = new Set();
  return found.filter((x) => (seen.has(x.file) ? false : (seen.add(x.file), true)));
}

function registeredIds() {
  try {
    // Import for effect only: registrants self-register at module load.
    return import('../codex/core/pixelbrain/amp-registry.js')
      .then((m) => import('../codex/core/pixelbrain/scholomance-character-motif-amp.js')
        .then(() => new Set(m.listAmps())));
  } catch {
    return Promise.resolve(new Set());
  }
}

/**
 * Generators + their real output roots.
 *
 * The audit's discoverability complaint was not only about npm: 39 of the
 * `scripts/generate-*.mjs` asset generators had no npm entry, and nothing said
 * which directory each one writes into. Both facts are cheap to read off the
 * source, so they are catalogued here instead of left to guesswork. Output
 * roots are extracted from the script's own `const OUT_DIR = ...` (the segment
 * strings survive three different spellings of `resolve(...)`); a generator
 * with no literal path is reported as such rather than guessed at.
 */
function collectGenerators() {
  const dir = join(ROOT, 'scripts');
  let names = [];
  try { names = readdirSync(dir).filter((f) => /^generate-.*\.mjs$/.test(f)); } catch { return []; }
  let wired = new Set();
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    for (const cmd of Object.values(pkg.scripts || {})) {
      for (const m of String(cmd).matchAll(/scripts\/(generate-[\w.-]+\.mjs)/g)) wired.add(m[1]);
    }
  } catch { /* package.json unreadable: everything reports unwired, which is honest */ }

  return names.map((f) => {
    const src = readFileSync(join(dir, f), 'utf8');
    const m = /(?:const|let)\s+OUT(?:_DIR|Dir|PUT_DIR)?\s*=\s*([^;\n]+)/.exec(src);
    let out = null;
    if (m) {
      const segs = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((s) => s[1])
        .filter((s) => !s.startsWith('.') && s !== '/' && s.length > 1);
      const joined = segs.join('/');
      if (/^(output|assets|dist|build)\b/.test(joined)) out = joined;
    }
    return {
      name: f,
      path: `scripts/${f}`,
      outDir: out,
      wired: wired.has(f),
      summary: usableSummary(extractSummary(src)),
      // Three-way on purpose. The docs describe "two doors", but a third
      // population exists: scripts that import effect passes and the rasterizer
      // directly and compose them by hand, using neither SCDL nor the foundry.
      // Labelling those as "the other door" is what put this report's own
      // door-count off, so it gets its own value instead of a coerced binary.
      door: /forgeItemAsset|item-foundry/.test(src) ? 'foundry'
        : /compileSCDL|scdl\.cli|scdl\/index|parseSCDL/.test(src) ? 'scdl'
        : /pixelbrain/.test(src) ? 'direct-pass' : 'other',
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export async function buildEffectCatalog() {
  const registered = await registeredIds();
  const amps = collectAmps().map(({ file, rel, system }) => {
    const src = readFileSync(file, 'utf8');
    const importers = GRAPH.get(file) || new Set();
    const cls = classify(importers);
    const id = extractAmpId(src);
    return {
      path: rel,
      name: basename(rel, '.js'),
      system,
      summary: usableSummary(extractSummary(src)),
      exports: extractExports(src).slice(0, 4),
      ampId: id,
      registered: id ? registered.has(id) : false,
      status: cls.tag,
      detail: cls.detail,
      importers: importers.size,
    };
  });
  amps.sort((a, b) => a.system.localeCompare(b.system) || a.name.localeCompare(b.name));
  const summary = {
    total: amps.length,
    wired: amps.filter((a) => a.status === 'WIRED').length,
    gen: amps.filter((a) => a.status === 'GEN').length,
    testOnly: amps.filter((a) => a.status === 'TEST-ONLY').length,
    orphan: amps.filter((a) => a.status === 'ORPHAN').length,
    documented: amps.filter((a) => a.summary).length,
    registered: amps.filter((a) => a.registered).length,
    registryIds: registered.size,
    registryList: registered.size
      ? [...registered].map((id) => `\`${id}\``).join(', ')
      : 'none',
  };
  const generators = collectGenerators();
  summary.generators = generators.length;
  summary.generatorsWired = generators.filter((g) => g.wired).length;
  summary.generatorsFoundry = generators.filter((g) => g.door === 'foundry').length;
  summary.generatorsScdl = generators.filter((g) => g.door === 'scdl').length;
  summary.generatorsDirect = generators.filter((g) => g.door === 'direct-pass').length;
  return { amps, generators, summary };
}

export function renderEffectCatalogMarkdown(amps, generators, s) {
  const rows = (list) => list.map((a) => {
    const desc = a.summary
      ? a.summary.replace(/\|/g, '\\|')
      : a.exports.length
        ? `_(no header comment — exports ${a.exports.map((e) => `\`${e}\``).join(', ')})_`
        : '_(no header comment, no exports)_';
    const id = [a.ampId ? `\`${a.ampId}\`` : null, a.registered ? '✓ registered' : null]
      .filter(Boolean).join(' ') || '—';
    return `| \`${a.path}\` | ${desc} | ${a.status} | ${id} |`;
  }).join('\n');

  const DOOR_LABEL = { foundry: 'B foundry', scdl: 'A SCDL', 'direct-pass': 'neither (direct)', other: 'other' };
  const genRows = generators.map((g) => {
    const desc = g.summary ? ` — ${g.summary.replace(/\|/g, '\\|')}` : '';
    return `| \`${g.path}\`${desc} | ${g.outDir ? `\`${g.outDir}\`` : '—'} | ${DOOR_LABEL[g.door]} | ${g.wired ? 'yes' : 'no'} |`;
  }).join('\n');

  const bySystem = (sys) => amps.filter((a) => a.system === sys);
  const pb = bySystem('pixelbrain');
  const micro = bySystem('microprocessor');

  return `# PixelBrain Effect & AMP Catalog

> **Generated file — do not edit by hand.**
> Produced by \`node scripts/pixelbrain-effect-catalog.mjs\`; \`--check\` fails CI
> when this file no longer matches the source tree. Regenerate after adding,
> renaming, or resuming use of any amp module.

The answer to "what effects exist to make an asset look good?" — previously the
only candidate (\`amp-registry.js\`) declared 2 of these modules and told readers
not to trust it. Everything in the tables below is measured from the tree:
summaries come from each module's own header comment, and **Status** is the
real import graph, not a claim.

## Reading Status

| Status | Means |
|---|---|
| \`WIRED\` | Imported by at least one non-test, non-script module — reachable from a real code path. |
| \`GEN\` | Reached only from a \`scripts/\` asset generator. Live in output, not in the library path. |
| \`TEST-ONLY\` | Imported only by tests. **Probably dead or aspirational** — confirm before depending on it. |
| \`ORPHAN\` | Nothing in the scanned tree imports it. |

\`Registered\` shows an id in \`amp-registry.js\`, and is deliberately **not** the
column to judge liveness by: registration is not what makes an effect run — the
production path imports its passes directly, and only ${s.registryIds} id(s) are
registered repo-wide (${s.registryList}). That gap is exactly why the registry
alone could never serve as this catalog; \`Status\` here is measured from the
real import graph instead.

**${s.total} modules** — ${s.wired} WIRED, ${s.gen} GEN, ${s.testOnly} TEST-ONLY,
${s.orphan} ORPHAN. ${s.documented}/${s.total} have a header summary.

## PixelBrain passes (\`codex/core/pixelbrain/*-amp.js\`)

| Module | What it does | Status | Registered |
|---|---|---|---|
${rows(pb)}

## Microprocessor family (\`amps/**\`, \`codex/core/microprocessors\`)

A **separate system** from the passes above: microprocessors are wired through
their own registries (e.g. \`TileForgeMicroprocessor\`) and are deliberately not
in \`amp-registry.js\`.

| Module | What it does | Status | Registered |
|---|---|---|---|
${rows(micro)}

## Asset generators (\`scripts/generate-*.mjs\`)

**${s.generators} generators, ${s.generatorsWired} reachable via an \`npm run\` entry.**
The rest are invoked directly: \`node scripts/generate-<name>.mjs\`. Listed here so
the set is enumerable without a directory listing, and so each one's output root
is visible before you run it.

| Generator | Writes to | Door | npm |
|---|---|---|---|
${genRows}

\`Door\` is measured from each script's own imports, not its filename. It is
**three-way because the tree really holds three populations**: ${s.generatorsFoundry}
scripts drive the ITEM-SPEC-v1 foundry (B), ${s.generatorsScdl} drive the SCDL
compiler (A), and ${s.generatorsDirect} import effect passes and the rasterizer
directly and compose them by hand. "writes to —" means the script resolves its
output path from a variable rather than a literal: open it to see.

Note the SCDL count. \`scripts/\` contains **no** SCDL-driven generator at all —
Door A is reached only through the CLI or an editor. So "there are two front
doors" is true of the *compiler* but false of the *tooling*: one door has a
walkway and 39 hand-laid paths beside it, and this is the first place that
difference is written down.

## If you are looking for something specific

- **Authoring an asset from text** → SCDL: \`codex/core/pixelbrain/scdl/\`, guide at
  \`docs/scholomance-encyclopedia/Scholomance White Papers/SCDL_AUTHORING_GUIDE.md\`.
  \`npm run scdl -- compile <file.scdl>\`.
- **Authoring an asset from a JS spec** → \`item-foundry.js\` / \`ITEM-SPEC-v1\`; the
  passes above are what the foundry composes.
- **Which output folder** → see \`codex/core/pixelbrain/OUTPUTS.md\`.
`;
}

export async function runEffectCatalogCli(argv = process.argv.slice(2)) {
  const args = new Set(argv);
  const { amps, generators, summary } = await buildEffectCatalog();

  if (args.has('--json')) {
    console.log(JSON.stringify({ generatedFrom: 'source', summary, amps, generators }, null, 2));
    return 0;
  }

  const md = renderEffectCatalogMarkdown(amps, generators, summary);

  if (args.has('--stdout')) {
    process.stdout.write(md);
    return 0;
  }

  if (args.has('--check')) {
    if (!existsSync(OUT_MD)) {
      console.error(`[catalog] ${relative(ROOT, OUT_MD)} is missing. Run: node scripts/pixelbrain-effect-catalog.mjs`);
      return 1;
    }
    const cur = readFileSync(OUT_MD, 'utf8');
    if (cur !== md) {
      console.error('[catalog] EFFECT_CATALOG.md is STALE vs the source tree.');
      const names = new Set(amps.map((a) => a.path));
      for (const m of cur.matchAll(/\|\s*`(codex\/[^`]+\.js)`\s*\|/g)) {
        if (!names.has(m[1])) console.error(`  - listed but no longer a catalogued amp: ${m[1]}`);
      }
      for (const a of amps) if (!cur.includes(`\`${a.path}\``)) console.error(`  + present in tree, missing from catalog: ${a.path}`);
      console.error('[catalog] Fix: node scripts/pixelbrain-effect-catalog.mjs');
      return 1;
    }
    console.log(`[catalog] EFFECT_CATALOG.md is current (${summary.total} modules).`);
    return 0;
  }

  writeFileSync(OUT_MD, md, 'utf8');
  console.log(`[catalog] wrote ${relative(ROOT, OUT_MD)} — ${summary.total} modules ` +
    `(${summary.wired} WIRED, ${summary.gen} GEN, ${summary.testOnly} TEST-ONLY, ${summary.orphan} ORPHAN; ` +
    `${summary.documented} documented, ${summary.registered} registered)`);
  return 0;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exitCode = await runEffectCatalogCli();
