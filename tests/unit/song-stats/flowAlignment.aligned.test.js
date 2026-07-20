import { describe, expect, it } from 'vitest';
import { computeFlowAlignment } from '../../../codex/core/song-stats/flowAlignment.js';

function word(text) {
  return {
    text,
    normalized: text,
    syllableCount: 1,
    stressPattern: '1',
    phonetics: { phonemes: ['AH1'] },
  };
}

const words = ['one', 'two', 'three', 'four'].map(word);
const doc = {
  raw: 'one two three four',
  lines: [{ text: 'one two three four', number: 0, words }],
  allWords: words,
};

const eligibleOptions = {
  alignment: {
    coverage01: 0.9,
    activeDurationSeconds: 2,
    timestampsMonotonic: true,
    words: [
      { startSec: 0.01, endSec: 0.2, text: 'one' },
      { startSec: 0.55, endSec: 0.7, text: 'two' },
      { startSec: 1.02, endSec: 1.2, text: 'three' },
      { startSec: 1.58, endSec: 1.8, text: 'four' },
    ],
  },
  beatGrid: {
    coverage01: 0.98,
    timesSec: [0, 0.5, 1, 1.5, 2],
  },
};

describe('flowAlignment aligned', () => {
  it.each([
    ['alignment coverage', { alignment: { coverage01: 0.84 } }],
    ['beat-grid coverage', { beatGrid: { coverage01: 0.94 } }],
    ['timestamp monotonicity', { alignment: { timestampsMonotonic: false } }],
    ['active duration', { alignment: { activeDurationSeconds: 0 } }],
  ])('uses the complete estimated path when %s is ineligible', (_reason, override) => {
    const options = {
      alignment: { ...eligibleOptions.alignment, ...override.alignment },
      beatGrid: { ...eligibleOptions.beatGrid, ...override.beatGrid },
    };
    const estimated = computeFlowAlignment(doc);
    const pillar = computeFlowAlignment(doc, options);

    expect(pillar.fidelity).toBe('estimated');
    expect(pillar.value).toBe(estimated.value);
    expect(pillar.normalized01).toBe(estimated.normalized01);
    expect(pillar.secondary).toEqual(estimated.secondary);
    expect(pillar.secondary).not.toHaveProperty('syncopationIndex');
    expect(pillar.diagnostics).toContainEqual(expect.objectContaining({
      code: 'alignment_incomplete',
      severity: 'warning',
    }));
  });

  it('computes aligned syncopation separately from timing deviation', () => {
    const pillar = computeFlowAlignment(doc, eligibleOptions);

    expect(pillar.fidelity).toBe('aligned');
    expect(pillar.value).toBeCloseTo(2, 10);
    expect(pillar.secondary).not.toHaveProperty('stressDisplacementProxy');
    expect(pillar.secondary.syncopationIndex).toBeCloseTo(0.125, 10);
    expect(pillar.secondary.gridDeviationMs).toBeCloseTo(35, 10);
    expect(pillar.secondary.pocketBiasMs).toBeCloseTo(35, 10);
    expect(pillar.secondary.pocketConsistencyMs).toBeCloseTo(20, 10);
  });

  it('preserves syncopation when alignment omits a leading document word', () => {
    const remainingWord = word('pulse');
    const remainingDoc = {
      raw: 'pulse',
      lines: [{ text: 'pulse', number: 0, words: [remainingWord] }],
      allWords: [remainingWord],
    };
    const alignedRemaining = {
      alignment: {
        coverage01: 0.85,
        activeDurationSeconds: 1,
        timestampsMonotonic: true,
        words: [{ startSec: 0.5, endSec: 0.7, text: 'pulse' }],
      },
      beatGrid: {
        coverage01: 1,
        timesSec: [0, 0.5, 1],
      },
    };
    const baseline = computeFlowAlignment(remainingDoc, alignedRemaining);
    const leadingUnalignedWord = {
      text: 'and',
      normalized: 'and',
      syllableCount: 1,
      stressPattern: '0',
      phonetics: { phonemes: ['AH0', 'N', 'D'] },
    };
    const docWithLeadingUnalignedWord = {
      raw: 'and pulse',
      lines: [{
        text: 'and pulse',
        number: 0,
        words: [leadingUnalignedWord, remainingWord],
      }],
      allWords: [leadingUnalignedWord, remainingWord],
    };

    const pillar = computeFlowAlignment(docWithLeadingUnalignedWord, alignedRemaining);

    expect(baseline.secondary.syncopationIndex).toBeCloseTo(0.5, 10);
    expect(pillar.secondary.syncopationIndex).toBeCloseTo(
      baseline.secondary.syncopationIndex,
      10,
    );
  });

  it('uses unmatched aligned onsets to occupy the next stronger position', () => {
    const pulse = word('pulse');
    const pulseDoc = {
      raw: 'pulse',
      lines: [{ text: 'pulse', number: 0, words: [pulse] }],
      allWords: [pulse],
    };
    const pillar = computeFlowAlignment(pulseDoc, {
      alignment: {
        coverage01: 0.9,
        activeDurationSeconds: 1.2,
        timestampsMonotonic: true,
        words: [
          { startSec: 0.5, endSec: 0.7, text: 'pulse' },
          { startSec: 1, endSec: 1.2, text: 'unmatched' },
        ],
      },
      beatGrid: {
        coverage01: 1,
        timesSec: [0, 0.5, 1],
      },
    });

    expect(pillar.secondary.syncopationIndex).toBe(0);
  });

  it('accepts exact eligibility thresholds', () => {
    const pillar = computeFlowAlignment(doc, {
      alignment: { ...eligibleOptions.alignment, coverage01: 0.85 },
      beatGrid: { ...eligibleOptions.beatGrid, coverage01: 0.95 },
    });

    expect(pillar.fidelity).toBe('aligned');
  });
});
