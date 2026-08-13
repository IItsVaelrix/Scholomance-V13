// @vitest-environment node
/**
 * PATHOLOGY VACCINE — PB-XP-v1 minted from a verified pathology.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { mintPathologyVaccine, pulseFromFindings, sealVaccineFromReport, PATHOLOGY_SLUGS } from '../../../codex/core/immunity/pathology-vaccine.js';
import { verifyBytecodeXPMemoryEnvelope, buildBytecodeXPMemoryKey, buildBytecodeXPMemoryEnvelope } from '../../../codex/core/diagnostic/QbitMemoryPersistence.js';
import { RECOVERY_RETURN_KEYS } from '../../../codex/core/immunity/cleri-probe/scholomance-profile.js';

const SWALLOWED = Object.freeze({
  pathologyClass: 'SWALLOWED_ERROR',
  verifierId: 'swallowed-error/v1',
  recoveryKey: 'fallback',
  safePattern: 'catch (error) { return { ok: false, error, fallback: [] }; }',
});

describe('minting', () => {
  it('produces a PB-XP-v1 bytecode carrying the pathology slug', () => {
    const vaccine = mintPathologyVaccine(SWALLOWED);
    expect(vaccine.bytecode).toMatch(/^PB-XP-v1-ERR-SWALERR-[0-9a-f]{12}-[0-9a-f]{12}$/);
    expect(vaccine.semanticSlug).toBe(PATHOLOGY_SLUGS.SWALLOWED_ERROR);
    expect(vaccine.recoveryKey).toBe('fallback');
  });

  it('is deterministic — the PDR requires a stable fingerprint', () => {
    expect(mintPathologyVaccine(SWALLOWED).bytecode).toBe(mintPathologyVaccine(SWALLOWED).bytecode);
  });

  /**
   * A repair the verifier does not credit is not a repair. APPROVED_RECOVERY_RETURN
   * only clears a finding when the returned object carries one of cleri-probe's
   * own recovery keys, so a vaccine teaching any other shape would immunise
   * against nothing while looking authoritative.
   */
  it('refuses a recoveryKey the verifier would not credit', () => {
    expect(() => mintPathologyVaccine({ ...SWALLOWED, recoveryKey: 'handled' }))
      .toThrow(/not one of cleri-probe's approved recovery keys/i);
    expect(RECOVERY_RETURN_KEYS).toContain('fallback');
  });

  it('refuses to invent an identity for an undeclared pathology', () => {
    expect(() => mintPathologyVaccine({ ...SWALLOWED, pathologyClass: 'NOT_A_PATHOLOGY' }))
      .toThrow(/No semanticSlug declared/i);
  });

  it('rejects a mint with no proving verifier', () => {
    expect(() => mintPathologyVaccine({ ...SWALLOWED, verifierId: undefined })).toThrow(/verifierId/i);
  });
});

describe('identity versus census', () => {
  /**
   * THE LOAD-BEARING PROPERTY. The vaccine fingerprints the pathology, never the
   * hotspot census. If the id moved every time somebody fixed one site, it could
   * not be cited in a commit or compared across runs — it would be a timestamp
   * wearing an immunological name, which the PDR's non-goal forbids.
   */
  it('keeps the same bytecode no matter where the disease currently lives', () => {
    const vaccine = mintPathologyVaccine(SWALLOWED);
    const before = vaccine.bytecode;

    pulseFromFindings(vaccine, [{ path: 'a.js' }, { path: 'a.js' }, { path: 'b.js' }]);
    pulseFromFindings(vaccine, Array.from({ length: 400 }, (_, i) => ({ path: `f${i % 30}.js` })));

    expect(vaccine.bytecode).toBe(before);
  });

  /**
   * REGRESSION. The first version documented danger-weighting and then summed 1
   * per finding, so the sealed pulse led with collab.routes.js — whose forty
   * findings are all `catch (error) { return sendServiceError(reply, error); }`,
   * i.e. correct code. Counting is not triage.
   */
  it('weights by danger when given weightOf, not by finding count', () => {
    const vaccine = mintPathologyVaccine(SWALLOWED);
    const findings = [
      ...Array.from({ length: 40 }, () => ({ path: 'correct.js', cls: 'SKIP_ONLY' })),
      ...Array.from({ length: 3 }, () => ({ path: 'dangerous.js', cls: 'SILENT_FALLBACK' })),
    ];
    const weights = { SKIP_ONLY: 0.15, SILENT_FALLBACK: 1.0 };
    const pulse = pulseFromFindings(vaccine, findings, { weightOf: (f) => weights[f.cls] });

    // 3 x 1.0 = 3.0 beats 40 x 0.15 = 6.0? No — it does not, and that is the
    // point: the caller's weights decide, not the row count. Assert the ratio.
    const byPath = Object.fromEntries(pulse.hotspots.map((h) => [h.path, h.resonance]));
    expect(byPath['dangerous.js'] / byPath['correct.js']).toBeCloseTo(3.0 / 6.0, 5);

    // Unweighted, the correct file wins purely on volume.
    const flat = pulseFromFindings(vaccine, findings);
    expect(flat.hotspots[0].path).toBe('correct.js');
  });

  it('rejects a non-finite weight rather than poisoning the field', () => {
    const vaccine = mintPathologyVaccine(SWALLOWED);
    expect(() => pulseFromFindings(vaccine, [{ path: 'a.js' }], { weightOf: () => Number.NaN }))
      .toThrow(/non-finite/i);
  });

  it('puts the volatile map on the pulse, capped, ordered by density', () => {
    const vaccine = mintPathologyVaccine(SWALLOWED);
    const findings = [
      ...Array.from({ length: 10 }, () => ({ path: 'hot.js' })),
      ...Array.from({ length: 5 }, () => ({ path: 'warm.js' })),
      { path: 'cold.js' },
    ];
    const pulse = pulseFromFindings(vaccine, findings);

    expect(pulse.vaccineId).toBe(vaccine.vaccineId);
    expect(pulse.hotspots[0].path).toBe('hot.js');
    expect(pulse.hotspots[0].resonance).toBe(1);
    expect(pulse.hotspots.at(-1).path).toBe('cold.js');
    expect(pulse.pulseRadius).toBe(1);
  });

  it('bounds hotspots so a 600-finding pathology stays traversable', () => {
    const vaccine = mintPathologyVaccine(SWALLOWED);
    const findings = Array.from({ length: 600 }, (_, i) => ({ path: `file${i}.js` }));
    expect(pulseFromFindings(vaccine, findings).hotspots.length).toBeLessThanOrEqual(12);
  });

  it('ignores findings with no path rather than minting a nameless hotspot', () => {
    const vaccine = mintPathologyVaccine(SWALLOWED);
    const pulse = pulseFromFindings(vaccine, [{ path: 'real.js' }, { path: null }, {}]);
    expect(pulse.hotspots).toHaveLength(1);
    expect(pulse.hotspots[0].path).toBe('real.js');
  });
});


describe('sealing a vaccine into memory', () => {
  // A committed fixture, not a scratch path: a test that reads an agent's temp
  // directory passes for exactly one person and fails silently for everyone else.
  const report = JSON.parse(readFileSync(
    new URL('../../fixtures/cleri/swallowed-error-report.json', import.meta.url), 'utf8',
  ));

  it('seals vaccine, pulse and enrichment into a verifying envelope', () => {
    const vaccine = mintPathologyVaccine(SWALLOWED);
    const { envelope, pulse, enrichment } = sealVaccineFromReport(vaccine, report);

    expect(envelope.schema).toBe('SCHOL-BYTXP-MEM-v1');
    expect(verifyBytecodeXPMemoryEnvelope(envelope)).toBe(true);
    expect(envelope.memoryKey).toBe(buildBytecodeXPMemoryKey(vaccine));
    expect(pulse.vaccineId).toBe(vaccine.vaccineId);
    expect(enrichment.metadata.verifiedFindings).toBeGreaterThan(0);
  });

  /**
   * The reason to use buildQbitHotspotsFromCleriReport rather than reading
   * findings directly: it runs verifyInvestigationReport and refuses a report
   * whose contents no longer match its own checksum. A vaccine minted from a
   * doctored report would immunise the system against a fiction.
   */
  it('refuses a tampered report rather than immunising against a fiction', () => {
    const vaccine = mintPathologyVaccine(SWALLOWED);
    const tampered = JSON.parse(JSON.stringify(report));
    tampered.findings[0].span.path = 'somewhere/else.js';
    expect(() => sealVaccineFromReport(vaccine, tampered)).toThrow();
  });

  it('refuses a report that is not a cleri-probe investigation', () => {
    const vaccine = mintPathologyVaccine(SWALLOWED);
    expect(() => sealVaccineFromReport(vaccine, { contract: 'SOMETHING-ELSE' })).toThrow();
  });

  /**
   * A sealed vaccine that names no evidence asserts a pathology on the authority
   * of nothing. QbitMemoryPersistence's allowlists originally predated
   * buildQbitHotspotsFromCleriReport and dropped every report identifier on the
   * floor, so this pins that they now survive normalisation.
   */
  it('records which investigation justified the vaccine', () => {
    const vaccine = mintPathologyVaccine(SWALLOWED);
    const { envelope } = sealVaccineFromReport(vaccine, report);

    expect(envelope.provenance.reportId).toBe(report.reportId);
    expect(envelope.provenance.reportBytecode).toBe(report.bytecode);
    expect(envelope.provenance.verifierId).toBe('swallowed-error/v1');

    expect(envelope.enrichment.metadata.reportId).toBe(report.reportId);
    expect(envelope.enrichment.metadata.status).toBe(report.status);
    expect(envelope.enrichment.metadata.verifiedFindings).toBeGreaterThan(0);
    expect(envelope.enrichment.metadata.coverageComplete).toBe(true);
  });

  /**
   * The allowlist is a VOLATILITY FILTER, and widening it for provenance must not
   * have widened it for the wall clock. Two seals of the same report differing
   * only in duration must be the same artifact.
   */
  it('still refuses wall-clock noise into the checksum', () => {
    const vaccine = mintPathologyVaccine(SWALLOWED);
    const base = sealVaccineFromReport(vaccine, report).envelope;
    const noisy = buildBytecodeXPMemoryEnvelope({
      vaccine,
      pulse: base.pulse,
      enrichment: { ...base.enrichment, metadata: { ...base.enrichment.metadata, durationMs: 99.9 } },
      labels: base.labels,
      provenance: base.provenance,
    });

    expect(noisy.enrichment.metadata.durationMs).toBeUndefined();
    expect(noisy.checksum).toBe(base.checksum);
  });

  it('keys memory by the stable vaccine id, so a re-seal overwrites rather than duplicates', () => {
    const vaccine = mintPathologyVaccine(SWALLOWED);
    const a = sealVaccineFromReport(vaccine, report).envelope.memoryKey;
    const b = sealVaccineFromReport(vaccine, report).envelope.memoryKey;
    expect(a).toBe(b);
    expect(a).toContain(vaccine.vaccineId);
  });
});
