import { ARM_RIG } from '../../data/armRigConfig.js';

export const CHARACTER_WEAPON_CANVAS = Object.freeze({ width: 64, height: 128 });

export const CHARACTER_WEAPON_GRIP = Object.freeze({
  ...ARM_RIG.right.segments.find((seg) => seg.gripPoint)?.gripPoint,
});

export const CHARACTER_WEAPON_REFERENCE_ART_HEIGHT = 58;

export const ICE_SLIME_STAFF_SOURCE_GRIP = Object.freeze({ x: 24, y: 103 });

const HERO_PART_PREFIXES = [
  'orb',
  'cradle',
];

export function isHeroWeaponPart(partId) {
  return HERO_PART_PREFIXES.some((prefix) => partId === prefix || partId.startsWith(`${prefix}_`));
}

function partBounds(partMap) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;

  for (const cells of partMap.values()) {
    for (const cell of cells) {
      count += 1;
      minX = Math.min(minX, cell.x);
      minY = Math.min(minY, cell.y);
      maxX = Math.max(maxX, cell.x);
      maxY = Math.max(maxY, cell.y);
    }
  }

  if (!count) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, count: 0 };
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    count,
  };
}

function clampCell(cell, canvas) {
  if (cell.x < 0 || cell.y < 0 || cell.x >= canvas.width || cell.y >= canvas.height) return null;
  return cell;
}

export function fitWeaponPartMapToCharacterRig(partMap, options = {}) {
  const canvas = options.canvas || CHARACTER_WEAPON_CANVAS;
  const sourceGrip = options.sourceGrip || ICE_SLIME_STAFF_SOURCE_GRIP;
  const targetGrip = options.targetGrip || CHARACTER_WEAPON_GRIP;
  const bounds = partBounds(partMap);
  const targetArtHeight = options.targetArtHeight ?? CHARACTER_WEAPON_REFERENCE_ART_HEIGHT;
  const scale = options.scale ?? (bounds.height > 0 ? targetArtHeight / bounds.height : 1);

  const fitted = new Map();
  for (const [partId, cells] of partMap.entries()) {
    const next = [];
    for (const cell of cells) {
      const fittedCell = clampCell({
        x: Math.round((cell.x - sourceGrip.x) * scale + targetGrip.x),
        y: Math.round((cell.y - sourceGrip.y) * scale + targetGrip.y),
        color: cell.color,
      }, canvas);
      if (fittedCell) next.push(fittedCell);
    }
    if (next.length) fitted.set(partId, next);
  }

  return {
    partMap: fitted,
    canvas,
    scale,
    sourceGrip,
    targetGrip,
    bounds,
    fittedBounds: partBounds(fitted),
  };
}

export function scaleWalkOffsets(offsets, scale) {
  return offsets.map((frame) => ({
    ...frame,
    dx: frame.dx != null ? Math.round(frame.dx * scale) : 0,
    dy: frame.dy != null ? Math.round(frame.dy * scale) : 0,
  }));
}

export function fitPoint(x, y, rigFit) {
  return {
    x: Math.round((x - rigFit.sourceGrip.x) * rigFit.scale + rigFit.targetGrip.x),
    y: Math.round((y - rigFit.sourceGrip.y) * rigFit.scale + rigFit.targetGrip.y),
  };
}