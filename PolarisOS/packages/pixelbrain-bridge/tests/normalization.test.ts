import { describe, expect, it } from "vitest";
import {
  MAX_RASTER_WRITES,
  normalizePixelBrainPacket,
} from "@polaris/pixelbrain-bridge";
import { validPacket, withCoordinate } from "./fixtures.js";

function expectSuccess(input: unknown) {
  const result = normalizePixelBrainPacket(input);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.diagnostics[0]?.detail);
  return result;
}

describe("PixelBrain packet normalization", () => {
  it("multiplies embedded and explicit alpha", () => {
    const result = expectSuccess(validPacket());
    expect(result.packet.cells[0]?.rgba).toEqual([255, 0, 0, 64]);
  });

  it("normalizes six-digit colors to opaque RGBA", () => {
    const result = expectSuccess(withCoordinate({ color: "#aBcDeF" }));
    expect(result.packet.cells[0]?.rgba).toEqual([171, 205, 239, 255]);
  });

  it("sorts canonical cells independent of input order", () => {
    const cells = [
      { snappedX: 2, snappedY: 2, z: 0, color: "#00ff00" },
      { snappedX: 0, snappedY: 0, z: 1, color: "#0000ff" },
      { snappedX: 0, snappedY: 0, z: 0, color: "#ff0000" },
    ];
    const first = expectSuccess(validPacket({ coordinates: cells }));
    const second = expectSuccess(validPacket({
      coordinates: [...cells].reverse(),
    }));

    expect(first.packet.cells.map(({ x, y, z }) => [x, y, z])).toEqual([
      [0, 0, 0],
      [0, 0, 1],
      [2, 2, 0],
    ]);
    expect(first.packet.packetContentHash).toBe(
      second.packet.packetContentHash,
    );
  });

  it("coalesces exact duplicate writes", () => {
    const cell = {
      snappedX: 0,
      snappedY: 0,
      z: 0,
      color: "#ff0000",
    };
    const result = expectSuccess(validPacket({
      coordinates: [cell, { ...cell }],
    }));
    expect(result.packet.cells).toHaveLength(1);
  });

  it("rejects conflicting writes at equal origin and z", () => {
    const result = normalizePixelBrainPacket(validPacket({
      coordinates: [
        { snappedX: 0, snappedY: 0, z: 0, color: "#ff0000" },
        { snappedX: 0, snappedY: 0, z: 0, color: "#0000ff" },
      ],
    }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]?.code).toBe("PACKET_SCHEMA_INVALID");
  });

  it("preserves higher-z writes at the same origin", () => {
    const result = expectSuccess(validPacket({
      coordinates: [
        { snappedX: 0, snappedY: 0, z: 1, color: "#0000ff" },
        { snappedX: 0, snappedY: 0, z: 0, color: "#ff0000" },
      ],
    }));
    expect(result.packet.cells.map(({ z }) => z)).toEqual([0, 1]);
  });

  it("excludes packetId from pure content identity", () => {
    const first = expectSuccess(validPacket({ id: "lantern-readable" }));
    const second = expectSuccess(validPacket({ id: "renamed-lantern" }));
    expect(first.packet.packetContentHash).toBe(
      second.packet.packetContentHash,
    );
  });

  it("accepts a matching supplied content hash", () => {
    const first = expectSuccess(validPacket());
    const second = expectSuccess(validPacket({
      contentHash: first.packet.packetContentHash,
    }));
    expect(second.packet.packetContentHash).toBe(
      first.packet.packetContentHash,
    );
  });

  it("rejects a supplied content hash mismatch", () => {
    const result = normalizePixelBrainPacket(validPacket({
      contentHash: `pb1:${"0".repeat(64)}`,
    }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]?.code).toBe("PACKET_HASH_MISMATCH");
  });

  it("accounts clipped physical writes before duplicate coalescing", () => {
    const cell = {
      snappedX: 0,
      snappedY: 0,
      z: 0,
      color: "#ffffff",
    };
    const count = Math.floor(MAX_RASTER_WRITES / (64 * 64)) + 1;
    const result = normalizePixelBrainPacket(validPacket({
      canvas: {
        width: 64,
        height: 64,
        cellSize: 64,
        transparent: true,
        background: "#00000000",
      },
      coordinates: Array.from({ length: count }, () => ({ ...cell })),
    }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]?.code).toBe(
      "RASTER_WORK_LIMIT_EXCEEDED",
    );
  });
});
