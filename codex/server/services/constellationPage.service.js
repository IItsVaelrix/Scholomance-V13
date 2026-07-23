import { resolveQueryIdentity } from '../../core/constellation/queryIdentity.js';
import { analyzePhraseStructure } from '../../core/constellation/phraseAnalysis.js';
import { computePageBytecode } from '../../core/constellation/pageBytecode.js';
import { analyzeLeximancy, LEXIMANCY_ADAPTER_VERSION } from './constellation/leximancy.adapter.js';
import { analyzeRhyme, RHYME_ADAPTER_VERSION } from './constellation/rhymeAstrology.adapter.js';
import { analyzeGenome, GENOME_ADAPTER_VERSION } from './constellation/genome.adapter.js';

const CONSTELLATION_OS_VERSION = 'phase2-phrase-1';

function emptyLeximancy() {
  return { status: 'unsupported', selectedInterpretationId: null, interpretations: [], nearKin: [], counterfield: [], warnings: [], anchor: null };
}

/**
 * @param {string} rawQuery
 * @param {{ lexiconAdapter, rhymeQueryEngine, rhymeLexiconRepo }} deps
 * @returns {Promise<import('../../../src/pages/Constellation/types.js').ConstellationPhase1Packet>}
 */
export async function buildConstellationPage(rawQuery, deps) {
  // ── Phase 2: Phrase Analysis ──────────────────────────────────────
  // Fetch corpus frequencies for all tokens so the head-token selector
  // can apply the PDR §3.2 "rarest/last content word" rule.
  const preliminary = resolveQueryIdentity(rawQuery);
  let freqMap = new Map();
  try {
    freqMap = deps.lexiconAdapter.getCorpusFrequencies?.(preliminary.tokens) || new Map();
  } catch {
    // Frequency lookup is best-effort; fall back to last-content-token.
  }

  // Re-resolve with frequency data for rarest-token head selection.
  const identity = resolveQueryIdentity(rawQuery, freqMap);

  // Full phrase-structure analysis (pure, deterministic).
  const phraseStructure = analyzePhraseStructure(identity, freqMap);

  const degradedChannels = [];
  const warnings = [];

  let leximancy = emptyLeximancy();
  try {
    leximancy = analyzeLeximancy(deps.lexiconAdapter, identity.primaryContentToken, {
      compounds: phraseStructure.compounds,
      intent: phraseStructure.intent,
    });
  } catch (err) {
    degradedChannels.push('leximancy');
    warnings.push(`leximancy channel failed: ${err.message}`);
  }

  if (leximancy.relationsFailed) {
    degradedChannels.push('leximancy.relations');
    warnings.push('leximancy relations lookup failed');
  }

  let rhyme = null;
  try {
    rhyme = await analyzeRhyme(deps.rhymeQueryEngine, deps.rhymeLexiconRepo, identity);
  } catch (err) {
    degradedChannels.push('rhymeAstrology');
    warnings.push(`rhymeAstrology channel failed: ${err.message}`);
  }

  let genome = { syllables: 0, devicesHint: [], schoolHint: null };
  try {
    genome = analyzeGenome(rhyme, identity);
  } catch (err) {
    degradedChannels.push('phraseGenome');
    warnings.push(`phraseGenome channel failed: ${err.message}`);
  }

  const engineVersions = {
    constellationOS: CONSTELLATION_OS_VERSION,
    leximancy: LEXIMANCY_ADAPTER_VERSION,
    rhymeAstrology: RHYME_ADAPTER_VERSION,
    phraseGenome: GENOME_ADAPTER_VERSION,
  };

  const pageBytecode = computePageBytecode({
    normalized: identity.normalized,
    kind: identity.kind,
    engineVersions,
  });

  return {
    version: 2,
    schema_id: 'scholomance/constellation-os-page-phase2',
    pageBytecode,
    query: {
      raw: identity.raw,
      normalized: identity.normalized,
      kind: identity.kind,
      tokenCount: identity.tokenCount,
      graphemeCount: identity.graphemeCount,
      intent: identity.intent,
    },
    phraseStructure: {
      intent: phraseStructure.intent,
      headToken: phraseStructure.headToken,
      compounds: phraseStructure.compounds,
      tokenRoles: phraseStructure.tokenRoles,
      devices: phraseStructure.devices,
    },
    leximancy: {
      status: leximancy.status,
      selectedInterpretationId: leximancy.selectedInterpretationId,
      interpretations: leximancy.interpretations,
      warnings: leximancy.warnings,
      nearKin: leximancy.nearKin,
      counterfield: leximancy.counterfield,
      etymology: leximancy.etymology ?? null,
      rarity: leximancy.rarity ?? null,
      relations: leximancy.relations ?? { broader: [], narrower: [], akin: [] },
      anchor: leximancy.anchor ?? null,
      lookupToken: leximancy.lookupToken ?? null,
      compoundUsed: leximancy.compoundUsed ?? null,
    },
    rhymeAstrology: rhyme
      ? {
          phonemes: rhyme.phonemes,
          stress: rhyme.stress,
          cadenceFamily: rhyme.cadenceFamily,
          exactRhymes: rhyme.exactRhymes,
          slantRhymes: rhyme.slantRhymes,
          dominantVowelFamily: rhyme.dominantVowelFamily,
          ipa: leximancy.ipa ?? null,
        }
      : null,
    phraseGenome: {
      syllables: genome.syllables,
      devicesHint: genome.devicesHint,
      schoolHint: genome.schoolHint,
    },
    diagnostics: { degradedChannels, warnings },
    provenance: { engineVersions },
  };
}
