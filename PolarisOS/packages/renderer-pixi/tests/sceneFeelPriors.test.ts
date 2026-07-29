import { describe, test, expect } from "vitest";
import { assignDepthBand, DepthBand } from "../src/scenePlan.js";

describe("Scene Feel Priors", () => {
  test("maps zIndex to depth bands correctly", () => {
    expect(assignDepthBand(2)).toBe(DepthBand.BACKGROUND);
    expect(assignDepthBand(10)).toBe(DepthBand.FOCAL);
    expect(assignDepthBand(25)).toBe(DepthBand.FOREGROUND);
  });
});
