/**
 * BOND ABLATION — what does one *active* law actually contribute?
 *
 * The gap/hint reactors only ever ask the additive question: baseline + one
 * candidate. Bonds promoted in a batch never get asked the subtractive one, so a
 * bond with zero individual effect rides in on the batch's aggregate gain. Three
 * of the seven nuclei promoted on 2026-08-08 had Δ0 coverage and Δ0 root on TEST
 * and nobody noticed, because the batch as a whole gained.
 *
 * Two instruments here:
 *
 *   1. STRUCTURAL — `deadEndBonds`. A bond whose result type no bond consumes
 *      and no lift chain carries to `S` cannot change coverage or the answer
 *      ensemble, ever. This costs nothing to check and needs no corpus.
 *   2. MEASURED — leave-one-out (and add-one) over DEV and TEST.
 *
 * Usage:
 *   node scripts/bond-ablation.mjs                       # structural report + ablate dead ends
 *   node scripts/bond-ablation.mjs CONJ ADJ CONJADJ 1    # ablate one bond
 *   node scripts/bond-ablation.mjs --drop CONJ,ADJ,CONJADJ,1 --add ADJ,CONJADJ,ADJ,0
 *   node scripts/bond-ablation.mjs --all                 # leave-one-out sweep (slow)
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { BONDS, LIFTS } from '../codex/core/constellation/compose.js';
import { constructionByBond } from '../codex/core/constellation/grimoire/index.js';
import { measure, deadEndBonds, productiveTypes } from '../codex/core/constellation/grimoire/reactor.js';
import { loadPosMap, loadSplit, EVIDENCE_DIR } from './lib/constellation-corpus.mjs';

const DATE = '2026-08-08';

const sig = (b) => `${b[0]}|${b[1]}|${b[2]}`;
const key = (b) => `${b[0]}|${b[1]}|${b[2]}|${b[3]}`;
const parseTuple = (s) => {
  const p = s.split(',').map((x) => x.trim());
  if (p.length !== 4) throw new Error(`bad bond tuple "${s}" — want L,R,RESULT,HEAD`);
  return [p[0], p[1], p[2], Number(p[3])];
};

// ── CLI ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const drops = [];
const adds = [];
let sweepAll = false;

for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--all') sweepAll = true;
  else if (argv[i] === '--drop') { drops.push(parseTuple(argv[i + 1])); i += 1; }
  else if (argv[i] === '--add') { adds.push(parseTuple(argv[i + 1])); i += 1; }
  else if (!argv[i].startsWith('--') && argv.length - i >= 4) {
    drops.push([argv[i], argv[i + 1], argv[i + 2], Number(argv[i + 3])]);
    i += 3;
  } else throw new Error(`unrecognised argument "${argv[i]}"`);
}

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  BOND ABLATION — subtractive measurement of active law       ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// ── 1. structural: dead-end analysis (no corpus needed) ────────────────────
const productive = productiveTypes(BONDS, LIFTS);
const deadEnds = deadEndBonds(BONDS, LIFTS);
const allTypes = [...new Set(BONDS.flatMap((b) => [b[0], b[1], b[2]]))].sort();
const unproductive = allTypes.filter((t) => !productive.has(t));

console.log(`  bonds: ${BONDS.length}   types: ${allTypes.length}`);
console.log(`  unproductive types (cannot reach a spanning S): ${unproductive.join(', ') || '(none)'}`);
console.log(`  dead-end bonds: ${deadEnds.length}\n`);
for (const d of deadEnds) {
  const c = constructionByBond(d.bond[0], d.bond[1], d.bond[2]);
  console.log(
    `    ${d.signature.padEnd(20)} h=${d.head}  result «${d.result}» consumed by nothing`
    + `  [${c?.id || 'unregistered'} / ${c?.status || '?'}]`,
  );
}
console.log(
  '\n  A dead-end bond can still move span-recall and root-built, because those\n'
  + '  score raw chart cells against gold contiguous subtrees. It cannot move\n'
  + '  coverage or the answer ensemble.\n',
);

// ── 2. measured ────────────────────────────────────────────────────────────
const trials = [];
if (drops.length || adds.length) {
  trials.push({
    label: [
      ...drops.map((b) => `−${sig(b)}`),
      ...adds.map((b) => `+${sig(b)}`),
    ].join('  '),
    drops: [...drops],
    adds: [...adds],
  });
} else if (sweepAll) {
  for (const b of BONDS) trials.push({ label: `−${sig(b)}`, drops: [b], adds: [] });
} else {
  for (const d of deadEnds) trials.push({ label: `−${d.signature}`, drops: [d.bond], adds: [] });
}

if (!trials.length) {
  console.log('  nothing to measure — no dead ends and no explicit --drop/--add.\n');
  process.exit(0);
}

const posMap = loadPosMap();
const devRecs = loadSplit('dev');
const testRecs = loadSplit('test');

const fmt = (m) =>
  `cov=${(m.coverage * 100).toFixed(1)}% (${m.parsed}) root=${m.rootBuilt} ens=${m.goldInEnsemble}`
  + ` span=${(m.spanRecall * 100).toFixed(2)}% nsubj=${(m.nsubjRecall * 100).toFixed(2)}%`;

console.log('  baselines …');
const devBase = measure(devRecs, posMap, BONDS);
const testBase = measure(testRecs, posMap, BONDS);
console.log(`    DEV  ${fmt(devBase)}`);
console.log(`    TEST ${fmt(testBase)}\n`);

const rows = [];
for (const t of trials) {
  const dropKeys = new Set(t.drops.map(key));
  const bonds = [...BONDS.filter((b) => !dropKeys.has(key(b))), ...t.adds];
  const dev = measure(devRecs, posMap, bonds);
  const test = measure(testRecs, posMap, bonds);
  rows.push({ ...t, bonds: bonds.length, dev, test });

  const d = (trial, base) => ({
    cov: trial.parsed - base.parsed,
    root: trial.rootBuilt - base.rootBuilt,
    ens: trial.goldInEnsemble - base.goldInEnsemble,
    span: (trial.spanRecall - base.spanRecall) * 100,
    nsubj: (trial.nsubjRecall - base.nsubjRecall) * 100,
  });
  const dd = d(dev, devBase);
  const dt = d(test, testBase);
  const s = (x) => (x > 0 ? `+${x}` : `${x}`);
  console.log(`  ${t.label}   (${bonds.length} bonds)`);
  console.log(
    `    DEV  Δcov=${s(dd.cov).padStart(5)} Δroot=${s(dd.root).padStart(5)}`
    + ` Δens=${s(dd.ens).padStart(4)} Δspan=${dd.span.toFixed(2)}pp Δnsubj=${dd.nsubj.toFixed(2)}pp`,
  );
  console.log(
    `    TEST Δcov=${s(dt.cov).padStart(5)} Δroot=${s(dt.root).padStart(5)}`
    + ` Δens=${s(dt.ens).padStart(4)} Δspan=${dt.span.toFixed(2)}pp Δnsubj=${dt.nsubj.toFixed(2)}pp`,
  );
  console.log('');
}

// ── evidence ───────────────────────────────────────────────────────────────
const slug = trials.length === 1
  ? trials[0].label.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()
  : (sweepAll ? 'sweep' : 'dead-ends');
const out = path.resolve(EVIDENCE_DIR, `${DATE}-bond-ablation-${slug}.md`);

const delta = (trial, base, field) => {
  const v = trial[field] - base[field];
  return v > 0 ? `+${v}` : `${v}`;
};
const pp = (trial, base, field) => `${((trial[field] - base[field]) * 100).toFixed(2)}pp`;

const md = `# Bond Ablation — ${trials.length === 1 ? trials[0].label : slug} — ${DATE}

**Question:** what does an *already promoted* law contribute on its own?

The gap and hint reactors only ask the additive question. A bond promoted inside
a batch is never asked the subtractive one, so a bond with no individual effect
rides in on the batch's aggregate.

## Structural analysis (no corpus)

| | |
|---|---|
| Bonds | ${BONDS.length} |
| Distinct chart types | ${allTypes.length} |
| Types that cannot reach a spanning \`S\` | ${unproductive.length ? unproductive.map((t) => `\`${t}\``).join(', ') : '_none_'} |
| Dead-end bonds | **${deadEnds.length}** |

${deadEnds.length ? `| Bond | head | Result | Construction | Status |
|---|---|---|---|---|
${deadEnds.map((d) => {
    const c = constructionByBond(d.bond[0], d.bond[1], d.bond[2]);
    return `| \`${d.signature}\` | ${d.head} | \`${d.result}\` | ${c?.id || '_unregistered_'} | ${c?.status || '?'} |`;
  }).join('\n')}` : '_No dead-end bonds._'}

A dead-end bond's result type is consumed by no bond and carried to \`S\` by no
lift chain. It **cannot** change coverage or the answer ensemble. It can still
move span recall and root-built, because those score raw chart cells against gold
contiguous subtrees — a cosmetic hit, not participation in a parse.

## Baselines

| | DEV | TEST |
|---|---|---|
| Coverage | ${(devBase.coverage * 100).toFixed(1)}% (${devBase.parsed}) | ${(testBase.coverage * 100).toFixed(1)}% (${testBase.parsed}) |
| Root | ${devBase.rootBuilt} | ${testBase.rootBuilt} |
| Ensemble | ${devBase.goldInEnsemble} | ${testBase.goldInEnsemble} |
| Span / nsubj | ${(devBase.spanRecall * 100).toFixed(2)}% / ${(devBase.nsubjRecall * 100).toFixed(2)}% | ${(testBase.spanRecall * 100).toFixed(2)}% / ${(testBase.nsubjRecall * 100).toFixed(2)}% |

## Trials

Deltas are **trial − baseline**. For a \`−BOND\` row, a delta of \`0\` means removing
the law changed nothing measurable; a negative delta is what the law was worth.

| Trial | Bonds | Split | Δcov | Δroot | Δens | Δspan | Δnsubj |
|---|---|---|---|---|---|---|---|
${rows.map((r) => [
    `| \`${r.label}\` | ${r.bonds} | DEV | ${delta(r.dev, devBase, 'parsed')} | ${delta(r.dev, devBase, 'rootBuilt')} | ${delta(r.dev, devBase, 'goldInEnsemble')} | ${pp(r.dev, devBase, 'spanRecall')} | ${pp(r.dev, devBase, 'nsubjRecall')} |`,
    `| | | TEST | ${delta(r.test, testBase, 'parsed')} | ${delta(r.test, testBase, 'rootBuilt')} | ${delta(r.test, testBase, 'goldInEnsemble')} | ${pp(r.test, testBase, 'spanRecall')} | ${pp(r.test, testBase, 'nsubjRecall')} |`,
  ].join('\n')).join('\n')}

## Repro

\`\`\`bash
node scripts/bond-ablation.mjs${argv.length ? ` ${argv.join(' ')}` : ''}
\`\`\`
`;

writeFileSync(out, md);
console.log(`── evidence ── ${path.relative(process.cwd(), out)}\n`);
