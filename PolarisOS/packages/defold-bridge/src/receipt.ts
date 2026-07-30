/**
 * receipt — parse a Defold claim, mint and compare receipts.
 *
 * Defold Bridge Design §"Components / defold-bridge":
 *   Lua never computes a hash and never mints a receipt. Defold reports a
 *   claim (seal + engine + mode + resolved assets); the bridge mints the
 *   receipt in TypeScript. Both engines' claims pass through one hash
 *   function, so a receipt diff is real divergence in what was drawn.
 */

import {
  mintReceipt,
  receiptsEqual,
  toResolvedAssetLedgerEntry,
  type RenderReceipt,
  type RenderReceiptClaim,
  type ResolvedAssetSource,
} from "@polaris/scene-packet";

/**
 * Raw claim shape as Defold's claim.lua reports it over the wire.
 * All fields are strings or arrays of strings — no hashing in Lua.
 */
export interface DefoldRawClaim {
  seal: string;
  engine: "defold";
  mode: "illustrated" | "fallback";
  resolvedAssets: Array<{
    requestedAssetKey: string;
    source: string;
    packetId?: string;
    packetContentHash?: string;
    rasterHash?: string;
    pngRevision?: string;
  }>;
}

const VALID_SOURCES: ReadonlySet<string> = new Set([
  "PIXELBRAIN", "PNG", "GLYPH", "TEXT",
]);

/**
 * Parse and validate a raw Defold claim into a typed RenderReceiptClaim.
 * Throws on malformed input — never best-effort.
 */
export function parseDefoldClaim(raw: DefoldRawClaim): RenderReceiptClaim {
  if (typeof raw.seal !== "string" || !raw.seal.startsWith("plan1:")) {
    throw new Error(`Invalid seal in Defold claim: ${raw.seal}`);
  }
  if (raw.engine !== "defold") {
    throw new Error(`Expected engine "defold", got "${raw.engine}"`);
  }
  if (raw.mode !== "illustrated" && raw.mode !== "fallback") {
    throw new Error(`Invalid mode in Defold claim: ${raw.mode}`);
  }

  const resolvedAssets = raw.resolvedAssets.map((asset) => {
    if (!VALID_SOURCES.has(asset.source)) {
      throw new Error(`Invalid asset source in Defold claim: ${asset.source}`);
    }
    return toResolvedAssetLedgerEntry(
      asset.requestedAssetKey,
      asset.source as ResolvedAssetSource,
      {
        packetId: asset.packetId ?? null,
        packetContentHash: asset.packetContentHash ?? null,
        rasterHash: asset.rasterHash ?? null,
        pngRevision: asset.pngRevision ?? null,
      },
    );
  });

  return {
    seal: raw.seal,
    engine: "defold",
    mode: raw.mode,
    resolvedAssets,
  };
}

/**
 * Mint a receipt from a raw Defold claim. One-step convenience wrapper.
 */
export function mintDefoldReceipt(raw: DefoldRawClaim): RenderReceipt {
  return mintReceipt(parseDefoldClaim(raw));
}

/**
 * Compare a Defold receipt against a PixiJS receipt for the same sealed packet.
 * Returns true iff both engines resolved the same assets in the same mode.
 * This is the cross-engine falsifier: genuine divergence, never hash drift.
 */
export function crossEngineReceiptsEqual(
  defoldReceipt: RenderReceipt,
  pixiReceipt: RenderReceipt,
): boolean {
  return receiptsEqual(defoldReceipt, pixiReceipt);
}
