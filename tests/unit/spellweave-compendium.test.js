import { describe, expect, it } from 'vitest';
import { normalizeCombatScore } from '../../codex/core/combat.scoring.js';
import { calculateCompendiumAmplification } from '../../codex/core/spellweave-compendium/compendium.engine.js';
import { getCompendiumRegistryMeta } from '../../codex/core/spellweave-compendium/compendium.registry.js';
import { computeGrammarFactor } from '../../codex/core/spellweave-compendium/compendium.grammar-gate.js';
import { createCombatScoringEngine } from '../../codex/core/scoring.defaults.js';
import { analyzeText } from '../../codex/core/analysis.pipeline.js';
import { calculateSyntacticBridge } from '../../codex/core/spellweave.engine.js';

describe('spellweave compendium', () => {
  it('exposes a versioned registry with all tier families', () => {
    const meta = getCompendiumRegistryMeta();
    expect(meta.version).toBe('spellweave-compendium-v1');
    expect(meta.entryCount).toBeGreaterThan(60);
    expect(meta.tiers).toEqual(expect.arrayContaining([
      'ELEMENTAL',
      'EMOTION',
      'LEXICAL_RARITY',
      'CHEMICAL',
      'PSYCHOLOGY',
      'SONIC',
      'MYTH',
      'DISCOVERY',
    ]));
  });

  it('rewards sciamachy higher than a common fight word with the same weave', () => {
    const weave = 'offensive the flesh';
    const scholomance = { CODEX: 20, VALCH: 14, BAPO: 12, KSYN: 12 };

    const rare = calculateCompendiumAmplification({
      verse: 'shadow sciamachy in the rivet seam',
      weave,
      bridge: calculateSyntacticBridge({ verse: 'shadow sciamachy in the rivet seam', weave, dominantSchool: 'ALCHEMY' }),
      scholomance,
    });
    const common = calculateCompendiumAmplification({
      verse: 'I fight the sentinel guard',
      weave,
      bridge: calculateSyntacticBridge({ verse: 'I fight the sentinel guard', weave, dominantSchool: 'ALCHEMY' }),
      scholomance,
    });

    expect(rare.compendiumMultiplier).toBeGreaterThan(common.compendiumMultiplier);
    expect(rare.tierBreakdown.some((entry) => entry.band === 'RARE_II')).toBe(true);
  });

  it('reduces lexical rarity when weave grammar is collapsed', () => {
    const bridge = {
      collapsed: true,
      clauses: [{ legality: 'collapsed' }],
      objects: ['FLESH'],
      intent: 'OFFENSIVE',
      chainType: 'SINGLE',
    };
    const result = calculateCompendiumAmplification({
      verse: 'petrichor sciamachy fracture',
      weave: 'offensive the flesh',
      bridge,
      scholomance: { CODEX: 24 },
    });
    const rarity = result.tierBreakdown.find((entry) => entry.tierId === 'LEXICAL_RARITY');
    expect(rarity?.grammarFactor).toBeLessThanOrEqual(0.25);
  });

  it('detects chemical metal oxidize with VALCH gate and object binding', () => {
    const bridge = calculateSyntacticBridge({
      verse: 'moisture bites the iron seam until rust blooms',
      weave: 'offensive the stone',
      dominantSchool: 'ALCHEMY',
    });
    const result = calculateCompendiumAmplification({
      verse: 'moisture bites the iron seam until rust blooms',
      weave: 'offensive the stone',
      bridge,
      scholomance: { VALCH: 18, KSYN: 10 },
    });
    expect(result.tierBreakdown.some((entry) => entry.entryId === 'chemical.metal_oxidize')).toBe(true);
  });

  it('integrates compendium multiplier into combat scoring', async () => {
    const engine = createCombatScoringEngine();
    const verse = 'rage seethes as sciamachy shadow-boxes the iron rivet';
    const weave = 'offensive the flesh';
    const analyzedDoc = analyzeText(verse);
    const baseScoreData = await engine.calculateScore(analyzedDoc);

    const without = normalizeCombatScore(baseScoreData, {
      scrollText: verse,
      weave,
      analyzedDoc,
      scholomance: { BAPO: 12, CODEX: 18, VALCH: 14 },
    });
    const withTiers = normalizeCombatScore(baseScoreData, {
      scrollText: verse,
      weave,
      analyzedDoc,
      scholomance: { BAPO: 12, CODEX: 18, VALCH: 14 },
    });

    expect(withTiers.compendiumMultiplier).toBeGreaterThanOrEqual(1);
    expect(withTiers.tierBreakdown?.length).toBeGreaterThan(0);
    expect(withTiers.damage).toBeGreaterThanOrEqual(without.damage);
  });

  it('maps inverted weave to reduced grammar factor for rarity', () => {
    const bridge = {
      collapsed: false,
      clauses: [{ legality: 'inverted' }],
    };
    expect(computeGrammarFactor(bridge, 'LEXICAL_RARITY')).toBe(0.25);
  });
});