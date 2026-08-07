export const METASTABLE_PROMOTION_SCHEMA = 'PB-CONCEPT-CHEM-APM-METASTABLE-SELECTION-v1';

export function evaluateMetastablePromotion(evidence, architecture) {
  const rounds = evidence.decision.rounds;
  const clearing = rounds.filter((round) => (
    round.uniqueWinner
    && round.winner === architecture
    && round.winnerBeatsBar
  ));
  const clearingRoundIds = new Set(clearing.map((round) => round.round));
  const hasMetastableClearingWin = evidence.scoredRounds.some(({ round, reactions }) => (
    clearingRoundIds.has(round)
    && reactions.some((reaction) => (
      reaction.kind === 'candidate'
      && reaction.architecture === architecture
      && reaction.stability === 'METASTABLE'
    ))
  ));
  const aggregateMargin = Number(rounds.reduce((sum, round) => {
    const candidate = evidence.scoredRounds
      .find((entry) => entry.round === round.round)
      .reactions.find((reaction) => reaction.architecture === architecture);
    return sum + candidate.feasibility - round.barFeasibility;
  }, 0).toFixed(4));
  const lawControlsCaught = rounds.every((round) => round.lawControlsCaught);
  const passed = clearing.length >= 2 && hasMetastableClearingWin && lawControlsCaught;

  return {
    schema: METASTABLE_PROMOTION_SCHEMA,
    selectedArchitecture: passed ? architecture : null,
    state: passed ? 'METASTABLE_SELECTED' : 'NOT_SELECTED',
    clearingWins: clearing.length,
    clearingRounds: clearing.map((round) => round.round),
    hasMetastableClearingWin,
    aggregateMargin,
    lawControlsCaught,
    sourceEvidenceChecksum: evidence.evidenceChecksum,
    passed,
  };
}
