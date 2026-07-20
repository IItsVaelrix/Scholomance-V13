import { canonicalStringify } from './canonical-json.js';

/**
 * LENS I — CHROMA-DRIFT (Correctness) for the Subtlety Fingerprint APM (PDR §5).
 *
 * Watches a fingerprint *changing* for a fixed canonical input over time. This
 * is BytecodeHealth's 100-iteration verification, but sampled over a set of
 * readings rather than run once at a gate.
 *
 * The drift verdict is read against the three-part checksum (§3.3):
 *   - exactChecksum varies but semanticChecksum holds → `within-tolerance`
 *     (representational noise, NOT drift — does not lower the determinism score)
 *   - semanticChecksum varies under an unchanged approved key → genuine drift
 *     (`non-reproducible` / `unexpected-change`) — this is the signal.
 *
 * Two-sided by construction (PDR §11.2): a seeded RNG reproduces identical
 * readings → score 1.0, no alert. A genuine nondeterminism source produces
 * divergent semanticChecksums → score < 1.0 and a divergence alert fires while
 * a conventional error monitor stays silent (every reading was still a "200").
 */

/**
 * Analyze a set of fingerprint readings for the same unit + canonical input.
 * `readings` is an array of SUBTLETY-FINGERPRINT-v1 packets.
 *
 * Returns:
 *   {
 *     determinismScore,  // fraction of readings matching the baseline semanticChecksum
 *     status,            // stable | within-tolerance | non-reproducible
 *     driftRate,         // fraction of readings that are genuine (semantic) drift
 *     divergenceAlerts,  // [{ code, message, ... }] — fires on non-reproducibility
 *     baselineSemantic,  // the majority semanticChecksum
 *   }
 */
/**
 * Deterministic signature of a reading's canonicalization config. Two readings
 * are comparable for drift ONLY when this matches — different ignoredPaths /
 * orderedPaths / numericPolicy / redactionPolicy legitimately produce different
 * semanticChecksums WITHOUT any nondeterminism (PDR §3.3: canonicalization is a
 * first-class, versioned subsystem; its config is part of comparability, §3.1).
 */
function configSignature(reading) {
  return canonicalStringify(reading?.canonicalization ?? {});
}

export function detectDrift(readings) {
  const list = Array.isArray(readings) ? readings : [];
  if (list.length === 0) {
    return {
      determinismScore: 1,
      status: 'stable',
      driftRate: 0,
      divergenceAlerts: [],
      baselineSemantic: null,
    };
  }

  // CONFIG-AWARENESS (PDR §3.1 / §3.3): readings canonicalized under different
  // configs are NOT comparable — different ignoredPaths / orderedPaths /
  // numericPolicy legitimately change the semanticChecksum without any
  // nondeterminism. Group by config signature and compute drift within the
  // majority (primary) config group only; readings from other configs are
  // reported as incomparable, never as drift. This is what prevents a config
  // change from being misread as tissue damage.
  const groups = new Map(); // configSig -> readings[]
  for (const r of list) {
    const sig = configSignature(r);
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig).push(r);
  }
  let primary = [];
  for (const groupReadings of groups.values()) {
    if (groupReadings.length > primary.length) primary = groupReadings;
  }
  const comparable = primary;
  const incomparableConfigs = list.length - comparable.length;

  // Baseline = the most common semanticChecksum (majority vote) within the
  // primary config group.
  const counts = new Map();
  for (const r of comparable) {
    const s = r.fingerprint?.semanticChecksum;
    counts.set(s, (counts.get(s) || 0) + 1);
  }
  let baselineSemantic = null;
  let best = -1;
  for (const [s, c] of counts) {
    if (c > best) { best = c; baselineSemantic = s; }
  }

  // Genuine drift = semantic divergence from baseline. Representational-only
  // variance (exact differs, semantic holds) is within-tolerance, not drift.
  let semanticMatches = 0;
  let exactMatches = 0;
  const baselineExact = comparable.find((r) => r.fingerprint?.semanticChecksum === baselineSemantic)
    ?.fingerprint?.exactChecksum;
  const divergentReadings = [];

  for (const r of comparable) {
    const sem = r.fingerprint?.semanticChecksum;
    if (sem === baselineSemantic) {
      semanticMatches += 1;
      if (r.fingerprint?.exactChecksum === baselineExact) exactMatches += 1;
    } else {
      divergentReadings.push(r);
    }
  }

  const n = comparable.length;
  const determinismScore = semanticMatches / n;
  const driftRate = divergentReadings.length / n;

  const divergenceAlerts = [];
  let status = 'stable';

  if (divergentReadings.length > 0) {
    status = 'non-reproducible';
    divergenceAlerts.push({
      code: 'SUBTLETY_DRIFT_NON_REPRODUCIBLE',
      message:
        `Unit produced ${divergentReadings.length}/${n} divergent semantic checksum(s) ` +
        `for identical canonical input — nondeterminism detected while every reading still succeeded.`,
      baselineSemantic,
      divergentCount: divergentReadings.length,
      totalCount: n,
    });
  } else if (exactMatches < n) {
    // All semantic match, but some exact differ → representational variance only.
    status = 'within-tolerance';
  }

  return {
    determinismScore,
    status,
    driftRate,
    divergenceAlerts,
    baselineSemantic,
    incomparableConfigs,
    configGroups: groups.size,
  };
}
