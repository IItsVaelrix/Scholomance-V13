import type {
  PixelBrainDiagnostic,
  PixelBrainDiagnosticCode,
  PixelBrainDiagnosticSeverity,
} from "./contracts.js";

interface DiagnosticWireCode {
  category: "VALUE" | "RANGE" | "COORD" | "COLOR" | "RENDER";
  module: "IMGPIX";
  errorCode: string;
}

const WIRE_CODES: Record<PixelBrainDiagnosticCode, DiagnosticWireCode> = {
  PACKET_SCHEMA_INVALID: {
    category: "VALUE", module: "IMGPIX", errorCode: "0102",
  },
  UNSUPPORTED_PACKET_VERSION: {
    category: "VALUE", module: "IMGPIX", errorCode: "0101",
  },
  INVALID_CANVAS_DIMENSIONS: {
    category: "RANGE", module: "IMGPIX", errorCode: "0201",
  },
  INVALID_CELL_SIZE: {
    category: "RANGE", module: "IMGPIX", errorCode: "0202",
  },
  INVALID_GRID_ALIGNMENT: {
    category: "COORD", module: "IMGPIX", errorCode: "0601",
  },
  COORDINATE_OUT_OF_RANGE: {
    category: "COORD", module: "IMGPIX", errorCode: "0602",
  },
  COLOR_INVALID: {
    category: "COLOR", module: "IMGPIX", errorCode: "0701",
  },
  PACKET_HASH_MISMATCH: {
    category: "VALUE", module: "IMGPIX", errorCode: "0104",
  },
  RASTER_LIMIT_EXCEEDED: {
    category: "RANGE", module: "IMGPIX", errorCode: "0202",
  },
  RASTER_WORK_LIMIT_EXCEEDED: {
    category: "RENDER", module: "IMGPIX", errorCode: "0903",
  },
  RENDERER_RESOURCE_LIMIT_EXCEEDED: {
    category: "RENDER", module: "IMGPIX", errorCode: "0904",
  },
  RASTERIZATION_FAILED: {
    category: "RENDER", module: "IMGPIX", errorCode: "0902",
  },
};

const BASE64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let result = "";
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const first = bytes[offset]!;
    const second = bytes[offset + 1];
    const third = bytes[offset + 2];
    const combined = (
      (first << 16) | ((second ?? 0) << 8) | (third ?? 0)
    ) >>> 0;
    result += BASE64[(combined >>> 18) & 63];
    result += BASE64[(combined >>> 12) & 63];
    result += second === undefined ? "=" : BASE64[(combined >>> 6) & 63];
    result += third === undefined ? "=" : BASE64[combined & 63];
  }
  return result;
}

function fnv1a32Hex(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

export function createDiagnostic(
  code: PixelBrainDiagnosticCode,
  severity: PixelBrainDiagnosticSeverity,
  context: { packetId?: string; path?: string; detail: string },
): PixelBrainDiagnostic {
  const wire = WIRE_CODES[code];
  const wireSeverity = severity === "ERROR" ? "CRIT" : "WARN";
  const encodedContext = encodeBase64Utf8(JSON.stringify({
    code,
    detail: context.detail,
    ...(context.packetId === undefined ? {} : { packetId: context.packetId }),
    ...(context.path === undefined ? {} : { path: context.path }),
  }));
  const partial = [
    "PB-ERR-v1",
    wire.category,
    wireSeverity,
    wire.module,
    wire.errorCode,
    encodedContext,
  ].join("-");

  return {
    protocol: "PB-ERR-v1",
    bytecode: `${partial}-${fnv1a32Hex(partial)}`,
    code,
    severity,
    ...(context.packetId === undefined ? {} : { packetId: context.packetId }),
    ...(context.path === undefined ? {} : { path: context.path }),
    detail: context.detail,
  };
}

export function verifyDiagnosticChecksum(bytecode: string): boolean {
  const separator = bytecode.lastIndexOf("-");
  if (separator < 0) return false;
  const partial = bytecode.slice(0, separator);
  const checksum = bytecode.slice(separator + 1);
  return /^[0-9A-F]{8}$/.test(checksum)
    && fnv1a32Hex(partial) === checksum;
}
