import { describe, it, expect } from 'vitest';
import { resolveGovernor, resolveGovernedPairs } from '../../../codex/core/constellation/governor.js';

/** Mirrors batchLookupPos output: wordnet tags per surface form. */
const pos = new Map([
  ['shadowy', ['s']], ['bright', ['a', 'r']], ['cold', ['a', 'n']],
  ['black', ['a', 'n']], ['pale', ['a']], ['past', ['a', 'n', 'r']],
  ['wood', ['n']], ['figure', ['n', 'v']], ['wound', ['a', 'n', 'v']],
  ['barn', ['n']], ['horse', ['n', 'v']], ['autumn', ['n']],
  ['water', ['n', 'v']], ['runs', ['n', 'v']], ['smoke', ['n', 'v']],
  ['age', ['n', 'v']], ['dealings', ['n']], ['raced', ['v']], ['fell', ['a', 'n', 'v']],
]);
const T = (s) => s.split(' ');

describe('resolveGovernor', () => {
  it('resolves an adjacent attributive pair', () => {
    const r = resolveGovernor(T('the shadowy wood'), 'shadowy', pos);
    expect(r.governor).toBe('wood');
    expect(r.relation).toBe('attributive');
    expect(r.decidedBy).toBe('nominal-head');
  });

  /**
   * THE DETERMINER BARRIER — the bug this arbiter was built for.
   *
   * `the horse raced past the barn fell` resolved `past` as an adjective
   * governing `barn`, because `past` carries an "a" tag and the forward scan
   * skipped stopwords, so the determiner was invisible. No English attributive
   * adjective takes a determiner before its noun, so the cue vetoes.
   */
  it('refuses to cross a determiner', () => {
    const r = resolveGovernor(T('the horse raced past the barn fell'), 'past', pos);
    expect(r.governor).toBeNull();
  });

  it('yields no governed pairs at all for the garden-path sentence', () => {
    expect(resolveGovernedPairs(T('the horse raced past the barn fell'), pos)).toEqual([]);
  });

  /**
   * English noun-noun compounds put the head LAST: `bright` modifies
   * `autumn wound` entire, not `autumn`. Settling on the first noun met
   * resolved it onto `autumn`.
   */
  it('scans past a noun modifier to the head of a compound', () => {
    expect(resolveGovernor(T('the bright autumn wound'), 'bright', pos).governor).toBe('wound');
  });

  /**
   * The trap for the compound rule: `water runs` is also noun-followed-by-noun,
   * because `runs` carries an "n" tag — but it is subject-verb. Agreement puts
   * -s on exactly one of the pair, so the compound reading is off and `water`
   * is the head.
   */
  it('does not read a subject-verb pair as a compound', () => {
    expect(resolveGovernor(T('cold water runs deep'), 'cold', pos).governor).toBe('water');
  });

  it('resolves a predicative pair backwards through a copula', () => {
    const r = resolveGovernor(T('the wood was shadowy'), 'shadowy', pos);
    expect(r.governor).toBe('wood');
    expect(r.relation).toBe('predicative');
  });

  /** `age` is what `shadowy` is qualified BY, not what it is predicated OF. */
  it('stops at a phrase break rather than walking into the next phrase', () => {
    expect(resolveGovernor(T('shadowy with age'), 'shadowy', pos).governor).toBeNull();
  });

  it('abstains on a token that is not present', () => {
    expect(resolveGovernor(T('the shadowy wood'), 'absent', pos).governor).toBeNull();
  });

  it('abstains rather than guessing when no noun follows', () => {
    expect(resolveGovernor(T('utterly shadowy'), 'shadowy', pos).governor).toBeNull();
  });
});
