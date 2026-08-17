/**
 * Abstention and telemetry for the particle observers.
 *
 * Production change that would make these fail: treating a missing lexicon
 * as the default inventory, emitting a 0.5 confidence, scoring UNKNOWN as
 * false, or letting observe-mode telemetry rewrite the forest.
 */
import { describe, expect, it } from 'vitest';

import { composePacked } from '../../../../codex/core/constellation/compose-packed.js';
import {
  annotateSemanticParticles,
  forestFingerprint,
} from '../../../../codex/core/constellation/semantic-particles/annotate.js';
import { UNKNOWN } from '../../../../codex/core/constellation/semantic-particles/feature-provider.js';
import { EXPERIMENTAL_FEATURE_PROVIDER } from '../../../../codex/core/constellation/semantic-particles/experimental-inventory.js';
import {
  pickScoredReading,
  scoreLexicalReading,
} from '../../../../codex/core/constellation/semantic-particles/feature-score.js';
import {
  createLexicalLexicon,
  roleFrame,
  sensesFor,
} from '../../../../codex/core/constellation/semantic-particles/lexical-semantics.js';
import { meaningOf } from '../../../../codex/core/constellation/semantic-particles/compositional-semantics.js';
import {
  freezeSelectionalIndex,
  selectionalCharge,
} from '../../../../codex/core/constellation/semantic-particles/selectional-index.js';

const pos = new Map([
  ['old', ['a']],
  ['men', ['n']],
  ['ran', ['v']],
  ['qzxqzx', ['n', 'v']],
]);

describe('lexical abstention', () => {
  it('does not invent senses, frames, or feature values for an unknown lemma', () => {
    const empty = createLexicalLexicon({});
    expect(sensesFor('qzxqzx', 'N', empty)).toEqual([]);
    expect(roleFrame('qzxqzx', 'V', empty)).toBeNull();
    const row = scoreLexicalReading({
      lemma: 'qzxqzx',
      type: 'N',
      neighbors: [{ lemma: 'ran', type: 'V', side: 'right' }],
      provider: EXPERIMENTAL_FEATURE_PROVIDER,
    });
    expect(row.allUnknown).toBe(true);
    expect(row.score).toBeNull();
    expect(row.used).toBe(false);
    expect(row.known).toBe(0);
  });

  it('marks a pick as abstained when no reading has a correspondence', () => {
    const atoms = [
      { token: 'qzxqzx', type: 'N' },
      { token: 'qzxqzx', type: 'V' },
    ];
    const picked = pickScoredReading(atoms, [], EXPERIMENTAL_FEATURE_PROVIDER);
    expect(picked.abstained).toBe(true);
    expect(picked.pick).toBe(atoms[0]);
    expect(picked.rows.every((r) => r.score === null)).toBe(true);
  });
});

describe('compositional abstention', () => {
  it('marks the clause unknown instead of inventing a predicate', () => {
    const chart = composePacked(['qzxqzx'], pos);
    const noun = (chart.atoms || []).find((a) => a.type === 'N') || chart.atoms[0];
    const meaning = meaningOf(noun, createLexicalLexicon({}));
    expect(meaning.readings[0].unknown).toBe(true);
    expect(meaning.readings[0].sense).toBeNull();
  });
});

describe('selectional abstention', () => {
  it('returns a null score and null confidence on an empty index', () => {
    const hit = selectionalCharge(
      { type: 'NP', token: 'men', nucleus: { headLemmas: ['men'] } },
      { type: 'VP', token: 'ran', nucleus: { headLemmas: ['ran'] } },
      ['NP', 'VP', 'S', 1],
      freezeSelectionalIndex({ corpusHash: 'empty', rows: [] }),
    );
    expect(hit.abstain).toBe(true);
    expect(hit.score).toBeNull();
    expect(hit.confidence).toBeNull();
  });
});

describe('observe-mode telemetry does not write the forest', () => {
  it('keeps fingerprint, events, and admission counts identical', () => {
    const off = composePacked(['old', 'men', 'ran'], pos);
    const on = composePacked(['old', 'men', 'ran'], pos, { semanticParticles: true });
    expect(on.semanticParticles).not.toBeNull();
    expect(forestFingerprint(on)).toBe(forestFingerprint(off));
    expect(on.events).toBe(off.events);
    expect(on.molecules.length).toBe(off.molecules.length);
    expect(on.bondAttempts).toBe(off.bondAttempts);
    expect(on.bondRefusals).toBe(off.bondRefusals);
    expect(on.semanticParticles.rankedDerivations).toEqual([]);
    expect(on.semanticParticles.particles.every((p) => p.value !== UNKNOWN)).toBe(true);
  });

  it('two observe runs emit the same report hash', () => {
    const a = composePacked(['old', 'men', 'ran'], pos, { semanticParticles: true });
    const b = composePacked(['old', 'men', 'ran'], pos, { semanticParticles: true });
    expect(a.semanticParticles.reportHash).toBe(b.semanticParticles.reportHash);
  });

  it('reports who-did-what telemetry on a known clause and unknown on an empty lexicon', () => {
    const known = composePacked(['old', 'men', 'ran'], pos, { semanticParticles: true });
    const clause = known.semanticParticles.compositional.find((row) => row.type === 'S');
    expect(clause.roles.Agent).toBe('men');
    expect(clause.roles.Event).toBe('ran');
    expect(clause.unknown).toBe(false);

    const empty = createLexicalLexicon({});
    const chart = composePacked(['old', 'men', 'ran'], pos);
    const report = annotateSemanticParticles(chart, {
      mode: 'observe',
      lexicalLexicon: empty,
    });
    expect(report.lexical.every((row) => row.polysemy === 0)).toBe(true);
    expect(report.compositional.every((row) => row.unknown === true)).toBe(true);
  });
});

describe('explicit null substrates abstain instead of falling back', () => {
  it('degrades lexical and compositional channels when the lexicon is null', () => {
    const chart = composePacked(['old', 'men', 'ran'], pos);
    const report = annotateSemanticParticles(chart, {
      mode: 'observe',
      lexicalLexicon: null,
    });
    expect(report.warnings).toContain('lexical-lexicon-absent');
    expect(report.degradedChannels).toContain('lexical');
    expect(report.degradedChannels).toContain('compositional');
    expect(report.lexical.every((row) => row.polysemy === 0)).toBe(true);
    expect(report.compositional.every((row) => row.unknown === true)).toBe(true);
    expect(forestFingerprint(chart)).toBe(forestFingerprint(composePacked(['old', 'men', 'ran'], pos)));
  });

  it('does not throw when both the feature provider and the lexicon are absent', () => {
    const chart = composePacked(['old', 'men', 'ran'], pos);
    expect(() => annotateSemanticParticles(chart, {
      featureProvider: null,
      lexicalLexicon: null,
    })).not.toThrow();
    const report = annotateSemanticParticles(chart, {
      featureProvider: null,
      lexicalLexicon: null,
    });
    expect(report.degradedChannels).toEqual(expect.arrayContaining([
      'microfeatures',
      'lexical',
      'compositional',
    ]));
  });
});
