/**
 * OVERGENERATION GATE — preregistered falsifiers
 *
 * Production change that would make these fail: admitting a bond that
 * raises OVERGENERATED; counting a mixed-frontier fix as explanatory
 * span; joining baseline to treated on caseId (which hashes the plate);
 * or letting a pair through that each half passes alone.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseConllu } from '../../../codex/core/constellation/treebank.js';
import { loadPosMap } from '../../../scripts/lib/constellation-corpus.mjs';

import {
  admitCumulative,
  calibrateAgainstLicensed,
  gateCandidateBonds,
  judgeCandidate,
} from '../../../codex/research/parser-failure-atlas/overgeneration-gate.js';

/**
 * `contained` is independent of `plate`: an overgenerated parse can
 * still contain the gold answer. Only a test that means "the answer was
 * taken away" sets it false.
 */
const row = (sentId, plate, extra = {}) => ({
  sentId,
  plate,
  contained: extra.contained ?? true,
  labels: extra.labels ?? [],
});

describe('judgeCandidate', () => {
  it('rejects a bond that raises the OVERGENERATED plate', () => {
    const baseline = [row('s1', 'GRAMMAR', { labels: ['obj (VERB -> ROOT)'] }), row('s2', null)];
    const treated = [row('s1', null), row('s2', 'OVERGENERATED')];

    const verdict = judgeCandidate(baseline, treated);

    expect(verdict.overgenerated).toBe(1);
    expect(verdict.verdict).toBe('REJECTED_OVERGENERATION');
  });

  it('rejects a bond that breaks a previously contained sentence', () => {
    const baseline = [
      row('s1', 'GRAMMAR', { labels: ['obj (VERB -> ROOT)'] }),
      row('s2', null, { contained: true }),
    ];
    const treated = [row('s1', null), row('s2', null, { contained: false })];

    const verdict = judgeCandidate(baseline, treated);

    expect(verdict.overgenerated).toBe(0);
    expect(verdict.regressed).toBe(1);
    expect(verdict.verdict).toBe('REJECTED_REGRESSION');
  });

  it('rejects a bond whose explained cases all carry one construction label', () => {
    const baseline = [
      row('s1', 'GRAMMAR', { labels: ['obj (VERB -> ROOT)'] }),
      row('s2', 'GRAMMAR', { labels: ['obj (VERB -> ROOT)'] }),
      row('s3', 'GRAMMAR', { labels: ['obj (VERB -> ROOT)'] }),
    ];
    const treated = [row('s1', null), row('s2', null), row('s3', null)];

    const verdict = judgeCandidate(baseline, treated);

    expect(verdict.explained).toBe(3);
    expect(verdict.labelsSpanned).toBe(1);
    expect(verdict.verdict).toBe('REJECTED_SPECIAL_CASE');
  });

  it('admits a bond whose explained cases span two construction labels', () => {
    const baseline = [
      row('s1', 'GRAMMAR', { labels: ['obj (VERB -> ROOT)'] }),
      row('s2', 'GRAMMAR', { labels: ['nmod (NOUN -> NOUN)'] }),
    ];
    const treated = [row('s1', null), row('s2', null)];

    const verdict = judgeCandidate(baseline, treated);

    expect(verdict.explained).toBe(2);
    expect(verdict.labelsSpanned).toBe(2);
    expect(verdict.verdict).toBe('ADMITTED');
  });

  it('calls a bond that explains nothing INERT, not a special case', () => {
    const baseline = [row('s1', 'GRAMMAR', { labels: ['obj (VERB -> ROOT)'] })];
    const treated = [row('s1', 'GRAMMAR', { labels: ['obj (VERB -> ROOT)'] })];

    const verdict = judgeCandidate(baseline, treated);

    expect(verdict.explained).toBe(0);
    expect(verdict.verdict).toBe('REJECTED_INERT');
  });
});

describe('admitCumulative', () => {
  /**
   * A and B each explain two labels alone and overgenerate nothing.
   * Fired together they license a parse gold POS forbids on s9.
   * One-at-a-time gating cannot see this; only the cumulative pass can.
   */
  const baseline = [
    row('s1', 'GRAMMAR', { labels: ['obj (VERB -> ROOT)'] }),
    row('s2', 'GRAMMAR', { labels: ['nmod (NOUN -> NOUN)'] }),
    row('s3', 'GRAMMAR', { labels: ['case (ADP -> NOUN)'] }),
    row('s4', 'GRAMMAR', { labels: ['advmod (ADV -> VERB)'] }),
    row('s9', null, { contained: true }),
    row('s10', null), row('s11', null), row('s12', null),
    row('s13', null), row('s14', null),
  ];

  const OUTCOMES = new Map([
    ['A', [row('s1', null), row('s2', null), row('s3', 'GRAMMAR'), row('s4', 'GRAMMAR'), row('s9', null, { contained: true })]],
    ['B', [row('s1', 'GRAMMAR'), row('s2', 'GRAMMAR'), row('s3', null), row('s4', null), row('s9', null, { contained: true })]],
    ['A+B', [
      row('s1', null), row('s2', null), row('s3', null), row('s4', null),
      row('s9', 'OVERGENERATED'), row('s10', 'OVERGENERATED'), row('s11', 'OVERGENERATED'),
      row('s12', 'OVERGENERATED'), row('s13', 'OVERGENERATED'), row('s14', 'OVERGENERATED'),
    ]],
  ]);

  const rescore = (signatures) => OUTCOMES.get([...signatures].sort().join('+'));

  it('rejects a pair that each half passes alone', () => {
    const candidates = [
      { signature: 'A', bonds: [['S', 'NP', 'S', 0]] },
      { signature: 'B', bonds: [['NP', 'PP', 'NP', 0]] },
    ];

    const result = admitCumulative(baseline, candidates, rescore);

    expect(result.admitted.map((c) => c.signature)).toEqual(['A']);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({
      signature: 'B',
      stage: 'cumulative',
      verdict: 'REJECTED_OVERGENERATION',
    });
    expect(result.rejected[0].solo.verdict).toBe('ADMITTED');
  });
});

describe('gateCandidateBonds', () => {
  const records = parseConllu(
    readFileSync('tests/qa/fixtures/constellation/treebank-gate.conllu', 'utf8'),
  ).filter((r) => (r.tokens || []).length <= 12).slice(0, 40);
  const posMap = loadPosMap();

  it('plates every record it is given under both the stock and the trial table', () => {
    const report = gateCandidateBonds(records, posMap, [
      { signature: 'S|NP|S', bonds: [['S', 'NP', 'S', 0]] },
    ]);

    expect(report.recordsScored).toBe(records.length);
    expect(report.baselineRows).toBe(records.length);
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0].signature).toBe('S|NP|S');
  });

  it('is deterministic across two runs on the same records', () => {
    const args = [records, posMap, [{ signature: 'S|NP|S', bonds: [['S', 'NP', 'S', 0]] }]];
    expect(gateCandidateBonds(...args).checksum).toBe(gateCandidateBonds(...args).checksum);
  });
});

describe('F3 — the verdict reads the atlas, not just the parse count', () => {
  it('turns an admitted bond into a special case when label provenance is stripped', () => {
    const baseline = [
      row('s1', 'GRAMMAR', { labels: ['obj (VERB -> ROOT)'] }),
      row('s2', 'GRAMMAR', { labels: ['nmod (NOUN -> NOUN)'] }),
    ];
    const treated = [row('s1', null), row('s2', null)];
    const stripped = baseline.map((r) => ({ ...r, labels: [] }));

    expect(judgeCandidate(baseline, treated).verdict).toBe('ADMITTED');
    expect(judgeCandidate(stripped, treated).verdict).toBe('REJECTED_SPECIAL_CASE');
  });
});

describe('the bar is calibrated, not absolute', () => {
  /**
   * DET+N->NP explains 14 and overgenerates 10 on the design split.
   * A zero-overgeneration bar rejects the most basic bond in the
   * grammar, which is a check that cannot pass. The bar is the net
   * trade, floored by what the shipped bond table already achieves.
   */
  const wideTrade = () => {
    const baseline = [];
    const treated = [];
    for (let i = 0; i < 14; i += 1) {
      baseline.push(row(`e${i}`, 'GRAMMAR', { labels: [`rel${i % 4} (X -> Y)`] }));
      treated.push(row(`e${i}`, null));
    }
    for (let i = 0; i < 10; i += 1) {
      baseline.push(row(`o${i}`, null));
      treated.push(row(`o${i}`, 'OVERGENERATED'));
    }
    return { baseline, treated };
  };

  it('admits a bond that overgenerates but trades well above the floor', () => {
    const { baseline, treated } = wideTrade();

    const verdict = judgeCandidate(baseline, treated, { netFloor: 1 });

    expect(verdict.explained).toBe(14);
    expect(verdict.overgenerated).toBe(10);
    expect(verdict.net).toBe(4);
    expect(verdict.verdict).toBe('ADMITTED');
  });

  it('rejects the same bond when the floor is raised above its trade', () => {
    const { baseline, treated } = wideTrade();

    expect(judgeCandidate(baseline, treated, { netFloor: 5 }).verdict)
      .toBe('REJECTED_OVERGENERATION');
  });
});

describe('calibrateAgainstLicensed', () => {
  const records = parseConllu(
    readFileSync('tests/qa/fixtures/constellation/treebank-gate.conllu', 'utf8'),
  ).filter((r) => (r.tokens || []).length <= 10).slice(0, 30);
  const posMap = loadPosMap();

  /**
   * The floor must come from a population the gate does not control.
   * Leave-one-out on the shipped bond table is that population: each
   * licensed bond is scored as if it were a candidate.
   */
  // Leave-one-out re-plates the corpus twice per bond; 5s is not enough.
  it('scores licensed bonds leave-one-out and reports a floor', () => {
    const calib = calibrateAgainstLicensed(records, posMap, { sample: 4, maxTokens: 10 });

    expect(calib.scored).toHaveLength(4);
    expect(calib.scored.every((r) => typeof r.net === 'number')).toBe(true);
    expect(typeof calib.netFloor).toBe('number');
    expect(calib.percentile).toBeGreaterThan(0);
  }, 60_000);

  it('is deterministic for the same sample', () => {
    const args = [records, posMap, { sample: 4, maxTokens: 10 }];
    expect(calibrateAgainstLicensed(...args).netFloor)
      .toBe(calibrateAgainstLicensed(...args).netFloor);
  }, 60_000);
});

describe('admitCumulative rejects redundancy', () => {
  /**
   * S|S|S and S|VP|S each explained 7 sentences on the design split and
   * together still explained 7 — the same 7. Clearing the floor as a set
   * is not enough; an addition must improve the set it joins, or it is
   * complexity bought for nothing.
   */
  const baseline = [
    row('s1', 'GRAMMAR', { labels: ['obj (VERB -> ROOT)'] }),
    row('s2', 'GRAMMAR', { labels: ['nmod (NOUN -> NOUN)'] }),
  ];
  const OUTCOMES = new Map([
    ['X', [row('s1', null), row('s2', null)]],
    ['Y', [row('s1', null), row('s2', null)]],
    ['X+Y', [row('s1', null), row('s2', null)]],
  ]);
  const rescore = (sigs) => OUTCOMES.get([...sigs].sort().join('+'));

  it('rejects a second bond that explains nothing the first did not', () => {
    const result = admitCumulative(baseline, [
      { signature: 'X', bonds: [['S', 'S', 'S', 0]] },
      { signature: 'Y', bonds: [['S', 'VP', 'S', 0]] },
    ], rescore);

    expect(result.admitted.map((c) => c.signature)).toEqual(['X']);
    expect(result.rejected[0]).toMatchObject({
      signature: 'Y',
      stage: 'cumulative',
      verdict: 'REJECTED_REDUNDANT',
    });
  });
});

describe('admitCumulative ranks by the trade, not the coverage', () => {
  /**
   * S|S|S and S|VP|S both explained 7. Ranking on explained alone made
   * them tie and handed the slot to whichever sorted first, admitting
   * the net +1 bond and rejecting the net +2 one as redundant. Rank on
   * what the gate actually judges: net per bond added.
   */
  const baseline = [
    row('s1', 'GRAMMAR', { labels: ['a (X -> Y)'] }),
    row('s2', 'GRAMMAR', { labels: ['b (X -> Y)'] }),
    row('o1', null),
    row('o2', null),
  ];
  const OUTCOMES = new Map([
    // cheap: explains both, overgenerates twice  -> net 0
    ['cheap', [row('s1', null), row('s2', null), row('o1', 'OVERGENERATED'), row('o2', 'OVERGENERATED')]],
    // dear: explains both, overgenerates nothing -> net 2
    ['dear', [row('s1', null), row('s2', null), row('o1', null), row('o2', null)]],
    ['cheap+dear', [row('s1', null), row('s2', null), row('o1', 'OVERGENERATED'), row('o2', 'OVERGENERATED')]],
  ]);
  const rescore = (sigs) => OUTCOMES.get([...sigs].sort().join('+'));

  it('admits the better trade when coverage ties', () => {
    const result = admitCumulative(baseline, [
      { signature: 'cheap', bonds: [['S', 'S', 'S', 0]] },
      { signature: 'dear', bonds: [['S', 'VP', 'S', 0]] },
    ], rescore, { netFloor: 0 });

    expect(result.admitted.map((c) => c.signature)).toEqual(['dear']);
  });
});

