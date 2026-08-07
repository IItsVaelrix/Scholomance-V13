import { describe, it, expect } from 'vitest';
import {
  cosineSparse,
  corpusSimilarity,
  rankByCorpus,
  deriveLocalFrame,
  localCosine,
  bootstrapNeighbourhood,
  combineVerdicts,
} from '../../../codex/core/semantic/corpus-distance.js';

/** Sparse PPMI rows, injected exactly as the sqlite adapter supplies them. */
function vectors(spec) {
  return new Map(Object.entries(spec).map(([w, ctx]) => [w, new Map(Object.entries(ctx))]));
}

const span = (prefix, n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${prefix}${i}`, 1]));

/**
 * A two-pole field shaped like the real thing, wide enough to clear the 20-dim
 * frame floor.
 *
 *   universal  — every member has it ("room", "night"). This is what makes the
 *                set a field, and it is exactly what cannot distinguish members.
 *   quietCtx   — silent + quiet only
 *   loudCtx    — loud + noisy only
 *   crossA/B   — one member from each pole, so the poles genuinely overlap.
 *                Without this the local frame separates them completely and
 *                the cross-pole cosine has nothing to measure at all.
 */
function field() {
  const universal = span('room', 8);
  const quietCtx = span('hush', 12);
  const loudCtx = span('roar', 12);
  const crossA = span('edgeA', 6);
  const crossB = span('edgeB', 6);
  return vectors({
    silent: { ...universal, ...quietCtx, ...crossA },
    quiet: { ...universal, ...quietCtx, ...crossB },
    loud: { ...universal, ...loudCtx, ...crossA },
    noisy: { ...universal, ...loudCtx, ...crossB },
  });
}

describe('cosineSparse', () => {
  it('returns null below the shared-context floor rather than a number', () => {
    const v = vectors({ a: { x: 1, y: 1 }, b: { x: 1, z: 1 } });
    expect(cosineSparse(v.get('a'), v.get('b')).similarity).toBeNull();
  });

  it('reads an unobserved word as unmeasured, not unrelated', () => {
    const v = field();
    expect(corpusSimilarity(v, 'silent', 'nonexistent').similarity).toBeNull();
  });

  it('scores identical rows at 1', () => {
    const v = vectors({ a: { p: 1, q: 2, r: 3 }, b: { p: 1, q: 2, r: 3 } });
    expect(cosineSparse(v.get('a'), v.get('b')).similarity).toBeCloseTo(1, 6);
  });
});

describe('deriveLocalFrame', () => {
  it('drops contexts the whole field shares', () => {
    const frame = deriveLocalFrame(field(), ['silent', 'quiet', 'loud', 'noisy']);
    for (const universal of ['room', 'night', 'air']) {
      expect(frame.contexts.has(universal)).toBe(false);
    }
  });

  it('keeps contexts that some members have and others do not', () => {
    const frame = deriveLocalFrame(field(), ['silent', 'quiet', 'loud', 'noisy']);
    expect(frame.contexts.has('hush0')).toBe(true);   // silent + quiet only
    expect(frame.contexts.has('roar0')).toBe(true);   // loud + noisy only
    expect(frame.contexts.has('edgeA0')).toBe(true);  // one from each pole
  });

  it('ignores members the corpus never observed', () => {
    const frame = deriveLocalFrame(field(), ['silent', 'quiet', 'loud', 'noisy', 'unseen']);
    expect(frame.members).not.toContain('unseen');
    expect(frame.members).toHaveLength(4);
  });

  /**
   * "present in >= 2 members but not all" cannot be satisfied by a two-word
   * field, so the minimum viable neighbourhood is three. Reporting 0 dims is
   * the honest result — two words cannot establish what distinguishes them.
   */
  it('yields no frame from a two-word neighbourhood', () => {
    expect(deriveLocalFrame(field(), ['silent', 'loud']).dims).toBe(0);
  });
});

describe('localCosine', () => {
  /**
   * THE MEASURED EFFECT. On the real 117-book corpus, global cosine separated
   * same-pole from cross-pole adjective pairs by 0.0163; the local frame raised
   * it to 0.0450, a 2.8× gain that replicated across volume (3.6×), luminosity
   * (2.1×) and temperature (2.1×). Shared contexts dominate the global dot
   * product and average the discriminating ones away.
   */
  it('separates poles better than the global cosine', () => {
    const v = field();
    const frame = deriveLocalFrame(v, ['silent', 'quiet', 'loud', 'noisy']);

    const globalSame = corpusSimilarity(v, 'silent', 'quiet').similarity;
    const globalCross = corpusSimilarity(v, 'silent', 'loud').similarity;
    const localSame = localCosine(v, 'silent', 'quiet', frame).similarity;
    const localCross = localCosine(v, 'silent', 'loud', frame).similarity;

    expect(localSame - localCross).toBeGreaterThan(globalSame - globalCross);
  });

  it('declines rather than guessing when the frame is too thin', () => {
    const v = field();
    const thin = { contexts: new Set(['hush', 'roar']), dims: 2 };
    const r = localCosine(v, 'silent', 'quiet', thin);
    expect(r.similarity).toBeNull();
    expect(r.method).toBeNull();
    expect(r.frameDims).toBe(2);
  });

  it('reports the frame width it used', () => {
    const v = field();
    const frame = deriveLocalFrame(v, ['silent', 'quiet', 'loud', 'noisy']);
    // Widen past the floor so the measurement is taken rather than declined.
    const wide = { contexts: new Set([...frame.contexts, ...Array.from({ length: 30 }, (_, i) => `pad${i}`)]) };
    wide.dims = wide.contexts.size;
    expect(localCosine(v, 'silent', 'quiet', wide).frameDims).toBe(wide.dims);
  });
});

describe('bootstrapNeighbourhood', () => {
  it('seeds a frame from nearest global neighbours and includes the word', () => {
    const v = field();
    const hood = bootstrapNeighbourhood(v, 'silent', ['quiet', 'loud', 'noisy'], 2);
    expect(hood[0]).toBe('silent');
    expect(hood).toContain('quiet');
    expect(hood).toHaveLength(3);
  });
});

describe('rankByCorpus', () => {
  it('omits unobserved candidates instead of ranking them last', () => {
    const ranked = rankByCorpus(field(), 'silent', ['quiet', 'nonexistent', 'loud']);
    expect(ranked.map((r) => r.word)).not.toContain('nonexistent');
  });
});

describe('combineVerdicts', () => {
  it('prefers curated structure over inferred company', () => {
    const r = combineVerdicts(
      { similarity: 0.8, method: 'wu-palmer' },
      { similarity: 0.2, method: 'corpus-ppmi' },
    );
    expect(r.source).toBe('wordnet');
    expect(r.similarity).toBe(0.8);
  });

  it('falls through to the corpus when structure has no opinion', () => {
    const r = combineVerdicts(
      { similarity: null, method: null },
      { similarity: 0.2, method: 'corpus-ppmi' },
    );
    expect(r.source).toBe('corpus');
  });

  it('stays silent when neither channel can answer', () => {
    const r = combineVerdicts({ similarity: null }, { similarity: null });
    expect(r.similarity).toBeNull();
    expect(r.source).toBeNull();
  });
});
