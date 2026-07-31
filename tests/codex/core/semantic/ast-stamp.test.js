import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildDocumentFrequency,
  rareKindsFor,
  stampFor,
  buildStampIndex,
  lookupByStamp,
  retrieveStampNominations,
  STAMP_SOURCE
} from '../../../../codex/core/semantic/ast-stamp.js';
import { NOMINATION_SOURCES } from '../../../../codex/core/immunity/cleri-probe/retrieval.js';

const FIXTURE = 'tests/qa/fixtures/cleri-probe';
const read = (p) => ({ path: `${FIXTURE}/${p}`, content: readFileSync(`${FIXTURE}/${p}`, 'utf8') });

const CORPUS = [
  read('listener-lifecycle/verified.jsx'),
  read('listener-lifecycle/hard-negative.jsx'),
  read('swallowed-error/verified.js'),
  read('swallowed-error/hard-negative.js'),
  read('unseeded-randomness/verified.js'),
  read('unseeded-randomness/hard-negative.js'),
  read('concurrent-mutation/verified.js'),
  read('concurrent-mutation/hard-negative.js'),
  read('external-response/verified.js'),
  read('external-response/hard-negative.js')
];

// ── Rarity is a property of a corpus, never of a kind ────────────────────────

describe('document frequency', () => {
  it('counts files containing a kind, not occurrences of it', () => {
    const manifest = buildDocumentFrequency([
      { path: 'a.js', content: 'f(); f(); f();' },
      { path: 'b.js', content: 'const x = 1;' }
    ]);
    expect(manifest.totalFiles).toBe(2);
    expect(manifest.df['fact:call']).toBe(1);
  });

  it('skips sources the parser refuses without counting them', () => {
    const manifest = buildDocumentFrequency([
      { path: 'ok.js', content: 'const x = 1;' },
      { path: 'bad.js', content: 'const = = ;;;' }
    ]);
    expect(manifest.totalFiles).toBe(1);
    expect(manifest.refused).toEqual(['bad.js']);
  });

  it('makes rarity relative to the corpus that produced it', () => {
    // The SAME kind is rare in one corpus and common in another. A threshold
    // frozen into the code would be the STABLE_MIN error: an absolute cut
    // applied across distributions.
    const rareCorpus = buildDocumentFrequency([
      { path: 'a.js', content: 'try { f(); } catch (e) {}' },
      { path: 'b.js', content: 'const x = 1;' },
      { path: 'c.js', content: 'const y = 2;' },
      { path: 'd.js', content: 'const z = 3;' }
    ]);
    const commonCorpus = buildDocumentFrequency([
      { path: 'a.js', content: 'try { f(); } catch (e) {}' },
      { path: 'b.js', content: 'try { g(); } catch (e) {}' }
    ]);
    expect(rareKindsFor(rareCorpus, 0.5).has('fact:catch')).toBe(true);
    expect(rareKindsFor(commonCorpus, 0.5).has('fact:catch')).toBe(false);
  });
});

// ── A stamp declares its own absence ────────────────────────────────────────

describe('stamping', () => {
  const manifest = buildDocumentFrequency(CORPUS);

  it('returns null for source the parser cannot read', () => {
    expect(stampFor({ path: 'bad.js', content: 'const = = ;;;' }, manifest, 0.5)).toBeNull();
  });

  it('returns a null stamp — not an empty guess — when a file carries no rare kind', () => {
    // Most files have no stamp. Saying so is the point: a stamp index covers
    // the identifiable tail and must not pretend to cover the rest.
    const plain = stampFor({ path: 'plain.js', content: 'const x = 1;' }, manifest, 0.3);
    expect(plain).not.toBeNull();
    expect(plain.stamp).toBeNull();
    expect(plain.rareKinds).toEqual([]);
  });

  it('produces a stamp from the rare kinds a file carries', () => {
    const stamped = stampFor(read('listener-lifecycle/verified.jsx'), manifest, 0.3);
    expect(stamped.stamp).toBeTypeOf('string');
    expect(stamped.rareKinds.length).toBeGreaterThan(0);
  });

  it('is order-independent and deterministic', () => {
    const a = stampFor(read('swallowed-error/verified.js'), manifest, 0.3);
    const b = stampFor(read('swallowed-error/verified.js'), manifest, 0.3);
    expect(a.stamp).toBe(b.stamp);
    expect(a.rareKinds).toEqual([...a.rareKinds].sort());
  });

  it('carries the content hash so an unchanged file is never re-stamped', () => {
    const stamped = stampFor(read('swallowed-error/verified.js'), manifest, 0.3);
    expect(stamped.contentHash).toMatch(/^[a-f0-9]{16,}$/);
  });

  it('binds the stamp to the corpus that defined its rarity', () => {
    const stamped = stampFor(read('listener-lifecycle/verified.jsx'), manifest, 0.3);
    expect(stamped.corpusId).toBe(manifest.corpusId);
  });
});

// ── The index narrows; it does not identify ─────────────────────────────────

describe('stamp index', () => {
  const manifest = buildDocumentFrequency(CORPUS);
  const index = buildStampIndex(CORPUS, manifest, 0.3);

  it('narrows the corpus to a bucket smaller than the whole', () => {
    const stamped = stampFor(read('swallowed-error/verified.js'), manifest, 0.3);
    const hits = lookupByStamp(index, stamped.stamp);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThan(CORPUS.length);
  });

  it('returns an empty bucket for an unknown stamp rather than guessing', () => {
    expect(lookupByStamp(index, 'stamp:nothing-like-this')).toEqual([]);
  });

  it('refuses a stamp minted against a different corpus', () => {
    // Largest bucket in the real measurement was 35 files: a stamp says "one of
    // these", never "this one". Interpreting it against foreign document
    // frequencies would make even that claim meaningless.
    const otherManifest = buildDocumentFrequency([{ path: 'x.js', content: 'try { f(); } catch (e) {}' }]);
    expect(() => buildStampIndex(CORPUS, otherManifest, 0.3, { expectCorpusId: manifest.corpusId }))
      .toThrow(/corpus/i);
  });
});

// ── The nominator, and the wiring gap it must not hide ──────────────────────

describe('stamp nominations', () => {
  const manifest = buildDocumentFrequency(CORPUS);
  const index = buildStampIndex(CORPUS, manifest, 0.3);

  it('emits nominations in the cleri shape', () => {
    const noms = retrieveStampNominations(
      CORPUS,
      { hypothesis: 'listener leak', pathologyClass: 'LEAKED_LISTENER_SUBSCRIPTION' },
      { manifest, index, threshold: 0.3 }
    );
    expect(noms.length).toBeGreaterThan(0);
    for (const n of noms) {
      expect(n).toHaveProperty('path');
      expect(n).toHaveProperty('span');
      expect(n.source).toBe(STAMP_SOURCE);
      expect(n.score).toBeGreaterThanOrEqual(0);
      expect(n.score).toBeLessThanOrEqual(1);
    }
  });

  it('nominates only files whose rare kinds match the pathology', () => {
    const noms = retrieveStampNominations(
      CORPUS,
      { hypothesis: 'swallowed error', pathologyClass: 'SWALLOWED_ERROR' },
      { manifest, index, threshold: 0.3 }
    );
    expect(noms.every(n => n.path.includes('swallowed-error'))).toBe(true);
  });

  it('loses a pathology when calibrated on a balanced evaluation corpus', () => {
    // MEASURED, and the most surprising result of building this. The frozen
    // corpus is balanced two-files-per-family on purpose, so `fact:externalRequest`
    // sits at 4/10 files (40%) and is NOT rare in it — while in the real repo it
    // is 4/300 (1.3%). Calibrating rarity on the evaluation set destroys the
    // signal the stamp exists to carry.
    //
    // The rule this encodes: build the manifest from the DEPLOYMENT corpus, then
    // stamp the evaluation set against it. Never the other way round.
    const balanced = buildDocumentFrequency(CORPUS);
    expect(rareKindsFor(balanced, 0.3).has('fact:externalRequest')).toBe(false);

    const deploymentShaped = buildDocumentFrequency([
      ...CORPUS,
      ...Array.from({ length: 40 }, (_, i) => ({ path: `plain-${i}.js`, content: `const x${i} = ${i};` }))
    ]);
    expect(rareKindsFor(deploymentShaped, 0.3).has('fact:externalRequest')).toBe(true);
  });

  it('declares UNSEEDED_RANDOMNESS as uncovered rather than silently missing it', () => {
    // Math.random is a call CALLEE, and the inventory has no callee-level kinds,
    // so this family has no rare-kind evidence at all. Returning [] is the
    // honest answer; a stamp channel that quietly covers four of five families
    // and reports nothing about the fifth is the absence that looks like a pass.
    const noms = retrieveStampNominations(
      CORPUS,
      { pathologyClass: 'UNSEEDED_RANDOMNESS' },
      { manifest, index, threshold: 0.3 }
    );
    expect(noms).toEqual([]);
  });

  it('is documented as unusable by mergeCandidates until STAMP is registered', () => {
    // retrieval.js:377 drops any nomination whose source is not in the frozen
    // NOMINATION_SOURCES list — silently, with no error. Wiring this into
    // production cleri is a one-line change to that frozen array and is not
    // made here. This test exists so the gap cannot be forgotten.
    expect(NOMINATION_SOURCES).not.toContain(STAMP_SOURCE);
  });
});
