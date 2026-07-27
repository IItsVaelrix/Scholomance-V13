import type {
  NormalizedPixelBrainPacket,
  NormalizedPixelCell,
  PixelBrainDiagnostic,
} from "./contracts.js";
import { createDiagnostic } from "./diagnostics.js";
import { computePacketContentHash } from "./hash.js";
import {
  validatePixelBrainPacket,
  type PacketValidationResult,
} from "./validatePacket.js";

export type PixelBrainNormalizationResult =
  | {
      ok: true;
      packet: NormalizedPixelBrainPacket;
      diagnostics: PixelBrainDiagnostic[];
    }
  | {
      ok: false;
      diagnostics: PixelBrainDiagnostic[];
    };

export function parsePixelColor(
  color: string,
  alpha = 1,
): readonly [number, number, number, number] {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const embeddedAlpha = color.length === 9
    ? Number.parseInt(color.slice(7, 9), 16)
    : 255;
  return [red, green, blue, Math.round(embeddedAlpha * alpha)];
}

export function toHexRgba(
  rgba: readonly [number, number, number, number],
): string {
  return `#${rgba
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

function compareCells(
  left: NormalizedPixelCell,
  right: NormalizedPixelCell,
): number {
  return left.y - right.y
    || left.x - right.x
    || left.z - right.z
    || left.rgba[0] - right.rgba[0]
    || left.rgba[1] - right.rgba[1]
    || left.rgba[2] - right.rgba[2]
    || left.rgba[3] - right.rgba[3]
    || left.sourcePrimitiveIndex - right.sourcePrimitiveIndex;
}

function sameRgba(
  left: readonly [number, number, number, number],
  right: readonly [number, number, number, number],
): boolean {
  return left.every((channel, index) => channel === right[index]);
}

function validationFailure(
  validation: PacketValidationResult,
): PixelBrainNormalizationResult | null {
  return validation.ok ? null : validation;
}

export function normalizePixelBrainPacket(
  input: unknown,
): PixelBrainNormalizationResult {
  const validation = validatePixelBrainPacket(input);
  const failure = validationFailure(validation);
  if (failure !== null) return failure;
  if (!validation.ok) return validation;

  const { packet } = validation;
  const sorted = packet.coordinates.map((coordinate): NormalizedPixelCell => ({
    x: coordinate.snappedX,
    y: coordinate.snappedY,
    z: coordinate.z,
    rgba: parsePixelColor(coordinate.color, coordinate.alpha),
    sourcePrimitiveIndex: coordinate.sourcePrimitiveIndex,
  })).sort(compareCells);

  const cells: NormalizedPixelCell[] = [];
  for (const cell of sorted) {
    const previous = cells[cells.length - 1];
    if (
      previous !== undefined
      && previous.x === cell.x
      && previous.y === cell.y
      && previous.z === cell.z
    ) {
      if (!sameRgba(previous.rgba, cell.rgba)) {
        return {
          ok: false,
          diagnostics: [
            createDiagnostic("PACKET_SCHEMA_INVALID", "ERROR", {
              packetId: packet.packetId,
              detail: `Conflicting writes at (${cell.x}, ${cell.y}, z=${cell.z})`,
              path: `coordinates[${cell.sourcePrimitiveIndex}]`,
            }),
          ],
        };
      }
      continue;
    }
    cells.push(cell);
  }

  const background = parsePixelColor(packet.background);
  const hashPayload = {
    packetVersion: packet.packetVersion,
    schemaVersion: packet.schemaVersion,
    width: packet.width,
    height: packet.height,
    cellSize: packet.cellSize,
    transparent: packet.transparent,
    background: toHexRgba(background),
    cells: cells.map(({ x, y, z, rgba }) => ({
      x,
      y,
      z,
      rgba: toHexRgba(rgba),
    })),
  };
  const packetContentHash = computePacketContentHash(hashPayload);

  if (
    packet.suppliedContentHash !== undefined
    && packet.suppliedContentHash !== packetContentHash
  ) {
    return {
      ok: false,
      diagnostics: [
        createDiagnostic("PACKET_HASH_MISMATCH", "ERROR", {
          packetId: packet.packetId,
          path: "contentHash",
          detail: `Expected ${packetContentHash} but received ${packet.suppliedContentHash}`,
        }),
      ],
    };
  }

  return {
    ok: true,
    packet: {
      packetId: packet.packetId,
      packetVersion: packet.packetVersion,
      schemaVersion: packet.schemaVersion,
      packetContentHash,
      width: packet.width,
      height: packet.height,
      cellSize: packet.cellSize,
      transparent: packet.transparent,
      background,
      cells,
    },
    diagnostics: validation.diagnostics,
  };
}
