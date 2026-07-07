import { describe, it, expect } from 'vitest';
import '../../../codex/core/pixelbrain/character-body-profiles.js';
import { getPartProfile } from '../../../codex/core/pixelbrain/part-profile-library.js';

import { CHIBI_SILHOUETTE_GUARDS } from '../../../codex/core/pixelbrain/character-body-profiles.js';

// STARBOUND_CHIBI_MASKS.foot = [1, 2, 2, 2, 1] — 5 rows
const FOOT_MASK_LEN = 5;
// CHIBI_SILHOUETTE_GUARDS.footSpacingPx = 1
const FOOT_SPACING_PX = 1;

const profileFn = getPartProfile('character.body.chibi.starboundEsper');

function getChibiResult(params = {}, direction = 'south') {
  return profileFn(
    { compact: params.compact ?? 0.72, ...params },
    { direction, canvas: { width: 32, height: 48 }, width: 32, height: 48 },
  );
}

describe('character.body.chibi.starboundEsper — CHIBI_SILHOUETTE_GUARDS enforcement (lattice authority)', () => {
  it('south: all declared numeric guards are satisfied on base silhouette', () => {
    const res = getChibiResult({ compact: 0.72 }, 'south');
    const cx = res.anchors.base.x;

    // Head dominance
    const headYs = res.cells.filter(c => c.y <= 12); // conservative head band
    const headMaxX = Math.max(...headYs.map(c => c.x));
    const headMinX = Math.min(...headYs.map(c => c.x));
    const headHalf = Math.max(headMaxX - cx, cx - headMinX);
    const shoulderY = res.anchors.shoulderL?.y ?? 21;
    const shoulderCells = res.cells.filter(c => c.y === shoulderY);
    const shoulderHalf = Math.max(...shoulderCells.map(c => Math.abs(c.x - cx)));
    expect(shoulderHalf / Math.max(1, headHalf)).toBeLessThanOrEqual(CHIBI_SILHOUETTE_GUARDS.maxShoulderWidthRatio + 0.01);

    // Leg column height
    const legCells = res.cells.filter(c => c.y >= 28 && c.y <= 40);
    const legHeight = legCells.length > 0 ? (Math.max(...legCells.map(c => c.y)) - Math.min(...legCells.map(c => c.y)) + 1) : 0;
    expect(legHeight).toBeLessThanOrEqual(CHIBI_SILHOUETTE_GUARDS.maxLegColumnHeightPx + 2); // tolerance for construction

    // Foot center clear + spacing
    const footCells = res.cells.filter(c => c.y >= 39);
    for (const y of [39, 40, 41, 42]) {
      const xsAtY = footCells.filter(c => c.y === y).map(c => c.x);
      expect(xsAtY).not.toContain(cx);
      const left = xsAtY.filter(x => x < cx);
      const right = xsAtY.filter(x => x > cx);
      if (left.length && right.length) {
        const gap = Math.min(...right) - Math.max(...left) - 1;
        expect(gap).toBeGreaterThanOrEqual(CHIBI_SILHOUETTE_GUARDS.footSpacingPx);
      }
    }
  });

  it('east (profile): legs form a single thin column — no collapse, no two-leg fat mass', () => {
    const res = getChibiResult({}, 'east');
    const legCells = res.cells.filter(c => c.y >= 28 && c.y <= 40);
    const xs = [...new Set(legCells.map(c => c.x))].sort((a, b) => a - b);
    // In true side view we expect a very narrow silhouette (1-2 distinct x values)
    expect(xs.length).toBeLessThanOrEqual(3);
    // Center column should still be respected relative to body center
    const cx = res.anchors.base.x;
    expect(xs.some(x => Math.abs(x - cx) <= 2)).toBe(true);
  });

  it('east (profile): single foot under the leg column, no overlap artifact', () => {
    const res = getChibiResult({}, 'east');
    const footCells = res.cells.filter(c => c.y >= 39);
    const xs = [...new Set(footCells.map(c => c.x))];
    expect(xs.length).toBeLessThanOrEqual(2); // narrow foot
  });
});

describe('character.body.chibi.starboundEsper foot geometry (south/north baseline)', () => {
  function getFootCells(direction = 'south') {
    const result = getChibiResult({ compact: 0.72 }, direction);
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

  it('south: wide foot rows have at least footSpacingPx gap between feet', () => {
    const { cells, cx, footTopY } = getFootCells('south');
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
        `wide foot row y=${y}: expected gap ≥${FOOT_SPACING_PX + 1}`,
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
