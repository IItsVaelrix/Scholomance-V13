/**
 * scene-packet contracts — Defold Bridge Design §"The Sealed Packet Contract"
 *
 * Engine-neutral types shared by the server (seal producer), PixiJS
 * (visual laboratory), and Defold (sovereign runtime). No engine imports.
 *
 * Dependency law: this package may not import Pixi, Defold, Fastify,
 * WebSocket, SQLite, or browser APIs.
 */

import { z } from "zod";

// --- Glyph spec (procedural stand-in, PDR §5.4) ----------------------------

export const GlyphShapeSchema = z.enum([
  "rect", "circle", "diamond", "flame", "marker", "overlay",
]);
export type GlyphShape = z.infer<typeof GlyphShapeSchema>;

export const GlyphSpecSchema = z.object({
  shape: GlyphShapeSchema,
  /** 24-bit RGB, e.g. 0xc9a96e. */
  color: z.number().int().nonnegative(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  /** Quantized to milli-units at the seal boundary. */
  alphaMilli: z.number().int().nonnegative(),
});
export type GlyphSpec = z.infer<typeof GlyphSpecSchema>;

// --- Plan sprites (deterministic draw order: zIndex asc, then layerId) ------

export const PlanSpriteSchema = z.object({
  layerId: z.string(),
  layerType: z.string(),
  /** Null asset keys are projected as "" on the wire (Lua safety). */
  assetKey: z.string(),
  /** Quantized to milli-units. */
  xMilli: z.number().int(),
  yMilli: z.number().int(),
  zIndex: z.number().int(),
  visible: z.literal(true),
  glyph: GlyphSpecSchema,
  /** Null labels projected as "" on the wire. */
  label: z.string(),
});
export type PlanSprite = z.infer<typeof PlanSpriteSchema>;

// --- Hotspots (sorted by hotspotId) -----------------------------------------

export const PlanHotspotSchema = z.object({
  hotspotId: z.string(),
  entityId: z.string(),
  label: z.string(),
  command: z.string(),
  xMilli: z.number().int(),
  yMilli: z.number().int(),
  wMilli: z.number().int(),
  hMilli: z.number().int(),
});
export type PlanHotspot = z.infer<typeof PlanHotspotSchema>;

// --- Text regions (sorted by regionId) --------------------------------------

export const PlanTextSchema = z.object({
  regionId: z.string(),
  kind: z.string(),
  xMilli: z.number().int(),
  yMilli: z.number().int(),
  widthMilli: z.number().int(),
  text: z.string(),
});
export type PlanText = z.infer<typeof PlanTextSchema>;

// --- Resolved asset ledger entry (claim payload) ----------------------------

export const ResolvedAssetSourceSchema = z.enum([
  "PIXELBRAIN", "PNG", "GLYPH", "TEXT",
]);
export type ResolvedAssetSource = z.infer<typeof ResolvedAssetSourceSchema>;

export const ResolvedAssetLedgerEntrySchema = z.object({
  requestedAssetKey: z.string(),
  source: ResolvedAssetSourceSchema,
  packetId: z.string().nullable(),
  packetContentHash: z.string().nullable(),
  rasterHash: z.string().nullable(),
  pngRevision: z.string().nullable(),
});
export type ResolvedAssetLedgerEntry = z.infer<typeof ResolvedAssetLedgerEntrySchema>;

// --- The Seal — engine-neutral, exactly one producer: the server ------------

export const SealedScenePacketSchema = z.object({
  packetVersion: z.literal(1),
  sceneId: z.string(),
  roomId: z.string(),
  worldId: z.string(),
  roomRevision: z.number().int().nonnegative(),
  visualRevision: z.number().int().nonnegative(),
  contractHash: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  backgroundAssetKey: z.string(),
  backgroundGlyph: GlyphSpecSchema,
  lightingState: z.string(),
  /** 0xRRGGBB integer. */
  lightingTint: z.number().int().nonnegative(),
  /** Quantized: round(alpha * 1000). */
  lightingAlphaMilli: z.number().int().nonnegative(),
  /** Sorted ambient effect names. */
  ambientEffects: z.array(z.string()),
  /** zIndex asc, then layerId. */
  sprites: z.array(PlanSpriteSchema),
  /** hotspotId asc. */
  hotspots: z.array(PlanHotspotSchema),
  textRegions: z.array(PlanTextSchema),
  /** One packet describes BOTH illustrated and fallback modes. */
  fallbackLines: z.array(z.string()),
  /**
   * Per-connection delivery ordering. Travels on the packet but is
   * EXCLUDED from the seal computation (see seal.ts).
   */
  sequence: z.number().int().nonnegative(),
  /** The seal itself: `plan1:<sha256hex>`. */
  seal: z.string().regex(/^plan1:[0-9a-f]{64}$/),
});
export type SealedScenePacket = z.infer<typeof SealedScenePacketSchema>;

// --- The Claim — what an engine reports about its own render ----------------

export const RenderReceiptClaimSchema = z.object({
  seal: z.string().regex(/^plan1:[0-9a-f]{64}$/),
  engine: z.enum(["pixi", "defold"]),
  mode: z.enum(["illustrated", "fallback"]),
  resolvedAssets: z.array(ResolvedAssetLedgerEntrySchema),
});
export type RenderReceiptClaim = z.infer<typeof RenderReceiptClaimSchema>;

// --- The Receipt — minted in TypeScript from a claim ------------------------

export const RenderReceiptSchema = RenderReceiptClaimSchema.extend({
  renderHash: z.string().regex(/^render1:[0-9a-f]{64}$/),
});
export type RenderReceipt = z.infer<typeof RenderReceiptSchema>;
