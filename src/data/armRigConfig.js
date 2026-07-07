/**
 * armRigConfig.js — data-only joint definition for the two-arm rig.
 *
 * Pivots are SCDL canvas coordinates (64x128). restAngleDeg is 0 because each
 * segment sprite is drawn in its rest position; poses supply angle DELTAS.
 * Tune pivots against the running arena (see plan Task 8). New poses/weapons
 * drop in here without touching the scene.
 */

export const ARM_RIG = {
  right: {
    shoulder: { x: 43, y: 30 },
    mirror: false,
    segments: [
      { key: 'upper', spriteKey: 'armR-upper', pivot: { x: 43, y: 30 }, childOffset: { x: 44, y: 44 }, restAngleDeg: 0 },
      { key: 'fore', spriteKey: 'armR-fore', pivot: { x: 44, y: 44 }, childOffset: { x: 44, y: 58 }, restAngleDeg: 0 },
      { key: 'hand', spriteKey: 'armR-hand', pivot: { x: 44, y: 58 }, childOffset: { x: 44, y: 64 }, restAngleDeg: 0, gripPoint: { x: 45, y: 62 } },
    ],
  },
  left: {
    shoulder: { x: 21, y: 30 },
    mirror: true,
    segments: [
      { key: 'upper', spriteKey: 'armL-upper', pivot: { x: 21, y: 30 }, childOffset: { x: 20, y: 44 }, restAngleDeg: 0 },
      { key: 'fore', spriteKey: 'armL-fore', pivot: { x: 20, y: 44 }, childOffset: { x: 19, y: 58 }, restAngleDeg: 0 },
      {
        key: 'hand',
        spriteKey: 'armL-hand',
        palmSpriteKey: 'armL-hand-palm',
        pivot: { x: 19, y: 58 },
        childOffset: { x: 19, y: 64 },
        restAngleDeg: 0,
        gripPoint: { x: 19, y: 62 },
        cradlePoint: { x: 19, y: 59 },
      },
    ],
  },
};

// Pose = per-arm array of angle DELTAS (deg) applied to [upper, fore, hand].
// A HORIZONTAL slash: raise the extended arm out to the side (windup), then
// sweep it laterally across the body at ~chest height (strike). The arm stays
// extended (small elbow bend) so the blade glides across rather than tracing a
// vertical crescent.
export const ARM_POSES = {
  carry: { right: [0, 0, 0], left: [0, 0, 0] },
  // Cocked out to the right at shoulder height, blade back.
  swingWindup: { right: [-95, -15, 0], left: [0, 0, 0] },
  // Swept across to the left/forward at ~the same height — a level slash.
  swing: { right: [80, 10, 0], left: [0, 0, 0] },
  // Left forearm raises across the body to bring the shield up.
  block: { right: [0, 0, 0], left: [-35, 60, 0] },
  // Left palm cradles an orb — forearm presented, hand cupped facing sky.
  orbHold: { right: [0, 0, 0], left: [30, -90, 90] },
};

export function getPose(name) {
  return ARM_POSES[name] || ARM_POSES.carry;
}
