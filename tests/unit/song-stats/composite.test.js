import { describe, expect, it } from 'vitest';
import {
  buildComposite,
  computeSongStats,
} from '../../../codex/core/song-stats/index.js';

function pillar(normalized01, fidelity = 'exact') {
  return {
    id: 'rhyme_density',
    value: normalized01,
    unit: 'test',
    normalized01,
    fidelity,
    confidence01: 1,
    coverage01: 1,
    diagnostics: [],
  };
}

function pillars(rhymeDensity, uniqueVocabulary, flowAlignment, flowFidelity = 'aligned') {
  return {
    rhymeDensity: pillar(rhymeDensity),
    uniqueVocabulary: pillar(uniqueVocabulary),
    flowAlignment: pillar(flowAlignment, flowFidelity),
  };
}

function analyzedDocument(wordCount) {
  const allWords = Array.from({ length: wordCount }, (_, index) => ({
    text: `token${index}`,
    normalized: `token${index}`,
    syllableCount: 1,
    stressPattern: '1',
    phonetics: { phonemes: ['T', 'OW1', 'K', 'AH0', 'N'] },
  }));
  return {
    raw: allWords.map((word) => word.text).join(' '),
    lines: [{ text: allWords.map((word) => word.text).join(' '), number: 0, words: allWords }],
    allWords,
  };
}

describe('Technical Density composite', () => {
  it('weights normalized pillars and assigns threshold bands', () => {
    const composite = buildComposite(pillars(1, 0.8, 0.6), {
      wordCount: 32,
      flowFidelity: 'aligned',
    });

    expect(composite).toEqual({
      label: 'technical_density',
      total0to100: 83,
      band: 'Master',
      provisional: false,
      weights: {
        rhymeDensity: 0.4,
        uniqueVocabulary: 0.35,
        flowAlignment: 0.25,
      },
    });
  });

  it.each([
    [0.9, 'Godlike'],
    [0.75, 'Master'],
    [0.6, 'Adept'],
    [0.59, 'Neophyte'],
  ])('maps %s to the %s band', (normalized, expectedBand) => {
    expect(buildComposite(
      pillars(normalized, normalized, normalized),
      { wordCount: 32, flowFidelity: 'aligned' },
    ).band).toBe(expectedBand);
  });

  it('returns a null total and band below the stats minimum', () => {
    const composite = buildComposite(pillars(1, 1, 1), {
      wordCount: 7,
      flowFidelity: 'estimated',
    });

    expect(composite.total0to100).toBeNull();
    expect(composite.band).toBeNull();
  });

  it('marks composites provisional for fewer than 32 words', () => {
    const result = computeSongStats(analyzedDocument(10));

    expect(result.composite.label).toBe('technical_density');
    expect(result.composite.total0to100).toBeTypeOf('number');
    expect(result.composite.provisional).toBe(true);
  });

  it('marks estimated flow provisional even with at least 32 words', () => {
    const composite = buildComposite(pillars(1, 1, 1, 'estimated'), {
      wordCount: 32,
      flowFidelity: 'estimated',
    });

    expect(composite.provisional).toBe(true);
  });

  it('is deterministic for identical inputs and fingerprints', () => {
    const doc = analyzedDocument(10);
    const first = computeSongStats(doc);
    const second = computeSongStats(doc);

    expect(first).toEqual(second);
    expect(first.meta.sourceFingerprint).toBe(second.meta.sourceFingerprint);
  });

  it('includes alignment and beat-grid fingerprints in source identity', () => {
    const doc = analyzedDocument(10);
    const baseline = computeSongStats(doc, {
      alignment: { fingerprint: 'alignment-a' },
      beatGrid: { fingerprint: 'grid-a' },
    });
    const changedAlignment = computeSongStats(doc, {
      alignment: { fingerprint: 'alignment-b' },
      beatGrid: { fingerprint: 'grid-a' },
    });
    const changedBeatGrid = computeSongStats(doc, {
      alignment: { fingerprint: 'alignment-a' },
      beatGrid: { fingerprint: 'grid-b' },
    });

    expect(changedAlignment.meta.sourceFingerprint).not.toBe(baseline.meta.sourceFingerprint);
    expect(changedBeatGrid.meta.sourceFingerprint).not.toBe(baseline.meta.sourceFingerprint);
  });
});
