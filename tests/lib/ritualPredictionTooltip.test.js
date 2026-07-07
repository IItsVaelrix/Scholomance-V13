import { describe, it, expect } from 'vitest';
import { buildRitualPrediction, posToRole } from '../../src/lib/ritualPredictionTooltip.js';

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
