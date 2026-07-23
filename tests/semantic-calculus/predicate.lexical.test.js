/**
 * SEMANTIC CALCULUS — lexical predicate ops
 *
 * Why these ops exist. A falsifier written as
 *
 *   { op: 'gte', path: 'margin.overlapDelta', value: 1 }
 *
 * looks sealed but is not: the harness decided what an overlap is, which words
 * count, and how to subtract them. The formula only compared a number someone
 * else concluded. types.ts:278 already warns about this shape — "having the
 * harness return a boolean it computed itself moves the judgement out of the
 * sealed formula" — and the generic ops reintroduce it one level down.
 *
 * The line these ops draw: MEASUREMENTS belong to the harness (raw glosses, raw
 * tokens, a measured cosine). COMPARISONS AND AGGREGATIONS belong to the
 * formula. So the harness hands over gloss text and the op does the counting.
 *
 * Every op inherits the module's existing discipline: absence is 'inconclusive',
 * never false. An unanswered question has neither refuted nor protected a claim.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { evalPredicate } from '../../codex/core/semantic-calculus/hypothesisStatus.js';

const CANDIDATES = [
  { synsetId: 'oewn-1', gloss: 'a mounted soldier serving under a feudal lord' },
  { synsetId: 'oewn-2', gloss: 'the period of darkness between sunset and sunrise' },
];

describe('gloss_overlap_lt', () => {
  const spec = (n) => ({
    op: 'gloss_overlap_lt',
    candidatesPath: 'candidates',
    queryTokensPath: 'queryTokens',
    n,
  });

  it('counts content-word overlap inside the formula, not in the harness', () => {
    // "soldier" and "feudal" overlap candidate 1 -> best overlap is 2.
    const result = { candidates: CANDIDATES, queryTokens: ['feudal', 'soldier', 'poem'] };
    expect(evalPredicate(spec(2), result)).toBe(false); // 2 < 2 is false
    expect(evalPredicate(spec(3), result)).toBe(true); // 2 < 3 fires
  });

  it('ignores function words so "the" cannot manufacture evidence', () => {
    const result = { candidates: CANDIDATES, queryTokens: ['the', 'a', 'of', 'between'] };
    // All stopwords -> zero real overlap -> "no candidate is evidenced" fires.
    expect(evalPredicate(spec(1), result)).toBe(true);
  });

  it('is inconclusive when the harness never reported candidates', () => {
    expect(evalPredicate(spec(1), { queryTokens: ['knight'] })).toBe('inconclusive');
  });

  it('is inconclusive on an empty candidate list rather than vacuously firing', () => {
    expect(evalPredicate(spec(1), { candidates: [], queryTokens: ['knight'] })).toBe('inconclusive');
  });

  it('is inconclusive when a candidate carries no gloss', () => {
    const result = { candidates: [{ synsetId: 'oewn-1' }], queryTokens: ['knight'] };
    expect(evalPredicate(spec(1), result)).toBe('inconclusive');
  });
});

describe('gloss_overlap_margin_lt', () => {
  const spec = (n) => ({
    op: 'gloss_overlap_margin_lt',
    candidatesPath: 'candidates',
    queryTokensPath: 'queryTokens',
    n,
  });

  it('fires when the top two senses tie — a tie is not a disambiguation', () => {
    const tied = [
      { synsetId: 'a', gloss: 'darkness and shadow' },
      { synsetId: 'b', gloss: 'shadow and darkness' },
    ];
    // Both overlap 2 -> margin 0.
    expect(evalPredicate(spec(1), { candidates: tied, queryTokens: ['darkness', 'shadow'] })).toBe(true);
  });

  it('does not fire when the winner genuinely separates', () => {
    const result = { candidates: CANDIDATES, queryTokens: ['feudal', 'soldier'] };
    // candidate 1 overlaps 2, candidate 2 overlaps 0 -> margin 2.
    expect(evalPredicate(spec(1), result)).toBe(false);
  });

  it('is inconclusive with a single candidate — nothing was compared', () => {
    const result = { candidates: [CANDIDATES[0]], queryTokens: ['soldier'] };
    expect(evalPredicate(spec(1), result)).toBe('inconclusive');
  });
});

describe('every_field_in', () => {
  const spec = {
    op: 'every_field_in',
    path: 'edges',
    field: 'rel',
    values: ['hypernym', 'hyponym', 'similar', 'antonym'],
  };

  it('holds when every edge names a known relation kind', () => {
    expect(evalPredicate(spec, { edges: [{ rel: 'hypernym' }, { rel: 'antonym' }] })).toBe(true);
  });

  it('fails when any edge carries an unknown kind', () => {
    expect(evalPredicate(spec, { edges: [{ rel: 'hypernym' }, { rel: 'vibes' }] })).toBe(false);
  });

  it('is inconclusive on an empty array — vacuous truth would protect the claim', () => {
    expect(evalPredicate(spec, { edges: [] })).toBe('inconclusive');
  });

  it('is inconclusive when an element is missing the field entirely', () => {
    expect(evalPredicate(spec, { edges: [{ rel: 'hypernym' }, {}] })).toBe('inconclusive');
  });

  it('is inconclusive when the path is not an array', () => {
    expect(evalPredicate(spec, { edges: 'hypernym' })).toBe('inconclusive');
  });
});

describe('every_field_truthy', () => {
  const spec = { op: 'every_field_truthy', path: 'kin', field: 'relPath' };

  it('holds when every near-kin can name its edge', () => {
    expect(evalPredicate(spec, { kin: [{ relPath: 'oewn-1>hypernym>oewn-9' }] })).toBe(true);
  });

  it('fails when a kin was emitted with no relation path backing it', () => {
    expect(evalPredicate(spec, { kin: [{ relPath: 'oewn-1>hypernym>oewn-9' }, { relPath: '' }] })).toBe(false);
  });

  it('is inconclusive on an empty array', () => {
    expect(evalPredicate(spec, { kin: [] })).toBe('inconclusive');
  });
});

describe('no declared op may be unimplemented', () => {
  /**
   * evalPredicate ends in `default: return 'inconclusive'`, so an op added to the
   * PredicateSpec union without a matching case is not a type error and not a
   * test failure — it is a falsifier that can never fire. The failure is silent
   * and it protects hypotheses instead of killing them.
   *
   * Textual on purpose, like shadow.schema-drift.test.js: the point is to compare
   * the DECLARATIONS, not to exercise a runtime object that only lists what it
   * already handles.
   */
  it('every op in PredicateSpec has a case in evalPredicate', () => {
    /**
     * Comments are stripped and the region is bounded by the NEXT top-level
     * export, not by the first `;\n`. Both matter, and the first draft of this
     * test got both wrong: object-literal members end in `;\n`, so the union
     * match truncated at the first multi-line op and the guard went blind to the
     * very ops it was added for — while still passing. It also read an example
     * `{ op: 'gte' }` out of a doc comment as a declaration.
     */
    const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const region = (src, marker) => {
      const start = src.indexOf(marker);
      if (start === -1) return null;
      const rest = src.slice(start);
      const end = rest.indexOf('\nexport ', 1);
      return strip(end === -1 ? rest : rest.slice(0, end));
    };

    const union = region(
      readFileSync('codex/core/semantic-calculus/types.ts', 'utf8'),
      'export type PredicateSpec =',
    );
    expect(union, 'PredicateSpec union not found — did the type get renamed?').toBeTruthy();

    const declared = [...new Set([...union.matchAll(/op:\s*'([a-z_]+)'/g)].map((m) => m[1]))];

    // Pin the ops this suite exercises. Without this the extraction could silently
    // shrink to a subset and still report "nothing missing" — a green guard over
    // an unread union is worse than no guard.
    expect(declared).toEqual(
      expect.arrayContaining([
        'eq', 'truthy', 'falsy', 'gte', 'csp_allows_host',
        'gloss_overlap_lt', 'gloss_overlap_margin_lt', 'every_field_in', 'every_field_truthy',
      ]),
    );

    const evaluator = strip(readFileSync('codex/core/semantic-calculus/hypothesisStatus.js', 'utf8'));
    const implemented = new Set([...evaluator.matchAll(/case\s*'([a-z_]+)'/g)].map((m) => m[1]));
    const missing = declared.filter((op) => !implemented.has(op));

    expect(missing, `declared but never evaluated (always 'inconclusive'): ${missing.join(', ')}`).toEqual([]);
  });
});

describe('the ops are actually wired', () => {
  it('no lexical op silently falls through to the default inconclusive branch', () => {
    // A predicate that must decisively answer. If the op were unimplemented the
    // switch default returns 'inconclusive' and this test catches the inert union.
    const decisive = evalPredicate(
      { op: 'gloss_overlap_lt', candidatesPath: 'candidates', queryTokensPath: 'queryTokens', n: 99 },
      { candidates: CANDIDATES, queryTokens: ['soldier'] },
    );
    expect(decisive).toBe(true);
    expect(decisive).not.toBe('inconclusive');
  });
});
