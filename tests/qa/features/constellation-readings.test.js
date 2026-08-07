import { describe, it, expect } from 'vitest';
import { resolveReadings } from '../../../codex/core/constellation/readings.js';

const pos = new Map([
  ['man', ['n']], ['saw', ['n', 'v']], ['comet', ['n']],
  ['horse', ['n', 'v']], ['raced', ['v']], ['past', ['a', 'n', 'r']],
  ['barn', ['n']], ['fell', ['a', 'n', 'v']],
  ['shadows', ['n', 'v']], ['fall', ['n', 'v']], ['road', ['n']],
  ['shadowy', ['s']], ['wood', ['n']], ['wound', ['a', 'n', 'v']],
]);
const freq = new Map([
  ['man', 900], ['saw', 400], ['comet', 10],
  ['horse', 206], ['barn', 25], ['fell', 333], ['past', 378],
  ['shadows', 60], ['fall', 200], ['road', 300],
  ['wood', 183], ['wound', 79],
]);
const T = (s) => s.split(' ');

describe('resolveReadings', () => {
  /**
   * THE CASE A SINGLE RETURN VALUE CANNOT EXPRESS. Subjecthood says `man`,
   * salience says `comet`, and both are right about different questions. Forcing
   * one answer here discards a true fact about the phrase.
   */
  it('reports a genuinely two-ways-readable phrase as contested', () => {
    const r = resolveReadings(T('the man saw a comet'), freq, pos);
    expect(r.contested).toBe(true);
    const byAnchor = Object.fromEntries(r.readings.map((x) => [x.anchor, x.role]));
    expect(byAnchor.man).toBe('clause-subject');
    expect(byAnchor.comet).toBe('rarest-content-word');
  });

  /**
   * Both specialists agree on `wood`. That is not ambiguity — it is
   * over-determination, the opposite thing, and it must not read as contested.
   */
  it('does not call agreement between specialists a contest', () => {
    const r = resolveReadings(T('the shadowy wood'), freq, pos);
    expect(r.contested).toBe(false);
    expect(r.primary.anchor).toBe('wood');
  });

  /**
   * MEASURED DESIGN ERROR. Counting every reading marked this contested,
   * because the prepositional-object reading names `road` while both anchor
   * specialists agreed on `shadows`. A PP object is a fact ABOUT the phrase,
   * not a rival claim to what it is about, so any phrase containing a
   * preposition looked ambiguous.
   */
  it('does not let a non-candidate reading make a settled phrase look contested', () => {
    const r = resolveReadings(T('shadows fall across the road'), freq, pos);
    expect(r.contested).toBe(false);
    const road = r.readings.find((x) => x.anchor === 'road');
    expect(road.candidate).toBe(false);
    expect(road.role).toBe('prepositional-object');
  });

  /**
   * SUPERSEDED CONCLUSION, KEPT FOR THE PART THAT SURVIVED IT.
   *
   * This test used to assert `contested === false` — that once `barn` was
   * recognised as the object of `past`, both anchor specialists landed on
   * `horse` and the phrase was settled. That was true of the ANCHOR and false of
   * the phrase: the rival reading was structural and the contest could not
   * represent it. See the reduced-relative test below for the overturn.
   *
   * What survives is the anchor result and the losing reading's visibility: a
   * reader can still see WHY `barn` lost rather than only that it did.
   */
  it('anchors the garden path on the subject and shows why the rival lost', () => {
    const r = resolveReadings(T('the horse raced past the barn fell'), freq, pos);
    expect(r.primary.anchor).toBe('horse');
    expect(r.primary.structure).toBe('main-clause');
    const barn = r.readings.find((x) => x.anchor === 'barn');
    expect(barn.role).toBe('prepositional-object');
    expect(barn.candidate).toBe(false);
  });

  /**
   * THE GARDEN PATH IS A STRUCTURE AMBIGUITY, NOT AN ANCHOR ONE.
   *
   * Both live readings anchor `horse` — it is the subject either way. What they
   * disagree about is WHICH VERB it is the subject OF:
   *
   *   main-clause       the horse raced past the barn        (main verb `raced`)
   *   reduced-relative  the horse [raced past the barn] fell (main verb `fell`)
   *
   * A contest counted over anchors alone cannot see this: one anchor, so the
   * phrase reads as over-determined when it is the most famously ambiguous
   * sentence in the literature. Readings must be distinguished by the structure
   * they assume, not only by the token they name.
   */
  it('reports the garden path as contested between two structures on one anchor', () => {
    const r = resolveReadings(T('the horse raced past the barn fell'), freq, pos);
    expect(r.contested).toBe(true);
    const onHorse = r.readings.filter((x) => x.candidate && x.anchor === 'horse');
    const structures = onHorse.map((x) => x.structure);
    expect(structures).toContain('main-clause');
    expect(structures).toContain('reduced-relative');
  });

  /**
   * JURISDICTION, NOT ABSTENTION. A single word has no clause, so the subject
   * specialist is never asked — reporting it as silent rather than as having
   * abstained keeps "not my area" distinct from "no evidence".
   */
  it('leaves a specialist silent outside its jurisdiction', () => {
    const r = resolveReadings(['wound'], freq, pos);
    expect(r.silent).toContain('clause-subject');
    expect(r.readings.every((x) => x.proposedBy !== 'clause-subject')).toBe(true);
    expect(r.primary.anchor).toBe('wound');
  });

  it('leaves salience silent when no frequency signal exists', () => {
    const r = resolveReadings(T('the shadowy wood'), new Map(), pos);
    expect(r.silent).toContain('lexical-salience');
  });

  it('every reading names the specialist that proposed it', () => {
    const r = resolveReadings(T('the man saw a comet'), freq, pos);
    expect(r.readings.every((x) => typeof x.proposedBy === 'string' && x.proposedBy.length > 0)).toBe(true);
    expect(r.readings.every((x) => typeof x.rationale === 'string' && x.rationale.length > 0)).toBe(true);
  });

  it('survives empty input without inventing a reading', () => {
    const r = resolveReadings([], freq, pos);
    expect(r.readings).toEqual([]);
    expect(r.primary).toBeNull();
    expect(r.contested).toBe(false);
  });
});
