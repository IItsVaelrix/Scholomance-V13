/**
 * RESULT CONSERVATION SCREEN
 *
 * 1. Can projection physics + construction chemistry regenerate known bonds?
 * 2. Of the 78 old-synthesizer extras, which survive Result Conservation
 *    *before* any reactor? (isotopes die here)
 * 3. Survivors of conservation → optional note for reactor (do not auto-run reactor here)
 *
 * Usage:
 *   node scripts/result-conservation-screen.mjs
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACTIVE_CONSTRUCTIONS, CONSTRUCTIONS } from '../codex/core/constellation/grimoire/index.js';
import { synthesizeBonds } from '../codex/core/constellation/grimoire/bond-synthesizer.js';
import {
  synthesizeByProjection,
  conservesResult,
} from '../codex/core/constellation/grimoire/projection-laws.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const goldActive = ACTIVE_CONSTRUCTIONS;
const goldAll = CONSTRUCTIONS;
const projected = synthesizeByProjection();
const projSigs = new Map(projected.map((c) => [c.signature, c]));

function rediscover(gold) {
  let hit = 0;
  let hitHead = 0;
  const miss = [];
  const headMis = [];
  for (const g of gold) {
    const s = `${g.left}|${g.right}|${g.result}`;
    const p = projSigs.get(s);
    if (!p) {
      miss.push({ signature: s, gold: g });
      continue;
    }
    hit += 1;
    if (p.head === g.head) hitHead += 1;
    else headMis.push({ signature: s, goldHead: g.head, theoryHead: p.head });
  }
  return {
    nGold: gold.length,
    nProjected: projected.length,
    hit,
    hitHead,
    miss,
    headMis,
    recallSig: hit / gold.length,
    recallFull: hitHead / gold.length,
  };
}

const activeR = rediscover(goldActive);
const fullR = rediscover(goldAll);

// Old free-C extras
const goldSigs = new Set(goldActive.map((c) => `${c.left}|${c.right}|${c.result}`));
const oldExtras = synthesizeBonds({ mode: 'full' }).filter((c) => !goldSigs.has(c.signature));

const reasons = new Map();
const conserved = [];
const rejected = [];

for (const ex of oldExtras) {
  const r = conservesResult(ex);
  if (r.ok) {
    conserved.push({ extra: ex, derived: r.derived });
  } else {
    rejected.push({ extra: ex, reason: r.reason });
    const key = (r.reason || 'unknown').split(':')[0];
    reasons.set(key, (reasons.get(key) || 0) + 1);
  }
}

// Fake nuclei from reactor that should die
const FAKE_NUCLEI = [
  'V|NP|V', 'NP|VP|NP', 'ADV|S|ADV', 'PP|S|PP', 'NP|PUNCT|S', 'DET|N|N',
  'ADJ|N|ADJ', 'V|NPO|V', 'V|PP|V', 'ADV|VP|ADV',
];
const fakeFate = FAKE_NUCLEI.map((signature) => {
  const [left, right, result] = signature.split('|');
  // try both heads that appeared in reactor
  const tries = [0, 1].map((head) => conservesResult({ left, right, result, head }));
  const any = tries.find((t) => t.ok);
  return {
    signature,
    killed: !any,
    reasons: tries.map((t, i) => `h=${i}:${t.ok ? 'OK' : t.reason}`),
  };
});

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  RESULT CONSERVATION — C is derived, not searched            ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log('── Rediscovery of human Grimoire under projection physics ──\n');
console.log(`  projected candidates (no free C)   ${projected.length}`);
console.log(`  ACTIVE gold                        ${activeR.nGold}`);
console.log(`  signature hits                     ${activeR.hit}  (${(activeR.recallSig * 100).toFixed(1)}%)`);
console.log(`  signature+head hits                ${activeR.hitHead}  (${(activeR.recallFull * 100).toFixed(1)}%)`);
console.log(`  missed                             ${activeR.miss.length}`);
console.log(`  head mismatches                    ${activeR.headMis.length}`);
console.log(`  VIABLE ≥40                         ${activeR.hit >= 40 ? 'YES' : 'NO'}`);

if (activeR.miss.length) {
  console.log('\n  missed bonds:');
  for (const m of activeR.miss) {
    console.log(`    ${m.signature}  (${m.gold.status}/${m.gold.family})`);
  }
}
if (activeR.headMis.length) {
  console.log('\n  head mismatches:');
  for (const m of activeR.headMis) {
    console.log(`    ${m.signature}  gold=${m.goldHead} theory=${m.theoryHead}`);
  }
}

console.log('\n── Screen old free-C extras (78) through Result Conservation ──\n');
console.log(`  extras in                         ${oldExtras.length}`);
console.log(`  conserved (legal C)               ${conserved.length}`);
console.log(`  rejected (isotopes)               ${rejected.length}`);
console.log('\n  rejection reasons:');
for (const [k, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(n).padStart(3)}  ${k}`);
}

console.log('\n── Known fake nuclei from soft reactor — do they die? ──\n');
for (const f of fakeFate) {
  console.log(`  ${f.killed ? '☠ ' : '⚠ '} ${f.signature.padEnd(16)} ${f.killed ? 'KILLED' : 'STILL LEGAL'}  ${f.reasons.join(' | ')}`);
}

const killedFakes = fakeFate.filter((f) => f.killed).length;
console.log(`\n  fake nuclei killed: ${killedFakes}/${fakeFate.length}`);

console.log('\n── Conserved extras (would enter reactor) ──\n');
if (conserved.length === 0) {
  console.log('  (none — free-C cloud fully dead under Result Conservation)\n');
} else {
  for (const c of conserved.slice(0, 30)) {
    console.log(`  ${c.extra.signature.padEnd(22)} h=${c.extra.head}  →  ${c.derived.law}`);
  }
  if (conserved.length > 30) console.log(`  … +${conserved.length - 30} more`);
  console.log('');
}

const verdict = activeR.hit >= 40 && killedFakes >= 6
  ? 'VALIDATED — known grammar regenerates; soft-reactor fakes die under Result Conservation'
  : activeR.hit >= 40
    ? 'PARTIAL — rediscovery OK; some fakes still projection-legal (tighten transitions)'
    : 'NEED WORK — rediscovery below 40';

console.log(`══ VERDICT ══\n  ${verdict}\n`);

const md = `# Result Conservation Screen — 2026-08-08

**Law:** A bond's result must lie on a licensed projection path of its head,
under the operation performed by the non-head.

**C is derived, not hypothesized.**

## Rediscovery (projection + construction chemistry)

| | ACTIVE |
|---|---|
| Projected candidates | ${projected.length} |
| Gold | ${activeR.nGold} |
| Signature hits | **${activeR.hit}** (${(activeR.recallSig * 100).toFixed(1)}%) |
| Full hits | **${activeR.hitHead}** (${(activeR.recallFull * 100).toFixed(1)}%) |
| Missed | ${activeR.miss.length} |
| Viable ≥40 | **${activeR.hit >= 40 ? 'YES' : 'NO'}** |

### Missed

${activeR.miss.map((m) => `- \\\`${m.signature}\\\` (${m.gold.status}/${m.gold.family})`).join('\n') || '_none_'}

### Head mismatches

${activeR.headMis.map((m) => `- \\\`${m.signature}\\\` gold=${m.goldHead} theory=${m.theoryHead}`).join('\n') || '_none_'}

## Old free-C extras (78) under Result Conservation

| | n |
|---|---|
| In | ${oldExtras.length} |
| **Conserved** | **${conserved.length}** |
| **Rejected** | **${rejected.length}** |

### Rejection reasons

| Reason | n |
|---|---|
${[...reasons.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `| ${k} | ${n} |`).join('\n')}

### Conserved extras (reactor-eligible only)

${conserved.map((c) => `- \\\`${c.extra.signature}\\\` h=${c.extra.head} ← ${c.derived.law}`).join('\n') || '_none_'}

## Soft-reactor fake nuclei

| Signature | Fate |
|---|---|
${fakeFate.map((f) => `| \\\`${f.signature}\\\` | ${f.killed ? 'KILLED' : 'still legal'} |`).join('\n')}

**Killed: ${killedFakes}/${fakeFate.length}**

## Verdict

**${verdict}**

## Architecture

\`\`\`
L × R → affinity → operation → head → projection law → C
\`\`\`

Not:

\`\`\`
L × R × C × HEAD   (C free → Honda Civics)
\`\`\`

## Repro

\`\`\`bash
node scripts/result-conservation-screen.mjs
\`\`\`
`;

writeFileSync(path.resolve(ROOT, 'docs/superpowers/evidence/2026-08-08-result-conservation.md'), md);
console.log('evidence → docs/superpowers/evidence/2026-08-08-result-conservation.md\n');
