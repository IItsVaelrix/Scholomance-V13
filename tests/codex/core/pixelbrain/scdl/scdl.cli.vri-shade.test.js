import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve(process.cwd(), 'codex/core/pixelbrain/scdl/scdl.cli.js');

// Real vector relief (circle/sphere ops, real normals/signedDistance) AND
// compiles strict-clean (0 warnings) — void_acolyte is the audit's own
// production-quality reference asset, so VRI has real geometry to shade
// without compileAsset()'s strict:true default (Task 1) refusing it first.
// It is also multi-frame (4-frame idle loop), which exercises the -f<N>-
// naming branch on both the default and VRI paths.
const FIXTURE = resolve(process.cwd(), 'codex/core/pixelbrain/scdl/fixtures/void_acolyte/void_acolyte.scdl');

// Real vector relief too, but its material names are unresolvable — used only
// by the strict-refusal test below, separately from FIXTURE.
const REFUSING_FIXTURE = resolve(process.cwd(), 'codex/core/pixelbrain/scdl/fixtures/crimson-ooze-sphere.scdl');

const SCENE_GRAPH_SOURCE = `
asset vri_refusal canvas 16x16
palette { c = #204060 }
def dot { part p material gold { circle 0 0 radius 2 c } }
group g at 4 4 { instance dot at 0 0 }
export png
`;

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

    const defaultBytes = readFileSync(join(dir, 'void_acolyte-f0-png.png'));
    const vriBytes = readFileSync(join(dir, 'vri', 'void_acolyte-f0-png.png'));
    expect(vriBytes.equals(defaultBytes)).toBe(false);
    expect(existsSync(join(dir, 'vri', 'void_acolyte-frameloop.json'))).toBe(true);
  });

  it('compile without --shade vri is deterministic across repeated runs', () => {
    const r1 = runBoth(['compile', FIXTURE, '--export', 'png', '--out-dir', join(dir, 'a')], cwdDir);
    const r2 = runBoth(['compile', FIXTURE, '--export', 'png', '--out-dir', join(dir, 'b')], cwdDir);
    expect(r1.status).toBe(0);
    expect(r2.status).toBe(0);
    expect(readFileSync(join(dir, 'a', 'void_acolyte-f0-png.png')).equals(
      readFileSync(join(dir, 'b', 'void_acolyte-f0-png.png')),
    )).toBe(true);
  });

  it('preview --shade vri writes a preview PNG per frame', () => {
    runCli(['preview', FIXTURE, '--shade', 'vri', '--out-dir', dir], cwdDir);
    for (let i = 0; i < 4; i += 1) {
      expect(existsSync(join(dir, `void_acolyte-f${i}-preview-8x.png`))).toBe(true);
    }
    expect(existsSync(join(dir, 'void_acolyte-preview-8x-strip.png'))).toBe(true);
  });

  it('a strict SCDL refusal preserves labels, locations, and opt-in bytecode', () => {
    const r = runBoth([
      'compile', REFUSING_FIXTURE, '--export', 'png', '--shade', 'vri',
      '--out-dir', dir, '--bytecode',
    ], cwdDir);
    expect(r.status).not.toBe(0);
    expect(r.all).toContain('[SCDL-005]');
    expect(r.all).toMatch(/line \d+:\d+/);
    expect(r.all).toContain('PB-ERR-v1');
    expect(existsSync(join(dir, 'crimson-ooze-sphere-png.png'))).toBe(false);
  });

  it('a throwing VRI compile reports its frame and underlying error without a stack trace', () => {
    const fixture = join(dir, 'vri-refusal.scdl');
    writeFileSync(fixture, SCENE_GRAPH_SOURCE);

    const r = runBoth(['compile', fixture, '--export', 'png', '--shade', 'vri', '--out-dir', dir], cwdDir);

    expect(r.status).not.toBe(0);
    expect(r.all).toContain('frame 0');
    expect(r.all).toContain('scene-graph packet requires lowered coordinates');
    expect(r.all).not.toContain('at compileVRI');
    expect(existsSync(join(dir, 'vri-refusal-png.png'))).toBe(false);
  });

  it('compile --shade vri is deterministic across repeated runs', () => {
    runCli(['compile', FIXTURE, '--export', 'png', '--shade', 'vri', '--out-dir', join(dir, 'a')], cwdDir);
    runCli(['compile', FIXTURE, '--export', 'png', '--shade', 'vri', '--out-dir', join(dir, 'b')], cwdDir);

    for (let i = 0; i < 4; i += 1) {
      expect(readFileSync(join(dir, 'a', `void_acolyte-f${i}-png.png`)).equals(
        readFileSync(join(dir, 'b', `void_acolyte-f${i}-png.png`)),
      )).toBe(true);
    }
  });

  it('keeps one named output per frame when --out is also supplied', () => {
    runCli([
      'compile', FIXTURE, '--export', 'png', '--shade', 'vri',
      '--out-dir', dir, '--out', join(dir, 'single.png'),
    ], cwdDir);

    expect(existsSync(join(dir, 'single.png'))).toBe(false);
    for (let i = 0; i < 4; i += 1) {
      expect(existsSync(join(dir, `void_acolyte-f${i}-png.png`))).toBe(true);
    }
  });

  it('refuses explicit non-PNG export targets instead of writing PNG bytes under their names', () => {
    const outPath = join(dir, 'result.json');
    const r = runBoth([
      'compile', FIXTURE, '--export', 'json', '--shade', 'vri',
      '--out-dir', dir, '--out', outPath,
    ], cwdDir);

    expect(r.status).not.toBe(0);
    expect(r.all).toContain('--shade vri only supports PNG export');
    expect(existsSync(outPath)).toBe(false);
  });

  it('uses PNG export when --shade vri is passed without an explicit --export', () => {
    runCli(['compile', FIXTURE, '--shade', 'vri', '--out-dir', dir], cwdDir);
    expect(existsSync(join(dir, 'void_acolyte-f0-png.png'))).toBe(true);
    expect(existsSync(join(dir, 'void_acolyte-frameloop.json'))).toBe(true);
  });
});
