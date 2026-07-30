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
import { inflateSync } from 'node:zlib';
import { MAX_PNG_SCALE } from '../../../../../codex/core/pixelbrain/scdl/scdl.exporters.js';

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

// ─── preview / magnification ──────────────────────────────────────────────────

/** Read width/height straight out of a PNG IHDR chunk. */
function pngSize(bytes) {
  const b = Buffer.from(bytes);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

/** Decode the exporter's PNG (filter 0, RGBA) back to raw pixels. */
function pngPixels(bytes) {
  const b = Buffer.from(bytes);
  const { width, height } = pngSize(b);
  const idat = [];
  let off = 8;
  while (off < b.length) {
    const len = b.readUInt32BE(off);
    const type = b.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') idat.push(b.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    raw.copy(px, y * stride, y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
  }
  return { width, height, at: (x, y) => [...px.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)] };
}

describe('SCDL CLI — preview magnification', () => {
  it('writes <asset>-preview-8x.png at canvas x 8 by default', () => {
    const src = join(dir, 'blob.scdl');
    writeFileSync(src, SINGLE);
    runCli(['preview', src], cwdDir);
    const out = join(dir, 'blob-preview-8x.png');
    expect(existsSync(out)).toBe(true);
    expect(pngSize(readFileSync(out))).toEqual({ width: 64, height: 64 }); // 8x8 canvas
  });

  it('honours --scale', () => {
    const src = join(dir, 'blob.scdl');
    writeFileSync(src, SINGLE);
    runCli(['preview', src, '--scale', '4'], cwdDir);
    expect(pngSize(readFileSync(join(dir, 'blob-preview-4x.png')))).toEqual({ width: 32, height: 32 });
  });

  it('never writes into the Export Naming Law namespace', () => {
    const src = join(dir, 'blob.scdl');
    writeFileSync(src, SINGLE);
    runCli(['preview', src], cwdDir);
    // A loader globbing for -png.png must not pick up a magnified preview.
    expect(existsSync(join(dir, 'blob-png.png'))).toBe(false);
    expect(existsSync(join(dir, 'blob-json.json'))).toBe(false);
  });

  it('magnifies by exact nearest-neighbour blocks, inventing no colours', () => {
    const src = join(dir, 'blob.scdl');
    writeFileSync(src, SINGLE);
    runCli(['preview', src, '--scale', '4'], cwdDir);
    const img = pngPixels(readFileSync(join(dir, 'blob-preview-4x.png')));
    // source cell (2,2) is #111111; its whole 4x4 block must be that exact colour
    for (let dy = 0; dy < 4; dy += 1) {
      for (let dx = 0; dx < 4; dx += 1) {
        expect(img.at(2 * 4 + dx, 2 * 4 + dy)).toEqual([0x11, 0x11, 0x11, 255]);
      }
    }
    // and an empty cell stays fully transparent — no bleed from the neighbour
    expect(img.at(0, 0)).toEqual([0, 0, 0, 0]);
  });

  it('multi-frame preview writes per-frame files plus a filmstrip spanning every frame', () => {
    const src = join(dir, 'blob.scdl');
    writeFileSync(src, FRAMED);
    runCli(['preview', src, '--scale', '2'], cwdDir);
    for (const f of [0, 1]) {
      expect(existsSync(join(dir, `blob-f${f}-preview-2x.png`))).toBe(true);
    }
    const strip = join(dir, 'blob-preview-2x-strip.png');
    expect(existsSync(strip)).toBe(true);
    // 2 frames x 8px canvas x 2 scale wide, one canvas tall
    expect(pngSize(readFileSync(strip))).toEqual({ width: 32, height: 16 });
  });

  it('places each frame in its own filmstrip column rather than overlaying them', () => {
    const src = join(dir, 'blob.scdl');
    writeFileSync(src, FRAMED);
    runCli(['preview', src, '--scale', '1'], cwdDir);
    const img = pngPixels(readFileSync(join(dir, 'blob-preview-1x-strip.png')));
    // FRAMED moves the `core` cell from (4,4) in f0 to (4,5) in f1.
    expect(img.at(4, 4)).toEqual([0x22, 0x22, 0x22, 255]);        // f0 column
    expect(img.at(8 + 4, 5)).toEqual([0x22, 0x22, 0x22, 255]);    // f1 column, shifted down
    expect(img.at(8 + 4, 4)).not.toEqual([0x22, 0x22, 0x22, 255]);
  });

  it('leaves canonical `--export png` at 1x so the raster still matches the canvas', () => {
    const src = join(dir, 'blob.scdl');
    writeFileSync(src, SINGLE);
    runCli(['compile', src, '--export', 'png'], cwdDir);
    expect(pngSize(readFileSync(join(dir, 'blob-png.png')))).toEqual({ width: 8, height: 8 });
  });

  it('allows an explicit --scale on compile for callers that want it', () => {
    const src = join(dir, 'blob.scdl');
    writeFileSync(src, SINGLE);
    runCli(['compile', src, '--export', 'png', '--scale', '3'], cwdDir);
    expect(pngSize(readFileSync(join(dir, 'blob-png.png')))).toEqual({ width: 24, height: 24 });
  });

  it('clamps an absurd scale instead of emitting a gigabyte or refusing', () => {
    const src = join(dir, 'blob.scdl');
    writeFileSync(src, SINGLE);
    runCli(['preview', src, '--scale', '9999'], cwdDir);
    const out = join(dir, `blob-preview-${MAX_PNG_SCALE}x.png`);
    expect(existsSync(out)).toBe(true);
    expect(pngSize(readFileSync(out)).width).toBe(8 * MAX_PNG_SCALE);
  });

  it('rejects a non-integer scale rather than silently flooring it', () => {
    const src = join(dir, 'blob.scdl');
    writeFileSync(src, SINGLE);
    expect(() => runCli(['preview', src, '--scale', 'huge'], cwdDir)).toThrow();
  });
});

describe('SCDL CLI — --strict', () => {
  const UNKNOWN_MATERIAL = `
asset badmat canvas 8x8
palette { a = #112233 }
part body material totally_not_a_material { rect 2 2 4 4 a }
export json
`.trim();

  it('check exits 0 on an unknown material by default', () => {
    const src = join(dir, 'badmat.scdl');
    writeFileSync(src, UNKNOWN_MATERIAL);
    expect(() => runCli(['check', src], cwdDir)).not.toThrow();
  });

  it('check exits non-zero on an unknown material under --strict', () => {
    const src = join(dir, 'badmat.scdl');
    writeFileSync(src, UNKNOWN_MATERIAL);
    // SCDL-005 falls back to 'source' with no ramp or transmutation; --strict is
    // the only way to make the documented "treat this as failure" step enforceable.
    expect(() => runCli(['check', src, '--strict'], cwdDir)).toThrow();
  });

  it('compile refuses to emit under --strict rather than writing a degraded asset', () => {
    const src = join(dir, 'badmat.scdl');
    writeFileSync(src, UNKNOWN_MATERIAL);
    expect(() => runCli(['compile', src, '--export', 'json', '--strict'], cwdDir)).toThrow();
    expect(existsSync(join(dir, 'badmat-json.json'))).toBe(false);
  });

  it('compile still emits without --strict', () => {
    const src = join(dir, 'badmat.scdl');
    writeFileSync(src, UNKNOWN_MATERIAL);
    runCli(['compile', src, '--export', 'json'], cwdDir);
    expect(existsSync(join(dir, 'badmat-json.json'))).toBe(true);
  });
});

describe('SCDL CLI — flag parsing', () => {
  it('does not let a valueless flag swallow the flag after it', () => {
    // `--strict --out-dir <dir>` used to set strict='--out-dir', leave --out-dir
    // unset, and push the path into positionals: both flags silently did nothing.
    const src = join(dir, 'blob.scdl');
    const out = join(dir, 'out');
    mkdirSync(out);
    writeFileSync(src, SINGLE);
    runCli(['preview', src, '--strict', '--out-dir', out], cwdDir);
    expect(existsSync(join(out, 'blob-preview-8x.png'))).toBe(true);
    expect(existsSync(join(dir, 'blob-preview-8x.png'))).toBe(false);
  });

  it('applies --strict when it is followed by another flag', () => {
    const src = join(dir, 'badmat.scdl');
    writeFileSync(src, `
asset badmat canvas 8x8
palette { a = #112233 }
part body material totally_not_a_material { rect 2 2 4 4 a }
export json
`.trim());
    expect(() => runCli(['check', src, '--strict', '--out-dir', dir], cwdDir)).toThrow();
  });

  it('still reads a flag that does take a value', () => {
    const src = join(dir, 'blob.scdl');
    writeFileSync(src, SINGLE);
    runCli(['preview', src, '--scale', '2'], cwdDir);
    expect(existsSync(join(dir, 'blob-preview-2x.png'))).toBe(true);
  });
});
