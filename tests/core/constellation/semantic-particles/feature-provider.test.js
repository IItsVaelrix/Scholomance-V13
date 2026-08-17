/**
 * T1 — Typed semantic microfeature lattice.
 *
 * Production change that would make these fail: treating UNKNOWN as false,
 * encoding gold UD relations as lexical features, or scoring absent evidence
 * as a neutral 0.5.
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

import {
  FEATURE_DIMENSIONS,
  FEATURE_INHERITANCE,
  FEATURE_SCHEMA_VERSION,
  UNKNOWN,
  compatibility,
  createFeatureProvider,
  derangeFeatureValues,
  featuresFor,
} from '../../../../codex/core/constellation/semantic-particles/feature-provider.js';

const require = createRequire(import.meta.url);
const source = require('fs').readFileSync(
  require('path').resolve('codex/core/constellation/semantic-particles/feature-provider.js'),
  'utf8',
);

describe('typed semantic microfeature lattice', () => {
  it('is a versioned bounded inventory, not a WordNet dump', () => {
    expect(FEATURE_SCHEMA_VERSION).toBe('1.0.0');
    const dims = Object.keys(FEATURE_DIMENSIONS);
    expect(dims.length).toBeGreaterThanOrEqual(24);
    expect(dims.length).toBeLessThanOrEqual(40);
    expect(UNKNOWN).toBe('UNKNOWN');
    expect(FEATURE_INHERITANCE['entity.animacy:animate']).toContain('entity.exists:true');
    expect(FEATURE_INHERITANCE['event.motion:true']).toContain('event.exists:true');
    expect(source).not.toMatch(/from ['"]\.\.\/grimoire/);
    expect(source).not.toMatch(/nsubj|obj|obl/);
  });

  it('unknown is not false — absent lemmas abstain', () => {
    const provider = createFeatureProvider();
    const unknown = featuresFor('qzxqzx', 'N', provider);
    expect(unknown.every((f) => f.value === UNKNOWN)).toBe(true);
    expect(unknown.every((f) => f.confidence === null)).toBe(true);
    expect(unknown.map((f) => f.kind).every((k, i, arr) => i === 0 || arr[i - 1] <= k)).toBe(true);
  });

  it('attaches authored features as immutable particles sorted by kind', () => {
    const provider = createFeatureProvider();
    const man = featuresFor('man', 'N', provider);
    const animacy = man.find((f) => f.kind === 'entity.animacy');
    expect(animacy.value).toBe('animate');
    expect(animacy.polarity).toBe('OBSERVE');
    expect(animacy.permissions).toContain('OBSERVE');
    expect(animacy.permissions).not.toContain('ADMIT_BOND');
    expect(Object.isFrozen(man)).toBe(true);
  });

  it('round as a verb is motion; as a noun it is not the same particle', () => {
    const provider = createFeatureProvider();
    const asVerb = featuresFor('round', 'V', provider);
    const asNoun = featuresFor('round', 'N', provider);
    expect(asVerb.find((f) => f.kind === 'event.motion').value).toBe(true);
    expect(asNoun.find((f) => f.kind === 'event.motion').value).toBe(UNKNOWN);
  });

  it('compatibility reports agreement, contradiction, and abstention — never admission', () => {
    const provider = createFeatureProvider();
    const left = featuresFor('man', 'N', provider);
    const right = featuresFor('ran', 'V', provider);
    const report = compatibility(left, right);
    expect(report.admitted).toBeUndefined();
    expect(report.abstentions).toBeGreaterThan(0);
    expect(['compatible', 'incompatible', 'contested', 'unknown']).toContain(report.verdict);
  });

  it('derangement preserves dimension marginals and breaks correspondence', () => {
    const provider = createFeatureProvider();
    const deranged = derangeFeatureValues(provider, 0x53454d31);
    const real = featuresFor('man', 'N', provider);
    const fake = featuresFor('man', 'N', deranged);
    expect(fake.length).toBe(real.length);
    const realKnown = real.filter((f) => f.value !== UNKNOWN).length;
    const fakeKnown = fake.filter((f) => f.value !== UNKNOWN).length;
    expect(fakeKnown).toBe(realKnown);
    const same = real.every((f, i) => f.value === fake[i].value);
    expect(same).toBe(false);
  });
});
