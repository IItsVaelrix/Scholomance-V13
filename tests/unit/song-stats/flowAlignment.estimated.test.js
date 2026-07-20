import { describe, expect, it } from 'vitest';
import { computeFlowAlignment } from '../../../codex/core/song-stats/flowAlignment.js';
import { computeSongStats } from '../../../codex/core/song-stats/index.js';

function word(text, syllableCount, stressPattern, phonemes) {
  return {
    text,
    normalized: text.toLowerCase(),
    syllableCount,
    stressPattern,
    phonetics: { phonemes },
  };
}

const firstLineWords = [
  word('hello', 2, '01', ['HH', 'AH0', 'L', 'OW1']),
  word('world', 1, '1', ['W', 'ER1', 'L', 'D']),
  word('from', 1, '1', ['F', 'R', 'AH1', 'M']),
  word('cadence', 2, '10', ['K', 'EY1', 'D', 'AH0', 'N', 'S']),
];

const secondLineWords = [
  word('another', 3, '010', ['AH0', 'N', 'AH1', 'DH', 'ER0']),
  word('solid', 2, '10', ['S', 'AA1', 'L', 'AH0', 'D']),
  word('lyric', 2, '10', ['L', 'IH1', 'R', 'IH0', 'K']),
  word('line', 1, '1', ['L', 'AY1', 'N']),
  word('here', 1, '1', ['HH', 'IY1', 'R']),
];

function documentWithLines(lines) {
  return {
    raw: lines.map((line) => line.text).join('\n'),
    lines,
    allWords: lines.flatMap((line) => line.words),
  };
}

describe('flowAlignment estimated', () => {
  it('ignores blank lines and section headings for duration', () => {
    const doc = documentWithLines([
      { text: 'Verse 1', number: 0, words: [] },
      { text: 'hello world from cadence', number: 1, words: firstLineWords },
      { text: '', number: 2, words: [] },
      { text: 'another solid lyric line here', number: 3, words: secondLineWords },
    ]);

    const pillar = computeFlowAlignment(doc, { alignment: null, beatGrid: null });

    expect(pillar.fidelity).toBe('estimated');
    expect(pillar.value).toBeCloseTo(15 / (2 * 4 * 60 / 90), 5);
    expect(pillar.secondary.estimatedDurationSec).toBeCloseTo(2 * 4 * 60 / 90, 5);
    expect(pillar.secondary.stressDisplacementProxy).toBeTypeOf('number');
    expect(pillar.secondary).not.toHaveProperty('gridDeviationMs');
    expect(pillar.diagnostics).toContainEqual(expect.objectContaining({
      code: 'estimated_one_bar_per_line',
      severity: 'info',
    }));
    expect(pillar.diagnostics.some((d) => d.code === 'alignment_incomplete')).toBe(false);
  });

  it('does not emit alignment_incomplete on the pure estimated path', () => {
    const doc = documentWithLines([
      { text: 'hello world from cadence', number: 0, words: firstLineWords },
      { text: 'another solid lyric line here', number: 1, words: secondLineWords },
    ]);

    const omitted = computeFlowAlignment(doc);
    const explicitNull = computeFlowAlignment(doc, { alignment: null, beatGrid: null });

    expect(omitted.diagnostics.some((d) => d.code === 'alignment_incomplete')).toBe(false);
    expect(explicitNull.diagnostics.some((d) => d.code === 'alignment_incomplete')).toBe(false);
  });

  it('uses source line breaks rather than visual wrapping', () => {
    const words = [...firstLineWords, ...secondLineWords];
    const oneLine = documentWithLines([
      { text: words.map((entry) => entry.text).join(' '), number: 0, words },
    ]);
    const twoLines = documentWithLines([
      { text: firstLineWords.map((entry) => entry.text).join(' '), number: 0, words: firstLineWords },
      { text: secondLineWords.map((entry) => entry.text).join(' '), number: 1, words: secondLineWords },
    ]);

    const oneLineFlow = computeFlowAlignment(oneLine);
    const twoLineFlow = computeFlowAlignment(twoLines);

    expect(twoLineFlow.secondary.estimatedDurationSec).toBe(
      oneLineFlow.secondary.estimatedDurationSec * 2,
    );
  });

  it('uses BPM and beats-per-line options and normalizes the flow blend', () => {
    const doc = documentWithLines([
      { text: 'hello world from cadence', number: 0, words: firstLineWords },
      { text: 'another solid lyric line here', number: 1, words: secondLineWords },
    ]);

    const pillar = computeFlowAlignment(doc, { bpm: 120, beatsPerLine: 3 });
    const expectedDuration = 2 * 3 * 60 / 120;
    const expectedNormalized = (
      0.55 * Math.min(1, pillar.value / 8)
      + 0.45 * pillar.secondary.stressDisplacementProxy
    );

    expect(pillar.secondary.estimatedDurationSec).toBe(expectedDuration);
    expect(pillar.value).toBeCloseTo(15 / expectedDuration, 5);
    expect(pillar.normalized01).toBeCloseTo(expectedNormalized, 10);
  });

  it('scores evenly spaced stresses at subdivision centers as on-grid', () => {
    const stressedWords = ['one', 'two', 'three', 'four'].map((text) => (
      word(text, 1, '1', ['AH1'])
    ));
    const doc = documentWithLines([
      { text: 'one two three four', number: 0, words: stressedWords },
    ]);

    const pillar = computeFlowAlignment(doc, { beatsPerLine: 4 });

    expect(pillar.secondary.stressDisplacementProxy).toBeCloseTo(0, 10);
  });

  it('falls back to vowel phoneme counts and warns for one-bar estimates', () => {
    const fallbackWords = [
      word('echo', undefined, '10', ['EH1', 'K', 'OW0']),
      word('again', undefined, '01', ['AH0', 'G', 'EH1', 'N']),
    ];
    const doc = documentWithLines([
      { text: 'echo again', number: 0, words: fallbackWords },
    ]);

    const pillar = computeFlowAlignment(doc);

    expect(pillar.value).toBeCloseTo(4 / (4 * 60 / 90), 5);
    expect(pillar.diagnostics).toContainEqual(expect.objectContaining({
      code: 'estimated_flow_low_confidence',
      severity: 'warning',
    }));
  });

  it('diagnoses materially irregular lyric-line syllable counts', () => {
    const doc = documentWithLines([
      { text: 'short', number: 0, words: [word('short', 1, '1', ['AO1'])] },
      { text: 'a substantially longer lyric line', number: 1, words: secondLineWords },
    ]);

    const pillar = computeFlowAlignment(doc);

    expect(pillar.diagnostics).toContainEqual(expect.objectContaining({
      code: 'line_structure_irregular',
    }));
  });

  it('wires estimated flow into computeSongStats for eligible text length', () => {
    const doc = documentWithLines([
      { text: 'hello world from cadence', number: 0, words: firstLineWords },
      { text: 'another solid lyric line here', number: 1, words: secondLineWords },
    ]);

    const result = computeSongStats(doc, { bpm: 120, beatsPerLine: 3 });

    expect(result.pillars.flowAlignment.fidelity).toBe('estimated');
    expect(result.pillars.flowAlignment.secondary.estimatedDurationSec).toBe(3);
    expect(result.meta.assumptions).toEqual({
      estimatedBpm: 120,
      beatsPerLine: 3,
      lineRepresentsBar: true,
    });
  });

  it('changes the source fingerprint when estimated pacing assumptions change', () => {
    const doc = documentWithLines([
      { text: 'hello world from cadence', number: 0, words: firstLineWords },
      { text: 'another solid lyric line here', number: 1, words: secondLineWords },
    ]);

    const baseline = computeSongStats(doc, { bpm: 90, beatsPerLine: 4 });
    const changedBpm = computeSongStats(doc, { bpm: 120, beatsPerLine: 4 });
    const changedBeats = computeSongStats(doc, { bpm: 90, beatsPerLine: 3 });

    expect(changedBpm.meta.sourceFingerprint).not.toBe(baseline.meta.sourceFingerprint);
    expect(changedBeats.meta.sourceFingerprint).not.toBe(baseline.meta.sourceFingerprint);
  });
});
