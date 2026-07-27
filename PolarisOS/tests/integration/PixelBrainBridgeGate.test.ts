import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { pixelBrainAssetRegistry } from "../../apps/client/src/generated/pixelbrainAssetRegistry.js";
import {
  PixelBrainAssetResolver,
  computeSceneRenderHash,
  toResolvedAssetLedgerEntry,
  type AssetResolution,
} from "@polaris/renderer-pixi";

const here = dirname(fileURLToPath(import.meta.url));
const clientPublic = resolve(here, "../../apps/client/public");
const glyph = {
  shape: "diamond" as const,
  color: 0xffaa00,
  width: 16,
  height: 16,
  alpha: 1,
};

async function fileFetch(url: string): Promise<Response> {
  try {
    return new Response(await readFile(resolve(clientPublic, `.${url}`)), {
      status: 200,
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}

function resolver(): PixelBrainAssetResolver {
  return new PixelBrainAssetResolver({
    registry: pixelBrainAssetRegistry,
    fetch: fileFetch,
  });
}

async function resolveAsset(assetKey: string): Promise<AssetResolution> {
  return resolver().resolve(assetKey, {
    glyph,
    accessibleLabel: assetKey,
  });
}

describe("PixelBrain PolarisOS integration gate", () => {
  it("renders the shrine lantern from a real generated PixelBrain packet", async () => {
    const lantern = await resolveAsset("entities/lantern");
    expect(lantern.status).toBe("PIXELBRAIN");
    if (lantern.status !== "PIXELBRAIN") return;
    expect(lantern.raster.packetContentHash).toBe(
      pixelBrainAssetRegistry["entities/lantern"].expectedPacketContentHash,
    );
  });

  it("realizes brazier unlit and lit states as distinct immutable rasters", async () => {
    const [unlit, lit] = await Promise.all([
      resolveAsset("entities/brazier"),
      resolveAsset("entities/brazier_lit"),
    ]);
    expect(unlit.status).toBe("PIXELBRAIN");
    expect(lit.status).toBe("PIXELBRAIN");
    if (unlit.status !== "PIXELBRAIN" || lit.status !== "PIXELBRAIN") return;
    expect(unlit.raster.packetContentHash).not.toBe(
      lit.raster.packetContentHash,
    );
    expect(unlit.raster.rasterHash).not.toBe(lit.raster.rasterHash);
  });

  it("produces identical render hashes for two clients and reconnect", async () => {
    const keys = [
      "entities/brazier",
      "entities/lantern",
      "players/marker_default",
    ];
    const resolveLedger = async () => Promise.all(keys.map(async (assetKey) => (
      toResolvedAssetLedgerEntry(assetKey, await resolveAsset(assetKey))
    )));
    const plan = {
      contractHash: "authoritative-shrine-contract",
      planHash: "sceneplan1",
      mode: "illustrated" as const,
    };

    const [alice, bob, reconnected] = await Promise.all([
      resolveLedger(),
      resolveLedger(),
      resolveLedger(),
    ]);

    expect(computeSceneRenderHash(plan, alice)).toBe(
      computeSceneRenderHash(plan, bob),
    );
    expect(computeSceneRenderHash(plan, reconnected)).toBe(
      computeSceneRenderHash(plan, alice),
    );
  });

  it("keeps text fallback deterministic and interaction-independent", async () => {
    const text = await resolver().resolve("entities/lantern", {
      glyph,
      accessibleLabel: "Brass Lantern",
      textMode: true,
    });
    expect(text).toMatchObject({
      status: "TEXT",
      accessibleLabel: "Brass Lantern",
    });
  });
});
