import { describe, expect, it } from 'vitest';
import {
  buildConstellationEvaluationEvidence,
  CONSTELLATION_EVALUATION_EVIDENCE_CONTRACT,
} from '../../../codex/core/constellation/evaluation-evidence.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function runFixture(signatures = new Map([['frontier:z', 1], ['frontier:a', 2]])) {
  return {
    report: {
      n: 2,
      coverage: 0.5,
      containment: 0.5,
      decision: null,
      byRootUpos: [{ upos: 'VERB', n: 2, coverage: 0.5, containment: 0.5 }],
      ablation: { bothFine: 1, overGenerated: 0, tagging: 1, grammar: 0 },
      categories: [{ label: 'N', deprel: 'nsubj', failures: 1, soleCause: 1 }],
      classifier: { failures: 1, withCategory: 1, meanCauses: 1 },
      nonProjective: 0,
    },
    rows: [
      {
        outcome: 'parsed',
        overGenerated: false,
        categories: [],
        nonProjective: 0,
        rootUpos: 'VERB',
        contained: true,
        decided: true,
      },
      {
        outcome: 'lexical',
        overGenerated: false,
        categories: [{ label: 'N', deprel: 'nsubj' }],
        nonProjective: 0,
        rootUpos: 'VERB',
        contained: false,
        decided: null,
      },
    ],
    sampled: 3,
    skippedTooLong: 1,
    droppedThrew: 0,
    oracleLeaks: 2,
    oracleTokens: 9,
    tokenizerAgree: 2,
    tokenizerTotal: 2,
    signatures,
  };
}

function build(run = runFixture()) {
  return buildConstellationEvaluationEvidence({
    run,
    parser: 'packed',
    maxTokens: 28,
    fixture: { corpusSha256: HASH_A, lexiconSha256: HASH_B },
  });
}

describe('buildConstellationEvaluationEvidence', () => {
  it('emits a frozen, text-free account of parser, fixtures, rows, and failures', () => {
    const evidence = build();

    expect(evidence).toMatchObject({
      contract: CONSTELLATION_EVALUATION_EVIDENCE_CONTRACT,
      schemaVersion: '1.0.0',
      mode: 'offline-evaluation',
      parser: { id: 'packed', maxTokens: 28 },
      fixture: { corpusSha256: HASH_A, lexiconSha256: HASH_B },
      accounting: {
        sampled: 3,
        analyzed: 2,
        skippedTooLong: 1,
        droppedThrew: 0,
        oracleLeaks: 2,
        oracleTokens: 9,
        tokenizerAgree: 2,
        tokenizerTotal: 2,
      },
      signatures: [
        { signature: 'frontier:a', count: 2 },
        { signature: 'frontier:z', count: 1 },
      ],
    });
    expect(evidence.rows[1]).toEqual({
      index: 1,
      outcome: 'lexical',
      overGenerated: false,
      categories: [{ deprel: 'nsubj', label: 'N' }],
      nonProjective: 0,
      rootUpos: 'VERB',
      contained: false,
      decided: null,
    });
    expect(JSON.stringify(evidence)).not.toContain('text');
    expect(evidence.checksum).toMatch(/^constellation-evidence1:sha256:[0-9a-f]{64}$/);
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.rows)).toBe(true);
    expect(Object.isFrozen(evidence.metrics.byRootUpos[0])).toBe(true);
  });

  it('is invariant to object-key and signature insertion order', () => {
    const reversed = runFixture(new Map([['frontier:a', 2], ['frontier:z', 1]]));
    reversed.report = Object.fromEntries(Object.entries(reversed.report).reverse());

    expect(build(reversed).checksum).toBe(build().checksum);
  });

  it('changes identity when row evidence changes', () => {
    const changed = runFixture();
    changed.rows[1] = { ...changed.rows[1], outcome: 'grammar' };

    expect(build(changed).checksum).not.toBe(build().checksum);
  });

  it.each([
    null,
    {},
    { ...runFixture(), signatures: {} },
  ])('rejects malformed run evidence %#', (run) => {
    expect(() => build(run)).toThrow(TypeError);
  });

  it('rejects non-SHA fixture identities', () => {
    expect(() => buildConstellationEvaluationEvidence({
      run: runFixture(),
      parser: 'packed',
      maxTokens: 28,
      fixture: { corpusSha256: 'not-a-hash', lexiconSha256: HASH_B },
    })).toThrow(TypeError);
  });
});
