export const PIXELBRAIN_PACKET_VERSION = "pixelbrain.render.v1" as const;

export const MAX_PACKET_BYTES = 8 * 1024 * 1024;
export const MAX_CANVAS_DIMENSION = 2048;
export const MAX_CELL_SIZE = 64;
export const MAX_PRIMITIVES = 1_000_000;
export const MAX_RASTER_BYTES = 16 * 1024 * 1024;
export const MAX_RASTER_WRITES = 16_777_216;

export type PixelBrainDiagnosticCode =
  | "PACKET_SCHEMA_INVALID"
  | "UNSUPPORTED_PACKET_VERSION"
  | "INVALID_CANVAS_DIMENSIONS"
  | "INVALID_CELL_SIZE"
  | "INVALID_GRID_ALIGNMENT"
  | "COORDINATE_OUT_OF_RANGE"
  | "COLOR_INVALID"
  | "PACKET_HASH_MISMATCH"
  | "RASTER_LIMIT_EXCEEDED"
  | "RASTER_WORK_LIMIT_EXCEEDED"
  | "RENDERER_RESOURCE_LIMIT_EXCEEDED"
  | "RASTERIZATION_FAILED";

export type PixelBrainDiagnosticSeverity = "WARNING" | "ERROR";

export interface PixelBrainDiagnostic {
  protocol: "PB-ERR-v1";
  bytecode: string;
  code: PixelBrainDiagnosticCode;
  severity: PixelBrainDiagnosticSeverity;
  packetId?: string;
  path?: string;
  detail: string;
}

export interface NormalizedPixelCell {
  x: number;
  y: number;
  z: number;
  rgba: readonly [number, number, number, number];
  sourcePrimitiveIndex: number;
}

export interface NormalizedPixelBrainPacket {
  packetId: string;
  packetVersion: typeof PIXELBRAIN_PACKET_VERSION;
  schemaVersion: 1;
  packetContentHash: `pb1:${string}`;
  width: number;
  height: number;
  cellSize: number;
  transparent: boolean;
  background: readonly [number, number, number, number];
  cells: readonly NormalizedPixelCell[];
}

export interface PixelBrainRaster {
  packetId: string;
  packetVersion: typeof PIXELBRAIN_PACKET_VERSION;
  packetContentHash: `pb1:${string}`;
  width: number;
  height: number;
  rgba: Uint8Array;
  rasterHash: `pbr1:${string}`;
  diagnostics: PixelBrainDiagnostic[];
}

export type PixelBrainBridgeResult =
  | {
      ok: true;
      packet: NormalizedPixelBrainPacket;
      raster: PixelBrainRaster;
      diagnostics: PixelBrainDiagnostic[];
    }
  | {
      ok: false;
      diagnostics: PixelBrainDiagnostic[];
    };
