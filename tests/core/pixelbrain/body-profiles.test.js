import { describe, it, expect } from 'vitest';
import '../../../codex/core/pixelbrain/character-body-profiles.js';
import { getPartProfile } from '../../../codex/core/pixelbrain/part-profile-library.js';

// STARBOUND_CHIBI_MASKS.foot = [1, 2, 2, 2, 1] — 5 rows
const FOOT_MASK_LEN = 5;
// CHIBI_SILHOUETTE_GUARDS.footSpacingPx = 1
const FOOT_SPACING_PX = 1;

describe('character.body.chibi.starboundEsper foot geometry', () => {
  function getFootCells(direction = 'south') {
    const profileFn = getPartProfile('character.body.chibi.starboundEsper');
    const result = profileFn(
      { compact: 0.72 },
      { direction, canvas: { width: 32, height: 48 }, width: 32, height: 48 },
    );
    const cx = result.anchors.base.x;
    const footBotY = result.anchors.base.y;
    const footTopY = footBotY - (FOOT_MASK_LEN - 1);
    return { cells: result.cells, cx, footTopY, footBotY };
  }

  it('south: body center column is clear in all foot rows', () => {
    const { cells, cx, footTopY, footBotY } = getFootCells('south');
    for (let y = footTopY; y <= footBotY; y += 1) {
      const xs = cells.filter(c => c.y === y).map(c => c.x);
      expect(xs, `foot row y=${y} has a cell at center x=${cx}`).not.toContain(cx);
    }
  });

  it('south: wide foot rows (halfW=2) have at least footSpacingPx gap between feet', () => {
    const { cells, cx, footTopY } = getFootCells('south');
    // Rows 1-3 of the mask are the wide rows
    const wideRows = [footTopY + 1, footTopY + 2, footTopY + 3];
    for (const y of wideRows) {
      const xs = cells.filter(c => c.y === y).map(c => c.x);
      const leftXs = xs.filter(x => x < cx);
      const rightXs = xs.filter(x => x > cx);
      if (leftXs.length === 0 || rightXs.length === 0) continue;
      const maxLeft = Math.max(...leftXs);
      const minRight = Math.min(...rightXs);
      expect(
        minRight - maxLeft,
        `wide foot row y=${y}: expected gap ≥${FOOT_SPACING_PX + 1} (${FOOT_SPACING_PX}px clear), got ${minRight - maxLeft}`,
      ).toBeGreaterThanOrEqual(FOOT_SPACING_PX + 1);
    }
  });

  it('north: body center column is clear in all foot rows', () => {
    const { cells, cx, footTopY, footBotY } = getFootCells('north');
    for (let y = footTopY; y <= footBotY; y += 1) {
      const xs = cells.filter(c => c.y === y).map(c => c.x);
      expect(xs, `foot row y=${y} has a cell at center x=${cx}`).not.toContain(cx);
    }
  });
});
