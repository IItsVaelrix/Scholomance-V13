#!/usr/bin/env node
/**
 * SEAM-2 — the nominal anchor the parser already computes.
 * Prereg: docs/superpowers/evidence/2026-08-19-PREREG-seam-2-np-anchor.md
 *
 * Builds the gold set this repo did not have — short noun phrases, the product's actual
 * envelope — and scores the shipped phrase layer, the clause projection, the new NP
 * projection, and three null baselines on it. No gold POS anywhere.
 *
 * Research/diagnostic. Reads files, writes one JSON report. Modifies no source.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseConllu } from '../codex/core/constellation/treebank.js';
import { composePacked, projectAnswers } from '../codex/core/constellation/compose-packed.js';
import { npAnchor } from '../codex/core/constellation/np-anchor.js';
import { selectHeadToken } from '../codex/core/constellation/phraseAnalysis.js';
import { createLexiconAdapter } from '../codex/server/adapters/lexicon.sqlite.adapter.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED = 20260819;
const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
function rng(s) { let a = s >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------- gold set: short NPs from held-out UD ----------
const ALLOWED = new Set(['DET', 'ADJ', 'NOUN', 'PROPN', 'NUM']);
const records = parseConllu(fs.readFileSync(path.join(ROOT, 'cache/ud/en_ewt-ud-test.conllu'), 'utf8'));
const gold = [];
const seen = new Set();
for (const rec of records) {
  const toks = rec.tokens;
  const byId = new Map(toks.map((t) => [t.id, t]));
  const kids = new Map();
  for (const t of toks) { if (!kids.has(t.head)) kids.set(t.head, []); kids.get(t.head).push(t); }
  for (const head of toks) {
    if (head.upos !== 'NOUN' && head.upos !== 'PROPN') continue;
    // full subtree of this head
    const sub = [];
    const stack = [head];
    while (stack.length) { const t = stack.pop(); sub.push(t); for (const k of (kids.get(t.id) || [])) stack.push(k); }
    sub.sort((a, b) => a.id - b.id);
    if (sub.length < 2 || sub.length > 6) continue;
    if (sub[sub.length - 1].id - sub[0].id !== sub.length - 1) continue;      // contiguous
    if (!sub.every((t) => ALLOWED.has(t.upos))) continue;                      // nominal only
    if (!sub.every((t) => byId.has(t.id))) continue;
    const tokens = sub.map((t) => t.form);
    const key = tokens.join(' ').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    gold.push({ tokens, anchor: head.form, sentId: rec.sentId });
  }
}

// ---------- POS sources ----------
const types = [...new Set(gold.flatMap((g) => g.tokens.map((t) => t.toLowerCase())))];
const gateLex = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/qa/fixtures/constellation/treebank-gate-lexicon.json'), 'utf8'));
const P1 = new Map(Object.entries(gateLex).map(([w, l]) => [w, Array.isArray(l) ? l : []]));
const P2 = new Map();
const adapter = createLexiconAdapter(path.join(ROOT, 'scholomance_dict.sqlite'));
for (let i = 0; i < types.length; i += 400) {
  const tags = adapter.batchLookupPos(types.slice(i, i + 400)) || {};
  for (const [w, l] of Object.entries(tags)) P2.set(w, Array.isArray(l) ? l : []);
}

// frequencies from TRAIN only
const freqMap = new Map();
for (const line of fs.readFileSync(path.join(ROOT, 'cache/ud/en_ewt-ud-train.conllu'), 'utf8').split('\n')) {
  if (!line || line[0] === '#') continue;
  const f = line.split('\t');
  if (f.length < 4 || f[0].includes('-')) continue;
  const w = f[1].toLowerCase();
  freqMap.set(w, (freqMap.get(w) || 0) + 1);
}

function shuffledPos(src, seed) {
  const keys = [...src.keys()]; const vals = [...src.values()]; const r = rng(seed);
  for (let i = vals.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [vals[i], vals[j]] = [vals[j], vals[i]]; }
  return new Map(keys.map((k, i) => [k, vals[i]]));
}

const isWord = (t) => /[A-Za-z0-9]/.test(t);
const lastTaggedNoun = (toks, pm) => { for (let i = toks.length - 1; i >= 0; i--) if ((pm.get(toks[i].toLowerCase()) || []).includes('n')) return toks[i]; return null; };
const firstTaggedNoun = (toks, pm) => { for (const t of toks) if ((pm.get(t.toLowerCase()) || []).includes('n')) return t; return null; };

function run(pm, label) {
  const rb = rng(SEED + 5);
  const rows = gold.map((g) => {
    let clause = null, np = null, answered = false;
    try {
      const chart = composePacked(g.tokens, pm, {});
      const ans = chart.stable.flatMap((s) => projectAnswers(s));
      clause = ans.length > 0 ? ans[0].subject : null;
      const a = npAnchor(chart, g.tokens.length);
      np = a.anchor; answered = a.anchor !== null;
    } catch { /* counted as wrong via nulls below */ }
    let A = null;
    try { A = selectHeadToken(g.tokens, freqMap, pm); } catch { /* wrong */ }
    const content = g.tokens.filter(isWord);
    return {
      A: same(A, g.anchor),
      B_clause: same(clause, g.anchor),
      B_np: same(np, g.anchor),
      npAnswered: answered,
      lastNoun: same(lastTaggedNoun(g.tokens, pm), g.anchor),
      firstNoun: same(firstTaggedNoun(g.tokens, pm), g.anchor),
      rand: same(content.length ? content[Math.floor(rb() * content.length)] : null, g.anchor),
    };
  });
  const n = rows.length;
  const acc = (k) => Number((rows.filter((r) => r[k]).length / n).toFixed(4));
  const boot = (k, seed) => {
    const r = rng(seed); const o = [];
    for (let b = 0; b < 2000; b++) { let c = 0; for (let i = 0; i < n; i++) if (rows[Math.floor(r() * n)][k]) c++; o.push(c / n); }
    o.sort((a, b) => a - b); return [Number(o[50].toFixed(4)), Number(o[1949].toFixed(4))];
  };
  const mc = (x, y) => {
    const b01 = rows.filter((r) => !r[x] && r[y]).length;
    const b10 = rows.filter((r) => r[x] && !r[y]).length;
    return { [`${y}_wins`]: b01, [`${x}_wins`]: b10, chi2_cc: (b01 + b10) > 0 ? Number((((Math.abs(b01 - b10) - 1) ** 2) / (b01 + b10)).toFixed(3)) : null };
  };
  const sh = [1, 2, 3].map((i) => {
    const spm = shuffledPos(pm, SEED + 811 * i);
    const sr = gold.map((g) => {
      try { const c = composePacked(g.tokens, spm, {}); return same(npAnchor(c, g.tokens.length).anchor, g.anchor); } catch { return false; }
    });
    return Number((sr.filter(Boolean).length / n).toFixed(4));
  });
  return {
    posTypeCoverage: Number((types.filter((t) => pm.has(t)).length / types.length).toFixed(4)),
    n,
    arms: {
      A_phraseLayer: { accuracy: acc('A'), ci95: boot('A', SEED + 1) },
      B_clauseProjection: { accuracy: acc('B_clause'), ci95: boot('B_clause', SEED + 2), note: 'the SEAM-1b path' },
      B_npAnchor: { accuracy: acc('B_np'), ci95: boot('B_np', SEED + 3), answerRate: Number((rows.filter((r) => r.npAnswered).length / n).toFixed(4)) },
    },
    nullBaselines: { lastTaggedNoun: acc('lastNoun'), firstTaggedNoun: acc('firstNoun'), randomContentToken: acc('rand') },
    F1_vs_lastTaggedNoun: mc('lastNoun', 'B_np'),
    F2_vs_phraseLayer: mc('A', 'B_np'),
    F3_shuffledPos_B_np: sh,
  };
}

const out = {
  experiment: 'SEAM-2 — nominal anchor on short NPs (the product envelope)',
  prereg: 'docs/superpowers/evidence/2026-08-19-PREREG-seam-2-np-anchor.md',
  seed: SEED,
  frozenHead: execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(),
  goldSet: {
    builtFrom: 'cache/ud/en_ewt-ud-test.conllu (held out)',
    rule: 'contiguous subtree of a NOUN/PROPN head, 2-6 tokens, UPOS in {DET,ADJ,NOUN,PROPN,NUM}, deduped',
    items: gold.length,
    sample: gold.slice(0, 8).map((g) => ({ phrase: g.tokens.join(' '), anchor: g.anchor })),
  },
  goldPosUsed: false,
  P1_gateLexicon: run(P1, 'P1'),
  P2_liveDict: run(P2, 'P2'),
};
out.checksum = crypto.createHash('sha256').update(JSON.stringify(out)).digest('hex').slice(0, 16);
const outPath = path.join(ROOT, 'docs/superpowers/evidence/2026-08-19-seam-2-np-anchor.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`SEAM-2 written: ${outPath} n=${gold.length} checksum=${out.checksum}`);
