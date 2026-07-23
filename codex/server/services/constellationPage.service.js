import { resolveQueryIdentity } from '../../core/constellation/queryIdentity.js';
import { analyzePhraseStructure } from '../../core/constellation/phraseAnalysis.js';
import { computePageBytecode } from '../../core/constellation/pageBytecode.js';
import { analyzeLeximancy, LEXIMANCY_ADAPTER_VERSION } from './constellation/leximancy.adapter.js';
import { analyzeRhyme, RHYME_ADAPTER_VERSION } from './constellation/rhymeAstrology.adapter.js';
import { analyzeGenome, GENOME_ADAPTER_VERSION } from './constellation/genome.adapter.js';
import {
  analyzeSemanticInquiry,
  SEMANTIC_ADAPTER_VERSION,
} from './constellation/semanticInquiry.adapter.js';

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

  /**
   * Semantic inquiry runs AFTER leximancy because it adjudicates leximancy's own
   * candidate list. It can only ever replace a heuristic sense pick with an
   * evidenced one — see analyzeSemanticInquiry's gate.
   */
  let semanticInquiry = null;
  try {
    semanticInquiry = await analyzeSemanticInquiry(deps.lexiconAdapter, identity, leximancy, deps.phonology);
  } catch (err) {
    degradedChannels.push('semanticInquiry');
    warnings.push(`semanticInquiry channel failed: ${err.message}`);
  }

  /**
   * A missing pronunciation count is not a quiet nothing. The heteronym check is
   * a REQUIRED observation, so when phonology cannot answer, every sense
   * hypothesis lands underdetermined and the channel silently stops selecting —
   * healthy-looking and completely inert. Say so out loud.
   */
  if (semanticInquiry?.bound && semanticInquiry.distinctPronunciations === null) {
    degradedChannels.push('semanticInquiry.phonology');
    warnings.push('phonology unavailable: heteronym check could not run, so no sense can be evidenced');
  }

  // Apply the probe's selection only when the evidence warranted it. Everything
  // else — eliminated, underdetermined, unmatched — leaves leximancy untouched.
  if (semanticInquiry?.selection?.warranted && semanticInquiry.selection.senseId) {
    leximancy = { ...leximancy, selectedInterpretationId: semanticInquiry.selection.senseId };
  }

  const engineVersions = {
    constellationOS: CONSTELLATION_OS_VERSION,
    leximancy: LEXIMANCY_ADAPTER_VERSION,
    rhymeAstrology: RHYME_ADAPTER_VERSION,
    phraseGenome: GENOME_ADAPTER_VERSION,
    semanticInquiry: SEMANTIC_ADAPTER_VERSION,
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
    /**
     * The probe's verdict travels WITH the page. A reader can see not just which
     * sense was chosen but whether the choice was evidenced, and which
     * hypotheses the evidence killed — PDR §7.3, evidence before explanation.
     */
    semanticInquiry: semanticInquiry
      ? {
          status: semanticInquiry.status,
          bound: semanticInquiry.bound,
          probeId: semanticInquiry.probeId,
          hypotheses: semanticInquiry.hypotheses,
          selection: semanticInquiry.selection,
          evidence: semanticInquiry.evidence,
          /**
           * When a spelling is more than one word, showing BOTH is the answer.
           * `wound` is /wuːnd/ an injury and /waʊnd/ coiled; a bare query carries no
           * syntactic frame to choose between them, so the honest result is the split,
           * not a pick.
           */
          isHeteronym: semanticInquiry.isHeteronym,
          // null when CMU could not answer. Absent is not "one pronunciation".
          distinctPronunciations: semanticInquiry.distinctPronunciations,
          lexicalEntries: semanticInquiry.lexicalEntries,
        }
      : null,
    diagnostics: { degradedChannels, warnings },
    provenance: { engineVersions },
  };
}
