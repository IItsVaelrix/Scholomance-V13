/**
 * RUNNING THE COMPOSER OVER A TREEBANK, ONCE, FOR ANY CALLER.
 *
 * `scripts/treebank-report.mjs` owned this loop and printed it. A regression
 * gate needs the same numbers as data rather than as stdout, and two
 * implementations of "what coverage means" would be two answers to one
 * question. So the loop lives here and the script prints what it returns.
 *
 * This module reads no files and no clock: the corpus, the lexicon, and the
 * sample are all supplied. That is what lets a gate freeze them.
 */

import { goldAnswer, goldPosMap } from './treebank.js';
import { diagnose, frontierSignature, OUTCOME } from './failure-diagnosis.js';
import { summarize } from './treebank-metrics.js';
import { compose, projectAnswer, rankByAttraction, guessPos } from './compose.js';
import { composePacked, projectAnswers } from './compose-packed.js';
import { nominalRootAnswer } from './np-anchor.js';
import { pickResonantDerivation } from './resonance-beacon.js';
import { irregularPos } from '../lexical-analysis/irregular-forms.js';
import { tokenize } from '../tokenizer.js';

/** UPOS values that name a lexical category; anything else is not one. */
const LEXICAL_UPOS = new Set(['NOUN', 'PROPN', 'VERB', 'ADJ', 'ADV']);

const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

/**
 * Composes every record and aggregates the run.
 *
 * @param {object} options
 * @param {Array<object>} options.records   parsed CoNLL-U records, already sliced to the sample
 * @param {Map<string, string[]>} options.posMap  the lexical POS table under test
 * @param {Map<string, object>|null} [options.senseMap] sense counts; without it no decision is taken
 * @param {'classic'|'packed'} [options.parser]  default `packed`. `classic`
 *   is unpacked enumeration — opt in only when you need every tree.
 * @param {number} [options.maxTokens]      sentences longer than this are skipped before compose
 * @returns {object} the summarized report plus every count the report cannot hold
 */
export function runTreebank({
  records,
  posMap,
  senseMap = null,
  parser = 'packed',
  maxTokens = 28,
  options = {},
}) {
  let tokenizerAgree = 0;
  let tokenizerTotal = 0;
  let oracleLeaks = 0;
  let oracleTokens = 0;
  let skippedTooLong = 0;
  let droppedThrew = 0;
  const signatures = new Map();

  const rows = (records || []).map((record) => {
    const tokens = record.tokens.map((t) => t.form);

    /**
     * Packed composition is bounded; classic enumeration is not. Skip BEFORE
     * calling either parser rather than hang, and count the skip — `report.n`
     * is already post-filter, so an uncounted skip would silently narrow what
     * "coverage" means.
     */
    if (tokens.length > maxTokens) {
      skippedTooLong += 1;
      return null;
    }

    const gold = goldAnswer(record);
    const goldMap = goldPosMap(record);

    /**
     * ORACLE IMPURITY. An empty POS entry does not stop `atomsFor` falling
     * through to `irregularPos` and `guessPos`, so gold UPOS cannot fully
     * suppress a lexical reading. `during` ends in `-ing` and `several` in `-al`;
     * both pick up a lexical atom gold forbids. Claiming a clean oracle would be
     * a check that cannot fail, so the leak is counted and returned instead.
     */
    for (const t of record.tokens) {
      oracleTokens += 1;
      if (LEXICAL_UPOS.has(t.upos)) continue;
      const lower = String(t.form).toLowerCase();
      if (irregularPos(lower).length > 0 || guessPos(lower).length > 0) oracleLeaks += 1;
    }

    let result;
    let goldResult;
    try {
      result = parser === 'packed' ? composePacked(tokens, posMap, options) : compose(tokens, posMap, options);
      goldResult = parser === 'packed' ? composePacked(tokens, goldMap, options) : compose(tokens, goldMap, options);
    } catch {
      droppedThrew += 1;
      return null;
    }

    const answers = parser === 'packed'
      ? result.stable.flatMap((s) => projectAnswers(s))
      // Wrapped, not point-free: `projectAnswer` takes an optional bond table as
      // its second argument, and `Array.map` would hand it the element INDEX.
      : result.stable.map((s) => projectAnswer(s));
    const contained = answers.some((a) => same(a.subject, gold.subject) && same(a.verb, gold.verb));

    /**
     * Decision is a ranking, never a prune. The beacon field is always present
     * on a successful compose. Attraction ranking still wins when a sense map
     * was supplied on the classic chart — that is a different signal, and the
     * caller asked for it. Otherwise the field picks. Packed nodes stand for
     * many answers; pickResonantDerivation scores those derivations with
     * span and head still attached. It does not score {subject, verb} strings.
     */
    let decided = null;
    let answer = null;
    if (result.stable.length > 0) {
      if (parser === 'classic' && senseMap) {
        const ranked = rankByAttraction(result.stable, senseMap);
        answer = ranked.length > 0 ? projectAnswer(ranked[0].molecule) : null;
      } else if (result.ranked && result.ranked.length > 0) {
        const top = result.ranked[0].molecule;
        if (parser === 'packed') {
          const picked = pickResonantDerivation(top, result.field, options.bonds);
          answer = picked ? picked.answer : null;
        } else {
          answer = projectAnswer(top);
        }
      }
    }

    /**
     * NOMINAL ROOT FALLBACK — the branch `stable` can never reach.
     *
     * `ranked` is `rankByResonance(stable, ...)` and the CLAUSAL doorway filters
     * `stable` to `S`, so a sentence with a NOMINAL root — 43% of this corpus —
     * arrives here with `stable` EMPTY. Every block above is skipped, `decided`
     * stays null, and the run records "the parser did not answer" about a sentence
     * the chart composed perfectly well: `spanning` holds the full-span nominal and
     * the bond table already declared its head. `nominalRootAnswer` reads that head.
     *
     * This changes what the parser REPORTS, never what it ACCEPTS. `stable` is not
     * touched, so `coverage`, `containment` and the failure taxonomy are unmoved —
     * only `decided` moves, which is the endpoint that means "the parser answered".
     *
     * Measured on held-out `en_ewt-ud-test` (500 sentences, product lexicon, no gold
     * POS): right answers 56 -> 116, +60/-0. Answer rate 16.2% -> 35.0% at 69.1% ->
     * 66.3% precision. The same trigger with `lastTaggedNoun` instead of the chart's
     * head scores 95, so the chart earns the difference (+25/-4, chi2cc 13.8).
     */
    if (!answer && parser === 'packed') {
      answer = nominalRootAnswer(result, tokens.length);
    }

    if (answer) {
      decided = Boolean(same(answer.subject, gold.subject) && same(answer.verb, gold.verb));
    }

    const d = diagnose(record, result, goldResult);

    if (d.outcome !== OUTCOME.PARSED) {
      // Same signature the off-gold Gutenberg path would produce, recorded here
      // so the two can be matched later. Unnamed on purpose.
      const sig = frontierSignature(result, tokens.length);
      signatures.set(sig, (signatures.get(sig) || 0) + 1);
    }

    const rootToken = record.tokens.find((t) => t.head === 0);
    tokenizerTotal += 1;
    if (record.text && tokenize(record.text).length === tokens.length) tokenizerAgree += 1;

    return {
      outcome: d.outcome,
      overGenerated: d.overGenerated,
      categories: d.categories,
      nonProjective: d.nonProjective,
      rootUpos: rootToken ? rootToken.upos : 'NONE',
      contained,
      decided,
    };
  }).filter(Boolean);

  return {
    report: summarize(rows),
    // The scored rows themselves. Aggregates say a point moved; only the rows
    // say WHICH sentence moved, which is the difference between a number to
    // argue about and a regression to read.
    rows,
    sampled: (records || []).length,
    skippedTooLong,
    droppedThrew,
    oracleLeaks,
    oracleTokens,
    tokenizerAgree,
    tokenizerTotal,
    signatures,
  };
}
