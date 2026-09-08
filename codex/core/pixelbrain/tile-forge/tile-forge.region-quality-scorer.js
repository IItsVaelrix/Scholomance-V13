/**
 * Scene-scale quality falsifiers for continuous Tile Forge regions.
 *
 * These metrics identify known failure modes. They do not certify artistic
 * parity and intentionally never award Grade S without human review.
 */

function colorKeyAt(data, pixelIndex) {
  const offset = pixelIndex * 4;
  return (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2];
}

function fnv1aBytes(data, prefix = '') {
  let hash = 0x811C9DC5;
  for (let index = 0; index < prefix.length; index += 1) {
    hash ^= prefix.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  for (let index = 0; index < data.length; index += 1) {
    hash ^= data[index];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `tfr-${hash.toString(16).padStart(8, '0')}`;
}

function hexKey(hex) {
  return Number.parseInt(hex.slice(1), 16);
}

function luminanceAt(data, pixelIndex) {
  const offset = pixelIndex * 4;
  return data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
}

function materialMeanLuminance(asset, form, material) {
  const mask = form.materialMasks[material];
  let total = 0;
  let count = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] !== 1 || asset.data[index * 4 + 3] === 0) continue;
    total += luminanceAt(asset.data, index);
    count += 1;
  }
  return count === 0 ? null : total / count;
}

function measureWaterNeighborChange(asset, form) {
  const water = form.materialMasks.water_pond;
  let comparisons = 0;
  let changes = 0;
  for (let y = 0; y < form.height; y += 1) {
    for (let x = 0; x < form.width; x += 1) {
      const index = y * form.width + x;
      if (water[index] !== 1 || asset.data[index * 4 + 3] === 0) continue;
      if (x + 1 < form.width && water[index + 1] === 1) {
        comparisons += 1;
        if (colorKeyAt(asset.data, index) !== colorKeyAt(asset.data, index + 1)) changes += 1;
      }
      if (y + 1 < form.height && water[index + form.width] === 1) {
        comparisons += 1;
        if (colorKeyAt(asset.data, index) !== colorKeyAt(asset.data, index + form.width)) changes += 1;
      }
    }
  }
  return comparisons === 0 ? 0 : changes / comparisons;
}

function cellCropSignature(asset, form, cell) {
  const anchor = form.cellAnchors[`${cell.tx},${cell.ty}`];
  let signature = 0x811C9DC5;
  for (let localY = 4; localY < 36; localY += 4) {
    for (let localX = 4; localX < 76; localX += 4) {
      const nx = Math.abs(localX + 0.5 - 40) / 40;
      const ny = Math.abs(localY + 0.5 - 20) / 20;
      if (nx + ny > 0.82) continue;
      const x = anchor.x + localX;
      const y = anchor.y + localY;
      const pixelIndex = y * form.width + x;
      const value = form.materialMasks[cell.material][pixelIndex] === 1
        ? colorKeyAt(asset.data, pixelIndex)
        : 0xFFFFFFFF;
      signature ^= value;
      signature = Math.imul(signature, 0x01000193) >>> 0;
    }
  }
  return signature;
}

function measureRepeatedAdjacentCrops(asset, form, spec) {
  const cells = new Map(spec.cells.map((cell) => [`${cell.tx},${cell.ty}`, cell]));
  const signatures = new Map(spec.cells.map((cell) => [
    `${cell.tx},${cell.ty}`,
    cellCropSignature(asset, form, cell),
  ]));
  let comparisons = 0;
  let identical = 0;

  for (const cell of spec.cells) {
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const neighborKey = `${cell.tx + dx},${cell.ty + dy}`;
      const neighbor = cells.get(neighborKey);
      if (!neighbor || neighbor.material !== cell.material) continue;
      comparisons += 1;
      if (signatures.get(`${cell.tx},${cell.ty}`) === signatures.get(neighborKey)) identical += 1;
    }
  }

  return comparisons === 0 ? 0 : identical / comparisons;
}

function gradeFor(score, hardFailures) {
  const capped = hardFailures.length > 0 ? Math.min(score, 59) : score;
  if (capped >= 85) return 'A';
  if (capped >= 70) return 'B';
  if (capped >= 55) return 'C';
  if (capped >= 40) return 'D';
  return 'F';
}

/**
 * Measure a realized region against explicit failure thresholds.
 */
export function scoreTileForgeRegion({ asset, form = asset?.form, spec }) {
  if (!asset?.data || !form || !spec) {
    return Object.freeze({
      grade: 'F',
      score: 0,
      hardFailures: Object.freeze(['missing_input']),
      metrics: Object.freeze({}),
    });
  }

  const usedColors = new Set();
  const declaredColors = new Set((asset.palette ?? []).map(hexKey));
  let transparentSeamPixels = 0;
  let pathContinuityGaps = 0;
  let undeclaredColorPixels = 0;
  let quietMeadowPixels = 0;
  let quietMeadowAccentPixels = 0;
  const quietMiddleColors = new Set((asset.paletteRoles?.meadow ?? []).slice(2, 5).map(hexKey));

  for (let index = 0; index < form.alphaMask.length; index += 1) {
    if (form.alphaMask[index] !== 1) continue;
    const alpha = asset.data[index * 4 + 3];
    if (alpha === 0) {
      transparentSeamPixels += 1;
      if (form.materialMasks.path_flagstone[index] === 1) pathContinuityGaps += 1;
      continue;
    }
    const color = colorKeyAt(asset.data, index);
    usedColors.add(color);
    if (!declaredColors.has(color)) undeclaredColorPixels += 1;
    if (form.materialMasks.grass_quiet[index] === 1) {
      quietMeadowPixels += 1;
      if (!quietMiddleColors.has(color)) quietMeadowAccentPixels += 1;
    }
  }

  const grassLuma = materialMeanLuminance(asset, form, 'grass_quiet');
  const pathLuma = materialMeanLuminance(asset, form, 'path_flagstone');
  const materialLuminanceSeparation = grassLuma === null || pathLuma === null
    ? 255
    : Math.abs(grassLuma - pathLuma);
  const repeatedAdjacentCropRatio = measureRepeatedAdjacentCrops(asset, form, spec);
  const waterNeighborChangeRatio = measureWaterNeighborChange(asset, form);
  const quietMeadowAccentRatio = quietMeadowPixels === 0
    ? 0
    : quietMeadowAccentPixels / quietMeadowPixels;
  const expectedRealizationHash = fnv1aBytes(asset.data, `${form.formHash}:${spec.seed}`);

  const hardFailures = [];
  if (usedColors.size > 32) hardFailures.push('palette_overflow');
  if (undeclaredColorPixels > 0) hardFailures.push('undeclared_palette_color');
  if (transparentSeamPixels > 0) hardFailures.push('transparent_seam');
  if (pathContinuityGaps > 0) hardFailures.push('path_continuity');
  if (asset.width > 2048 || asset.height > 2048) hardFailures.push('dimension_overflow');
  if (
    asset.realizationHash !== expectedRealizationHash
    || asset.witness?.realizationHash !== asset.realizationHash
    || asset.witness?.formHash !== form.formHash
  ) hardFailures.push('witness_integrity');

  let score = 100;
  if (hardFailures.length > 0) score -= Math.min(50, hardFailures.length * 15);
  if (repeatedAdjacentCropRatio >= 0.18) score -= 30;
  if (quietMeadowAccentRatio >= 0.12) score -= 30;
  if (materialLuminanceSeparation < 16) score -= 30;
  if (waterNeighborChangeRatio >= 0.35) score -= 30;
  score = Math.max(0, score);

  const metrics = Object.freeze({
    paletteColorCount: usedColors.size,
    transparentSeamPixels,
    pathContinuityGaps,
    repeatedAdjacentCropRatio,
    quietMeadowAccentRatio,
    materialLuminanceSeparation,
    waterNeighborChangeRatio,
    undeclaredColorPixels,
    synthesisMilliseconds: asset.synthesisMilliseconds ?? 0,
  });

  return Object.freeze({
    grade: gradeFor(score, hardFailures),
    score,
    hardFailures: Object.freeze(hardFailures),
    metrics,
  });
}
