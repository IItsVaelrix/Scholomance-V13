/**
 * Phase 3B — complement lexical values (OBSERVE-only, TRAIN-demand-bounded).
 *
 * Prereg: docs/superpowers/evidence/2026-08-17-PREREG-phase-3b-complement-lexical.md
 *
 * Pins: constituent classes (S/SBAR/INF), the VP seed alias, the
 * want/need cognition authoring, tried→try, the schema bump, and the two
 * anti-authoring boundaries (no *::VP default; no new dimensions).
 */
import { describe, expect, it } from 'vitest';

import {
  featuresFor,
  UNKNOWN,
} from '../../../../codex/core/constellation/semantic-particles/feature-provider.js';
import {
  EXPERIMENTAL_FEATURE_DIMENSIONS,
  EXPERIMENTAL_FEATURE_PROVIDER,
  EXPERIMENTAL_FEATURE_SCHEMA_VERSION,
  classifyLemma,
  knownFeatureCount,
} from '../../../../codex/core/constellation/semantic-particles/experimental-inventory.js';
import { waterfallStages } from '../../../../codex/core/constellation/semantic-particles/compat-waterfall.js';
import { sensesFor } from '../../../../codex/core/constellation/semantic-particles/lexical-semantics.js';

const P = EXPERIMENTAL_FEATURE_PROVIDER;

function kinds(lemma, type) {
  return featuresFor(lemma, type, P)
    .filter((f) => f.value !== UNKNOWN && f.confidence != null)
    .map((f) => `${f.kind}:${f.value}`)
    .sort();
}

describe('3B constituent classes: S, SBAR, INF light structurally', () => {
  it('lights every S/SBAR/INF node regardless of head lemma', () => {
    for (const lemma of ['zzzzprobe', 'have', 'believe', '']) {
      expect(knownFeatureCount(featuresFor(lemma, 'S', P))).toBeGreaterThan(0);
      expect(knownFeatureCount(featuresFor(lemma, 'SBAR', P))).toBeGreaterThan(0);
      expect(knownFeatureCount(featuresFor(lemma, 'INF', P))).toBeGreaterThan(0);
    }
  });

  it('marks clauses as abstract content, never animate/concrete', () => {
    for (const type of ['S', 'SBAR']) {
      const feats = featuresFor('zzzzprobe', type, P);
      expect(feats.find((f) => f.kind === 'entity.abstract').value).toBe(true);
      expect(feats.find((f) => f.kind === 'entity.concrete').value).toBe(false);
      expect(feats.find((f) => f.kind === 'entity.animate').value).toBe(false);
    }
  });

  it('marks INF as infinitival, not adpositional (same fact as TO)', () => {
    const feats = featuresFor('zzzzprobe', 'INF', P);
    expect(feats.find((f) => f.kind === 'function.infinitival').value).toBe(true);
    expect(feats.find((f) => f.kind === 'function.adposition').value).toBe(false);
  });

  it('classifyLemma exposes the branches directly', () => {
    expect(classifyLemma('*', 'S')['entity.abstract']).toBe(true);
    expect(classifyLemma('*', 'SBAR')['entity.abstract']).toBe(true);
    expect(classifyLemma('*', 'INF')['function.infinitival']).toBe(true);
  });

  it('sensesFor now returns a class sense for clause constituents', () => {
    expect(sensesFor('have', 'S').length).toBeGreaterThan(0);
    expect(sensesFor('believe', 'SBAR').length).toBeGreaterThan(0);
    expect(sensesFor('leave', 'INF').length).toBeGreaterThan(0);
  });
});

describe('3B anti-authoring boundaries', () => {
  it('adds NO *::VP default: unclassified VP heads stay dark', () => {
    // company/based/married as V heads must NOT light through a type
    // default; that would manufacture meaning for mis-tagged lemmas.
    expect(knownFeatureCount(featuresFor('zzzzprobe', 'VP', P))).toBe(0);
    expect(knownFeatureCount(featuresFor('company', 'VP', P))).toBe(0);
  });

  it('adds NO new dimensions: lattice count unchanged', () => {
    expect(Object.keys(EXPERIMENTAL_FEATURE_DIMENSIONS).length).toBe(36);
  });

  it('leaves terminal lexical types untouched by constituent classes', () => {
    expect(knownFeatureCount(featuresFor('zzzzprobe', 'N', P))).toBe(0);
    expect(knownFeatureCount(featuresFor('zzzzprobe', 'V', P))).toBe(0);
    expect(knownFeatureCount(featuresFor('zzzzprobe', 'ADJ', P))).toBe(0);
  });
});

describe('3B VP seed alias: VP inherits its classified head verb', () => {
  it('like::VP carries exactly the known kinds of like::V', () => {
    expect(kinds('like', 'VP')).toEqual(kinds('like', 'V'));
    expect(kinds('like', 'VP').length).toBeGreaterThan(0);
  });

  it('aliases every classified verbal lemma, not a hand-picked few', () => {
    for (const lemma of ['run', 'think', 'give', 'become', 'say']) {
      expect(kinds(lemma, 'VP')).toEqual(kinds(lemma, 'V'));
    }
  });

  it('want::VP lights through bag + alias together', () => {
    expect(kinds('want', 'VP').length).toBeGreaterThan(0);
    expect(kinds('want', 'VP')).toEqual(kinds('want', 'V'));
  });
});

describe('3B demand-bounded governor authoring (TRAIN mass >= 30, top-80 cells)', () => {
  it('want and need are cognition verbs across their inflections', () => {
    for (const lemma of ['want', 'wants', 'wanted', 'wanting', 'need', 'needs', 'needed']) {
      const feats = featuresFor(lemma, 'V', P);
      expect(feats.find((f) => f.kind === 'event.cognition').value).toBe(true);
    }
  });

  it('tried reaches the already-bagged try (morphology fix, not new meaning)', () => {
    const feats = featuresFor('tried', 'V', P);
    expect(feats.find((f) => f.kind === 'event.creation').value).toBe(true);
  });

  it('stays out of the nominal classifications of want/need', () => {
    // Both lemmas exist in ABSTRACT as nouns; the verbal authoring must
    // not leak into the noun side and the noun side must not leak back.
    const wantN = featuresFor('want', 'N', P);
    expect(wantN.find((f) => f.kind === 'event.cognition').value).toBe(UNKNOWN);
  });

  it('cutoff lemmas stay dark (honest abstention)', () => {
    // prefer/threaten/happen/allow fell outside the frozen cutoff.
    for (const lemma of ['prefer', 'threaten', 'happen', 'allow']) {
      expect(knownFeatureCount(featuresFor(lemma, 'V', P))).toBe(0);
    }
  });
});

describe('3B waterfall consequence: values light, mappings cannot fire', () => {
  it('a complement edge with constituent features reaches stage 3 but never stage 4', () => {
    const governor = featuresFor('want', 'V', P);
    const complement = featuresFor('zzzzprobe', 'INF', P);
    const stages = waterfallStages({
      leftFeats: governor,
      rightFeats: complement,
      relation: 'INFINITIVAL_COMPLEMENT',
    });
    expect(stages.relationAvailable).toBe(true);
    expect(stages.leftValueAvailable).toBe(true);
    expect(stages.rightValueAvailable).toBe(true);
    // No COMPAT rows exist for complement relations: the mapping gate
    // stays shut by construction until Phase 8 authors them.
    expect(stages.compatMappingAvailable).toBe(false);
    expect(stages.actualCompatFire).toBe(false);
  });
});

describe('3B schema bump', () => {
  it('bumps to 1.2.0 (lexical growth, lattice unchanged)', () => {
    expect(EXPERIMENTAL_FEATURE_SCHEMA_VERSION).toBe('1.2.0');
    expect(P.version).toBe('1.2.0');
  });
});
