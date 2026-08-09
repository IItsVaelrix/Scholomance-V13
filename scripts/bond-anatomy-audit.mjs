/**
 * ANATOMY EXAMINER — treebank as grammar autopsy, not just scorekeeper.
 *
 * 1. Static: grade all 68 bonds on C/R/H/X (see bond-anatomy.js).
 * 2. Runtime: among sentences where gold {subj,verb} is in the projected
 *    ensemble, collect bonds used on ANY derivation of any stable root that
 *    can project the gold answer, and ask: was the path theoretically clean?
 *
 * Special probe: COP+VP vs gold AUX on be (progressive/passive).
 *
 * Usage:
 *   node scripts/bond-anatomy-audit.mjs [dev|test]
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { parseConllu, goldAnswer } from '../codex/core/constellation/treebank.js';
import { composePacked, projectAnswers } from '../codex/core/constellation/compose-packed.js';
import { BONDS } from '../codex/core/constellation/compose.js';
import {
  BOND_ANATOMY,
  validateAnatomyAgainstBonds,
  summarizeAnatomy,
  anatomyBySignature,
  bondKey,
  gradePath,
} from '../codex/core/constellation/bond-anatomy.js';
import { familyInventory } from '../codex/core/constellation/grimoire/index.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SPLIT = process.argv[2] || 'dev';
const CORPUS = path.resolve(ROOT, `cache/ud/en_ewt-ud-${SPLIT}.conllu`);
const DICT = path.resolve(ROOT, 'scholomance_dict.sqlite');

validateAnatomyAgainstBonds(BONDS);

const LEMMA_POS = new Map([
  ['noun', 'n'], ['verb', 'v'], ['adjective', 'a'], ['adverb', 'r'],
]);

function loadPosMap() {
  const db = new Database(DICT, { readonly: true });
  const posMap = new Map();
  for (const r of db.prepare('SELECT surface_lower, pos FROM lemma_form').iterate()) {
    const tag = LEMMA_POS.get(r.pos);
    if (!tag) continue;
    const have = posMap.get(r.surface_lower);
    if (have) { if (!have.includes(tag)) have.push(tag); }
    else posMap.set(r.surface_lower, [tag]);
  }
  db.close();
  return posMap;
}

const lc = (x) => String(x ?? '').toLowerCase();
const sameAnswer = (a, g) =>
  a && g && lc(a.subject) === lc(g.subject) && lc(a.verb) === lc(g.verb);

const BE = new Set(['is', 'was', 'are', 'were', 'be', 'been', 'being', 'am']);

/**
 * Collect bond signatures used anywhere under a packed node.
 */
function collectBondSigs(node, out = new Set(), seen = new Set()) {
  if (!node || seen.has(node)) return out;
  seen.add(node);
  for (const d of node.derivations || []) {
    if (d.bond) {
      const b = d.bond;
      out.add(bondKey(b[0], b[1], b[2]));
      collectBondSigs(d.left, out, seen);
      collectBondSigs(d.right, out, seen);
    } else if (d.lift && d.child) {
      collectBondSigs(d.child, out, seen);
    }
  }
  return out;
}

/**
 * Whether this packed S-node can project the gold answer (via projectAnswers).
 */
function nodeProjectsGold(node, gold) {
  return projectAnswers(node).some((a) => sameAnswer(a, gold));
}

/**
 * Bonds used on subtrees that participate in at least one gold-projecting
 * answer path is hard without a full path enumerator; we approximate:
 * take the union of bonds on every stable root that projects gold.
 * If none, fall back to all stable roots (should not happen when contained).
 */
function bondsOnGoldishRoots(chart, gold) {
  const out = new Set();
  let any = false;
  for (const root of chart.stable) {
    if (!nodeProjectsGold(root, gold)) continue;
    any = true;
    collectBondSigs(root, out);
  }
  if (!any) {
    for (const root of chart.stable) collectBondSigs(root, out);
  }
  return out;
}

/**
 * Gold deprel for each surface token (first occurrence).
 */
function goldTokenMeta(rec) {
  return rec.tokens.map((t) => ({
    form: t.form,
    lower: lc(t.form),
    upos: t.upos,
    deprel: t.deprel,
    head: t.head,
  }));
}

const posMap = loadPosMap();
const recs = parseConllu(readFileSync(CORPUS, 'utf8'));
const bySig = anatomyBySignature();
const summary = summarizeAnatomy();

// ── Static report ──────────────────────────────────────────────────────────
console.log(`\nBOND ANATOMY — static table (${summary.n} bonds)\n`);
console.log('  dim     G      Y      R');
for (const d of ['C', 'R', 'H', 'X']) {
  const t = summary.tallies[d];
  console.log(
    `  ${d}   ${String(t.G).padStart(4)}  ${String(t.Y).padStart(4)}  ${String(t.R).padStart(4)}`
    + `   (${((t.G / summary.n) * 100).toFixed(0)}% green)`,
  );
}
console.log(`\n  headship green:     ${summary.headshipGreen}/${summary.n}  (${(summary.headshipGreenRate * 100).toFixed(1)}%)`);
console.log(`  all-four green:     ${summary.allGreen}/${summary.n}  (${(summary.allGreenRate * 100).toFixed(1)}%)`);
console.log(`  scaffold results:   ${summary.scaffoldResults.length}`);
console.log(`  critical / red-X:   ${summary.critical.length}`);
if (summary.byStatus) {
  console.log(`  status ontology:    grammar=${summary.byStatus.grammar} scaffold=${summary.byStatus.scaffold} approximation=${summary.byStatus.approximation} deprecated=${summary.byStatus.deprecated}`);
}
console.log('\n── FAMILY INVENTORY (what Scholomance understands) ──\n');
for (const f of familyInventory()) {
  console.log(
    `  ${f.family.padEnd(18)} n=${String(f.total).padStart(2)}  `
    + `G:${f.grammar} S:${f.scaffold} A:${f.approximation} D:${f.deprecated}`,
  );
}

console.log('\n── CRITICAL / RED FLAGS ──\n');
for (const a of summary.critical) {
  console.log(`  ${bondKey(a.left, a.right, a.result)}  C${a.C} R${a.R} H${a.H} X${a.X}`);
  console.log(`    ${a.note}`);
}

console.log('\n── YELLOW (sample of theory shortcuts) ──\n');
for (const a of summary.yellowFlags.filter((x) =>
  (x.flags || []).some((f) =>
    ['cop-vs-aux', 'relative-oversimple', 'comparative-oversimple', 'scaffold-result', 'stack-hack'].includes(f),
  )).slice(0, 14)) {
  console.log(`  ${bondKey(a.left, a.right, a.result)}  C${a.C} R${a.R} H${a.H} X${a.X}  — ${a.note.slice(0, 90)}`);
}

// ── Runtime: correct answers → path legitimacy ─────────────────────────────
let parsed = 0;
let scored = 0;
let contained = 0;

let pathTheoryClean = 0;
let pathHeadshipClean = 0;
let pathYellow = 0;
let pathRed = 0;
let pathCritical = 0;

const flagHits = new Map(); // flag -> count among contained
const bondHitsOnCorrect = new Map(); // sig -> count

// COP vs AUX probe
let beTokensInContained = 0;
let copVpUsed = 0;
let copVpWithGoldAux = 0; // progressive/passive mis-typed as COP
let copVpWithGoldCop = 0;
let auxVpWithGoldAux = 0;

const dirtyExamples = [];
const cleanExamples = [];
const copAuxExamples = [];

for (const rec of recs) {
  const tokens = rec.tokens.map((t) => t.form);
  const chart = composePacked(tokens, posMap);
  if (chart.stable.length === 0) continue;
  parsed += 1;

  const gold = goldAnswer(rec);
  const hasNsubj = rec.tokens.some(
    (t) => t.deprel === 'nsubj' || t.deprel === 'nsubj:pass',
  );
  if (!hasNsubj || !gold.verb) continue;
  scored += 1;

  const answers = chart.stable.flatMap((s) => projectAnswers(s));
  if (!answers.some((a) => sameAnswer(a, gold))) continue;
  contained += 1;

  const sigs = bondsOnGoldishRoots(chart, gold);
  const graded = gradePath([...sigs], bySig);

  if (graded.theoryClean) pathTheoryClean += 1;
  if (graded.headshipClean) pathHeadshipClean += 1;
  if (graded.worst === 'G') { /* already theoryClean */ }
  else if (graded.worst === 'Y') pathYellow += 1;
  else pathRed += 1;
  if (graded.criticalHit) pathCritical += 1;

  for (const f of graded.flags) {
    flagHits.set(f, (flagHits.get(f) || 0) + 1);
  }
  for (const sig of sigs) {
    bondHitsOnCorrect.set(sig, (bondHitsOnCorrect.get(sig) || 0) + 1);
  }

  // COP+VP vs gold AUX on be
  const meta = goldTokenMeta(rec);
  const usedCopVp = sigs.has('COP+VP->VP');
  const usedAuxVp = sigs.has('AUX+VP->VP');
  for (const t of meta) {
    if (!BE.has(t.lower)) continue;
    beTokensInContained += 1;
  }
  if (usedCopVp) {
    copVpUsed += 1;
    const beMeta = meta.filter((t) => BE.has(t.lower));
    const asAux = beMeta.some((t) => t.deprel === 'aux' || t.deprel === 'aux:pass');
    const asCop = beMeta.some((t) => t.deprel === 'cop');
    if (asAux) {
      copVpWithGoldAux += 1;
      if (copAuxExamples.length < 10) {
        copAuxExamples.push({
          text: rec.text || tokens.join(' '),
          gold,
          be: beMeta.map((t) => `${t.form}:${t.deprel}/${t.upos}`).join(', '),
        });
      }
    }
    if (asCop) copVpWithGoldCop += 1;
  }
  if (usedAuxVp) {
    const beMeta = meta.filter((t) => BE.has(t.lower));
    if (beMeta.some((t) => t.deprel === 'aux' || t.deprel === 'aux:pass')) {
      // have/do also AUX+VP — only count if a be form is present as aux
      if (beMeta.some((t) => BE.has(t.lower) && (t.deprel === 'aux' || t.deprel === 'aux:pass'))) {
        auxVpWithGoldAux += 1;
      }
    }
  }

  if (graded.theoryClean && cleanExamples.length < 5) {
    cleanExamples.push({ text: rec.text || tokens.join(' '), gold, nBonds: sigs.size });
  }
  if (!graded.theoryClean && dirtyExamples.length < 8) {
    dirtyExamples.push({
      text: rec.text || tokens.join(' '),
      gold,
      worst: graded.worst,
      flags: graded.flags.slice(0, 6),
      critical: graded.criticalHit,
    });
  }
}

const pct = (a, b) => `${((100 * a) / Math.max(b, 1)).toFixed(1)}%`;

console.log(`\n══ RUNTIME: correct containment → path legitimacy (EWT ${SPLIT}) ══\n`);
console.log(`  spanning S                         ${parsed}`);
console.log(`  scoreable (nsubj + verb)           ${scored}`);
console.log(`  gold answer IN ensemble            ${contained}  ${pct(contained, scored)} of scoreable`);
console.log('');
console.log(`  among contained (n=${contained}):`);
console.log(`    theory-clean path (all GGGG)     ${pathTheoryClean}  ${pct(pathTheoryClean, contained)}`);
console.log(`    headship-clean (all H=G)         ${pathHeadshipClean}  ${pct(pathHeadshipClean, contained)}`);
console.log(`    path has yellow                  ${pathYellow}  ${pct(pathYellow, contained)}`);
console.log(`    path has red                     ${pathRed}  ${pct(pathRed, contained)}`);
console.log(`    critical flag hit (cop/rel/…)    ${pathCritical}  ${pct(pathCritical, contained)}`);

console.log('\n── COP vs AUX probe (the big yellow flag) ──\n');
console.log(`  contained sents using COP+VP->VP   ${copVpUsed}`);
console.log(`  …with gold deprel aux/aux:pass on be  ${copVpWithGoldAux}  ${pct(copVpWithGoldAux, copVpUsed)} of COP+VP uses`);
console.log(`  …with gold deprel cop on be           ${copVpWithGoldCop}  ${pct(copVpWithGoldCop, copVpUsed)}`);
console.log(`  (head may still be right; category theory is wrong when aux)`);

console.log('\n── flags among correct-answer paths (top) ──\n');
for (const [f, n] of [...flagHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${f.padEnd(28)} ${String(n).padStart(4)}  ${pct(n, contained)}`);
}

console.log('\n── bonds most often on correct paths (top 12) ──\n');
for (const [sig, n] of [...bondHitsOnCorrect.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  const a = bySig.get(sig);
  const grades = a ? `C${a.C}R${a.R}H${a.H}X${a.X}` : '????';
  console.log(`  ${sig.padEnd(22)} ${String(n).padStart(4)}  ${grades}`);
}

console.log('\n── clean examples ──\n');
for (const e of cleanExamples) {
  console.log(`  ✓ ${e.text}`);
  console.log(`    gold ${e.gold.subject}|${e.gold.verb}  bonds-in-tree ~${e.nBonds}`);
}
console.log('\n── dirty examples (correct answer, imperfect theory) ──\n');
for (const e of dirtyExamples) {
  console.log(`  ~ ${e.text}`);
  console.log(`    gold ${e.gold.subject}|${e.gold.verb}  worst=${e.worst}  flags=${e.flags.join(',')}`);
}
console.log('\n── COP+VP with gold AUX on be ──\n');
for (const e of copAuxExamples) {
  console.log(`  ! ${e.text}`);
  console.log(`    gold ${e.gold.subject}|${e.gold.verb}  be=${e.be}`);
}

// Verdict
console.log('\n══ VERDICT ══\n');
console.log(
  `  Headship is ${(summary.headshipGreenRate * 100).toFixed(0)}% green on the table — spine OK.`,
);
console.log(
  `  Only ${(summary.allGreenRate * 100).toFixed(0)}% of bonds are clean on all four axes — shortcuts remain.`,
);
if (contained > 0) {
  console.log(
    `  When the answer is right, only ${pct(pathTheoryClean, contained)} of paths are fully theory-clean;`,
  );
  console.log(
    `  ${pct(pathHeadshipClean, contained)} keep clean headship; ${pct(pathCritical, contained)} hit a critical theory flag.`,
  );
}
if (copVpUsed > 0) {
  console.log(
    `  COP+VP is used with gold aux/aux:pass on be in ${pct(copVpWithGoldAux, copVpUsed)} of its correct-path uses — category mislabel confirmed live.`,
  );
}
console.log('');
