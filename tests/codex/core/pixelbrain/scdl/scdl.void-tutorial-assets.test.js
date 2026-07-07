import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { compileSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';
import { exportSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.exporters.js';

const TILE_DIR = 'codex/core/pixelbrain/scdl/fixtures/void_tiles';

function compileFixture(name) {
  const source = readFileSync(join(TILE_DIR, `${name}.scdl`), 'utf8');
  const result = compileSCDL(source);
  expect(result.ok, result.errors.map(e => e.message).join('\n')).toBe(true);
  return result;
}

function coordSet(packet) {
  return new Set((packet.geometry?.coordinates || []).map(c => `${c.x},${c.y}`));
}

function hasAnyInRect(coords, x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (coords.has(`${x},${y}`)) return true;
    }
  }
  return false;
}

function sha256(bytes) {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

describe('VOID tutorial island modular SCDL assets', () => {
  it.each([
    ['void_ice_floor', 128, 64],
    ['void_ice_floor_cracked', 128, 64],
    ['void_snow_floor', 128, 64],
    ['void_rune_path', 128, 64],
    ['void_rune_focus', 128, 64],
    ['void_cliff_edge', 128, 112],
    ['void_crystal_cluster', 128, 128],
    ['void_crystal_fern', 96, 112],
    ['void_glow_mushroom', 96, 96],
  ])('%s compiles with expected canvas', (name, width, height) => {
    const result = compileFixture(name);
    expect(result.packet.canvas).toMatchObject({ width, height });
  });

  it.each([
    'void_ice_floor',
    'void_ice_floor_cracked',
    'void_snow_floor',
    'void_rune_path',
    'void_rune_focus',
  ])('%s keeps transparent rectangular corners outside the iso diamond', (name) => {
    const result = compileFixture(name);
    const coords = coordSet(result.packet);
    expect(hasAnyInRect(coords, 0, 0, 18, 10)).toBe(false);
    expect(hasAnyInRect(coords, 110, 0, 127, 10)).toBe(false);
    expect(hasAnyInRect(coords, 0, 54, 18, 63)).toBe(false);
    expect(hasAnyInRect(coords, 110, 54, 127, 63)).toBe(false);
  });

  it.each([
    ['void_crystal_cluster', 128, 128],
    ['void_crystal_fern', 96, 112],
    ['void_glow_mushroom', 96, 96],
  ])('%s keeps transparent corners and bottom-center anchoring', (name, width, height) => {
    const result = compileFixture(name);
    const coords = coordSet(result.packet);
    expect(hasAnyInRect(coords, 0, 0, 10, 10)).toBe(false);
    expect(hasAnyInRect(coords, width - 11, 0, width - 1, 10)).toBe(false);
    expect(hasAnyInRect(coords, 0, height - 11, 10, height - 1)).toBe(false);
    expect(hasAnyInRect(coords, width - 11, height - 11, width - 1, height - 1)).toBe(false);
    expect(hasAnyInRect(coords, Math.floor(width / 2) - 18, height - 14, Math.floor(width / 2) + 18, height - 1)).toBe(true);
  });

  it('snow tile uses the registered snow material without fallback', () => {
    const result = compileFixture('void_snow_floor');
    const materials = new Set(result.packet.geometry.coordinates.map(c => c.material));
    expect(materials.has('snow')).toBe(true);
    expect(result.errors.some(e => /Unknown material 'snow'/.test(e.message))).toBe(false);
  });

  it('material-shaded export is deterministic and differs from flat geometry', () => {
    const result = compileFixture('void_rune_focus');
    const flat = exportSCDL(result.packet, ['png'], result.ast, { shade: 'geometry' }).png.output;
    const shaded = exportSCDL(result.packet, ['png'], result.ast, { shade: 'material' }).png.output;
    const noAa = exportSCDL(result.packet, ['png'], result.ast, {
      shade: 'material',
      antialias: false,
      bloom: false,
    }).png.output;

    expect(sha256(shaded)).toBe(sha256(exportSCDL(result.packet, ['png'], result.ast, { shade: 'material' }).png.output));
    expect(sha256(shaded)).toBe('4b5e66cb642866287457c2946af64cbf69fa95e9c99a5bd3253a089ac9128bbe');
    expect(sha256(shaded)).not.toBe(sha256(flat));
    expect(sha256(shaded)).not.toBe(sha256(noAa));
  });
});
