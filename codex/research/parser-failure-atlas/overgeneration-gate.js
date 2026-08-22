/**
 * Overgeneration gate. Judges candidate bonds. Never writes one.
 *
 * Baseline and treated rows join on `sentId`. They cannot join on
 * `caseId`: `freezeFailure` hashes the plate into the id, so a case
 * that changes plate changes identity.
 *
 * @module codex/research/parser-failure-atlas/overgeneration-gate
 */

import { createHash } from 'node:crypto';

import { BONDS } from '../../core/constellation/compose.js';
import { plateOf } from './atlas-schema.js';
import { scoreRecord } from './collect-failures.js';

export const OVERGENERATION_GATE_CONTRACT = 'PB-OVERGENERATION-GATE-v1';

function indexBySentId(rows) {
  const out = new Map();
  for (const row of rows || []) {
    if (row?.sentId == null) continue;
    out.set(row.sentId, row);
  }
  return out;
}

/**
 * @param {Array<{sentId: string, plate: string|null, contained: boolean, labels: string[]}>} baselineRows
 * @param {Array<{sentId: string, plate: string|null, contained: boolean, labels: string[]}>} treatedRows
 * Both floors default strict. The licensed median on the design split
 * is netFloor 1 / minLabelSpan 1 — callers that want the shipped
 * grammar's own bar should pass `calibrateAgainstLicensed` output
 * rather than rely on these defaults.
 *
 * @param {{minLabelSpan?: number, netFloor?: number}} [options]
 */
export function judgeCandidate(baselineRows, treatedRows, options = {}) {
  const minLabelSpan = options.minLabelSpan ?? 2;
  const netFloor = options.netFloor ?? 1;
  const baseline = indexBySentId(baselineRows);

  let overgenerated = 0;
  let regressed = 0;
  let explained = 0;
  const labels = new Set();
  const plates = new Set();

  for (const [sentId, after] of indexBySentId(treatedRows)) {
    const before = baseline.get(sentId);
    if (!before) continue;
    if (after.plate === 'OVERGENERATED' && before.plate !== 'OVERGENERATED') overgenerated += 1;
    if (before.contained === true && after.contained !== true) regressed += 1;
    if (before.plate != null && after.plate == null) {
      explained += 1;
      plates.add(before.plate);
      for (const label of before.labels || []) labels.add(label);
    }
  }

  const labelsSpanned = labels.size;
  const net = explained - overgenerated;

  /*
   * Overgeneration is the cost side of a trade, not a defect. A
   * zero-overgeneration bar rejects DET+N->NP (14 explained / 10
   * overgenerated on the design split) and every other licensed bond
   * measured leave-one-out: 0/99 pass it. The bar is therefore the net
   * trade, floored by what the shipped table already achieves.
   *
   * A regression is different in kind: it takes away an answer the
   * parser already contained, and no amount of new coverage buys it back.
   */
  let verdict = 'ADMITTED';
  if (regressed > 0) verdict = 'REJECTED_REGRESSION';
  else if (explained === 0 && overgenerated === 0) verdict = 'REJECTED_INERT';
  else if (net < netFloor) verdict = 'REJECTED_OVERGENERATION';
  else if (labelsSpanned < minLabelSpan) verdict = 'REJECTED_SPECIAL_CASE';

  return Object.freeze({
    explained,
    overgenerated,
    net,
    netFloor,
    regressed,
    labelsSpanned,
    labels: Object.freeze([...labels].sort()),
    platesSpanned: plates.size,
    plates: Object.freeze([...plates].sort()),
    verdict,
  });
}

/**
 * Greedy cumulative admission.
 *
 * A candidate that passes alone may still overgenerate once another
 * admitted bond is in the table. One-at-a-time gating cannot find a
 * pair, so every admission is re-judged against the set already held.
 *
 * @param {Array} baselineRows rows scored with the stock bond table
 * @param {Array<{signature: string, bonds: Array}>} candidates
 * @param {(signatures: string[]) => Array} rescore rows for a trial bond set
 * @param {{minLabelSpan?: number}} [options]
 */
export function admitCumulative(baselineRows, candidates, rescore, options = {}) {
  const solo = new Map();
  for (const candidate of candidates || []) {
    solo.set(candidate.signature, judgeCandidate(
      baselineRows,
      rescore([candidate.signature]),
      options,
    ));
  }

  /*
   * Rank on what the gate judges: net trade per bond added. Ranking on
   * explained alone tied S|S|S with S|VP|S at 7 apiece and handed the
   * slot to whichever sorted first alphabetically — admitting the net
   * +1 bond and rejecting the net +2 one as redundant.
   */
  const ranked = [...(candidates || [])].sort((a, b) => {
    const ja = solo.get(a.signature);
    const jb = solo.get(b.signature);
    const yieldA = ja.net / Math.max(1, a.bonds.length);
    const yieldB = jb.net / Math.max(1, b.bonds.length);
    return yieldB - yieldA
      || jb.explained - ja.explained
      || a.signature.localeCompare(b.signature);
  });

  const admitted = [];
  const rejected = [];
  const held = [];
  let heldNet = 0;

  for (const candidate of ranked) {
    const soloVerdict = solo.get(candidate.signature);
    if (soloVerdict.verdict !== 'ADMITTED') {
      rejected.push(Object.freeze({
        signature: candidate.signature,
        stage: 'solo',
        verdict: soloVerdict.verdict,
        solo: soloVerdict,
        cumulative: null,
      }));
      continue;
    }

    const trial = [...held, candidate.signature];
    const cumulative = judgeCandidate(baselineRows, rescore(trial), options);

    /*
     * Clearing the floor as a set is not enough. S|S|S and S|VP|S each
     * explained 7 design-split sentences and together still explained
     * 7 — the same 7. An addition must improve the set it joins, or it
     * is law complexity bought for nothing.
     */
    const redundant = held.length > 0 && cumulative.net <= heldNet;
    if (cumulative.verdict !== 'ADMITTED' || redundant) {
      rejected.push(Object.freeze({
        signature: candidate.signature,
        stage: 'cumulative',
        verdict: redundant && cumulative.verdict === 'ADMITTED'
          ? 'REJECTED_REDUNDANT'
          : cumulative.verdict,
        marginalNet: cumulative.net - heldNet,
        solo: soloVerdict,
        cumulative,
      }));
      continue;
    }

    heldNet = cumulative.net;
    held.push(candidate.signature);
    admitted.push(Object.freeze({
      signature: candidate.signature,
      bonds: Object.freeze(candidate.bonds),
      solo: soloVerdict,
      cumulative,
    }));
  }

  return Object.freeze({
    admitted: Object.freeze(admitted),
    rejected: Object.freeze(rejected),
    heldSignatures: Object.freeze([...held]),
  });
}

function keyOf(record) {
  return record?.sentId || (record?.tokens || []).map((t) => t.form).join(' ');
}

/**
 * Plate every record under one bond table. A sentence that parses
 * cleanly gets `plate: null` — the atlas freezes only failures, so the
 * gate cannot read plates off frozen cases and see a case disappear.
 */
export function plateRows(records, posMap, bonds, opts = {}) {
  const options = bonds ? { bonds } : {};
  const rows = [];
  for (const record of records || []) {
    let row;
    try {
      row = scoreRecord(record, posMap, { ...opts, options });
    } catch {
      continue;
    }
    if (row.skip) continue;
    rows.push(Object.freeze({
      sentId: keyOf(record),
      plate: plateOf(row),
      contained: row.contained === true,
      labels: Object.freeze([...new Set(
        (row.diagnosis?.categories || []).map((c) => c.label).filter(Boolean),
      )].sort()),
    }));
  }
  return rows;
}

/**
 * Judge candidate bonds against the design split.
 *
 * Never mutates BONDS. Admission to Grimoire law stays a separate act.
 *
 * @param {Array} records CoNLL-U records (design split only)
 * @param {Map|object} posMap
 * @param {Array<{signature: string, bonds: Array}>} candidates
 * @param {{minLabelSpan?: number, maxTokens?: number}} [options]
 */
export function gateCandidateBonds(records, posMap, candidates, options = {}) {
  const scoreOpts = options.maxTokens ? { maxTokens: options.maxTokens } : {};
  const baseline = plateRows(records, posMap, null, scoreOpts);

  const cache = new Map();
  const bySignature = new Map((candidates || []).map((c) => [c.signature, c]));
  const rescore = (signatures) => {
    const key = [...signatures].sort().join('\u0000');
    if (cache.has(key)) return cache.get(key);
    const trial = Object.freeze([
      ...BONDS,
      ...signatures.flatMap((sig) => bySignature.get(sig)?.bonds || []),
    ]);
    const rows = plateRows(records, posMap, trial, scoreOpts);
    cache.set(key, rows);
    return rows;
  };

  const run = admitCumulative(baseline, candidates || [], rescore, options);

  const report = {
    contract: OVERGENERATION_GATE_CONTRACT,
    recordsScored: baseline.length,
    baselineRows: baseline.length,
    baselinePlates: tallyPlates(baseline),
    minLabelSpan: options.minLabelSpan ?? 2,
    netFloor: options.netFloor ?? 1,
    candidates: (candidates || []).map((c) => {
      const admitted = run.admitted.find((a) => a.signature === c.signature);
      const rejected = run.rejected.find((r) => r.signature === c.signature);
      return Object.freeze({
        signature: c.signature,
        bonds: Object.freeze(c.bonds),
        verdict: admitted ? 'ADMITTED' : rejected?.verdict ?? 'REJECTED_INERT',
        stage: admitted ? 'cumulative' : rejected?.stage ?? 'solo',
        solo: admitted ? admitted.solo : rejected?.solo ?? null,
      });
    }),
    admitted: Object.freeze(run.admitted.map((a) => a.signature)),
    rejected: Object.freeze(run.rejected.map((r) => Object.freeze({
      signature: r.signature, stage: r.stage, verdict: r.verdict,
    }))),
  };
  report.checksum = `overgen-gate1:${createHash('sha256')
    .update(JSON.stringify(report)).digest('hex').slice(0, 16)}`;
  return Object.freeze(report);
}

/**
 * Calibrate the net floor against the shipped bond table.
 *
 * Each licensed bond is removed, the corpus re-plated without it, then
 * the bond is offered back as if it were a candidate. That makes the
 * shipped grammar the reference population — the gate does not get to
 * set its own bar. A candidate must trade at least as well as the
 * `percentile` of bonds the project already ships.
 *
 * Deterministic: the sample is a fixed stride over BONDS, not random.
 *
 * @param {Array} records design-split records
 * @param {Map|object} posMap
 * @param {{sample?: number, percentile?: number, maxTokens?: number}} [options]
 */
export function calibrateAgainstLicensed(records, posMap, options = {}) {
  const percentile = options.percentile ?? 0.5;
  const scoreOpts = options.maxTokens ? { maxTokens: options.maxTokens } : {};
  const total = BONDS.length;
  const want = Math.min(options.sample ?? total, total);
  const stride = Math.max(1, Math.floor(total / want));

  const chosen = [];
  for (let i = 0; chosen.length < want && i < total; i += stride) chosen.push(BONDS[i]);

  const scored = [];
  for (const bond of chosen) {
    const without = Object.freeze(BONDS.filter((b) => b !== bond));
    const before = plateRows(records, posMap, without, scoreOpts);
    const after = plateRows(records, posMap, Object.freeze([...without, bond]), scoreOpts);
    const judged = judgeCandidate(before, after, { ...options, netFloor: -Infinity });
    scored.push(Object.freeze({
      signature: `${bond[0]}|${bond[1]}|${bond[2]}`,
      explained: judged.explained,
      overgenerated: judged.overgenerated,
      regressed: judged.regressed,
      labelsSpanned: judged.labelsSpanned,
      net: judged.net,
    }));
  }

  // Inert bonds carry no trade information; they would drag the floor to 0.
  const active = scored.filter((r) => r.explained > 0 || r.overgenerated > 0);
  const nets = active.map((r) => r.net).sort((a, b) => a - b);
  const spans = active.map((r) => r.labelsSpanned).sort((a, b) => a - b);
  const at = (arr) => (arr.length
    ? arr[Math.floor(percentile * (arr.length - 1))]
    : 0);

  return Object.freeze({
    percentile,
    sampled: chosen.length,
    active: active.length,
    inert: scored.length - active.length,
    netFloor: at(nets),
    labelSpanFloor: at(spans),
    scored: Object.freeze(scored),
  });
}

function tallyPlates(rows) {
  const out = Object.create(null);
  for (const row of rows) {
    const key = row.plate ?? 'CLEAN';
    out[key] = (out[key] || 0) + 1;
  }
  return Object.freeze(out);
}
