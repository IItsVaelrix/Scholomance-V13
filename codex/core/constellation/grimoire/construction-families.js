/**
 * CONSTRUCTION FAMILIES — the autopsy, as an instrument the reactor can call.
 *
 * A bond that raises coverage has not thereby earned a name. The question that
 * separates a law from a multi-tool is:
 *
 *   Of the firings that actually produced the gain, what fraction correspond to
 *   a real gold dependency edge, and do they all correspond to the SAME edge?
 *
 * `NP+NP→NP` bought 241 DEV sentences and was refused promotion because 44% of
 * its firings had no gold edge at all and the rest scattered over compound /
 * modifier / nsubj / case. This module makes that verdict a number instead of a
 * hand-read table.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/grimoire/construction-families
 */

import { composePacked } from '../compose-packed.js';

/**
 * Families that mean "the bond joined two spans with no gold edge between
 * them" — the bond invented the constituent. Excluded from licensed mass.
 */
export const UNLICENSED_FAMILIES = Object.freeze([
  'juxtaposition-orphan',
  'flat-name-orphan',
  'no-direct-gold-link',
]);

const UNLICENSED = new Set(UNLICENSED_FAMILIES);

/** Gold tokens keyed to 0-based chart indices. */
export function goldByIndex(rec) {
  return rec.tokens.map((t) => ({
    i: t.id - 1,
    id: t.id,
    form: t.form,
    lemma: t.lemma,
    upos: t.upos,
    head: t.head,
    deprel: t.deprel,
  }));
}

/**
 * Gold dependencies with one endpoint in span A and the other in span B.
 * Both spans are inclusive and 0-based.
 */
export function goldLinksBetween(gold, a0, a1, b0, b1) {
  const inA = (i) => i >= a0 && i <= a1;
  const inB = (i) => i >= b0 && i <= b1;
  const byIndex = new Map(gold.map((g) => [g.i, g]));
  const links = [];
  for (const t of gold) {
    if (t.head === 0) continue;
    const hi = t.head - 1;
    const other = byIndex.get(hi);
    if (inA(t.i) && inB(hi)) {
      links.push({
        deprel: t.deprel, dir: 'B→A', dep: t.form, head: other?.form,
        depUpos: t.upos, headUpos: other?.upos,
      });
    } else if (inB(t.i) && inA(hi)) {
      links.push({
        deprel: t.deprel, dir: 'A→B', dep: t.form, head: other?.form,
        depUpos: t.upos, headUpos: other?.upos,
      });
    }
  }
  return links;
}

/** Surface morphology of a firing — capitalisation, arity, intervening punct. */
export function surfaceShape(tokens, a0, a1, b0, b1) {
  const a = tokens.slice(a0, a1 + 1).join(' ');
  const b = tokens.slice(b0, b1 + 1).join(' ');
  const between = tokens.slice(a1 + 1, b0);
  const morph = {
    aForms: tokens.slice(a0, a1 + 1),
    bForms: tokens.slice(b0, b1 + 1),
    aCapital: /^[A-Z]/.test(tokens[a0] || ''),
    bCapital: /^[A-Z]/.test(tokens[b0] || ''),
    aAllCap: tokens.slice(a0, a1 + 1).every((t) => /^[A-Z]/.test(t)),
    bAllCap: tokens.slice(b0, b1 + 1).every((t) => /^[A-Z]/.test(t)),
    aSingle: a1 === a0,
    bSingle: b1 === b0,
    punctBetween: between.some((t) => /^[,;:.\-–—]$/.test(t)),
    bothProperish: /^[A-Z]/.test(tokens[a0] || '') && /^[A-Z]/.test(tokens[b0] || ''),
  };
  return { a, b, between: between.join(' '), morph };
}

/** Bucket one firing into a latent construction family. */
export function classifyFamily(links, morph) {
  const rels = links.map((l) => l.deprel);
  const has = (r) => rels.some((x) => x === r || x.startsWith(`${r}:`));

  if (has('appos')) return 'apposition';
  if (has('flat') || has('name')) return 'flat-name';
  if (has('compound')) return 'compound';
  if (has('conj') || has('cc')) return 'list-conj';
  if (has('nmod')) return 'nmod';
  if (has('amod') || has('nummod')) return 'modifier';
  if (has('acl')) return 'clausal-mod';
  if (links.length === 0) {
    if (morph.bothProperish || (morph.aCapital && morph.bCapital)) return 'flat-name-orphan';
    if (morph.aSingle && morph.bSingle) return 'juxtaposition-orphan';
    return 'no-direct-gold-link';
  }
  return `other:${rels[0] || 'unknown'}`;
}

/**
 * A BORROWED TYPE. True when a span is one token wide and reached its type by
 * unary lift alone — no bond ever fired inside it.
 *
 * This is the difference between `State`+`Department` and `police`+`station`.
 * Both look like `N+N` firings and both sit on a gold `compound` edge, but
 * `police` is also a verb, so `V→VP` and the imperative `VP→S` make it a
 * one-word clause too. `S+S→S` then fires on the compound and books the gain
 * as clause juxtaposition. A bond whose firings stand mostly on borrowed types
 * is not doing the work its type signature claims.
 *
 * A bare atom is NOT borrowed — its type is its own.
 */
export function liftOnlySpan(node) {
  if (!node || node.from !== node.to) return false;
  const d = node.derivations || [];
  return d.length > 0 && d.every((x) => x.lift);
}

/**
 * Adjacent L+R node pairs, restricted to minimal-width spans so nested
 * mega-spans do not inflate family counts combinatorially.
 */
export function findFirings(chart, leftType, rightType) {
  const of = (t) => chart.molecules.filter((m) => m.type === t);
  const all = [];
  for (const a of of(leftType)) {
    for (const b of of(rightType)) {
      if (a.to + 1 !== b.from) continue;
      all.push({ a, b, width: (a.to - a.from + 1) + (b.to - b.from + 1) });
    }
  }
  if (all.length === 0) return [];
  const minW = Math.min(...all.map((x) => x.width));
  const minimal = all.filter(
    (x) => x.width === minW || (x.a.from === x.a.to && x.b.from === x.b.to),
  );
  const seen = new Set();
  const out = [];
  for (const x of minimal) {
    const k = `${x.a.from}-${x.a.to}|${x.b.from}-${x.b.to}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

/**
 * PURITY — how much of a bond's own gain is grammar rather than glue.
 *
 *   L = licensed share    = 1 − (firings with no gold edge) / (all firings)
 *   H = concentration     = Σ pᵢ²  over licensed families  (Simpson index)
 *   purity                = L · H
 *
 * L answers "does the bond join things the treebank agrees are joined?"
 * H answers "does it always join them the same way?"
 * A law scores high on both. A multi-tool fails at least one: `NP+NP` fails L
 * (44% orphan) and H (compound 12% / modifier 8% / scatter) simultaneously.
 *
 * H over a single family is 1, so purity collapses to L for a monolithic bond —
 * which is the intended reading: a pure law is judged only on whether its edge
 * is real.
 *
 * Returns `purity: null` when the bond produced no firings at all; an
 * unmeasured bond is not a bond that scored zero.
 *
 * @param {Array<{fam: string, n: number}>} families
 * @returns {{purity: number|null, licensedShare: number|null,
 *   concentration: number|null, dominant: string|null, dominantShare: number|null,
 *   firings: number, unlicensed: number}}
 */
export function familyPurity(families) {
  const rows = families.filter((f) => f.fam !== 'gain-without-direct-firing');
  const firings = rows.reduce((s, f) => s + f.n, 0);
  if (firings === 0) {
    return {
      purity: null,
      licensedShare: null,
      concentration: null,
      dominant: null,
      dominantShare: null,
      firings: 0,
      unlicensed: 0,
    };
  }
  const unlicensed = rows
    .filter((f) => UNLICENSED.has(f.fam))
    .reduce((s, f) => s + f.n, 0);
  const licensedRows = rows.filter((f) => !UNLICENSED.has(f.fam));
  const licensedN = firings - unlicensed;
  const licensedShare = licensedN / firings;

  let concentration = 0;
  let dominant = null;
  let dominantShare = 0;
  if (licensedN > 0) {
    for (const f of licensedRows) {
      const p = f.n / licensedN;
      concentration += p * p;
      if (p > dominantShare) {
        dominantShare = p;
        dominant = f.fam;
      }
    }
  }

  return {
    purity: licensedShare * concentration,
    licensedShare,
    concentration: licensedN > 0 ? concentration : 0,
    dominant,
    dominantShare: licensedN > 0 ? dominantShare : null,
    firings,
    unlicensed,
  };
}

/**
 * Autopsy one candidate bond: cluster the firings that materially produced
 * coverage gain, then score purity.
 *
 * "Material" means the sentence had no spanning S under `baseBonds` and has one
 * once the candidate is added — the bond is the proximate cause, not a
 * bystander.
 *
 * @param {{left: string, right: string, result: string, head: 0|1}} cand
 * @param {object[]} records
 * @param {Map<string, string[]>} posMap
 * @param {ReadonlyArray<[string, string, string, 0|1]>} baseBonds
 * @param {{examplesPerFamily?: number, baseCharts?: Map<object, object>}} [options]
 */
export function autopsyBond(cand, records, posMap, baseBonds, options = {}) {
  const { left, right, result, head } = cand;
  const exPerFam = options.examplesPerFamily ?? 4;
  const baseCharts = options.baseCharts || null;
  const trialBonds = [...baseBonds, [left, right, result, head]];
  const signature = `${left}|${right}|${result}`;

  /**
   * VACUITY IS A SIGNATURE PROPERTY, NOT A HEAD ONE. `compose.js` admits one
   * bond per `L|R|result` and picks it by signature, so a candidate whose
   * signature is already law produces a trial chart identical to the baseline
   * — every count below would be a structural zero dressed as a measurement.
   * The head the candidate proposes cannot rescue it: coverage gain asks only
   * whether a spanning `S` exists, and head choice never changes that.
   *
   * This caught `PROPN|PROPN|N` head 0, autopsied against a baseline that
   * already carried it at head 1 and filed as an honest null.
   */
  const lawBond = baseBonds.find((b) => `${b[0]}|${b[1]}|${b[2]}` === signature);
  const alreadyLaw = Boolean(lawBond);
  const lawHead = lawBond ? lawBond[3] : null;

  let materialGains = 0;
  let indirectGains = 0;
  let firingsOnGains = 0;
  let liftOnlyFirings = 0;
  /**
   * Whether either side's type is ever carried by a bare atom in the spans
   * actually sampled. No lexicon entry emits `NP`, `VP` or `S`, so for a
   * phrasal or clausal bond every one-token span is lifted by definition and
   * the borrowed share cannot come out low however the grammar behaves. A
   * number that cannot fail is not evidence — measure the floor and say so.
   */
  const atomBearing = { left: false, right: false };
  const familyCounts = new Map();
  const deprelCounts = new Map();
  const morphCounts = new Map();
  const examples = new Map();

  // Nothing to scan when the candidate is already law — the loop below would
  // compare the baseline against itself and count zeros for every sentence.
  for (const rec of alreadyLaw ? [] : records) {
    const tokens = rec.tokens.map((t) => t.form);
    let base = baseCharts?.get(rec);
    if (!base) {
      base = composePacked(tokens, posMap, { bonds: baseBonds });
      baseCharts?.set(rec, base);
    }
    if (base.stable.some((s) => s.type === 'S')) continue;
    const trial = composePacked(tokens, posMap, { bonds: trialBonds });
    if (!trial.stable.some((s) => s.type === 'S')) continue;
    materialGains += 1;

    const gold = goldByIndex(rec);
    const firings = findFirings(trial, left, right);
    if (firings.length === 0) {
      indirectGains += 1;
      familyCounts.set(
        'gain-without-direct-firing',
        (familyCounts.get('gain-without-direct-firing') || 0) + 1,
      );
      continue;
    }

    for (const { a, b } of firings) {
      firingsOnGains += 1;
      if (liftOnlySpan(a) && liftOnlySpan(b)) liftOnlyFirings += 1;
      if ((a.derivations || []).length === 0) atomBearing.left = true;
      if ((b.derivations || []).length === 0) atomBearing.right = true;
      const links = goldLinksBetween(gold, a.from, a.to, b.from, b.to);
      const { morph, a: aSurf, b: bSurf } = surfaceShape(tokens, a.from, a.to, b.from, b.to);
      const fam = classifyFamily(links, morph);
      familyCounts.set(fam, (familyCounts.get(fam) || 0) + 1);

      for (const l of links) {
        deprelCounts.set(l.deprel, (deprelCounts.get(l.deprel) || 0) + 1);
      }
      if (links.length === 0) {
        deprelCounts.set('(none)', (deprelCounts.get('(none)') || 0) + 1);
      }

      const morphKey = [
        morph.aSingle && morph.bSingle ? '1+1' : 'multi',
        morph.bothProperish ? 'Properish' : 'mixedCase',
        morph.punctBetween ? 'punctBetween' : 'adjacent',
      ].join('|');
      morphCounts.set(morphKey, (morphCounts.get(morphKey) || 0) + 1);

      if (!examples.has(fam)) examples.set(fam, []);
      if (examples.get(fam).length < exPerFam) {
        examples.get(fam).push({
          text: (rec.text || tokens.join(' ')).slice(0, 110),
          spanA: `[${a.from}-${a.to}] «${aSurf}»`,
          spanB: `[${b.from}-${b.to}] «${bSurf}»`,
          links: links.map((l) => `${l.deprel} ${l.dir} ${l.head}←${l.dep}`).join('; ')
            || '(no direct gold edge)',
        });
      }
    }
  }

  const totalFam = [...familyCounts.values()].reduce((s, x) => s + x, 0) || 1;
  const families = [...familyCounts.entries()]
    .map(([fam, n]) => ({ fam, n, pct: (100 * n) / totalFam }))
    .sort((a, b) => b.n - a.n);

  return {
    signature,
    left,
    right,
    result,
    head,
    alreadyLaw,
    lawHead,
    materialGains,
    indirectGains,
    firingsOnGains,
    liftOnlyFirings,
    liftOnlyShare: firingsOnGains > 0 ? liftOnlyFirings / firingsOnGains : null,
    atomBearing,
    borrowedFloored: firingsOnGains > 0 && !atomBearing.left && !atomBearing.right,
    families,
    deprels: [...deprelCounts.entries()].map(([d, n]) => ({ d, n })).sort((a, b) => b.n - a.n),
    morphs: [...morphCounts.entries()].map(([m, n]) => ({ m, n })).sort((a, b) => b.n - a.n),
    examples,
    totalFam,
    ...familyPurity(families),
  };
}

/**
 * Split advice: two or more real families each carrying ≥ `minPct` of firings
 * means the candidate is a multi-tool and must be split before promotion.
 */
export function refinedLawsFromAutopsy(r, minPct = 15) {
  const major = r.families.filter(
    (f) => f.pct >= minPct && f.fam !== 'gain-without-direct-firing',
  );
  if (major.length < 2) {
    return {
      split: false,
      message: major.length === 1
        ? `Dominant family «${major[0].fam}» (${major[0].pct.toFixed(0)}%) — refine that one law rather than the giant.`
        : `No clear multi-family split at ≥${minPct}%; keep approximation or dig deeper.`,
      proposals: major,
    };
  }
  return {
    split: true,
    message: `Split into ${major.length} construction families (each ≥${minPct}%).`,
    proposals: major,
  };
}
