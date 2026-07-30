/**
 * @polaris/scene-packet — engine-neutral sealed packet contract.
 *
 * Defold Bridge Design: this package is the neutral organ that both the
 * server (seal producer) and all consumers (PixiJS laboratory, Defold
 * sovereign runtime) import. It owns the seal computation, the receipt
 * minting, and the seal verification logic.
 *
 * Dependency law: may not import Pixi, Defold, Fastify, WebSocket, SQLite,
 * or browser APIs. Depends only on @polaris/contracts and
 * @polaris/pixelbrain-bridge.
 */

export type {
  GlyphShape,
  GlyphSpec,
  PlanSprite,
  PlanHotspot,
  PlanText,
  ResolvedAssetSource,
  ResolvedAssetLedgerEntry,
  SealedScenePacket,
  RenderReceiptClaim,
  RenderReceipt,
} from "./contracts.js";

export {
  GlyphShapeSchema,
  GlyphSpecSchema,
  PlanSpriteSchema,
  PlanHotspotSchema,
  PlanTextSchema,
  ResolvedAssetSourceSchema,
  ResolvedAssetLedgerEntrySchema,
  SealedScenePacketSchema,
  RenderReceiptClaimSchema,
  RenderReceiptSchema,
} from "./contracts.js";

export { computePlanSeal, toMilli, alphaToMilli } from "./seal.js";

export { buildSealedPacket, SCENE_WIDTH, SCENE_HEIGHT } from "./buildSealedPacket.js";
export type { BuildSealedPacketOptions } from "./buildSealedPacket.js";

export {
  toResolvedAssetLedgerEntry,
  mintReceipt,
  receiptsEqual,
} from "./receipt.js";

export { verifySeal, passesRevisionGate } from "./verifySeal.js";
export type { SealVerificationResult } from "./verifySeal.js";
