/** One adult skeleton -> SCDL V2 + Wand -> packets, animation, SCD128 and UI. */
import { compileSCDLV2 } from '../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.compiler.js';
import { transpileWandToSCDLV2 } from '../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.wand-bridge.js';
import { compileWandCharacterSource } from '../../../lib/wandPixelbrainBridge.js';
import { buildCharacterSource, CHARACTER_PALETTE } from './characterModel.scdl.js';
import { CHARACTER_CANVAS, CHARACTER_ANATOMY, CHARACTER_DIRECTIONS } from './characterSkeleton.js';
import { createCharacterWitnessRecord } from '../scd128/characterWitness.js';
function compilePose(options) {
  const authored = buildCharacterSource(options);
  const result = compileWandCharacterSource(authored.source, authored.wandProposal, { canvas: CHARACTER_CANVAS, compile: compileSCDLV2, transpile: transpileWandToSCDLV2 });
  if (!result.ok) throw new Error(`Failed to compile Lotus Wanderer SCDL V2: ${result.errors.map(e => e.message).join('; ')}`);
  return { ...authored, result };
}
/** Single frame, on demand — for UI portraits that don't need the full pose set. */
export function compileCharacterPortrait({ direction = 'south', equipped } = {}) {
  const compiled = compilePose({ direction, equipped });
  return { canvas: CHARACTER_CANVAS, cells: compiled.result.packet.geometry.coordinates, joints: compiled.pose.joints };
}

let _cachedCharacterModel = null;

export function resetCharacterModelCache() {
  _cachedCharacterModel = null;
}

export function compileCharacterModel() {
  if (_cachedCharacterModel) return _cachedCharacterModel;
  const base = compilePose({ direction: 'south' });
  const frames = { idle_0: base.result.packet.geometry.coordinates };
  const poses = {
    idle_1: { phase: .25 },
    back_0: { direction: 'north' },
  };
  for (let i = 0; i < 8; i++) {
    poses[`walk_${i}`] = { motion: 'walk', phase: i / 8 };
  }
  for (const dir of ['north', 'east', 'west']) {
    for (let i = 0; i < 8; i++) {
      poses[`walk_${dir}_${i}`] = { motion: 'walk', direction: dir, phase: i / 8 };
    }
  }
  const sources = { idle_0: base.result.source };
  for (const [key, options] of Object.entries(poses)) {
    const compiled = compilePose(options); frames[key] = compiled.result.packet.geometry.coordinates; sources[key] = compiled.result.source;
  }
  // Directional idle charts share the same section generator and joint manifold.
  for (const direction of CHARACTER_DIRECTIONS.filter(d => d !== 'south' && d !== 'north')) {
    const compiled = compilePose({ direction }); frames[`${direction}_0`] = compiled.result.packet.geometry.coordinates; sources[`${direction}_0`] = compiled.result.source;
  }
  const scd128Record = createCharacterWitnessRecord({ canvas: CHARACTER_CANVAS, joints: base.pose.joints, coordinates: frames.idle_0, palette: CHARACTER_PALETTE });
  _cachedCharacterModel = Object.freeze({ contract: 'SCDL-V2-CHARACTER-PACKAGE', assetId: 'lotus_wanderer', name: 'Lotus Wanderer', canvas: CHARACTER_CANVAS, anatomy: CHARACTER_ANATOMY, joints: base.pose.joints, scdlResult: base.result, handoff: base.result.handoff, scd128Record, frames, sources });
  return _cachedCharacterModel;
}
