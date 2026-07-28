import {
  MAX_CANVAS_DIMENSION,
  MAX_PACKET_BYTES,
  MAX_RASTER_BYTES,
  computePngRevision,
  createDiagnostic,
  processPixelBrainPacket,
  type PixelBrainDiagnostic,
  type PixelBrainRaster,
} from "@polaris/pixelbrain-bridge";
import type { GlyphSpec } from "./scenePlan.js";

export interface PixelBrainAssetRegistryEntry {
  readonly assetKey: string;
  readonly pixelBrainUrl?: string;
  readonly expectedPacketContentHash?: `pb1:${string}`;
  readonly pngUrl?: string;
  readonly expectedPngHash?: `png1:${string}`;
}

export type PixelBrainAssetRegistry = Readonly<
  Record<string, PixelBrainAssetRegistryEntry>
>;

export interface AssetFallback {
  glyph: GlyphSpec | null;
  accessibleLabel: string;
  textMode?: boolean;
}

interface ResolutionBase {
  diagnostics: readonly PixelBrainDiagnostic[];
}

export type AssetResolution =
  | (ResolutionBase & {
      status: "PIXELBRAIN";
      packetId: string;
      raster: PixelBrainRaster;
    })
  | (ResolutionBase & {
      status: "PNG";
      assetKey: string;
      pngBytes: Uint8Array;
      pngRevision: `png1:${string}`;
      width: number;
      height: number;
    })
  | (ResolutionBase & {
      status: "GLYPH";
      glyph: GlyphSpec;
    })
  | (ResolutionBase & {
      status: "TEXT";
      accessibleLabel: string;
    });

export interface PngDimensions {
  width: number;
  height: number;
}

export interface PixelBrainAssetResolverOptions {
  registry: PixelBrainAssetRegistry;
  fetch?: (url: string) => Promise<Response>;
  decodePngDimensions?: (bytes: Uint8Array) => Promise<PngDimensions>;
  onDiagnostic?: (diagnostic: PixelBrainDiagnostic) => void;
}

function byteLimitError(limit: number): Error {
  return new Error(`Response exceeds byte limit of ${limit}`);
}

export async function readBoundedResponseBytes(
  response: Response,
  limit: number,
): Promise<Uint8Array> {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const size = Number(declared);
    if (!Number.isSafeInteger(size) || size < 0 || size > limit) {
      throw byteLimitError(limit);
    }
  }
  if (response.body === null) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      total += value.length;
      if (total > limit) {
        await reader.cancel("byte limit exceeded");
        throw byteLimitError(limit);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function defaultDecodePngDimensions(bytes: Uint8Array): PngDimensions {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length < 24
    || !signature.every((byte, index) => bytes[index] === byte)
    || String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR"
  ) {
    throw new Error("PNG signature or IHDR chunk is invalid");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16, false),
    height: view.getUint32(20, false),
  };
}

function immutableGeneratedUrl(url: string): boolean {
  return /^\/assets\/generated\/[A-Za-z0-9._-]+$/u.test(url);
}

function packetUrlMatchesHash(
  url: string,
  hash: `pb1:${string}`,
): boolean {
  return url.endsWith(`.pb1-${hash.slice(4)}.pixelbrain.json`);
}

function pngUrlMatchesHash(
  url: string,
  hash: `png1:${string}`,
): boolean {
  return url.endsWith(`.png1-${hash.slice(5)}.png`);
}

export class PixelBrainAssetResolver {
  private readonly registry: PixelBrainAssetRegistry;
  private readonly fetchResponse: (url: string) => Promise<Response>;
  private readonly decodePngDimensions:
    (bytes: Uint8Array) => Promise<PngDimensions>;
  private readonly onDiagnostic:
    ((diagnostic: PixelBrainDiagnostic) => void) | undefined;

  constructor(options: PixelBrainAssetResolverOptions) {
    this.registry = options.registry;
    this.fetchResponse = options.fetch ?? ((url) => globalThis.fetch(url));
    this.decodePngDimensions = options.decodePngDimensions
      ?? (async (bytes) => defaultDecodePngDimensions(bytes));
    this.onDiagnostic = options.onDiagnostic;
  }

  private append(
    diagnostics: PixelBrainDiagnostic[],
    diagnostic: PixelBrainDiagnostic,
  ): void {
    diagnostics.push(diagnostic);
    this.onDiagnostic?.(diagnostic);
  }

  private appendAll(
    diagnostics: PixelBrainDiagnostic[],
    additions: readonly PixelBrainDiagnostic[],
  ): void {
    for (const diagnostic of additions) this.append(diagnostics, diagnostic);
  }

  private warning(
    code: Parameters<typeof createDiagnostic>[0],
    detail: string,
    packetId?: string,
  ): PixelBrainDiagnostic {
    return createDiagnostic(code, "WARNING", {
      detail,
      ...(packetId === undefined ? {} : { packetId }),
    });
  }

  private async tryPixelBrain(
    entry: PixelBrainAssetRegistryEntry,
    diagnostics: PixelBrainDiagnostic[],
  ): Promise<Extract<AssetResolution, { status: "PIXELBRAIN" }> | null> {
    const url = entry.pixelBrainUrl;
    const expected = entry.expectedPacketContentHash;
    if (url === undefined || expected === undefined) return null;
    if (
      !immutableGeneratedUrl(url)
      || !packetUrlMatchesHash(url, expected)
    ) {
      this.append(diagnostics, this.warning(
        "PACKET_SCHEMA_INVALID",
        `Rejected mutable or mismatched PixelBrain registry URL: ${url}`,
      ));
      return null;
    }

    try {
      const response = await this.fetchResponse(url);
      if (!response.ok) {
        this.append(diagnostics, this.warning(
          "PACKET_SCHEMA_INVALID",
          `PixelBrain asset request failed with HTTP ${response.status}`,
        ));
        return null;
      }
      const bytes = await readBoundedResponseBytes(response, MAX_PACKET_BYTES);
      let value: unknown;
      try {
        value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      } catch {
        this.append(diagnostics, this.warning(
          "PACKET_SCHEMA_INVALID",
          "PixelBrain response is not valid UTF-8 JSON",
        ));
        return null;
      }
      const processed = processPixelBrainPacket(value);
      if (!processed.ok) {
        this.appendAll(diagnostics, processed.diagnostics);
        return null;
      }
      if (processed.packet.packetContentHash !== expected) {
        this.append(diagnostics, this.warning(
          "PACKET_HASH_MISMATCH",
          `Expected ${expected} but received ${processed.packet.packetContentHash}`,
          processed.packet.packetId,
        ));
        return null;
      }
      this.appendAll(diagnostics, processed.diagnostics);
      return {
        status: "PIXELBRAIN",
        packetId: processed.packet.packetId,
        raster: processed.raster,
        diagnostics,
      };
    } catch (cause) {
      this.append(diagnostics, this.warning(
        cause instanceof Error && /byte limit/i.test(cause.message)
          ? "RASTER_LIMIT_EXCEEDED"
          : "PACKET_SCHEMA_INVALID",
        cause instanceof Error
          ? `PixelBrain asset resolution failed: ${cause.message}`
          : "PixelBrain asset resolution failed",
      ));
      return null;
    }
  }

  private async tryPng(
    assetKey: string,
    entry: PixelBrainAssetRegistryEntry,
    diagnostics: PixelBrainDiagnostic[],
  ): Promise<Extract<AssetResolution, { status: "PNG" }> | null> {
    const url = entry.pngUrl;
    const expected = entry.expectedPngHash;
    if (url === undefined || expected === undefined) return null;
    if (!immutableGeneratedUrl(url) || !pngUrlMatchesHash(url, expected)) {
      this.append(diagnostics, this.warning(
        "PACKET_SCHEMA_INVALID",
        `Rejected mutable or mismatched PNG registry URL: ${url}`,
      ));
      return null;
    }

    try {
      const response = await this.fetchResponse(url);
      if (!response.ok) {
        this.append(diagnostics, this.warning(
          "PACKET_SCHEMA_INVALID",
          `PNG asset request failed with HTTP ${response.status}`,
        ));
        return null;
      }
      const pngBytes = await readBoundedResponseBytes(
        response,
        MAX_RASTER_BYTES,
      );
      const pngRevision = computePngRevision(pngBytes);
      if (pngRevision !== expected) {
        this.append(diagnostics, this.warning(
          "PACKET_HASH_MISMATCH",
          `Expected ${expected} but received ${pngRevision}`,
        ));
        return null;
      }
      const dimensions = await this.decodePngDimensions(pngBytes);
      if (
        !Number.isSafeInteger(dimensions.width)
        || !Number.isSafeInteger(dimensions.height)
        || dimensions.width < 1
        || dimensions.height < 1
        || dimensions.width > MAX_CANVAS_DIMENSION
        || dimensions.height > MAX_CANVAS_DIMENSION
        || dimensions.width * dimensions.height * 4 > MAX_RASTER_BYTES
      ) {
        this.append(diagnostics, this.warning(
          "INVALID_CANVAS_DIMENSIONS",
          "Decoded PNG dimensions exceed renderer limits",
        ));
        return null;
      }
      return {
        status: "PNG",
        assetKey,
        pngBytes,
        pngRevision,
        width: dimensions.width,
        height: dimensions.height,
        diagnostics,
      };
    } catch (cause) {
      this.append(diagnostics, this.warning(
        cause instanceof Error && /byte limit/i.test(cause.message)
          ? "RASTER_LIMIT_EXCEEDED"
          : "PACKET_SCHEMA_INVALID",
        cause instanceof Error
          ? `PNG asset resolution failed: ${cause.message}`
          : "PNG asset resolution failed",
      ));
      return null;
    }
  }

  async resolve(
    assetKey: string,
    fallback: AssetFallback,
  ): Promise<AssetResolution> {
    const diagnostics: PixelBrainDiagnostic[] = [];
    if (fallback.textMode) {
      return {
        status: "TEXT",
        accessibleLabel: fallback.accessibleLabel,
        diagnostics,
      };
    }

    const entry = this.registry[assetKey];
    if (entry !== undefined && entry.assetKey === assetKey) {
      const pixelBrain = await this.tryPixelBrain(entry, diagnostics);
      if (pixelBrain !== null) return pixelBrain;
      const png = await this.tryPng(assetKey, entry, diagnostics);
      if (png !== null) return png;
    } else if (entry !== undefined) {
      this.append(diagnostics, this.warning(
        "PACKET_SCHEMA_INVALID",
        `Registry assetKey mismatch for ${assetKey}`,
      ));
    }

    if (fallback.glyph !== null) {
      return { status: "GLYPH", glyph: fallback.glyph, diagnostics };
    }
    return {
      status: "TEXT",
      accessibleLabel: fallback.accessibleLabel,
      diagnostics,
    };
  }
}
