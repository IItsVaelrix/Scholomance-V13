// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SongStatsPanel from '../../src/components/SongStatsPanel';

const estimatedStats = {
  wordCount: 48,
  pillars: {
    rhymeDensity: {
      id: 'rhyme_density',
      value: 1.18,
      unit: 'rd',
      secondary: { malmiDensity: 0.97 },
      normalized01: 0.59,
      fidelity: 'exact',
      confidence01: 0.96,
      coverage01: 0.96,
      diagnostics: [],
    },
    uniqueVocabulary: {
      id: 'unique_vocabulary',
      value: 59.59,
      unit: '/100t',
      secondary: {
        uniqueLemmaCount: 432,
        surfaceTypeCount: 441,
        tokenCount: 725,
      },
      normalized01: 0.99,
      fidelity: 'exact',
      confidence01: 1,
      coverage01: 1,
      diagnostics: [],
    },
    flowAlignment: {
      id: 'flow_alignment',
      value: 2.8,
      unit: 'sps',
      secondary: { stressDisplacementProxy: 0.51 },
      normalized01: 0.33,
      fidelity: 'estimated',
      confidence01: 0.7,
      coverage01: 0.94,
      diagnostics: [],
    },
  },
  composite: {
    label: 'technical_density',
    total0to100: 69,
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
    sourceFingerprint: 'sha256:test',
    rhymeWindow: 24,
    fidelitySummary: 'estimated',
    rawWordCount: 807,
    analyzedTokenCount: 725,
    excludedTokenCount: 82,
    assumptions: {
      estimatedBpm: 90,
      beatsPerLine: 4,
      lineRepresentsBar: true,
    },
  },
};

afterEach(cleanup);

describe('SongStatsPanel', () => {
  it('renders reconciled counts, parallel values, and metric glosses', () => {
    render(<SongStatsPanel stats={estimatedStats} visible />);

    expect(screen.getByText('CODEx Metrics')).toBeTruthy();
    expect(screen.getByText('Song Stats')).toBeTruthy();
    expect(screen.getByText('Technical Density')).toBeTruthy();
    expect(screen.getByText(/69\.0 · Adept/)).toBeTruthy();
    expect(screen.getByText(/Provisional · Flow estimated from text/)).toBeTruthy();
    expect(screen.getByText('Composite of rhyme density, lexical diversity, and flow.')).toBeTruthy();
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Measures technical concentration, not overall artistic quality, emotional impact, or song effectiveness.',
    );

    expect(screen.getByText('CODEx Rhyme Density')).toBeTruthy();
    expect(screen.getByText(/1\.18 RD/)).toBeTruthy();
    expect(screen.getByText(/Malmi baseline 0\.97/)).toBeTruthy();
    expect(screen.getByText(/linear, unsquared/)).toBeTruthy();
    expect(screen.queryByText(/industry measure/i)).toBeNull();

    expect(screen.getByText('CODEx Lexical Diversity')).toBeTruthy();
    expect(screen.getByText(/59\.59 \/100 tokens/)).toBeTruthy();
    expect(screen.getByText(/432 lemmas · 441 surface forms · 725 analyzed tokens/)).toBeTruthy();

    expect(screen.getByText('Flow')).toBeTruthy();
    expect(screen.getByText(/2\.80 SPS/)).toBeTruthy();
    expect(screen.getByText(/Syncopation proxy 0\.51/)).toBeTruthy();
    expect(screen.getByText(/Estimated · 90 BPM · 1 line = 1 bar/)).toBeTruthy();
    expect(screen.getByText(/assumed rhythmic grid/)).toBeTruthy();

    expect(screen.getByText(/725 analyzed words/)).toBeTruthy();
    expect(screen.getByText(/82 excluded/)).toBeTruthy();
    expect(screen.queryByText(/807 words/)).toBeNull();
    expect(screen.getByText(/window 24/)).toBeTruthy();
    expect(screen.getByText(/weights 40\/35\/25/)).toBeTruthy();
    expect(screen.getByLabelText('CODEx Song Stats')).toBeTruthy();

    expect(screen.queryByText('Phoneme Density')).toBeNull();
    expect(screen.queryByText('RD_C')).toBeNull();
  });

  it('renders em dashes for N<8 empty pillars and shows the top diagnostic', () => {
    const shortStats = {
      ...estimatedStats,
      wordCount: 3,
      meta: {
        ...estimatedStats.meta,
        analyzedTokenCount: 3,
        rawWordCount: 5,
        excludedTokenCount: 2,
      },
      pillars: {
        rhymeDensity: {
          ...estimatedStats.pillars.rhymeDensity,
          value: 0,
          secondary: { malmiDensity: 0 },
          diagnostics: [{
            code: 'need_more_lyrics',
            message: 'At least 8 analyzed lyric tokens are required for song stats.',
            severity: 'warning',
          }],
        },
        uniqueVocabulary: {
          ...estimatedStats.pillars.uniqueVocabulary,
          value: 0,
          secondary: { uniqueLemmaCount: 0, surfaceTypeCount: 0, tokenCount: 0 },
        },
        flowAlignment: {
          ...estimatedStats.pillars.flowAlignment,
          value: 0,
          secondary: { stressDisplacementProxy: 0 },
          diagnostics: [{
            code: 'estimated_one_bar_per_line',
            message: 'Estimated flow assumes one bar for each nonempty lyric source line.',
            severity: 'info',
          }],
        },
      },
      composite: {
        ...estimatedStats.composite,
        total0to100: null,
        band: null,
      },
    };

    render(<SongStatsPanel stats={shortStats} visible />);

    expect(screen.getByText('— RD')).toBeTruthy();
    expect(screen.getByText(/— \/100 tokens/)).toBeTruthy();
    expect(screen.getByText('— SPS')).toBeTruthy();
    expect(screen.getByText('need_more_lyrics')).toBeTruthy();
  });

  it('renders aligned syncopation and invokes close', () => {
    const onClose = vi.fn();
    const alignedStats = {
      ...estimatedStats,
      pillars: {
        ...estimatedStats.pillars,
        flowAlignment: {
          ...estimatedStats.pillars.flowAlignment,
          fidelity: 'aligned',
          secondary: { syncopationIndex: 0.22 },
        },
      },
      composite: { ...estimatedStats.composite, provisional: false },
      meta: { ...estimatedStats.meta, fidelitySummary: 'aligned' },
    };

    render(<SongStatsPanel stats={alignedStats} visible onClose={onClose} />);

    expect(screen.getByText(/Syncopation index 0\.22/)).toBeTruthy();
    expect(screen.getByText('Aligned')).toBeTruthy();
    expect(screen.getByText(/Syncopation index scores stressed syllables on weak beats/)).toBeTruthy();
    const explanation = screen.getByRole('button', { name: 'About Technical Density limits' });
    const tooltip = screen.getByRole('tooltip');
    expect(explanation).toHaveAttribute('aria-describedby', tooltip.id);
    explanation.focus();
    expect(explanation).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Close song statistics' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders unavailable Technical Density as an em dash', () => {
    const unavailableStats = {
      ...estimatedStats,
      composite: {
        ...estimatedStats.composite,
        total0to100: null,
        band: null,
      },
    };

    render(<SongStatsPanel stats={unavailableStats} visible />);

    expect(screen.getByText('— · Unscored')).toBeTruthy();
    expect(screen.queryByText(/0\.0 · Unscored/)).toBeNull();
  });

  it('stays unmounted when hidden', () => {
    const { container } = render(<SongStatsPanel stats={estimatedStats} visible={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
