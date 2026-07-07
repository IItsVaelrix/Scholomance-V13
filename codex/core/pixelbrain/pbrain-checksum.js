/**
 * .pbrain packet checksum — JavaScript verifier/stamper.
 *
 * Mirrors steamdeck_brain/vaelrix_forcefield/pixelbrain/pbrain_checksum.py:
 * the checksum value is FNV-1a-32 (upper 8-hex) of the packet minus its
 * top-level "checksum" key, serialized Python-compact (see canonical-json.js).
 *
 * Verification MUST go through `verifyPbrainText` / the *FromText variants,
 * which parse with numeric-literal preservation. Feeding a JSON.parse'd
 * object here would collapse floats (64.0 → 64) and produce a false mismatch
 * — the exact failure this module exists to prevent.
 */

import { fnv1a32Hex } from './shared.js';
import { canonicalStringify, parseCanonicalJson } from './canonical-json.js';

export const PBRAIN_CHECKSUM_ALGORITHM = 'FNV-1a-32';
export const PBRAIN_CHECKSUM_SCOPE = 'canonical JSON excluding this checksum object';

function packetBody(packet) {
  if (packet instanceof Map) {
    const body = new Map();
    for (const [k, v] of packet) {
      if (k !== 'checksum') body.set(k, v);
    }
    return body;
  }
  if (packet && typeof packet === 'object' && !Array.isArray(packet)) {
    const { checksum, ...body } = packet;
    return body;
  }
  throw new TypeError('.pbrain packet must be a JSON object');
}

/**
 * Recompute the checksum value for a parsed packet (Map from
 * parseCanonicalJson, or a JS object using PyFloat markers for float fields).
 */
export function computePbrainChecksum(packet) {
  return fnv1a32Hex(canonicalStringify(packetBody(packet)));
}

/** Recompute the checksum value directly from raw .pbrain file text. */
export function computePbrainChecksumFromText(text) {
  return computePbrainChecksum(parseCanonicalJson(text));
}

/**
 * Verify raw .pbrain file text against its stamped checksum.
 * Returns { ok, expected, recomputed }.
 */
export function verifyPbrainText(text) {
  const packet = parseCanonicalJson(text);
  if (!(packet instanceof Map)) {
    throw new TypeError('.pbrain packet must be a JSON object');
  }
  const stamp = packet.get('checksum');
  const expected = String((stamp instanceof Map ? stamp.get('value') : stamp?.value) ?? '');
  const recomputed = computePbrainChecksum(packet);
  return { ok: recomputed === expected, expected, recomputed };
}

/** Build the checksum stamp object for a packet body. */
export function stampPbrainChecksum(packet) {
  return {
    algorithm: PBRAIN_CHECKSUM_ALGORITHM,
    scope: PBRAIN_CHECKSUM_SCOPE,
    value: computePbrainChecksum(packet),
  };
}
