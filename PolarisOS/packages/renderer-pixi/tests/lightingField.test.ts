import { describe, test, expect } from "vitest";
import { evaluateSceneLightingField } from "../src/atmospherePlan.js";

describe("Scene Lighting Field", () => {
  test("computes radial falloff revaluation value", () => {
    const lightSource = { x: 400, y: 100, z: 0, intensity: 1.0 };
    const nearValue = evaluateSceneLightingField(400, 150, 0, lightSource);
    const farValue = evaluateSceneLightingField(400, 400, 0, lightSource);
    expect(nearValue).toBeGreaterThan(farValue);
  });
});
