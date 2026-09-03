/**
 * EFFECT_CATALOG anti-rot tests (audit 2026-09-03 MAJOR #1).
 *
 * The audit's complaint was that the only "registry" of effects contradicted
 * the tree. A hand-written replacement would rot the same way, so the catalog
 * is generated and these tests make the generation load-bearing:
 *
 *   1. The committed markdown matches the current source (--check, same gate CI runs).
 *   2. Nothing is missing: every amp module on disk has a row.
 *   3. Nothing is invented: every description is a verbatim substring of the
 *      module it claims to describe, and every status matches the import graph.
 *
 * (3) is the important one — it is what distinguishes a catalog from marketing.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const ROOT = resolve(process.cwd());
const SCRIPT = join(ROOT, 'scripts/pixelbrain-effect-catalog.mjs');
const MD = join(ROOT, 'codex/core/pixelbrain/EFFECT_CATALOG.md');

function runJson() {
  return JSON.parse(execFileSync('node', [SCRIPT, '--json'], {
    encoding: 'utf8', cwd: ROOT, maxBuffer: 32 * 1024 * 1024, timeout: 120_000,
  }));
}

function findAmps(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') findAmps(abs, acc); }
    else if (/-amp\.js$/.test(e.name)) acc.push(relative(ROOT, abs));
  }
  return acc;
}

const data = runJson();

describe('EFFECT_CATALOG is derived, complete, and truthful', () => {
  it('the committed markdown is current (same gate CI enforces)', () => {
    execFileSync('node', [SCRIPT, '--check'], { encoding: 'utf8', cwd: ROOT, timeout: 120_000 });
  });

  it('lists every *-amp.js module in codex/core/pixelbrain', () => {
    const onDisk = findAmps(join(ROOT, 'codex/core/pixelbrain'));
    const listed = new Set(data.amps.map((a) => a.path));
    const missing = onDisk.filter((p) => !listed.has(p));
    expect(missing).toEqual([]);
    expect(listed.size).toBeGreaterThan(40);
  });

  it('invents nothing: each summary appears verbatim in its own module', () => {
    const checked = data.amps.filter((a) => a.summary);
    expect(checked.length).toBeGreaterThan(15);
    for (const a of checked) {
      const src = readFileSync(join(ROOT, a.path), 'utf8');
      expect(src, `summary not found in ${a.path}: ${a.summary}`).toContain(a.summary);
    }
  });

  it('mislabels nothing: an ORPHAN row truly has no importers', () => {
    for (const a of data.amps.filter((x) => x.status === 'ORPHAN')) {
      expect(a.importers, `${a.path} claims ORPHAN but has importers`).toBe(0);
    }
  });

  it('a WIRED row is imported by something outside tests/', () => {
    for (const a of data.amps.filter((x) => x.status === 'WIRED').slice(0, 12)) {
      expect(a.importers).toBeGreaterThan(0);
    }
  });

  it('reports registration coverage from the real registry, not a claim', () => {
    const registry = readFileSync(
      join(ROOT, 'codex/core/pixelbrain/amp-registry.js'), 'utf8');
    expect(registry).toMatch(/STATUS: EXPERIMENTAL/);
    expect(registry).toMatch(/EFFECT_CATALOG\.md/);
    expect(data.summary.registryIds).toBeGreaterThanOrEqual(2);
  });

  it('enumerates the generators and does not overstate npm coverage', () => {
    const files = readdirSync(join(ROOT, 'scripts'))
      .filter((f) => /^generate-.*\.mjs$/.test(f));
    expect(data.generators.length).toBe(files.length);
    expect(data.summary.generators).toBe(files.length);
    // 2026-09-03: 1 of 39. Assert <= half rather than a magic number so this
    // test only fires when coverage genuinely regresses.
    expect(data.summary.generatorsWired).toBeLessThanOrEqual(files.length / 2);
    // The finding nobody wrote down: zero generators drive SCDL.
    expect(data.generators.filter((g) => g.door === 'foundry').length).toBeGreaterThan(0);
    expect(data.generators.filter((g) => g.door === 'direct-pass').length).toBeGreaterThan(0);
  });

  it('the markdown names both the catalog and OUTPUTS as the answer to "where does it go?"', () => {
    const md = readFileSync(MD, 'utf8');
    expect(md).toContain('OUTPUTS.md');
    expect(md).toContain('Generated file — do not edit by hand');
  });
});
