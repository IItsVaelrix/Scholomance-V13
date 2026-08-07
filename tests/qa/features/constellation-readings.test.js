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
   * The garden path is SETTLED, not contested: once `barn` is recognised as the
   * object of `past`, both anchor specialists land on `horse`. The losing
   * reading is still surfaced, so a reader can see why `barn` lost rather than
   * only that it did.
   */
  it('settles the garden path and still shows why the rival lost', () => {
    const r = resolveReadings(T('the horse raced past the barn fell'), freq, pos);
    expect(r.contested).toBe(false);
    expect(r.primary.anchor).toBe('horse');
    const barn = r.readings.find((x) => x.anchor === 'barn');
    expect(barn.role).toBe('prepositional-object');
    expect(barn.candidate).toBe(false);
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
