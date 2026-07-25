/**
 * Claim Preservation — the real honesty invariant (spec §5.2).
 *
 * Token provenance is necessary but insufficient: a rewrite can reuse only legal tokens
 * and still assert a false proposition. This module extracts a compact fact structure
 * (an `EvidenceClaim`) from a bullet and asserts that a draft preserves the
 * claim-relationship under a per-rule permit:
 *
 *   - role (owner/contributor/support, derived from the verb) is preserved EXACTLY
 *     — "assisted"→"managed" (escalation) and "managed"→"assisted" (downgrade) both reject;
 *   - a quantity's `bindsTo` (and value) cannot change — "15% revenue" ≠ "15% engagement";
 *   - no object may be introduced that the source lacked.
 *
 * Fail closed: if a claim cannot be confidently parsed (no clear head verb), the
 * suggestion is discarded. Recall is traded for zero fabrication.
 */
import {
  WEAK_VERBS,
  STRONG_VERBS,
  KNOWN_VERBS,
} from '../../amplify/data/verb-classes.js';
import type { EvidenceClaim, TransformationPermit, HonestyVerdict } from '../types.js';
import type { TextSpan } from '../../parser/types.js';

const BULLET_PREFIX = /^(?:[•·▪◦–—*-]|\d+[.)])\s+/;

/** Ownership/role lexicon (extends verb-classes.ts). The head verb determines role. */
const OWNER_VERBS: ReadonlySet<string> = new Set([
  'led', 'managed', 'owned', 'spearheaded', 'directed', 'headed', 'oversaw', 'ran',
  'founded', 'built', 'engineered', 'designed', 'architected', 'created', 'developed',
  'implemented', 'delivered', 'launched', 'shipped', 'automated', 'migrated', 'drove',
  'established', 'orchestrated', 'produced', 'authored', 'wrote', 'negotiated',
  'resolved', 'coordinated', 'trained', 'reduced', 'cut', 'increased', 'grew',
  'improved', 'saved', 'devised', 'modeled', 'enhanced', 'refined',
]);

const SUPPORT_VERBS: ReadonlySet<string> = new Set([
  'assisted', 'helped', 'supported', 'aided', 'facilitated', 'served', 'enabled',
  'maintained', 'handled', 'performed', 'worked', 'participated', 'attended',
]);

const CONTRIBUTOR_VERBS: ReadonlySet<string> = new Set([
  'contributed', 'collaborated', 'partnered', 'coauthored', 'codeveloped', 'coled',
]);

const PREPOSITIONS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'of', 'to', 'in', 'on', 'for', 'with', 'at', 'by', 'from', 'as',
  'and', 'or', 'that', 'this', 'their', 'our', 'my', 'your', 'his', 'her', 'its',
  'into', 'onto', 'across', 'through', 'within', 'during', 'toward', 'towards', 'alongside',
]);

/** Map a head verb to its role. Returns null when the verb is not confidently known. */
export function roleOfVerb(verb: string): 'owner' | 'contributor' | 'support' | null {
  const v = String(verb || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!v) return null;
  if (OWNER_VERBS.has(v)) return 'owner';
  if (SUPPORT_VERBS.has(v)) return 'support';
  if (CONTRIBUTOR_VERBS.has(v)) return 'contributor';
  // Extend coverage with the curated amplify verb classes.
  if (STRONG_VERBS.has(v)) return 'owner';
  if (WEAK_VERBS.has(v)) {
    // contributed/participated are the contributor-ish weak verbs; the rest are support.
    return v === 'contributed' || v === 'participated' ? 'contributor' : 'support';
  }
  if (KNOWN_VERBS.has(v)) return 'owner'; // wrote/ran/oversaw/made/...
  return null;
}

function stripMarker(text: string): string {
  const trimmed = String(text ?? '').trim();
  const marker = BULLET_PREFIX.exec(trimmed);
  return (marker ? trimmed.slice(marker[0].length) : trimmed).trim();
}

function alphaTokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z-]*/g) || []);
}

/** First alphabetic token (the head verb candidate). */
function headVerb(cleanText: string): string | null {
  const m = /[a-z][a-z-]*/i.exec(cleanText.toLowerCase());
  return m ? m[0] : null;
}

const NUMBER_RE = /\b(\d+(?:\.\d+)?%?)\b/;

/** Extract the noun a stated number binds to: the first non-stopword noun after it. */
function quantityBinding(cleanText: string): { value: string; bindsTo: string } | undefined {
  const m = NUMBER_RE.exec(cleanText);
  if (!m) return undefined;
  const value = m[1];
  const after = cleanText.slice(m.index + m[0].length);
  const tokens = alphaTokens(after);
  const bindsTo = tokens.find((t) => !PREPOSITIONS.has(t)) || '';
  return { value, bindsTo };
}

/** First object noun after the head verb (first non-stopword alpha token after the verb). */
function extractObject(cleanText: string, verb: string): string | undefined {
  const lower = cleanText.toLowerCase();
  const verbIdx = lower.indexOf(verb);
  const after = verbIdx === -1 ? lower : lower.slice(verbIdx + verb.length);
  const tokens = alphaTokens(after);
  const obj = tokens.find((t) => !PREPOSITIONS.has(t) && t !== verb);
  return obj;
}

/**
 * Extract a compact claim from a bullet. Returns null when no clear head verb is found
 * (fail closed). Unknown head verbs default to `contributor` so a same-verb vocab edit
 * still parses, but a verb CHANGE into/out of a known role is still caught.
 */
export function extractClaim(text: string, sourceSpan: TextSpan): EvidenceClaim | null {
  const clean = stripMarker(text);
  if (!clean) return null;

  const verb = headVerb(clean);
  if (!verb) return null;

  const knownRole = roleOfVerb(verb);
  const role = knownRole ?? 'contributor';

  return {
    subject: 'candidate',
    action: verb,
    object: extractObject(clean, verb),
    quantity: quantityBinding(clean),
    role,
    qualifiers: [],
    sourceSpan,
  };
}

/**
 * Assert that `afterClaim` preserves `beforeClaim` under `permit`. The three hard
 * invariants (role, quantity binding, no added object) always apply; the permit's
 * `false` fields are non-negotiable.
 */
export function assertClaimPreserved(
  beforeClaim: EvidenceClaim,
  afterClaim: EvidenceClaim,
  permit: TransformationPermit
): HonestyVerdict {
  // 1. Role preserved EXACTLY (no escalation, no downgrade).
  if (beforeClaim.role !== afterClaim.role) {
    return {
      ok: false,
      reason: `role_${beforeClaim.role}_to_${afterClaim.role}`,
    };
  }

  // 2. Quantity binding preserved.
  const bq = beforeClaim.quantity;
  const aq = afterClaim.quantity;
  if (bq && aq) {
    if (bq.bindsTo && aq.bindsTo && bq.bindsTo !== aq.bindsTo) {
      return { ok: false, reason: `quantity_rebind_${bq.bindsTo}_to_${aq.bindsTo}` };
    }
    if (bq.value !== aq.value) {
      return { ok: false, reason: `quantity_value_${bq.value}_to_${aq.value}` };
    }
  } else if (bq && !aq) {
    // A stated metric was dropped — losing a fact.
    return { ok: false, reason: 'quantity_dropped' };
  } else if (!bq && aq && !permit.mayPromoteExistingMetric) {
    return { ok: false, reason: 'quantity_added' };
  }

  // 3. No object introduced that the source lacked.
  if (!permit.mayAddObject && !beforeClaim.object && afterClaim.object) {
    return { ok: false, reason: 'object_added' };
  }

  return { ok: true };
}

/** The standard permits used by the drafting rules. */
export const PERMITS = Object.freeze({
  vocabulary: Object.freeze({
    mayReplaceActionVocabulary: true,
    mayReorderClauses: false,
    mayPromoteExistingMetric: false,
    mayChangeOwnership: false,
    mayChangeQuantityBinding: false,
    mayAddObject: false,
  }) as TransformationPermit,
  quantify: Object.freeze({
    mayReplaceActionVocabulary: false,
    mayReorderClauses: false,
    mayPromoteExistingMetric: true,
    mayChangeOwnership: false,
    mayChangeQuantityBinding: false,
    mayAddObject: false,
  }) as TransformationPermit,
});
