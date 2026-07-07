import { ARM_RIG } from '../../data/armRigConfig.js';

export const HOLD_STYLES = Object.freeze({
  PALM_CRADLE: 'palmCradle',
});

/** @returns {import('./heldItemPresentation.js').HoldPresentation | null} */
export function getHoldPresentation(item) {
  if (!item || item.holdStyle !== HOLD_STYLES.PALM_CRADLE) return null;
  const handSeg = ARM_RIG.left.segments.find((seg) => seg.cradlePoint);
  return {
    holdStyle: HOLD_STYLES.PALM_CRADLE,
    pose: 'orbHold',
    handSpriteKey: handSeg?.palmSpriteKey || 'armL-hand-palm',
    cradleAnchorKey: 'cradlePoint',
    holdAnchor: item.holdAnchor || { x: 19, y: 55 },
    idleAnim: true,
  };
}