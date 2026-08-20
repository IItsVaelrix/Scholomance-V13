#!/usr/bin/env node
/**
 * SEAM-1 — does the sentence layer answer what the phrase layer gets wrong?
 *
 * Prereg: docs/superpowers/evidence/2026-08-19-PREREG-seam-1-phrase-vs-sentence-layer.md
 *
 * Both layers of ConstellationOS are scored on THE PRODUCT'S objective — the phrase's
 * nominal anchor (UD nsubj) — never on UD's clause head, which the product vetoes.
 * Neither arm sees gold POS.
 *
 * Research/diagnostic. Reads files, prints JSON. Modifies nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseConllu, goldAnswer } from '../codex/core/constellation/treebank.js';
import { composePacked, projectAnswers } from '../codex/core/constellation/compose-packed.js';
import { pickResonantDerivation } from '../codex/core/constellation/resonance-beacon.js';
import { selectHeadToken } from '../codex/core/constellation/phraseAnalysis.js';
import { createLexiconAdapter } from '../codex/server/adapters/lexicon.sqlite.adapter.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED = Number(process.env.SEAM_SEED || 20260819);
const N = Number(process.env.SEAM_N || 600);
const MAX_TOKENS = 28;

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

// ---------- corpus ----------
const testRecords = parseConllu(fs.readFileSync(path.join(ROOT, 'cache/ud/en_ewt-ud-test.conllu'), 'utf8'));
const trainText = fs.readFileSync(path.join(ROOT, 'cache/ud/en_ewt-ud-train.conllu'), 'utf8');

// frequencies from TRAIN only — never the split under test
const freqMap = new Map();
for (const line of trainText.split('\n')) {
  if (!line || line[0] === '#') continue;
  const f = line.split('\t');
  if (f.length < 4 || f[0].includes('-')) continue;
  const w = f[1].toLowerCase();
  freqMap.set(w, (freqMap.get(w) || 0) + 1);
}

// frozen, real, non-gold POS table
const rawLex = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/qa/fixtures/constellation/treebank-gate-lexicon.json'), 'utf8'));
const posMap = new Map(Object.entries(rawLex).map(([w, tags]) => [w, Array.isArray(tags) ? tags : []]));

// ---------- eligible population ----------
const eligible = [];
let skippedTooLong = 0, skippedNoSubject = 0;
const NOMINAL_ONLY = process.env.SEAM_NOMINAL_ONLY === '1';
let skippedPronounSubject = 0;
for (const r of testRecords) {
  const gold = goldAnswer(r);
  if (!gold.subject) { skippedNoSubject += 1; continue; }
  if (r.tokens.length > MAX_TOKENS) { skippedTooLong += 1; continue; }
  if (NOMINAL_ONLY) {
    // SEAM-1b: the phrase layer's STOPWORDS blocks every subject pronoun, so a pronoun
    // subject is out of scope for arm A BY DESIGN. Restricting to NOUN/PROPN is what makes
    // the two arms comparable at all. Declared from that mechanism, before running.
    const root = r.tokens.find((t) => t.head === 0);
    const subj = root && r.tokens.find((t) => t.head === root.id && (t.deprel === 'nsubj' || t.deprel === 'nsubj:pass'));
    if (!subj || (subj.upos !== 'NOUN' && subj.upos !== 'PROPN')) { skippedPronounSubject += 1; continue; }
  }
  eligible.push({ record: r, gold });
}
const rnd = rng(SEED);
const pool = eligible.slice();
for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
const sample = NOMINAL_ONLY ? eligible.slice() : pool.slice(0, Math.min(N, pool.length));

// ---------- P2: the live POS source (what constellationPage.service.js actually calls) ----------
const sampleTypes = [...new Set(sample.flatMap(({ record }) => record.tokens.map((t) => String(t.form).toLowerCase())))];
let livePosMap = new Map();
let livePosError = null;
try {
  const adapter = createLexiconAdapter(path.join(ROOT, 'scholomance_dict.sqlite'));
  const CHUNK = 400;
  for (let i = 0; i < sampleTypes.length; i += CHUNK) {
    const tags = adapter.batchLookupPos(sampleTypes.slice(i, i + CHUNK)) || {};
    for (const [w, list] of Object.entries(tags)) livePosMap.set(w, Array.isArray(list) ? list : []);
  }
} catch (e) { livePosError = String(e && e.message); }

// ---------- shuffled POS control (§5): permute value-lists across keys ----------
function shuffledPosMap(seed, sourceMap) {
  const keys = [...sourceMap.keys()];
  const vals = [...sourceMap.values()];
  const r = rng(seed);
  for (let i = vals.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [vals[i], vals[j]] = [vals[j], vals[i]]; }
  return new Map(keys.map((k, i) => [k, vals[i]]));
}

// ---------- null baselines (§23: plausible-wrong, not empty) ----------
function firstTaggedNoun(tokens, pm) {
  for (const t of tokens) if ((pm.get(t.toLowerCase()) || []).includes('n')) return t;
  return null;
}
const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'and', 'is', 'was', 'it', 'that', 'for', 'on', 'with', 'as', 'at', 'by', 'this', 'be', 'are']);
const isWord = (t) => /[A-Za-z0-9]/.test(t);
function lastContentToken(tokens) {
  for (let i = tokens.length - 1; i >= 0; i--) if (isWord(tokens[i]) && !STOP.has(tokens[i].toLowerCase())) return tokens[i];
  return null;
}
function randomContentToken(tokens, r) {
  const c = tokens.filter((t) => isWord(t) && !STOP.has(t.toLowerCase()));
  return c.length ? c[Math.floor(r() * c.length)] : null;
}

// ---------- run ----------
function runArms(pm, tag) {
  const rows = [];
  let threw = 0;
  const rb = rng(SEED + 31);
  for (const { record, gold } of sample) {
    const tokens = record.tokens.map((t) => t.form);
    // A — shipped phrase layer
    let aTok = null;
    try { aTok = selectHeadToken(tokens, freqMap, pm); } catch { /* counted below */ }
    const aRight = same(aTok, gold.subject);

    // B — sentence layer
    let contained = false, decided = false, decidedCanonical = false, parsed = false;
    try {
      const result = composePacked(tokens, pm, {});
      parsed = result.stable.length > 0;
      const answers = result.stable.flatMap((s) => projectAnswers(s));
      contained = answers.some((x) => same(x.subject, gold.subject));
      if (result.ranked && result.ranked.length > 0) {
        const top = projectAnswers(result.ranked[0].molecule);
        decided = top.length > 0 && same(top[0].subject, gold.subject);
        // the decision rule runTreebank's packed path actually uses
        try {
          const picked = pickResonantDerivation(result.ranked[0].molecule, result.field, {}.bonds);
          decidedCanonical = Boolean(picked && picked.answer && same(picked.answer.subject, gold.subject));
        } catch { /* canonical rule unavailable for this molecule */ }
      }
    } catch { threw += 1; }

    rows.push({
      sentId: record.sentId,
      n: tokens.length,
      gold: gold.subject,
      aRight,
      parsed,
      contained,
      decided,
      decidedCanonical,
      baseNoun: same(firstTaggedNoun(tokens, pm), gold.subject),
      baseLast: same(lastContentToken(tokens), gold.subject),
      baseRand: same(randomContentToken(tokens, rb), gold.subject),
    });
  }
  return { tag, rows, threw };
}

const pct = (k, n) => (n ? Number((k / n).toFixed(4)) : 0);
function boot(rows, pred, seed) {
  const r = rng(seed); const out = [];
  for (let b = 0; b < 2000; b++) {
    let k = 0;
    for (let i = 0; i < rows.length; i++) if (pred(rows[Math.floor(r() * rows.length)])) k += 1;
    out.push(k / rows.length);
  }
  out.sort((a, b) => a - b);
  return [Number(out[50].toFixed(4)), Number(out[1949].toFixed(4))];
}

function analyse(pm, label) {
  const real = runArms(pm, `${label}-real`);
  const shufRuns = [0, 1, 2].map((i) => runArms(shuffledPosMap(SEED + 977 * (i + 1), pm), `${label}-shuffled-${i}`));
  const R = real.rows;
  const n = R.length;
  const aRight = R.filter((r) => r.aRight).length;
  const bDecided = R.filter((r) => r.decided).length;
  const bContained = R.filter((r) => r.contained).length;
  const parsed = R.filter((r) => r.parsed).length;
  const aWrong = R.filter((r) => !r.aRight);
  const aRightRows = R.filter((r) => r.aRight);
  const bOnAWrong = aWrong.filter((r) => r.decided).length;
  const bOnARight = aRightRows.filter((r) => r.decided).length;
  const b01 = R.filter((r) => !r.aRight && r.decided).length;
  const b10 = R.filter((r) => r.aRight && !r.decided).length;
  const mcnemar = (b01 + b10) > 0 ? Number((((Math.abs(b01 - b10) - 1) ** 2) / (b01 + b10)).toFixed(3)) : null;
  return {
    posTypeCoverage: Number((sampleTypes.filter((t) => pm.has(t)).length / sampleTypes.length).toFixed(4)),
    arms: {
      A_phraseLayer_selectHeadToken: { correct: aRight, n, accuracy: pct(aRight, n), ci95: boot(R, (r) => r.aRight, SEED + 1) },
      B_sentenceLayer_decided: { correct: bDecided, n, accuracy: pct(bDecided, n), ci95: boot(R, (r) => r.decided, SEED + 2) },
      B_canonical_resonantDerivation: { correct: R.filter((r) => r.decidedCanonical).length, n, accuracy: pct(R.filter((r) => r.decidedCanonical).length, n), ci95: boot(R, (r) => r.decidedCanonical, SEED + 3), note: "runTreebank's packed decision rule" },
      B_sentenceLayer_contained: { correct: bContained, n, accuracy: pct(bContained, n), note: 'upper bound: any derivation carries the right subject' },
      parseRate: { parsed, n, rate: pct(parsed, n) },
    },
    nullBaselines: {
      firstTaggedNoun: pct(R.filter((r) => r.baseNoun).length, n),
      lastContentToken: pct(R.filter((r) => r.baseLast).length, n),
      randomContentToken: pct(R.filter((r) => r.baseRand).length, n),
    },
    F2_complementarity: {
      aWrong_n: aWrong.length,
      B_correct_where_A_wrong: bOnAWrong,
      B_accuracy_where_A_wrong: pct(bOnAWrong, aWrong.length),
      B_accuracy_where_A_right: pct(bOnARight, aRightRows.length),
      B_overall_baseRate: pct(bDecided, n),
      discordant_B_rescues_A: b01,
      discordant_B_loses_what_A_had: b10,
      mcnemar_chi2_cc: mcnemar,
      unionCeiling: pct(R.filter((r) => r.aRight || r.decided).length, n),
    },
    F3_shuffledPosControl: shufRuns.map((sr) => ({
      tag: sr.tag,
      A_accuracy: pct(sr.rows.filter((r) => r.aRight).length, sr.rows.length),
      B_decided_accuracy: pct(sr.rows.filter((r) => r.decided).length, sr.rows.length),
      B_parseRate: pct(sr.rows.filter((r) => r.parsed).length, sr.rows.length),
    })),
    threw: real.threw,
  };
}

const importedWip = ['codex/core/constellation/compose-packed.js', 'codex/core/constellation/compose.js',
  'codex/core/constellation/grimoire/index.js', 'codex/core/constellation/resonance-beacon.js'];
const dirty = new Set(execSync('git status --porcelain', { cwd: ROOT }).toString().split('\n')
  .map((l) => (l.match(/^..\s+(.+)$/) || [])[1]).filter(Boolean));

const out = {
  experiment: 'SEAM-1 — sentence layer vs phrase layer on the PRODUCT objective (nominal anchor)',
  prereg: 'docs/superpowers/evidence/2026-08-19-PREREG-seam-1-phrase-vs-sentence-layer.md',
  seed: SEED,
  frozenHead: execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(),
  corpus: { file: 'cache/ud/en_ewt-ud-test.conllu', totalSentences: testRecords.length, heldOutFromGate: true },
  population: { eligible: eligible.length, skippedNoSubject, skippedTooLong, skippedPronounSubject, sampled: sample.length, nominalOnly: NOMINAL_ONLY },
  freqSource: { file: 'cache/ud/en_ewt-ud-train.conllu', types: freqMap.size },
  goldPosUsed: false,
  livePosError,
  wipProvenance: importedWip.map((f) => ({
    file: f, git: dirty.has(f) ? 'DIRTY' : 'clean',
    sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex').slice(0, 16),
  })),
  P1_gateLexicon_asPreregistered: analyse(posMap, 'P1'),
  P2_liveDict_productFaithful: analyse(livePosMap, 'P2'),
};
out.checksum = crypto.createHash('sha256').update(JSON.stringify(out)).digest('hex').slice(0, 16);

// The sqlite lexicon adapter logs to stdout on connect, so the report goes to a file
// rather than being interleaved with connection chatter.
const outPath = process.env.SEAM_OUT || path.join(ROOT, 'docs/superpowers/evidence/2026-08-19-seam-1-phrase-vs-sentence.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`SEAM-1 written: ${outPath} checksum=${out.checksum}`);
