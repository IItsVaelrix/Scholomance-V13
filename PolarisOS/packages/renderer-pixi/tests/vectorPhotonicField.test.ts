import { describe, test, expect } from "vitest";

function evaluateVectorEmissionField(px: number, py: number, pathPoint: { x: number; y: number }, role: string): number {
  if (!role.includes("torii") && !role.includes("moon") && !role.includes("lantern") && !role.includes("book") && !role.includes("rune")) {
    return 0;
  }
  const dx = px - pathPoint.x;
  const dy = py - pathPoint.y;
  const distSq = dx * dx + dy * dy;
  const radiusSq = 35 * 35;
  return Math.exp(-distSq / radiusSq) * 35;
}

describe("Vector Photonic Emission Field", () => {
  test("computes radial falloff from vector light source", () => {
    const light = evaluateVectorEmissionField(10, 10, { x: 10, y: 10 }, "scholomance.book_pages");
    const dark = evaluateVectorEmissionField(100, 100, { x: 10, y: 10 }, "scholomance.book_pages");
    expect(light).toBeGreaterThan(dark);
    expect(light).toBeCloseTo(35);
  });
});
