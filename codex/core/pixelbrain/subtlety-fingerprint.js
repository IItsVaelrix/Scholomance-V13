/**
 * SUBTLETY-FINGERPRINT-v1 — the core primitive of the Subtlety Fingerprint APM
 * (PDR §3). A fingerprint is a deterministic, checksummed behavioral identity
 * for a unit of computation, computed from its observable output under a
 * declared identity key and canonicalization config.
 *
 * Two packet modes (PDR §3.2):
 *   - `observed`        — hash the output of a request that ALREADY executed.
 *                         Never re-runs anything. Safe for side-effecting routes.
 *   - `canonical-probe` — run a replay-safe `runFn(seed)` in a side-effect-free
 *                         lane (isolated | shadow | offline-replay) against
 *                         approved canonical inputs. Used for reproducibility.
 *
 * The fingerprint is three-part (PDR §3.3): exactChecksum / semanticChecksum /
 * shapeChecksum, each an SCD64 (sha256Hex → 64-char hex) over a canonical form.
 *
 * Comparison (PDR §3.1) resolves to one of:
 *   stable | approved-change | unexpected-change | within-tolerance |
 *   non-reproducible | incomparable
 * A fingerprint is NOT "same forever": approved evolution lawfully moves it.
 */

import { sha256Hex } from './sha256.js';
import { canonicalForms, defaultCanonConfig, SUBTLETY_CANON_SCHEMA } from './subtlety-canonicalizer.js';

export const SUBTLETY_FINGERPRINT_SCHEMA = 'SUBTLETY-FINGERPRINT-v1';

/** The full §3.1 identity key (for provenance / display). */
const IDENTITY_KEY_FIELDS = [
  'unitId',
  'contractVersion',
  'implementationVersion',
  'canonicalCorpusId',
  'canonicalizerVersion',
  'runtimeProfile',
];

/**
 * COMPARABILITY fields — the measurement context. Two fingerprints are
 * comparable only when these match. Per §3.1, `incomparable` means "different
 * corpus, canonicalizer, or runtime profile" — it does NOT include the version
 * fields. implementationVersion / contractVersion moving is a *behavioral*
 * outcome (approved-change vs unexpected-change), not an incomparability.
 */
const COMPARABILITY_FIELDS = [
  'unitId',
  'canonicalCorpusId',
  'canonicalizerVersion',
  'runtimeProfile',
];

export function identityKeyOf(identity, seed = null) {
  const key = {};
  for (const f of IDENTITY_KEY_FIELDS) key[f] = identity[f] ?? null;
  key.seed = seed ?? null;
  return key;
}

export function identityKeysMatch(a, b) {
  const ka = identityKeyOf(a.identity, a.execution?.seed ?? null);
  const kb = identityKeyOf(b.identity, b.execution?.seed ?? null);
  return COMPARABILITY_FIELDS.every((f) => ka[f] === kb[f]) && ka.seed === kb.seed;
}

function scd64(str) {
  return sha256Hex(str);
}

/**
 * Build a fingerprint packet from an already-produced output (observed mode)
 * or from a canonical-probe run. `seam` is the optional { consumes, emits,
 * mutates } vocabulary borrowed from seam-contract.js.
 */
export function fingerprintOutput(identity, output, opts = {}) {
  const canonicalization = opts.canonicalization?.schema === SUBTLETY_CANON_SCHEMA
    ? opts.canonicalization
    : defaultCanonConfig(opts.canonicalization || {});
  const forms = canonicalForms(output, canonicalization);
  const seam = opts.seam || { consumes: [], emits: [], mutates: [] };

  return {
    schema: SUBTLETY_FINGERPRINT_SCHEMA,
    identity: {
      unitId: identity.unitId,
      unitKind: identity.unitKind || 'path',
      contractVersion: identity.contractVersion ?? null,
      implementationVersion: identity.implementationVersion ?? null,
      canonicalCorpusId: identity.canonicalCorpusId ?? null,
      canonicalizerVersion: canonicalization.version,
    },
    execution: {
      mode: opts.mode || 'observed',
      lane: opts.lane || (opts.mode === 'canonical-probe' ? 'isolated' : 'live'),
      seed: opts.seed ?? null,
      runtimeProfile: identity.runtimeProfile ?? 'default',
      buildId: identity.buildId ?? null,
    },
    fingerprint: {
      exactChecksum: scd64(forms.exact),
      semanticChecksum: scd64(forms.semantic),
      shapeChecksum: scd64(forms.shape),
      consumes: [...(seam.consumes || [])],
      emits: [...(seam.emits || [])],
      mutates: [...(seam.mutates || [])],
    },
    comparison: {
      baselineId: opts.baselineId ?? null,
      baselineBuildId: opts.baselineBuildId ?? null,
      status: 'pending',
      changedPaths: [],
      toleranceApplied: false,
    },
    readings: { drift: null, seam: null, recovery: null },
    provenance: {
      iterationCount: opts.iterationCount ?? 1,
      inputChecksum: opts.inputChecksum ?? null,
      outputChecksum: scd64(forms.exact),
      samplerVersion: opts.samplerVersion ?? 'subtlety-1',
    },
    canonicalization: {
      schema: canonicalization.schema,
      version: canonicalization.version,
      ignoredPaths: [...canonicalization.ignoredPaths],
      orderedPaths: [...canonicalization.orderedPaths],
      numericPolicy: { ...canonicalization.numericPolicy },
      redactionPolicy: { ...canonicalization.redactionPolicy },
    },
  };
}

/**
 * Canonical-probe mode: run `runFn(seed)` in a side-effect-free lane and
 * fingerprint the result. Optionally run `iterations` times to confirm
 * stability — if any run diverges (semanticChecksum differs), the packet's
 * comparison.status is marked `non-reproducible` and iterationCount reflects
 * how many stable runs were observed before divergence.
 */
export function probeUnit(identity, runFn, opts = {}) {
  const iterations = Math.max(1, opts.iterations ?? 1);
  const seed = opts.seed ?? 0;
  const first = runFn(seed);
  const packet = fingerprintOutput(identity, first, { ...opts, mode: 'canonical-probe', seed, iterationCount: 1 });
  const baseSemantic = packet.fingerprint.semanticChecksum;

  let stable = 1;
  let reproducible = true;
  for (let i = 1; i < iterations; i += 1) {
    const out = runFn(seed);
    const forms = canonicalForms(out, packet.canonicalization);
    if (scd64(forms.semantic) !== baseSemantic) {
      reproducible = false;
      break;
    }
    stable += 1;
  }
  packet.provenance.iterationCount = stable;
  if (!reproducible) {
    packet.comparison.status = 'non-reproducible';
  } else {
    // Fully reproducible across all iterations → resolves to `stable` (PDR §3.1).
    // Without this branch a clean probe would stay `pending`, leaving stability
    // unlabeled while divergence is labeled — an asymmetry that hides the
    // "controlled variability is NOT drift" guarantee (PDR §11.2).
    packet.comparison.status = 'stable';
  }
  return packet;
}

/**
 * Structural diff of two outputs → list of top-level paths that differ.
 * Used to populate comparison.changedPaths.
 */
export function diffPaths(a, b) {
  const changed = [];
  const aObj = a && typeof a === 'object' && !Array.isArray(a) ? a : { '': a };
  const bObj = b && typeof b === 'object' && !Array.isArray(b) ? b : { '': b };
  const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
  for (const k of [...keys].sort()) {
    const av = canonicalForms(aObj[k]).semantic;
    const bv = canonicalForms(bObj[k]).semantic;
    if (av !== bv) changed.push(k);
  }
  return changed;
}

function versionMoved(a, b) {
  return (
    a.identity.implementationVersion !== b.identity.implementationVersion ||
    a.identity.contractVersion !== b.identity.contractVersion
  );
}

/**
 * Compare two fingerprint packets per the §3.1 model. Optionally pass the two
 * raw outputs ({ aOutput, bOutput }) to populate changedPaths.
 * Returns a comparison object: { status, changedPaths, toleranceApplied, ... }.
 */
export function compareFingerprints(a, b, opts = {}) {
  const result = {
    baselineId: b.identity?.unitId ?? null,
    baselineBuildId: b.execution?.buildId ?? null,
    status: 'stable',
    changedPaths: [],
    toleranceApplied: false,
    reason: null,
  };

  // §3.1 — incomparable when identity keys do not match.
  if (!identityKeysMatch(a, b)) {
    result.status = 'incomparable';
    result.reason = 'identity-key-mismatch';
    return result;
  }

  const fa = a.fingerprint;
  const fb = b.fingerprint;
  const moved = versionMoved(a, b);
  if (opts.aOutput !== undefined && opts.bOutput !== undefined) {
    result.changedPaths = diffPaths(opts.aOutput, opts.bOutput);
  }

  // Shape change → contract/schema change, escalated regardless of the rest.
  if (fa.shapeChecksum !== fb.shapeChecksum) {
    result.status = moved ? 'approved-change' : 'unexpected-change';
    result.reason = 'shape-changed';
    return result;
  }

  // Semantic match → behaviorally identical.
  if (fa.semanticChecksum === fb.semanticChecksum) {
    if (fa.exactChecksum === fb.exactChecksum) {
      result.status = 'stable';
    } else {
      result.status = 'within-tolerance';
      result.toleranceApplied = true;
      result.reason = 'representational-variance';
    }
    return result;
  }

  // Semantic differs → genuine behavioral change.
  result.status = moved ? 'approved-change' : 'unexpected-change';
  result.reason = moved ? 'approved-version-move' : 'semantic-drift';
  return result;
}
