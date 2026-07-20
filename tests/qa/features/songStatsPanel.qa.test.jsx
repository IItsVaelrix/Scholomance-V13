import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { describe, expect, it } from 'vitest';
import SongStatsPanel from '../../../src/components/SongStatsPanel.jsx';

expect.extend(toHaveNoViolations);

/** @type {import('../../../codex/core/song-stats/types.js').SongStatsResult} */
const songStatsFixture = {
  wordCount: 48,
  pillars: {
    rhymeDensity: {
      id: 'rhyme_density',
      value: 1.42,
      unit: 'rd',
      secondary: { malmiDensity: 0.71 },
      normalized01: 0.71,
      fidelity: 'exact',
      confidence01: 0.96,
      coverage01: 0.96,
      diagnostics: [],
    },
    uniqueVocabulary: {
      id: 'unique_vocabulary',
      value: 54.17,
      unit: '/100t',
      secondary: {
        uniqueLemmaCount: 26,
        surfaceTypeCount: 28,
        tokenCount: 48,
      },
      normalized01: 0.9,
      fidelity: 'exact',
      confidence01: 1,
      coverage01: 1,
      diagnostics: [],
    },
    flowAlignment: {
      id: 'flow_alignment',
      value: 3.28,
      unit: 'sps',
      secondary: { stressDisplacementProxy: 0.34 },
      normalized01: 0.33,
      fidelity: 'estimated',
      confidence01: 0.7,
      coverage01: 0.94,
      diagnostics: [],
    },
  },
  composite: {
    label: 'technical_density',
    total0to100: 68.4,
    band: 'Adept',
    provisional: true,
    weights: {
      rhymeDensity: 0.4,
      uniqueVocabulary: 0.35,
      flowAlignment: 0.25,
    },
  },
  meta: {
    engineVersion: 'song-stats-v1',
    calibrationVersion: 'cal-2026-07-18',
    sourceFingerprint: 'sha256:qa-fixture',
    rhymeWindow: 24,
    fidelitySummary: 'estimated',
    rawWordCount: 52,
    analyzedTokenCount: 48,
    excludedTokenCount: 4,
    assumptions: {
      estimatedBpm: 90,
      beatsPerLine: 4,
      lineRepresentsBar: true,
    },
  },
};

describe('SongStatsPanel accessibility', () => {
  it('has no axe violations for a SongStatsResult', async () => {
    const { container } = render(
      <SongStatsPanel stats={songStatsFixture} visible onClose={() => {}} />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
