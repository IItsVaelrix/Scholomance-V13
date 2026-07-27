import { describe, expect, it } from "vitest";
import {
  MAX_PACKET_BYTES,
  MAX_PRIMITIVES,
  validatePixelBrainPacket,
} from "@polaris/pixelbrain-bridge";
import { validPacket, withCoordinate } from "./fixtures.js";

function firstCode(input: unknown): string | undefined {
  const result = validatePixelBrainPacket(input);
  return result.ok ? undefined : result.diagnostics[0]?.code;
}

describe("PixelBrain packet validation", () => {
  it("accepts a valid pixelbrain.render.v1 packet", () => {
    expect(validatePixelBrainPacket(validPacket()).ok).toBe(true);
  });

  it("rejects unsupported versions", () => {
    expect(firstCode(validPacket({ kind: "pixelbrain.render.v2" }))).toBe(
      "UNSUPPORTED_PACKET_VERSION",
    );
  });

  it("rejects non-integer and unsafe coordinates", () => {
    expect(firstCode(withCoordinate({ snappedX: 0.5 }))).toBe(
      "COORDINATE_OUT_OF_RANGE",
    );
    expect(firstCode(withCoordinate({
      snappedX: Number.MAX_SAFE_INTEGER + 1,
    }))).toBe("COORDINATE_OUT_OF_RANGE");
  });

  it("enforces grid alignment", () => {
    expect(firstCode(withCoordinate({ snappedX: 1 }))).toBe(
      "INVALID_GRID_ALIGNMENT",
    );
    expect(firstCode(withCoordinate({ snappedY: 3 }))).toBe(
      "INVALID_GRID_ALIGNMENT",
    );
  });

  it("rejects invalid color encodings and alpha", () => {
    expect(firstCode(withCoordinate({ color: "red" }))).toBe("COLOR_INVALID");
    expect(firstCode(withCoordinate({ color: "#abcd" }))).toBe(
      "COLOR_INVALID",
    );
    expect(firstCode(withCoordinate({ alpha: 1.01 }))).toBe("COLOR_INVALID");
  });

  it("rejects invalid canvas dimensions and cell size", () => {
    expect(firstCode(validPacket({
      canvas: {
        width: 0,
        height: 8,
        cellSize: 2,
        transparent: true,
        background: "#00000000",
      },
    }))).toBe("INVALID_CANVAS_DIMENSIONS");
    expect(firstCode(validPacket({
      canvas: {
        width: 8,
        height: 8,
        cellSize: 65,
        transparent: true,
        background: "#00000000",
      },
    }))).toBe("INVALID_CELL_SIZE");
  });

  it.each([
    ["worldX", 4],
    ["worldY", 4],
    ["position", { x: 4, y: 4 }],
    ["zIndex", 99],
    ["visible", true],
    ["hotspot", {}],
    ["interactionRegion", {}],
    ["command", "take lantern"],
    ["lightingState", "lit"],
    ["roomId", "shrine"],
    ["entityId", "lantern"],
  ])("rejects packet-level world-authority field %s", (field, value) => {
    expect(firstCode(validPacket({ [field]: value }))).toBe(
      "PACKET_SCHEMA_INVALID",
    );
  });

  it("rejects coordinate-level world authority", () => {
    expect(firstCode(withCoordinate({ command: "take lantern" }))).toBe(
      "PACKET_SCHEMA_INVALID",
    );
  });

  it("rejects packets above the encoded byte budget", () => {
    expect(firstCode(validPacket({
      metadata: "x".repeat(MAX_PACKET_BYTES),
    }))).toBe("RASTER_LIMIT_EXCEEDED");
  });

  it("rejects packets above the primitive budget", () => {
    const coordinates = new Array(MAX_PRIMITIVES + 1);
    expect(firstCode(validPacket({ coordinates }))).toBe(
      "RASTER_LIMIT_EXCEEDED",
    );
  });

  it("rejects completely out-of-canvas rectangles", () => {
    expect(firstCode(withCoordinate({ snappedX: 8 }))).toBe(
      "COORDINATE_OUT_OF_RANGE",
    );
  });

  it("allows clipping while returning a warning", () => {
    const result = validatePixelBrainPacket(validPacket({
      canvas: {
        width: 7,
        height: 8,
        cellSize: 2,
        transparent: true,
        background: "#00000000",
      },
      coordinates: [{
        snappedX: 6,
        snappedY: 0,
        color: "#ffffff",
      }],
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      "COORDINATE_OUT_OF_RANGE",
    );
  });
});
