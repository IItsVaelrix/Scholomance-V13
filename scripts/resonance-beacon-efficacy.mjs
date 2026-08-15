#!/usr/bin/env node
/**
 * RESONANCE BEACON EFFICACY
 *
 * Ranking only. Coverage must not move. The question is whether the field
 * picks the gold answer more often than the first projected answer, and
 * whether token beacons match gold UPOS better than taking the first reading.
 *
 *   node scripts/resonance-beacon-efficacy.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { parseConllu, goldAnswer } from '../codex/core/constellation/treebank.js';
import { composePacked, projectAnswers } from '../codex/core/constellation/compose-packed.js';
import { BONDS } from '../codex/core/constellation/compose.js';
import {
  readingScores,
  pickResonantAnswer,
  pickResonantDerivation,
} from '../codex/core/constellation/resonance-beacon.js';

const FIXTURES = path.resolve('tests/qa/fixtures/constellation');
const OUT = 'docs/superpowers/evidence/2026-08-14-resonance-beacon-efficacy.json';
const OUT_MD = 'docs/superpowers/evidence/2026-08-14-resonance-beacon-efficacy.md';

const UPOS = new Map([
  ['NOUN', ['N', 'NC']],
  ['PROPN', ['PROPN', 'N', 'NC']],
  ['VERB', ['V']],
  ['ADJ', ['ADJ']],
  ['ADV', ['ADV']],
  ['DET', ['DET']],
  ['ADP', ['P']],
  ['PRON', ['PRON', 'PRONACC']],
  ['AUX', ['AUX', 'MODAL', 'COP']],
  ['CCONJ', ['CONJ']],
  ['SCONJ', ['SUB']],
  ['PART', ['TO', 'PRT', 'POSS']],
  ['PUNCT', ['PUNCT', 'COMMA']],
]);

const same = (a, b) => (
  String(a?.subject || '').toLowerCase() === String(b?.subject || '').toLowerCase()
  && String(a?.verb || '').toLowerCase() === String(b?.verb || '').toLowerCase()
);

const records = parseConllu(readFileSync(path.join(FIXTURES, 'treebank-gate.conllu'), 'utf8'));
const posMap = new Map(Object.entries(JSON.parse(
  readFileSync(path.join(FIXTURES, 'treebank-gate-lexicon.json'), 'utf8'),
)));
const baseline = JSON.parse(readFileSync(path.join(FIXTURES, 'treebank-gate-baseline.json'), 'utf8'));
const maxTokens = baseline.run.maxTokens;

const tallies = {
  sentences: 0,
  skipped: 0,
  threw: 0,
  parsed: 0,
  contained: 0,
  ambiguous: 0,
  firstCorrect: 0,
  beaconCorrect: 0,
  firstCorrectAmb: 0,
  beaconCorrectAmb: 0,
  tokensScored: 0,
  tokensAmbiguous: 0,
  firstTypeHit: 0,
  beaconTypeHit: 0,
  firstTypeHitAmb: 0,
  beaconTypeHitAmb: 0,
};

for (const record of records) {
  const tokens = record.tokens.map((t) => t.form);
  if (tokens.length > maxTokens) {
    tallies.skipped += 1;
    continue;
  }
  tallies.sentences += 1;
  let chart;
  try {
    chart = composePacked(tokens, posMap);
  } catch {
    tallies.threw += 1;
    continue;
  }
  if (chart.stable.length > 0) tallies.parsed += 1;

  const gold = goldAnswer(record);
  const answerSets = chart.stable.map((node) => projectAnswers(node));
  const allAnswers = answerSets.flat();
  const contained = allAnswers.some((a) => same(a, gold));
  if (contained) tallies.contained += 1;

  const uniqueKeys = new Set(allAnswers.map((a) => `${a.subject ?? ''}|${a.verb ?? ''}`));
  const ambiguous = uniqueKeys.size > 1;
  if (ambiguous) tallies.ambiguous += 1;

  if (allAnswers.length > 0) {
    const first = allAnswers[0];
    const byString = pickResonantAnswer(allAnswers, chart.field, BONDS) || first;
    const byPath = chart.stable[0]
      ? pickResonantDerivation(chart.stable[0], chart.field, BONDS)
      : null;
    const picked = byPath ? byPath.answer : byString;
    if (same(first, gold)) {
      tallies.firstCorrect += 1;
      if (ambiguous) tallies.firstCorrectAmb += 1;
    }
    if (same(picked, gold)) {
      tallies.beaconCorrect += 1;
      if (ambiguous) tallies.beaconCorrectAmb += 1;
    }
  }

  const scores = readingScores(chart.field, BONDS);
  for (let i = 0; i < record.tokens.length; i += 1) {
    const allow = UPOS.get(record.tokens[i].upos);
    if (!allow || !chart.field[i] || chart.field[i].types.length === 0) continue;
    tallies.tokensScored += 1;
    const types = chart.field[i].types;
    const amb = types.length > 1;
    if (amb) tallies.tokensAmbiguous += 1;
    const firstType = types[0];
    const beaconType = (scores[i] || [])[0]?.type;
    if (allow.includes(firstType)) {
      tallies.firstTypeHit += 1;
      if (amb) tallies.firstTypeHitAmb += 1;
    }
    if (beaconType && allow.includes(beaconType)) {
      tallies.beaconTypeHit += 1;
      if (amb) tallies.beaconTypeHitAmb += 1;
    }
  }
}

const ratio = (n, d) => (d === 0 ? null : n / d);
const report = {
  contract: 'PB-RESONANCE-BEACON-EFFICACY-v1',
  sample: {
    sentences: tallies.sentences,
    skipped: tallies.skipped,
    threw: tallies.threw,
    parsed: tallies.parsed,
    contained: tallies.contained,
    ambiguous: tallies.ambiguous,
    tokensScored: tallies.tokensScored,
    tokensAmbiguous: tallies.tokensAmbiguous,
  },
  coverage: ratio(tallies.parsed, tallies.sentences),
  parse: {
    first: ratio(tallies.firstCorrect, tallies.parsed),
    beacon: ratio(tallies.beaconCorrect, tallies.parsed),
    firstAmbiguous: ratio(tallies.firstCorrectAmb, tallies.ambiguous),
    beaconAmbiguous: ratio(tallies.beaconCorrectAmb, tallies.ambiguous),
    deltaAmbiguous: (tallies.beaconCorrectAmb - tallies.firstCorrectAmb),
  },
  token: {
    first: ratio(tallies.firstTypeHit, tallies.tokensScored),
    beacon: ratio(tallies.beaconTypeHit, tallies.tokensScored),
    firstAmbiguous: ratio(tallies.firstTypeHitAmb, tallies.tokensAmbiguous),
    beaconAmbiguous: ratio(tallies.beaconTypeHitAmb, tallies.tokensAmbiguous),
    deltaAmbiguous: tallies.beaconTypeHitAmb - tallies.firstTypeHitAmb,
  },
  tallies,
};

const efficacy = {
  parseImproves: (report.parse.beaconAmbiguous ?? 0) > (report.parse.firstAmbiguous ?? 0),
  tokenImproves: (report.token.beaconAmbiguous ?? 0) > (report.token.firstAmbiguous ?? 0),
  coverageUnchanged: report.coverage != null,
};
report.efficacy = efficacy;

writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

const pct = (x) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`);
const md = `# RESULT — Resonance beacon efficacy

Hermetic gate fixture, packed parser, ranking only.

| Slice | n | First | Beacon | Δ |
|---|---|---|---|---|
| Parsed sentences, gold answer picked | ${tallies.parsed} | ${pct(report.parse.first)} | ${pct(report.parse.beacon)} | ${tallies.beaconCorrect - tallies.firstCorrect} |
| Ambiguous parsed (\\>1 distinct answer) | ${tallies.ambiguous} | ${pct(report.parse.firstAmbiguous)} | ${pct(report.parse.beaconAmbiguous)} | ${tallies.beaconCorrectAmb - tallies.firstCorrectAmb} |
| Tokens with a gold UPOS we can score | ${tallies.tokensScored} | ${pct(report.token.first)} | ${pct(report.token.beacon)} | ${tallies.beaconTypeHit - tallies.firstTypeHit} |
| Ambiguous tokens (\\>1 emitted type) | ${tallies.tokensAmbiguous} | ${pct(report.token.firstAmbiguous)} | ${pct(report.token.beaconAmbiguous)} | ${tallies.beaconTypeHitAmb - tallies.firstTypeHitAmb} |

Coverage (spans as S): **${pct(report.coverage)}** of ${tallies.sentences} analysed sentences. Threw: ${tallies.threw}.

**Parse ranking helps on ties: ${efficacy.parseImproves ? 'YES' : 'NO'}**
**Token reading helps on ties: ${efficacy.tokenImproves ? 'YES' : 'NO'}**
`;

writeFileSync(OUT_MD, md);
console.log(md);
console.log(`wrote ${OUT}`);
