/**
 * REDISCOVERY EXPERIMENT — can theoretical laws regenerate the human Grimoire?
 *
 * Threshold: ~40 / ~68 signature hits ⇒ approach is viable.
 *
 * Usage:
 *   node scripts/bond-rediscovery.mjs
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONSTRUCTIONS, ACTIVE_CONSTRUCTIONS } from '../codex/core/constellation/grimoire/index.js';
import {
  synthesizeBonds,
  rediscoveryReport,
} from '../codex/core/constellation/grimoire/bond-synthesizer.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const candidates = synthesizeBonds({ mode: 'full' });
const minimal = synthesizeBonds({ mode: 'minimal' });

// Full constitution (includes deprecated COP+VP) and active chart only.
const full = rediscoveryReport(CONSTRUCTIONS, candidates);
const active = rediscoveryReport(ACTIVE_CONSTRUCTIONS, candidates);
const activeMin = rediscoveryReport(ACTIVE_CONSTRUCTIONS, minimal);

function printReport(label, r) {
  console.log(`\n══ ${label} ══\n`);
  console.log(`  gold constructions          ${r.nGold}`);
  console.log(`  theoretical candidates      ${r.nCandidates}`);
  console.log(`  signature hit (any head)    ${r.nHitSignatureOnly}  recall ${(r.recallSignature * 100).toFixed(1)}%`);
  console.log(`  signature + head hit        ${r.nHitSignatureAndHead}  recall ${(r.recallFull * 100).toFixed(1)}%`);
  console.log(`  signature hit, head wrong   ${r.nHeadMismatch}`);
  console.log(`  missed entirely             ${r.nMiss}`);
  console.log(`  extra proposals             ${r.extraTotal}  precision(sig) ${(r.precisionSignature * 100).toFixed(1)}%`);
  console.log(`  VIABLE ≥40 (signature)      ${r.viableAt40 ? 'YES' : 'NO'}`);
  console.log(`  VIABLE ≥40 (sig+head)       ${r.viableFullAt40 ? 'YES' : 'NO'}`);

  if (r.miss.length) {
    console.log('\n  ── MISSED human bonds ──');
    for (const m of r.miss) {
      const g = m.gold;
      console.log(`    ${m.signature}  head=${g.head}  [${g.status || '?'}/${g.family || g.id || ''}]`);
    }
  }
  if (r.hitHeadMismatch.length) {
    console.log('\n  ── SIGNATURE HIT, HEAD MISMATCH ──');
    for (const m of r.hitHeadMismatch) {
      console.log(`    ${m.signature}  gold head=${m.gold.head}  theory head=${m.candidate.head}`);
    }
  }
  // Law attribution for hits
  const byLaw = new Map();
  for (const h of r.hit) {
    const law = h.candidate.law || '?';
    byLaw.set(law, (byLaw.get(law) || 0) + 1);
  }
  console.log('\n  ── hits by generating law ──');
  for (const [law, n] of [...byLaw.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(3)}  ${law}`);
  }
}

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  BOND REDISCOVERY — theoretical synthesizer vs Grimoire      ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log(`\n  synthesizer emitted ${candidates.length} candidate bonds (no peek at gold table)`);

printReport('ACTIVE BONDS — full theory cloud', active);
printReport('ACTIVE BONDS — MINIMAL schemas only', activeMin);
printReport('FULL CONSTITUTION (incl. deprecated)', full);

console.log('\n  (Minimal mode = abstract templates only, no order-prior pair table.)');
console.log(`  Minimal candidates: ${minimal.length}; signature hits: ${activeMin.nHitSignatureOnly}/${activeMin.nGold}`);

// Family-level recall on active
const familyGold = new Map();
const familyHit = new Map();
for (const c of ACTIVE_CONSTRUCTIONS) {
  familyGold.set(c.family, (familyGold.get(c.family) || 0) + 1);
}
const hitSigs = new Set(active.hit.map((h) => h.signature)
  .concat(active.hitHeadMismatch.map((h) => h.signature)));
for (const c of ACTIVE_CONSTRUCTIONS) {
  const s = `${c.left}|${c.right}|${c.result}`;
  if (hitSigs.has(s)) familyHit.set(c.family, (familyHit.get(c.family) || 0) + 1);
}
console.log('\n══ FAMILY RECALL (active, signature) ══\n');
for (const fam of [...familyGold.keys()].sort()) {
  const g = familyGold.get(fam);
  const h = familyHit.get(fam) || 0;
  const bar = '█'.repeat(Math.round((10 * h) / g)) + '░'.repeat(10 - Math.round((10 * h) / g));
  console.log(`  ${fam.padEnd(18)} ${String(h).padStart(2)}/${g}  ${bar}  ${((100 * h) / g).toFixed(0)}%`);
}

const verdict = active.nHitSignatureOnly >= 40
  ? active.nHitSignatureAndHead >= 40
    ? `VIABLE — full theory cloud ${active.nHitSignatureAndHead}/${active.nGold} full hits; minimal schemas ${activeMin.nHitSignatureOnly}/${activeMin.nGold} signatures`
    : 'VIABLE — signature cloud OK (≥40); head law needs work'
  : 'NOT YET VIABLE — below 40 signature hits; expand physics schemas';

console.log(`\n══ VERDICT ══\n  ${verdict}\n`);

const evidence = `# Bond Rediscovery Experiment — 2026-08-08

**Question:** Can theoretical laws (atom inventory + content-head + order priors +
construction schemas) regenerate the human Grimoire without reading BONDS?

**Threshold:** ~40 / ~68 signature hits ⇒ approach viable.

**Instrument:** \`codex/core/constellation/grimoire/bond-synthesizer.js\`  
**Runner:** \`scripts/bond-rediscovery.mjs\`

## Results — active chart chemistry (${active.nGold} constructions)

### Full theory cloud (order priors + projection + schemas)

| Metric | Value |
|---|---|
| Theoretical candidates | ${active.nCandidates} |
| Signature hits | **${active.nHitSignatureOnly}** (${(active.recallSignature * 100).toFixed(1)}% recall) |
| Signature + head hits | **${active.nHitSignatureAndHead}** (${(active.recallFull * 100).toFixed(1)}% recall) |
| Head mismatches | ${active.nHeadMismatch} |
| Missed | ${active.nMiss} |
| Extra proposals | ${active.extraTotal} (precision ${(active.precisionSignature * 100).toFixed(1)}%) |
| **Viable ≥40 (signature)** | **${active.viableAt40 ? 'YES' : 'NO'}** |
| **Viable ≥40 (full)** | **${active.viableFullAt40 ? 'YES' : 'NO'}** |

### Minimal schemas only (honest compression floor)

| Metric | Value |
|---|---|
| Candidates | ${activeMin.nCandidates} |
| Signature hits | **${activeMin.nHitSignatureOnly}** / ${activeMin.nGold} (${(activeMin.recallSignature * 100).toFixed(1)}%) |
| Full hits | **${activeMin.nHitSignatureAndHead}** (${(activeMin.recallFull * 100).toFixed(1)}%) |
| Viable ≥40 | **${activeMin.viableAt40 ? 'YES' : 'NO'}** |

**Honesty note:** Full mode uses English order priors for licensed pairs (direction physics), not a copy of the 68 result tuples. Result types and heads are predicted by law. Minimal mode drops the pair table and keeps only abstract templates — lower recall, truer compression floor.

## Full constitution (incl. deprecated): ${full.nHitSignatureOnly}/${full.nGold} signature

## Missed bonds (active)

${active.miss.map((m) => `- \`${m.signature}\` head=${m.gold.head} (${m.gold.status}/${m.gold.family})`).join('\n') || '_none_'}

## Head mismatches

${active.hitHeadMismatch.map((m) =>
    `- \`${m.signature}\` gold=${m.gold.head} theory=${m.candidate.head}`).join('\n') || '_none_'}

## Family recall (signature)

| Family | Hit | Gold | % |
|---|---|---|---|
${[...familyGold.keys()].sort().map((fam) => {
    const g = familyGold.get(fam);
    const h = familyHit.get(fam) || 0;
    return `| ${fam} | ${h} | ${g} | ${((100 * h) / g).toFixed(0)}% |`;
  }).join('\n')}

## Verdict

**${verdict}**

### Interpretation

- The synthesizer does **not** copy BONDS; it expands order priors × projection laws × a few schema families (coordination, comma, verb complement, punct).
- Signature recall is the viability metric for “island of stability” search: the cloud must cover the known stable nuclei.
- Head mismatches mean the **category law** is right but **headship prediction** needs another rule (often coordination / inversion / GEN rulings).
- Extra proposals are the search space for *new* stable bonds — score them in the corpus reactor next, do not auto-merge.

## Repro

\`\`\`bash
node scripts/bond-rediscovery.mjs
\`\`\`
`;

const outPath = path.resolve(ROOT, 'docs/superpowers/evidence/2026-08-08-bond-rediscovery.md');
writeFileSync(outPath, evidence);
console.log(`evidence → ${outPath}\n`);
