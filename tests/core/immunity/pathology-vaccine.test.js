// @vitest-environment node
/**
 * PATHOLOGY VACCINE — PB-XP-v1 minted from a verified pathology.
 */

import { describe, it, expect } from 'vitest';
import { mintPathologyVaccine, pulseFromFindings, PATHOLOGY_SLUGS } from '../../../codex/core/immunity/pathology-vaccine.js';
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
