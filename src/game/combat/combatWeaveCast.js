/**
 * Orchestrates combat cast resolution without letting scoring own scene truth.
 *
 * Flow: parseWeave → calculateSyntacticBridge (inside calculateCombatScore)
 *       → resolveWeaveTargets → attach metadata to the cast result.
 */
import { calculateCombatScore } from '../../../codex/core/combat.scoring.js';
import { parseWeave } from '../../../codex/core/spellweave.engine.js';
import { mergeSelectedCombatTarget } from './combatTargetSelection.js';
import { resolveWeaveTargetsFromParsed } from './weave-scene-targets.js';

/**
 * @param {object} params
 * @param {string} [params.verse]
 * @param {string} [params.weave]
 * @param {import('./weave-scene-targets.js').SceneContextSnapshot} [params.sceneContext]
 * @param {string | null} [params.selectedCombatTargetId]
 * @param {(targetId: string) => boolean} [params.canAttack]
 * @param {object} [params.defender] - syntactical chess defender profile
 * @param {string | null} [params.defenderSchool]
 * @param {object} [params.scoreData]
 * @param {object} [rest] - forwarded to calculateCombatScore
 */
export function resolveCombatWeaveCast({
  verse = '',
  weave = '',
  sceneContext = null,
  selectedCombatTargetId = null,
  canAttack = null,
  defender = null,
  defenderSchool = null,
  scoreData = null,
  ...rest
} = {}) {
  const parsed = parseWeave(weave);
  const weaveResolved = resolveWeaveTargetsFromParsed(parsed, sceneContext || undefined, weave);
  const resolvedTargets = mergeSelectedCombatTarget(
    weaveResolved,
    selectedCombatTargetId ?? sceneContext?.selectedCombatTargetId ?? null,
    sceneContext || undefined,
    { canAttack: canAttack || undefined },
  );
  const score = calculateCombatScore({
    text: verse,
    weave,
    scoreData: scoreData || rest.preparedScore || null,
    defender,
    defenderSchool,
    analyzedDoc: scoreData?.analyzedDoc || rest.analyzedDoc || null,
    ...rest,
  });

  return {
    ...score,
    parsedWeave: parsed,
    resolvedTargets,
    bridge: {
      ...score.bridge,
      resolvedTargets,
    },
  };
}