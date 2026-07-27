export {
  MAX_CANVAS_DIMENSION,
  MAX_CELL_SIZE,
  MAX_PACKET_BYTES,
  MAX_PRIMITIVES,
  MAX_RASTER_BYTES,
  MAX_RASTER_WRITES,
  PIXELBRAIN_PACKET_VERSION,
} from "./contracts.js";
export type {
  NormalizedPixelBrainPacket,
  NormalizedPixelCell,
  PixelBrainBridgeResult,
  PixelBrainDiagnostic,
  PixelBrainDiagnosticCode,
  PixelBrainDiagnosticSeverity,
  PixelBrainRaster,
} from "./contracts.js";

export {
  canonicalJson,
  computePacketContentHash,
  computePngRevision,
  computeRasterHash,
  computeRenderHash,
  sha256Bytes,
  sha256Hex,
} from "./hash.js";

export {
  createDiagnostic,
  verifyDiagnosticChecksum,
} from "./diagnostics.js";

export {
  validatePixelBrainPacket,
} from "./validatePacket.js";
export type {
  PacketValidationResult,
  ValidatedPixelBrainCoordinate,
  ValidatedPixelBrainPacket,
} from "./validatePacket.js";

export {
  normalizePixelBrainPacket,
  parsePixelColor,
  toHexRgba,
} from "./normalizePacket.js";
export type {
  PixelBrainNormalizationResult,
} from "./normalizePacket.js";
