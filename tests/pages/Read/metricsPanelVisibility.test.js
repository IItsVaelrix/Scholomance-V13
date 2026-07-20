import { describe, expect, it } from 'vitest';
import { shouldShowMetricsPanel } from '../../../src/pages/Read/metricsPanelVisibility.js';

describe('shouldShowMetricsPanel', () => {
  it('shows when panel is open and songStats is present (even without scoreData)', () => {
    expect(shouldShowMetricsPanel({
      showScorePanel: true,
      songStats: { wordCount: 1 },
      songStatsComputeFailed: false,
    })).toBe(true);
  });

  it('shows when panel is open and compute failed (empty-state notice)', () => {
    expect(shouldShowMetricsPanel({
      showScorePanel: true,
      songStats: null,
      songStatsComputeFailed: true,
    })).toBe(true);
  });

  it('hides when panel is closed even if songStats exists', () => {
    expect(shouldShowMetricsPanel({
      showScorePanel: false,
      songStats: { wordCount: 1 },
      songStatsComputeFailed: false,
    })).toBe(false);
  });

  it('hides when panel is open but there is nothing to show', () => {
    expect(shouldShowMetricsPanel({
      showScorePanel: true,
      songStats: null,
      songStatsComputeFailed: false,
    })).toBe(false);
  });
});
