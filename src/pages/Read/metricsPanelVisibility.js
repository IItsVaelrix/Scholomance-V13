/**
 * Whether the CODEx Metrics container should render.
 * Gate on Song Stats content (or its compute-failed notice), not scoreData —
 * scoreData and songStats can diverge after a non-fatal server compute failure.
 *
 * @param {{
 *   showScorePanel: boolean,
 *   songStats: unknown,
 *   songStatsComputeFailed: boolean,
 * }} args
 * @returns {boolean}
 */
export function shouldShowMetricsPanel({
  showScorePanel,
  songStats,
  songStatsComputeFailed,
}) {
  return Boolean(showScorePanel && (songStats || songStatsComputeFailed));
}
