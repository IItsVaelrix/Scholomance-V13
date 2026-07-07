import { describe, expect, it } from 'vitest';
import { ITEM_DATABASE } from '../../../src/data/itemDatabase.js';
import { STORMHEART_ORB_ITEM_ID } from '../../../codex/core/obelisk-puzzle.signals.js';
import { getHoldPresentation, HOLD_STYLES } from '../../../src/game/combat/heldItemPresentation.js';

describe('heldItemPresentation', () => {
  it('returns palm cradle presentation for Stormheart orb', () => {
    const presentation = getHoldPresentation(ITEM_DATABASE[STORMHEART_ORB_ITEM_ID]);
    expect(presentation).toMatchObject({
      holdStyle: HOLD_STYLES.PALM_CRADLE,
      pose: 'orbHold',
      handSpriteKey: 'armL-hand-palm',
      holdAnchor: { x: 19, y: 55 },
      idleAnim: true,
    });
  });

  it('returns null for non-cradle items', () => {
    expect(getHoldPresentation(ITEM_DATABASE.item_sword_void)).toBeNull();
    expect(getHoldPresentation(null)).toBeNull();
  });
});