import { MIN_COMBAT_DAMAGE } from '../../../codex/core/combat.balance.js';
import { calculateCompendiumAmplification } from '../../../codex/core/spellweave-compendium/compendium.engine.js';
import { calculateSyntacticBridge } from '../../../codex/core/spellweave.engine.js';

/**
 * Attach compendium tier breakdown and multiplier to an existing score payload.
 *
 * @param {object|null|undefined} scoreData
 * @param {object} options
 */
export function enrichScoreDataWithCompendium(scoreData, {
  verse = '',
  weave = '',
  scholomance = null,
  compendiumContext = null,
  defender = null,
} = {}) {
  if (!scoreData) return scoreData;
  if (Array.isArray(scoreData.tierBreakdown) && scoreData.tierBreakdown.length > 0) {
    return scoreData;
  }

  const bridge = scoreData.bridge || calculateSyntacticBridge({
    verse,
    weave,
    dominantSchool: scoreData.school,
  });

  const compendium = calculateCompendiumAmplification({
    verse,
    weave,
    bridge,
    scholomance,
    syntacticalChess: scoreData.syntacticalChess,
    encounter: defender,
    verseIRAmplifier: scoreData.verseIRAmplifier || null,
    usedEntryIds: compendiumContext?.usedEntryIds || [],
    unlockedEntryIds: compendiumContext?.unlockedEntryIds || [],
    discoveredEntryIds: compendiumContext?.discoveredEntryIds || [],
  });

  const priorMultiplier = Number(scoreData.compendiumMultiplier) || 1;
  const nextMultiplier = compendium.compendiumMultiplier;
  const factor = nextMultiplier / priorMultiplier;
  const damage = Math.max(
    MIN_COMBAT_DAMAGE,
    Math.round((Number(scoreData.damage) || 0) * factor),
  );

  const commentary = [
    scoreData.commentary || '',
    compendium.counselLines.join(' '),
  ].filter(Boolean).join(' ');

  return {
    ...scoreData,
    bridge,
    damage,
    commentary,
    compendiumMultiplier: nextMultiplier,
    tierBreakdown: compendium.tierBreakdown,
    compendiumCounselLines: compendium.counselLines,
    newlyDiscoveredEntryIds: compendium.newlyDiscoveredEntryIds,
  };
}