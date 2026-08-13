/**
 * COMPOUND IDENTITY, PINNED TO THE PHRASES THAT PROVED IT.
 *
 * `compoundTags` types a hyphen-declared compound as the union of its pieces'
 * identities. Measured over 4,000 compound-bearing Gutenberg phrases with the
 * product's own lexicon (`scripts/compound-identity-experiment.mjs`):
 *
 *   SPLIT  pieces fed separately            22.7%
 *   FUSED  compound identity switched off   12.7%   <- the product before
 *   UNION  one token, pieces' identities    32.9%   <- after
 *
 *   FUSED -> UNION  +20.1pp, gained 805, lost 0, McNemar exact p = 9.4e-243
 *   SPLIT -> UNION  +10.2pp, gained 558, lost 151
 *
 * The phrases are SANITISED. Splitting at every period shatters `Mr. Bennet`,
 * and a length filter then deletes the pieces; audited over 900 books, the naive
 * extractor began 4.4% of its segments mid-clause and silently discarded 70.3%
 * of them. Short malformed fragments parse MORE easily than whole sentences, so
 * that corpus flatters every coverage number taken on it. Abbreviations are now
 * protected before segmentation, closing quotes are real boundaries, and every
 * drop carries a reason code. The original +19.2pp delta survived the first
 * sanitation pass at +19.3pp and the contract-hardened replay at +20.1pp: a
 * paired design cancels damage that hits all three arms, which is why it was
 * worth checking rather than assuming.
 *
 * ZERO LOSSES AGAINST FUSED IS A PROPERTY, NOT A RESULT. `compoundTags` fires
 * only when nothing else named the token, so it strictly adds atoms, and more
 * atoms can only add molecules. An earlier version of the experiment reported
 * 64 losses; they were an artifact of modelling FUSED with a placeholder token
 * that happened to end in `-able`, which the suffix backoff typed as an
 * adjective. The arm is now the real switch, and the invariant is asserted
 * rather than the artifact pinned.
 *
 * The 151 losses against SPLIT are real, and are the tokenizer question this
 * feature does not settle: whether the reader should fuse at all.
 *
 * The corpus is 1.8GB and not in the repository. The phrases and the lexicon
 * rows they reach are, so this runs anywhere.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compose } from '../../../codex/core/constellation/compose.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../fixtures/constellation/compound-identity.json'), 'utf8'),
);

const posMap = new Map(Object.entries(fixture.lexicon));
/**
 * NO CATCH. A chart that cannot build a phrase returns an empty `stable`; it
 * does not throw. Swallowing an exception here would convert a crash into a
 * quiet "this phrase changed outcome" mismatch — the failure would present as
 * evidence drift rather than as the error it is. Tribunal rule 10: silence is a
 * state mutation.
 */
const spans = (tokens, options) => compose(tokens, posMap, options).stable.length > 0;

/** The arms, reproduced exactly as the experiment defines them. */
const NO_COMPOUND = { compoundIdentity: false };
const splitOf = item => item.tokens.flatMap(t => (item.compounds.includes(t) ? t.split('-') : [t]));

describe('compound identity is the union of its pieces', () => {
  it('types a hyphen-declared compound the lexicon has never seen', () => {
    const lexicon = new Map([['the', []], ['peach', ['n']], ['tree', ['n']], ['fell', ['n', 'v']]]);
    expect(lexicon.has('peach-tree')).toBe(false);

    const atoms = compose(['the', 'peach-tree', 'fell'], lexicon)
      .atoms.filter(a => a.token === 'peach-tree').map(a => a.type);

    expect(atoms).toContain('NC');
    expect(compose(['the', 'peach-tree', 'fell'], lexicon).stable.length).toBeGreaterThan(0);
  });

  it('leaves a compound the lexicon does know to its own row', () => {
    // The union is a fallback, not an override: a table that has an opinion keeps it.
    const lexicon = new Map([['the', []], ['well-being', ['n']], ['matters', ['n', 'v']]]);
    const atoms = compose(['the', 'well-being', 'matters'], lexicon)
      .atoms.filter(a => a.token === 'well-being').map(a => a.type);
    expect(atoms).toContain('NC');
  });

  it('is not fooled by a bare dash or a numeric range', () => {
    const lexicon = new Map([['the', []], ['cat', ['n']], ['sat', ['v']]]);
    for (const token of ['--', '-', '1-2', 'a-']) {
      const atoms = compose(['the', token, 'sat'], lexicon)
        .atoms.filter(a => a.token === token).map(a => a.type);
      expect(atoms, `${token} should receive no compound identity`).not.toContain('NC');
    }
  });

  it('reproduces every frozen phrase outcome', () => {
    const drift = [];
    for (const item of fixture.phrases) {
      const union = spans(item.tokens);
      if (union !== item.union) {
        drift.push(`${item.tokens.join(' ')}  frozen=${item.union} now=${union}`);
      }
    }
    expect(drift, `${drift.length} phrase(s) changed outcome:\n  ${drift.join('\n  ')}`).toEqual([]);
  });

  it('still beats both arms on the unbiased half of the slice', () => {
    // ONLY the prefix. The regressions were selected for being losses, so a rate
    // over the whole slice is guaranteed to make this change look worse than it
    // is — an assertion the sampling design would decide, not the parser.
    const prefix = fixture.phrases.filter(item => item.fromPrefix);
    expect(prefix.length).toBeGreaterThan(100);

    const rate = key => prefix.filter(item => item[key]).length / prefix.length;
    const union = prefix.filter(item => spans(item.tokens)).length / prefix.length;
    expect(union).toBeGreaterThan(rate('fused'));
    expect(union).toBeGreaterThan(rate('split'));
  });

  it('can never take a parse away, by construction', () => {
    // compoundTags fires only when nothing else named the token, so it strictly
    // ADDS atoms, and more atoms can only add molecules. Zero losses against
    // FUSED is therefore a property, not a lucky measurement — and this is where
    // a change that broke the property would surface.
    const lost = fixture.phrases
      .filter(item => spans(item.tokens, NO_COMPOUND) && !spans(item.tokens))
      .map(item => item.tokens.join(' '));

    expect(lost, `compound identity removed ${lost.length} parse(s):\n  ${lost.join('\n  ')}`).toEqual([]);
    expect(fixture.regressionsFrozen).toBe(0);
  });

  it('reproduces both arms the experiment measured', () => {
    const fusedDrift = fixture.phrases.filter(item => spans(item.tokens, NO_COMPOUND) !== item.fused);
    expect(fusedDrift.map(item => item.tokens.join(' '))).toEqual([]);

    // Losing to SPLIT is real and is the tokenizer question this does not
    // settle, so those phrases are pinned rather than summarised away.
    const splitDrift = fixture.phrases.filter(item => spans(splitOf(item)) !== item.split);
    expect(splitDrift.map(item => item.tokens.join(' '))).toEqual([]);
    expect(fixture.phrases.filter(item => item.split && !item.union).length)
      .toBe(fixture.splitRegressionsFrozen);
  });
});
