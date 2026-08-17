/**
 * Experimental T1 inventory — coverage, not the smoke seed.
 *
 * Production change that would make these fail: treating the twelve-lemma
 * smoke map as the experimental ontology, or encoding gold UD relations.
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

import {
  MICROFEATURE_SMOKE_SEED,
  createFeatureProvider,
  derangeFeatureValues,
  featuresFor,
  UNKNOWN,
} from '../../../../codex/core/constellation/semantic-particles/feature-provider.js';
import {
  EXPERIMENTAL_FEATURE_DIMENSIONS,
  EXPERIMENTAL_FEATURE_PROVIDER,
  EXPERIMENTAL_FEATURE_SCHEMA_VERSION,
  knownFeatureCount,
} from '../../../../codex/core/constellation/semantic-particles/experimental-inventory.js';
import { scoreLexicalReading } from '../../../../codex/core/constellation/semantic-particles/feature-score.js';

const require = createRequire(import.meta.url);
const inventorySource = require('fs').readFileSync(
  require('path').resolve('codex/core/constellation/semantic-particles/experimental-inventory.js'),
  'utf8',
);

describe('smoke seed stays an integration fixture', () => {
  it('still ships the twelve-lemma smoke map under its real name', () => {
    expect(MICROFEATURE_SMOKE_SEED.man).toBeTruthy();
    expect(MICROFEATURE_SMOKE_SEED.idea).toBeTruthy();
    expect(Object.keys(MICROFEATURE_SMOKE_SEED).length).toBeLessThan(20);
    const smoke = createFeatureProvider();
    expect(featuresFor('man', 'N', smoke).find((f) => f.kind === 'entity.animacy').value).toBe('animate');
  });
});

describe('experimental microfeature inventory', () => {
  it('is a bounded 24–40 dimension lattice with its own version', () => {
    const dims = Object.keys(EXPERIMENTAL_FEATURE_DIMENSIONS);
    expect(dims.length).toBeGreaterThanOrEqual(24);
    expect(dims.length).toBeLessThanOrEqual(40);
    expect(EXPERIMENTAL_FEATURE_SCHEMA_VERSION).toBe('1.1.0');
    expect(inventorySource).not.toMatch(/\bnsubj\b|\bobj\b|\bobl\b/);
    expect(inventorySource).not.toMatch(/from ['"]\.\.\/grimoire/);
  });

  it('gives cat, president, table, idea, run, think, red, old different structure', () => {
    const p = EXPERIMENTAL_FEATURE_PROVIDER;
    const pack = (lemma, type) => featuresFor(lemma, type, p)
      .filter((f) => f.value !== UNKNOWN)
      .map((f) => `${f.kind}:${f.value}`)
      .sort()
      .join('|');
    const signatures = [
      pack('cat', 'N'),
      pack('president', 'N'),
      pack('table', 'N'),
      pack('idea', 'N'),
      pack('run', 'V'),
      pack('think', 'V'),
      pack('red', 'ADJ'),
      pack('old', 'ADJ'),
    ];
    expect(signatures.every((s) => s.length > 0)).toBe(true);
    expect(new Set(signatures).size).toBe(signatures.length);
    expect(knownFeatureCount(featuresFor('cat', 'N', p))).toBeGreaterThan(0);
    expect(knownFeatureCount(featuresFor('qzxqzx', 'N', p))).toBe(0);
  });

  it('gives closed-class type defaults so to-as-P is not to-as-TO', () => {
    const p = EXPERIMENTAL_FEATURE_PROVIDER;
    const asP = featuresFor('to', 'P', p);
    const asTo = featuresFor('to', 'TO', p);
    expect(asP.find((f) => f.kind === 'function.adposition').value).toBe(true);
    expect(asTo.find((f) => f.kind === 'function.infinitival').value).toBe(true);
    expect(asP.find((f) => f.kind === 'function.infinitival').value).toBe(false);
  });

  it('type-conditions round: verb is an event, noun is not the same bundle', () => {
    const p = EXPERIMENTAL_FEATURE_PROVIDER;
    const asV = featuresFor('round', 'V', p);
    const asN = featuresFor('round', 'N', p);
    expect(asV.find((f) => f.kind === 'event.motion')?.value).toBe(true);
    expect(asN.find((f) => f.kind === 'event.motion')?.value).toBe(UNKNOWN);
  });

  it('derangement changes a known lemma while preserving known-count', () => {
    const p = EXPERIMENTAL_FEATURE_PROVIDER;
    const d = derangeFeatureValues(p, 0x53454d31);
    const real = featuresFor('president', 'N', p);
    const fake = featuresFor('president', 'N', d);
    expect(knownFeatureCount(fake)).toBe(knownFeatureCount(real));
    expect(real.every((f, i) => f.value === fake[i].value)).toBe(false);
  });
});

describe('lexical reading score can disagree under derangement', () => {
  it('prefers an animate noun beside a motion verb, and derangement can flip it', () => {
    const p = EXPERIMENTAL_FEATURE_PROVIDER;
    const neighbors = [{ lemma: 'ran', type: 'V' }];
    const real = scoreLexicalReading({ lemma: 'cat', type: 'N', neighbors, provider: p });
    expect(real.used).toBe(true);
    expect(real.score).not.toBeNull();
    const d = derangeFeatureValues(p, 0x53454d31);
    const fake = scoreLexicalReading({ lemma: 'cat', type: 'N', neighbors, provider: d });
    expect(fake.used).toBe(true);
  });
});
