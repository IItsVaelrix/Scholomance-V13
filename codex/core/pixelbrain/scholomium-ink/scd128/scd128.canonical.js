/**
 * Scholomium Ink — SCD128 Canonical Serialization and Hashing
 *
 * Enforces pure deterministic serialization of slot records, exact values,
 * parameters, full 256-bit SHA-256 digests, and 8-character block generation.
 *
 * Rules:
 * - ExactValue is integer, string enum, boolean, or normalized rational { numerator, denominator }.
 * - Binary floating-point numbers, NaN, and Infinity are strictly rejected.
 * - Object keys are sorted lexicographically.
 * - Digests are 64 uppercase hex characters.
 * - Slot 0 block begins with the bank's version prefix ('81' or '91') + 6 hex chars.
 * - Slots 1..7 use the first 8 hex characters of the slot digest.
 * - Truncated-block collision detection fails closed.
 */

import { sha256Hex } from '../../sha256.js';
import {
  FORM64_VERSION_PREFIX,
  REALIZATION64_VERSION_PREFIX,
  SCD128_ERROR_CODES,
  DIGEST256_REGEX,
} from './scd128.constants.js';

/**
 * Validates that a value is a legal ExactValue:
 * - integer (safe JS integer)
 * - boolean
 * - string
 * - normalized rational: { numerator: string, denominator: string }
 */
export function isExactValue(val) {
  if (val === null || val === undefined) return false;
  if (typeof val === 'boolean') return true;
  if (typeof val === 'string') return true;
  if (typeof val === 'number') {
    return Number.isSafeInteger(val);
  }
  if (typeof val === 'object') {
    if (Array.isArray(val)) {
      return val.every(isExactValue);
    }
    const keys = Object.keys(val);
    if (keys.length === 2 && 'numerator' in val && 'denominator' in val) {
      if (typeof val.numerator !== 'string' || typeof val.denominator !== 'string') return false;
      if (!/^-?\d+$/.test(val.numerator) || !/^\d+$/.test(val.denominator)) return false;
      try {
        const d = BigInt(val.denominator);
        if (d <= 0n) return false;
        const n = BigInt(val.numerator);
        // Verify reduced to lowest terms: gcd(abs(n), d) === 1
        const absN = n < 0n ? -n : n;
        if (gcdBigInt(absN, d) !== 1n) return false;
        return true;
      } catch {
        return false;
      }
    }
    // Generic nested object with exact values
    return keys.every((k) => isExactValue(val[k]));
  }
  return false;
}

function gcdBigInt(a, b) {
  let x = a;
  let y = b;
  while (y !== 0n) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

/**
 * Recursively canonicalizes an exact value or object:
 * - Object keys sorted alphabetically
 * - Arrays preserve order or sort if set-like
 * - Floats and NaN rejected
 */
export function canonicalizeValue(val) {
  if (val === null || val === undefined) {
    throw new TypeError('Null or undefined values not allowed in SCD128 canonical data');
  }
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') return val;
  if (typeof val === 'number') {
    if (!Number.isSafeInteger(val)) {
      throw new TypeError(`Non-integer float '${val}' not permitted in SCD128 canonicalization`);
    }
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(canonicalizeValue);
  }
  if (typeof val === 'object') {
    const sorted = {};
    const keys = Object.keys(val).sort();
    for (const key of keys) {
      sorted[key] = canonicalizeValue(val[key]);
    }
    return sorted;
  }
  throw new TypeError(`Unsupported type in canonicalizeValue: ${typeof val}`);
}

/**
 * Compact deterministic JSON stringify with sorted keys.
 */
export function canonicalStringify(val) {
  const canonical = canonicalizeValue(val);
  return JSON.stringify(canonical);
}

/**
 * Computes uppercase 64-char SHA-256 digest of a value.
 */
export function computeCanonicalDigest256(val) {
  const text = canonicalStringify(val);
  return sha256Hex(text).toUpperCase();
}

/**
 * Derives the 8-character blockHex for a slot record.
 * - If position === 0 and bank is 'form', '81' + digest256.slice(0, 6)
 * - If position === 0 and bank is 'realization', '91' + digest256.slice(0, 6)
 * - Otherwise: digest256.slice(0, 8)
 */
export function deriveSlotBlockHex(slotDigest256, position, bank) {
  if (!DIGEST256_REGEX.test(slotDigest256)) {
    throw new TypeError(`Invalid digest256: ${slotDigest256}`);
  }
  if (position === 0) {
    const prefix = bank === 'form' ? FORM64_VERSION_PREFIX : REALIZATION64_VERSION_PREFIX;
    return (prefix + slotDigest256.slice(0, 6)).toUpperCase();
  }
  return slotDigest256.slice(0, 8).toUpperCase();
}

/**
 * Verifies that no two distinct slot digests produce identical blockHex.
 * Throws or returns an error if a truncated-block collision is detected.
 */
export function assertNoBlockCollisions(slots) {
  const blockMap = new Map();
  for (const slot of slots) {
    const block = slot.blockHex;
    const digest = slot.digest256;
    if (blockMap.has(block)) {
      const existing = blockMap.get(block);
      if (existing.digest !== digest) {
        const err = new Error(
          `SCD128 block collision detected: slots '${existing.slot}' and '${slot.slot}' have different full digests (${existing.digest} vs ${digest}) but collide at block ${block}`
        );
        err.code = SCD128_ERROR_CODES.BLOCK_COLLISION;
        throw err;
      }
    } else {
      blockMap.set(block, { slot: slot.slot, digest });
    }
  }
}
