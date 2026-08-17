import { describe, expect, it } from 'vitest';
import { UNKNOWN, featuresFor } from '../../../../codex/core/constellation/semantic-particles/feature-provider.js';
import { EXPERIMENTAL_FEATURE_PROVIDER } from '../../../../codex/core/constellation/semantic-particles/experimental-inventory.js';
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

describe('empty table abstains (Task 2: no rows yet)', () => {
  it('has empty arrays for both relations', () => {
    expect(COMPLEMENT_COMPAT.INFINITIVAL_COMPLEMENT).toEqual([]);
    expect(COMPLEMENT_COMPAT.PROPOSITIONAL_COMPLEMENT).toEqual([]);
  });

  it('lookup never hits, even on want × infinitival-event', () => {
    expect(lookupComplementCompat('INFINITIVAL_COMPLEMENT', 'cognition', 'infinitival-event'))
      .toBe(null);
    expect(lookupComplementCompat('INFINITIVAL_COMPLEMENT', UNKNOWN, 'infinitival-event'))
      .toBe(null);
  });

  it('scoreComplementCompat abstains and never marks illegal', () => {
    const row = scoreComplementCompat({
      leftFeats: featuresFor('want', 'V', P),
      rightFeats: featuresFor('leave', 'INF', P),
      relation: 'INFINITIVAL_COMPLEMENT',
    });
    expect(row.fired).toBe(0);
    expect(row.score).toBe(0);
    expect(row.illegal).toBe(false);
    expect(row.abstained).toBe(true);
  });

  it('diagnoseComplementMapping reports mappingExists false while values exist', () => {
    const d = diagnoseComplementMapping({
      leftFeats: featuresFor('want', 'V', P),
      rightFeats: featuresFor('leave', 'INF', P),
      relation: 'INFINITIVAL_COMPLEMENT',
    });
    expect(d.relationExists).toBe(true);
    expect(d.bothValuesExist).toBe(true);
    expect(d.mappingExists).toBe(false);
    expect(d.mappingFires).toBe(false);
    expect(d.mappingAbstains).toBe(false);
  });
});
