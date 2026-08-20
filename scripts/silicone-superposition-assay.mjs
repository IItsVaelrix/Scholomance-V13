#!/usr/bin/env node
/**
 * ASSAY: purify frozen silicone by superposition + collapse
 *
 * Prereg: COLLAPSE_MARGIN = 1.5 (frozen in the module). Weights are
 * seeking × 1/((1+dist)(1+width)). Gold does not enter the weight.
 *
 * Held-out: EWT-test, ≤20 tokens, skip texts seen on the minting gate.
 * One treatment compose per sentence, measured raw then purified.
 *
 * Falsifiers:
 *   F1  purified false-attach rate ≥ raw false-attach rate
 *   F2  purified containment < baseline containment
 *   F3  no locus collapses
 *   F4  purified parse count < baseline parse count
 *
 *   node scripts/silicone-superposition-assay.mjs
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { BONDS } from '../codex/core/constellation/compose.js';
import { composePacked, projectAnswers } from '../codex/core/constellation/compose-packed.js';
import { goldAnswer, parseConllu } from '../codex/core/constellation/treebank.js';
import { goldByIndex, goldLinksBetween } from '../codex/core/constellation/grimoire/construction-families.js';
import {
  FROZEN_EPITOPE_SILICONE,
  signatureOfBond,
} from '../codex/core/constellation/epitope-silicone.js';
import {
  COLLAPSE_MARGIN,
  purifySilicone,
} from '../codex/core/constellation/silicone-superposition.js';
import { loadPosMap, loadSplit } from './lib/constellation-corpus.mjs';

const EVIDENCE = path.resolve('docs/superpowers/evidence/2026-08-15-silicone-superposition.json');
const MAX = 20;
const WANT = new Set(FROZEN_EPITOPE_SILICONE.bonds.map(signatureOfBond));
const TREATMENT = Object.freeze([...BONDS, ...FROZEN_EPITOPE_SILICONE.bonds]);

function sha256Hex(data) {
  return createHash('sha256').update(JSON.stringify(data), 'utf8').digest('hex');
}

function same(a, b) {
  return String(a || '').toLowerCase() === String(b || '').toLowerCase();
}

function contained(chart, gold) {
  if (!gold?.verb) return false;
  const answers = (chart.stable || []).flatMap((s) => projectAnswers(s));
  if (gold.subject) {
    return answers.some((a) => same(a.verb, gold.verb) && same(a.subject, gold.subject));
  }
  return answers.some((a) => same(a.verb, gold.verb));
}

function top1(chart, gold) {
  if (!gold?.verb || !(chart.ranked || []).length) return false;
  return projectAnswers(chart.ranked[0].molecule).some((a) => same(a.verb, gold.verb));
}

function firings(chart) {
  const rows = [];
  for (const node of chart.molecules || []) {
    for (const d of node.derivations || []) {
      if (!d.bond) continue;
      const sig = `${d.bond[0]}|${d.bond[1]}|${d.bond[2]}`;
      if (!WANT.has(sig)) continue;
      rows.push({
        sig,
        leftFrom: d.left?.from,
        leftTo: d.left?.to,
        rightFrom: d.right?.from,
        rightTo: d.right?.to,
      });
    }
  }
  return rows;
}

function golded(gold, row) {
  if (!Number.isInteger(row.leftFrom) || !Number.isInteger(row.rightFrom)) return false;
  return goldLinksBetween(gold, row.leftFrom, row.leftTo, row.rightFrom, row.rightTo).length >= 1;
}

function scoreFirings(chart, gold) {
  const hits = firings(chart);
  let g = 0;
  const per = Object.create(null);
  for (const hit of hits) {
    const ok = golded(gold, hit);
    if (ok) g += 1;
    const row = per[hit.sig] || { firings: 0, golded: 0 };
    row.firings += 1;
    if (ok) row.golded += 1;
    per[hit.sig] = row;
  }
  return { n: hits.length, golded: g, falseAttach: hits.length - g, per };
}

const gateTexts = new Set(
  parseConllu(readFileSync('tests/qa/fixtures/constellation/treebank-gate.conllu', 'utf8'))
    .map((r) => (r.tokens || []).map((t) => t.form).join(' ')),
);

process.stderr.write('loading EWT-test…\n');
const posMap = loadPosMap();
const records = loadSplit('test').filter((r) => {
  const n = (r.tokens || []).length;
  return n > 0 && n <= MAX;
});

const started = Date.now();
const tally = {
  n: 0,
  threw: 0,
  baseParsed: 0,
  rawParsed: 0,
  pureParsed: 0,
  baseContain: 0,
  rawContain: 0,
  pureContain: 0,
  baseTop1: 0,
  rawTop1: 0,
  pureTop1: 0,
  rawFire: 0,
  rawGold: 0,
  pureFire: 0,
  pureGold: 0,
  loci: 0,
  collapsed: 0,
  dropped: 0,
  rawPer: Object.create(null),
  purePer: Object.create(null),
};

function addPer(dest, per) {
  for (const [sig, row] of Object.entries(per)) {
    const cur = dest[sig] || { firings: 0, golded: 0 };
    cur.firings += row.firings;
    cur.golded += row.golded;
    dest[sig] = cur;
  }
}

for (let i = 0; i < records.length; i += 1) {
  const rec = records[i];
  const tokens = rec.tokens.map((t) => t.form);
  if (gateTexts.has(tokens.join(' '))) continue;
  const goldIdx = goldByIndex(rec);
  const gold = goldAnswer(rec);
  let base;
  let treat;
  try {
    base = composePacked(tokens, posMap, {});
    treat = composePacked(tokens, posMap, { bonds: TREATMENT });
  } catch {
    tally.threw += 1;
    continue;
  }
  tally.n += 1;
  if ((base.stable || []).length) tally.baseParsed += 1;
  if ((treat.stable || []).length) tally.rawParsed += 1;
  if (contained(base, gold)) tally.baseContain += 1;
  if (contained(treat, gold)) tally.rawContain += 1;
  if (top1(base, gold)) tally.baseTop1 += 1;
  if (top1(treat, gold)) tally.rawTop1 += 1;
  const before = scoreFirings(treat, goldIdx);
  tally.rawFire += before.n;
  tally.rawGold += before.golded;
  addPer(tally.rawPer, before.per);

  const receipt = purifySilicone(treat);
  tally.loci += receipt.loci;
  tally.collapsed += receipt.collapsed;
  tally.dropped += receipt.dropped;

  if ((treat.stable || []).length) tally.pureParsed += 1;
  if (contained(treat, gold)) tally.pureContain += 1;
  if (top1(treat, gold)) tally.pureTop1 += 1;
  const after = scoreFirings(treat, goldIdx);
  tally.pureFire += after.n;
  tally.pureGold += after.golded;
  addPer(tally.purePer, after.per);

  if ((i + 1) % 150 === 0 || i + 1 === records.length) {
    process.stderr.write(`  ${i + 1}/${records.length}  n=${tally.n}  collapsed=${tally.collapsed}\n`);
  }
}

function rate(n, d) {
  return d ? Number((n / d).toFixed(4)) : 0;
}

const rawFa = rate(tally.rawFire - tally.rawGold, tally.rawFire);
const pureFa = rate(tally.pureFire - tally.pureGold, tally.pureFire);

const falsifiers = {
  F1_falseAttachDidNotDrop: pureFa >= rawFa,
  F2_containmentBelowBaseline: tally.pureContain < tally.baseContain,
  F3_nothingCollapsed: tally.collapsed === 0,
  F4_parseBelowBaseline: tally.pureParsed < tally.baseParsed,
};

const killed = Object.values(falsifiers).filter(Boolean).length;
const verdict = killed === 0
  ? 'PURIFIED — collapse cut false attachments without falling below baseline parse or containment'
  : `FAILS — ${killed}/4 falsifiers fired; superposition is not yet a purifier`;

const report = {
  contract: 'PB-SILICONE-SUPERPOSITION-ASSAY-v1',
  margin: COLLAPSE_MARGIN,
  elapsedMs: Date.now() - started,
  n: tally.n,
  threw: tally.threw,
  parsed: {
    baseline: tally.baseParsed,
    raw: tally.rawParsed,
    purified: tally.pureParsed,
  },
  gold: {
    containBase: tally.baseContain,
    containRaw: tally.rawContain,
    containPure: tally.pureContain,
    top1Base: tally.baseTop1,
    top1Raw: tally.rawTop1,
    top1Pure: tally.pureTop1,
  },
  collapse: {
    loci: tally.loci,
    collapsed: tally.collapsed,
    dropped: tally.dropped,
    collapseRate: rate(tally.collapsed, tally.loci),
  },
  firings: {
    raw: tally.rawFire,
    rawGolded: tally.rawGold,
    rawFalseAttach: rawFa,
    pure: tally.pureFire,
    pureGolded: tally.pureGold,
    pureFalseAttach: pureFa,
    rawPer: tally.rawPer,
    purePer: tally.purePer,
  },
  falsifiers,
  verdict,
};

report.checksum = `silicone-superposition-v1:${sha256Hex({
  margin: COLLAPSE_MARGIN,
  parsed: report.parsed,
  gold: report.gold,
  collapse: report.collapse,
  firings: {
    raw: tally.rawFire, rawGold: tally.rawGold, pure: tally.pureFire, pureGold: tally.pureGold,
  },
  falsifiers,
  verdict,
})}`;

writeFileSync(EVIDENCE, `${JSON.stringify(report, null, 2)}\n`);

console.log('SILICONE SUPERPOSITION — purify frozen attachments');
console.log(`  n=${tally.n}  margin=${COLLAPSE_MARGIN}`);
console.log(`  loci=${tally.loci}  collapsed=${tally.collapsed}  dropped=${tally.dropped}  rate=${rate(tally.collapsed, tally.loci)}`);
console.log('\nPARSED');
console.log(`  baseline ${tally.baseParsed}  raw ${tally.rawParsed}  purified ${tally.pureParsed}`);
console.log('\nGOLD');
console.log(`  contain  base ${tally.baseContain}  raw ${tally.rawContain}  pure ${tally.pureContain}`);
console.log(`  top-1    base ${tally.baseTop1}  raw ${tally.rawTop1}  pure ${tally.pureTop1}`);
console.log('\nFIRINGS');
console.log(`  raw   ${tally.rawFire}  golded ${tally.rawGold}  FA ${rawFa}`);
console.log(`  pure  ${tally.pureFire}  golded ${tally.pureGold}  FA ${pureFa}`);
for (const sig of [...WANT]) {
  const a = tally.rawPer[sig] || { firings: 0, golded: 0 };
  const b = tally.purePer[sig] || { firings: 0, golded: 0 };
  console.log(`  ${sig.padEnd(16)} ${String(a.firings).padStart(5)}→${String(b.firings).padStart(5)}  golded ${a.golded}→${b.golded}`);
}
console.log('\nFALSIFIERS');
console.log(`  F1 FA did not drop:          ${falsifiers.F1_falseAttachDidNotDrop}   (${rawFa} → ${pureFa})`);
console.log(`  F2 containment < baseline:   ${falsifiers.F2_containmentBelowBaseline}   (${tally.pureContain} vs ${tally.baseContain})`);
console.log(`  F3 nothing collapsed:        ${falsifiers.F3_nothingCollapsed}`);
console.log(`  F4 parse < baseline:         ${falsifiers.F4_parseBelowBaseline}   (${tally.pureParsed} vs ${tally.baseParsed})`);
console.log(`\nVERDICT: ${verdict}`);
console.log(`evidence: ${EVIDENCE}`);
console.log(`checksum: ${report.checksum}`);
