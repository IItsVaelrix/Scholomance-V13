/**
 * PATHOLOGY VACCINE — mint a PB-XP-v1 vaccine from a verified pathology.
 *
 * A vaccine is not a cure and does not edit code. Per
 * PDR-2026-06-04-BYTECODE-XP-QBIT-VACCINES: "A vaccine is not the original
 * error or health signal. It is a compact, checksummed adapter artifact." It
 * primes RECOGNITION — the second exposure is cheap.
 *
 * ── Why identity and census are separated ────────────────────────────────────
 * The vaccine fingerprints the PATHOLOGY: its class, its verifier, and the
 * recovery shape that retires it. It deliberately does NOT fingerprint the
 * hotspot census, because a census changes every time somebody fixes one site.
 * A vaccine whose id moved on every repair could never be referenced, cited in
 * a commit, or compared across runs — it would be a timestamp wearing an
 * immunological name, which the PDR's own non-goal forbids ("do not store
 * volatile runtime timing in vaccine checksums").
 *
 * The volatile part rides on the QBIT pulse instead, which is built for exactly
 * that: `buildQbitPulseNode(vaccine, { hotspots })`, capped at 12. Identity is
 * stable; the map of where the disease currently lives is not.
 *
 * ── recoveryKey is the load-bearing field ────────────────────────────────────
 * It names the shape that makes the finding legitimately go away, drawn from
 * cleri-probe's own RECOVERY_RETURN_KEYS. For SWALLOWED_ERROR that is a catch
 * returning a documented fallback that NAMES the error:
 *
 *     catch (error) { return { ok: false, error, fallback: [] }; }
 *
 * which satisfies the verifier's APPROVED_RECOVERY_RETURN countercheck. A
 * vaccine carrying a recoveryKey the verifier does not recognise would teach
 * the system a repair that never clears the finding, so the key is validated
 * against that list at mint time rather than trusted.
 */

import { BytecodeXPVaccine, BYTECODE_XP_SOURCE_KINDS } from '../diagnostic/BytecodeXPVaccine.js';
import { buildQbitPulseNode } from '../diagnostic/QbitPulse.js';
import { buildQbitHotspotsFromCleriReport } from '../diagnostic/QbitProbeEnrichment.js';
import { buildBytecodeXPMemoryEnvelope } from '../diagnostic/QbitMemoryPersistence.js';
import { RECOVERY_RETURN_KEYS } from './cleri-probe/scholomance-profile.js';

/** Slugs are [A-Z0-9]{4,8}; these are declared, not derived, so ids stay readable. */
export const PATHOLOGY_SLUGS = Object.freeze({
  SWALLOWED_ERROR: 'SWALERR',
  UNSEEDED_RANDOMNESS: 'UNSEED',
  UNSAFE_EXTERNAL_RESPONSE_ACCESS: 'EXTRESP',
  CONCURRENT_SHARED_STATE_MUTATION: 'CONCMUT',
  LISTENER_LIFECYCLE_LEAK: 'LSNRLEAK',
});

/**
 * @param {object} input
 * @param {string} input.pathologyClass  e.g. 'SWALLOWED_ERROR'
 * @param {string} input.verifierId      the verifier that proved it, e.g. 'swallowed-error/v1'
 * @param {string} input.recoveryKey     must appear in RECOVERY_RETURN_KEYS
 * @param {string} input.safePattern     the shape that retires the finding
 * @param {string} [input.semanticSlug]  override the declared slug
 * @returns {BytecodeXPVaccine}
 */
export function mintPathologyVaccine({ pathologyClass, verifierId, recoveryKey, safePattern, semanticSlug }) {
  if (!pathologyClass) throw new TypeError('mintPathologyVaccine requires a pathologyClass');
  if (!verifierId) throw new TypeError('mintPathologyVaccine requires the verifierId that proved it');
  if (!safePattern) throw new TypeError('mintPathologyVaccine requires a safePattern');

  // An unrecognised recovery key would immunise against nothing: applying it
  // leaves the verifier still convicting the site.
  if (!RECOVERY_RETURN_KEYS.includes(recoveryKey)) {
    throw new RangeError(
      `recoveryKey "${recoveryKey}" is not one of cleri-probe's approved recovery keys `
      + `(${RECOVERY_RETURN_KEYS.join(', ')}). A repair the verifier does not credit is not a repair.`,
    );
  }

  const slug = semanticSlug || PATHOLOGY_SLUGS[pathologyClass];
  if (!slug) throw new RangeError(`No semanticSlug declared for pathologyClass ${pathologyClass}`);

  return new BytecodeXPVaccine({
    sourceKind: BYTECODE_XP_SOURCE_KINDS.ERROR,
    semanticSlug: slug,
    recoveryKey,
    // Stable identity only. No counts, no paths, no timestamps.
    stableContext: { pathologyClass, verifierId, safePattern },
  });
}

/**
 * Attach a vaccine to a VERIFIED cleri-probe report, and seal the pair into a
 * SCHOL-BYTXP-MEM-v1 envelope so it outlives the process that minted it.
 *
 * The hotspots come from `buildQbitHotspotsFromCleriReport`, not from a local
 * reimplementation, because that function does two things worth having: it
 * runs `verifyInvestigationReport` and REFUSES a tampered report, and it keeps
 * only findings whose verdict is VERIFIED. A vaccine built from nominations
 * would immunise against guesses.
 *
 * @param {BytecodeXPVaccine} vaccine
 * @param {object} report  a SCHOL-CLERI-PROBE-v2 investigation report
 * @param {{maxHotspots?: number, labels?: string[], agentId?: string}} [options]
 * @returns {{envelope: object, pulse: object, enrichment: object}}
 */
export function sealVaccineFromReport(vaccine, report, options = {}) {
  const enrichment = buildQbitHotspotsFromCleriReport(report, { maxHotspots: options.maxHotspots });
  const pulse = buildQbitPulseNode(vaccine, {
    hotspots: enrichment.hotspots,
    maxHotspots: options.maxHotspots,
  });

  const envelope = buildBytecodeXPMemoryEnvelope({
    vaccine,
    pulse,
    enrichment,
    labels: options.labels ?? [vaccine.stableContext.pathologyClass],
    provenance: {
      reportId: report.reportId ?? null,
      reportBytecode: report.bytecode ?? null,
      verifierId: vaccine.stableContext.verifierId,
    },
  });

  return { envelope, pulse, enrichment };
}

/**
 * Attach a minted vaccine to where the pathology currently lives, weighting by
 * DANGER rather than density.
 *
 * `buildQbitHotspotsFromCleriReport` sets every verified finding to resonance 1,
 * which is correct for it — a verified finding is a verified finding. But for
 * ranking WHERE TO LOOK FIRST that flattens a real distinction: collab.routes.js
 * carries 40 findings that are all `catch (error) { return sendServiceError(...) }`,
 * i.e. correct code, and outranks a file with three silent fallbacks.
 *
 * So callers pass `weightOf`. Without it this counts findings, and counting is
 * exactly the failure above — the first version of this function documented the
 * weighting and then summed 1 per finding, and the sealed pulse duly led with
 * the file whose forty findings were all correct.
 *
 * @param {BytecodeXPVaccine} vaccine
 * @param {Array<{path: string}>} findings
 * @param {{weightOf?: (f: object) => number, maxHotspots?: number, reason?: string}} [options]
 */
export function pulseFromFindings(vaccine, findings, options = {}) {
  const weightOf = options.weightOf ?? (() => 1);
  const weights = new Map();
  for (const finding of findings) {
    const path = finding?.path;
    if (!path) continue;
    const weight = Number(weightOf(finding));
    if (!Number.isFinite(weight)) {
      throw new TypeError(`weightOf returned a non-finite weight for ${path}`);
    }
    weights.set(path, (weights.get(path) ?? 0) + weight);
  }
  const peak = Math.max(1e-9, ...weights.values());
  const hotspots = [...weights.entries()].map(([path, weight]) => ({
    path,
    resonance: Math.min(1, weight / peak),
    reason: options.reason || `${vaccine.stableContext.pathologyClass}:${weight.toFixed(2)}`,
  }));

  return buildQbitPulseNode(vaccine, { hotspots, maxHotspots: options.maxHotspots });
}
