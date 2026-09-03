/**
 * SCDL white paper §8 <-> CLI contract (audit 2026-09-03, MINOR #7).
 *
 * The audit's finding was not merely "§8 is stale" — §8 had already been
 * partially updated once and was still missing `preview`, `--shade`, `--strict`
 * and `--out`. Rewriting it again would rot the same way, so instead the
 * document is checked against the program it documents:
 *
 *   - every `--flag` and command named in §8 must exist in the CLI's own help
 *   - every command must actually dispatch (not fall through to usage)
 *   - the numeric claims (§8.2 scale defaults/ceiling) must match the real
 *     constants, not remembered ones
 */
import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { MAX_PNG_SCALE } from '../../../../../codex/core/pixelbrain/scdl/scdl.exporters.js';

const ROOT = resolve(process.cwd());
const CLI = join(ROOT, 'codex/core/pixelbrain/scdl/scdl.cli.js');
const PAPER = join(ROOT, 'docs/scholomance-encyclopedia/Scholomance White Papers/SCDL_COMPILER_WHITE_PAPER.md');

const section = (() => {
  const md = readFileSync(PAPER, 'utf8');
  const start = md.indexOf('## 8. CLI Command Manual');
  const end = md.indexOf('## 9.', start);
  expect(start, 'white paper lost its §8 heading').toBeGreaterThan(-1);
  return md.slice(start, end === -1 ? undefined : end);
})();

const help = execFileSync('node', [CLI], { cwd: ROOT, encoding: 'utf8' });

describe('SCDL white paper §8 matches the CLI', () => {
  const documentedFlags = [...new Set(
    [...section.matchAll(/`(--[a-z][\w-]*)/g)].map((m) => m[1]),
  )];

  it('documents at least the flags the CLI advertises', () => {
    const helpFlags = [...new Set([...help.matchAll(/(--[a-z][\w-]*)/g)].map((m) => m[1]))];
    // Every flag the CLI itself advertises must appear in the manual.
    const undocumented = helpFlags.filter((f) => !documentedFlags.includes(f));
    expect(undocumented, `§8 is missing: ${undocumented.join(', ')}`).toEqual([]);
  });

  it('documents no flag the CLI does not accept', () => {
    const src = readFileSync(CLI, 'utf8');
    for (const flag of documentedFlags) {
      const key = flag.slice(2);
      // The CLI reads options as `opts.flags.<key>` (property access, so no
      // quoted literal for a naive grep to find), declares some in
      // BOOLEAN_FLAGS, and advertises all supported ones in its own help.
      const accepted = src.includes(`flags.${key}`)
        || src.includes(`flags['${key}']`)
        || new RegExp(`\\b${key}\\b\\s*,`, 's').test(src)
        || help.includes(flag);
      expect(accepted, `§8 documents ${flag}, which the CLI never reads`).toBe(true);
    }
  });

  it('names preview, which the audit found entirely absent', () => {
    expect(section).toMatch(/### 8\.2 Preview/);
    expect(section).toMatch(/preview[\s\S]*--scale/);
  });

  it('every command in the §8 table dispatches for real', () => {
    const cmds = [...section.matchAll(/^\|\s*`(compile|preview|check|parse)`\s*\|/gm)].map((m) => m[1]);
    expect(cmds.sort()).toEqual(['check', 'compile', 'parse', 'preview']);
    const fixture = join(ROOT, 'codex/core/pixelbrain/scdl/fixtures/crimson_ooze.scdl');
    // compile/preview WRITE. Redirect them to a temp dir or this "doc test"
    // quietly drops artifacts into the checked-in fixtures folder on every run.
    const outDir = mkdtempSync(join(tmpdir(), 'scdl-doc-contract-'));
    // Each command's own banner: proof it reached its handler rather than
    // falling through to the usage banner, which is what a stale doc looks
    // like from the reader's side.
    const markers = { compile: '[SCDL] Compiling', preview: '[SCDL] Preview', check: '[SCDL] Check', parse: '"parts"' };
    try {
      for (const c of cmds) {
        const extra = (c === 'compile' || c === 'preview') ? ['--out-dir', join(outDir, c)] : [];
        const r = spawnSync('node', [CLI, c, fixture, ...extra], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
        const combined = `${r.stdout ?? ''}${r.stderr ?? ''}`;
        expect(combined, `${c} fell through to the usage banner`).not.toMatch(/Usage:\n/);
        expect(combined, `${c} printed no ${markers[c]} banner`).toContain(markers[c]);
      }
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 120_000);

  it('§8.2 scale claims match the exporter constants, not remembered numbers', () => {
    const cliSrc = readFileSync(CLI, 'utf8');
    const defaultScale = Number(/DEFAULT_PREVIEW_SCALE\s*=\s*(\d+)/.exec(cliSrc)[1]);
    const ceiling = Number(/MAX_PNG_SCALE\s*=\s*(\d+)/.exec(
      readFileSync(join(ROOT, 'codex/core/pixelbrain/scdl/scdl.exporters.js'), 'utf8'))[1]);
    expect(ceiling).toBe(MAX_PNG_SCALE);
    expect(section).toContain(`Default scale is ${defaultScale}`);
    expect(section).toContain(`up to ${ceiling}`);
  });

  it('documents the --out-dir creation behaviour the audit proved broken', () => {
    expect(section).toMatch(/created if it does not exist/);
  });
});
