/**
 * SEMANTIC CALCULUS — observation receipt seal (SERVER-SAFE .js ISLAND)
 * ======================================================================
 *
 * Production runs `node codex/server/index.js` with NO TS loader (Dockerfile
 * CMD), and a server module importing a .ts file throws
 * ERR_UNKNOWN_FILE_EXTENSION at runtime. ConstellationOS's semantic inquiry
 * channel needs observation-receipt digests on the live request path, so this
 * island mirrors `observationReceipt.ts` + `seal.ts#canonicalize` in plain JS.
 *
 * This follows the island pattern established by hypothesisStatus.js (the .js
 * semantic-calculus module the server already imports), with one addition the
 * original island lacks: ALGORITHMIC ISOMORPHISM IS PINNED BY TEST.
 * tests/core/constellation/semanticWiring.calculusBallistics.test.js imports
 * BOTH this file and observationReceipt.ts and asserts identical digests over
 * boundary cases (key order, array order, -0, null, error status). If the .ts
 * canonicalization ever changes, that test fails LOUDLY here before the drift
 * can reach a shipped packet. Do not edit one side without the other.
 *
 * Mirrored rules (seal.ts, normative for 'sha256-canonical-v0'):
 *   - object keys sorted lexicographically
 *   - arrays keep author order (order is meaning)
 *   - strings NFC-normalized
 *   - undefined keys omitted, null emitted
 *   - no -0, no wall-clock anywhere
 */

import { createHash } from 'node:crypto';

export const RECEIPT_SEAL_ALGORITHM = 'sha256-canonical-v0';

/** Mirror of seal.ts `canonicalize` — keep in lockstep (see header). */
export function canonicalizeJson(value) {
  if (value === null) return 'null';
  if (value === undefined) return undefined;

  const t = typeof value;
  if (t === 'string') return JSON.stringify(value.normalize('NFC'));
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`[semantic-calculus] non-finite number in body: ${value}`);
    }
    if (Object.is(value, -0)) return '0';
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? 'null' : canonicalizeJson(v))).join(',')}]`;
  }
  if (t === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalizeJson(v)}`).join(',')}}`;
  }
  throw new TypeError(`[semantic-calculus] uncanonicalizable value of type ${t}`);
}

/** Mirror of observationReceipt.ts `hashResult`. */
export function hashResult(result) {
  return createHash('sha256').update(canonicalizeJson(result), 'utf8').digest('hex').toUpperCase();
}

/**
 * Composition of observationReceipt.ts `makeReceipt` + `receiptDigest` for the
 * one shape the live request path needs: an observation sealed with default
 * input/environment hashes. Returns the 64-char uppercase hex digest and
 * nothing else — the packet carries the seal, never the raw observation.
 *
 * @param {{ probeId: string, observationId: string, result: unknown,
 *   status: string, inputHash?: string, environmentHash?: string }} partial
 * @returns {string}
 */
export function sealObservationDigest(partial) {
  const body = {
    probeId: partial.probeId,
    observationId: partial.observationId,
    inputHash: partial.inputHash ?? '0'.repeat(64),
    environmentHash: partial.environmentHash ?? '0'.repeat(64),
    resultHash: hashResult(partial.result),
    status: partial.status,
  };
  return createHash('sha256')
    .update(canonicalizeJson(body), 'utf8')
    .digest('hex')
    .toUpperCase();
}
