/**
 * PLACEBO-A — canonical-serializer + immutable-packet
 *
 * Blind label until autopsy. Port story:
 *   structure --[canonical-serializer]--> artifact
 *   artifact + checksum --[immutable-packet]--> sealed-packet
 *
 * Open ports at selection: checksum, structure (checksum is produced mid-pipe).
 * Effort ceiling: same as treatment wire.
 */

import { sha256Hex, stableStringify } from '../immunity/cleri-probe/canonical-report.js';

export const PLACEBO_A_CONTRACT = 'PB-PLACEBO-A-SERIALIZE-PACKET-v1';
export const PLACEBO_A_SCHEMA_VERSION = '1.0.0';

/**
 * @param {unknown} structure
 * @returns {{
 *   contract: string,
 *   schemaVersion: string,
 *   artifact: string,
 *   checksum: string,
 *   sealedPacket: object,
 * }}
 */
export function sealStructure(structure) {
  if (structure === undefined || structure === null || typeof structure !== 'object') {
    throw new TypeError(`${PLACEBO_A_CONTRACT}: structure must be an object`);
  }
  // [SER]
  const artifact = stableStringify(structure);
  // checksum of structure body (house seal form)
  const checksum = `placeboa1:${sha256Hex(structure)}`;
  // [PACKET]
  const sealedPacket = {
    contract: PLACEBO_A_CONTRACT,
    schemaVersion: PLACEBO_A_SCHEMA_VERSION,
    artifact,
    checksum,
  };
  return {
    contract: PLACEBO_A_CONTRACT,
    schemaVersion: PLACEBO_A_SCHEMA_VERSION,
    artifact,
    checksum,
    sealedPacket,
  };
}

/** Recompute seal; returns true iff packet still matches structure body. */
export function verifySealedPacket(sealedPacket, structure) {
  if (!sealedPacket || typeof sealedPacket !== 'object') return false;
  if (structure === undefined || structure === null) return false;
  const expected = `placeboa1:${sha256Hex(structure)}`;
  const artifact = stableStringify(structure);
  return sealedPacket.checksum === expected && sealedPacket.artifact === artifact;
}
