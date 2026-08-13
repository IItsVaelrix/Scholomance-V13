/**
 * THE TREEBANK REGRESSION GATE.
 *
 * `scripts/treebank-report.mjs` prints what the composer scores. Printing is not
 * a check: nothing in this repository fails when coverage drops, so a grammar
 * change that costs three points looks exactly like a grammar change that costs
 * nothing. This is the thing that fails.
 *
 * ─── WHY IT RATCHETS IN BOTH DIRECTIONS ─────────────────────────────────────
 *
 * The inputs are frozen and the composer is deterministic, so this run has
 * exactly one correct answer. A drop is a regression. A rise is a result nobody
 * recorded — and an unrecorded rise leaves the next regression measuring itself
 * against a stale floor. Both are reported, with the direction named, and both
 * are fixed the same way: re-freeze deliberately and say why in the commit.
 *
 *     npm run treebank:gate:freeze
 *
 * ─── WHAT IT REFUSES TO LET YOU BUY ─────────────────────────────────────────
 *
 * Coverage can be raised without parsing anything better, by making the lexicon
 * vaguer until the chart spans on ambiguity. The report already names that
 * number — `parses only because POS was vague` — so it is gated alongside
 * coverage rather than left as a footnote. The oracle-leak rate and the share of
 * failures the diagnoser can categorise are gated for the same reason: an
 * instrument that quietly explains less would otherwise register as progress.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseConllu } from '../../../codex/core/constellation/treebank.js';
import { runTreebank } from '../../../codex/core/constellation/treebank-run.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, '../fixtures/constellation');
const BUDGET_MS = 30_000;

const read = name => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const sha = text => createHash('sha256').update(text).digest('hex');

const conllu = read('treebank-gate.conllu');
const lexiconText = read('treebank-gate-lexicon.json');
const baseline = JSON.parse(read('treebank-gate-baseline.json'));
const antigens = JSON.parse(read('treebank-gate-antigens.json'));

function runGate() {
  return runTreebank({
    records: parseConllu(conllu),
    posMap: new Map(Object.entries(JSON.parse(lexiconText))),
    // The packed parser takes no decision, so a sense source would change
    // nothing here; passing one would freeze an input the run never reads.
    senseMap: null,
    parser: baseline.run.parser,
    maxTokens: baseline.run.maxTokens,
  });
}

/** Names what moved and which way, so the failure message is the diagnosis. */
function describeDrift(actual, expected, higherIsBetter) {
  const entries = [];
  for (const [key, want] of Object.entries(expected)) {
    const got = actual[key];
    if (got === want) continue;
    const better = higherIsBetter[key] ? got > want : got < want;
    entries.push(`${key}: ${want} → ${got} (${better ? 'IMPROVED — re-freeze the baseline' : 'REGRESSED'})`);
  }
  return entries.join('\n  ');
}

describe('treebank regression gate', () => {
  let run;

  beforeAll(() => {
    run = runGate();
  }, BUDGET_MS);

  it('measures the inputs the baseline was frozen against', () => {
    // A gate whose corpus or lexicon drifted is measuring a different question
    // and would report the difference as a parser change.
    expect(sha(conllu), 'treebank-gate.conllu does not match the frozen baseline').toBe(
      baseline.inputs.conlluSha256,
    );
    expect(sha(lexiconText), 'treebank-gate-lexicon.json does not match the frozen baseline').toBe(
      baseline.inputs.lexiconSha256,
    );
    expect(baseline.contract).toBe('SCHOL-TREEBANK-GATE-v1');
  });

  it('analyses the same sentences the baseline analysed', () => {
    // `report.n` is post-filter. If the skip count moves, coverage is a ratio
    // over a different denominator and every other assertion here is void.
    expect({
      sampled: run.sampled,
      analyzed: run.report.n,
      skippedTooLong: run.skippedTooLong,
      droppedThrew: run.droppedThrew,
    }).toEqual(baseline.sample);
  });

  it('holds coverage and containment at or above the frozen baseline', () => {
    const actual = {
      coverage: run.report.coverage,
      containment: run.report.containment,
      parsedBoth: run.report.ablation.bothFine,
      parsedOnlyBecausePosWasVague: run.report.ablation.overGenerated,
      taggingFailure: run.report.ablation.tagging,
      grammarFailure: run.report.ablation.grammar,
    };

    const higherIsBetter = {
      coverage: true,
      containment: true,
      parsedBoth: true,
      // A rise here is coverage bought with vagueness, not with grammar.
      parsedOnlyBecausePosWasVague: false,
      taggingFailure: false,
      grammarFailure: false,
    };

    expect(
      actual,
      `the frozen run moved:\n  ${describeDrift(actual, baseline.metrics, higherIsBetter)}\n` +
        'Re-freeze with `npm run treebank:gate:freeze` and say why in the commit.',
    ).toEqual(baseline.metrics);
  });

  it('reports no relapse of a retired failure shape', () => {
    // A shape that once failed and stopped failing is somebody's repair. This is
    // the assertion that makes the repair permanent rather than merely current,
    // and it is the one a re-freeze cannot wave through: the freezer refuses to
    // record a baseline containing a relapse without an explicit override.
    const back = antigens.retired
      .filter(entry => run.signatures.has(entry.signature))
      .map(entry => `${entry.signature}  (retired ${entry.retiredOn}, was failing ${entry.wasFailing})`);

    expect(
      back,
      `${back.length} retired failure shape(s) are failing again:\n  ${back.join('\n  ')}`,
    ).toEqual([]);
  });

  it('holds every sentence at the outcome the baseline froze', () => {
    // The sharpest form of the check: two sentences can trade places and leave
    // every aggregate level. This names the sentences instead of the rate.
    const outcomes = run.rows.map(row => row.outcome[0]).join('');
    const moved = [];
    for (let i = 0; i < Math.max(outcomes.length, baseline.outcomes.length); i += 1) {
      if (outcomes[i] !== baseline.outcomes[i]) {
        moved.push(`#${i}: ${baseline.outcomes[i] ?? '-'} → ${outcomes[i] ?? '-'}`);
      }
    }
    expect(
      moved,
      `${moved.length} sentence(s) changed outcome (P parsed, L lexical, G grammar, R root):\n  ${moved.join('\n  ')}\n` +
        'Run `node scripts/treebank-graduate.mjs` to see which sentences and what they now do.',
    ).toEqual([]);
  });

  it('holds the failure-shape census the baseline froze', () => {
    // THE WHOLE CENSUS, not its totals. Two shapes can trade counts while both
    // `distinct` and `failing` hold level and no sentence changes outcome — a
    // chart change invisible to every other assertion here.
    const census = {};
    for (const key of [...run.signatures.keys()].sort()) census[key] = run.signatures.get(key);

    const frozen = baseline.signatures.census;
    const moved = [];
    for (const key of new Set([...Object.keys(census), ...Object.keys(frozen)])) {
      if (census[key] !== frozen[key]) {
        moved.push(`${key || '(empty)'}: ${frozen[key] ?? 0} → ${census[key] ?? 0}`);
      }
    }

    expect(
      moved,
      `${moved.length} failure shape(s) changed count:\n  ${moved.join('\n  ')}`,
    ).toEqual([]);
    expect(run.signatures.size).toBe(baseline.signatures.distinct);
  });

  it('keeps the diagnoser explaining as much of the failure set as before', () => {
    const explained = run.report.classifier.withCategory / Math.max(run.report.classifier.failures, 1);
    const frozen = baseline.instrument.withCategory / Math.max(baseline.instrument.failures, 1);
    expect(
      explained,
      'the diagnoser categorises a smaller share of failures than the baseline; ' +
        'it is explaining less, which is not the same as there being less to explain',
    ).toBeGreaterThanOrEqual(frozen - 1e-9);
  });

  it('keeps the gold oracle no dirtier than the baseline', () => {
    // Gold UPOS cannot fully suppress a lexical reading, so the leak is counted.
    // A rising leak means the ablation's "gold" arm is drifting toward the real
    // one, which would flatter the tagging-versus-grammar split.
    const leak = run.oracleLeaks / Math.max(run.oracleTokens, 1);
    const frozen = baseline.instrument.oracleLeaks / Math.max(baseline.instrument.oracleTokens, 1);
    expect(leak).toBeLessThanOrEqual(frozen + 1e-9);
  });

  it('is deterministic, which is what lets a single run be a verdict', () => {
    const second = runGate();
    expect(second.report).toEqual(run.report);
    expect(second.signatures.size).toBe(run.signatures.size);
  }, BUDGET_MS);

  it('stays inside a budget that keeps it runnable on every commit', () => {
    const startedAt = Date.now();
    runGate();
    expect(Date.now() - startedAt).toBeLessThanOrEqual(BUDGET_MS);
  }, BUDGET_MS * 2);
});
