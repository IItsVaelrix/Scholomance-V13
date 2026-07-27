import type {
  NormalizedPixelBrainPacket,
  PixelBrainBridgeResult,
  PixelBrainDiagnostic,
  PixelBrainRaster,
} from "./contracts.js";
import { createDiagnostic } from "./diagnostics.js";
import { computeRasterHash } from "./hash.js";
import { normalizePixelBrainPacket } from "./normalizePacket.js";

function fillBackground(
  rgba: Uint8Array,
  background: readonly [number, number, number, number],
): void {
  for (let offset = 0; offset < rgba.length; offset += 4) {
    rgba[offset] = background[0];
    rgba[offset + 1] = background[1];
    rgba[offset + 2] = background[2];
    rgba[offset + 3] = background[3];
  }
}

export function rasterizeNormalizedPacket(
  packet: NormalizedPixelBrainPacket,
  diagnostics: readonly PixelBrainDiagnostic[] = [],
): PixelBrainRaster {
  const rgba = new Uint8Array(packet.width * packet.height * 4);
  if (!packet.transparent) {
    fillBackground(rgba, packet.background);
  }

  for (const cell of packet.cells) {
    const left = Math.max(0, cell.x);
    const top = Math.max(0, cell.y);
    const right = Math.min(packet.width, cell.x + packet.cellSize);
    const bottom = Math.min(packet.height, cell.y + packet.cellSize);

    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const offset = (y * packet.width + x) * 4;
        rgba[offset] = cell.rgba[0];
        rgba[offset + 1] = cell.rgba[1];
        rgba[offset + 2] = cell.rgba[2];
        rgba[offset + 3] = cell.rgba[3];
      }
    }
  }

  return {
    packetId: packet.packetId,
    packetVersion: packet.packetVersion,
    packetContentHash: packet.packetContentHash,
    width: packet.width,
    height: packet.height,
    rgba,
    rasterHash: computeRasterHash(packet.width, packet.height, rgba),
    diagnostics: [...diagnostics],
  };
}

export function processPixelBrainPacket(
  input: unknown,
): PixelBrainBridgeResult {
  const normalization = normalizePixelBrainPacket(input);
  if (!normalization.ok) return normalization;

  try {
    const raster = rasterizeNormalizedPacket(
      normalization.packet,
      normalization.diagnostics,
    );
    return {
      ok: true,
      packet: normalization.packet,
      raster,
      diagnostics: normalization.diagnostics,
    };
  } catch (cause) {
    return {
      ok: false,
      diagnostics: [
        ...normalization.diagnostics,
        createDiagnostic("RASTERIZATION_FAILED", "ERROR", {
          packetId: normalization.packet.packetId,
          detail: cause instanceof Error
            ? cause.message
            : "Unexpected rasterization failure",
        }),
      ],
    };
  }
}
