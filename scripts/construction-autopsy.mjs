/**
 * CONSTRUCTION AUTOPSY — split a giant survivor into latent families.
 *
 * For a candidate bond that survived the gap simulation:
 *   1. Find DEV sentences where the bond *materially* creates gain
 *      (no spanning S without it; spanning S with it — coverage gain case)
 *   2. Locate firings of that bond (adjacent minimal spans of L/R types)
 *   3. Cluster by gold dependency / surface morphology
 *   4. Score purity = licensed share × family concentration
 *
 * EVIDENCE FILES ARE PER TARGET. An earlier version wrote every run to one
 * hardcoded path, so `construction-autopsy.mjs NC NC NC 1` (0 gains, 0 firings)
 * silently replaced the N+N / PROPN+PROPN / NP+NP tables that justified the
 * compound family. A receipt that the next run erases is not a receipt.
 *
 * Usage:
 *   node scripts/construction-autopsy.mjs              # default slate + index
 *   node scripts/construction-autopsy.mjs N N N 0      # single target only
 *   node scripts/construction-autopsy.mjs NP NP NP 0
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { BONDS } from '../codex/core/constellation/compose.js';
import {
  autopsyBond,
  refinedLawsFromAutopsy,
} from '../codex/core/constellation/grimoire/construction-families.js';
import { loadPosMap, loadSplit, EVIDENCE_DIR } from './lib/constellation-corpus.mjs';

const DATE = '2026-08-08';

const DEFAULT_TARGETS = [
  { left: 'N', right: 'N', result: 'N', head: 0 },
  { left: 'NP', right: 'NP', result: 'NP', head: 0 },
  { left: 'PROPN', right: 'PROPN', result: 'N', head: 0 },
  { left: 'NP', right: 'S', result: 'S', head: 1 },
  { left: 'S', right: 'S', result: 'S', head: 0 },
];

const slug = (t) =>
  `${t.left}-${t.right}-${t.result}-h${t.head}`.toLowerCase().replace(/[^a-z0-9-]/g, '');

const targetPath = (t) =>
  path.resolve(EVIDENCE_DIR, `${DATE}-construction-autopsy-${slug(t)}.md`);

const pct = (x) => (x == null ? 'n/a' : `${(100 * x).toFixed(1)}%`);
const num = (x) => (x == null ? 'n/a' : x.toFixed(3));

function printAutopsy(r) {
  console.log(`\n══ AUTOPSY ${r.signature} head=${r.head} ══\n`);
  console.log(`  material coverage gains (∅S → S):  ${r.materialGains}`);
  console.log(`  of those, no direct firing:         ${r.indirectGains}`);
  console.log(`  direct L+R firings on those sents:  ${r.firingsOnGains}`);
  console.log(
    `  purity = licensed × concentration:  ${num(r.purity)}`
    + `  (L=${pct(r.licensedShare)}  H=${num(r.concentration)})`,
  );
  if (r.dominant) {
    console.log(`  dominant licensed family:           ${r.dominant} (${pct(r.dominantShare)})`);
  }
  console.log(
    `  firings on two lift-only spans:     ${r.liftOnlyFirings} (${pct(r.liftOnlyShare)} borrowed)`,
  );
  if (!r.families.length) {
    console.log('\n  no firings — nothing to cluster.\n');
    return;
  }
  console.log('\n  ── family split ──\n');
  for (const f of r.families) {
    const filled = Math.min(40, Math.round(f.pct / 2.5));
    console.log(
      `  ${f.pct.toFixed(1).padStart(5)}%  ${String(f.n).padStart(4)}  ${f.fam.padEnd(22)}`
      + `${'█'.repeat(filled)}${'░'.repeat(40 - filled)}`,
    );
  }
  console.log('\n  ── gold deprels (edges between spans) ──\n');
  for (const d of r.deprels.slice(0, 12)) console.log(`  ${String(d.n).padStart(4)}  ${d.d}`);
  console.log('\n  ── surface morphology ──\n');
  for (const m of r.morphs.slice(0, 10)) console.log(`  ${String(m.n).padStart(4)}  ${m.m}`);
  console.log('\n  ── examples by family ──\n');
  for (const f of r.families.slice(0, 6)) {
    const exs = r.examples.get(f.fam) || [];
    if (!exs.length) continue;
    console.log(`  [${f.fam}]`);
    for (const e of exs.slice(0, 2)) {
      console.log(`    ${e.text}`);
      console.log(`      A ${e.spanA}`);
      console.log(`      B ${e.spanB}`);
      console.log(`      gold: ${e.links}`);
    }
    console.log('');
  }
}

function targetMarkdown(r) {
  const table = (rows, cols, fmt) =>
    (rows.length
      ? `| ${cols.join(' | ')} |\n|${cols.map(() => '---').join('|')}|\n${rows.map(fmt).join('\n')}`
      : `_No rows — the candidate produced no firings on material gains._`);

  return `# Construction Autopsy — \`${r.signature}\` head=${r.head} — ${DATE}

**Question:** what latent construction family explains why this bond works?

Gain definition: sentence has **no** spanning \`S\` under base BONDS, **has** spanning
\`S\` when the candidate is added.

## Yield

| | |
|---|---|
| Material coverage gains | **${r.materialGains}** |
| Gains with no direct firing | ${r.indirectGains} |
| Direct L+R firings on gains | **${r.firingsOnGains}** |

${r.alreadyLaw
    ? `> **VACUOUS — \`${r.signature}\` is already in BONDS at head ${r.lawHead}.** The\n`
      + '> baseline contains the signature, so the trial chart and the base chart are\n'
      + '> identical and every count below is structurally zero. Proposing a different\n'
      + `> head (${r.head}) does not change that: BONDS admits one entry per signature and\n`
      + '> coverage gain asks only whether a spanning `S` exists, which no head choice\n'
      + '> affects. To measure what the active law contributes, ablate it instead:\n'
      + '> `node scripts/bond-ablation.mjs ' + `${r.left} ${r.right} ${r.result} ${r.lawHead}\``
      + '\n'
    : r.materialGains === 0
      ? '> **Null result.** This candidate creates no coverage gain on DEV, so there is\n'
        + '> nothing to autopsy. Absence of families here is absence of evidence, not\n'
        + '> evidence that the bond is bad.\n'
      : ''}
## Purity

\`purity = licensed share × family concentration\`

| | |
|---|---|
| Licensed share (gold edge present) | ${pct(r.licensedShare)} |
| Concentration (Simpson, licensed families) | ${num(r.concentration)} |
| **Purity** | **${num(r.purity)}** |
| Dominant licensed family | ${r.dominant ? `${r.dominant} (${pct(r.dominantShare)})` : 'n/a'} |

## Borrowed types

A firing wears a **borrowed type** when both spans are one token wide and reached
their declared type by unary lift alone — nothing bonded inside them. A clausal
bond firing on two bare words is not joining clauses; it is collecting the
imperative \`VP→S\` lift over dual n/v nouns.

| | |
|---|---|
| Firings on two lift-only spans | ${r.liftOnlyFirings} |
| **Borrowed share** | **${pct(r.liftOnlyShare)}** |
| left \`${r.left}\` ever carried by a bare atom | ${r.atomBearing.left ? 'yes' : 'no'} |
| right \`${r.right}\` ever carried by a bare atom | ${r.atomBearing.right ? 'yes' : 'no'} |

${r.borrowedFloored
    ? '> **FLOORED — read this share as a description, not a verdict.** Neither\n'
      + '> side\'s type is emitted by any atom in the sampled spans, so every one-token\n'
      + '> firing is borrowed by construction and this number could not have come out\n'
      + '> low however the grammar behaved. What it still tells you is how far the\n'
      + '> bond\'s gain rides on single words rather than assembled phrases — compare\n'
      + '> it against other bonds over the same types, never against a lexical bond.\n'
    : '> Both sides can be carried by a bare atom, so a low share here is a real\n'
      + '> measurement: the bond is joining constituents that earned their type.\n'}

## Family split

${table(r.families, ['Family', 'n', '%'], (f) => `| ${f.fam} | ${f.n} | ${f.pct.toFixed(1)}% |`)}

## Gold deprels between spans

${table(r.deprels.slice(0, 12), ['deprel', 'n'], (d) => `| ${d.d} | ${d.n} |`)}

## Morphology

${table(r.morphs.slice(0, 8), ['shape', 'n'], (m) => `| ${m.m} | ${m.n} |`)}

## Refine

${r.refined.message}

${r.refined.proposals.map((p) => `- **${p.fam}** (${p.pct.toFixed(0)}%)`).join('\n') || '_no ≥15% families_'}

## Examples

${r.families.slice(0, 4).map((f) => {
    const exs = r.examples.get(f.fam) || [];
    if (!exs.length) return '';
    return `**${f.fam}**\n${exs.map((e) =>
      `- ${e.text}\n  - A ${e.spanA}\n  - B ${e.spanB}\n  - ${e.links}`).join('\n')}`;
  }).filter(Boolean).join('\n\n') || '_none_'}

## Repro

\`\`\`bash
node scripts/construction-autopsy.mjs ${r.left} ${r.right} ${r.result} ${r.head}
\`\`\`
`;
}

function indexMarkdown(slate) {
  return `# Construction Autopsy — Split the Giants — ${DATE}

**Job change:** not “what bond closes this?” but
**“what latent construction family explains why this bond works?”**

Gain definition: sentence has **no** spanning \`S\` under base BONDS, **has** spanning
\`S\` when the candidate is added.

This file indexes the **default slate only**. Each target's tables live in their
own file, so a later single-target run cannot erase them.

## Slate

| Bond | head | Gains | Firings | Licensed | Concentration | Purity | Borrowed | Dominant | Detail |
|---|---|---|---|---|---|---|---|---|---|
${slate.map((r) => `| \`${r.signature}\` | ${r.head} `
  + `| ${r.alreadyLaw ? '_already law_' : r.materialGains} | ${r.alreadyLaw ? '—' : r.firingsOnGains} `
  + `| ${r.alreadyLaw ? '—' : pct(r.licensedShare)} | ${r.alreadyLaw ? '—' : num(r.concentration)} `
  + `| ${r.alreadyLaw ? '—' : `**${num(r.purity)}**`} `
  + `| ${r.alreadyLaw ? '—' : `${pct(r.liftOnlyShare)}${r.borrowedFloored ? ' ⌊' : ''}`} `
  + `| ${r.dominant || '—'} | [detail](${path.basename(targetPath(r))}) |`).join('\n')}

Rows marked _already law_ carry that signature in BONDS already — at whatever
head — so their trial chart equals the baseline chart and the autopsy question
is undefined for them. Use \`scripts/bond-ablation.mjs\` to measure what an active
law contributes.

Purity = licensed share × Simpson concentration over licensed families. A law
scores high on both factors; a multi-tool fails at least one.

**Borrowed** is the share of firings where both spans are single tokens that
reached their declared type by unary lift alone. A high borrowed share means the
bond is not operating on the constituents its signature names — read it before
reading purity, because a bond can look licensed and concentrated while standing
entirely on promoted atoms.

A **⌊** marks a *floored* share: no atom emits either of that bond's types, so
every one-token firing is borrowed by construction and the figure could not have
come out low. Floored shares are comparable to each other and to nothing else.
${(() => {
    const unfloored = slate.filter((r) => !r.alreadyLaw && r.firingsOnGains > 0 && !r.borrowedFloored);
    return unfloored.length
      ? `Unfloored on this slate — where the share is a real measurement: ${
        unfloored.map((r) => `\`${r.signature}\``).join(', ')}.`
      : 'No row on this slate is unfloored, so every share below is descriptive only.';
  })()}

## Promotion policy (this autopsy)

- **Do not** promote a giant as a single grammar law because it raised coverage.
- Prefer targets whose licensed mass is high **and** concentrated in one family.
- Split multi-modal giants into named approximation families, re-simulate each.
- Unproposable gaps (S+TO, S+P, TO+NP, …) → missing **operations**, not more free C.

## Repro

\`\`\`bash
node scripts/construction-autopsy.mjs
\`\`\`
`;
}

// ── CLI ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const singleTarget = args.length >= 4;
const targets = singleTarget
  ? [{ left: args[0], right: args[1], result: args[2], head: Number(args[3]) }]
  : DEFAULT_TARGETS;

const posMap = loadPosMap();
const recs = loadSplit('dev');

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  CONSTRUCTION AUTOPSY — split survivors into families        ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log(`\n  targets: ${targets.map((t) => `${t.left}+${t.right}→${t.result}`).join(', ')}`);
console.log('  gain definition: no spanning S with base BONDS; spanning S with candidate\n');

const baseCharts = new Map();
const reports = [];
const written = [];

for (const t of targets) {
  process.stdout.write(`  analyzing ${t.left}|${t.right}|${t.result} … `);
  const r = autopsyBond(t, recs, posMap, BONDS, { baseCharts });
  if (r.alreadyLaw) {
    console.log(
      `ALREADY IN BONDS at head ${r.lawHead} — autopsy is structurally empty; ablate instead`,
    );
  } else {
    console.log(`gains=${r.materialGains} firings=${r.firingsOnGains} purity=${num(r.purity)}`);
  }
  printAutopsy(r);
  const refined = refinedLawsFromAutopsy(r);
  console.log(`  ── refine ──\n  ${r.alreadyLaw
    ? `already law — run: node scripts/bond-ablation.mjs ${t.left} ${t.right} ${t.result} ${r.lawHead}`
    : refined.message}\n`);
  const report = { ...r, refined };
  reports.push(report);

  const out = targetPath(t);
  writeFileSync(out, targetMarkdown(report));
  written.push(out);
}

if (!singleTarget) {
  const idx = path.resolve(EVIDENCE_DIR, `${DATE}-construction-autopsy.md`);
  writeFileSync(idx, indexMarkdown(reports));
  written.push(idx);
}

console.log('── evidence written ──');
for (const f of written) console.log(`  ${path.relative(process.cwd(), f)}`);
console.log('');
