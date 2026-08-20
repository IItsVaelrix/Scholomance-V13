/**
 * Deterministic helpers for the gold-adjudication harness.
 * PURE. No I/O.
 */

import { createHash } from 'node:crypto';

export function fnv1a(text) {
  let hash = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function seededShuffle(items, seedText) {
  const arr = [...items];
  let s = fnv1a(seedText);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function sha256Hex(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

export function caseIdOf({ query, senseIds, contract }) {
  const payload = JSON.stringify({
    query: String(query ?? ''),
    senseIds: [...(senseIds || [])],
    contract: String(contract ?? ''),
  });
  return `adj-${sha256Hex(payload).slice(0, 16)}`;
}

export function contextTokensOf(identity) {
  const tokens = Array.isArray(identity?.tokens) ? identity.tokens : [];
  const head = String(identity?.primaryContentToken || '').toLowerCase();
  return tokens.filter((t) => String(t).toLowerCase() !== head);
}
