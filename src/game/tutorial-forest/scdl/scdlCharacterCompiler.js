/**
 * Tutorial Forest — SCDL V2 Character Compiler & Animation Frame Generator
 *
 * Compiles the SCDL V2 character source into canonical PixelBrain packets
 * and synthesizes 4-frame idle & walk loops ready for Phaser 4.
 */

import { compileSCDLV2 } from '../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.compiler.js';
import { LOTUS_WANDERER_SCDL_V2 } from './characterModel.scdl.js';

export function compileCharacterModel() {
  const result = compileSCDLV2(LOTUS_WANDERER_SCDL_V2);
  if (!result.ok) {
    throw new Error(`Failed to compile Lotus Wanderer SCDL V2: ${result.errors.map(e => e.message).join('; ')}`);
  }

  const baseCells = result.packet.geometry.coordinates;
  const width = result.analysis.canvas.width;
  const height = result.analysis.canvas.height;

  // Synthesize walk and idle animation frames deterministically from the canonical SCDL cells
  const frames = {
    idle_0: baseCells,
    idle_1: generateIdlePulse(baseCells, width, height),
    walk_0: generateWalkStride(baseCells, width, height, -1),
    walk_1: baseCells,
    walk_2: generateWalkStride(baseCells, width, height, 1),
    walk_3: baseCells,
  };

  return {
    contract: 'SCDL-V2-CHARACTER-PACKAGE',
    assetId: 'lotus_wanderer',
    canvas: { width, height },
    scdlResult: result,
    frames,
  };
}

/**
 * Idle breath & gemstone glow pulsation.
 */
function generateIdlePulse(cells, _width, _height) {
  return cells.map((cell) => {
    // Upper body chest & gem breathe up 1px
    let y = cell.y;
    let color = cell.color;
    if (cell.y <= 24 && cell.y >= 6) {
      y = Math.max(0, cell.y - 1);
    }
    // Crystal glow flare
    if (cell.color.toLowerCase() === '#10b981') {
      color = '#34D399';
    } else if (cell.color.toLowerCase() === '#6ee7b7') {
      color = '#A7F3D0';
    }
    return { ...cell, y, color };
  });
}

/**
 * Walking stride step shift.
 */
function generateWalkStride(cells, _width, _height, direction) {
  return cells.map((cell) => {
    let x = cell.x;
    let y = cell.y;
    // Left leg / boot moves with direction
    if (cell.y >= 33 && cell.x <= 14) {
      x += direction;
      y += direction === -1 ? -1 : 0;
    }
    // Right leg / boot moves opposite
    if (cell.y >= 33 && cell.x >= 15 && cell.x <= 20) {
      x -= direction;
      y += direction === 1 ? -1 : 0;
    }
    // Staff sways with movement
    if (cell.x >= 21) {
      x += direction > 0 ? 1 : -1;
    }
    return { ...cell, x, y };
  });
}
