/**
 * PHENOTYPE — the measurement vector and its SCD64 encoding (spec §3).
 *
 * The SCD64 is a PURE MEASUREMENT FINGERPRINT. It carries no claims. Slot 0
 * holds the version byte plus the AuthorityProfile discriminator; slots 1..7
 * hold evidence axes. Authority is NOT here — a derived verdict sitting among
 * its own inputs would make slot 0 change "legitimately" for any result.
 *
 * Slot 0 is a discriminator, never the authoritative profile identity: six hex
 * characters is 24 bits. The full digest travels in BytecodeHealth context, the
 * observation receipt, and the profile registry (spec §3.1).
 */

import crypto from 'node:crypto';
import { AXIS_SLOTS, LIVE_AXES, type PhenotypeAxis } from './isolation';

export type MeasurementVector = Record<PhenotypeAxis, string | null>;

const BLOCK_COUNT = 8;

/** Version bytes distinguishing a gate-verified code from a merely declared one. */
export const CONFIRMED_VERSION_BYTE = 'E1';
export const PREDICTED_VERSION_BYTE = 'E0';

function blockFor(term: string): string {
  return crypto.createHash('sha256').update(term).digest('hex').toUpperCase().slice(0, 8);
}

/**
 * Sentinel for an axis that was not measured. Distinct from every real term
 * because no term is ever this string — unmeasured must never be mistakable
 * for measured-and-passing (spec §5.5).
 */
export const UNMEASURED_BLOCK = blockFor('__phenotype:unmeasured__');

/** Eight blocks: slot 0 is `versionByte + profileId`, slots 1..7 are axis terms. */
export function vectorToBlocks(
  vector: MeasurementVector,
  profileId: string,
  confirmed = true,
): string[] {
  const versionByte = confirmed ? CONFIRMED_VERSION_BYTE : PREDICTED_VERSION_BYTE;
  const blocks: string[] = new Array(BLOCK_COUNT);

  blocks[0] = `${versionByte}${profileId.toUpperCase()}`;

  for (const axis of LIVE_AXES) {
    const term = vector[axis];
    blocks[AXIS_SLOTS[axis]] = term === null || term === undefined ? UNMEASURED_BLOCK : blockFor(term);
  }

  // Fill slot 7 (motion, reserved for future) with UNMEASURED_BLOCK in v1
  blocks[7] = UNMEASURED_BLOCK;

  return blocks;
}

export function vectorToSCD64(
  vector: MeasurementVector,
  profileId: string,
  confirmed = true,
): string {
  const blocks = vectorToBlocks(vector, profileId, confirmed);
  // Ensure exactly 8 blocks for 64-character SCD64
  while (blocks.length < BLOCK_COUNT) {
    blocks.push(UNMEASURED_BLOCK);
  }
  return blocks.join('');
}
