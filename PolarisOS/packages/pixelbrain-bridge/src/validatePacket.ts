import {
  MAX_CANVAS_DIMENSION,
  MAX_CELL_SIZE,
  MAX_PACKET_BYTES,
  MAX_PRIMITIVES,
  MAX_RASTER_BYTES,
  MAX_RASTER_WRITES,
  PIXELBRAIN_PACKET_VERSION,
  type PixelBrainDiagnostic,
} from "./contracts.js";
import { createDiagnostic } from "./diagnostics.js";

const UTF8 = new TextEncoder();
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/;
const CONTENT_HASH_PATTERN = /^pb1:[0-9a-f]{64}$/;
const AUTHORITY_FIELDS = new Set([
  "worldX",
  "worldY",
  "position",
  "zIndex",
  "visible",
  "hotspot",
  "interactionRegion",
  "command",
  "lightingState",
  "roomId",
  "entityId",
]);

export interface ValidatedPixelBrainCoordinate {
  snappedX: number;
  snappedY: number;
  z: number;
  color: string;
  alpha: number;
  sourcePrimitiveIndex: number;
}

export interface ValidatedPixelBrainPacket {
  packetId: string;
  packetVersion: typeof PIXELBRAIN_PACKET_VERSION;
  schemaVersion: 1;
  width: number;
  height: number;
  cellSize: number;
  transparent: boolean;
  background: string;
  coordinates: readonly ValidatedPixelBrainCoordinate[];
  suppliedContentHash?: `pb1:${string}`;
}

export type PacketValidationResult =
  | {
      ok: true;
      packet: ValidatedPixelBrainPacket;
      diagnostics: PixelBrainDiagnostic[];
    }
  | {
      ok: false;
      diagnostics: PixelBrainDiagnostic[];
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function error(
  code: Parameters<typeof createDiagnostic>[0],
  detail: string,
  packetId?: string,
  path?: string,
): PacketValidationResult {
  return {
    ok: false,
    diagnostics: [
      createDiagnostic(code, "ERROR", {
        detail,
        ...(packetId === undefined ? {} : { packetId }),
        ...(path === undefined ? {} : { path }),
      }),
    ],
  };
}

function forbiddenField(record: Record<string, unknown>): string | undefined {
  return Object.keys(record).find((key) => AUTHORITY_FIELDS.has(key));
}

function encodedPacketSize(input: unknown): number | null {
  try {
    const encoded = JSON.stringify(input);
    return encoded === undefined ? null : UTF8.encode(encoded).length;
  } catch {
    return null;
  }
}

function isDimension(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && (value as number) >= 1
    && (value as number) <= MAX_CANVAS_DIMENSION;
}

export function validatePixelBrainPacket(
  input: unknown,
): PacketValidationResult {
  if (!isRecord(input)) {
    return error("PACKET_SCHEMA_INVALID", "Packet must be a plain object");
  }

  const packetId = typeof input.id === "string" ? input.id.trim() : undefined;
  const encodedBytes = encodedPacketSize(input);
  if (encodedBytes === null) {
    return error(
      "PACKET_SCHEMA_INVALID",
      "Packet must be JSON-encodable",
      packetId,
    );
  }
  if (encodedBytes > MAX_PACKET_BYTES) {
    return error(
      "RASTER_LIMIT_EXCEEDED",
      `Encoded packet is ${encodedBytes} bytes; maximum is ${MAX_PACKET_BYTES}`,
      packetId,
    );
  }

  if (input.kind !== PIXELBRAIN_PACKET_VERSION) {
    return error(
      "UNSUPPORTED_PACKET_VERSION",
      `Expected ${PIXELBRAIN_PACKET_VERSION}`,
      packetId,
      "kind",
    );
  }
  if (input.schemaVersion !== 1) {
    return error(
      "UNSUPPORTED_PACKET_VERSION",
      "Expected schemaVersion 1",
      packetId,
      "schemaVersion",
    );
  }
  if (!packetId) {
    return error(
      "PACKET_SCHEMA_INVALID",
      "Packet id must be a non-empty string",
      undefined,
      "id",
    );
  }

  const rootAuthorityField = forbiddenField(input);
  if (rootAuthorityField !== undefined) {
    return error(
      "PACKET_SCHEMA_INVALID",
      `PixelBrain cannot claim Polaris authority field ${rootAuthorityField}`,
      packetId,
      rootAuthorityField,
    );
  }

  if (!isRecord(input.canvas)) {
    return error(
      "PACKET_SCHEMA_INVALID",
      "canvas must be an object",
      packetId,
      "canvas",
    );
  }
  const canvas = input.canvas;
  if (!isDimension(canvas.width) || !isDimension(canvas.height)) {
    return error(
      "INVALID_CANVAS_DIMENSIONS",
      `Canvas width and height must be safe integers in [1, ${MAX_CANVAS_DIMENSION}]`,
      packetId,
      "canvas",
    );
  }
  if (
    !Number.isSafeInteger(canvas.cellSize)
    || (canvas.cellSize as number) < 1
    || (canvas.cellSize as number) > MAX_CELL_SIZE
  ) {
    return error(
      "INVALID_CELL_SIZE",
      `cellSize must be a safe integer in [1, ${MAX_CELL_SIZE}]`,
      packetId,
      "canvas.cellSize",
    );
  }
  if (typeof canvas.transparent !== "boolean") {
    return error(
      "PACKET_SCHEMA_INVALID",
      "canvas.transparent must be boolean",
      packetId,
      "canvas.transparent",
    );
  }
  if (
    typeof canvas.background !== "string"
    || !COLOR_PATTERN.test(canvas.background)
  ) {
    return error(
      "COLOR_INVALID",
      "canvas.background must be #RRGGBB or #RRGGBBAA",
      packetId,
      "canvas.background",
    );
  }

  const rasterBytes = canvas.width * canvas.height * 4;
  if (
    !Number.isSafeInteger(rasterBytes)
    || rasterBytes > MAX_RASTER_BYTES
  ) {
    return error(
      "RASTER_LIMIT_EXCEEDED",
      `Raster requires ${rasterBytes} bytes; maximum is ${MAX_RASTER_BYTES}`,
      packetId,
      "canvas",
    );
  }

  if (!Array.isArray(input.coordinates)) {
    return error(
      "PACKET_SCHEMA_INVALID",
      "coordinates must be an array",
      packetId,
      "coordinates",
    );
  }
  if (input.coordinates.length > MAX_PRIMITIVES) {
    return error(
      "RASTER_LIMIT_EXCEEDED",
      `Packet has ${input.coordinates.length} primitives; maximum is ${MAX_PRIMITIVES}`,
      packetId,
      "coordinates",
    );
  }

  if (
    input.contentHash !== undefined
    && (
      typeof input.contentHash !== "string"
      || !CONTENT_HASH_PATTERN.test(input.contentHash)
    )
  ) {
    return error(
      "PACKET_HASH_MISMATCH",
      "contentHash must use pb1 followed by 64 lowercase hexadecimal digits",
      packetId,
      "contentHash",
    );
  }

  const diagnostics: PixelBrainDiagnostic[] = [];
  const coordinates: ValidatedPixelBrainCoordinate[] = [];
  let rasterWrites = 0;
  const cellSize = canvas.cellSize as number;

  for (let index = 0; index < input.coordinates.length; index += 1) {
    const path = `coordinates[${index}]`;
    const coordinate = input.coordinates[index];
    if (!isRecord(coordinate)) {
      return error(
        "PACKET_SCHEMA_INVALID",
        "Coordinate must be an object",
        packetId,
        path,
      );
    }

    const coordinateAuthorityField = forbiddenField(coordinate);
    if (coordinateAuthorityField !== undefined) {
      return error(
        "PACKET_SCHEMA_INVALID",
        `PixelBrain cannot claim Polaris authority field ${coordinateAuthorityField}`,
        packetId,
        `${path}.${coordinateAuthorityField}`,
      );
    }

    const x = coordinate.snappedX;
    const y = coordinate.snappedY;
    const z = coordinate.z ?? 0;
    if (
      !Number.isSafeInteger(x)
      || !Number.isSafeInteger(y)
      || !Number.isSafeInteger(z)
      || !Number.isSafeInteger((x as number) + cellSize)
      || !Number.isSafeInteger((y as number) + cellSize)
    ) {
      return error(
        "COORDINATE_OUT_OF_RANGE",
        "snappedX, snappedY, and z must be finite safe integers",
        packetId,
        path,
      );
    }
    if ((x as number) % cellSize !== 0) {
      return error(
        "INVALID_GRID_ALIGNMENT",
        `${x} is not aligned to cellSize ${cellSize}`,
        packetId,
        `${path}.snappedX`,
      );
    }
    if ((y as number) % cellSize !== 0) {
      return error(
        "INVALID_GRID_ALIGNMENT",
        `${y} is not aligned to cellSize ${cellSize}`,
        packetId,
        `${path}.snappedY`,
      );
    }

    if (
      typeof coordinate.color !== "string"
      || !COLOR_PATTERN.test(coordinate.color)
    ) {
      return error(
        "COLOR_INVALID",
        "color must be #RRGGBB or #RRGGBBAA",
        packetId,
        `${path}.color`,
      );
    }
    const alpha = coordinate.alpha ?? 1;
    if (
      typeof alpha !== "number"
      || !Number.isFinite(alpha)
      || alpha < 0
      || alpha > 1
    ) {
      return error(
        "COLOR_INVALID",
        "alpha must be a finite number in [0, 1]",
        packetId,
        `${path}.alpha`,
      );
    }

    const endX = (x as number) + cellSize;
    const endY = (y as number) + cellSize;
    const clippedLeft = Math.max(0, x as number);
    const clippedTop = Math.max(0, y as number);
    const clippedRight = Math.min(canvas.width, endX);
    const clippedBottom = Math.min(canvas.height, endY);
    const clippedWidth = clippedRight - clippedLeft;
    const clippedHeight = clippedBottom - clippedTop;

    if (clippedWidth <= 0 || clippedHeight <= 0) {
      return error(
        "COORDINATE_OUT_OF_RANGE",
        "Cell rectangle is completely outside the packet canvas",
        packetId,
        path,
      );
    }
    if (
      clippedLeft !== x
      || clippedTop !== y
      || clippedRight !== endX
      || clippedBottom !== endY
    ) {
      diagnostics.push(createDiagnostic(
        "COORDINATE_OUT_OF_RANGE",
        "WARNING",
        {
          packetId,
          path,
          detail: "Cell rectangle was clipped to the packet canvas",
        },
      ));
    }

    rasterWrites += clippedWidth * clippedHeight;
    if (rasterWrites > MAX_RASTER_WRITES) {
      return error(
        "RASTER_WORK_LIMIT_EXCEEDED",
        `Packet requires more than ${MAX_RASTER_WRITES} physical pixel writes`,
        packetId,
        "coordinates",
      );
    }

    coordinates.push({
      snappedX: x as number,
      snappedY: y as number,
      z: z as number,
      color: coordinate.color,
      alpha,
      sourcePrimitiveIndex: index,
    });
  }

  return {
    ok: true,
    packet: {
      packetId,
      packetVersion: PIXELBRAIN_PACKET_VERSION,
      schemaVersion: 1,
      width: canvas.width,
      height: canvas.height,
      cellSize,
      transparent: canvas.transparent,
      background: canvas.background,
      coordinates,
      ...(typeof input.contentHash === "string"
        ? { suppliedContentHash: input.contentHash as `pb1:${string}` }
        : {}),
    },
    diagnostics,
  };
}
