import { describe, expect, it } from 'vitest';
import { solveArm, gripWorld } from '../../../src/game/combat/armRig.js';

// A 2-segment horizontal chain rooted at origin; each segment 10 long.
const arm = {
  shoulder: { x: 0, y: 0 },
  mirror: false,
  segments: [
    { key: 'upper', pivot: { x: 0, y: 0 }, childOffset: { x: 10, y: 0 }, restAngleDeg: 0 },
    { key: 'fore', pivot: { x: 0, y: 0 }, childOffset: { x: 5, y: 0 }, restAngleDeg: 0, gripPoint: { x: 5, y: 0 } },
  ],
};

const near = (a, b) => Math.abs(a - b) < 1e-6;

describe('armRig forward kinematics', () => {
  it('places segments along the chain at rest', () => {
    const [upper, fore] = solveArm(arm, [0, 0]);
    expect(upper.jointX).toBe(0);
    expect(upper.jointY).toBe(0);
    expect(near(fore.jointX, 10)).toBe(true);
    expect(near(fore.jointY, 0)).toBe(true);
    expect(gripWorld(arm, [0, 0]).x).toBeCloseTo(15, 6);
  });

  it('rotates the chain about the shoulder', () => {
    const [, fore] = solveArm(arm, [90, 0]); // upper rotates +90°
    expect(near(fore.jointX, 0)).toBe(true);
    expect(near(fore.jointY, 10)).toBe(true);
    expect(gripWorld(arm, [90, 0]).y).toBeCloseTo(15, 6);
  });

  it('accumulates child rotation', () => {
    const grip = gripWorld(arm, [0, 90]); // fore bends +90° at the elbow
    expect(grip.x).toBeCloseTo(10, 6);
    expect(grip.y).toBeCloseTo(5, 6);
  });

  it('mirror flips the X advance', () => {
    const [, fore] = solveArm({ ...arm, mirror: true }, [0, 0]);
    expect(near(fore.jointX, -10)).toBe(true);
  });

  it('missing angles fall back to rest without throwing', () => {
    expect(() => solveArm(arm, [])).not.toThrow();
    expect(solveArm(arm, [])[1].jointX).toBeCloseTo(10, 6);
  });
});
