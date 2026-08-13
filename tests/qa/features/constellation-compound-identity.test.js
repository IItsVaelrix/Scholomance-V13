/**
 * COMPOUND IDENTITY, PINNED TO THE PHRASES THAT PROVED IT.
 *
 * `compoundTags` types a hyphen-declared compound as the union of its pieces'
 * identities. Measured over 4,000 compound-bearing Gutenberg phrases with the
 * product's own lexicon (`scripts/compound-identity-experiment.mjs`):
 *
 *   SPLIT  pieces fed separately            20.5%
 *   FUSED  one token nothing can name       16.5%   <- the product before
 *   UNION  one token, pieces' identities    28.8%   <- after
 *
 *   FUSED -> UNION  +12.3pp, gained 555, lost 64, McNemar exact p = 1.3e-98
 *
 * THE 64 LOSSES ARE IN THIS FIXTURE. A change that trades them away for
 * something better is a decision somebody should make on purpose, so they are
 * pinned here with their outcomes rather than summarised as a rate. `by-and-by`
 * is the archetype: three pieces whose union drags conjunction and preposition
 * identities into a phrase that parsed without them.
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
const spans = tokens => {
  try {
    return compose(tokens, posMap).stable.length > 0;
  } catch {
    return false;
  }
};

/** The arms, reproduced exactly as the experiment defines them. */
const HIDDEN = ' unnameable';
const fusedOf = item => item.tokens.map(t => (item.compounds.includes(t) ? HIDDEN : t));
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

  it('pins the losses this change accepted', () => {
    const regressions = fixture.phrases.filter(item => item.fused && !item.union);
    expect(regressions.length).toBe(fixture.regressionsFrozen);

    // Every one still loses, and every one is still reproduced by the arms as
    // frozen. A regression that silently healed is as much a drift as a new one.
    for (const item of regressions) {
      expect(spans(fusedOf(item)), `${item.tokens.join(' ')} no longer parses fused`).toBe(true);
      expect(spans(item.tokens), `${item.tokens.join(' ')} now parses under union`).toBe(false);
    }
  });

  it('reproduces the split arm the experiment measured', () => {
    const drift = fixture.phrases.filter(item => spans(splitOf(item)) !== item.split);
    expect(drift.map(item => item.tokens.join(' '))).toEqual([]);
  });
});
