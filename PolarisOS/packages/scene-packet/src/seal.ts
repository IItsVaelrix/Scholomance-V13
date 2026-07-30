/**
 * seal — computePlanSeal and float quantizers.
 *
 * Defold Bridge Design §"Seal strength": plan1: = sha256 over canonicalJson.
 * Upgraded from fnv1a (32-bit, insertion-order-dependent) to sha256 (256-bit,
 * canonical-order) joining the pb1:/pbr1:/png1:/render1: family.
 *
 * Float policy (§"Float policy"): canonicalJson throws on non-safe-integers.
 * All fractional quantities are quantized to integer milli-units at the seal
 * boundary. Quantization happens once, in the producer, before the seal is
 * computed — consumers receive only quantized values.
 *
 * Seal exclusions (§"What the seal excludes"):
 *   - `sequence`: per-connection delivery ordering, not a projection of room
 *     state. Sealing it would break determinism across connections.
 *   - `mode`: moved to the claim. One packet describes both modes.
 *   - `generatedAt`: the manifest's only non-deterministic field.
 */

import { canonicalJson, sha256Hex } from "@polaris/pixelbrain-bridge";
import type { SealedScenePacket } from "./contracts.js";

const UTF8 = new TextEncoder();
const SEAL_PREFIX = "polaris-plan.v1\0";

// --- Quantizers -------------------------------------------------------------

/** Round a float to integer milli-units. The only rounding that ever happens. */
export function toMilli(value: number): number {
  return Math.round(value * 1000);
}

/** Round a float alpha [0,1] to integer milli-units, clamped. */
export function alphaToMilli(alpha: number): number {
  return Math.round(Math.min(1, Math.max(0, alpha)) * 1000);
}

// --- Seal computation -------------------------------------------------------

/**
 * The canonical seal input: every field of SealedScenePacket EXCEPT
 * `sequence` and `seal` itself. Key order is irrelevant — canonicalJson
 * sorts keys by code point.
 */
function sealInput(packet: Omit<SealedScenePacket, "seal">): unknown {
  return {
    packetVersion: packet.packetVersion,
    sceneId: packet.sceneId,
    roomId: packet.roomId,
    worldId: packet.worldId,
    roomRevision: packet.roomRevision,
    visualRevision: packet.visualRevision,
    contractHash: packet.contractHash,
    width: packet.width,
    height: packet.height,
    backgroundAssetKey: packet.backgroundAssetKey,
    backgroundGlyph: packet.backgroundGlyph,
    lightingState: packet.lightingState,
    lightingTint: packet.lightingTint,
    lightingAlphaMilli: packet.lightingAlphaMilli,
    ambientEffects: packet.ambientEffects,
    sprites: packet.sprites,
    hotspots: packet.hotspots,
    textRegions: packet.textRegions,
    fallbackLines: packet.fallbackLines,
    // sequence: deliberately excluded
  };
}

/**
 * Compute the plan1: seal for a packet. Pure and deterministic.
 * Identical packet content (minus sequence) → identical seal, always.
 */
export function computePlanSeal(
  packet: Omit<SealedScenePacket, "seal">,
): `plan1:${string}` {
  const json = canonicalJson(sealInput(packet));
  const prefixBytes = UTF8.encode(SEAL_PREFIX);
  const jsonBytes = UTF8.encode(json);
  const input = new Uint8Array(prefixBytes.length + jsonBytes.length);
  input.set(prefixBytes, 0);
  input.set(jsonBytes, prefixBytes.length);
  return `plan1:${sha256Hex(input)}`;
}
