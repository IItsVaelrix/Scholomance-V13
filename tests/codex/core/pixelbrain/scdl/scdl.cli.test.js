/**
 * SCDL CLI Tests — SCDL v1.1 `--out-dir` + Export Naming Law
 *
 * PDR test plan items 11–13:
 *  - --out-dir honored; default is the source file's directory (never CWD)
 *  - single-target export named <asset>-<target>.<ext>, never <asset>.<ext>
 *  - single-frame multi-target gets no -f0- infix
 *  - multi-frame assets emit <asset>-f<N>-<target>.<ext> + <asset>-frameloop.json
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve(process.cwd(), 'codex/core/pixelbrain/scdl/scdl.cli.js');

const SINGLE = `
asset blob canvas 8x8

palette {
  a = #111111
}

part body material voidsteel {
  rect 2 2 4 4 a
}

export json
`.trim();

const FRAMED = `
asset blob canvas 8x8

palette {
  a = #111111
  b = #222222
}

part body material voidsteel {
  rect 2 2 4 4 a
}

part core material cyan_glow {
  cell 4 4 b
}

loop idle duration 200

frame 1 "shift" {
  part core material cyan_glow {
    cell 4 5 b
  }
}

export json
`.trim();

function runCli(args, cwd) {
  return execFileSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
}

let dir;
let cwdDir; // a separate, empty cwd to prove outputs never land in the CWD

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'scdl-cli-'));
  cwdDir = mkdtempSync(join(tmpdir(), 'scdl-cli-cwd-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(cwdDir, { recursive: true, force: true });
});

describe('SCDL CLI — Export Naming Law + --out-dir', () => {
  it('single target writes <asset>-<target>.<ext> next to the source, never <asset>.<ext>', () => {
    const src = join(dir, 'blob.scdl');
    writeFileSync(src, SINGLE);
    // run from a DIFFERENT cwd to prove outputs follow the source, not the CWD
    runCli(['compile', src, '--export', 'png'], cwdDir);
    expect(existsSync(join(dir, 'blob-png.png'))).toBe(true);
    expect(existsSync(join(dir, 'blob.png'))).toBe(false);
    expect(existsSync(join(cwdDir, 'blob-png.png'))).toBe(false);
    expect(existsSync(join(cwdDir, 'blob.png'))).toBe(false);
  });

  it('single-frame multi-target gets suffixed names with no -f0- infix', () => {
    const src = join(dir, 'blob.scdl');
    writeFileSync(src, SINGLE);
    runCli(['compile', src, '--export', 'json,png'], cwdDir);
    expect(existsSync(join(dir, 'blob-json.json'))).toBe(true);
    expect(existsSync(join(dir, 'blob-png.png'))).toBe(true);
    expect(existsSync(join(dir, 'blob-f0-json.json'))).toBe(false);
    expect(existsSync(join(dir, 'blob-f0-png.png'))).toBe(false);
  });

  it('--out-dir redirects all outputs', () => {
    const src = join(dir, 'blob.scdl');
    const out = join(dir, 'out');
    mkdirSync(out);
    writeFileSync(src, SINGLE);
    runCli(['compile', src, '--export', 'json,png', '--out-dir', out], cwdDir);
    expect(existsSync(join(out, 'blob-json.json'))).toBe(true);
    expect(existsSync(join(out, 'blob-png.png'))).toBe(true);
    expect(existsSync(join(dir, 'blob-json.json'))).toBe(false);
  });

  it('multi-frame assets write per-frame files plus the frameloop manifest', () => {
    const src = join(dir, 'blob.scdl');
    writeFileSync(src, FRAMED);
    runCli(['compile', src, '--export', 'json,png'], cwdDir);
    for (const f of [0, 1]) {
      expect(existsSync(join(dir, `blob-f${f}-json.json`))).toBe(true);
      expect(existsSync(join(dir, `blob-f${f}-png.png`))).toBe(true);
    }
    const manifest = JSON.parse(readFileSync(join(dir, 'blob-frameloop.json'), 'utf8'));
    expect(manifest.contract).toBe('SCDL-FRAME-LOOP-v1');
    expect(manifest.loop).toBe('idle');
    expect(manifest.frames.length).toBe(2);
  });

  it('multi-frame aseprite target writes one combined file, no frame infix', () => {
    const src = join(dir, 'blob.scdl');
    writeFileSync(src, FRAMED);
    runCli(['compile', src, '--export', 'aseprite'], cwdDir);
    expect(existsSync(join(dir, 'blob-aseprite.aseprite'))).toBe(true);
    expect(existsSync(join(dir, 'blob-f0-aseprite.aseprite'))).toBe(false);
  });
});
