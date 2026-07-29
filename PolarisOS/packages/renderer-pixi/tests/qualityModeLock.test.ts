import { describe, test, expect } from "vitest";
import { validateRenderQualityMode, RenderQualityMode } from "../src/PixiSceneRenderer.js";

describe("Quality Mode Lock", () => {
  test("approves MODE_DENSE_PIXEL_CRAFT and MODE_SPARSE_ICONIC", () => {
    expect(validateRenderQualityMode(RenderQualityMode.DENSE_PIXEL_CRAFT)).toBe(true);
    expect(validateRenderQualityMode(RenderQualityMode.SPARSE_ICONIC)).toBe(true);
  });

  test("rejects invalid mid-fi blob mode", () => {
    expect(validateRenderQualityMode("MID_FI_BLOB" as any)).toBe(false);
  });
});
