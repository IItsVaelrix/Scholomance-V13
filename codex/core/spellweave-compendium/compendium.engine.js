import {
  aggregateCompendiumMultiplier,
  COMPENDIUM_VERSION,
  createTierReadout,
  formatCompendiumCounselLine,
} from './compendium.schema.js';
import { computeGrammarFactor, computeVerbosityPenalty } from './compendium.grammar-gate.js';
import { computeStatFactor, readStat } from './compendium.stat-gate.js';
import { tokenizeVerse } from './compendium.tokens.js';
import { detectChemicalTier } from './chemical-reactions.registry.js';
import { detectDiscoveryTier } from './discovery.registry.js';
import { detectElementalTier } from './elemental.registry.js';
import { detectEmotionTier } from './emotion.registry.js';
import { detectLexicalRarityTier } from './lexical-rarity.registry.js';
import { detectMythTier } from './myth.registry.js';
import { detectPsychologyTier } from './psychology.registry.js';
import { detectSonicTier } from './sonic.registry.js';

const DETECTORS = [
  detectElementalTier,
  detectEmotionTier,
  detectLexicalRarityTier,
  detectChemicalTier,
  detectPsychologyTier,
  detectSonicTier,
  detectMythTier,
  detectDiscoveryTier,
];

/**
 * @param {object|null|undefined} verseIRAmplifier
 */
function buildVerseIRClaimBitmap(verseIRAmplifier) {
  const traces = verseIRAmplifier?.traces || verseIRAmplifier?.explainTrace || [];
  const bitmap = new Set();
  for (const trace of traces) {
    const id = String(trace?.id || trace?.pluginId || '').toLowerCase();
    if (id.includes('rare')) bitmap.add('LEXICAL_RARITY');
    if (id.includes('lexical')) bitmap.add('LEXICAL_RARITY');
  }
  return bitmap;
}

/**
 * Apply residual-only dedupe against VerseIR lexical claims.
 *
 * @param {object} readout
 * @param {Set<string>} claimBitmap
 */
function applyVerseIRDedupe(readout, claimBitmap) {
  if (!readout || readout.tierId !== 'LEXICAL_RARITY') return readout;
  if (!claimBitmap.has('LEXICAL_RARITY')) return readout;
  return {
    ...readout,
    amplifier: Math.max(0, readout.amplifier * 0.45),
    counsel: `${readout.counsel} (residual compendium read)`,
  };
}

/**
 * @param {object} params
 */
export function calculateCompendiumAmplification({
  verse = '',
  weave = '',
  bridge = null,
  scholomance = null,
  syntacticalChess = null,
  encounter = null,
  verseIRAmplifier = null,
  usedEntryIds = [],
  unlockedEntryIds = [],
  discoveredEntryIds = [],
} = {}) {
  const verseTokens = tokenizeVerse(verse);
  const verbosityPenalty = computeVerbosityPenalty(syntacticalChess);
  const syntaxShape = syntacticalChess?.syntaxShape
    || syntacticalChess?.matchedSyntaxWeaknesses?.[0]
    || null;
  const claimBitmap = buildVerseIRClaimBitmap(verseIRAmplifier);

  const sharedCtx = {
    verse,
    weave,
    verseTokens,
    bridge,
    dominantSchool: bridge?.school || null,
    grammarFactor: 1,
    statFactor: 1,
    verbosityPenalty,
    syntaxShape,
    valch: readStat(scholomance, 'VALCH'),
    psych: readStat(scholomance, 'PSYCH'),
    sonic: readStat(scholomance, 'SONIC'),
    bapo: readStat(scholomance, 'BAPO'),
    codex: readStat(scholomance, 'CODEX'),
    ksyn: readStat(scholomance, 'KSYN'),
    myth: readStat(scholomance, 'MYTH'),
    cinf: readStat(scholomance, 'CINF'),
    discovery: readStat(scholomance, 'DISCOVERY'),
    encounterMythWeight: Number(encounter?.mythWeight) || 0,
    usedEntryIds,
    unlockedEntryIds,
  };

  const tierBreakdown = [];
  const newlyDiscoveredEntryIds = [];

  for (const detect of DETECTORS) {
    const probe = detect({ ...sharedCtx, grammarFactor: 1, statFactor: 1 });
    if (!probe) continue;

    const grammarFactor = computeGrammarFactor(bridge, probe.tierId);
    const statFactor = computeStatFactor(scholomance, probe.tierId, { valchMin: 10 });
    const raw = detect({
      ...sharedCtx,
      grammarFactor,
      statFactor,
    });
    if (!raw || raw.amplifier <= 0) continue;

    const deduped = applyVerseIRDedupe(raw, claimBitmap);
    const discovered = deduped.entryId
      ? !discoveredEntryIds.includes(deduped.entryId)
      : false;
    if (discovered && deduped.entryId) {
      newlyDiscoveredEntryIds.push(deduped.entryId);
    }

    tierBreakdown.push(createTierReadout({
      ...deduped,
      discovered,
    }));
  }

  tierBreakdown.sort((a, b) => b.amplifier - a.amplifier);

  const compendiumMultiplier = aggregateCompendiumMultiplier(tierBreakdown);
  const counselLines = tierBreakdown
    .slice(0, 3)
    .map((entry) => formatCompendiumCounselLine(entry));

  return {
    compendiumVersion: COMPENDIUM_VERSION,
    tierBreakdown,
    compendiumMultiplier,
    counselLines,
    newlyDiscoveredEntryIds,
  };
}