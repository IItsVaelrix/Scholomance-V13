/** @vitest-environment jsdom */
/**
 * The composed answer plate. The packet contract is tested separately
 * (compose-constellation-result-packet.test.ts); here we assert the shell
 * honours it: anatomy parts are tagged, honest refusals surface as data-state,
 * the phoneme arc ignites stressed vowels, and a broken contract degrades to
 * the plain deterministic shell instead of taking the answer down (PDR §7.8).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import ConstellationResultShell from '../../../src/pages/Constellation/ConstellationResultShell.jsx';

afterEach(cleanup);

const basePacket = {
  query: { raw: 'the bright wound of morning', normalized: 'the bright wound of morning', kind: 'phrase', tokenCount: 5, graphemeCount: 27, intent: 'literary' },
  leximancy: {
    status: 'ambiguous',
    selectedInterpretationId: null,
    interpretations: [
      { id: 'wound.injury', gloss: 'injury / opening in flesh', confidence: 0.52, pos: 'noun', examples: ['she bound the wound'] },
      { id: 'wound.past', gloss: 'past tense of wind', confidence: 0.41, pos: 'verb', examples: [] },
    ],
    warnings: [], nearKin: ['gash', 'lesion'], counterfield: ['heal'],
    etymology: 'Old English wund "hurt, injury".',
    rarity: { band: 5, max: 9, label: 'uncommon' },
    relations: { broader: ['injury'], narrower: ['gash'], akin: ['hurt'] },
  },
  rhymeAstrology: {
    phonemes: ['DH', 'AH0', 'B', 'R', 'AY1', 'T', 'W', 'UW1', 'N', 'D'],
    stress: 'x / x / x',
    cadenceFamily: 'iambic-adjacent',
    exactRhymes: ['mooring', 'warning'],
    slantRhymes: ['mourning'],
    ipa: '/ˈmɔːnɪŋ/',
  },
  phraseGenome: { syllables: 7, devicesHint: ['metaphor-candidate'], schoolHint: 'PSYCHIC' },
  // Present but unwarranted: the verdict plate renders (all six plates show)
  // while every honest-refusal state stays false.
  semanticInquiry: {
    status: 'ok', bound: true, probeId: 'constellation.sense.disambiguation',
    hypotheses: { supported: [], eliminated: [], surviving: [], underdetermined: [] },
    selection: { warranted: false, reason: 'margin', senseId: null, gloss: null, overlap: null },
    evidence: { candidateCount: 2, edgeCount: 0 },
    isHeteronym: false, distinctPronunciations: 1, headToken: 'wound',
    framePos: null, frameCue: null, viableWordCount: 2, lexicalEntries: [],
  },
  pageBytecode: 'COS-PAGE-v1-BRIGHT-WOUND-001',
  provenance: { engineVersions: { constellationOS: 'phase2-phrase-1', leximancy: 'fixture-1' } },
  diagnostics: { degradedChannels: [], warnings: [] },
};

function root(container: HTMLElement) {
  return container.querySelector('#constellation-result-shell') as HTMLElement;
}

describe('composed answer plate', () => {
  it('stamps the sealed scene contract on the root', () => {
    const { container } = render(<ConstellationResultShell packet={basePacket} />);
    const el = root(container);
    expect(el.getAttribute('data-compose-kind')).toBe('constellation-result');
    expect(el.getAttribute('data-compose-version')).toBe('1.1.0');
    // The checksum is the golden value pinned in the packet test.
    expect(el.getAttribute('data-compose-scene')).toBe('scd64:c34223becabac5a7');
    expect(el.getAttribute('role')).toBe('article');
  });

  it('tags all six anatomy plates in declared order', () => {
    const { container } = render(<ConstellationResultShell packet={basePacket} />);
    const parts = Array.from(container.querySelectorAll('[data-compose-part]')).map((n) =>
      n.getAttribute('data-compose-part'),
    );
    expect(parts).toEqual([
      'hero-figure',
      'masthead',
      'meaning-field',
      'sound-field',
      'genome-field',
      'verdict-field',
      'provenance-seal',
    ]);
  });

  it('renders the hero figure first, temperature-colored, with exactly one gold lodestar', () => {
    const { container } = render(<ConstellationResultShell packet={basePacket} />);
    const parts = Array.from(container.querySelectorAll('[data-compose-part]')).map((n) =>
      n.getAttribute('data-compose-part'),
    );
    expect(parts[0]).toBe('hero-figure'); // top of the plate
    const hero = container.querySelector('.constellation-result-hero');
    expect(hero).toBeTruthy();
    // 10 phonemes → 10 star nodes; exactly one is the lodestar.
    expect(hero!.querySelectorAll('.constellation-result-hero__lodestar')).toHaveLength(1);
    const stars = hero!.querySelectorAll('.constellation-result-hero__star, .constellation-result-hero__spark');
    expect(stars.length).toBe(10);
    // Gold is reserved for the lodestar: it must carry no inline temperature
    // fill (only the CSS gold applies), while at least one other star does.
    const lodestar = hero!.querySelector('.constellation-result-hero__lodestar') as HTMLElement;
    expect(lodestar.style.fill).toBe('');
    const nonLodestarWithFill = Array.from(stars).some(
      (el) => !el.classList.contains('constellation-result-hero__lodestar') && (el as HTMLElement).style.fill !== '',
    );
    expect(nonLodestarWithFill).toBe(true);
  });

  it('anchors each section overline with a star, not a numbered pill', () => {
    // The de-carded body drops the roman-numeral counter; the ✦ anchor is CSS
    // ::before content, so we assert the class contract the CSS binds to exists
    // on every plate heading.
    const { container } = render(<ConstellationResultShell packet={basePacket} />);
    const overlines = container.querySelectorAll('.constellation-result-plate__overline');
    expect(overlines.length).toBeGreaterThanOrEqual(6);
  });

  it('sets no twinkle animation on hero stars under reduced motion', () => {
    const { container } = render(<ConstellationResultShell packet={basePacket} reducedMotion={true} />);
    const stars = Array.from(
      container.querySelectorAll('.constellation-result-hero [style]'),
    ) as HTMLElement[];
    expect(stars.every((s) => s.style.animationDuration === '')).toBe(true);
  });

  it('surfaces honest refusals as data-state, not prose', () => {
    // Clean full packet: nothing degraded, no heteronym, no evidenced pick.
    const { container } = render(<ConstellationResultShell packet={basePacket} />);
    const el = root(container);
    expect(el.getAttribute('data-state-degraded')).toBe('false');
    expect(el.getAttribute('data-state-heteronym')).toBe('false');
    expect(el.getAttribute('data-state-evidenced')).toBe('false');
  });

  it('marks the plate degraded when a channel could not answer', () => {
    const degraded = {
      ...basePacket,
      diagnostics: { degradedChannels: ['rhymeAstrology'], warnings: [] },
    };
    const { container } = render(<ConstellationResultShell packet={degraded} />);
    expect(root(container).getAttribute('data-state-degraded')).toBe('true');
  });

  it('draws the phoneme arc with a gold spark on each stressed vowel', () => {
    const { container } = render(<ConstellationResultShell packet={basePacket} />);
    const arc = container.querySelector('.constellation-result-arc');
    expect(arc).toBeTruthy();
    // 10 phonemes → 10 nodes; AY1 and UW1 are stressed → 2 sparks, 8 dots.
    expect(arc!.querySelectorAll('.constellation-result-arc__node')).toHaveLength(8);
    expect(arc!.querySelectorAll('.constellation-result-arc__spark')).toHaveLength(2);
    // Consecutive phonemes are edged so the arc reads as one figure.
    expect(arc!.querySelectorAll('.constellation-result-arc__edge')).toHaveLength(9);
  });

  it('gives the masthead the query as asked, in the display voice', () => {
    const { container } = render(<ConstellationResultShell packet={basePacket} />);
    const masthead = container.querySelector('.constellation-result-masthead-query');
    expect(masthead?.textContent).toBe('the bright wound of morning');
  });

  it('cascades plates on a bytecode-seeded schedule when motion is allowed', () => {
    const { container } = render(<ConstellationResultShell packet={basePacket} reducedMotion={false} />);
    const plates = Array.from(container.querySelectorAll('.constellation-result-plate')) as HTMLElement[];
    const delays = plates.map((p) => p.style.animationDelay);
    // Every plate carries a delay, and the cascade is strictly increasing.
    expect(delays.every((d) => d.endsWith('s'))).toBe(true);
    const nums = delays.map((d) => parseFloat(d));
    for (let i = 1; i < nums.length; i += 1) expect(nums[i]).toBeGreaterThan(nums[i - 1]);
  });

  it('sets no reveal delays under reduced motion', () => {
    const { container } = render(<ConstellationResultShell packet={basePacket} reducedMotion={true} />);
    const plates = Array.from(container.querySelectorAll('.constellation-result-plate')) as HTMLElement[];
    expect(plates.every((p) => p.style.animationDelay === '')).toBe(true);
  });

  it('keeps the same answer under the same bytecode (reveal is deterministic)', () => {
    const a = render(<ConstellationResultShell packet={basePacket} reducedMotion={false} />);
    const delaysA = Array.from(a.container.querySelectorAll('.constellation-result-plate')).map(
      (p) => (p as HTMLElement).style.animationDelay,
    );
    a.unmount();
    const b = render(<ConstellationResultShell packet={basePacket} reducedMotion={false} />);
    const delaysB = Array.from(b.container.querySelectorAll('.constellation-result-plate')).map(
      (p) => (p as HTMLElement).style.animationDelay,
    );
    expect(delaysA).toEqual(delaysB);
  });
});

describe('compose validation fallback (PDR §7.8)', () => {
  beforeEach(async () => {
    // Clear the module cache so the dynamic import below re-links the shell
    // against the mocked validator instead of the one loaded at file top.
    vi.resetModules();
    vi.doMock('../../../src/core/compose/packets.ts', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../../src/core/compose/packets.ts')>();
      return {
        ...actual,
        validateComposeScene: vi.fn(() => ({ ok: false, diagnostics: [] })),
      };
    });
  });

  afterEach(() => {
    vi.doUnmock('../../../src/core/compose/packets.ts');
    vi.resetModules();
    cleanup();
  });

  it('degrades to the plain deterministic shell when the contract fails', async () => {
    const { default: FallbackShell } = await import(
      '../../../src/pages/Constellation/ConstellationResultShell.jsx'
    );
    const { container } = render(<FallbackShell packet={basePacket} />);
    const el = root(container);
    // No compose markers…
    expect(el.getAttribute('data-compose-kind')).toBeNull();
    expect(container.querySelector('.constellation-result-shell--composed')).toBeNull();
    // …but the answer is fully intact in the plain sections.
    expect(container.querySelectorAll('.constellation-result-section')).toHaveLength(4);
    expect(el.textContent).toContain('injury / opening in flesh');
    expect(el.textContent).toContain('past tense of wind');
  });
});

describe('hero figure failure stays local (PDR §7.8)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('../../../src/pages/Constellation/skyChart.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../../src/pages/Constellation/skyChart.js')>();
      return { ...actual, heroFigure: vi.fn(() => { throw new Error('boom'); }) };
    });
  });

  afterEach(() => {
    vi.doUnmock('../../../src/pages/Constellation/skyChart.js');
    vi.resetModules();
    cleanup();
  });

  it('renders the rest of the answer when the hero figure throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {}); // error boundaries log; keep output pristine
    const { default: Shell } = await import('../../../src/pages/Constellation/ConstellationResultShell.jsx');
    const { container } = render(<Shell packet={basePacket} />);
    // The hero svg is gone…
    expect(container.querySelector('.constellation-result-hero')).toBeNull();
    // …but the composed answer is intact: masthead query + other plates still render.
    expect(container.querySelector('.constellation-result-masthead-query')?.textContent).toBe('the bright wound of morning');
    expect(container.querySelector('[data-compose-part="meaning-field"]')).toBeTruthy();
    spy.mockRestore();
  });
});
