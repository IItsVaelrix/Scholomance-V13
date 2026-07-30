/**
 * verifySeal — consumer-side seal equality check.
 *
 * Defold Bridge Design §"The Four Rules", Rule 2:
 *   A consumer that cannot match the seal refuses the packet and holds its
 *   last verified frame (blank only if there is no prior frame), emitting
 *   SEAL_MISMATCH. Never best-effort.
 *
 * Consumers verify by string equality only. They never recompute the seal.
 */

import type { SealedScenePacket } from "./contracts.js";

export interface SealVerificationResult {
  valid: boolean;
  /** Present when valid is false. */
  reason?: "SEAL_MISMATCH" | "MALFORMED_SEAL" | "MALFORMED_PACKET";
  /** The seal that was expected (from the packet). */
  expectedSeal?: string;
  /** The seal the consumer holds (from its last verified frame). */
  heldSeal?: string;
}

/**
 * Verify that a received packet's seal matches what the consumer expects.
 *
 * In practice the consumer stores the seal from its last verified frame and
 * compares the incoming packet's seal by string equality. This function
 * encapsulates that check with structured diagnostics.
 *
 * @param packet  The incoming sealed packet.
 * @param heldSeal The seal from the consumer's last verified frame, or null
 *                 if the consumer has no prior frame (first packet).
 */
export function verifySeal(
  packet: Pick<SealedScenePacket, "seal">,
  heldSeal: string | null,
): SealVerificationResult {
  // First packet: no prior frame to compare against. Accept.
  if (heldSeal === null) {
    return { valid: true };
  }

  if (typeof packet.seal !== "string" || !packet.seal.startsWith("plan1:")) {
    return { valid: false, reason: "MALFORMED_SEAL", heldSeal };
  }

  if (packet.seal !== heldSeal) {
    return {
      valid: false,
      reason: "SEAL_MISMATCH",
      expectedSeal: packet.seal,
      heldSeal,
    };
  }

  return { valid: true };
}

/**
 * Monotonic revision gate (Rule 4).
 *
 * A packet older than what is on screen is dropped regardless of frame timing.
 * Returns true if the packet should be applied (newer or equal revision).
 */
export function passesRevisionGate(
  incoming: Pick<SealedScenePacket, "roomRevision" | "sequence">,
  current: { roomRevision: number; sequence: number } | null,
): boolean {
  if (current === null) return true;
  if (incoming.roomRevision < current.roomRevision) return false;
  if (incoming.roomRevision === current.roomRevision && incoming.sequence <= current.sequence) {
    return false;
  }
  return true;
}
