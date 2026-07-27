import { describe, expect, it, vi } from "vitest";
import {
  computePngRevision,
  processPixelBrainPacket,
} from "@polaris/pixelbrain-bridge";
import {
  PixelBrainAssetResolver,
  readBoundedResponseBytes,
  type PixelBrainAssetRegistry,
} from "../src/PixelBrainAssetResolver.js";
import type { GlyphSpec } from "../src/scenePlan.js";

const glyph: GlyphSpec = {
  shape: "diamond",
  color: 0xffaa00,
  width: 16,
  height: 16,
  alpha: 1,
};

function packet(color = "#ffaa00") {
  return {
    kind: "pixelbrain.render.v1",
    id: "lantern",
    schemaVersion: 1,
    canvas: {
      width: 4,
      height: 4,
      cellSize: 2,
      transparent: true,
      background: "#00000000",
    },
    coordinates: [{ snappedX: 0, snappedY: 0, color }],
  };
}

function packetIdentity(input = packet()) {
  const result = processPixelBrainPacket(input);
  if (!result.ok) throw new Error(result.diagnostics[0]?.detail);
  return result.packet.packetContentHash;
}

function registry(options: {
  packet?: unknown;
  packetHash?: `pb1:${string}`;
  pngBytes?: Uint8Array;
  pngHash?: `png1:${string}`;
} = {}): PixelBrainAssetRegistry {
  const hash = options.packetHash ?? packetIdentity(options.packet ?? packet());
  const pngHash = options.pngHash ?? (
    options.pngBytes === undefined
      ? undefined
      : computePngRevision(options.pngBytes)
  );
  return {
    "entities/lantern": {
      assetKey: "entities/lantern",
      pixelBrainUrl:
        `/assets/generated/lantern.${hash.replace(":", "-")}.pixelbrain.json`,
      expectedPacketContentHash: hash,
      ...(pngHash === undefined
        ? {}
        : {
            pngUrl:
              `/assets/generated/lantern.${pngHash.replace(":", "-")}.png`,
            expectedPngHash: pngHash,
          }),
    },
  };
}

function responseFor(
  url: string,
  packetValue: unknown,
  pngBytes?: Uint8Array,
): Response {
  return url.endsWith(".json")
    ? new Response(JSON.stringify(packetValue), { status: 200 })
    : new Response(pngBytes, { status: pngBytes === undefined ? 404 : 200 });
}

describe("PixelBrainAssetResolver", () => {
  it("resolves a valid PixelBrain packet before PNG", async () => {
    const input = packet();
    const pngBytes = new Uint8Array([1, 2, 3]);
    const fetch = vi.fn(async (url: string) => (
      responseFor(url, input, pngBytes)
    ));
    const resolver = new PixelBrainAssetResolver({
      registry: registry({ packet: input, pngBytes }),
      fetch,
      decodePngDimensions: async () => ({ width: 1, height: 1 }),
    });

    const result = await resolver.resolve("entities/lantern", {
      glyph,
      accessibleLabel: "Lantern",
    });

    expect(result.status).toBe("PIXELBRAIN");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("emits diagnostics for an invalid packet and falls back to PNG", async () => {
    const invalid = packet();
    invalid.coordinates[0]!.snappedX = 1;
    const pngBytes = new Uint8Array([137, 80, 78, 71]);
    const fetch = vi.fn(async (url: string) => (
      responseFor(url, invalid, pngBytes)
    ));
    const diagnostics: string[] = [];
    const resolver = new PixelBrainAssetResolver({
      registry: registry({ pngBytes }),
      fetch,
      decodePngDimensions: async () => ({ width: 1, height: 1 }),
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic.code),
    });

    const result = await resolver.resolve("entities/lantern", {
      glyph,
      accessibleLabel: "Lantern",
    });

    expect(result.status).toBe("PNG");
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      "INVALID_GRID_ALIGNMENT",
    );
    expect(diagnostics).toContain("INVALID_GRID_ALIGNMENT");
  });

  it("falls through missing PNG to glyph, then text", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 404 }));
    const resolver = new PixelBrainAssetResolver({
      registry: registry(),
      fetch,
      decodePngDimensions: async () => ({ width: 1, height: 1 }),
    });

    const glyphResult = await resolver.resolve("entities/lantern", {
      glyph,
      accessibleLabel: "Lantern",
    });
    const textResult = await resolver.resolve("entities/unknown", {
      glyph: null,
      accessibleLabel: "Unknown object",
    });

    expect(glyphResult.status).toBe("GLYPH");
    expect(textResult).toMatchObject({
      status: "TEXT",
      accessibleLabel: "Unknown object",
    });
  });

  it("bypasses all fetch work in text mode", async () => {
    const fetch = vi.fn();
    const resolver = new PixelBrainAssetResolver({
      registry: registry(),
      fetch,
      decodePngDimensions: async () => ({ width: 1, height: 1 }),
    });

    const result = await resolver.resolve("entities/lantern", {
      glyph,
      accessibleLabel: "Lantern",
      textMode: true,
    });

    expect(result.status).toBe("TEXT");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects packet expectation mismatches and continues to PNG", async () => {
    const changedPacket = packet("#00ff00");
    const pngBytes = new Uint8Array([1, 3, 3, 7]);
    const fetch = vi.fn(async (url: string) => (
      responseFor(url, changedPacket, pngBytes)
    ));
    const resolver = new PixelBrainAssetResolver({
      registry: registry({ pngBytes }),
      fetch,
      decodePngDimensions: async () => ({ width: 2, height: 2 }),
    });

    const result = await resolver.resolve("entities/lantern", {
      glyph,
      accessibleLabel: "Lantern",
    });

    expect(result.status).toBe("PNG");
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      "PACKET_HASH_MISMATCH",
    );
  });

  it("rejects mutable, traversal, and query-bearing registry URLs", async () => {
    const fetch = vi.fn();
    for (const pixelBrainUrl of [
      "/assets/entities/lantern.pixelbrain.json",
      "/assets/generated/../lantern.pixelbrain.json",
      "/assets/generated/lantern.pixelbrain.json?v=2",
    ]) {
      const resolver = new PixelBrainAssetResolver({
        registry: {
          "entities/lantern": {
            ...registry()["entities/lantern"]!,
            pixelBrainUrl,
          },
        },
        fetch,
        decodePngDimensions: async () => ({ width: 1, height: 1 }),
      });
      const result = await resolver.resolve("entities/lantern", {
        glyph,
        accessibleLabel: "Lantern",
      });
      expect(result.status).toBe("GLYPH");
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("cancels bounded streams that exceed their byte limit", async () => {
    const cancel = vi.fn(async () => undefined);
    const reader = {
      read: vi.fn()
        .mockResolvedValueOnce({
          done: false,
          value: new Uint8Array([1, 2, 3, 4, 5]),
        }),
      cancel,
      releaseLock: vi.fn(),
    };
    const response = {
      ok: true,
      headers: new Headers(),
      body: { getReader: () => reader },
    } as unknown as Response;

    await expect(readBoundedResponseBytes(response, 4)).rejects.toThrow(
      /byte limit/i,
    );
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("rejects declared packet sizes before reading the body", async () => {
    const response = new Response(new Uint8Array([1]), {
      headers: { "content-length": String(8 * 1024 * 1024 + 1) },
    });
    await expect(
      readBoundedResponseBytes(response, 8 * 1024 * 1024),
    ).rejects.toThrow(/byte limit/i);
  });
});
