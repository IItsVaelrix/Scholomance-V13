/**
 * AGENT TELEMETRY FOR THE PERTURBATION BEAM.
 *
 * The beam images dark sentences. This module reads the image so a caller
 * does not have to reconstruct the slices by hand. It names sentence paths,
 * autopsies illuminating remainders, and emits a boon board.
 *
 * THE PURITY LAW STILL HOLDS. A boon is a ranked hypothesis with a gate and
 * a forbidden move. Nothing here proposes admitting a new root type. Coverage
 * cannot fall when a root type is admitted, so the only legitimate downstream
 * gate is head accuracy plus a purity check — never an illumination count.
 *
 * @module codex/core/constellation/perturbation-telemetry
 */

import { headsOf } from './compose-packed.js';
import { accumulateResidualTraces, kindFamily, massMap } from './perturbation-beam.js';

export const PURITY_GATE = 'head accuracy + purity; an illumination count is not a licence to admit a root type';

const LEFTOVER_TYPES = Object.freeze(['SBAR', 'RELC', 'SCOMMA', 'FRONTED', 'INV', 'PUNCT', 'PP', 'APPOS']);
const NOMINAL_TYPES = Object.freeze(['NP', 'N', 'NC', 'NPCOMMA', 'PROPN']);
const CLAUSE_TYPES = Object.freeze(['SBAR', 'RELC']);
const PUNCT_RE = /^[.,!?;:…]+$/;

const STATUS_ORDER = Object.freeze({ CANDIDATE: 0, PROBE: 1, NOT_A_BOON: 2 });

/**
 * Lexicon tags for a form. Empty means the table does not know the word —
 * morphology is not consulted, because an autopsy that guessed would hide
 * the lexical hole.
 *
 * @param {string} token
 * @param {Map<string, string[]>|Record<string, string[]>} posMap
 * @returns {string[]}
 */
export function tagsOf(token, posMap) {
  if (token == null) return [];
  const key = String(token).toLowerCase();
  const raw = posMap instanceof Map ? posMap.get(key) : (posMap && posMap[key]);
  return [...new Set(raw || [])].sort();
}

export function isNvAmbiguous(tags) {
  const set = new Set(tags || []);
  return set.has('n') && set.has('v');
}

export function isPunctToken(token) {
  return typeof token === 'string' && PUNCT_RE.test(token);
}

/**
 * @param {Array<{kind: string, goldHead?: boolean|null}>} illuminations
 * @returns {'inert'|'substitution-only'|'deletion-lit-gold'|'deletion-lit-false'}
 */
export function sentencePath(illuminations) {
  const rows = illuminations || [];
  if (rows.length === 0) return 'inert';
  const deletions = rows.filter((r) => {
    const family = kindFamily(r.kind);
    return family === 'delete-token' || family === 'delete-edge';
  });
  if (deletions.some((r) => r.goldHead === true)) return 'deletion-lit-gold';
  if (deletions.length > 0) return 'deletion-lit-false';
  return 'substitution-only';
}

function deletedSurface(row, tokens) {
  if (row.kind === 'delete') return row.detail && row.detail.token != null ? row.detail.token : null;
  if (row.kind === 'delete-prefix') {
    const k = (row.detail && row.detail.k) || 0;
    return k === 1 ? tokens[0] : tokens.slice(0, k).join(' ');
  }
  if (row.kind === 'delete-suffix') {
    const k = (row.detail && row.detail.k) || 0;
    return k === 1 ? tokens[tokens.length - 1] : tokens.slice(tokens.length - k).join(' ');
  }
  if (row.detail && row.detail.probe != null) return row.detail.probe;
  return null;
}

function singleDeletedToken(row, tokens) {
  if (row.kind === 'delete') return row.detail && row.detail.token != null ? row.detail.token : null;
  if (row.kind === 'delete-prefix' && row.detail && row.detail.k === 1) return tokens[0];
  if (row.kind === 'delete-suffix' && row.detail && row.detail.k === 1) return tokens[tokens.length - 1];
  return null;
}

/**
 * Name what an illumination actually did to the remainder.
 *
 * Precedence is causal, not alphabetical: a false gold-head is a miss even
 * if the dark type is a clause; stripping the gold subject is not a matrix
 * lift; only then do complementizer / punct / n+v-lift get to name the hit.
 *
 * @param {object} row a fireBeam row
 * @param {{tokens: string[], posMap: Map|object, goldVerb?: string|null, goldSubject?: string|null, darkTypes?: string[]}} ctx
 * @returns {object|null}
 */
export function autopsyIllumination(row, ctx = {}) {
  if (!row || row.effect !== 'ILLUMINATED') return null;
  const tokens = ctx.tokens || [];
  const darkTypes = ctx.darkTypes || [];
  const family = kindFamily(row.kind);
  const single = singleDeletedToken(row, tokens);
  const deleted = deletedSurface(row, tokens);
  const deletedTags = single != null ? tagsOf(single, ctx.posMap) : [];
  const remainderHeads = [...((row.after && row.after.heads) || [])];
  const remainderStable = [...((row.after && row.after.stable) || row.lit || [])];
  const nvHeads = remainderHeads.filter((h) => isNvAmbiguous(tagsOf(h, ctx.posMap)));
  const via = nvHeads.length > 0 ? 'n+v-lift' : (remainderStable.includes('S') ? 'clause' : null);
  const darkHasClause = darkTypes.some((t) => CLAUSE_TYPES.includes(t));

  let cls = 'other';
  if (row.goldHead === false) {
    cls = 'false-head';
  } else if (single != null && ctx.goldSubject != null && single === ctx.goldSubject) {
    cls = 'subject-strip';
  } else if (darkHasClause && family !== 'substitute' && row.goldHead === true) {
    cls = 'complementizer-unmask';
  } else if (single != null && isPunctToken(single) && row.goldHead === true) {
    cls = 'punct-unmask';
  } else if (via === 'n+v-lift' && row.goldHead === true) {
    cls = 'lexical-lift';
  } else if (row.goldHead === true) {
    cls = 'other-gold';
  }

  return Object.freeze({
    class: cls,
    via,
    family,
    kind: row.kind,
    deleted,
    deletedTags: Object.freeze(deletedTags),
    remainderHeads: Object.freeze(remainderHeads),
    remainderStable: Object.freeze(remainderStable),
    goldHead: row.goldHead,
  });
}

function emptyFamilyBucket() {
  return { illuminated: 0, goldHead: 0, falseHead: 0, refracted: 0, invariant: 0, collapsed: 0 };
}

function emptyFamilyCensus() {
  return {
    'delete-token': emptyFamilyBucket(),
    'delete-edge': emptyFamilyBucket(),
    substitute: emptyFamilyBucket(),
    other: emptyFamilyBucket(),
  };
}

function allRows(beam) {
  return [
    ...((beam && beam.edges) || []),
    ...((beam && beam.deletions) || []),
    ...((beam && beam.substitutions) || []),
  ];
}

function bumpFamily(census, row) {
  const family = kindFamily(row.kind);
  const bucket = census[family] || (census[family] = emptyFamilyBucket());
  if (row.effect === 'ILLUMINATED') {
    bucket.illuminated += 1;
    if (row.goldHead === true) bucket.goldHead += 1;
    else if (row.goldHead === false) bucket.falseHead += 1;
    return;
  }
  if (row.effect === 'REFRACTED') bucket.refracted += 1;
  else if (row.effect === 'INVARIANT') bucket.invariant += 1;
  else if (row.effect === 'COLLAPSED') bucket.collapsed += 1;
}

function darkHeadsOf(chart) {
  const out = {};
  for (const molecule of ((chart && chart.spanning) || [])) {
    let heads = [];
    try { heads = [...(headsOf(molecule) || [])].sort(); } catch { heads = []; }
    out[molecule.type] = heads;
  }
  return out;
}

/**
 * One dark sentence, reduced to the facts an agent needs.
 *
 * @param {{sentId?: string, tokens: string[], posMap: Map|object, darkChart: object, goldVerb?: string|null, goldSubject?: string|null, beam: object}} input
 */
export function sentenceTelemetry(input) {
  const tokens = input.tokens || [];
  const darkChart = input.darkChart || { spanning: [], stable: [] };
  const map = massMap(input.beam);
  const darkTypes = [...new Set((darkChart.spanning || []).map((m) => m.type))].sort();
  const darkHeads = darkHeadsOf(darkChart);
  const goldVerb = input.goldVerb ?? null;
  const goldSubject = input.goldSubject ?? null;
  const path = sentencePath(map.illuminations);
  const byFamily = emptyFamilyCensus();
  for (const row of allRows(input.beam)) bumpFamily(byFamily, row);
  const litTypes = [...new Set(map.illuminations.flatMap((r) => r.lit || []))].sort();
  const allBeamRows = allRows(input.beam);
  const residualTrace = accumulateResidualTraces(tokens, darkChart, allBeamRows);
  const autopsies = map.illuminations
    .map((row) => autopsyIllumination(row, {
      tokens, posMap: input.posMap, goldVerb, goldSubject, darkTypes,
    }))
    .filter(Boolean);
  const leftoverRefused = path === 'substitution-only'
    && darkTypes.some((t) => LEFTOVER_TYPES.includes(t));

  return Object.freeze({
    sentId: input.sentId || tokens.join(' ').slice(0, 60),
    text: tokens.join(' '),
    tokens: tokens.length,
    goldVerb,
    goldSubject,
    darkTypes: Object.freeze(darkTypes),
    darkHeads: Object.freeze(darkHeads),
    darkHeadGold: goldVerb != null && Object.values(darkHeads).some((hs) => hs.includes(goldVerb)),
    path,
    effects: map.effects,
    illuminations: map.illuminations.length,
    goldHeadIlluminations: map.illuminations.filter((r) => r.goldHead === true).length,
    litTypes: Object.freeze(litTypes),
    byFamily: Object.freeze(byFamily),
    autopsies: Object.freeze(autopsies),
    residualTrace,
    leftoverRefused,
  });
}

function boon(id, status, claim, nextProbe, forbidden, evidence) {
  return Object.freeze({
    id,
    status,
    n: evidence.length,
    claim,
    gate: PURITY_GATE,
    nextProbe,
    forbidden,
    evidence: Object.freeze(evidence.map((s) => Object.freeze({
      sentId: s.sentId,
      text: s.text,
      darkTypes: s.darkTypes,
      goldVerb: s.goldVerb,
      goldSubject: s.goldSubject,
      path: s.path,
    }))),
  });
}

function evidenceOf(sentences) {
  return sentences;
}

/**
 * Deterministic boon board. Empty groups are omitted. Status is a reading,
 * not a licence: CANDIDATE still carries the purity gate.
 *
 * @param {object[]} sentences sentenceTelemetry rows (or the subset of fields proposeBoons reads)
 * @returns {object[]}
 */
export function proposeBoons(sentences) {
  const rows = sentences || [];
  const out = [];

  const hasAutopsy = (cls) => rows.filter((s) => (s.autopsies || []).some((a) => a.class === cls));

  const complementizer = hasAutopsy('complementizer-unmask');
  if (complementizer.length) {
    out.push(boon(
      'complementizer-unmask',
      'CANDIDATE',
      'A matrix SBAR/RELC already heads on the gold verb; removing the complementizer lights S with the subject intact.',
      'Purity-check the remainder as a clause (gold subject still present). Measure complementizer-absorb / matrix-fragment closure — do not add a type to the root list.',
      'Root-list expansion for SBAR/RELC is forbidden on this evidence.',
      evidenceOf(complementizer),
    ));
  }

  const subjectStrip = hasAutopsy('subject-strip');
  if (subjectStrip.length) {
    out.push(boon(
      'subject-strip',
      'NOT_A_BOON',
      'The illuminating deletion removed the gold subject. The lit S is a subjectless remainder, not a hidden matrix.',
      'Leave the dark RELC/SBAR standing. Compare against complementizer-unmask, where the subject survives.',
      'Do not treat a subject-stripping illumination as evidence for a root lift.',
      evidenceOf(subjectStrip),
    ));
  }

  const punct = hasAutopsy('punct-unmask');
  if (punct.length) {
    out.push(boon(
      'punct-unmask',
      'PROBE',
      'A trailing mark is the only thing between a two-token vocative and an S — and the S is the noun\'s verb reading climbing V→VP→S.',
      'Compare the Sincerely-control (ADV+comma stays FRONTED). Ask why S+PUNCT absorb missed these two-token vocatives; do not add SCOMMA to the root list.',
      'Root-list expansion for SCOMMA is forbidden on this evidence.',
      evidenceOf(punct),
    ));
  }

  const lifts = hasAutopsy('lexical-lift');
  if (lifts.length) {
    out.push(boon(
      'lexical-lift',
      'NOT_A_BOON',
      'Deleting a left-edge determiner or adjective lights S because the remaining head is tagged n+v, not because a clause was hiding.',
      'Treat this as lexicon physics. A purity check would ask whether the noun reading should suppress the V→VP→S climb on a fragment.',
      'Do not read an n+v remainder as a missing clause construction.',
      evidenceOf(lifts),
    ));
  }

  const finished = rows.filter((s) => {
    if (s.path !== 'substitution-only') return false;
    return (s.darkTypes || []).some((t) => NOMINAL_TYPES.includes(t));
  });
  if (finished.length) {
    out.push(boon(
      'finished-nominal',
      'NOT_A_BOON',
      'These sentences light only when a verb is injected. They are finished nominals, not S wearing the wrong label.',
      'Stop. The census head-match on NP is the UD root being a noun. That is not a root-type gap.',
      'Do not add NP (or N/NC/PROPN) to the root list from a substitution-only count.',
      evidenceOf(finished),
    ));
  }

  const inv = rows.filter((s) => {
    if (!(s.darkTypes || []).includes('INV')) return false;
    const heads = (s.darkHeads && s.darkHeads.INV) || [];
    return s.goldVerb != null && !heads.includes(s.goldVerb);
  });
  if (inv.length) {
    out.push(boon(
      'inv-head-mismatch',
      'CANDIDATE',
      'INV already spans the input but its head is not the gold root. The construction is present; the head declaration is not.',
      'Audit the INV head declaration against gold. A purity check is whether flipping the head keeps existing imperative answers intact.',
      'Root-list expansion for INV is forbidden — the type already exists and is not a root, and the failure is the head, not the label.',
      evidenceOf(inv),
    ));
  }

  const fronted = rows.filter((s) => s.path === 'substitution-only' && (s.darkTypes || []).includes('FRONTED'));
  if (fronted.length) {
    out.push(boon(
      'fronted-no-predicate',
      'PROBE',
      'FRONTED spans and no deletion lights a gold S. There is no verb reading to unmask.',
      'Leave as a leftover type. The Sincerely-control shows ADV+comma has no S path.',
      'Root-list expansion for FRONTED is forbidden on this evidence.',
      evidenceOf(fronted),
    ));
  }

  const appos = rows.filter((s) => s.path === 'substitution-only' && (s.darkTypes || []).includes('APPOS'));
  if (appos.length) {
    out.push(boon(
      'appos-list',
      'PROBE',
      'Full-width APPOS lists light only by verb injection. They are name-lists, not clauses.',
      'If a list-as-utterance root is ever considered, the gate is head accuracy plus purity on the gold name, never a span count.',
      'Root-list expansion for APPOS is forbidden on this evidence.',
      evidenceOf(appos),
    ));
  }

  const pp = rows.filter((s) => s.path === 'substitution-only' && (s.darkTypes || []).includes('PP'));
  if (pp.length) {
    out.push(boon(
      'pp-fragment',
      'PROBE',
      'A full-width PP with no deletion path to a gold S is a prepositional fragment, not a missing clause.',
      'Compare against PP sentences that unmask via n+v-lift — those are lexicon, not a PP-to-S law.',
      'Root-list expansion for PP is forbidden on this evidence.',
      evidenceOf(pp),
    ));
  }

  const punctOnly = rows.filter((s) => s.path === 'substitution-only' && (s.darkTypes || []).includes('PUNCT'));
  if (punctOnly.length) {
    out.push(boon(
      'punct-only',
      'NOT_A_BOON',
      'The whole input is punctuation. Nothing here is a construction.',
      'Ignore.',
      'Do not promote PUNCT.',
      evidenceOf(punctOnly),
    ));
  }

  out.sort((a, b) => (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) || a.id.localeCompare(b.id));
  return Object.freeze(out);
}

function mergeFamilies(into, from) {
  for (const [family, bucket] of Object.entries(from || {})) {
    const dest = into[family] || (into[family] = emptyFamilyBucket());
    dest.illuminated += bucket.illuminated || 0;
    dest.goldHead += bucket.goldHead || 0;
    dest.falseHead += bucket.falseHead || 0;
    dest.refracted += bucket.refracted || 0;
    dest.invariant += bucket.invariant || 0;
    dest.collapsed += bucket.collapsed || 0;
  }
}

/**
 * Corpus-level mass map + boon board. This is what the runner should print
 * and what an agent should read first.
 *
 * @param {object[]} sentences
 */
export function corpusTelemetry(sentences) {
  const rows = sentences || [];
  const paths = {
    inert: 0,
    'substitution-only': 0,
    'deletion-lit-gold': 0,
    'deletion-lit-false': 0,
  };
  const byFamily = emptyFamilyCensus();
  const effectTotals = {};
  const litTypeSet = new Set();
  const leftoverRefused = [];
  let illuminationsTotal = 0;
  let goldHeadIlluminations = 0;

  for (const s of rows) {
    if (Object.prototype.hasOwnProperty.call(paths, s.path)) paths[s.path] += 1;
    illuminationsTotal += s.illuminations || 0;
    goldHeadIlluminations += s.goldHeadIlluminations || 0;
    mergeFamilies(byFamily, s.byFamily);
    for (const [effect, count] of Object.entries(s.effects || {})) {
      effectTotals[effect] = (effectTotals[effect] || 0) + count;
    }
    for (const t of s.litTypes || []) litTypeSet.add(t);
    if (s.leftoverRefused) {
      leftoverRefused.push(Object.freeze({
        text: s.text, darkTypes: s.darkTypes, goldVerb: s.goldVerb,
      }));
    }
  }

  const boons = proposeBoons(rows);
  const litTypes = [...litTypeSet].sort();

  return Object.freeze({
    n: rows.length,
    paths: Object.freeze(paths),
    byFamily: Object.freeze(byFamily),
    effectTotals: Object.freeze(effectTotals),
    litTypes: Object.freeze(litTypes),
    illuminationsTotal,
    goldHeadIlluminations,
    leftoverRefused: Object.freeze(leftoverRefused),
    boons,
  });
}

/**
 * Compact reading an agent can act on without reconstructing the slices.
 *
 * @param {object} corpus corpusTelemetry output
 * @returns {string}
 */
export function agentBrief(corpus) {
  const c = corpus || corpusTelemetry([]);
  const fam = c.byFamily || emptyFamilyCensus();
  const paths = c.paths || {};
  const lines = [
    'BEAM READING',
    `  dark sentences: ${c.n || 0}`,
    `  path: substitution-only=${paths['substitution-only'] || 0}  deletion-lit-gold=${paths['deletion-lit-gold'] || 0}  deletion-lit-false=${paths['deletion-lit-false'] || 0}  inert=${paths.inert || 0}`,
    `  illuminations: ${c.illuminationsTotal || 0}  substitute=${fam.substitute.illuminated} (gold ${fam.substitute.goldHead})  delete-token=${fam['delete-token'].illuminated} (gold ${fam['delete-token'].goldHead})  delete-edge=${fam['delete-edge'].illuminated} (gold ${fam['delete-edge'].goldHead})`,
    `  lit types: ${(c.litTypes || []).join(', ') || '(none)'} — the beam can only light admitted roots`,
    '',
    'BOONS',
  ];
  for (const b of c.boons || []) {
    lines.push(`  ${b.status} ${b.id} n=${b.n}`);
    lines.push(`    claim: ${b.claim}`);
    lines.push(`    next: ${b.nextProbe}`);
    lines.push(`    forbidden: ${b.forbidden}`);
  }
  if (!c.boons || c.boons.length === 0) lines.push('  (none)');
  lines.push('');
  lines.push(`PURITY LAW: ${PURITY_GATE}`);
  return lines.join('\n');
}
