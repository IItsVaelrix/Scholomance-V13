import { describe, test, expect } from "vitest";
import { canAttachRoles, SemanticRole } from "../src/SceneCompiler.js";

describe("Bounded Fusion Masks", () => {
  test("prevents sky vectors from attaching to canopy contours", () => {
    const skyRole = SemanticRole.SKY;
    const canopyRole = SemanticRole.CANOPY;
    expect(canAttachRoles(skyRole, canopyRole)).toBe(false);
  });

  test("allows trunk to attach to ground", () => {
    const trunkRole = SemanticRole.TRUNK;
    const groundRole = SemanticRole.GROUND;
    expect(canAttachRoles(trunkRole, groundRole)).toBe(true);
  });
});
