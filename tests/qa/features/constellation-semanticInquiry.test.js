/**
 * CONSTELLATION — semantic inquiry channel, wired end to end
 *
 * The risk this file exists to close: a channel that is imported, called, and
 * reported on, but never actually changes anything. The suites that already
 * existed passed unchanged after wiring, which proves nothing about whether the
 * probe DOES something. So every test here drives the real
 * buildConstellationPage and asserts on observable page output.
 */
import { describe, it, expect } from 'vitest';
import { buildConstellationPage } from '../../../codex/server/services/constellationPage.service.js';

/** Two senses that are cleanly separable by gloss overlap. */
const CRANE_SENSES = [
  { gloss: 'a large wading bird with long legs', pos: 'noun' },
  { gloss: 'a machine for lifting heavy objects', pos: 'noun' },
];

function craneAdapter(overrides = {}) {
  return {
    lookupWord: (w) => (w === 'crane' ? [{ pos: 'noun', headword: 'crane', senses: CRANE_SENSES }] : []),
    extractGloss: (s) => {
      const x = s?.[0];
      return typeof x === 'string' ? x : (x && x.gloss) || null;
    },
    lookupSynonyms: () => [{ lemma: 'heron' }],
    lookupAntonyms: () => [],
    lookupRelated: () => ({ broader: [{ lemma: 'bird' }], narrower: [], akin: [] }),
    // Mirrors the real adapter's POS partition. Without it the required
    // observation is inconclusive and the hypothesis is correctly underdetermined.
    lookupLexicalEntries: () => [
      { pos: 'n', senses: CRANE_SENSES.map((s, i) => ({ synsetId: `oewn-c${i}-n`, gloss: s.gloss, examples: [] })) },
    ],
    // Make 'crane' the rarest token so it wins head-token selection (PDR §3.2).
    getCorpusFrequencies: (words) => new Map(words.map((w) => [w, w === 'crane' ? 5 : 500])),
    ...overrides,
  };
}

/**
 * Phonology stub. cmudict does not load under vitest, so the real source reports
 * "cannot tell" for every word — which correctly leaves every sense hypothesis
 * underdetermined and would make these tests assert nothing. Injecting it also
 * lets the heteronym case be exercised deliberately.
 */
const phonology = {
  async ready() { return true; },
  variants(word) {
    if (word === 'wound') return [['W', 'AW1', 'N', 'D'], ['W', 'UW1', 'N', 'D']];
    return [['K', 'R', 'EY1', 'N']];
  },
};

const rhymeQueryEngine = { async query() { return { topMatches: [], constellations: [], diagnostics: {} }; } };
const rhymeLexiconRepo = { lookupNodeByNormalized: () => ({ phonemes: ['K', 'R', 'EY1', 'N'] }) };
const depsWith = (lexiconAdapter) => ({ lexiconAdapter, rhymeQueryEngine, rhymeLexiconRepo, phonology });

describe('the channel is actually wired', () => {
  it('appears on the packet and in provenance', async () => {
    const p = await buildConstellationPage('crane wading bird legs', depsWith(craneAdapter()));
    expect(p.semanticInquiry).toBeTruthy();
    expect(p.semanticInquiry.probeId).toBe('constellation.sense.disambiguation');
    expect(p.provenance.engineVersions.semanticInquiry).toBe('sem-inquiry-1');
  });

  it('re-keys pageBytecode — the new engine version is part of page identity', async () => {
    const p = await buildConstellationPage('crane wading bird legs', depsWith(craneAdapter()));
    // pageBytecode is computed from engineVersions; if the channel were absent
    // from that map the identity would be unchanged and stale pages would be
    // served as though nothing had been added.
    expect(Object.keys(p.provenance.engineVersions)).toContain('semanticInquiry');
    expect(p.pageBytecode).toBeTruthy();
  });

  it('stays deterministic — same query, same bytecode', async () => {
    const a = await buildConstellationPage('crane wading bird legs', depsWith(craneAdapter()));
    const b = await buildConstellationPage('crane wading bird legs', depsWith(craneAdapter()));
    expect(a.pageBytecode).toBe(b.pageBytecode);
    expect(a.semanticInquiry).toEqual(b.semanticInquiry);
  });
});

describe('the gate changes the answer when evidence warrants it', () => {
  it('selects the sense whose gloss the query actually supports', async () => {
    const p = await buildConstellationPage('crane wading bird legs', depsWith(craneAdapter()));

    expect(p.semanticInquiry.bound).toBe(true);
    expect(p.semanticInquiry.hypotheses.supported).toContain('h_sense_by_gloss_overlap');
    expect(p.semanticInquiry.selection.warranted).toBe(true);
    expect(p.semanticInquiry.selection.gloss).toMatch(/wading bird/);
    expect(p.semanticInquiry.selection.overlap).toBeGreaterThan(0);

    // The observable consequence: leximancy's selection now points at the
    // evidenced sense, not at whichever sense happened to be listed first.
    const selected = p.leximancy.interpretations.find(
      (i) => i.id === p.leximancy.selectedInterpretationId,
    );
    expect(selected.gloss).toMatch(/wading bird/);
    expect(p.leximancy.selectedInterpretationId).toBe(p.semanticInquiry.selection.senseId);
  });

  it('picks the OTHER sense when the query points the other way', async () => {
    // Same lexicon, different query. If the channel were inert both queries
    // would select the same sense.
    const p = await buildConstellationPage('crane machine lifting heavy', depsWith(craneAdapter()));

    expect(p.semanticInquiry.selection.warranted).toBe(true);
    expect(p.semanticInquiry.selection.gloss).toMatch(/machine for lifting/);
    const selected = p.leximancy.interpretations.find(
      (i) => i.id === p.leximancy.selectedInterpretationId,
    );
    expect(selected.gloss).toMatch(/machine for lifting/);
  });
});

describe('the gate refuses when evidence does not warrant it', () => {
  it('does not select when no gloss overlaps the query', async () => {
    const p = await buildConstellationPage('crane gravity spiritual', depsWith(craneAdapter()));

    expect(p.semanticInquiry.hypotheses.eliminated).toContain('h_sense_by_gloss_overlap');
    expect(p.semanticInquiry.selection.warranted).toBe(false);
    expect(p.semanticInquiry.selection.reason).toBe('eliminated');
    expect(p.semanticInquiry.selection.senseId).toBeNull();
  });

  it('does not bind a multiline draft', async () => {
    const p = await buildConstellationPage('crane wading bird\nsecond line here', depsWith(craneAdapter()));
    expect(p.semanticInquiry.bound).toBe(false);
    expect(p.semanticInquiry.status).toBe('not_bound');
  });
});

describe('heteronyms are split, not chosen between', () => {
  const woundSenses = [
    { gloss: 'put in a coil', pos: 'a' },
    { gloss: 'an injury to living tissue', pos: 'n' },
  ];
  const woundAdapter = () => ({
    lookupWord: () => [{ pos: 'a', headword: 'wound', senses: woundSenses }],
    extractGloss: (s) => { const x = s?.[0]; return typeof x === 'string' ? x : (x && x.gloss) || null; },
    lookupSynonyms: () => [], lookupAntonyms: () => [],
    lookupRelated: () => ({ broader: [], narrower: [], akin: [] }),
    lookupLexicalEntries: () => [
      { pos: 'a', senses: [{ synsetId: 'oewn-02325885-s', gloss: 'put in a coil', examples: [] }] },
      { pos: 'n', senses: [{ synsetId: 'oewn-14322317-n', gloss: 'an injury to living tissue', examples: [] }] },
    ],
    getCorpusFrequencies: (ws) => new Map(ws.map((w) => [w, 5])),
  });

  it('refuses to select when the spelling is two words, and surfaces both', async () => {
    // wound is /W AW1 N D/ (coiled) and /W UW1 N D/ (injury). Choosing between
    // them is not disambiguation — it is picking a word and calling it a sense.
    const p = await buildConstellationPage('wound', depsWith(woundAdapter()));

    expect(p.semanticInquiry.distinctPronunciations).toBe(2);
    expect(p.semanticInquiry.isHeteronym).toBe(true);
    expect(p.semanticInquiry.selection.warranted).toBe(false);
    expect(p.semanticInquiry.selection.reason).toBe('heteronym_unresolved');
    // Both words travel with the page so the reader sees the split.
    expect(p.semanticInquiry.lexicalEntries.map((e) => e.pos).sort()).toEqual(['a', 'n']);
  });

  it('multiple parts of speech alone is NOT a heteronym', async () => {
    // crane is n/v but one pronunciation. The first version of this check read
    // POS count and flagged 15 of 20 real queries.
    const p = await buildConstellationPage('crane wading bird legs', depsWith(craneAdapter()));
    expect(p.semanticInquiry.distinctPronunciations).toBe(1);
    expect(p.semanticInquiry.isHeteronym).toBe(false);
  });

  it('says so out loud when phonology cannot answer', async () => {
    const blind = { async ready() { return false; }, variants() { return []; } };
    const deps = { ...depsWith(craneAdapter()), phonology: blind };
    const p = await buildConstellationPage('crane wading bird legs', deps);

    expect(p.semanticInquiry.distinctPronunciations).toBeNull();
    expect(p.diagnostics.degradedChannels).toContain('semanticInquiry.phonology');
    // and it must NOT quietly select on evidence it could not fully check
    expect(p.semanticInquiry.selection.warranted).toBe(false);
  });
});

describe('degradation', () => {
  it('a thrown lexicon lookup degrades the channel without failing the page', async () => {
    const broken = craneAdapter({
      lookupWord: () => { throw new Error('lexicon offline'); },
    });
    const p = await buildConstellationPage('crane wading bird legs', depsWith(broken));

    // The page still builds; leximancy and semanticInquiry both degrade.
    expect(p.pageBytecode).toBeTruthy();
    expect(p.diagnostics.degradedChannels).toContain('semanticInquiry');
  });

  it('a disconnected adapter never produces a warranted selection', async () => {
    const offline = craneAdapter({ __unsafe: { connected: false } });
    const p = await buildConstellationPage('crane wading bird legs', depsWith(offline));

    // Tool failure must not eliminate either — it reports as unresolved, not refuted.
    expect(p.semanticInquiry.selection.warranted).toBe(false);
    expect(p.semanticInquiry.hypotheses.eliminated).not.toContain('h_sense_by_gloss_overlap');
  });
});
