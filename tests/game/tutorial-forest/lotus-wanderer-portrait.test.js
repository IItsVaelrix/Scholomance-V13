import { describe, it, expect } from 'vitest';
import { getLotusWandererPortraitUrl } from '../../../src/game/tutorial-forest/render/lotusWandererPortrait.js';
import { installRealCanvas } from '../../helpers/realCanvas.js';

const WEAPON_ITEM = { id: 'item_sword_emberbrand', type: 'weapon', slot: 'mainHand' };

installRealCanvas();

describe('Tutorial Forest — lotus wanderer portrait rasterizer', () => {
  it('rasterizes the character to a PNG data URL', () => {
    const url = getLotusWandererPortraitUrl();
    expect(url).toMatch(/^data:image\/png;base64,/);
  });

  it('caches the same data URL across repeated calls with the same equip state', () => {
    const first = getLotusWandererPortraitUrl();
    const second = getLotusWandererPortraitUrl();
    expect(second).toBe(first);
  });

  it('renders a different image once a weapon is equipped', () => {
    const bare = getLotusWandererPortraitUrl();
    const armed = getLotusWandererPortraitUrl({ equipped: { weapon: WEAPON_ITEM } });
    expect(armed).not.toBe(bare);
  });
});
