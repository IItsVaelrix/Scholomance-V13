import { describe, it, expect, vi } from 'vitest';
import { VOID1_ARM_RIG } from '../../src/data/void1RigConfig.js';
import {
  applyVoid1ArmPose,
  hasVoid1RigTextures,
  pickVoid1StrikeAnim,
  void1StrikeDelayMs,
  VOID1_ANIM,
} from '../../src/game/combat/void1CombatVisuals.js';

describe('void1CombatVisuals', () => {
  it('maps ranged ice and void gravity to cast anim', () => {
    expect(pickVoid1StrikeAnim('void_gravity')).toBe(VOID1_ANIM.CAST);
    expect(pickVoid1StrikeAnim('icicle_blast')).toBe(VOID1_ANIM.CAST);
  });

  it('maps melee void attacks to attack anim', () => {
    expect(pickVoid1StrikeAnim('void_lash')).toBe(VOID1_ANIM.ATTACK);
    expect(pickVoid1StrikeAnim('void_execution')).toBe(VOID1_ANIM.ATTACK);
    expect(pickVoid1StrikeAnim('basic')).toBe(VOID1_ANIM.ATTACK);
  });

  it('uses longer delay for cast abilities', () => {
    expect(void1StrikeDelayMs('icicle_blast')).toBeGreaterThan(void1StrikeDelayMs('void_execution'));
    expect(void1StrikeDelayMs('void_gravity')).toBeGreaterThan(void1StrikeDelayMs('void_lash'));
  });

  it('detects the rigged body-noArms skin separately from composite fallback', () => {
    const textures = {
      exists: (key) => key === 'void1-body-noarms-f0' || key === VOID1_ARM_RIG.right.segments[0].spriteKey,
    };
    expect(hasVoid1RigTextures(textures)).toBe(true);
  });

  it('positions rig arm segments from void1 pose data', () => {
    const armSegments = {
      [VOID1_ARM_RIG.right.segments[0].spriteKey]: {
        setPosition: vi.fn(),
        setRotation: vi.fn(),
      },
    };
    applyVoid1ArmPose(armSegments, 'carry');
    expect(armSegments[VOID1_ARM_RIG.right.segments[0].spriteKey].setPosition).toHaveBeenCalled();
    expect(armSegments[VOID1_ARM_RIG.right.segments[0].spriteKey].setRotation).toHaveBeenCalled();
  });
});