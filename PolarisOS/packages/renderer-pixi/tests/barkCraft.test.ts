import { describe, test, expect } from "vitest";
import { generateCylindricalBarkSteps } from "../src/scenePlan.js";

describe("Authored Bark Craft", () => {
  test("computes discrete cylindrical value steps across u [-1, 1]", () => {
    const centerStep = generateCylindricalBarkSteps(0.0, 1.0);
    const edgeStep = generateCylindricalBarkSteps(0.95, 1.0);
    expect(centerStep).toBeGreaterThan(edgeStep);
    expect([0, 1, 2, 3]).toContain(centerStep);
  });
});
