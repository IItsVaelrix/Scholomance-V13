/**
 * songScore — pure derivations for the Bytecode Visualiser right-page charts.
 * Honest metrics only: Truesight schools, syllable/phoneme counts, beats, BPM, sync.
 */

export interface ColoredLyricToken {
  word: string;
  school: string | null;
  color: string | null;
  analysis?: { syllableCount?: number; phonemes?: string[] } | null;
}

export interface SchoolShare {
  school: string;
  count: number;
  pct: number;
  color: string;
}

export interface LineScore {
  index: number;
  syllables: number;
  phonemes: number;
  beats: number;
  pressure: number;
  schools: Record<string, number>;
}

export interface TrackScore {
  bpm: number;
  syncMode: 'aligned' | 'estimated';
  dominantSchool: string;
  schoolShares: SchoolShare[];
  lines: LineScore[];
}

export interface BuildTrackScoreInput {
  coloredLyrics: ColoredLyricToken[][] | null;
  lineBeats: number[];
  bpm: number;
  syncMode: 'aligned' | 'estimated';
  /** Plain lyric lines used when coloredLyrics is null (heuristic path). */
  lyricLines?: string[];
}

const EPS = 1e-6;

/** Fallback syllable estimate: vowel groups + silent-e. */
export function syllableCountHeuristic(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z']/g, '');
  if (!w) return 0;
  let count = (w.match(/[aeiouy]+/g) ?? []).length;
  if (count > 1 && w.endsWith('e') && !w.endsWith('le')) count -= 1;
  return Math.max(1, count);
}

function isWordToken(word: string): boolean {
  return /[A-Za-z]/.test(word);
}

function tokensForLine(
  coloredLyrics: ColoredLyricToken[][] | null,
  lyricLines: string[] | undefined,
  index: number,
): ColoredLyricToken[] {
  if (coloredLyrics?.[index]) return coloredLyrics[index];
  const plain = lyricLines?.[index];
  if (!plain) return [];
  return plain.split(/(\s+)/).map((word) => ({
    word,
    school: null,
    color: null,
    analysis: null,
  }));
}

function lineSyllables(tokens: ColoredLyricToken[]): number {
  let syl = 0;
  for (const tok of tokens) {
    if (!isWordToken(tok.word)) continue;
    const fromAnalysis = tok.analysis?.syllableCount;
    if (typeof fromAnalysis === 'number' && fromAnalysis > 0) {
      syl += fromAnalysis;
    } else {
      syl += syllableCountHeuristic(tok.word);
    }
  }
  return syl;
}

function linePhonemes(tokens: ColoredLyricToken[]): number {
  let n = 0;
  for (const tok of tokens) {
    if (!isWordToken(tok.word)) continue;
    const ph = tok.analysis?.phonemes;
    if (Array.isArray(ph) && ph.length > 0) n += ph.length;
  }
  return n;
}

function lineSchools(tokens: ColoredLyricToken[]): Record<string, number> {
  const schools: Record<string, number> = {};
  for (const tok of tokens) {
    if (!tok.school) continue;
    schools[tok.school] = (schools[tok.school] || 0) + 1;
  }
  return schools;
}

function aggregateSchoolShares(coloredLyrics: ColoredLyricToken[][] | null): {
  shares: SchoolShare[];
  dominantSchool: string;
} {
  const counts: Record<string, number> = {};
  const colors: Record<string, string> = {};
  if (coloredLyrics) {
    for (const line of coloredLyrics) {
      for (const tok of line) {
        if (!tok.school) continue;
        counts[tok.school] = (counts[tok.school] || 0) + 1;
        if (tok.color && !colors[tok.school]) colors[tok.school] = tok.color;
      }
    }
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) {
    return { shares: [], dominantSchool: 'SONIC' };
  }
  const shares = Object.entries(counts)
    .map(([school, count]) => ({
      school,
      count,
      pct: Math.round((count / total) * 10000) / 100,
      color: colors[school] || 'currentColor',
    }))
    .sort((a, b) => b.count - a.count || a.school.localeCompare(b.school));
  return { shares, dominantSchool: shares[0].school };
}

export function buildTrackScore(input: BuildTrackScoreInput): TrackScore {
  const { coloredLyrics, lineBeats, bpm, syncMode, lyricLines } = input;
  const lineCount = Math.max(
    lineBeats.length,
    coloredLyrics?.length ?? 0,
    lyricLines?.length ?? 0,
  );
  const { shares, dominantSchool } = aggregateSchoolShares(coloredLyrics);

  const lines: LineScore[] = [];
  for (let i = 0; i < lineCount; i += 1) {
    const tokens = tokensForLine(coloredLyrics, lyricLines, i);
    const syllables = lineSyllables(tokens);
    const phonemes = linePhonemes(tokens);
    const beats = lineBeats[i] ?? 0;
    const pressure = syllables / Math.max(beats, EPS);
    lines.push({
      index: i,
      syllables,
      phonemes,
      beats,
      pressure: Math.round(pressure * 1e6) / 1e6,
      schools: lineSchools(tokens),
    });
  }

  return {
    bpm,
    syncMode,
    dominantSchool,
    schoolShares: shares,
    lines,
  };
}
