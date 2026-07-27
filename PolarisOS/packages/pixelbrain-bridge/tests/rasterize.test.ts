import { describe, expect, it } from "vitest";
import {
  processPixelBrainPacket,
  type PixelBrainBridgeResult,
} from "@polaris/pixelbrain-bridge";
import { validPacket } from "./fixtures.js";

function raster(input: unknown) {
  const result = processPixelBrainPacket(input);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.diagnostics[0]?.detail);
  return result.raster;
}

function pixelAt(
  result: PixelBrainBridgeResult,
  x: number,
  y: number,
): number[] {
  if (!result.ok) throw new Error(result.diagnostics[0]?.detail);
  const offset = (y * result.raster.width + x) * 4;
  return [...result.raster.rgba.slice(offset, offset + 4)];
}

describe("deterministic PixelBrain rasterization", () => {
  it("writes cellSize rectangles and leaves transparent pixels zeroed", () => {
    const result = raster(validPacket({
      canvas: {
        width: 4,
        height: 2,
        cellSize: 2,
        transparent: true,
        background: "#ffffffff",
      },
      coordinates: [{
        snappedX: 0,
        snappedY: 0,
        color: "#ff000080",
      }],
    }));

    expect([...result.rgba]).toEqual([
      255, 0, 0, 128, 255, 0, 0, 128, 0, 0, 0, 0, 0, 0, 0, 0,
      255, 0, 0, 128, 255, 0, 0, 128, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });

  it("higher z replaces RGBA without alpha blending", () => {
    const result = processPixelBrainPacket(validPacket({
      coordinates: [
        { snappedX: 0, snappedY: 0, z: 0, color: "#ff000080" },
        { snappedX: 0, snappedY: 0, z: 1, color: "#0000ff40" },
      ],
    }));

    expect(pixelAt(result, 0, 0)).toEqual([0, 0, 255, 64]);
  });

  it("initializes non-transparent canvases from the straight-RGBA background", () => {
    const result = raster(validPacket({
      canvas: {
        width: 2,
        height: 2,
        cellSize: 1,
        transparent: false,
        background: "#12345678",
      },
      coordinates: [],
    }));

    expect([...result.rgba]).toEqual([
      18, 52, 86, 120,
      18, 52, 86, 120,
      18, 52, 86, 120,
      18, 52, 86, 120,
    ]);
  });

  it("clips the half-open rectangle exactly at right and bottom edges", () => {
    const result = raster(validPacket({
      canvas: {
        width: 3,
        height: 3,
        cellSize: 2,
        transparent: true,
        background: "#00000000",
      },
      coordinates: [{
        snappedX: 2,
        snappedY: 2,
        color: "#abcdef",
      }],
    }));

    expect([...result.rgba]).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 171, 205, 239, 255,
    ]);
    expect(result.diagnostics.map(({ severity }) => severity)).toContain(
      "WARNING",
    );
  });

  it("produces byte-identical output for repeated and reordered packets", () => {
    const coordinates = [
      { snappedX: 0, snappedY: 0, z: 0, color: "#ff0000" },
      { snappedX: 2, snappedY: 0, z: 0, color: "#00ff00" },
    ];
    const first = raster(validPacket({ coordinates }));
    const repeated = raster(validPacket({ coordinates }));
    const reordered = raster(validPacket({
      coordinates: [...coordinates].reverse(),
    }));

    expect(first.rgba).toEqual(repeated.rgba);
    expect(first.rgba).toEqual(reordered.rgba);
    expect(first.rasterHash).toBe(reordered.rasterHash);
  });

  it("does not include packetId in raster identity", () => {
    const first = raster(validPacket({ id: "lantern" }));
    const renamed = raster(validPacket({ id: "renamed-lantern" }));
    expect(first.rasterHash).toBe(renamed.rasterHash);
  });

  it("changes raster identity whenever output bytes change", () => {
    const first = raster(validPacket({
      coordinates: [{
        snappedX: 0,
        snappedY: 0,
        color: "#00000000",
      }],
    }));
    const second = raster(validPacket({
      coordinates: [{
        snappedX: 0,
        snappedY: 0,
        color: "#00000001",
      }],
    }));
    expect(first.rasterHash).not.toBe(second.rasterHash);
  });

  it("returns validation diagnostics instead of throwing", () => {
    const result = processPixelBrainPacket(validPacket({
      coordinates: [{
        snappedX: 1,
        snappedY: 0,
        color: "#ffffff",
      }],
    }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]?.code).toBe("INVALID_GRID_ALIGNMENT");
  });
});
