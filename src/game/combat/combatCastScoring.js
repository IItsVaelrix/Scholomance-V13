/**
 * Authoritative combat cast scoring — VerseIR + combat profile + defender chess.
 *
 * Primary path: POST /api/combat/score (server VerseIR amplifiers).
 * Browser fallback: analyzeText + combat scoring engine (no Node-only VerseIR stack).
 */
import { analyzeText } from '../../../codex/core/analysis.pipeline.js';
import { MIN_COMBAT_DAMAGE } from '../../../codex/core/combat.balance.js';
import { normalizeCombatScore } from '../../../codex/core/combat.scoring.js';
import { evaluateSyntacticalChess } from '../../../codex/core/combat.syntax-chess.js';
import { createCombatScoringEngine } from '../../../codex/core/scoring.defaults.js';
import { scoreCombatScroll } from '../../lib/combatApi.js';
import { enrichScoreDataWithCompendium } from './spellweaveCompendium.scoring.js';
import { getActiveBattleBoard } from './tacticalBoardSession.js';
import {
  buildTacticalCastContext,
  resolveTacticalCast,
} from '../../../codex/core/combat/tactical-board.resolver.js';

let sharedScoringEngine = null;

function getCombatScoringEngine() {
  if (!sharedScoringEngine) {
    sharedScoringEngine = createCombatScoringEngine();
  }
  return sharedScoringEngine;
}

export function enrichScoreWithTacticalBoard(scoreData, {
  casterId = 'player',
  targetId = null,
  weave = '',
  movementUsed = 0,
  maxMovement = 3,
} = {}) {
  const boardState = getActiveBattleBoard();
  if (!boardState) return scoreData;

  const ctx = buildTacticalCastContext(
    casterId,
    targetId,
    boardState,
    { school: scoreData?.school, intent: scoreData?.intent, raw: weave },
    { school: scoreData?.school, intent: scoreData?.intent },
    scoreData?.sceneContext || {},
  );

  const baseScore = Number(scoreData?.totalScore ?? scoreData?.score ?? 0);
  const tactical = resolveTacticalCast(ctx, baseScore, { movementUsed, maxMovement });
  const priorDamage = Number(scoreData?.damage) || 0;
  const damageRatio = baseScore > 0 ? priorDamage / baseScore : 1;

  return {
    ...scoreData,
    totalScore: tactical.adjustedScore,
    score: tactical.adjustedScore,
    damage: Math.max(1, Math.round(tactical.adjustedScore * damageRatio)),
    tacticalCast: tactical,
    commentary: [scoreData?.commentary, ...tactical.traces].filter(Boolean).join(' '),
  };
}

/**
 * Re-score syntactical chess against a concrete defender profile.
 *
 * @param {object} scoreData
 * @param {object} params
 * @param {string} params.verse
 * @param {object | null} [params.defender]
 * @param {object | null} [params.verseIR]
 */
export function enrichDefenderSyntacticalChess(scoreData, {
  verse = '',
  defender = null,
  verseIR = null,
} = {}) {
  if (!scoreData || !defender) return scoreData;

  const syntacticalChess = evaluateSyntacticalChess({
    phrase: verse,
    enemy: defender,
    verseIR: verseIR || scoreData?.verseIR || scoreData?.verseIRAmplifier || null,
    profile: scoreData,
  });

  const priorMultiplier = Number(scoreData?.syntacticalChessMultiplier) || 1;
  const rawDamage = Number(scoreData?.damage) || 0;
  const baseDamage = priorMultiplier > 0 ? rawDamage / priorMultiplier : rawDamage;

  return {
    ...scoreData,
    damage: Math.max(MIN_COMBAT_DAMAGE, Math.round(baseDamage * syntacticalChess.multiplier)),
    syntacticalChess,
    syntacticalChessMultiplier: syntacticalChess.multiplier,
    commentary: [scoreData?.commentary || '', ...syntacticalChess.diagnostics].filter(Boolean).join(' '),
  };
}

async function scoreCombatCastLocally({
  verse = '',
  weave = '',
  defender = null,
  defenderSchool = null,
  scholomance = null,
  compendiumContext = null,
  scoringEngine = getCombatScoringEngine(),
} = {}) {
  const analyzedDoc = analyzeText(verse);
  const baseScoreData = await scoringEngine.calculateScore(analyzedDoc);
  const scoreData = normalizeCombatScore(baseScoreData, {
    scrollText: verse,
    weave,
    analyzedDoc,
    defender,
    defenderSchool: defender?.school ?? defenderSchool ?? null,
    speakerId: 'combat:player',
    speakerType: 'PLAYER',
    scholomance,
    compendiumContext,
  });

  const tokenWeights = analyzedDoc.parsed?.tokenWeights ?? null;

  return {
    analyzedDoc,
    verseIR: null,
    scoreData: enrichDefenderSyntacticalChess(
      tokenWeights ? { ...scoreData, tokenWeights } : scoreData,
      { verse, defender },
    ),
  };
}

/**
 * @param {object} params
 * @param {string} [params.verse]
 * @param {string} [params.weave]
 * @param {object | null} [params.defender]
 * @param {string | null} [params.defenderSchool]
 * @param {import('../../../codex/core/scoring.engine.js').createScoringEngine} [params.scoringEngine]
 */
export async function resolveCombatCastScore({
  verse = '',
  weave = '',
  defender = null,
  defenderSchool = null,
  scholomance = null,
  compendiumContext = null,
  scoringEngine = null,
  casterId = 'player',
  targetId = null,
  movementUsed = 0,
  maxMovement = 3,
} = {}) {
  const engine = scoringEngine || getCombatScoringEngine();

  try {
    const apiScoreData = await scoreCombatScroll({
      scrollText: verse,
      weave,
      opponentSchool: defender?.school ?? defenderSchool ?? undefined,
      scholomance,
      compendiumContext,
    });

    const verseIR = apiScoreData?.verseIR
      || (apiScoreData?.verseIRAmplifier ? { verseIRAmplifier: apiScoreData.verseIRAmplifier } : null);

    const enriched = enrichDefenderSyntacticalChess(apiScoreData, {
      verse,
      defender,
      verseIR,
    });
    const compendiumEnriched = enrichScoreDataWithCompendium(enriched, {
      verse,
      weave,
      scholomance,
      compendiumContext,
      defender,
    });
    return {
      analyzedDoc: null,
      verseIR,
      scoreData: enrichScoreWithTacticalBoard(compendiumEnriched, {
        casterId,
        targetId: targetId || defender?.id || null,
        weave,
        movementUsed,
        maxMovement,
      }),
    };
  } catch (error) {
    console.warn('[combatCastScoring] Combat score API failed; using browser-safe local scoring.', error);
  }

  const local = await scoreCombatCastLocally({
    verse,
    weave,
    defender,
    defenderSchool,
    scholomance,
    compendiumContext,
    scoringEngine: engine,
  });
  return {
    ...local,
    scoreData: enrichScoreWithTacticalBoard(local.scoreData, {
      casterId,
      targetId: targetId || defender?.id || null,
      weave,
      movementUsed,
      maxMovement,
    }),
  };
}