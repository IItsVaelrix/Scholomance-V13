import { describe, expect, it } from 'vitest';
import { ARM_RIG, ARM_POSES, getPose } from '../../../src/data/armRigConfig.js';
import { solveArm, gripWorld, anchorWorld } from '../../../src/game/combat/armRig.js';

describe('armRigConfig', () => {
  it('defines both arms with three segments and sprite keys', () => {
    for (const side of ['right', 'left']) {
      expect(ARM_RIG[side].segments).toHaveLength(3);
      ARM_RIG[side].segments.forEach((s) => expect(typeof s.spriteKey).toBe('string'));
      expect(ARM_RIG[side].segments[2].gripPoint).toBeTruthy(); // hand holds the grip
    }
    expect(ARM_RIG.left.mirror).toBe(true);
  });

  it('poses provide a 3-angle array per relevant arm', () => {
    expect(getPose('carry').right).toHaveLength(3);
    expect(getPose('swing').right).toHaveLength(3);
    expect(getPose('block').left).toHaveLength(3);
    expect(getPose('unknown')).toEqual(getPose('carry')); // fallback
  });

  it('is solvable — the right arm carry pose yields a grip below the shoulder', () => {
    const grip = gripWorld(ARM_RIG.right, getPose('carry').right);
    expect(grip.y).toBeGreaterThan(ARM_RIG.right.shoulder.y); // hand hangs down
    expect(() => solveArm(ARM_RIG.right, getPose('swing').right)).not.toThrow();
  });

  it('orbHold presents the left palm cradle near the orb anchor', () => {
    const leftAngles = getPose('orbHold').left;
    const cradle = anchorWorld(ARM_RIG.left, leftAngles, 'cradlePoint');
    expect(cradle.y).toBeLessThan(60);
    expect(cradle.y).toBeGreaterThan(48);
    expect(Math.abs(cradle.x - 19)).toBeLessThanOrEqual(4);
  });
});
