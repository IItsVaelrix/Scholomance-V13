import { describe, it, expect } from 'vitest';
import {
  buildRitualPrediction,
  posToRole,
  reconcileWithLexicon,
} from '../../src/lib/ritualPredictionTooltip.js';

const build = (word, contextLine = '') =>
  buildRitualPrediction({ word, line: 0, column: 0, contextLine, surroundingText: contextLine });

describe('classifyRoleDetailed (#1 real role classifier)', () => {
  it('classifies closed-class function words as connectors', () => {
    expect(build('and').prediction.role).toBe('connector');
    expect(build('the').prediction.role).toBe('connector');
  });

  it('uses nominalizing suffixes for anchors, not raw length', () => {
    expect(build('nation').prediction.role).toBe('anchor');
    expect(build('darkness').prediction.role).toBe('anchor');
  });

  it('does NOT mis-fire "trigger" on -ly adverbs', () => {
    // old classifier: "*ly" was never caught and length>=6 made it an anchor;
    // new classifier reads -ly as a modifier suffix.
    expect(build('quickly').prediction.role).toBe('modifier');
  });

  it('reads verb suffixes as triggers', () => {
    expect(build('crystallize').prediction.role).toBe('trigger');
  });

  it('exposes the winning signal and runner-up alternatives', () => {
    const pred = build('darkness');
    expect(pred.prediction.roleSignal).toMatch(/suffix:-ness/);
    expect(Array.isArray(pred.prediction.roleAlternatives)).toBe(true);
  });
});

describe('whyFactors (#2 causal decision trace)', () => {
  it('returns structured factors, not a restatement of the answer', () => {
    const { details } = build('darkness');
    expect(Array.isArray(details.whyFactors)).toBe(true);
    expect(details.whyFactors.length).toBeGreaterThan(0);
    for (const f of details.whyFactors) {
      expect(f).toHaveProperty('signal');
      expect(f).toHaveProperty('detail');
      expect(typeof f.weight).toBe('number');
    }
    // The lead factor must cite evidence (a suffix), never "is classified as".
    expect(details.whyFactors[0].detail).not.toMatch(/is classified as/i);
    expect(details.whyFactors[0].signal).toMatch(/suffix|function_word|intensifier|syllables/);
  });
});

describe('phonology (#3 full structured phoneme output)', () => {
  it('exposes structured phonology instead of only flattened tags', () => {
    const { prediction } = build('crystallize');
    expect(prediction.phonology).toBeTruthy();
    expect(prediction.phonology).toHaveProperty('vowelFamily');
    expect(prediction.phonology).toHaveProperty('syllableCount');
    expect(prediction.phonology).toHaveProperty('rhymeKey');
    expect(prediction.phonology).toHaveProperty('extendedRhymeKeys');
    // back-compat aura still present
    expect(Array.isArray(prediction.semanticAura)).toBe(true);
  });
});

describe('resonance + nearby signals (#3/#4 deepRhyme integration)', () => {
  it('returns a resonancePartners array derived from the real rhyme engine', () => {
    const { details } = build('night', 'the silent night took flight in light');
    expect(Array.isArray(details.resonancePartners)).toBe(true);
    // each partner carries a real connection type + numeric score
    for (const p of details.resonancePartners) {
      expect(typeof p.word).toBe('string');
      expect(typeof p.type).toBe('string');
      expect(typeof p.score).toBe('number');
    }
  });

  it('nearby signals report neighbours, not a noise token count', () => {
    const { details } = build('night', 'the silent night fell');
    const joined = details.nearbySignals.join(' ');
    expect(joined).not.toMatch(/line_tokens/);
    expect(joined).toMatch(/prev:|next:/);
  });
});

describe('confidenceFactors (#5 auditable decomposition)', () => {
  it('decomposes confidence into labelled deltas that sum near the score', () => {
    const { prediction } = build('darkness');
    expect(Array.isArray(prediction.confidenceFactors)).toBe(true);
    const sum = prediction.confidenceFactors.reduce((s, f) => s + f.delta, 0);
    const clamped = Math.min(0.98, Math.max(0.1, sum));
    expect(prediction.confidence).toBeCloseTo(clamped, 5);
  });

  it('penalises unclassifiable tokens with lower confidence than decisive ones', () => {
    const vague = build('xq').prediction.confidence;
    const decisive = build('and').prediction.confidence;
    expect(decisive).toBeGreaterThan(vague);
  });
});

describe('reconcileWithLexicon (single prediction authority)', () => {
  // A synthetic base prediction in the buildRitualPrediction shape, so we can
  // assert that backend lexicon truth overrides the local heuristic regardless
  // of what the local pipeline produced.
  const makeBase = (overrides = {}) => ({
    word: 'flight',
    normalizedWord: 'flight',
    prediction: {
      ritualName: 'Flight — Trigger Glyph',
      ritualFamily: 'Invocation Rite',
      role: 'trigger',
      roleSignal: 'suffix:-ing',
      roleAlternatives: [],
      confidence: 0.6,
      confidenceFactors: [{ label: 'base prior', delta: 0.4 }, { label: 'morphological signal', delta: 0.2 }],
      phonology: { vowelFamily: 'i', syllableCount: 1, rhymeKey: 'aɪt' },
      ...overrides.prediction,
    },
    details: {
      why: 'local',
      whyFactors: [],
      nearbySignals: [],
      resonancePartners: [
        { word: 'light', type: 'slant', score: 0.5 },
        { word: 'silent', type: 'perfect', score: 0.4 },
      ],
      ...overrides.details,
    },
    diagnostics: { warnings: [], debugTrace: [] },
  });

  it('lets the lexicon part-of-speech override the local role guess', () => {
    const base = makeBase(); // local says "trigger"
    const out = reconcileWithLexicon(base, { word: 'flight', pos: ['noun'] });
    expect(out.prediction.role).toBe('anchor'); // noun -> anchor wins
    expect(out.prediction.ritualName).toContain('Anchor');
    expect(out.prediction.authority).toBe('lexicon');
  });

  it('renders backend-confirmed rhyme tiers, not the local phoneme guess', () => {
    const base = makeBase();
    // Backend says "light" is a PERFECT rhyme even though the local engine
    // scored it slant. This is the COLOR_DRAGON fallback the gene forbids.
    const out = reconcileWithLexicon(base, {
      word: 'flight',
      rhymes: ['light'],
      slantRhymes: [],
    });
    const light = out.details.resonancePartners.find((p) => p.word === 'light');
    expect(light.type).toBe('perfect');
    expect(light.confirmed).toBe(true);
  });

  it('does not let an unconfirmed local "perfect" claim stand as perfect', () => {
    const base = makeBase();
    // Backend has rhyme data, but "silent" is in neither list -> the local
    // "perfect" must not be trusted over backend truth.
    const out = reconcileWithLexicon(base, {
      word: 'flight',
      rhymes: ['light'],
      slantRhymes: [],
    });
    const silent = out.details.resonancePartners.find((p) => p.word === 'silent');
    expect(silent.confirmed).toBe(false);
    expect(silent.type).not.toBe('perfect');
  });

  it('records a lexicon-confirmation factor and does not lower confidence', () => {
    const base = makeBase();
    const out = reconcileWithLexicon(base, { word: 'flight', pos: ['noun'] });
    expect(out.prediction.confidence).toBeGreaterThanOrEqual(base.prediction.confidence);
    const labels = out.prediction.confidenceFactors.map((f) => f.label).join(' ');
    expect(labels).toMatch(/lexicon/i);
  });

  it('keeps the local role when the lexicon offers no usable part-of-speech', () => {
    const base = makeBase();
    const out = reconcileWithLexicon(base, { word: 'flight', pos: [] });
    expect(out.prediction.role).toBe('trigger'); // unchanged
    expect(out.prediction.authority).toBe('lexicon'); // still backed by a lookup
  });
});

describe('posToRole (lexicon reconciliation helper)', () => {
  it('maps dictionary parts of speech onto ritual roles', () => {
    expect(posToRole('noun')).toBe('anchor');
    expect(posToRole('verb')).toBe('trigger');
    expect(posToRole('adjective')).toBe('modifier');
    expect(posToRole('preposition')).toBe('connector');
    expect(posToRole('')).toBeNull();
    expect(posToRole('gibberish')).toBeNull();
  });
});
