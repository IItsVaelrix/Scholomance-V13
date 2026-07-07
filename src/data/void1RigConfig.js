/**
 * void1RigConfig.js — joint pivots for the Void1 void acolyte rig.
 * Canvas: 32x48. Segments match Void1-arm{L,R}-{upper,fore,hand}.scdl exports.
 */

export const VOID1_JOINTS = {
  head: { top: { x: 15, y: 2 }, center: { x: 15, y: 10 }, chin: { x: 15, y: 15 } },
  torso: {
    shoulderL: { x: 8, y: 18 },
    shoulderR: { x: 23, y: 18 },
    hipL: { x: 10, y: 30 },
    hipR: { x: 21, y: 30 },
  },
  armL: {
    elbow: { x: 7, y: 26 },
    wrist: { x: 7, y: 34 },
    grip: { x: 7, y: 36 },
  },
  armR: {
    elbow: { x: 24, y: 26 },
    wrist: { x: 24, y: 34 },
    grip: { x: 23, y: 33 },
  },
  legL: {
    knee: { x: 10, y: 38 },
    ankle: { x: 10, y: 44 },
  },
  legR: {
    knee: { x: 21, y: 38 },
    ankle: { x: 21, y: 44 },
  },
};

export const VOID1_ARM_RIG = {
  right: {
    shoulder: VOID1_JOINTS.torso.shoulderR,
    mirror: false,
    segments: [
      { key: 'upper', spriteKey: 'Void1-armR-upper', pivot: { x: 23, y: 18 }, childOffset: { x: 24, y: 26 }, restAngleDeg: 0 },
      { key: 'fore', spriteKey: 'Void1-armR-fore', pivot: { x: 24, y: 26 }, childOffset: { x: 24, y: 34 }, restAngleDeg: 0 },
      { key: 'hand', spriteKey: 'Void1-armR-hand', pivot: { x: 24, y: 34 }, childOffset: { x: 23, y: 36 }, restAngleDeg: 0, gripPoint: VOID1_JOINTS.armR.grip },
    ],
  },
  left: {
    shoulder: VOID1_JOINTS.torso.shoulderL,
    mirror: true,
    segments: [
      { key: 'upper', spriteKey: 'Void1-armL-upper', pivot: { x: 8, y: 18 }, childOffset: { x: 7, y: 26 }, restAngleDeg: 0 },
      { key: 'fore', spriteKey: 'Void1-armL-fore', pivot: { x: 7, y: 26 }, childOffset: { x: 7, y: 34 }, restAngleDeg: 0 },
      { key: 'hand', spriteKey: 'Void1-armL-hand', pivot: { x: 7, y: 34 }, childOffset: { x: 7, y: 36 }, restAngleDeg: 0, gripPoint: VOID1_JOINTS.armL.grip },
    ],
  },
};

export const VOID1_ARM_POSES = {
  carry: { right: [0, 0, 0], left: [0, 0, 0] },
  staffRaise: { right: [-35, -45, 0], left: [10, 5, 0] },
  voidSurge: { right: [5, 10, 0], left: [-5, 5, 0] },
  walkSwingL: { right: [15, 5, 0], left: [-20, -10, 0] },
  walkSwingR: { right: [-20, -10, 0], left: [15, 5, 0] },
  strikeWindup: { right: [-40, -20, 10], left: [0, 0, 0] },
  strikeHit: { right: [60, 30, 0], left: [-10, 0, 0] },
};

export const VOID1_ANIMATIONS = {
  idle: { scdl: 'Void1.scdl', frames: 4, defaultDurationMs: 400, labels: ['rest', 'hood-dip', 'void-surge', 'halo-flicker'] },
  walk: { scdl: 'Void1-walk.scdl', frames: 5, defaultDurationMs: 200, labels: ['rest', 'stride-L', 'pass-mid', 'stride-R', 'pass-mid2'] },
  cast: { scdl: 'Void1-cast.scdl', frames: 5, defaultDurationMs: 150, labels: ['rest', 'raise', 'channel', 'release', 'recover'] },
  attack: { scdl: 'Void1-attack.scdl', frames: 4, defaultDurationMs: 120, labels: ['rest', 'windup', 'strike', 'recover'] },
};

export function getVoid1Pose(name) {
  return VOID1_ARM_POSES[name] || VOID1_ARM_POSES.carry;
}

export function getVoid1Animation(name) {
  return VOID1_ANIMATIONS[name] || VOID1_ANIMATIONS.idle;
}