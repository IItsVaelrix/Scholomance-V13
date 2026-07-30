/**
 * receipt — mintReceipt and toResolvedAssetLedgerEntry.
 *
 * Hoisted from renderIdentity.ts (renderer-pixi). The receipt is minted in
 * TypeScript from a claim. Both engines' claims pass through one hash function,
 * so a receipt diff is real divergence in what was drawn, never
 * hash-implementation drift.
 *
 * Lua never computes a hash and never mints a receipt (Defold Bridge Design
 * §"Decisions"). Defold reports a claim; the bridge mints the receipt.
 */

import { computeRenderHash } from "@polaris/pixelbrain-bridge";
import type {
  RenderReceiptClaim,
  RenderReceipt,
  ResolvedAssetLedgerEntry,
  ResolvedAssetSource,
} from "./contracts.js";

/**
 * Build a ResolvedAssetLedgerEntry from raw resolution facts.
 * Engine-neutral: works for both PixiJS and Defold claims.
 */
export function toResolvedAssetLedgerEntry(
  requestedAssetKey: string,
  source: ResolvedAssetSource,
  facts: {
    packetId?: string | null;
    packetContentHash?: string | null;
    rasterHash?: string | null;
    pngRevision?: string | null;
  } = {},
): ResolvedAssetLedgerEntry {
  return {
    requestedAssetKey,
    source,
    packetId: facts.packetId ?? null,
    packetContentHash: facts.packetContentHash ?? null,
    rasterHash: facts.rasterHash ?? null,
    pngRevision: facts.pngRevision ?? null,
  };
}

/**
 * Mint a RenderReceipt from a RenderReceiptClaim.
 *
 * The renderHash folds: contractHash (via seal), mode, and the sorted
 * resolved-asset ledger. This is the falsifier — if two engines resolve
 * different assets or degrade differently, their receipts diverge.
 *
 * Pure and deterministic: same claim → same receipt, always.
 */
export function mintReceipt(claim: RenderReceiptClaim): RenderReceipt {
  const renderHash = computeRenderHash({
    seal: claim.seal,
    engine: claim.engine,
    fallbackMode: claim.mode,
    resolvedAssets: [...claim.resolvedAssets]
      .sort((a, b) => a.requestedAssetKey.localeCompare(b.requestedAssetKey))
      .map((asset) => ({
        assetKey: asset.requestedAssetKey,
        source: asset.source,
        packetContentHash: asset.packetContentHash,
        rasterHash: asset.rasterHash,
        pngRevision: asset.pngRevision,
      })),
  });

  return { ...claim, renderHash };
}

/**
 * Compare two receipts for equality. Returns true iff both engines drew
 * the same thing: same seal, same mode, same resolved assets.
 */
export function receiptsEqual(a: RenderReceipt, b: RenderReceipt): boolean {
  return a.renderHash === b.renderHash;
}
