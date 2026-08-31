/**
 * photo1RigConfig.js — joint pivots for the photo_1_lit character's leg rig.
 * Canvas: 32x32. Segments match photo_1_lit-leg{L,R}-{thigh,shin,boot}.scdl.
 *
 * The legs REPLACE the sprite's original hem mass (body rows y>=23 are cut in
 * photo_1_lit-body.scdl) rather than hanging below it — that mass was the
 * character's boots, so keeping it made the figure read boots -> legs -> boots.
 * Leg is 9 rows against a 19-row torso; an earlier 14-row version was far too
 * long for a 32x32 sprite.
 *
 * This is the leg counterpart to void1RigConfig.js's arm rig. VOID1_JOINTS
 * already declared hip/knee/ankle for its legs, but no character had leg
 * segment sprites — Void1's legs are hand-redrawn per frame. These are real
 * jointed legs: the walk cycle below is joint ROTATIONS resolved by
 * solveArm(), not per-frame redrawn geometry.
 *
 * Angle convention (see armRig.js `advance`): a positive angle swings the
 * child joint toward -x, i.e. forward for this left-facing character.
 */

export const PHOTO1_JOINTS = {
  torso: {
    hipL: { x: 16, y: 22 },
    hipR: { x: 20, y: 22 },
  },
  legL: {
    knee: { x: 16, y: 26 },
    ankle: { x: 16, y: 29 },
    sole: { x: 16, y: 31 },
  },
  legR: {
    knee: { x: 20, y: 26 },
    ankle: { x: 20, y: 29 },
    sole: { x: 20, y: 31 },
  },
};

export const PHOTO1_LEG_RIG = {
  left: {
    root: PHOTO1_JOINTS.torso.hipL,
    mirror: false,
    segments: [
      { key: 'thigh', spriteKey: 'photo1-legL-thigh', pivot: { x: 16, y: 22 }, childOffset: { x: 16, y: 26 }, restAngleDeg: 0 },
      { key: 'shin', spriteKey: 'photo1-legL-shin', pivot: { x: 16, y: 26 }, childOffset: { x: 16, y: 29 }, restAngleDeg: 0 },
      { key: 'boot', spriteKey: 'photo1-legL-boot', pivot: { x: 16, y: 29 }, childOffset: { x: 16, y: 31 }, restAngleDeg: 0, solePoint: PHOTO1_JOINTS.legL.sole },
    ],
  },
  right: {
    root: PHOTO1_JOINTS.torso.hipR,
    mirror: false,
    segments: [
      { key: 'thigh', spriteKey: 'photo1-legR-thigh', pivot: { x: 20, y: 22 }, childOffset: { x: 20, y: 26 }, restAngleDeg: 0 },
      { key: 'shin', spriteKey: 'photo1-legR-shin', pivot: { x: 20, y: 26 }, childOffset: { x: 20, y: 29 }, restAngleDeg: 0 },
      { key: 'boot', spriteKey: 'photo1-legR-boot', pivot: { x: 20, y: 29 }, childOffset: { x: 20, y: 31 }, restAngleDeg: 0, solePoint: PHOTO1_JOINTS.legR.sole },
    ],
  },
};

/**
 * Walk cycle as joint angles [thigh, shin, boot] per leg.
 * Contact = one leg reaching forward, the other trailing with a bent knee.
 * Pass = the swing leg lifting through under the body, knee well bent.
 */
export const PHOTO1_LEG_POSES = {
  stand: { left: [0, 0, 0], right: [0, 0, 0] },
  contactL: { left: [24, -10, 0], right: [-20, 12, 0] },
  passL: { left: [4, -4, 0], right: [-8, 30, 0] },
  contactR: { left: [-20, 12, 0], right: [24, -10, 0] },
  passR: { left: [-8, 30, 0], right: [4, -4, 0] },
};

/** Frame order of the walk loop, 200ms per frame to match the Void1 cadence. */
export const PHOTO1_WALK = {
  frames: ['stand', 'contactL', 'passL', 'contactR', 'passR'],
  defaultDurationMs: 200,
  loop: true,
};

export function getPhoto1LegPose(name) {
  return PHOTO1_LEG_POSES[name] || PHOTO1_LEG_POSES.stand;
}
