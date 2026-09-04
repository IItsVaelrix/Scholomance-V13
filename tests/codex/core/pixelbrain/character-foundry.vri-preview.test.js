/**
 * Character Foundry × VRI — "Door C", an opt-in preview lens.
 *
 * Unlike item-foundry's Door B (real materials, real fill declarations),
 * character-foundry cells carry no `material` and no vector/SDF identity —
 * form-shading is baked into `color` at fill time by `applyCharacterFills`.
 * This suite pins what that honestly means: the bridge is deterministic,
 * additive, and produces a real VRI-engine raster, but material-driven and
 * relief-driven effects have nothing to act on here — see the doc comment on
 * renderCharacterDirectionVri for the measured comparison against the base
 * renderer.
 */

import { describe, it, expect } from 'vitest';
import { forgeCharacter, renderCharacterDirectionVri } from '../../../../codex/core/pixelbrain/character-foundry.js';
import { verifyLineageChain, LINEAGE_CONTRACT } from '../../../../codex/core/pixelbrain/lineage-verify.js';

const SPEC = {
  contract: 'CHARACTER-SPEC-v1',
  id: 'vri-preview-fixture',
  class: 'character',
  archetype: 'human',
  canvas: { width: 32, height: 48, gridSize: 1 },
  seed: 1337,
  bytecode: 'VW-TEST-VRI-PREVIEW',
  presentation: { gender: 'androgynous', heightClass: 'short', buildClass: 'average' },
  directions: ['south', 'east'],
  materials: { skin: 'skin_apricot_signal', hair: 'hair_midnight_teal', eyes: 'eye_psychic_cobalt' },
  body: { profile: 'character.body.chibi.starboundEsper', params: { compact: 0.72 } },
  face: [
    { id: 'leftEye', profile: 'character.face.eye.humanSoft', params: { iris: 'eye_psychic_cobalt' }, attach: { parent: 'body', at: 'face.eyeLeft' } },
    { id: 'rightEye', profile: 'character.face.eye.humanSoft', params: { iris: 'eye_psychic_cobalt' }, attach: { parent: 'body', at: 'face.eyeRight' } },
    { id: 'nose', profile: 'character.face.nose.humanSoft', attach: { parent: 'body', at: 'face.nose' } },
    { id: 'mouth', profile: 'character.face.mouth.humanSoft', attach: { parent: 'body', at: 'face.mouth' } },
  ],
  hair: { profile: 'character.hair.cometSweep', params: { color: 'hair_midnight_teal', streak: 'neon_mint_signal' }, attach: { parent: 'body', at: 'headTop' } },
  clothing: [
    { id: 'bottom', profile: 'character.clothing.bottom.psychicStreetShorts', params: { color: 'cloth_psychic_denim', trim: 'trim_comet_gold' } },
    { id: 'top', profile: 'character.clothing.top.starboundJacket', params: { color: 'cloth_star_jacket', trim: 'trim_comet_gold', signal: 'neon_mint_signal' } },
    { id: 'shoes', profile: 'character.clothing.shoes.cometBoots', params: { color: 'leather_brown', trim: 'trim_comet_gold' } },
  ],
  accessories: [],
  details: [],
};

function forge() {
  return forgeCharacter(SPEC, {});
}

describe('Character Foundry — VRI preview bridge', () => {
  it('produces a PB-CHARACTER-VRI-PREVIEW-v1 result with scene, raster, png, lineage', () => {
    const result = renderCharacterDirectionVri(forge(), 'south', { scale: 2 });
    expect(result.contract).toBe('PB-CHARACTER-VRI-PREVIEW-v1');
    expect(result.raster.width).toBe(64);
    expect(result.raster.height).toBe(96);
    expect(result.png.length).toBeGreaterThan(8);
    expect(Array.from(result.png.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it('carries a PB-ASSET-LINEAGE-v1 chain that verifies', () => {
    const result = renderCharacterDirectionVri(forge(), 'south', { scale: 2 });
    expect(result.lineage.contract).toBe(LINEAGE_CONTRACT);
    expect(verifyLineageChain(result.lineage).ok).toBe(true);
  });

  it('is deterministic across repeated renders', () => {
    const character = forge();
    const a = renderCharacterDirectionVri(character, 'south', { scale: 2 });
    const b = renderCharacterDirectionVri(character, 'south', { scale: 2 });
    expect(a.scene.checksum).toBe(b.scene.checksum);
    expect(a.lineage.raster.digest).toBe(b.lineage.raster.digest);
    expect(Array.from(a.raster.data)).toEqual(Array.from(b.raster.data));
  });

  it('renders each requested direction independently, not a flattened multi-direction bag', () => {
    const character = forge();
    const south = renderCharacterDirectionVri(character, 'south', { scale: 1 });
    const east = renderCharacterDirectionVri(character, 'east', { scale: 1 });
    expect(south.lineage.raster.digest).not.toBe(east.lineage.raster.digest);
    // Every painted (opaque) pixel count is sane for a 32x48 canvas — not a
    // multi-direction overlay garbling into every cell painted.
    const opaquePixels = (raster) => raster.raster.data.reduce((n, v, i) => (i % 4 === 3 && v > 0 ? n + 1 : n), 0);
    expect(opaquePixels(south)).toBeGreaterThan(0);
    expect(opaquePixels(south)).toBeLessThan(32 * 48);
  });

  it('never perturbs the standard forgeCharacter output — additive only', () => {
    const character = forge();
    const spritesBefore = character.sprites.south.length;
    renderCharacterDirectionVri(character, 'south', { scale: 2 });
    // Object is frozen upstream; calling the bridge must not mutate it.
    expect(character.sprites.south.length).toBe(spritesBefore);
    expect(Object.isFrozen(character)).toBe(true);
  });

  it('throws a clear error for a direction the character was not forged with', () => {
    const character = forge();
    expect(() => renderCharacterDirectionVri(character, 'north', { scale: 1 }))
      .toThrow(/no fills for direction 'north'/);
  });
});
