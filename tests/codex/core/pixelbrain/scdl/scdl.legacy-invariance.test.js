/**
 * SCDL Legacy Invariance — packet IDs of every shipped fixture are frozen.
 * If this file goes red, a change broke the Determinism Law for flat assets.
 *
 * Every id below was re-frozen when packet identity began seeding on a digest of
 * the coordinates a packet paints rather than on `coordinates.length`. Two things
 * are worth knowing about the values that came before:
 *
 *  - they could not detect a recolour. Re-shading every `sphere` in the repository
 *    left all eight ids byte-identical, so this suite passed green through a
 *    change to most of its own pixels. An id that only counts cells cannot
 *    enforce the law this file exists to enforce.
 *  - they collided across frames. Any two frames with equal cell counts shared one
 *    id, which is how a swing-left/swing-right pair silently became one frame.
 *
 * A future red here means the pixels moved. Check the render before re-freezing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../codex/core/pixelbrain/scdl/fixtures'
);

const FROZEN_IDS = {
  'slime-sphere.scdl':                 ['pbasset_5d56c682'],
  'crimson-ooze-sphere.scdl':          ['pbasset_0c5e19ca'],
  'void_chestplate.scdl':              ['pbasset_fed726ed'],
  'env_test/env_test.scdl':            ['pbasset_9aa3be41'],
  'void_acolyte/void_acolyte.scdl':    [
    'pbasset_ad082740', 'pbasset_aad88bb4', 'pbasset_2483e2ca', 'pbasset_f5f7dcf7',
  ],
};

describe('legacy invariance — frozen packet IDs', () => {
  for (const [file, ids] of Object.entries(FROZEN_IDS)) {
    it(`${file} compiles to ${ids.join(', ')}`, () => {
      const source = readFileSync(join(FIXTURES, file), 'utf8');
      const result = compileSCDL(source);
      expect(result.ok).toBe(true);
      expect(result.framePackets.map(p => p.id)).toEqual(ids);
    });
  }

  it('gives every frame of a multi-frame fixture its own id', () => {
    const source = readFileSync(join(FIXTURES, 'void_acolyte/void_acolyte.scdl'), 'utf8');
    const ids = compileSCDL(source).framePackets.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('packet identity is sensitive to the pixels, not just their number', () => {
  // Two frames that differ only by mirroring: identical cell counts, different
  // pixels. Under a count-seeded id these shared one identity and the loop played
  // the same frame twice.
  const MIRRORED = `
asset mirror_probe canvas 16x16
palette { a = #112233 }
part dot material bronze { circle 4 8 radius 2 a }
loop swing duration 100
frame 1 "right" { part dot material bronze { circle 11 8 radius 2 a } }
export json
`.trim();

  it('separates equal-count frames whose cells sit in different places', () => {
    const result = compileSCDL(MIRRORED);
    expect(result.ok).toBe(true);
    const [f0, f1] = result.framePackets;
    expect(f0.geometry.coordinates.length).toBe(f1.geometry.coordinates.length);
    expect(f0.id).not.toBe(f1.id);
  });

  it('moves the id when only a colour changes', () => {
    const before = compileSCDL(MIRRORED).packet.id;
    const after = compileSCDL(MIRRORED.replace('#112233', '#998877')).packet.id;
    expect(after).not.toBe(before);
  });

  it('keeps the id stable when nothing about the painted cells changes', () => {
    expect(compileSCDL(MIRRORED).packet.id).toBe(compileSCDL(MIRRORED).packet.id);
    // a comment is not a pixel
    expect(compileSCDL(`# a comment\n${MIRRORED}`).packet.id).toBe(compileSCDL(MIRRORED).packet.id);
  });
});
