import { describe, expect, it } from 'vitest';
import {
  HOSTILE_CORPUS, classify, distinguish, toGeneSkeleton, PROBE,
} from '../../scripts/antigen-loop.mjs';

/**
 * The loop: a surviving mutant proves a line is UNPROTECTED. It does not prove
 * anything is BROKEN — a survivor can be semantically equivalent, and the first
 * one I looked at nearly was. This closes that gap by finding an input on which
 * shipped and mutant actually disagree, which is the artifact a gene's
 * `witness:` clause needs.
 *
 * What it must never do is decide which behaviour is correct. It has no meaning
 * to reason with. It reports both behaviours and hands them over as raw material.
 */

describe('HOSTILE_CORPUS', () => {
  it('is fixed and boring — a corpus that varies per run cannot be reproduced', () => {
    expect(HOSTILE_CORPUS).toEqual(HOSTILE_CORPUS);
    expect(HOSTILE_CORPUS.length).toBeGreaterThan(6);
  });

  it('carries the shapes that broke things today: null, wrong type, empty object', () => {
    const rendered = HOSTILE_CORPUS.map(c => JSON.stringify(c.value));
    expect(rendered).toContain('null');
    expect(rendered).toContain('{}');
    expect(rendered).toContain('[]');
  });
});

describe('classify — an outcome is one of three things, never a judgement', () => {
  it('records a thrown error as THREW with its constructor name', () => {
    expect(classify(() => { throw new TypeError('x'); })).toEqual({ outcome: PROBE.THREW, detail: 'TypeError' });
  });

  it('records a returned value verbatim', () => {
    expect(classify(() => false)).toEqual({ outcome: PROBE.RETURNED, detail: 'false' });
  });

  it('distinguishes false from a thrown error — the exact confusion that hid the gap', () => {
    expect(classify(() => false).outcome).not.toBe(classify(() => { throw new Error('x'); }).outcome);
  });
});

describe('distinguish — finds inputs where shipped and mutant disagree', () => {
  const shipped = (v) => (v && typeof v === 'object' && v.ok ? true : false);
  const mutantThrows = (v) => { if (v && v.ok) return true; throw new TypeError('boom'); };
  const mutantSame = (v) => (v && typeof v === 'object' && v.ok ? true : false);

  it('returns the disagreeing inputs with both behaviours recorded', () => {
    const d = distinguish(shipped, mutantThrows);
    expect(d.distinguishing.length).toBeGreaterThan(0);
    const first = d.distinguishing[0];
    expect(first).toHaveProperty('input');
    expect(first.shipped.outcome).toBe(PROBE.RETURNED);
    expect(first.mutant.outcome).toBe(PROBE.THREW);
  });

  it('reports EQUIVALENT_AS_PROBED when nothing in the corpus separates them', () => {
    const d = distinguish(shipped, mutantSame);
    expect(d.distinguishing).toHaveLength(0);
    expect(d.verdict).toBe('EQUIVALENT_AS_PROBED');
  });

  it('never claims equivalence outright — only "as probed"', () => {
    expect(distinguish(shipped, mutantSame).verdict).not.toBe('EQUIVALENT');
  });

  it('is deterministic across runs', () => {
    expect(distinguish(shipped, mutantThrows)).toEqual(distinguish(shipped, mutantThrows));
  });

  it('survives a probe that throws on the SHIPPED side too', () => {
    const d = distinguish(() => { throw new Error('a'); }, () => { throw new TypeError('b'); });
    expect(d.distinguishing.every(x => x.shipped.outcome === PROBE.THREW)).toBe(true);
  });
});

describe('toGeneSkeleton — raw material, never an injected rule', () => {
  const finding = { path: 'codex/x.js', line: 52, symbol: 'verifyThing' };
  const d = {
    verdict: 'DISTINGUISHED',
    distinguishing: [
      { input: null, shipped: { outcome: PROBE.RETURNED, detail: 'false' }, mutant: { outcome: PROBE.THREW, detail: 'TypeError' } },
      { input: 42, shipped: { outcome: PROBE.RETURNED, detail: 'false' }, mutant: { outcome: PROBE.THREW, detail: 'Error' } },
    ],
  };

  it('emits one witness line per distinguishing input, as parseable JSON', () => {
    const text = toGeneSkeleton(finding, d);
    const witnesses = [...text.matchAll(/witness:\s*(\{.*\})/g)].map(m => JSON.parse(m[1]));
    expect(witnesses).toHaveLength(2);
    expect(witnesses[0]).toMatchObject({ fn: 'verifyThing' });
  });

  it('leaves the Required checks UNWRITTEN so the compiler cannot bind them', () => {
    const text = toGeneSkeleton(finding, d);
    expect(text).toMatch(/Required checks:/);
    expect(text).toMatch(/TODO|UNWRITTEN|candidate:/i);
  });

  it('records both observed behaviours without saying which is correct', () => {
    const text = toGeneSkeleton(finding, d);
    expect(text).toMatch(/returned false/i);
    expect(text).toMatch(/threw TypeError/i);
    expect(text).not.toMatch(/\bcorrect\b|\bshould be\b|\bbug\b/i);
  });

  it('refuses to emit a skeleton when nothing distinguished', () => {
    expect(toGeneSkeleton(finding, { verdict: 'EQUIVALENT_AS_PROBED', distinguishing: [] })).toBeNull();
  });

  it('parses back through the gene compiler', async () => {
    const { parseGene } = await import('../../scripts/gene-compile.mjs');
    const g = parseGene(toGeneSkeleton(finding, d));
    expect(g.id).toBeTruthy();
    expect(g.forbiddenDrift).toHaveLength(2);
  });
});
