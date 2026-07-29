import { describe, test, expect } from "vitest";

function computeVectorOrientedAngle(tangent: [number, number], baseDirection: number): number {
  const vecAngle = Math.atan2(tangent[1], tangent[0]);
  return vecAngle + baseDirection;
}

describe("Vixel Co-Synthesis Engine", () => {
  test("orients material grain along vector tangent", () => {
    const tangent: [number, number] = [0, 1]; // Vertical tangent
    const angle = computeVectorOrientedAngle(tangent, 0);
    expect(angle).toBeCloseTo(Math.PI / 2);
  });
});
