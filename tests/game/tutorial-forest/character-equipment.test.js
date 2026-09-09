import { describe, it, expect } from 'vitest';
import { buildCharacterSource } from '../../../src/game/tutorial-forest/scdl/characterModel.scdl.js';
import { compileCharacterPortrait } from '../../../src/game/tutorial-forest/scdl/scdlCharacterCompiler.js';

const WEAPON_ITEM = { id: 'item_sword_emberbrand', type: 'weapon', slot: 'mainHand' };

describe('Tutorial Forest — character equipment awareness', () => {
  it('draws the built-in staff when no weapon is equipped', () => {
    const { source } = buildCharacterSource();
    expect(source).toContain('SHAPE $staff ');
  });

  it('omits the built-in staff when a weapon is equipped', () => {
    const { source } = buildCharacterSource({ equipped: { weapon: WEAPON_ITEM } });
    expect(source).not.toContain('SHAPE $staff ');
    expect(source).not.toContain('SHAPE $lotus_crystal ');
  });

  it('compiles a single portrait frame with fewer cells once the staff is suppressed', () => {
    const bare = compileCharacterPortrait();
    const armed = compileCharacterPortrait({ equipped: { weapon: WEAPON_ITEM } });
    expect(bare.canvas).toEqual({ width: 64, height: 112 });
    expect(bare.cells.length).toBeGreaterThan(0);
    expect(armed.cells.length).toBeLessThan(bare.cells.length);
  });
});
