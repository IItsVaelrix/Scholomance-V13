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
import {
  analyzeScaleField,
  SCALE_FIELD_ADAPTER_VERSION,
} from './constellation/scaleField.adapter.js';
import { resolveGovernedPairs } from '../../core/constellation/governor.js';
import { resolveReadings } from '../../core/constellation/readings.js';
import { selectGovernedSense } from '../../core/semantic/governed-sense.js';
import {
  analyzeDiscovery,
  DISCOVERY_ADAPTER_VERSION,
} from './constellation/discovery.adapter.js';

const CONSTELLATION_OS_VERSION = 'phase3-scale-1';

function emptyLeximancy() {
  return { status: 'unsupported', selectedInterpretationId: null, interpretations: [], nearKin: [], counterfield: [], warnings: [], anchor: null };
}

/**
 * @param {string} rawQuery
 * @param {{ lexiconAdapter, rhymeQueryEngine, rhymeLexiconRepo,
 *   lemmaAdapter?, wordnetGraph?, corpusVectors?, scaleOrders?,
 *   phonologyReady?, corpusChecksum?: string|null }} deps
 * @returns {Promise<import('../../../src/hooks/constellation.types.js').ConstellationPagePacket>}
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

  /**
   * One batched POS call so the anchor can be the phrase's nominal head. Without
   * it, rarity alone anchored `the wound healed` on "healed" and the whole page
   * answered the wrong word. Empty Map = no signal, which selectHeadToken reads
   * as "rank by rarity over everything", never as "nothing is a noun".
   */
  let posMap = new Map();
  try {
    const tags = deps.lexiconAdapter.batchLookupPos?.(preliminary.tokens) || {};
    posMap = new Map(Object.entries(tags).map(([w, list]) => [w, Array.isArray(list) ? list : []]));
  } catch {
    // POS lookup is best-effort; head selection degrades to rarity-only.
  }

  // Re-resolve with frequency + POS data for nominal-head selection.
  const identity = resolveQueryIdentity(rawQuery, freqMap, posMap);

  // Full phrase-structure analysis (pure, deterministic).
  const phraseStructure = analyzePhraseStructure(identity, freqMap, posMap);

  /**
   * THE STRUCTURE CHANNEL — competing readings, left standing.
   *
   * Every other channel here answers about ONE token. This one reports what the
   * phrase's specialists each concluded and whether they agree, so a line that
   * is genuinely two-ways-readable is SHOWN to be rather than resolved to
   * whichever cue ran last. `the man saw a comet` is about `man` to
   * subjecthood and `comet` to salience, and both are right about different
   * questions.
   */
  const readings = resolveReadings(identity.tokens, freqMap, posMap);

  const degradedChannels = [];
  const warnings = [];

  let leximancy = emptyLeximancy();
  try {
    leximancy = analyzeLeximancy(deps.lexiconAdapter, identity.primaryContentToken, {
      compounds: phraseStructure.compounds,
      intent: phraseStructure.intent,
    }, deps.lemmaAdapter);
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

  /**
   * TWO WIRES INTO THE SELECTION, BECAUSE THERE ARE TWO KINDS OF EVIDENCE.
   *
   * Gloss overlap is soft lexical evidence and it was, until now, the only thing
   * that could move leximancy's pick. So `a wound` resolved framePos 'n' with
   * viableWordCount 1 — the heteronym settled, the word identified — and still
   * shipped "put in a coil", because the frame had nowhere to write its answer.
   * Correct work, discarded at the last step.
   *
   * A settled frame is HARD syntactic evidence and outranks a rank-1 default. It
   * does not outrank the probe: when the probe is warranted it has read the same
   * frame (the harness restricts candidates to the frame's group) plus gloss
   * evidence on top, so it stays first.
   *
   * `selectedBy` travels with the packet. A reader must be able to tell an
   * evidenced pick from wordnet's rank-1 default, which is exactly the
   * distinction that was invisible while the frame was inert.
   */
  /**
   * RANK-1 IS NOT AN ANSWER FOR A POLYSEME.
   *
   * `selectedBy: 'rank'` means wordnet's first sense was shipped with no
   * evidence behind it. On a word with one sense that is fine. On a polyseme it
   * is a coin toss wearing a verdict's clothes, and it was measurably wrong:
   * `the shadowy wood` shipped "United States film actress (1938-1981)" —
   * Natalie Wood — and `the silent stars burn` shipped a sense whose gloss was
   * the empty string.
   *
   * So an unevidenced pick survives only when there was nothing to choose
   * between. Otherwise the page reports the interpretations and selects none,
   * which is what `ambiguous` already means everywhere else here.
   */
  const UNEVIDENCED_MULTI_SENSE = (leximancy.interpretations || []).length > 1;
  let selectedBy = leximancy.selectedInterpretationId ? 'rank' : null;
  if (selectedBy === 'rank' && UNEVIDENCED_MULTI_SENSE) {
    leximancy = { ...leximancy, selectedInterpretationId: null, status: 'ambiguous' };
    selectedBy = null;
  }
  if (semanticInquiry?.selection?.warranted && semanticInquiry.selection.senseId) {
    leximancy = { ...leximancy, selectedInterpretationId: semanticInquiry.selection.senseId };
    selectedBy = 'probe';
  } else if (semanticInquiry?.framePos && semanticInquiry.viableWordCount === 1) {
    const framed = (leximancy.interpretations || []).find((i) => i.pos === semanticInquiry.framePos);
    if (framed) {
      // Naming a selection while still reporting 'ambiguous' would contradict
      // itself: the frame is what resolved it.
      leximancy = { ...leximancy, selectedInterpretationId: framed.id, status: 'resolved' };
      selectedBy = 'frame';
    }
  }

  /**
   * SCALE FIELD — where the head token sits, and among what.
   *
   * Runs last because it measures against words the other channels have already
   * surfaced: leximancy's kin and relations are the candidate pool, so the
   * ranking is over the page's own vocabulary rather than an arbitrary list.
   *
   * Fully optional. Without the wordnet graph or the corpus vectors it reports
   * a status and no field, because a page that renders every other channel is
   * still a page — this one adds a dimension, it does not gate the answer.
   */
  let scaleField = null;
  let governed = [];
  try {
    if (deps.wordnetGraph) {
      const pool = [
        ...(leximancy.nearKin || []),
        ...(leximancy.counterfield || []),
        ...(leximancy.relations?.akin || []),
        ...(leximancy.relations?.narrower || []),
        ...(identity.tokens || []),
      ];
      scaleField = analyzeScaleField(
        {
          wordnetGraph: deps.wordnetGraph,
          corpusVectors: deps.corpusVectors,
          scaleOrders: deps.scaleOrders,
        },
        identity.primaryContentToken,
        pool,
        /**
         * Readiness is threaded from the caller rather than read off the engine:
         * without cmudict, phonotopography silently falls back to a
         * spelling-derived G2P and the sound ranking becomes an orthographic
         * one — measured, that put `shaded` first for `shadowy` on the shared
         * "shad-" prefix where real phonemes put `murky` first.
         */
        { phonologyReady: deps.phonologyReady === true },
      );
      if (scaleField.warnings?.length) warnings.push(...scaleField.warnings);

      /**
       * THE MODIFIERS GET RESOLVED TOO.
       *
       * Until now the page collapsed a phrase to one head token and every other
       * word went unanswered — `the shadowy wood` reported on `wood` and never
       * asked what `shadowy` meant here. The governor is the noun an attributive
       * adjective is predicated of, and that one word settles the sense:
       * measured, governor extraction was 7/7 and the corpus-affinity pick was
       * right for `shadowy wood` (shade) and `shadowy figure` (indistinctness).
       *
       * It abstains freely. `shadowy dealings` reports insufficient_support
       * rather than choosing off a single co-occurrence, and a near-tie reports
       * `tied` — both are answers about the phrase, unlike silence.
       */
      governed = resolveGovernedPairs(identity.tokens, posMap).map((pair) => {
        const verdict = selectGovernedSense(
          deps.wordnetGraph, deps.corpusVectors, pair.adjective, pair.governor,
        );
        return {
          adjective: pair.adjective,
          governor: pair.governor,
          relation: pair.relation,
          distance: pair.distance,
          senseHead: verdict.head,
          reason: verdict.reason,
          score: verdict.score,
          support: verdict.support,
        };
      });
    }
  } catch (err) {
    degradedChannels.push('scaleField');
    warnings.push(`scaleField channel failed: ${err.message}`);
    scaleField = null;
  }

  /**
   * Discovery (poetic expand → constrain → score → rank) runs only for meta-query
   * intent. Literary / craft / comparison leave discovery null; engine version
   * still ships for deterministic pageBytecode.
   */
  let discovery = null;
  let discoveryDiag = { stage: 'ok', message: null };
  if (identity.intent === 'meta-query') {
    try {
      discoveryDiag.stage = 'parse';
      discovery = await analyzeDiscovery(rawQuery, identity, {
        lexiconAdapter: deps.lexiconAdapter,
        rhymeQueryEngine: deps.rhymeQueryEngine,
        rhymeLexiconRepo: deps.rhymeLexiconRepo,
        phonemeEngine: deps.phonemeEngine,
      });
      discoveryDiag.stage = 'ok';
    } catch (err) {
      degradedChannels.push('discovery');
      warnings.push(`discovery channel failed: ${err.message}`);
      discoveryDiag = { stage: 'expand', message: err.message };
      discovery = null;
    }
  }

  const engineVersions = {
    constellationOS: CONSTELLATION_OS_VERSION,
    leximancy: LEXIMANCY_ADAPTER_VERSION,
    rhymeAstrology: RHYME_ADAPTER_VERSION,
    phraseGenome: GENOME_ADAPTER_VERSION,
    semanticInquiry: SEMANTIC_ADAPTER_VERSION,
    scaleField: SCALE_FIELD_ADAPTER_VERSION,
    discovery: DISCOVERY_ADAPTER_VERSION,
  };

  const pageBytecode = computePageBytecode({
    normalized: identity.normalized,
    kind: identity.kind,
    // PDR §16: parsed intent is part of page identity — the same words under a
    // different intent route different channels and produce a different page.
    intent: identity.intent ?? null,
    engineVersions,
    // Reserved slot (PDR §16): empty until scoring profiles become first-class.
    // Wired now so their arrival re-keys page identity instead of silently not.
    scoringProfiles: {},
    // Corpus identity when the corpus participated; 'corpus:off' inside the hash
    // when it did not. Two pages built against different corpora are different
    // analyses and must not share a bytecode.
    corpusChecksum: deps.corpusChecksum ?? null,
    // Deterministic option flags: which optional channels were measurable.
    // These legitimately change the analysis (a heteronym split only exists
    // when phonology answered; a scale field only when the graph was present).
    flags: {
      phonology: deps.phonologyReady ? 'ready' : 'pending',
      wordnet: deps.wordnetGraph ? 'on' : 'off',
      corpus: deps.corpusVectors ? 'on' : 'off',
      scaleOrders: deps.scaleOrders ? 'on' : 'off',
    },
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
      // 'rarity' | 'last-content' | null — and which cue vetoed each rejected
      // candidate, so a surprising anchor can be traced rather than argued with.
      headDecidedBy: phraseStructure.headDecidedBy ?? null,
      headPool: phraseStructure.headPool ?? [],
      headDemoted: phraseStructure.headDemoted ?? [],
      compounds: phraseStructure.compounds,
      tokenRoles: phraseStructure.tokenRoles,
      devices: phraseStructure.devices,
    },
    leximancy: {
      status: leximancy.status,
      selectedInterpretationId: leximancy.selectedInterpretationId,
      // 'probe' | 'frame' | 'rank' | null — how the pick was earned, if at all.
      selectedBy,
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
          /**
           * The syntactic frame that settled the word, and how many words remain
           * viable after it. `the wound healed` -> framePos n; a bare `wound` ->
           * null, and refusing there is the correct answer, not a shortfall.
           */
          headToken: semanticInquiry.headToken,
          framePos: semanticInquiry.framePos,
          frameCue: semanticInquiry.frameCue,
          viableWordCount: semanticInquiry.viableWordCount,
          lexicalEntries: semanticInquiry.lexicalEntries,
        }
      : null,
    /**
     * Where the head token sits and among what — the four semantic channels
     * composed. `null` when the graph is unavailable, which a reader must take
     * as "not measured" rather than "no field exists".
     */
    scaleField,
    /**
     * Competing analyses of the phrase, with the specialist behind each and
     * whether they disagree. `contested` is a first-class result, not a failure.
     */
    readings: {
      contested: readings.contested,
      primary: readings.primary,
      readings: readings.readings,
      // Specialists that had no jurisdiction here — distinct from having been
      // asked and having nothing to say.
      silent: readings.silent,
    },
    /**
     * Adjective -> the noun it modifies, with the sense that pairing settles.
     * The first channel that answers about a phrase's INTERNAL structure rather
     * than about one token lifted out of it.
     */
    governed,
    /**
     * Discovery channel payload — meta-queries only; null for literary,
     * craft and comparison kinds.
     */
    discovery,
    diagnostics: { degradedChannels, warnings, discovery: discoveryDiag },
    provenance: { engineVersions },
  };
}
