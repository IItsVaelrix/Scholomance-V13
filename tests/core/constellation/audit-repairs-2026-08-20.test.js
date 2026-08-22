/**
 * AUDIT REPAIRS — 2026-08-20.
 *
 * Seven defects were claimed by an external audit and verified against HEAD
 * 2e42ea2e. These tests pin the repairs. Each `describe` names the defect it
 * closes and the production change that would make it fail again.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parseConllu, goldAnswer } from '../../../codex/core/constellation/treebank.js';
import { composePacked, ROOT_DOORWAY } from '../../../codex/core/constellation/compose-packed.js';
import {
  findMatchedControlProbe,
  fireBeam,
  litSubjectMatchesGold,
  pickProbeWords,
  tomographicScan,
} from '../../../codex/core/constellation/perturbation-beam.js';
import {
  buildBeaconField,
  pickResonantAnswer,
  pickResonantAnswerDetailed,
  scoreAnswer,
} from '../../../codex/core/constellation/resonance-beacon.js';
import { efficacyVerdict } from '../../../codex/core/constellation/semantic-particles/exposure-gate.js';

const FIX = path.resolve('tests/qa/fixtures/constellation');
const records = parseConllu(readFileSync(path.join(FIX, 'treebank-gate.conllu'), 'utf8'));
const posMap = new Map(Object.entries(JSON.parse(
  readFileSync(path.join(FIX, 'treebank-gate-lexicon.json'), 'utf8'),
)));
const probes = pickProbeWords(posMap);

function byText(text) {
  const rec = records.find((r) => r.tokens.map((t) => t.form).join(' ') === text);
  if (!rec) throw new Error(`missing fixture sentence: ${text}`);
  const tokens = rec.tokens.map((t) => t.form);
  return { rec, tokens, gold: goldAnswer(rec), chart: composePacked(tokens, posMap, {}) };
}

/** A dark sentence carrying BOTH edge and substitution illuminations. */
const DARK = 'unique gifts and cards';

/* ────────────────────────────────────────────────────────────────────────
 * DEFECT 1 — `goldSubject` was accepted by tomographicScan and never read.
 * The only live caller (scripts/dark-matter-beam.mjs) passes gold.subject.
 * Production change that would make these fail: dropping the subject check,
 * or reporting `false` where no gold subject was supplied.
 * ──────────────────────────────────────────────────────────────────────── */
describe('gold subject is measured, not discarded', () => {
  it('litSubjectMatchesGold finds a lit root whose answer carries the gold subject', () => {
    const ctx = byText('My life is too complicated right now trying to do my job .');
    expect(litSubjectMatchesGold(ctx.chart, ctx.gold.subject)).toBe(true);
  });

  it('reports false when the gold subject is absent from every lit answer', () => {
    const ctx = byText('My life is too complicated right now trying to do my job .');
    expect(litSubjectMatchesGold(ctx.chart, 'aardvark')).toBe(false);
  });

  it('abstains rather than answering false when there is no gold subject', () => {
    const ctx = byText('My life is too complicated right now trying to do my job .');
    expect(litSubjectMatchesGold(ctx.chart, null)).toBe(null);
  });

  it('every tomographic projection carries the subject verdict when gold is supplied', () => {
    const ctx = byText(DARK);
    const scan = tomographicScan(ctx.tokens, posMap, ctx.chart, ctx.gold.verb, 'gifts', { probes });
    expect(scan.tomographicProjections.length).toBeGreaterThan(0);
    for (const p of scan.tomographicProjections) {
      expect(p).toHaveProperty('goldSubjectMatch');
      expect(typeof p.goldSubjectMatch).toBe('boolean');
    }
  });

  it('records that no gold subject was supplied instead of inventing one', () => {
    const ctx = byText(DARK);
    const scan = tomographicScan(ctx.tokens, posMap, ctx.chart, ctx.gold.verb, null, { probes });
    for (const p of scan.tomographicProjections) {
      expect(p.goldSubjectMatch).toBe(null);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * DEFECT 2 — matched counterfactual controls were computed for deletion
 * probes ONLY. Edge and substitution illuminations entered the projections
 * with control: null, excess: null, so they carried no counterfactual.
 * Production change that would make these fail: narrowing
 * findMatchedControlProbe back to `kind === 'delete'`.
 * ──────────────────────────────────────────────────────────────────────── */
describe('every probe kind gets a matched control', () => {
  const ctx = byText(DARK);
  const beam = fireBeam(ctx.tokens, posMap, ctx.chart, ctx.gold.verb, { probes });
  const allRows = [...beam.edges, ...beam.deletions, ...beam.substitutions];

  it('an edge deletion is controlled by the mirror edge of the same width', () => {
    const prefix = beam.edges.find((r) => r.kind === 'delete-prefix' && r.detail.k === 1);
    const control = findMatchedControlProbe(prefix, allRows, ctx.tokens, posMap);
    expect(control).not.toBe(null);
    expect(control.kind).toBe('delete-suffix');
    expect(control.detail.k).toBe(1);
  });

  it('a substitution is controlled by the same probe class at a different index', () => {
    const sub = beam.substitutions.find((r) => r.kind.startsWith('substitute-'));
    const control = findMatchedControlProbe(sub, allRows, ctx.tokens, posMap);
    expect(control).not.toBe(null);
    expect(control.kind).toBe(sub.kind);
    expect(control.detail.index).not.toBe(sub.detail.index);
  });

  it('a control is never the probe itself', () => {
    for (const row of allRows) {
      const control = findMatchedControlProbe(row, allRows, ctx.tokens, posMap);
      if (control) expect(control).not.toBe(row);
    }
  });

  it('no illuminated projection enters the scan without a counterfactual', () => {
    const scan = tomographicScan(ctx.tokens, posMap, ctx.chart, ctx.gold.verb, null, { probes });
    const kinds = new Set(scan.tomographicProjections.map((p) => p.kind));
    // The fixture lights edge AND substitution probes, not just deletions.
    expect([...kinds].some((k) => k.startsWith('delete-prefix') || k.startsWith('delete-suffix'))).toBe(true);
    expect([...kinds].some((k) => k.startsWith('substitute-'))).toBe(true);
    for (const p of scan.tomographicProjections) {
      expect(p.control).not.toBe(null);
      expect(p.excess).not.toBe(null);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * DEFECT 3 — tomographicScan accepted `options` but recomposed the perturbed
 * charts with `{}`, so a caller's composition settings applied to the dark
 * chart and not to the beam. The patient could change between X-rays.
 * Production change that would make this fail: hard-coding `{}` back into
 * either composePacked call.
 * ──────────────────────────────────────────────────────────────────────── */
describe('the beam composes under the caller options, not under defaults', () => {
  const lit = (rows) => rows.filter((r) => r.effect === 'ILLUMINATED').length;

  it('a root doorway supplied by the caller reaches the perturbed charts', () => {
    const ctx = byText(DARK);
    const clausal = fireBeam(ctx.tokens, posMap, ctx.chart, ctx.gold.verb, { probes });
    const widened = fireBeam(ctx.tokens, posMap, ctx.chart, ctx.gold.verb, {
      probes, roots: ROOT_DOORWAY.ALL,
    });
    // If options never arrived the two runs would be byte-identical, which is
    // the defect. Deletions here COLLAPSE (no spanning molecule at all), so the
    // doorway cannot reach them — the edge and substitution arms are where a
    // widened root set is observable.
    expect(lit(widened.substitutions)).toBeGreaterThan(lit(clausal.substitutions));
    expect(lit(widened.edges)).toBeGreaterThan(lit(clausal.edges));
  });

  it('opening the doorway never extinguishes a root that was already lit', () => {
    const ctx = byText(DARK);
    const clausal = fireBeam(ctx.tokens, posMap, ctx.chart, ctx.gold.verb, { probes });
    const widened = fireBeam(ctx.tokens, posMap, ctx.chart, ctx.gold.verb, {
      probes, roots: ROOT_DOORWAY.ALL,
    });
    for (const arm of ['deletions', 'edges', 'substitutions']) {
      expect(lit(widened[arm])).toBeGreaterThanOrEqual(lit(clausal[arm]));
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * DEFECT 4 — scoreAnswer located an atom by the FIRST matching lemma, so a
 * word occurring twice collapsed onto one identity and the other occurrence
 * was unreachable.
 * Production change that would make these fail: restoring `findIndex`.
 * ──────────────────────────────────────────────────────────────────────── */
describe('repeated words are distinguishable to the beacon', () => {
  const pos = new Map([['the', []], ['round', ['n', 'v', 'a', 'r']], ['fell', ['n', 'v']]]);
  // slot 0 `round` scores N=0.583; slot 2 `round` scores N=1.233.
  const field = buildBeaconField(['round', 'the', 'round', 'fell'], pos);

  it('an explicit index scores the atom at THAT span', () => {
    const first = scoreAnswer({ subject: 'round', verb: 'fell', subjectIndex: 0 }, field);
    const third = scoreAnswer({ subject: 'round', verb: 'fell', subjectIndex: 2 }, field);
    expect(first).not.toBeCloseTo(third, 6);
    expect(third).toBeGreaterThan(first);
  });

  it('without an index it scores the best occurrence, not the leftmost', () => {
    const best = scoreAnswer({ subject: 'round', verb: 'fell' }, field);
    const leftmost = scoreAnswer({ subject: 'round', verb: 'fell', subjectIndex: 0 }, field);
    const rightmost = scoreAnswer({ subject: 'round', verb: 'fell', subjectIndex: 2 }, field);
    expect(best).toBeCloseTo(rightmost, 10);
    expect(best).not.toBeCloseTo(leftmost, 6);
  });

  it('a unique lemma scores identically with or without its index', () => {
    const withIdx = scoreAnswer({ subject: 'round', verb: 'fell', verbIndex: 3 }, field);
    const without = scoreAnswer({ subject: 'round', verb: 'fell' }, field);
    expect(withIdx).toBeCloseTo(without, 10);
  });

  it('an out-of-range index is an abstention, not a silent fallback to first', () => {
    const bogus = scoreAnswer({ subject: 'round', verb: 'fell', subjectIndex: 99 }, field);
    const verbOnly = scoreAnswer({ verb: 'fell' }, field);
    expect(bogus).toBeCloseTo(verbOnly, 10);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * DEFECT 5 — on a score tie pickResonantAnswer silently crowned the first
 * candidate. The tie was invisible to every caller.
 * Production change that would make these fail: dropping the tie report.
 * ──────────────────────────────────────────────────────────────────────── */
describe('a tie is reported, not silently broken', () => {
  const pos = new Map([['dogs', ['n', 'v']], ['saw', ['n', 'v']]]);
  const field = buildBeaconField(['dogs', 'saw', 'dogs'], pos);
  const tiedPair = [{ subject: 'dogs', verb: 'saw' }, { subject: 'saw', verb: 'dogs' }];

  it('names the tie and how many candidates share the top score', () => {
    const out = pickResonantAnswerDetailed(tiedPair, field);
    expect(out.tied).toBe(true);
    expect(out.tiedCount).toBe(2);
    expect(out.answer).toBe(tiedPair[0]);
  });

  it('reports a clear win as untied', () => {
    const pos2 = new Map([['old', ['a']], ['men', ['n']], ['ran', ['v']]]);
    const f2 = buildBeaconField(['old', 'men', 'ran'], pos2);
    const out = pickResonantAnswerDetailed(
      [{ subject: 'men', verb: 'ran' }, { subject: 'ran', verb: 'men' }],
      f2,
    );
    expect(out.tied).toBe(false);
    expect(out.tiedCount).toBe(1);
  });

  it('the plain picker still returns a deterministic winner', () => {
    expect(pickResonantAnswer(tiedPair, field)).toBe(tiedPair[0]);
  });

  it('a single candidate is never a tie', () => {
    const out = pickResonantAnswerDetailed([tiedPair[0]], field);
    expect(out.tied).toBe(false);
    expect(out.tiedCount).toBe(1);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * DEFECT 6 — efficacyVerdict crowned REAL_BEATS_CONTROLS on any positive
 * margin: 1 vs 0, and 301 vs 300. No effect size, no test, no uncertainty.
 * Production change that would make these fail: crowning without the paired
 * sign test the callers already compute.
 * ──────────────────────────────────────────────────────────────────────── */
describe('the crown requires the test that sits next to it', () => {
  it('refuses to crown a one-hit margin with no paired test', () => {
    expect(efficacyVerdict({ realHits: 1, derangeHits: 0, nullHits: 0 }))
      .toBe('REAL_EXCEEDS_CONTROLS_UNTESTED');
  });

  it('refuses to crown 301 vs 300 with no paired test', () => {
    expect(efficacyVerdict({ realHits: 301, derangeHits: 300, nullHits: 300 }))
      .toBe('REAL_EXCEEDS_CONTROLS_UNTESTED');
  });

  it('refuses to crown a paired result that is not significant', () => {
    expect(efficacyVerdict({
      realHits: 301, derangeHits: 300, nullHits: 300, pairedWins: 1, pairedLosses: 0,
    })).toBe('REAL_EXCEEDS_CONTROLS_NOT_SIGNIFICANT');
  });

  it('crowns only when the paired sign test clears alpha', () => {
    expect(efficacyVerdict({
      realHits: 40, derangeHits: 20, nullHits: 20, pairedWins: 20, pairedLosses: 2,
    })).toBe('REAL_BEATS_CONTROLS');
  });

  it('still falsifies on an exact tie in the marginals', () => {
    expect(efficacyVerdict({ realHits: 7, derangeHits: 7, pairedWins: 20, pairedLosses: 2 }))
      .toBe('FALSIFIED_OR_NONDISCRIMINATIVE');
  });

  it('still reports a control win regardless of the paired test', () => {
    expect(efficacyVerdict({
      realHits: 3, derangeHits: 9, pairedWins: 20, pairedLosses: 2,
    })).toBe('CONTROL_WINS_OR_FLAT');
  });

  it('does not crown when the null arm ties the real arm', () => {
    expect(efficacyVerdict({
      realHits: 40, derangeHits: 20, nullHits: 40, pairedWins: 20, pairedLosses: 2,
    })).toBe('CONTROL_WINS_OR_FLAT');
  });
});
