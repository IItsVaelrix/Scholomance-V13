import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  AST_INVENTORY,
  AST_INDEX,
  resolveAstKinds,
  generateAstTopographicVector,
  astTopographicSimilarity,
  AST_BAND_COUNT,
  NONDETERMINISM_CALLEES,
  assertInventoryFenced
} from '../../../../codex/core/semantic/ast-topography.js';

const BANDS = [
  { name: 'B0 kind', start: 0, end: 64 },
  { name: 'B1 edge', start: 64, end: 128 },
  { name: 'B2 topology', start: 128, end: 192 },
  { name: 'B3 module', start: 192, end: 256 }
];

function bandNorm(v, band) {
  let n = 0;
  for (let i = band.start; i < band.end; i++) n += v[i] * v[i];
  return Math.sqrt(n);
}

const FIXTURE = 'tests/qa/fixtures/cleri-probe';
const read = (p) => ({ path: `${FIXTURE}/${p}`, content: readFileSync(`${FIXTURE}/${p}`, 'utf8') });

// ── The property that separates this from a hand-authored inventory ─────────

describe('the inventory is closed and the resolver declares its own absence', () => {
  it('returns null for source the parser cannot read, never a guessed vector', () => {
    // semantotopography's step-4 hash fallback assigns two random primitives to
    // any word it does not know, which is how `carafe` became ["NEGATED"] and
    // how 1,917 WordNet lemmas acquired a negation marker. An AST inventory has
    // no OOV path: the parse succeeds or it does not, and "I could not resolve
    // this" is a value the caller can see.
    expect(generateAstTopographicVector({ path: 'broken.js', content: 'const = = ;;;' })).toBeNull();
  });

  it('indexes every inventory kind to a unique band-0 dimension', () => {
    expect(AST_INVENTORY.length).toBeGreaterThan(20);
    expect(AST_INVENTORY.length).toBeLessThanOrEqual(64);
    expect(new Set(AST_INVENTORY).size).toBe(AST_INVENTORY.length);
    for (let i = 0; i < AST_INVENTORY.length; i++) {
      expect(AST_INDEX.get(AST_INVENTORY[i])).toBe(i);
    }
  });

  it('resolves only kinds that are in the closed inventory', () => {
    const facts = resolveAstKinds(read('listener-lifecycle/verified.jsx'));
    expect(facts).not.toBeNull();
    expect(facts.kinds.length).toBeGreaterThan(0);
    for (const kind of facts.kinds) {
      expect(AST_INDEX.has(kind), `${kind} is not in the inventory`).toBe(true);
    }
  });
});

// ── Structure over spelling — the knight/night property, for code ────────────

describe('structure over spelling', () => {
  it('gives two structurally identical functions the same vector despite renamed identifiers', () => {
    const a = generateAstTopographicVector({
      path: 'a.js',
      content: 'function alpha(x) { try { beta(x); } catch (e) { console.error(e); } }'
    });
    const b = generateAstTopographicVector({
      path: 'b.js',
      content: 'function gamma(y) { try { delta(y); } catch (q) { console.error(q); } }'
    });
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    expect(dot / AST_BAND_COUNT).toBeGreaterThan(0.9);
  });

  it('separates a leaked listener from its cleaned-up hard negative', () => {
    // This is the discrimination the 2026-07-13 baseline measured the raw
    // cosine lens FAILING: the hard negative outranked the verified fixture in
    // four of five families because it shared more vocabulary.
    const verified = generateAstTopographicVector(read('listener-lifecycle/verified.jsx'));
    const negative = generateAstTopographicVector(read('listener-lifecycle/hard-negative.jsx'));
    let dot = 0;
    for (let i = 0; i < verified.length; i++) dot += verified[i] * negative[i];
    expect(dot / AST_BAND_COUNT).toBeLessThan(0.95);
  });

  it('scores a same-family pair above a cross-family pair', () => {
    const sameFamily = astTopographicSimilarity(
      read('listener-lifecycle/verified.jsx'),
      read('listener-lifecycle/hard-negative.jsx')
    );
    const crossFamily = astTopographicSimilarity(
      read('listener-lifecycle/verified.jsx'),
      read('unseeded-randomness/verified.js')
    );
    expect(sameFamily).toBeGreaterThan(crossFamily);
  });
});

// ── The band law this whole session established ─────────────────────────────

describe('band laws hold', () => {
  it('normalizes each populated band to unit norm independently', () => {
    const v = generateAstTopographicVector(read('swallowed-error/verified.js'));
    for (const band of BANDS) {
      const norm = bandNorm(v, band);
      expect(norm === 0 || Math.abs(norm - 1) < 1e-5, `${band.name} norm was ${norm}`).toBe(true);
    }
  });

  it('gives no band more than half the vector energy', () => {
    const v = generateAstTopographicVector(read('swallowed-error/verified.js'));
    const norms = BANDS.map(b => bandNorm(v, b));
    const total = norms.reduce((s, n) => s + n * n, 0);
    for (let i = 0; i < BANDS.length; i++) {
      expect(norms[i] * norms[i] / total, `${BANDS[i].name} dominates`).toBeLessThanOrEqual(0.5);
    }
  });

  it('does not read ~1.0 in band 2 for structurally different files', () => {
    // Band 2 is topology, and topology is where both sibling engines encoded
    // scalars into fixed dims and saturated. Buckets, not magnitudes.
    const small = generateAstTopographicVector({ path: 's.js', content: 'const a = 1;' });
    const large = generateAstTopographicVector(read('listener-lifecycle/verified.jsx'));
    let dot = 0, n1 = 0, n2 = 0;
    for (let i = 128; i < 192; i++) {
      dot += small[i] * large[i]; n1 += small[i] * small[i]; n2 += large[i] * large[i];
    }
    const cos = (n1 === 0 || n2 === 0) ? 0 : dot / (Math.sqrt(n1) * Math.sqrt(n2));
    expect(cos).toBeLessThan(0.9);
  });
});

describe('determinism', () => {
  it('produces an identical vector for identical input', () => {
    const src = read('concurrent-mutation/verified.js');
    expect(Array.from(generateAstTopographicVector(src)))
      .toEqual(Array.from(generateAstTopographicVector(src)));
  });
});

// ── The one place the inventory is not purely parser-derived ────────────────

describe('callee kinds are fenced', () => {
  it('keeps every pre-existing kind at its original dimension', () => {
    // The header contract is "dim N means the same thing forever". Callee kinds
    // are APPENDED, never inserted, so vectors built before them stay readable.
    expect(AST_INDEX.get('fact:function')).toBe(0);
    expect(AST_INDEX.get('fact:call')).toBe(1);
    expect(AST_INDEX.get('shape:callBare')).toBe(39);
  });

  it('admits only callees on the frozen nondeterminism list', () => {
    const known = resolveAstKinds({ path: 'a.js', content: 'const r = Math.random();' });
    expect(known.kinds).toContain('callee:Math.random');
  });

  it('drops an unknown callee instead of minting a kind for it', () => {
    // THE FENCE. Hashing arbitrary callee names into the inventory would
    // reintroduce exactly the open vocabulary this engine exists to avoid --
    // semantotopography's step-4 fallback, rebuilt one layer up.
    const unknown = resolveAstKinds({ path: 'b.js', content: 'const r = myOwnRandomThing();' });
    expect(unknown.kinds.some(k => k.startsWith('callee:'))).toBe(false);
  });

  it('states a membership criterion every entry satisfies', () => {
    // A closed list without a criterion grows by ad-hoc addition until it is
    // open again. Every entry must be a callee that introduces nondeterminism
    // into an otherwise pure path.
    for (const callee of NONDETERMINISM_CALLEES) {
      expect(AST_INDEX.has(`callee:${callee}`), `${callee} has no inventory slot`).toBe(true);
    }
    expect(AST_INVENTORY.filter(k => k.startsWith('callee:')).length)
      .toBe(NONDETERMINISM_CALLEES.length);
  });

  it('refuses an inventory that would overflow band 0', () => {
    expect(() => assertInventoryFenced([...Array(65)].map((_, i) => `k${i}`)))
      .toThrow(/band 0|64/i);
  });

  it('refuses an inventory with duplicate kinds', () => {
    expect(() => assertInventoryFenced(['a', 'b', 'a'])).toThrow(/duplicate/i);
  });
});
