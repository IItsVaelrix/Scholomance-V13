/**
 * ULTIMATE CONSTELLATION DIAGNOSTIC PROFILE
 *
 * One run → one prioritised improvement map.
 * Combines: coverage, containment, cast accuracy, wrongness buckets,
 * gold-in-ensemble ceiling, structural span recall, grimoire fidelity,
 * COP/AUX theory audit, and family-level gaps.
 *
 * Usage:
 *   node scripts/constellation-ultimate-diagnostic.mjs [dev|test|both]
 *
 * PURE measurement (I/O only for corpus + dict + stdout). Does not mutate grammar.
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { parseConllu, goldAnswer } from '../codex/core/constellation/treebank.js';
import { composePacked, projectAnswers } from '../codex/core/constellation/compose-packed.js';
import { runAuditionJury } from '../codex/core/constellation/audition/index.js';
import {
  CONSTRUCTIONS,
  familyInventory,
  constructionByBond,
  CONSTRUCTION_STATUS,
} from '../codex/core/constellation/grimoire/index.js';
import {
  summarizeAnatomy,
  bondKey,
  gradePath,
  anatomyBySignature,
} from '../codex/core/constellation/bond-anatomy.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const WHICH = process.argv[2] || 'dev';
const SPLITS = WHICH === 'both' ? ['dev', 'test'] : [WHICH];

const LEMMA_POS = new Map([
  ['noun', 'n'], ['verb', 'v'], ['adjective', 'a'], ['adverb', 'r'],
]);
const BE = new Set(['is', 'was', 'are', 'were', 'be', 'been', 'being', 'am']);
const lc = (x) => String(x ?? '').toLowerCase();
const sameAnswer = (a, g) =>
  a && g && lc(a.subject) === lc(g.subject) && lc(a.verb) === lc(g.verb);
const pct = (a, b) => (b > 0 ? (100 * a) / b : 0);
const fmt = (a, b) => `${a}/${b} (${pct(a, b).toFixed(1)}%)`;

function loadPosMap() {
  const dict = path.resolve(ROOT, 'scholomance_dict.sqlite');
  if (!existsSync(dict)) throw new Error(`missing ${dict}`);
  const db = new Database(dict, { readonly: true });
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

function subtreeSpan(tokens, id) {
  const kids = new Map();
  for (const t of tokens) {
    if (!kids.has(t.head)) kids.set(t.head, []);
    kids.get(t.head).push(t.id);
  }
  let min = id - 1;
  let max = id - 1;
  let size = 1;
  const walk = (x) => {
    for (const c of kids.get(x) || []) {
      const i = c - 1;
      if (i < min) min = i;
      if (i > max) max = i;
      size += 1;
      walk(c);
    }
  };
  walk(id);
  return { min, max, contiguous: max - min + 1 === size };
}

function allSubtreeSpans(tokens) {
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
  return spans;
}

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

function bucketCast(cast, gold, rec, chart, tokens) {
  if (sameAnswer(cast, gold)) return 'OK';
  const subjRight = cast && lc(cast.subject) === lc(gold.subject);
  const verbRight = cast && lc(cast.verb) === lc(gold.verb);
  if (subjRight && !verbRight) return 'VERB_WRONG';
  const root = rec.tokens.find((t) => t.head === 0);
  const subj = root && rec.tokens.find(
    (t) => t.head === root.id && (t.deprel === 'nsubj' || t.deprel === 'nsubj:pass'),
  );
  if (!subj) return 'BOTH_WRONG_OTHER';
  const s = subtreeSpan(rec.tokens, subj.id);
  const spans = new Set(chart.molecules.map((m) => `${m.from}:${m.to}`));
  const built = s.contiguous && spans.has(`${s.min}:${s.max}`);
  if (!built) return 'SUBJ_MISSING';
  const inside = new Set(tokens.slice(s.min, s.max + 1).map(lc));
  if (cast && cast.subject && inside.has(lc(cast.subject))) return 'SUBJ_HEAD_BUG';
  return 'SUBJ_SELECTION';
}

function diagnoseSplit(split, posMap) {
  const corpus = path.resolve(ROOT, `cache/ud/en_ewt-ud-${split}.conllu`);
  if (!existsSync(corpus)) throw new Error(`missing ${corpus}`);
  const recs = parseConllu(readFileSync(corpus, 'utf8'));
  const bySig = anatomyBySignature();

  const M = {
    split,
    n: recs.length,
    parsed: 0,
    scoreable: 0,
    noGoldSubj: 0,
    contained: 0,
    baselineOk: 0,
    auditionOk: 0,
    goldInEnsemble: 0,
    ensembleSum: 0,
    multiAnswer: 0,
    // wrongness on audition cast
    buckets: {
      OK: 0, VERB_WRONG: 0, SUBJ_MISSING: 0, SUBJ_HEAD_BUG: 0, SUBJ_SELECTION: 0, BOTH_WRONG_OTHER: 0,
    },
    baseBuckets: {
      OK: 0, VERB_WRONG: 0, SUBJ_MISSING: 0, SUBJ_HEAD_BUG: 0, SUBJ_SELECTION: 0, BOTH_WRONG_OTHER: 0,
    },
    // path theory among contained
    pathTheoryClean: 0,
    pathHeadshipClean: 0,
    pathCritical: 0,
    pathScaffold: 0,
    pathApprox: 0,
    // COP probe
    copVpUses: 0,
    copVpGoldAux: 0,
    copVpGoldCop: 0,
    // structural recall
    goldContig: 0,
    goldBuilt: 0,
    nsubjGold: 0,
    nsubjBuilt: 0,
    rootGold: 0,
    rootBuilt: 0,
    byDeprel: new Map(),
    // length
    byLen: {
      '1-5': { n: 0, p: 0, c: 0 },
      '6-12': { n: 0, p: 0, c: 0 },
      '13-20': { n: 0, p: 0, c: 0 },
      '21+': { n: 0, p: 0, c: 0 },
    },
    // failure: no parse — track gold root upos
    failRootUpos: new Map(),
    // bonds on correct paths
    bondHits: new Map(),
    // family status usage on correct paths
    familyOnCorrect: new Map(),
    // selection fixable analysis
    selectionBase: 0,
    selectionFixed: 0,
    ceilingMiss: 0,
    fixedByAudition: 0,
    regressedByAudition: 0,
  };

  for (const rec of recs) {
    const tokens = rec.tokens.map((t) => t.form);
    const len = tokens.length;
    const lb = len <= 5 ? '1-5' : len <= 12 ? '6-12' : len <= 20 ? '13-20' : '21+';
    M.byLen[lb].n += 1;

    const chart = composePacked(tokens, posMap);
    const gold = goldAnswer(rec);
    const rootTok = rec.tokens.find((t) => t.head === 0);
    const rootUpos = rootTok ? rootTok.upos : 'NONE';

    // structural recall (all sentences)
    const gspans = allSubtreeSpans(rec.tokens);
    const chartSpans = new Set(chart.molecules.map((m) => `${m.from}:${m.to}`));
    for (const t of rec.tokens) {
      const sp = gspans.get(t.id);
      if (!sp || !sp.contiguous) continue;
      M.goldContig += 1;
      const built = chartSpans.has(`${sp.min}:${sp.max}`);
      if (built) M.goldBuilt += 1;
      if (!M.byDeprel.has(t.deprel)) M.byDeprel.set(t.deprel, { gold: 0, built: 0 });
      const e = M.byDeprel.get(t.deprel);
      e.gold += 1;
      if (built) e.built += 1;
      if (t.deprel === 'nsubj' || t.deprel === 'nsubj:pass') {
        M.nsubjGold += 1;
        if (built) M.nsubjBuilt += 1;
      }
      if (t.head === 0) {
        M.rootGold += 1;
        if (built) M.rootBuilt += 1;
      }
    }

    if (chart.stable.length === 0) {
      M.failRootUpos.set(rootUpos, (M.failRootUpos.get(rootUpos) || 0) + 1);
      continue;
    }
    M.parsed += 1;
    M.byLen[lb].p += 1;

    const ensemble = [];
    const seen = new Set();
    for (const s of chart.stable) {
      for (const a of projectAnswers(s)) {
        const k = `${lc(a.subject)}|${lc(a.verb)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        ensemble.push(a);
      }
    }
    M.ensembleSum += ensemble.length;
    if (ensemble.length > 1) M.multiAnswer += 1;

    const inEnsemble = ensemble.some((a) => sameAnswer(a, gold));
    if (inEnsemble) {
      M.contained += 1;
      M.byLen[lb].c += 1;
    }

    const hasNsubj = rec.tokens.some(
      (t) => t.deprel === 'nsubj' || t.deprel === 'nsubj:pass',
    );
    if (!hasNsubj || !gold.verb) {
      M.noGoldSubj += 1;
      continue;
    }
    M.scoreable += 1;
    if (inEnsemble) M.goldInEnsemble += 1;
    else M.ceilingMiss += 1;

    const baselineList = projectAnswers(chart.stable[0]);
    const baselineCast = baselineList[0] || null;
    const { cast: auditionCast } = runAuditionJury(tokens, chart, { source: 'packed-stable' });

    const baseOk = sameAnswer(baselineCast, gold);
    const audOk = sameAnswer(auditionCast, gold);
    if (baseOk) M.baselineOk += 1;
    if (audOk) M.auditionOk += 1;
    if (!baseOk && audOk) M.fixedByAudition += 1;
    if (baseOk && !audOk) M.regressedByAudition += 1;

    const bB = bucketCast(baselineCast, gold, rec, chart, tokens);
    const aB = bucketCast(auditionCast, gold, rec, chart, tokens);
    M.baseBuckets[bB] += 1;
    M.buckets[aB] += 1;
    if (bB === 'SUBJ_SELECTION') {
      M.selectionBase += 1;
      if (audOk) M.selectionFixed += 1;
    }

    if (inEnsemble) {
      const sigs = new Set();
      for (const root of chart.stable) {
        if (projectAnswers(root).some((a) => sameAnswer(a, gold))) {
          collectBondSigs(root, sigs);
        }
      }
      if (sigs.size === 0) {
        for (const root of chart.stable) collectBondSigs(root, sigs);
      }
      const graded = gradePath([...sigs], bySig);
      if (graded.theoryClean) M.pathTheoryClean += 1;
      if (graded.headshipClean) M.pathHeadshipClean += 1;
      if (graded.criticalHit) M.pathCritical += 1;
      if (graded.usedScaffold) M.pathScaffold += 1;
      if (graded.usedApproximation) M.pathApprox += 1;

      for (const sig of sigs) {
        M.bondHits.set(sig, (M.bondHits.get(sig) || 0) + 1);
        const parts = sig.split(/[+\->]+/).filter(Boolean);
        // sig is LEFT+RIGHT->RESULT
        const m = /^([^+]+)\+([^-]+)->(.+)$/.exec(sig);
        if (m) {
          const c = constructionByBond(m[1], m[2], m[3]);
          if (c) {
            if (!M.familyOnCorrect.has(c.family)) {
              M.familyOnCorrect.set(c.family, {
                family: c.family, hits: 0, grammar: 0, scaffold: 0, approximation: 0,
              });
            }
            const fr = M.familyOnCorrect.get(c.family);
            fr.hits += 1;
            fr[c.status] += 1;
          }
        }
      }

      const usedCopVp = sigs.has('COP+VP->VP');
      if (usedCopVp) {
        M.copVpUses += 1;
        const beMeta = rec.tokens.filter((t) => BE.has(lc(t.form)));
        if (beMeta.some((t) => t.deprel === 'aux' || t.deprel === 'aux:pass')) {
          M.copVpGoldAux += 1;
        }
        if (beMeta.some((t) => t.deprel === 'cop')) M.copVpGoldCop += 1;
      }
    }
  }

  return M;
}

function prioritise(profile, anatomy, inventory) {
  const items = [];
  const scored = Math.max(profile.scoreable, 1);
  const n = Math.max(profile.n, 1);
  const contained = Math.max(profile.goldInEnsemble, 1);

  // P0 — coverage / grammar growth
  const unparsed = profile.n - profile.parsed;
  items.push({
    priority: 'P0',
    area: 'grammar-coverage',
    title: 'Most sentences never form a spanning S',
    evidence: `${fmt(profile.parsed, profile.n)} coverage; ${unparsed} unparsed`,
    impact: 'Corpus-level accuracy ceiling is ~coverage × containment rate',
    action: 'Grow bond families from failure categories (punct, root, obl, conj, nmod) — measured sole-cause list',
    metric: `coverage ${pct(profile.parsed, n).toFixed(1)}% → target 35%+`,
  });

  items.push({
    priority: 'P0',
    area: 'root-span',
    title: 'Gold root spans rarely built',
    evidence: fmt(profile.rootBuilt, profile.rootGold),
    impact: 'Local NP/PP structure exists; clause glue missing',
    action: 'Bonds that close S over real roots (verbal + nominal/adj web roots)',
    metric: `root span recall ${pct(profile.rootBuilt, profile.rootGold).toFixed(1)}%`,
  });

  // P1 — theory bugs that fire on correct answers
  if (profile.copVpUses > 0) {
    items.push({
      priority: 'P1',
      area: 'cop-vs-aux',
      title: 'COP+VP mislabels progressive/passive be',
      evidence: `${fmt(profile.copVpGoldAux, profile.copVpUses)} of COP+VP uses on correct paths have gold aux/aux:pass`,
      impact: 'Right head, wrong theory — poisons phrasing if trusted as cop',
      action: 'Retype be+V as AUX (or deprecate cop-vp-mislabel); keep head on VP',
      metric: `copVpGoldAux rate ${pct(profile.copVpGoldAux, profile.copVpUses).toFixed(0)}%`,
    });
  }

  items.push({
    priority: 'P1',
    area: 'theory-clean-paths',
    title: 'Correct answers almost never fully theory-clean',
    evidence: fmt(profile.pathTheoryClean, profile.goldInEnsemble),
    impact: 'Winning trees carry scaffolds/approximations as if grammar',
    action: 'Consumers must check mayClaimLinguisticFact; shrink approximation mass in hot families',
    metric: `theory-clean ${pct(profile.pathTheoryClean, contained).toFixed(1)}%; headship-clean ${pct(profile.pathHeadshipClean, contained).toFixed(1)}%`,
  });

  // P1 — selection / decision
  const castGap = profile.goldInEnsemble - profile.auditionOk;
  items.push({
    priority: 'P1',
    area: 'decision-cast',
    title: 'Gold often in ensemble but not cast',
    evidence: `ceiling ${fmt(profile.goldInEnsemble, profile.scoreable)}; cast ${fmt(profile.auditionOk, profile.scoreable)}; gap ${castGap}`,
    impact: 'Decision accuracy lags containment',
    action: 'Improve audition judges; projection of competing roots',
    metric: `cast ${pct(profile.auditionOk, scored).toFixed(1)}% vs ceiling ${pct(profile.goldInEnsemble, scored).toFixed(1)}%`,
  });

  items.push({
    priority: 'P1',
    area: 'selection-bucket',
    title: 'Different-span / wrong-subject residual',
    evidence: `audition SUBJ_SELECTION ${fmt(profile.buckets.SUBJ_SELECTION, profile.scoreable)}; baseline fixed ${fmt(profile.selectionFixed, profile.selectionBase)}`,
    impact: 'Dominant residual among scoreable wrongs after head-declaration',
    action: 'Ensemble growth first; then cast; generalized projection descent',
    metric: `selection ${pct(profile.buckets.SUBJ_SELECTION, scored).toFixed(1)}% of scoreable`,
  });

  // P2 — family fidelity from grimoire
  for (const f of inventory) {
    if (f.approximation >= 3 && f.grammar === 0) {
      items.push({
        priority: 'P2',
        area: `family:${f.family}`,
        title: `Family "${f.family}" has no pure grammar entries`,
        evidence: `n=${f.total} G:${f.grammar} S:${f.scaffold} A:${f.approximation}`,
        impact: 'Entire family is approximation/scaffold — high fiction risk',
        action: `Promote one construction in ${f.family} to measured grammar or split approximations`,
        metric: `approximation-only family`,
      });
    }
  }

  // length cliff
  const long = profile.byLen['21+'];
  if (long.n > 0 && pct(long.p, long.n) < 10) {
    items.push({
      priority: 'P2',
      area: 'length-cliff',
      title: 'Long sentences almost never parse',
      evidence: `21+ tokens: coverage ${fmt(long.p, long.n)}, containment ${fmt(long.c, long.n)}`,
      impact: 'Web/news sentences dominate residual unparsed mass',
      action: 'Punct, conj, multi-clause, and attachment rules under measurement',
      metric: `21+ coverage ${pct(long.p, long.n).toFixed(1)}%`,
    });
  }

  // headship is strong — note as protect
  items.push({
    priority: 'PROTECT',
    area: 'headship',
    title: 'Headship spine is strong — do not regress',
    evidence: `table H-green ${(anatomy.headshipGreenRate * 100).toFixed(1)}%; path headship-clean ${fmt(profile.pathHeadshipClean, profile.goldInEnsemble)}`,
    impact: 'Core UD content-head alignment',
    action: 'Any bond edit must keep head indices + validateBonds + anatomy grades H',
    metric: 'H ≥ 90% green',
  });

  // local structure strength
  items.push({
    priority: 'PROTECT',
    area: 'local-spans',
    title: 'Local constituent span recall is a strength',
    evidence: `all contiguous ${fmt(profile.goldBuilt, profile.goldContig)}; nsubj ${fmt(profile.nsubjBuilt, profile.nsubjGold)}`,
    impact: 'Grammar is not random; grow from this base',
    action: 'Prefer new bonds that close roots/clauses without destroying local recall',
    metric: `span recall ${pct(profile.goldBuilt, profile.goldContig).toFixed(1)}%`,
  });

  const order = { P0: 0, P1: 1, P2: 2, PROTECT: 3 };
  items.sort((a, b) => order[a.priority] - order[b.priority] || a.area.localeCompare(b.area));
  return items;
}

// ── run ────────────────────────────────────────────────────────────────────
const posMap = loadPosMap();
const anatomy = summarizeAnatomy();
const inventory = familyInventory();
const profiles = {};

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║     CONSTELLATION ULTIMATE DIAGNOSTIC PROFILE                    ║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

for (const split of SPLITS) {
  console.log(`… measuring ${split} …`);
  profiles[split] = diagnoseSplit(split, posMap);
}

function printProfile(M) {
  console.log(`\n━━━━━━━━━━━━━━━━  ${M.split.toUpperCase()}  ━━━━━━━━━━━━━━━━\n`);
  console.log('1. CORPUS REACH');
  console.log(`   sentences                 ${M.n}`);
  console.log(`   coverage (spanning S)     ${fmt(M.parsed, M.n)}`);
  console.log(`   containment (all sents)   ${fmt(M.contained, M.n)}`);
  console.log(`   scoreable (nsubj+verb)    ${M.scoreable}  (no gold nsubj among parsed: ${M.noGoldSubj})`);
  console.log(`   gold-in-ensemble ceiling  ${fmt(M.goldInEnsemble, M.scoreable)}`);
  console.log(`   baseline cast             ${fmt(M.baselineOk, M.scoreable)}`);
  console.log(`   audition cast             ${fmt(M.auditionOk, M.scoreable)}  (Δ ${M.auditionOk - M.baselineOk >= 0 ? '+' : ''}${M.auditionOk - M.baselineOk})`);
  console.log(`   mean ensemble size        ${(M.ensembleSum / Math.max(M.parsed, 1)).toFixed(2)}  multi-answer ${fmt(M.multiAnswer, M.parsed)}`);

  console.log('\n2. WRONGNESS (single cast, scoreable)');
  console.log('   bucket                    baseline     audition');
  for (const k of ['OK', 'VERB_WRONG', 'SUBJ_MISSING', 'SUBJ_HEAD_BUG', 'SUBJ_SELECTION', 'BOTH_WRONG_OTHER']) {
    console.log(
      `   ${k.padEnd(24)} ${String(M.baseBuckets[k]).padStart(4)} ${pct(M.baseBuckets[k], M.scoreable).toFixed(1).padStart(6)}%`
      + `   ${String(M.buckets[k]).padStart(4)} ${pct(M.buckets[k], M.scoreable).toFixed(1).padStart(6)}%`,
    );
  }

  console.log('\n3. STRUCTURAL SPAN RECALL (all sentences)');
  console.log(`   contiguous gold spans     ${fmt(M.goldBuilt, M.goldContig)}`);
  console.log(`   gold nsubj spans          ${fmt(M.nsubjBuilt, M.nsubjGold)}`);
  console.log(`   gold root spans           ${fmt(M.rootBuilt, M.rootGold)}`);
  console.log('   top deprels by gap (gold−built):');
  const gaps = [...M.byDeprel.entries()]
    .map(([d, e]) => ({ d, gap: e.gold - e.built, gold: e.gold, built: e.built, rate: pct(e.built, e.gold) }))
    .filter((x) => x.gold >= 50)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 10);
  for (const g of gaps) {
    console.log(`     ${g.d.padEnd(14)} built ${fmt(g.built, g.gold).padEnd(18)} gap ${g.gap}`);
  }

  console.log('\n4. LENGTH CLIFF');
  for (const [k, v] of Object.entries(M.byLen)) {
    console.log(`   ${k.padEnd(6)} n=${String(v.n).padStart(4)}  cov ${pct(v.p, v.n).toFixed(1).padStart(5)}%  cont ${pct(v.c, v.n).toFixed(1).padStart(5)}%`);
  }

  console.log('\n5. PATH LEGITIMACY (among gold-in-ensemble)');
  console.log(`   theory-clean              ${fmt(M.pathTheoryClean, M.goldInEnsemble)}`);
  console.log(`   headship-clean            ${fmt(M.pathHeadshipClean, M.goldInEnsemble)}`);
  console.log(`   used scaffold             ${fmt(M.pathScaffold, M.goldInEnsemble)}`);
  console.log(`   used approximation        ${fmt(M.pathApprox, M.goldInEnsemble)}`);
  console.log(`   critical flag             ${fmt(M.pathCritical, M.goldInEnsemble)}`);
  console.log(`   COP+VP uses               ${M.copVpUses}  gold-aux ${fmt(M.copVpGoldAux, M.copVpUses)}  gold-cop ${fmt(M.copVpGoldCop, M.copVpUses)}`);

  console.log('\n6. UNPARSED BY GOLD ROOT UPOS (top)');
  for (const [u, c] of [...M.failRootUpos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`   ${u.padEnd(8)} ${c}`);
  }
}

for (const split of SPLITS) {
  printProfile(profiles[split]);
}

// Grimoire snapshot
console.log('\n━━━━━━━━━━━━━━━━  GRIMOIRE  ━━━━━━━━━━━━━━━━\n');
console.log(`   constructions             ${CONSTRUCTIONS.length}`);
console.log(`   status                    grammar=${anatomy.byStatus.grammar} scaffold=${anatomy.byStatus.scaffold} approximation=${anatomy.byStatus.approximation} deprecated=${anatomy.byStatus.deprecated}`);
console.log(`   headship green            ${anatomy.headshipGreen}/${anatomy.n} (${(anatomy.headshipGreenRate * 100).toFixed(1)}%)`);
console.log(`   all-four green            ${anatomy.allGreen}/${anatomy.n} (${(anatomy.allGreenRate * 100).toFixed(1)}%)`);
console.log('\n   family fidelity:');
for (const f of inventory) {
  const mark = f.grammar === 0 && f.approximation > 0 ? '△' : f.scaffold > f.grammar ? 'scaff' : '·';
  console.log(
    `   ${mark} ${f.family.padEnd(18)} n=${String(f.total).padStart(2)}  G:${f.grammar} S:${f.scaffold} A:${f.approximation}`,
  );
}

// Prioritized backlog from primary split
const primary = profiles[SPLITS[0]];
const backlog = prioritise(primary, anatomy, inventory);

console.log('\n━━━━━━━━━━━━━━━━  IMPROVEMENT BACKLOG  ━━━━━━━━━━━━━━━━\n');
let last = '';
for (const item of backlog) {
  if (item.priority !== last) {
    console.log(`\n▸ ${item.priority}\n`);
    last = item.priority;
  }
  console.log(`  [${item.area}] ${item.title}`);
  console.log(`     evidence:  ${item.evidence}`);
  console.log(`     impact:    ${item.impact}`);
  console.log(`     action:    ${item.action}`);
  console.log(`     metric:    ${item.metric}`);
  console.log('');
}

// Write evidence markdown
const evidencePath = path.resolve(
  ROOT,
  `docs/superpowers/evidence/2026-08-08-constellation-ultimate-diagnostic.md`,
);

function mdProfile(M) {
  return `
## ${M.split}

| Metric | Value |
|---|---|
| Sentences | ${M.n} |
| Coverage | ${fmt(M.parsed, M.n)} |
| Containment | ${fmt(M.contained, M.n)} |
| Scoreable | ${M.scoreable} |
| Gold-in-ensemble | ${fmt(M.goldInEnsemble, M.scoreable)} |
| Baseline cast | ${fmt(M.baselineOk, M.scoreable)} |
| Audition cast | ${fmt(M.auditionOk, M.scoreable)} |
| Span recall (contiguous) | ${fmt(M.goldBuilt, M.goldContig)} |
| nsubj span recall | ${fmt(M.nsubjBuilt, M.nsubjGold)} |
| root span recall | ${fmt(M.rootBuilt, M.rootGold)} |
| Theory-clean paths | ${fmt(M.pathTheoryClean, M.goldInEnsemble)} |
| Headship-clean paths | ${fmt(M.pathHeadshipClean, M.goldInEnsemble)} |
| COP+VP with gold aux | ${fmt(M.copVpGoldAux, M.copVpUses)} |

### Audition wrongness (scoreable)

| Bucket | Baseline | Audition |
|---|---|---|
${['OK', 'VERB_WRONG', 'SUBJ_MISSING', 'SUBJ_HEAD_BUG', 'SUBJ_SELECTION'].map((k) =>
    `| ${k} | ${M.baseBuckets[k]} (${pct(M.baseBuckets[k], M.scoreable).toFixed(1)}%) | ${M.buckets[k]} (${pct(M.buckets[k], M.scoreable).toFixed(1)}%) |`).join('\n')}

### Length cliff

| Len | n | Coverage | Containment |
|---|---|---|---|
${Object.entries(M.byLen).map(([k, v]) =>
    `| ${k} | ${v.n} | ${pct(v.p, v.n).toFixed(1)}% | ${pct(v.c, v.n).toFixed(1)}% |`).join('\n')}
`;
}

const md = `# Constellation Ultimate Diagnostic — 2026-08-08

**Instrument:** \`scripts/constellation-ultimate-diagnostic.mjs\`  
**Splits:** ${SPLITS.join(', ')}  
**Parser:** packed chart + audition cast + Grimoire ontology

## Executive summary

| | ${SPLITS.map((s) => s).join(' | ')} |
|---|${SPLITS.map(() => '---').join('|')}|
| Coverage | ${SPLITS.map((s) => pct(profiles[s].parsed, profiles[s].n).toFixed(1) + '%').join(' | ')} |
| Containment | ${SPLITS.map((s) => pct(profiles[s].contained, profiles[s].n).toFixed(1) + '%').join(' | ')} |
| Audition cast (scoreable) | ${SPLITS.map((s) => pct(profiles[s].auditionOk, profiles[s].scoreable).toFixed(1) + '%').join(' | ')} |
| Gold-in-ensemble | ${SPLITS.map((s) => pct(profiles[s].goldInEnsemble, profiles[s].scoreable).toFixed(1) + '%').join(' | ')} |
| Span recall | ${SPLITS.map((s) => pct(profiles[s].goldBuilt, profiles[s].goldContig).toFixed(1) + '%').join(' | ')} |
| Root span recall | ${SPLITS.map((s) => pct(profiles[s].rootBuilt, profiles[s].rootGold).toFixed(1) + '%').join(' | ')} |

**Spine is sound (headship, local spans). Ceiling is grammar coverage + ensemble membership. Theory dirt (COP/AUX, approximations) rides on correct answers.**

${SPLITS.map((s) => mdProfile(profiles[s])).join('\n')}

## Grimoire

| Status | n |
|---|---|
| grammar | ${anatomy.byStatus.grammar} |
| scaffold | ${anatomy.byStatus.scaffold} |
| approximation | ${anatomy.byStatus.approximation} |
| deprecated | ${anatomy.byStatus.deprecated} |
| Headship green | ${anatomy.headshipGreen}/${anatomy.n} |

### Families

| Family | n | G | S | A |
|---|---|---|---|---|
${inventory.map((f) => `| ${f.family} | ${f.total} | ${f.grammar} | ${f.scaffold} | ${f.approximation} |`).join('\n')}

## Prioritised improvement backlog

${backlog.map((item) => `### ${item.priority} — ${item.title}

- **Area:** \`${item.area}\`
- **Evidence:** ${item.evidence}
- **Impact:** ${item.impact}
- **Action:** ${item.action}
- **Metric:** ${item.metric}
`).join('\n')}

## Repro

\`\`\`bash
node scripts/constellation-ultimate-diagnostic.mjs both
\`\`\`
`;

writeFileSync(evidencePath, md);
console.log(`\n── evidence written ──\n   ${evidencePath}\n`);
