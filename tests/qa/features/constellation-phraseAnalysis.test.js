import { describe, it, expect } from 'vitest';
import {
  classifyIntent,
  selectHeadToken,
  resolveHead,
  detectCompounds,
  assignTokenRoles,
  detectPhraseDevices,
  analyzePhraseStructure,
} from '../../../codex/core/constellation/phraseAnalysis.js';
import { resolveQueryIdentity } from '../../../codex/core/constellation/queryIdentity.js';

// ─── classifyIntent ──────────────────────────────────────────────────

describe('classifyIntent', () => {
  it('classifies a literary phrase as "literary"', () => {
    const id = resolveQueryIdentity('the bright wound of morning');
    expect(classifyIntent(id)).toBe('literary');
  });

  it('classifies a meta-query with relativizer', () => {
    const id = resolveQueryIdentity('words that rhyme with gravity but feel spiritual');
    expect(classifyIntent(id)).toBe('meta-query');
  });

  it('classifies a meta-query with two signal words', () => {
    const id = resolveQueryIdentity('find words similar to darkness');
    expect(classifyIntent(id)).toBe('meta-query');
  });

  it('classifies a craft instruction', () => {
    const id = resolveQueryIdentity('make this phrase more sonic');
    expect(classifyIntent(id)).toBe('craft-instruction');
  });

  it('classifies a comparison request', () => {
    const id = resolveQueryIdentity('compare the cadence of these two lines');
    expect(classifyIntent(id)).toBe('comparison');
  });

  it('classifies a single word as literary', () => {
    const id = resolveQueryIdentity('gravity');
    expect(classifyIntent(id)).toBe('literary');
  });

  it('classifies empty input as literary', () => {
    expect(classifyIntent({ tokens: [], normalized: '' })).toBe('literary');
  });
});

// ─── selectHeadToken ─────────────────────────────────────────────────

describe('selectHeadToken', () => {
  it('returns null for empty tokens', () => {
    expect(selectHeadToken([], new Map())).toBeNull();
  });

  it('returns null for all-stopword tokens', () => {
    expect(selectHeadToken(['the', 'of', 'and'], new Map())).toBeNull();
  });

  it('falls back to last content token without freqMap', () => {
    expect(selectHeadToken(['the', 'bright', 'wound', 'of', 'morning'])).toBe('morning');
  });

  it('selects the rarest content token when freqMap is provided', () => {
    const freqMap = new Map([
      ['bright', 500],
      ['wound', 40],   // rarest
      ['morning', 300],
    ]);
    expect(selectHeadToken(['the', 'bright', 'wound', 'of', 'morning'], freqMap)).toBe('wound');
  });

  it('breaks ties toward the last (rightmost) content token', () => {
    const freqMap = new Map([
      ['bright', 100],
      ['wound', 100],
      ['morning', 100],
    ]);
    // All equal freq → last content token wins
    expect(selectHeadToken(['bright', 'wound', 'morning'], freqMap)).toBe('morning');
  });

  it('treats unknown words (not in freqMap) as maximally rare', () => {
    const freqMap = new Map([
      ['bright', 500],
      ['morning', 300],
    ]);
    // "wound" not in freqMap → Infinity → rarest
    expect(selectHeadToken(['bright', 'wound', 'morning'], freqMap)).toBe('wound');
  });
});

// ─── selectHeadToken: nominal-head precedence ────────────────────────

/**
 * MEASURED REGRESSION. `the wound healed` anchored on "healed" (corpus freq 7)
 * over "wound" (79) because rarity ran over every content token. A page about a
 * phrase is about its nominal head; rarity only ranks AMONG nominals.
 */
describe('selectHeadToken — nominal head precedence', () => {
  const posMap = new Map([
    ['wound', ['a', 'n', 'v']],
    ['healed', ['a']],
    ['bright', ['a']],
    ['morning', ['n']],
    ['clock', ['n', 'v']],
  ]);

  it('anchors on the noun, not a rarer non-noun predicate', () => {
    const freqMap = new Map([['wound', 79], ['healed', 7]]);
    expect(selectHeadToken(['the', 'wound', 'healed'], freqMap, posMap)).toBe('wound');
  });

  it('still ranks by rarity among the nominal candidates', () => {
    const freqMap = new Map([['bright', 194], ['wound', 79], ['morning', 599]]);
    // "bright" has no noun entry and drops out; wound (79) is rarer than morning (599).
    expect(selectHeadToken(['the', 'bright', 'wound', 'of', 'morning'], freqMap, posMap)).toBe('wound');
  });

  it('leaves rarity-only behaviour intact when no token is nominal', () => {
    const freqMap = new Map([['bright', 194], ['healed', 7]]);
    expect(selectHeadToken(['the', 'bright', 'healed'], freqMap, posMap)).toBe('healed');
  });

  it('leaves rarity-only behaviour intact when no POS data is available', () => {
    const freqMap = new Map([['wound', 79], ['healed', 7]]);
    expect(selectHeadToken(['the', 'wound', 'healed'], freqMap, new Map())).toBe('healed');
  });
});

// ─── selectHeadToken: subject-verb agreement ─────────────────────────

/**
 * AN ORTHOGRAPHIC CUE, NO LOOKUP REQUIRED. English puts -s on exactly one of a
 * subject/verb pair, so the complementary distribution across an adjacent pair
 * names the roles:
 *
 *     singular subject + verb-s      water runs
 *     plural subject   + bare verb   stars burn
 *
 * The naive suffix test fails and is worth naming: `runs` is a verb ending in
 * -s and `stars` is a noun ending in -s, so the ending alone says nothing.
 */
describe('selectHeadToken — agreement demotes the verb of an adjacent pair', () => {
  const pos = new Map([
    ['water', ['n', 'v']], ['runs', ['n', 'v']], ['stars', ['n', 'v']],
    ['burn', ['n', 'v']], ['river', ['n']], ['flows', ['n', 'v']],
    ['wound', ['a', 'n', 'v']], ['healed', ['a']], ['clock', ['n', 'v']],
    ['glass', ['n']], ['breaks', ['n', 'v']],
  ]);

  it('keeps the singular subject over a rarer verb carrying -s', () => {
    const freq = new Map([['water', 597], ['runs', 65]]);
    expect(selectHeadToken(['water', 'runs'], freq, pos)).toBe('water');
  });

  it('keeps the plural subject over a rarer bare verb', () => {
    const freq = new Map([['stars', 124], ['burn', 32]]);
    expect(selectHeadToken(['the', 'silent', 'stars', 'burn'], freq, pos)).toBe('stars');
  });

  /** `ss` is not an inflection — reading it as one would invert this pair. */
  it('does not mistake a bare singular ending in ss for a plural', () => {
    const freq = new Map([['glass', 500], ['breaks', 100]]);
    expect(selectHeadToken(['glass', 'breaks'], freq, pos)).toBe('glass');
  });

  /**
   * Neither word carries -s, so there is no agreement signal. Abstaining leaves
   * the rarity rule in charge rather than inventing a role.
   */
  it('abstains when the pair carries no -s at all', () => {
    const freq = new Map([['wound', 79], ['healed', 7]]);
    // `healed` is rarer but is not nominal, so the nominal rule still holds.
    expect(selectHeadToken(['the', 'wound', 'healed'], freq, pos)).toBe('wound');
  });

  /**
   * Demotion must not chain. `water runs` settles `runs` as the predicate, and
   * `runs` is then unavailable to head `runs deep` — otherwise both nominals
   * after the verb vanish and the anchor falls through to an earlier modifier.
   */
  it('does not let a demoted verb act as the subject of the next pair', () => {
    const p2 = new Map([...pos, ['cold', ['a', 'n']], ['deep', ['a', 'n', 'r']]]);
    const freq = new Map([['cold', 402], ['water', 597], ['runs', 65], ['deep', 289]]);
    const head = selectHeadToken(['cold', 'water', 'runs', 'deep'], freq, p2);
    expect(head).not.toBe('cold');
  });

  it('leaves the anchor alone when no candidate follows it', () => {
    // `he wound the clock` — a determiner separates the pair, so agreement
    // never fires and the heteronym the query exists to disambiguate survives.
    const freq = new Map([['wound', 79], ['clock', 251]]);
    expect(selectHeadToken(['he', 'wound', 'the', 'clock'], freq, pos)).toBe('wound');
  });
});

// ─── selectHeadToken: positional role ────────────────────────────────

/**
 * A NOUN TAG IS NOT A NOMINAL SLOT.
 *
 * `cold water runs deep` cleared every other cue and still anchored on `deep`.
 * Measured, nothing voted for `water`: every frame reading abstained, agreement
 * spoke only about `runs`, and cold/water/deep all carry an "n" tag — `cold`
 * the sensation, `deep` the deep — so rarity took the rarest survivor
 * unopposed. Position is the missing signal, not arbitration between cues.
 */
describe('selectHeadToken — positional role demotes non-referential nominals', () => {
  const pos = new Map([
    ['cold', ['a', 'n']], ['water', ['n', 'v']], ['runs', ['n', 'v']],
    ['deep', ['a', 'n', 'r']], ['moon', ['n']], ['pale', ['a']],
    ['smoke', ['n', 'v']], ['black', ['a', 'n']], ['dark', ['a', 'n']],
    ['river', ['n']], ['flows', ['n', 'v']], ['wound', ['a', 'n', 'v']],
    ['clock', ['n', 'v']],
  ]);
  const freq = new Map([
    ['cold', 402], ['water', 597], ['runs', 65], ['deep', 289],
    ['moon', 300], ['smoke', 250], ['black', 800], ['dark', 434],
    ['river', 164], ['flows', 40], ['wound', 79], ['clock', 251],
  ]);

  it('demotes an attributive adjective sitting on a following nominal', () => {
    // `cold` carries a noun sense but modifies `water`; it is not the subject.
    expect(selectHeadToken(['cold', 'water', 'runs', 'deep'], freq, pos)).toBe('water');
  });

  it('demotes a predicate complement following the verb', () => {
    // `deep` follows the token agreement settled as the verb, so it complements
    // that verb rather than heading a second subject.
    const head = selectHeadToken(['cold', 'water', 'runs', 'deep'], freq, pos);
    expect(head).not.toBe('deep');
  });

  it('demotes a colour word used attributively', () => {
    expect(selectHeadToken(['black', 'smoke', 'drifts', 'low'], freq, pos)).toBe('smoke');
  });

  /**
   * Adjacency is required. An adjective that neither precedes a nominal nor
   * follows a settled verb keeps its place — the rules stay silent rather than
   * demoting on shape alone.
   */
  it('leaves an adjective alone when it is in neither position', () => {
    const p2 = new Map([['dark', ['a', 'n']], ['gravity', ['n']]]);
    const f2 = new Map([['dark', 434], ['gravity', 12]]);
    // `dark` is last, follows nothing demoted, precedes nothing: it survives,
    // and rarity still picks the rarer `gravity`.
    expect(selectHeadToken(['gravity', 'and', 'dark'], f2, p2)).toBe('gravity');
  });

  it('does not strip the last nominal standing', () => {
    // Demoting everything would leave no anchor; the pool falls back rather
    // than returning null on a phrase that plainly has a subject.
    const p2 = new Map([['dark', ['a', 'n']]]);
    expect(selectHeadToken(['dark'], new Map([['dark', 434]]), p2)).toBe('dark');
  });

  it('leaves a heteronym anchor intact across a determiner', () => {
    expect(selectHeadToken(['he', 'wound', 'the', 'clock'], freq, pos)).toBe('wound');
  });
});

// ─── resolveHead: provenance ─────────────────────────────────────────

/**
 * THE ANCHOR NOW SHOWS ITS WORK. Precedence used to live in statement order and
 * the winner was never recorded, so a surprising anchor could only be argued
 * with, not traced. This is the same discipline leximancy's `selectedBy`
 * enforces one layer up.
 */
describe('resolveHead — records which cue vetoed each candidate', () => {
  const pos = new Map([
    ['cold', ['a', 'n']], ['water', ['n', 'v']], ['runs', ['n', 'v']],
    ['deep', ['a', 'n', 'r']], ['horse', ['n', 'v']], ['barn', ['n']],
    ['fell', ['a', 'n', 'v']], ['past', ['a', 'n', 'r']], ['raced', ['v']],
  ]);
  const freq = new Map([
    ['cold', 402], ['water', 597], ['runs', 65], ['deep', 289],
    ['horse', 206], ['barn', 25], ['fell', 333], ['past', 378],
  ]);

  it('names the cue that removed each demoted candidate', () => {
    const r = resolveHead(['cold', 'water', 'runs', 'deep'], freq, pos);
    const by = Object.fromEntries(r.demoted.map((d) => [d.token, d.vetoedBy]));
    expect(by.cold).toBe('attributive-modifier');
    expect(by.runs).toBe('agreement-predicate');
    expect(by.deep).toBe('predicate-complement');
    expect(r.token).toBe('water');
    expect(r.decidedBy).toBe('rarity');
  });

  /**
   * THE GARDEN PATH, AND WHY IT FAILS LEGIBLY.
   *
   * `the horse raced past the barn fell` anchors on `barn`, not `horse`. The
   * provenance shows the reason is an ABSENCE, not a wrong verdict: no token
   * carries an inflectional -s so agreement is blind across the whole sentence,
   * and no adjective sits before a nominal or after a settled verb, so both
   * positional cues stay silent. Nothing is demoted and rarity picks the rarest
   * survivor unopposed. There is no cue to correct — there is a cue missing.
   */
  it('demotes nothing in the garden-path sentence, exposing the missing cue', () => {
    const r = resolveHead(['the', 'horse', 'raced', 'past', 'the', 'barn', 'fell'], freq, pos);
    expect(r.demoted).toEqual([]);
    expect(r.pool).toContain('horse');
    expect(r.token).toBe('barn');
    expect(r.decidedBy).toBe('rarity');
  });

  it('reports last-content when no frequency signal exists', () => {
    expect(resolveHead(['cold', 'water'], new Map(), pos).decidedBy).toBe('last-content');
  });

  it('never strips the last candidate standing', () => {
    const p2 = new Map([['dark', ['a', 'n']]]);
    const r = resolveHead(['dark'], new Map([['dark', 434]]), p2);
    expect(r.token).toBe('dark');
  });
});

// ─── detectCompounds ─────────────────────────────────────────────────

describe('detectCompounds', () => {
  it('detects adj+noun bigrams', () => {
    const compounds = detectCompounds(['the', 'bright', 'wound', 'of', 'morning']);
    expect(compounds).toContain('bright wound');
  });

  it('detects multiple compounds', () => {
    const compounds = detectCompounds(['silent', 'silver', 'sea']);
    // "silent" is adj, "silver" is also adj → "silent silver" is adj+adj, NOT a compound
    // "silver" is adj, "sea" is noun → "silver sea" IS a compound
    expect(compounds).toContain('silver sea');
    expect(compounds).not.toContain('silent silver');
  });

  it('returns empty for single tokens', () => {
    expect(detectCompounds(['morning'])).toEqual([]);
  });

  it('skips stopword pairs', () => {
    expect(detectCompounds(['the', 'of'])).toEqual([]);
  });

  it('returns empty for empty input', () => {
    expect(detectCompounds([])).toEqual([]);
  });
});

// ─── assignTokenRoles ────────────────────────────────────────────────

describe('assignTokenRoles', () => {
  it('assigns head, modifier, connector, specifier roles', () => {
    const roles = assignTokenRoles(['the', 'bright', 'wound', 'of', 'morning'], 'wound');
    expect(roles).toEqual([
      { token: 'the', role: 'connector' },
      { token: 'bright', role: 'modifier' },
      { token: 'wound', role: 'head' },
      { token: 'of', role: 'connector' },
      { token: 'morning', role: 'specifier' },
    ]);
  });

  it('handles null headToken', () => {
    const roles = assignTokenRoles(['the', 'of'], null);
    expect(roles.every((r) => r.role === 'connector')).toBe(true);
  });
});

// ─── detectPhraseDevices ─────────────────────────────────────────────

describe('detectPhraseDevices', () => {
  it('detects alliteration', () => {
    const id = resolveQueryIdentity('silent silver sea');
    const devices = detectPhraseDevices(id);
    expect(devices).toContain('alliteration');
  });

  it('detects sibilance', () => {
    const id = resolveQueryIdentity('silent silver sea');
    const devices = detectPhraseDevices(id);
    expect(devices).toContain('sibilance');
  });

  it('detects assonance', () => {
    // "bright" and "wound" don't share vowel nucleus, but "wound" and "morning"
    // don't either. Let's use a clear case: "deep sleep" shares 'ee'
    const id = resolveQueryIdentity('deep sleep');
    const devices = detectPhraseDevices(id);
    expect(devices).toContain('assonance');
  });

  it('detects consonance', () => {
    // "bright" and "wound" both end in 't'/'d' — no. Let's use "cold world" (both end in 'd')
    const id = resolveQueryIdentity('cold world');
    const devices = detectPhraseDevices(id);
    expect(devices).toContain('consonance');
  });

  it('detects imagery-candidate from compounds', () => {
    const id = resolveQueryIdentity('the bright wound of morning');
    const devices = detectPhraseDevices(id);
    expect(devices).toContain('imagery-candidate');
  });

  it('returns empty for single-token input', () => {
    const id = resolveQueryIdentity('morning');
    expect(detectPhraseDevices(id)).toEqual([]);
  });

  it('returns empty for all-stopword input', () => {
    const id = resolveQueryIdentity('the of and');
    expect(detectPhraseDevices(id)).toEqual([]);
  });
});

// ─── analyzePhraseStructure (orchestrator) ───────────────────────────

describe('analyzePhraseStructure', () => {
  it('produces a complete structure for a literary phrase', () => {
    const id = resolveQueryIdentity('the bright wound of morning');
    const freqMap = new Map([
      ['bright', 500],
      ['wound', 40],
      ['morning', 300],
    ]);
    const result = analyzePhraseStructure(id, freqMap);

    expect(result.intent).toBe('literary');
    expect(result.headToken).toBe('wound'); // rarest
    expect(result.compounds).toContain('bright wound');
    expect(result.devices).toContain('imagery-candidate');
    expect(result.tokenRoles.length).toBe(5);
    expect(result.tokenRoles.find((r) => r.role === 'head')?.token).toBe('wound');
  });

  it('produces a meta-query intent for instruction-like input', () => {
    const id = resolveQueryIdentity('words that rhyme with gravity');
    const result = analyzePhraseStructure(id, new Map());
    expect(result.intent).toBe('meta-query');
  });

  it('is deterministic for the same input', () => {
    const id = resolveQueryIdentity('the bright wound of morning');
    const freqMap = new Map([['bright', 500], ['wound', 40], ['morning', 300]]);
    const a = analyzePhraseStructure(id, freqMap);
    const b = analyzePhraseStructure(id, freqMap);
    expect(a).toEqual(b);
  });
});

// ─── resolveQueryIdentity integration ────────────────────────────────

describe('resolveQueryIdentity with phrase analysis', () => {
  it('includes intent field', () => {
    const id = resolveQueryIdentity('the bright wound of morning');
    expect(id.intent).toBe('literary');
  });

  it('selects rarest head token when freqMap is provided', () => {
    const freqMap = new Map([
      ['bright', 500],
      ['wound', 40],
      ['morning', 300],
    ]);
    const id = resolveQueryIdentity('the bright wound of morning', freqMap);
    expect(id.primaryContentToken).toBe('wound');
  });

  it('falls back to last content token without freqMap', () => {
    const id = resolveQueryIdentity('the bright wound of morning');
    expect(id.primaryContentToken).toBe('morning');
  });

  it('preserves backward compatibility for single words', () => {
    const id = resolveQueryIdentity('gravity');
    expect(id.kind).toBe('word');
    expect(id.primaryContentToken).toBe('gravity');
    expect(id.intent).toBe('literary');
  });
});
