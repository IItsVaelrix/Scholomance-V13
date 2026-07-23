/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { raritySpectral } from '../../../src/pages/Constellation/skyChart.js';
import { heroFigure } from '../../../src/pages/Constellation/skyChart.js';

describe('raritySpectral — OBAFGKM ramp keyed to the backend rarity band', () => {
  it('maps a rare (high-band) word to a hot blue class and a common one to cool red', () => {
    const rare = raritySpectral({ band: 9, max: 9, label: 'rare' });
    const common = raritySpectral({ band: 1, max: 9, label: 'common' });
    expect(rare.spectralClass).toBe('O');
    expect(common.spectralClass).toBe('M');
    // Rarer burns brighter (photonic selection).
    expect(rare.brightness).toBeGreaterThan(common.brightness);
  });

  it('normalizes strictly from band/max and clamps to [0,1]', () => {
    expect(raritySpectral({ band: 5, max: 9 }).normalized).toBeCloseTo(5 / 9, 5);
    expect(raritySpectral({ band: 20, max: 9 }).normalized).toBe(1);
    expect(raritySpectral({ band: -3, max: 9 }).normalized).toBe(0);
  });

  it('returns the neutral unknown class (amethyst) when rarity is absent — never a recomputed value', () => {
    const none = raritySpectral(null);
    expect(none.spectralClass).toBe('unknown');
    expect(none.color).toBe('#8b7cff'); // --cos-amethyst
  });

  it('does not derive rarity from anything but the band (backend-truth)', () => {
    // Same band, wildly different max normalization — color follows normalized band only.
    const a = raritySpectral({ band: 8, max: 9 });
    const b = raritySpectral({ band: 8, max: 9, label: 'IGNORED' });
    expect(a.color).toBe(b.color);
    expect(a.spectralClass).toBe(b.spectralClass);
  });
});

const basePacket = {
  pageBytecode: 'COS-PAGE-v1-BRIGHT-WOUND-001',
  query: { raw: 'wound', normalized: 'wound', kind: 'word', tokenCount: 1, graphemeCount: 5 },
  leximancy: { rarity: { band: 9, max: 9, label: 'rare' } },
  rhymeAstrology: {
    phonemes: ['W', 'UW1', 'N', 'D'],
    cadenceFamily: 'iambic-adjacent',
    dominantVowelFamily: 'back',
  },
  phraseGenome: { syllables: 1, devicesHint: [], schoolHint: 'PSYCHIC' },
};

describe('heroFigure — the generation law (reaction)', () => {
  it('makes one node per phoneme and ignites the stressed vowel as the brightest', () => {
    const fig = heroFigure(basePacket);
    expect(fig.nodes).toHaveLength(4);
    const stressed = fig.nodes.filter((n) => n.stressed);
    expect(stressed).toHaveLength(1); // UW1
    // Stressed vowel is the brightest magnitude atom.
    const max = Math.max(...fig.nodes.map((n) => n.magnitude));
    expect(stressed[0].magnitude).toBe(max);
  });

  it('groups phonemes into `syllables` rosettes chained on a spine', () => {
    const twoSyl = { ...basePacket, phraseGenome: { ...basePacket.phraseGenome, syllables: 2 } };
    const fig = heroFigure(twoSyl);
    expect(fig.rosettes).toHaveLength(2);
    // Rosette centers advance along the spine (strictly increasing x).
    expect(fig.rosettes[1].center.x).toBeGreaterThan(fig.rosettes[0].center.x);
    // Every node belongs to exactly one rosette.
    const claimed = fig.rosettes.flatMap((r) => r.nodeIndices).sort((a, b) => a - b);
    expect(claimed).toEqual(fig.nodes.map((_, i) => i));
  });

  it('colors every star by the rarity temperature — not gold', () => {
    const fig = heroFigure(basePacket);
    expect(fig.spectralClass).toBe('O'); // band 9/9
    for (const n of fig.nodes) expect(n.color).toBe('#9db4ff');
  });

  it('is byte-identical geometry for the same packet (Law 6)', () => {
    expect(heroFigure(basePacket)).toEqual(heroFigure(basePacket));
  });

  it('the seed moves ONLY the lodestar, never a coordinate (anti-jitter law)', () => {
    const a = heroFigure(basePacket);
    const b = heroFigure({ ...basePacket, pageBytecode: 'A-COMPLETELY-DIFFERENT-SEED' });
    // Coordinates are identical regardless of seed…
    expect(a.nodes.map((n) => [n.x, n.y])).toEqual(b.nodes.map((n) => [n.x, n.y]));
    // …exactly one node is the lodestar in each…
    expect(a.nodes.filter((n) => n.isLodestar)).toHaveLength(1);
    expect(b.nodes.filter((n) => n.isLodestar)).toHaveLength(1);
  });

  it('regenerates a figure from graphemes when the rhyme channel is degraded', () => {
    const degraded = { ...basePacket, rhymeAstrology: null };
    const fig = heroFigure(degraded);
    expect(fig.degraded).toBe(true);
    expect(fig.nodes.length).toBe(degraded.query.graphemeCount); // 5 generic atoms
    // Rarity truth is still read from leximancy, never recomputed.
    expect(fig.spectralClass).toBe('O');
  });

  it('reads stress from the packet digit and never re-derives it (backend-truth)', () => {
    // Frontend-derivable heuristics (e.g. "first vowel is stressed") would ignite N.
    // The packet says UW1 is the only stress; the figure must agree with the packet.
    const fig = heroFigure(basePacket);
    const igniteable = fig.nodes.filter((n) => n.stressed).map((n) => n.phoneme);
    expect(igniteable).toEqual(['UW1']);
  });

  it('bends the spine by vowel family (front tightens, back broadens)', () => {
    const front = heroFigure({ ...basePacket, phraseGenome: { ...basePacket.phraseGenome, syllables: 3 },
      rhymeAstrology: { ...basePacket.rhymeAstrology, dominantVowelFamily: 'front', phonemes: ['IH1','Z','AH0','N','T','S'] } });
    const back = heroFigure({ ...basePacket, phraseGenome: { ...basePacket.phraseGenome, syllables: 3 },
      rhymeAstrology: { ...basePacket.rhymeAstrology, dominantVowelFamily: 'back', phonemes: ['IH1','Z','AH0','N','T','S'] } });
    const arch = (fig) => Math.min(...fig.rosettes.map((r) => r.center.y));
    // Front vowels tighten (taller arch = smaller min-y) than back vowels.
    expect(arch(front)).toBeLessThan(arch(back));
  });
});
