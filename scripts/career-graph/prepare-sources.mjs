// Source preparation for the Career Graph pipeline (between fetch and ingest).
//
// After `career:sources:fetch` (or `--record`) downloads the raw archives into
// data/career-graph/raw/<version>/, this script:
//
//   1. Extracts any .zip archives in place (idempotent — skips if already done).
//   2. Maps the extracted file names to the names RAW_LAYOUT expects, using a
//      configurable mapping table. Real O*NET / ESCO releases use release-
//      specific file names (e.g. "Occupation Data.txt", "occupations_en.csv")
//      that differ from the normalized names the ingest script reads.
//   3. Reports exactly what it found, mapped, and what still needs manual
//      confirmation. It NEVER fabricates data or silently guesses.
//
// Usage:
//   node scripts/career-graph/prepare-sources.mjs [rawRoot] [configPath]
//   npm run career:sources:prepare
//
// The mapping table (FILE_MAP below) encodes documented assumptions about the
// O*NET 30.3 text release and ESCO 1.2.1 CSV bundle layouts. After the first
// real download, confirm the extracted file names against this table and adjust
// if the pinned release differs.

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rename, copyFile, stat } from 'node:fs/promises';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

// ────────────────────────────────────────────────────────────────────────────
// FILE MAP — documented assumptions, confirm against the pinned releases.
//
// Each entry: { version, archive, expected: [{ from, to (RAW_LAYOUT name) }] }
//
// `from` is a pattern or an ordered list of patterns, matched case-insensitively
// against extracted file names:
//
//   - A pattern ending in a file extension (e.g. 'Essential Skills.txt') is an
//     EXACT basename match.
//   - Any other pattern (e.g. 'occupation data') is a substring match.
//
// Patterns are tried in order; the first pattern with a match wins. A substring
// pattern that matches MORE THAN ONE file is reported as AMBIGUOUS and fails the
// run — it never silently picks whichever file the directory listed first. If no
// pattern matches, the target is reported as MISSING. In both cases the operator
// pins the exact name here.
//
// O*NET 30.x split the historic `Skills.txt` into two files that together form
// the 35-element skill taxonomy: `Essential Skills.txt` (10 basic skills, 2.A.*)
// and `Transferable Skills.txt` (25 cross-functional skills, 2.B.*). Both are
// ingested. Beware the near-miss neighbours in the same archive —
// `Essential Skills to Work Activities.txt` and `Essential Skills to Work
// Context.txt` are skill→activity/context crosswalks with no O*NET-SOC column,
// which is why these two targets are pinned by exact name.
// ────────────────────────────────────────────────────────────────────────────

export const FILE_MAP = Object.freeze([
  Object.freeze({
    id: 'onet',
    version: '30.3',
    archive: 'db_30_3_text.zip',
    expected: Object.freeze([
      Object.freeze({ from: Object.freeze(['Occupation Data.txt', 'occupation data']), to: 'occupations.tsv' }),
      Object.freeze({ from: Object.freeze(['Essential Skills.txt']), to: 'essential_skills.tsv' }),
      Object.freeze({ from: Object.freeze(['Transferable Skills.txt']), to: 'transferable_skills.tsv' }),
      // Concrete tools per occupation. O*NET 30.3 names this "Software
      // Skills.txt"; earlier releases called it "Technology Skills.txt".
      Object.freeze({
        from: Object.freeze(['Software Skills.txt', 'Technology Skills.txt']),
        to: 'technology_skills.tsv',
      }),
    ]),
  }),
  Object.freeze({
    id: 'esco',
    version: '1.2.1',
    archive: 'esco-1.2.1-csv.zip',
    expected: Object.freeze([
      Object.freeze({ from: Object.freeze(['occupations_en.csv', 'occupations.csv']), to: 'occupations.csv' }),
      // Pinned by exact name: a bare 'skills' substring also matches
      // occupation_skills*.csv, which is a different table entirely.
      Object.freeze({ from: Object.freeze(['skills_en.csv', 'skills.csv']), to: 'skills.csv' }),
      Object.freeze({
        from: Object.freeze([
          'occupationSkillRelations_en.csv',
          'occupation_skills_en.csv',
          'occupation_skills.csv',
        ]),
        to: 'occupation_skills.csv',
      }),
    ]),
  }),
  // The crosswalk is a plain .csv — no extraction needed.
]);

/** Check whether the `unzip` binary is available. */
export function hasUnzip() {
  try {
    execSync('unzip -v', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract a .zip archive into its containing directory.
 * Returns the list of extracted file names (basenames).
 * Idempotent: if the archive is already extracted (a sentinel marker exists),
 * it skips extraction and just lists the directory.
 */
export async function extractZip(zipPath, log = () => {}) {
  const dir = dirname(zipPath);
  const marker = join(dir, '.extracted');

  if (existsSync(marker)) {
    log(`PREPARE_SKIP_EXTRACT:${basename(zipPath)} (already extracted)`);
    return listFiles(dir);
  }

  if (!hasUnzip()) {
    throw new Error(
      `PREPARE_NO_UNZIP: the 'unzip' binary is required to extract ${basename(zipPath)}. ` +
      `Install it (e.g. 'sudo apt install unzip' or 'brew install unzip') and re-run.`
    );
  }

  log(`PREPARE_EXTRACT:${basename(zipPath)} → ${dir}`);
  execSync(`unzip -o -q ${JSON.stringify(zipPath)} -d ${JSON.stringify(dir)}`, {
    stdio: 'pipe',
    timeout: 120_000,
  });

  // Write a sentinel so re-runs skip extraction.
  const { writeFile } = await import('node:fs/promises');
  await writeFile(marker, `extracted ${new Date().toISOString()}\n`);

  return listFiles(dir);
}

/** List regular files in a directory (non-recursive, basenames only). */
async function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => e.name);
}

/**
 * Match an extracted file name against a single `from` pattern
 * (case-insensitive).
 *
 * A pattern carrying a file extension is an EXACT basename match; anything else
 * is a substring match. The exact form exists so a target can be pinned to one
 * release file even when the archive contains longer names that share its
 * prefix (e.g. "Essential Skills.txt" vs "Essential Skills to Work
 * Activities.txt").
 */
export function matchesPattern(fileName, pattern) {
  const lower = String(fileName).toLowerCase();
  const p = String(pattern).toLowerCase();
  if (/\.[a-z0-9]+$/.test(p)) return lower === p;
  return lower.includes(p);
}

/**
 * Resolve one `from` pattern (or ordered list of patterns) against the
 * extracted file names.
 *
 * Patterns are tried in order and the first one that matches wins. A pattern
 * matching several files is ambiguous: the caller must fail rather than guess,
 * because "whichever file the directory happened to list first" is not a
 * reproducible build input.
 *
 * @returns {{ match: string|null, ambiguous: string[]|null }}
 */
export function resolvePattern(files, from, exclude = '') {
  const patterns = Array.isArray(from) ? from : [from];
  for (const pattern of patterns) {
    const hits = files.filter((f) => f !== exclude && matchesPattern(f, pattern));
    if (hits.length === 1) return { match: hits[0], ambiguous: null };
    if (hits.length > 1) return { match: null, ambiguous: hits.slice().sort() };
  }
  return { match: null, ambiguous: null };
}

/**
 * Map extracted files to RAW_LAYOUT-expected names for one source.
 *
 * @param {string} dir - The raw version directory.
 * @param {string[]} files - Extracted file basenames.
 * @param {{ expected: { from: string|string[], to: string }[] }} sourceMap - FILE_MAP entry.
 * @param {(line: string) => void} log
 * @returns {{ mapped: { from: string, to: string }[], missing: string[], ambiguous: { to: string, candidates: string[] }[], alreadyPresent: string[] }}
 */
export async function mapFiles(dir, files, sourceMap, log = () => {}) {
  const mapped = [];
  const missing = [];
  const ambiguous = [];
  const alreadyPresent = [];

  for (const { from, to } of sourceMap.expected) {
    const targetPath = join(dir, to);
    const shown = Array.isArray(from) ? from.join('", "') : from;

    // If the target already exists (e.g. from a previous run or manual placement), skip.
    if (existsSync(targetPath)) {
      alreadyPresent.push(to);
      log(`PREPARE_PRESENT:${sourceMap.id}:${to}`);
      continue;
    }

    const { match, ambiguous: candidates } = resolvePattern(files, from, to);
    if (candidates) {
      ambiguous.push({ to, candidates });
      log(
        `PREPARE_AMBIGUOUS:${sourceMap.id}:${to} — "${shown}" matched ${candidates.length} files ` +
        `(${candidates.join(', ')}). Pin the exact file name in FILE_MAP.`
      );
      continue;
    }
    if (match) {
      const srcPath = join(dir, match);
      await copyFile(srcPath, targetPath);
      mapped.push({ from: match, to });
      log(`PREPARE_MAP:${sourceMap.id}:${match} → ${to}`);
    } else {
      missing.push(to);
      log(`PREPARE_MISSING:${sourceMap.id}:${to} (no file matching "${shown}" found)`);
    }
  }

  return { mapped, missing, ambiguous, alreadyPresent };
}

/**
 * Prepare all raw sources: extract archives and map file names.
 *
 * @param {{
 *   rawRoot?: string,
 *   configPath?: string,
 *   log?: (line: string) => void,
 * }} [options]
 * @returns {Promise<{ ok: boolean, sources: object[] }>}
 */
export async function prepareSources(options = {}) {
  const rawRoot = resolve(options.rawRoot || join(ROOT, 'data', 'career-graph', 'raw'));
  const log = options.log ?? (() => {});
  const results = [];
  let ok = true;

  for (const sourceMap of FILE_MAP) {
    const dir = join(rawRoot, sourceMap.version);
    const archivePath = join(dir, sourceMap.archive);

    if (!existsSync(dir)) {
      ok = false;
      results.push({ id: sourceMap.id, ok: false, reason: 'DIR_MISSING', dir });
      log(`PREPARE_DIR_MISSING:${sourceMap.id}:${dir} — run 'npm run career:sources:fetch' first`);
      continue;
    }

    let files;
    if (existsSync(archivePath)) {
      files = await extractZip(archivePath, log);
    } else {
      // No archive — maybe files were placed manually.
      files = await listFiles(dir);
      log(`PREPARE_NO_ARCHIVE:${sourceMap.id} — using ${files.length} files already in ${dir}`);
    }

    const mapping = await mapFiles(dir, files, sourceMap, log);
    const sourceOk = mapping.missing.length === 0 && mapping.ambiguous.length === 0;

    if (!sourceOk) {
      ok = false;
      const problems = [
        ...mapping.missing.map((t) => `${t} (missing)`),
        ...mapping.ambiguous.map((a) => `${a.to} (ambiguous)`),
      ];
      log(
        `PREPARE_INCOMPLETE:${sourceMap.id} — unresolved: ${problems.join(', ')}. ` +
        `Check the extracted files in ${dir} and update FILE_MAP in prepare-sources.mjs.`
      );
    }

    results.push({
      id: sourceMap.id,
      ok: sourceOk,
      dir,
      extractedFiles: files,
      mapped: mapping.mapped,
      missing: mapping.missing,
      ambiguous: mapping.ambiguous,
      alreadyPresent: mapping.alreadyPresent,
    });
  }

  // Crosswalk is a plain CSV — just verify it exists.
  const crosswalkDir = join(rawRoot, '2022-1');
  const crosswalkFile = join(crosswalkDir, 'crosswalk.csv');
  if (existsSync(crosswalkFile)) {
    results.push({ id: 'crosswalk', ok: true, dir: crosswalkDir, alreadyPresent: ['crosswalk.csv'] });
    log(`PREPARE_PRESENT:crosswalk:crosswalk.csv`);
  } else {
    // The fetch script names it onet-esco-crosswalk.csv — map it.
    const fetchedName = join(crosswalkDir, 'onet-esco-crosswalk.csv');
    if (existsSync(fetchedName)) {
      await copyFile(fetchedName, crosswalkFile);
      results.push({ id: 'crosswalk', ok: true, dir: crosswalkDir, mapped: [{ from: 'onet-esco-crosswalk.csv', to: 'crosswalk.csv' }] });
      log(`PREPARE_MAP:crosswalk:onet-esco-crosswalk.csv → crosswalk.csv`);
    } else {
      ok = false;
      results.push({ id: 'crosswalk', ok: false, reason: 'MISSING', dir: crosswalkDir });
      log(`PREPARE_MISSING:crosswalk — expected crosswalk.csv in ${crosswalkDir}`);
    }
  }

  return { ok, sources: results };
}

// ── CLI entry ──────────────────────────────────────────────────────────────
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const [, , rawArg, configArg] = process.argv;
  const result = await prepareSources({
    rawRoot: rawArg || undefined,
    configPath: configArg || undefined,
    log: (line) => console.log(line),
  });

  if (!result.ok) {
    console.error('\nPREPARE_INCOMPLETE — see messages above. Fix the FILE_MAP or place files manually, then re-run.');
    process.exit(1);
  }
  console.log(`\nPREPARE_OK sources=${result.sources.length}`);
}
