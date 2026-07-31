/**
 * carrier — PB-CARRIER-v1. One sealed carrier holding several complete
 * projections behind a manifest.
 *
 * Four laws, from the sealed projection carrier design:
 *
 *   1. ONE PRODUCER decides what ships. The consumer selects which frame to
 *      READ; it never influences what is SENT. Selecting from a fixed sealed
 *      carrier is not negotiation — that distinction is what survived the
 *      denial of the negotiating-interlocutor design, and it dies if selection
 *      can mutate the carrier.
 *   2. THE CONSUMER NEVER COMPUTES A HASH. Its verification is string equality.
 *      A Merkle proof is not permitted, because computing one means hashing.
 *   3. THE EXPECTED ROOT ARRIVES INDEPENDENTLY. Verifying a carrier against a
 *      value read off that same carrier compares it to itself and cannot fail.
 *   4. SHIP THE CARRIER WHOLE. No lazy frames; a payload ceiling forces FEWER
 *      frames, never fetch-on-demand.
 *
 * WHAT THE CONSUMER CAN AND CANNOT DETECT — declared, not implied:
 *
 *   substituted carrier ............. consumer detects (root != expected)
 *   edited `root` ................... consumer detects (root != expected)
 *   edited frame, root left alone ... consumer does NOT detect
 *   edited frame + updated root ..... consumer detects (root != expected)
 *
 * The consumer verifies IDENTITY, not INTEGRITY: catching an edited frame means
 * recomputing its checksum, which is hashing, which law 2 forbids it. Integrity
 * is this module's job (verifyCarrier), run producer-side before shipping. A
 * design claiming otherwise would be asserting a check it does not have.
 */

import { sha256Hex } from '../pixelbrain/sha256.js';
import { canonicalConstructionStringify } from '../pixelbrain/construction/construction-schema.js';

export class CarrierError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CarrierError';
  }
}

export const CARRIER_CONTRACT = 'PB-CARRIER-v1';

/**
 * Only kinds a consumer actually reads. `construction`, `gene` and `amp` are
 * deferred: a carrier that accepts a kind nothing reads reproduces the
 * declared-but-unimplemented pathology at carrier scale.
 */
export const CARRIER_FRAME_KINDS = Object.freeze(['render', 'temporal']);

const FRAME_SCHEMA = Object.freeze({
  render: 'pixelbrain.render.v1',
  temporal: 'PB-TEMPORAL-FRAME-v1',
});

/** Content digest of one complete projection packet. */
export function frameChecksum(packet) {
  return sha256Hex(canonicalConstructionStringify(packet)).toUpperCase();
}

function computeRoot(manifest) {
  // Binds every frame checksum IN MANIFEST ORDER, so reordering is a different
  // carrier. The frameId and kind are included so a checksum cannot be silently
  // reassigned to a different slot.
  return sha256Hex(
    manifest.map((m) => `${m.frameId}:${m.kind}:${m.checksum}`).join('|'),
  ).toUpperCase();
}

function computeSeal(root, manifest) {
  return sha256Hex(
    `${CARRIER_CONTRACT}:${root}:${canonicalConstructionStringify(manifest)}`,
  ).toUpperCase();
}

/**
 * Seal a set of complete projections into a carrier.
 * @param {Array<{kind: string, frameId: string, packet: object}>} entries
 */
export function sealCarrier(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new CarrierError('a carrier must hold at least one frame');
  }

  const seen = new Set();
  const manifest = [];
  const frames = {};

  for (const entry of entries) {
    const { kind, frameId, packet } = entry ?? {};
    if (!CARRIER_FRAME_KINDS.includes(kind)) {
      throw new CarrierError(
        `unknown frame kind ${JSON.stringify(kind)}. Known kinds: `
        + `${CARRIER_FRAME_KINDS.join(', ')}. A kind is added when a consumer `
        + 'reads it, never in anticipation.',
      );
    }
    if (typeof frameId !== 'string' || frameId.length === 0) {
      throw new CarrierError('every frame needs a non-empty frameId');
    }
    if (seen.has(frameId)) {
      throw new CarrierError(`duplicate frameId ${JSON.stringify(frameId)}`);
    }
    if (!packet || typeof packet !== 'object') {
      throw new CarrierError(`frame ${frameId} carries no packet`);
    }
    seen.add(frameId);

    manifest.push(Object.freeze({
      kind,
      frameId,
      schema: FRAME_SCHEMA[kind],
      checksum: frameChecksum(packet),
    }));
    frames[frameId] = packet;
  }

  const root = computeRoot(manifest);

  return {
    contract: CARRIER_CONTRACT,
    manifest,
    root,
    frames,
    seal: computeSeal(root, manifest),
  };
}

/**
 * Recompute every checksum and confirm the carrier is internally consistent.
 * This is the INTEGRITY gate and it hashes — which is why it lives here and not
 * in the addon.
 */
export function verifyCarrier(carrier) {
  const fail = (reason, extra = {}) => Object.freeze({
    valid: false,
    reason,
    badFrames: Object.freeze([]),
    rootMatches: false,
    sealMatches: false,
    ...extra,
  });

  if (!carrier || typeof carrier !== 'object') return fail('carrier must be an object');
  if (carrier.contract !== CARRIER_CONTRACT) {
    return fail(`expected ${CARRIER_CONTRACT}, got ${JSON.stringify(carrier.contract)}`);
  }
  if (!Array.isArray(carrier.manifest) || carrier.manifest.length === 0) {
    return fail('carrier has no manifest');
  }
  if (!carrier.frames || typeof carrier.frames !== 'object') {
    return fail('carrier has no frames');
  }

  const badFrames = [];
  for (const entry of carrier.manifest) {
    const packet = carrier.frames[entry.frameId];
    if (packet === undefined) {
      badFrames.push(entry.frameId);
      continue;
    }
    if (frameChecksum(packet) !== entry.checksum) badFrames.push(entry.frameId);
  }

  // Law 4: the manifest describes the WHOLE carrier. A frame present in
  // `frames` but absent from the manifest is cargo nobody declared.
  const listed = new Set(carrier.manifest.map((m) => m.frameId));
  const unlisted = Object.keys(carrier.frames).filter((id) => !listed.has(id));

  const rootMatches = carrier.root === computeRoot(carrier.manifest);
  const sealMatches = carrier.seal === computeSeal(carrier.root, carrier.manifest);

  if (badFrames.length > 0) {
    return fail(
      `frame checksum mismatch: ${badFrames.join(', ')}`,
      { badFrames: Object.freeze(badFrames), rootMatches, sealMatches },
    );
  }
  if (unlisted.length > 0) {
    return fail(
      `frames absent from the manifest: ${unlisted.join(', ')}`,
      { rootMatches, sealMatches },
    );
  }
  if (!rootMatches) return fail('root does not bind the manifest', { sealMatches });
  if (!sealMatches) return fail('seal does not cover the root and manifest', { rootMatches });

  return Object.freeze({
    valid: true,
    reason: 'ok',
    badFrames: Object.freeze([]),
    rootMatches: true,
    sealMatches: true,
  });
}

/**
 * Read one frame off the carrier. Law 1: this is SELECTION, not negotiation —
 * it cannot change what the producer sealed, so it never mutates the carrier.
 */
export function selectFrame(carrier, frameId) {
  const packet = carrier?.frames?.[frameId];
  if (packet === undefined) {
    const known = Object.keys(carrier?.frames ?? {}).join(', ') || '(none)';
    throw new CarrierError(
      `no frame ${JSON.stringify(frameId)} on this carrier. Available: ${known}. `
      + 'The consumer selects from what was sent; it cannot request more.',
    );
  }
  return packet;
}
