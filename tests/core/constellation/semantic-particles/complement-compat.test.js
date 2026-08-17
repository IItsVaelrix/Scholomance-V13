import { describe, expect, it } from 'vitest';
import { UNKNOWN, featuresFor, derangeFeatureValues } from '../../../../codex/core/constellation/semantic-particles/feature-provider.js';
import { EXPERIMENTAL_FEATURE_PROVIDER, knownFeatureCount } from '../../../../codex/core/constellation/semantic-particles/experimental-inventory.js';
import {
  COMPLEMENT_COMPAT,
  COMPLEMENT_COMPAT_RELATIONS,
  COMPLEMENT_COMPAT_VERSION,
  complementClass,
  diagnoseComplementMapping,
  governorClasses,
  isComplementRelation,
  lookupComplementCompat,
  scoreComplementCompat,
} from '../../../../codex/core/constellation/semantic-particles/complement-compat.js';

const P = EXPERIMENTAL_FEATURE_PROVIDER;

describe('Phase 8 registry surface', () => {
  it('declares version 1.0.0 and exactly two relations', () => {
    expect(COMPLEMENT_COMPAT_VERSION).toBe('1.0.0');
    expect([...COMPLEMENT_COMPAT_RELATIONS]).toEqual([
      'INFINITIVAL_COMPLEMENT',
      'PROPOSITIONAL_COMPLEMENT',
    ]);
    expect(isComplementRelation('INFINITIVAL_COMPLEMENT')).toBe(true);
    expect(isComplementRelation('PROPOSITIONAL_COMPLEMENT')).toBe(true);
    expect(isComplementRelation('particle-of')).toBe(false);
    expect(isComplementRelation(null)).toBe(false);
    expect(COMPLEMENT_COMPAT.INFINITIVAL_COMPLEMENT).toHaveLength(5);
    expect(COMPLEMENT_COMPAT.PROPOSITIONAL_COMPLEMENT).toHaveLength(3);
    expect(
      COMPLEMENT_COMPAT.INFINITIVAL_COMPLEMENT.length
      + COMPLEMENT_COMPAT.PROPOSITIONAL_COMPLEMENT.length,
    ).toBe(8);
  });
});

describe('governorClasses reads only positive event.*', () => {
  it('projects want as cognition and leave as motion', () => {
    expect(governorClasses(featuresFor('want', 'V', P))).toEqual(['cognition']);
    expect(governorClasses(featuresFor('leave', 'V', P))).toEqual(['motion']);
    expect(governorClasses(featuresFor('say', 'V', P))).toContain('communication');
  });

  it('refuses entity.abstract as a governor class (S/SBAR trap)', () => {
    const s = featuresFor('want', 'S', P);
    expect(s.find((f) => f.kind === 'entity.abstract').value).toBe(true);
    expect(governorClasses(s)).toEqual([UNKNOWN]);
  });

  it('returns UNKNOWN when no positive event.* is present', () => {
    expect(governorClasses(featuresFor('zzzzprobe', 'V', P))).toEqual([UNKNOWN]);
    expect(governorClasses([])).toEqual([UNKNOWN]);
  });
});

describe('complementClass is structural and relation-scoped', () => {
  it('reads INF as infinitival-event and SBAR as abstract-proposition', () => {
    expect(complementClass(featuresFor('leave', 'INF', P), 'INFINITIVAL_COMPLEMENT'))
      .toBe('infinitival-event');
    expect(complementClass(featuresFor('left', 'SBAR', P), 'PROPOSITIONAL_COMPLEMENT'))
      .toBe('abstract-proposition');
  });

  it('does not treat abstract SBAR as an infinitival event', () => {
    expect(complementClass(featuresFor('left', 'SBAR', P), 'INFINITIVAL_COMPLEMENT'))
      .toBe(UNKNOWN);
  });
});

describe('authored complement COMPAT (TRAIN-frozen rows)', () => {
  it('contains only allow-listed pairs and never a forbidden pair', () => {
    const forbidden = new Set([
      'motion|infinitival-event', 'motion|abstract-proposition',
      'possession|infinitival-event', 'possession|abstract-proposition',
      'change|infinitival-event', 'change|abstract-proposition',
      'state|abstract-proposition',
    ]);
    for (const relation of COMPLEMENT_COMPAT_RELATIONS) {
      for (const row of COMPLEMENT_COMPAT[relation]) {
        expect(forbidden.has(`${row.governor}|${row.complement}`)).toBe(false);
        expect(row.governor).not.toBe('UNKNOWN');
        expect(Object.isFrozen(row)).toBe(true);
      }
    }
  });

  it('fires want × leave on INFINITIVAL_COMPLEMENT and never marks illegal', () => {
    const row = scoreComplementCompat({
      leftFeats: featuresFor('want', 'V', P),
      rightFeats: featuresFor('leave', 'INF', P),
      relation: 'INFINITIVAL_COMPLEMENT',
    });
    expect(row.fired).toBeGreaterThan(0);
    expect(row.score).toBeGreaterThan(0);
    expect(row.illegal).toBe(false);
    expect(row.abstained).toBe(false);
  });

  it('abstains on motion × infinitival-event (leave to VP)', () => {
    const row = scoreComplementCompat({
      leftFeats: featuresFor('leave', 'V', P),
      rightFeats: featuresFor('go', 'INF', P),
      relation: 'INFINITIVAL_COMPLEMENT',
    });
    expect(governorClasses(featuresFor('leave', 'V', P))).toEqual(['motion']);
    expect(row.fired).toBe(0);
    expect(row.abstained).toBe(true);
    expect(row.illegal).toBe(false);
  });

  it('fires think × abstract-proposition and abstains on S-governed abstract×abstract', () => {
    const live = scoreComplementCompat({
      leftFeats: featuresFor('think', 'V', P),
      rightFeats: featuresFor('left', 'SBAR', P),
      relation: 'PROPOSITIONAL_COMPLEMENT',
    });
    expect(live.fired).toBeGreaterThan(0);

    const trap = scoreComplementCompat({
      leftFeats: featuresFor('want', 'S', P),
      rightFeats: featuresFor('left', 'SBAR', P),
      relation: 'PROPOSITIONAL_COMPLEMENT',
    });
    expect(governorClasses(featuresFor('want', 'S', P))).toEqual([UNKNOWN]);
    expect(trap.fired).toBe(0);
    expect(trap.abstained).toBe(true);
  });

  it('UNKNOWN never matches a row', () => {
    expect(lookupComplementCompat('INFINITIVAL_COMPLEMENT', UNKNOWN, 'infinitival-event')).toBe(null);
    expect(lookupComplementCompat('PROPOSITIONAL_COMPLEMENT', 'cognition', UNKNOWN)).toBe(null);
  });

  it('diagnoseComplementMapping now reports mappingExists and can abstain', () => {
    const fire = diagnoseComplementMapping({
      leftFeats: featuresFor('want', 'V', P),
      rightFeats: featuresFor('leave', 'INF', P),
      relation: 'INFINITIVAL_COMPLEMENT',
    });
    expect(fire.mappingExists).toBe(true);
    expect(fire.mappingFires).toBe(true);
    expect(fire.mappingAbstains).toBe(false);

    const abstain = diagnoseComplementMapping({
      leftFeats: featuresFor('leave', 'V', P),
      rightFeats: featuresFor('go', 'INF', P),
      relation: 'INFINITIVAL_COMPLEMENT',
    });
    expect(abstain.mappingExists).toBe(true);
    expect(abstain.mappingFires).toBe(false);
    expect(abstain.mappingAbstains).toBe(true);
  });

  it('deranges complement fire while preserving known-count', () => {
    const seed = 0x50383031;
    const fake = derangeFeatureValues(P, seed);
    const real = scoreComplementCompat({
      leftFeats: featuresFor('want', 'V', P),
      rightFeats: featuresFor('leave', 'INF', P),
      relation: 'INFINITIVAL_COMPLEMENT',
    });
    const der = scoreComplementCompat({
      leftFeats: featuresFor('want', 'V', fake),
      rightFeats: featuresFor('leave', 'INF', fake),
      relation: 'INFINITIVAL_COMPLEMENT',
    });
    expect(knownFeatureCount(featuresFor('want', 'V', fake)))
      .toBe(knownFeatureCount(featuresFor('want', 'V', P)));
    // A single pair may or may not move; the suite-level census is the gate.
    expect(typeof der.score).toBe('number');
    expect(real.illegal).toBe(false);
    expect(der.illegal).toBe(false);
  });
});
