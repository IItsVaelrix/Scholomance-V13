/**
 * ROOT-CLOSURE AUTOPSY
 *
 * For every gold contiguous root span that the chart does NOT build, ask:
 *   What is the largest correctly built structure immediately below the
 *   missing root, and what sits beside it that might prevent closure?
 *
 * This is NOT a bond-expansion campaign. It clusters closure failures so a
 * small number of clause-scale laws can be chosen over hundreds of local bonds.
 *
 * Usage:
 *   node scripts/root-closure-autopsy.mjs [dev|test]
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { parseConllu } from '../codex/core/constellation/treebank.js';
import { composePacked } from '../codex/core/constellation/compose-packed.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SPLIT = process.argv[2] || 'dev';
const CORPUS = path.resolve(ROOT, `cache/ud/en_ewt-ud-${SPLIT}.conllu`);
const DICT = path.resolve(ROOT, 'scholomance_dict.sqlite');

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

function subtreeSpans(tokens) {
  const children = new Map();
  for (const t of tokens) {
    if (!children.has(t.head)) children.set(t.head, []);
    children.get(t.head).push(t.id);
  }
  const spans = new Map();
  const visit = (id) => {
    if (spans.has(id)) return spans.get(id);
    let min = id - 1;
    let max = id - 1;
    let size = 1;
    for (const c of children.get(id) || []) {
      const s = visit(c);
      if (s.min < min) min = s.min;
      if (s.max > max) max = s.max;
      size += s.size;
    }
    const out = { min, max, size, contiguous: max - min + 1 === size };
    spans.set(id, out);
    return out;
  };
  for (const t of tokens) visit(t.id);
  return { spans, children };
}

/**
 * Largest chart node (by span width, then type priority) strictly inside
 * [rootMin, rootMax], or covering a proper subspan.
 */
function largestBuiltInside(chart, rootMin, rootMax) {
  let best = null;
  let bestWidth = -1;
  for (const m of chart.molecules) {
    if (m.from < rootMin || m.to > rootMax) continue;
    const w = m.to - m.from + 1;
    const rootW = rootMax - rootMin + 1;
    if (w >= rootW) continue; // not strictly below
    if (w > bestWidth) {
      bestWidth = w;
      best = m;
    }
  }
  return best;
}

/**
 * All maximal chart nodes inside the root span (not contained in a larger
 * built node also inside the root). These are the "pieces on the table".
 */
function maximalPieces(chart, rootMin, rootMax) {
  const inside = chart.molecules.filter(
    (m) => m.from >= rootMin && m.to <= rootMax && (m.to - m.from + 1) < (rootMax - rootMin + 1),
  );
  return inside.filter((m) => !inside.some(
    (o) => o !== m && o.from <= m.from && o.to >= m.to && (o.to - o.from) > (m.to - m.from),
  ));
}

/**
 * Cluster signature for a missing root:
 *   largestType@fill | pieces:TYPE,TYPE | fringe:leftTokenTypes|right
 */
function clusterKey(largest, pieces, tokens, rootMin, rootMax, rootToken) {
  const fill = largest
    ? ((largest.to - largest.from + 1) / (rootMax - rootMin + 1)).toFixed(2)
    : '0';
  const largestType = largest ? largest.type : '∅';
  const pieceTypes = [...new Set(pieces.map((p) => p.type))].sort().join('+') || '∅';
  // fringe: categories at root boundaries if not covered by largest
  const leftFringe = largest && largest.from > rootMin
    ? tokens.slice(rootMin, largest.from).map((t) => t).join(' ')
    : '';
  const rightFringe = largest && largest.to < rootMax
    ? tokens.slice(largest.to + 1, rootMax + 1).map((t) => t).join(' ')
    : '';
  const fringeShape = [
    leftFringe ? 'L' : '',
    rightFringe ? 'R' : '',
  ].join('') || 'none';

  return {
    key: `${largestType}|fill=${fill}|pieces=${pieceTypes}|fringe=${fringeShape}|root=${rootToken.upos}`,
    largestType,
    fill: Number(fill),
    pieceTypes,
    fringeShape,
    rootUpos: rootToken.upos,
    leftFringe,
    rightFringe,
  };
}

const posMap = loadPosMap();
const recs = parseConllu(readFileSync(CORPUS, 'utf8'));

let rootGold = 0;
let rootBuilt = 0;
let rootMissing = 0;
let rootNonContig = 0;

const clusters = new Map(); // key -> { count, examples: [] }
const pieceCooccur = new Map(); // "NP+VP" etc among missing

for (const rec of recs) {
  const tokens = rec.tokens.map((t) => t.form);
  const chart = composePacked(tokens, posMap);
  const { spans } = subtreeSpans(rec.tokens);
  const chartCells = new Set(chart.molecules.map((m) => `${m.from}:${m.to}`));

  const root = rec.tokens.find((t) => t.head === 0);
  if (!root) continue;
  rootGold += 1;
  const sp = spans.get(root.id);
  if (!sp || !sp.contiguous) {
    rootNonContig += 1;
    continue;
  }

  const built = chartCells.has(`${sp.min}:${sp.max}`);
  if (built) {
    rootBuilt += 1;
    continue;
  }
  rootMissing += 1;

  const largest = largestBuiltInside(chart, sp.min, sp.max);
  const pieces = maximalPieces(chart, sp.min, sp.max);
  const meta = clusterKey(largest, pieces, tokens, sp.min, sp.max, root);

  // piece co-occurrence (whether both NP and VP exist as pieces)
  const types = new Set(pieces.map((p) => p.type));
  const hasNP = [...types].some((t) => t === 'NP' || t === 'N');
  const hasVP = [...types].some((t) => t === 'VP' || t === 'V');
  const hasS = types.has('S');
  const hasPP = types.has('PP');
  const hasPUNCT = types.has('PUNCT') || types.has('COMMA');
  const coKey = [
    hasNP ? 'NP' : null,
    hasVP ? 'VP' : null,
    hasS ? 'S' : null,
    hasPP ? 'PP' : null,
    hasPUNCT ? 'PUNCT' : null,
  ].filter(Boolean).join('+') || 'other';
  pieceCooccur.set(coKey, (pieceCooccur.get(coKey) || 0) + 1);

  if (!clusters.has(meta.key)) {
    clusters.set(meta.key, { ...meta, count: 0, examples: [] });
  }
  const row = clusters.get(meta.key);
  row.count += 1;
  if (row.examples.length < 3) {
    row.examples.push({
      text: (rec.text || tokens.join(' ')).slice(0, 120),
      rootForm: root.form,
      rootUpos: root.upos,
      span: `${sp.min}-${sp.max}`,
      largest: largest
        ? `${largest.type}[${largest.from}-${largest.to}]`
        : '∅',
      pieces: pieces
        .slice(0, 8)
        .map((p) => `${p.type}[${p.from}-${p.to}]`)
        .join(', '),
      leftFringe: meta.leftFringe,
      rightFringe: meta.rightFringe,
    });
  }
}

const ranked = [...clusters.values()].sort((a, b) => b.count - a.count);
const pct = (a, b) => `${((100 * a) / Math.max(b, 1)).toFixed(1)}%`;

console.log(`\nROOT-CLOSURE AUTOPSY — EWT ${SPLIT}\n`);
console.log(`  gold roots                    ${rootGold}`);
console.log(`  root span built               ${rootBuilt}  ${pct(rootBuilt, rootGold)}`);
console.log(`  root span MISSING             ${rootMissing}  ${pct(rootMissing, rootGold)}`);
console.log(`  non-contiguous roots          ${rootNonContig}`);
console.log(`  distinct closure clusters     ${ranked.length}`);

console.log('\n── Piece co-occurrence on missing roots (what is already on the table) ──\n');
for (const [k, n] of [...pieceCooccur.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`  ${k.padEnd(24)} ${String(n).padStart(5)}  ${pct(n, rootMissing)}`);
}

// Aggregate by largest type only
const byLargest = new Map();
for (const c of ranked) {
  byLargest.set(c.largestType, (byLargest.get(c.largestType) || 0) + c.count);
}
console.log('\n── Largest built structure under missing root ──\n');
for (const [t, n] of [...byLargest.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`  ${t.padEnd(12)} ${String(n).padStart(5)}  ${pct(n, rootMissing)}`);
}

// NP+VP present but no S closure
const npVpReady = (pieceCooccur.get('NP+VP') || 0)
  + (pieceCooccur.get('NP+VP+PP') || 0)
  + (pieceCooccur.get('NP+VP+PUNCT') || 0)
  + (pieceCooccur.get('NP+VP+PP+PUNCT') || 0)
  + (pieceCooccur.get('NP+VP+S') || 0)
  + (pieceCooccur.get('NP+VP+S+PP') || 0)
  + (pieceCooccur.get('NP+VP+S+PUNCT') || 0)
  + (pieceCooccur.get('NP+VP+S+PP+PUNCT') || 0);

// Sum all keys that include both NP and VP
let npAndVp = 0;
let hasSButNotRoot = 0;
for (const [k, n] of pieceCooccur.entries()) {
  if (k.includes('NP') && k.includes('VP')) npAndVp += n;
  if (k.includes('S')) hasSButNotRoot += n;
}

console.log('\n── Closure hypotheses (counts among missing roots) ──\n');
console.log(`  NP and VP both present as pieces   ${npAndVp}  ${pct(npAndVp, rootMissing)}  ← missing NP+VP→S style closure?`);
console.log(`  Some S already built inside span   ${hasSButNotRoot}  ${pct(hasSButNotRoot, rootMissing)}  ← missing combination / punct absorb?`);
console.log(`  (these overlap; not a partition)`);

console.log('\n── Top closure clusters ──\n');
for (const c of ranked.slice(0, 20)) {
  console.log(`  ${String(c.count).padStart(4)}  ${pct(c.count, rootMissing).padStart(6)}  largest=${c.largestType} fill=${c.fill} pieces=${c.pieceTypes} fringe=${c.fringeShape} root=${c.rootUpos}`);
  for (const ex of c.examples.slice(0, 1)) {
    console.log(`        e.g. ${ex.text}`);
    console.log(`             largest ${ex.largest}  pieces ${ex.pieces}`);
    if (ex.leftFringe) console.log(`             left fringe:  «${ex.leftFringe}»`);
    if (ex.rightFringe) console.log(`             right fringe: «${ex.rightFringe}»`);
  }
  console.log('');
}

// Write evidence
const outPath = path.resolve(ROOT, 'docs/superpowers/evidence/2026-08-08-root-closure-autopsy.md');
const md = `# Root-Closure Autopsy — 2026-08-08

**Split:** ${SPLIT}  
**Instrument:** \`scripts/root-closure-autopsy.mjs\`  
**Question:** For missing gold root spans, what is the largest structure already built, and what pieces sit on the table?

## Counts

| | n | % of gold roots |
|---|---|---|
| Gold roots | ${rootGold} | 100% |
| Root span built | ${rootBuilt} | ${pct(rootBuilt, rootGold)} |
| **Root span missing** | **${rootMissing}** | **${pct(rootMissing, rootGold)}** |
| Non-contiguous | ${rootNonContig} | ${pct(rootNonContig, rootGold)} |
| Distinct clusters | ${ranked.length} | |

## Piece co-occurrence (missing roots only)

| Pieces on table | n | % of missing |
|---|---|---|
${[...pieceCooccur.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, n]) =>
    `| ${k} | ${n} | ${pct(n, rootMissing)} |`).join('\n')}

### Closure hypotheses

- **NP and VP both present:** ${npAndVp} (${pct(npAndVp, rootMissing)}) — local subject/predicate may exist without clause closure.
- **Some S already inside span:** ${hasSButNotRoot} (${pct(hasSButNotRoot, rootMissing)}) — subclause built; full root span not closed (punct / attachment / combination).

## Largest built type under missing root

| Type | n | % of missing |
|---|---|---|
${[...byLargest.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t, n]) =>
    `| ${t} | ${n} | ${pct(n, rootMissing)} |`).join('\n')}

## Top clusters

${ranked.slice(0, 15).map((c) => `### ${c.count}× — largest=\`${c.largestType}\` fill=${c.fill} pieces=\`${c.pieceTypes}\` fringe=${c.fringeShape} root=${c.rootUpos}

${c.examples.map((ex) => `- ${ex.text}  
  largest \`${ex.largest}\` pieces \`${ex.pieces}\`${ex.leftFringe ? ` left«${ex.leftFringe}»` : ''}${ex.rightFringe ? ` right«${ex.rightFringe}»` : ''}`).join('\n')}
`).join('\n')}

## Interpretation (for campaign)

Do **not** treat the deprel gap table as a shopping list for local bonds.

If large clusters show NP+VP (or VP-heavy structure) already built with only fringe material (punct, fronted PP, coordinator) outside, the fix is a **closure law**, not more atoms.

Punctuation: high span recall with large root gaps often means punct is a **projection / absorption** problem, not a skeleton bond.

## Repro

\`\`\`bash
node scripts/root-closure-autopsy.mjs ${SPLIT}
\`\`\`
`;

writeFileSync(outPath, md);
console.log(`\n── evidence ──\n   ${outPath}\n`);
