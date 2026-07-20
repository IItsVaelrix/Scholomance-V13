/**
 * Design-spec QA checklist lock for CODEx Song Stats.
 * @see docs/superpowers/specs/2026-07-18-codex-song-stats-design.md § Testing / QA checklist
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CALIBRATION_VERSION,
  ENGINE_VERSION,
  computeFlowAlignment,
  computeRhymeDensity,
  computeSongStats,
  longestVowelMatchLength,
} from '../../../codex/core/song-stats/index.js';
import { resolveSongStatsDisplay } from '../../../codex/core/song-stats/staleGuard.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function word(normalized, phonemes, extras = {}) {
  return {
    text: normalized,
    normalized,
    phonetics: phonemes ? { phonemes } : undefined,
    ...extras,
  };
}

function lyricDoc(lines) {
  return {
    raw: lines.map((line) => line.text).join('\n'),
    lines,
    allWords: lines.flatMap((line) => line.words ?? []),
  };
}

function nWords(count, phonemes = ['EY1']) {
  return Array.from({ length: count }, (_, index) => word(`token-${index}`, phonemes));
}

describe('Song Stats QA checklist', () => {
  it('Malmi baseline uses L, not L²; CODEx weighted density uses L²', () => {
    // First word L=0; second matches two vowel identities → L=2
    const words = [
      word('omega', ['AH0', 'IY0']),
      word('copy', ['AH1', 'IY1']),
    ];
    const pillar = computeRhymeDensity(words);

    expect(pillar.secondary.malmiDensity).toBeCloseTo((0 + 2) / 2, 10);
    expect(pillar.value).toBeCloseTo((0 + 2 ** 2) / 2, 10);
    expect(pillar.value).toBeGreaterThan(pillar.secondary.malmiDensity);
    expect(pillar.unit).toBe('rd');
  });

  it('exposes repetitionContribution so identical tokens cannot silently inflate RD', () => {
    const death = word('death', ['D', 'EH1', 'TH']);
    const pillar = computeRhymeDensity([death, death, death, death]);

    expect(pillar.secondary).toHaveProperty('repetitionContribution');
    expect(pillar.secondary.repetitionContribution).toBeGreaterThan(0.5);
    expect(pillar.diagnostics).toContainEqual(expect.objectContaining({
      code: 'rhyme_repetition_heavy',
    }));
  });

  it('stress mismatch does not break vowel-identity match', () => {
    expect(longestVowelMatchLength(['AH0', 'IY0'], ['AH1', 'IY1'])).toBe(2);
    expect(longestVowelMatchLength(['EH0'], ['EH2'])).toBe(1);
  });

  it('pronunciation variants resolve deterministically (phonetics over deepPhonetics)', () => {
    // Surface pronunciations share no vowel identity; deep fallback would rhyme on OW.
    const preferSurface = [
      word('day', null, {
        phonetics: { phonemes: ['D', 'EY1'] },
        deepPhonetics: { phonemes: ['OW1'] },
      }),
      word('cat', null, {
        phonetics: { phonemes: ['K', 'AE1', 'T'] },
        deepPhonetics: { phonemes: ['OW1'] },
      }),
    ];
    const deepOnly = [
      word('day', null, { deepPhonetics: { phonemes: ['OW1'] } }),
      word('cat', null, { deepPhonetics: { phonemes: ['OW1'] } }),
    ];

    const surfacePillar = computeRhymeDensity(preferSurface);
    const deepPillar = computeRhymeDensity(deepOnly);

    expect(surfacePillar.value).toBe(0);
    expect(deepPillar.value).toBeCloseTo(1 / 2, 10);
    expect(computeRhymeDensity(preferSurface)).toEqual(surfacePillar);
  });

  it('OOV-heavy fixtures lower phoneme coverage', () => {
    const covered = nWords(4, ['EY1']);
    const oovHeavy = [
      ...covered,
      word('zzxq', null),
      word('qqvx', null),
      word('plzk', null),
      word('nxwq', null),
    ];

    const coveredPillar = computeRhymeDensity(covered);
    const oovPillar = computeRhymeDensity(oovHeavy);

    expect(coveredPillar.secondary.phonemeCoverage).toBe(1);
    expect(oovPillar.secondary.phonemeCoverage).toBeCloseTo(0.5, 10);
    expect(oovPillar.coverage01).toBeLessThan(coveredPillar.coverage01);
    expect(oovPillar.confidence01).toBe(oovPillar.coverage01);
  });

  it('section headings and blank lines do not increase estimated duration', () => {
    const lyricWords = [
      word('hello', ['HH', 'AH0', 'L', 'OW1'], { syllableCount: 2, stressPattern: '01' }),
      word('world', ['W', 'ER1', 'L', 'D'], { syllableCount: 1, stressPattern: '1' }),
      word('from', ['F', 'R', 'AH1', 'M'], { syllableCount: 1, stressPattern: '1' }),
      word('cadence', ['K', 'EY1', 'D', 'AH0', 'N', 'S'], { syllableCount: 2, stressPattern: '10' }),
    ];
    const withNoise = lyricDoc([
      { text: 'Verse 1', number: 0, words: [] },
      { text: 'hello world from cadence', number: 1, words: lyricWords },
      { text: '', number: 2, words: [] },
      { text: 'CHORUS', number: 3, words: [] },
    ]);
    const lyricsOnly = lyricDoc([
      { text: 'hello world from cadence', number: 0, words: lyricWords },
    ]);

    const noisy = computeFlowAlignment(withNoise);
    const clean = computeFlowAlignment(lyricsOnly);

    expect(noisy.secondary.estimatedDurationSec).toBe(clean.secondary.estimatedDurationSec);
    expect(noisy.secondary.estimatedDurationSec).toBeCloseTo(4 * 60 / 90, 5);
  });

  it('visual wrapping does not affect Flow; source line breaks do', () => {
    const a = [
      word('one', ['AH1'], { syllableCount: 1, stressPattern: '1' }),
      word('two', ['UW1'], { syllableCount: 1, stressPattern: '1' }),
    ];
    const b = [
      word('three', ['TH', 'R', 'IY1'], { syllableCount: 1, stressPattern: '1' }),
      word('four', ['F', 'AO1', 'R'], { syllableCount: 1, stressPattern: '1' }),
    ];
    const oneSourceLine = lyricDoc([{
      text: 'one two three four',
      number: 0,
      words: [...a, ...b],
    }]);
    const twoSourceLines = lyricDoc([
      { text: 'one two', number: 0, words: a },
      { text: 'three four', number: 1, words: b },
    ]);

    const one = computeFlowAlignment(oneSourceLine);
    const two = computeFlowAlignment(twoSourceLines);

    expect(two.secondary.estimatedDurationSec).toBe(one.secondary.estimatedDurationSec * 2);
  });

  it('reformatting source line breaks produces a documented diagnostic', () => {
    const short = [word('hi', ['HH', 'AY1'], { syllableCount: 1, stressPattern: '1' })];
    const long = [
      word('another', ['AH0', 'N', 'AH1', 'DH', 'ER0'], { syllableCount: 3, stressPattern: '010' }),
      word('solid', ['S', 'AA1', 'L', 'AH0', 'D'], { syllableCount: 2, stressPattern: '10' }),
      word('lyric', ['L', 'IH1', 'R', 'IH0', 'K'], { syllableCount: 2, stressPattern: '10' }),
      word('line', ['L', 'AY1', 'N'], { syllableCount: 1, stressPattern: '1' }),
      word('here', ['HH', 'IY1', 'R'], { syllableCount: 1, stressPattern: '1' }),
    ];
    const pillar = computeFlowAlignment(lyricDoc([
      { text: 'hi', number: 0, words: short },
      { text: 'another solid lyric line here', number: 1, words: long },
    ]));

    expect(pillar.diagnostics).toContainEqual(expect.objectContaining({
      code: 'line_structure_irregular',
    }));
  });

  it('grid deviation is not labeled syncopation; estimated mode keeps them separate', () => {
    const words = ['one', 'two', 'three', 'four'].map((text) => (
      word(text, ['AH1'], { syllableCount: 1, stressPattern: '1' })
    ));
    const doc = lyricDoc([{ text: 'one two three four', number: 0, words }]);
    const estimated = computeFlowAlignment(doc);
    const aligned = computeFlowAlignment(doc, {
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
    });

    expect(estimated.secondary).toHaveProperty('stressDisplacementProxy');
    expect(estimated.secondary).not.toHaveProperty('syncopationIndex');
    expect(estimated.secondary).not.toHaveProperty('gridDeviationMs');
    expect(aligned.secondary).toHaveProperty('syncopationIndex');
    expect(aligned.secondary).toHaveProperty('gridDeviationMs');
    expect(aligned.secondary.syncopationIndex).not.toBe(aligned.secondary.gridDeviationMs);
  });

  it('partial alignment never enters aligned mode (no chimera blend)', () => {
    const words = ['one', 'two', 'three', 'four'].map((text) => (
      word(text, ['AH1'], { syllableCount: 1, stressPattern: '1' })
    ));
    const doc = lyricDoc([{ text: 'one two three four', number: 0, words }]);
    const pureEstimated = computeFlowAlignment(doc);
    const partial = computeFlowAlignment(doc, {
      alignment: {
        coverage01: 0.5,
        activeDurationSeconds: 2,
        timestampsMonotonic: true,
        words: [
          { startSec: 0, endSec: 0.2, text: 'one' },
          { startSec: 0.5, endSec: 0.7, text: 'two' },
          { startSec: 1, endSec: 1.2, text: 'three' },
          { startSec: 1.5, endSec: 1.8, text: 'four' },
        ],
      },
      beatGrid: {
        coverage01: 0.98,
        timesSec: [0, 0.5, 1, 1.5, 2],
      },
    });

    expect(partial.fidelity).toBe('estimated');
    expect(partial.value).toBe(pureEstimated.value);
    expect(partial.normalized01).toBe(pureEstimated.normalized01);
    expect(partial.secondary).toEqual(pureEstimated.secondary);
    expect(partial.secondary).not.toHaveProperty('syncopationIndex');
    expect(partial.diagnostics).toContainEqual(expect.objectContaining({
      code: 'alignment_incomplete',
    }));
  });

  it('stale calculations cannot overwrite newer text', () => {
    expect(resolveSongStatsDisplay({
      computeFailed: true,
      lastGood: {
        meta: { sourceFingerprint: 'old' },
        composite: { total0to100: 70 },
      },
      currentFingerprint: 'new',
      nextResult: null,
    })).toBeNull();
  });

  it('composite constants include a calibration version', () => {
    const result = computeSongStats({
      raw: nWords(8).map((entry) => entry.text).join(' '),
      lines: [],
      allWords: nWords(8),
    });

    expect(ENGINE_VERSION).toBe('song-stats-v1');
    expect(CALIBRATION_VERSION).toBe('cal-2026-07-18');
    expect(result.meta.engineVersion).toBe(ENGINE_VERSION);
    expect(result.meta.calibrationVersion).toBe(CALIBRATION_VERSION);
  });

  it('eight-word fixtures are provisional, not authoritative', () => {
    const eight = computeSongStats({
      raw: 'eight word provisional fixture text here now',
      lines: [],
      allWords: nWords(8),
    });
    const thirtyTwoAligned = computeSongStats({
      raw: nWords(32).map((entry) => entry.text).join(' '),
      lines: [{
        text: nWords(32).map((entry) => entry.text).join(' '),
        number: 0,
        words: nWords(32).map((entry) => ({
          ...entry,
          syllableCount: 1,
          stressPattern: '1',
        })),
      }],
      allWords: nWords(32).map((entry) => ({
        ...entry,
        syllableCount: 1,
        stressPattern: '1',
      })),
    }, {
      alignment: {
        coverage01: 0.9,
        activeDurationSeconds: 4,
        timestampsMonotonic: true,
        fingerprint: 'align-32',
        words: nWords(32).map((entry, index) => ({
          startSec: index * 0.1,
          endSec: index * 0.1 + 0.05,
          text: entry.text,
        })),
      },
      beatGrid: {
        coverage01: 0.98,
        fingerprint: 'grid-32',
        timesSec: Array.from({ length: 33 }, (_, index) => index * 0.125),
      },
    });

    expect(eight.wordCount).toBe(8);
    expect(eight.composite.provisional).toBe(true);
    expect(eight.composite.total0to100).toBeTypeOf('number');
    expect(thirtyTwoAligned.wordCount).toBe(32);
    expect(thirtyTwoAligned.pillars.flowAlignment.fidelity).toBe('aligned');
    expect(thirtyTwoAligned.composite.provisional).toBe(false);
  });

  it('all results are deterministic across repeated runs', () => {
    const doc = {
      raw: 'deterministic song stats fixture with enough tokens',
      lines: [{
        text: 'deterministic song stats fixture with enough tokens',
        number: 0,
        words: nWords(8).map((entry) => ({
          ...entry,
          syllableCount: 1,
          stressPattern: '1',
        })),
      }],
      allWords: nWords(8).map((entry) => ({
        ...entry,
        syllableCount: 1,
        stressPattern: '1',
      })),
    };

    const first = computeSongStats(doc);
    const second = computeSongStats(doc);
    const third = computeSongStats(doc);

    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(first.meta.sourceFingerprint).toBe(second.meta.sourceFingerprint);
  });

  it('Read Metrics slot uses SongStatsPanel (not HeuristicScorePanel ledger)', () => {
    const readPage = readFileSync(join(ROOT, 'src/pages/Read/ReadPage.jsx'), 'utf8');
    const panel = readFileSync(join(ROOT, 'src/components/SongStatsPanel.jsx'), 'utf8');

    expect(readPage).toMatch(/SongStatsPanel/);
    expect(readPage).not.toMatch(/HeuristicScorePanel/);
    expect(panel).toMatch(/Technical Density/);
    expect(panel).toMatch(/CODEx Rhyme Density/);
    expect(panel).toMatch(/CODEx Lexical Diversity/);
    expect(panel).toMatch(/Estimated|Aligned|fidelity/i);
    expect(panel).not.toMatch(/Phoneme Density/);
    expect(panel).not.toMatch(/Alliteration/);
  });
});
