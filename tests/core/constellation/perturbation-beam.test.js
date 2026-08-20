/**
 * Perturbation beam — physics plus the agent-facing telemetry.
 *
 * Production change that would make these fail: dropping the after-snapshot
 * from an illuminated row, collapsing substitution noise into the headline
 * count, or emitting a boon whose next step is "admit this type as a root"
 * without a purity gate.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parseConllu, goldAnswer } from '../../../codex/core/constellation/treebank.js';
import { composePacked } from '../../../codex/core/constellation/compose-packed.js';
import {
  BEAM_EFFECTS,
  BEAM_WAVELENGTHS,
  accumulateResidualTraces,
  backProjectDescendingLight,
  classifyEffect,
  computeResponseVector,
  counterfactualExcess,
  couplingExcess,
  findMatchedControlProbe,
  fireBeam,
  kindFamily,
  kindWavelength,
  litHeadMatchesGold,
  massMap,
  nonLocalResonanceScan,
  pickProbeWords,
  spanningSignature,
  spectralCosineSimilarity,
  threeArmCounterfactualAssay,
  tomographicScan,
} from '../../../codex/core/constellation/perturbation-beam.js';
import {
  PURITY_GATE,
  agentBrief,
  autopsyIllumination,
  corpusTelemetry,
  proposeBoons,
  sentencePath,
  sentenceTelemetry,
  tagsOf,
} from '../../../codex/core/constellation/perturbation-telemetry.js';

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
  const gold = goldAnswer(rec);
  const chart = composePacked(tokens, posMap, {});
  return { rec, tokens, gold, chart };
}

function beamOf(text) {
  const ctx = byText(text);
  const beam = fireBeam(ctx.tokens, posMap, ctx.chart, ctx.gold.verb, { probes });
  return { ...ctx, beam };
}

describe('kindFamily', () => {
  it('splits the three beams and nothing else', () => {
    expect(kindFamily('delete')).toBe('delete-token');
    expect(kindFamily('delete-prefix')).toBe('delete-edge');
    expect(kindFamily('delete-suffix')).toBe('delete-edge');
    expect(kindFamily('substitute-v')).toBe('substitute');
    expect(kindFamily('substitute-n+v')).toBe('substitute');
    expect(kindFamily('unknown')).toBe('other');
  });
});

describe('fireBeam after-snapshot', () => {
  it('carries the remainder tokens, stable types, and heads on an illumination', () => {
    const { beam } = beamOf('If she continues !');
    const hit = beam.deletions.find((r) => r.detail.token === 'If' && r.effect === 'ILLUMINATED');
    expect(hit).toBeTruthy();
    expect(hit.after.tokens).toEqual(['she', 'continues', '!']);
    expect(hit.after.stable).toContain('S');
    expect(hit.after.heads).toContain('continues');
  });

  it('still classifies root appearance as ILLUMINATED over refraction', () => {
    const before = { spanning: [{ type: 'SBAR' }], stable: [] };
    const after = { spanning: [{ type: 'S' }], stable: [{ type: 'S' }] };
    expect(classifyEffect(before, after)).toBe('ILLUMINATED');
    expect(spanningSignature(before)).toBe('SBAR');
  });
});

describe('sentencePath', () => {
  it('names substitution-only when no deletion lights a root', () => {
    expect(sentencePath([
      { kind: 'substitute-v', goldHead: false },
      { kind: 'substitute-n+v', goldHead: false },
    ])).toBe('substitution-only');
  });

  it('names deletion-lit-gold when a delete lights a gold head', () => {
    expect(sentencePath([
      { kind: 'delete', goldHead: true },
      { kind: 'substitute-v', goldHead: false },
    ])).toBe('deletion-lit-gold');
  });

  it('names deletion-lit-false when deletions light only a wrong head', () => {
    expect(sentencePath([
      { kind: 'delete-prefix', goldHead: false },
      { kind: 'substitute-v', goldHead: true },
    ])).toBe('deletion-lit-false');
  });

  it('names inert when nothing illuminated', () => {
    expect(sentencePath([])).toBe('inert');
  });
});

describe('autopsyIllumination — the remainder, not the count', () => {
  it('calls delete-If on a gold SBAR a complementizer-unmask via clause', () => {
    const { tokens, gold, chart, beam } = beamOf('If she continues !');
    const row = beam.deletions.find((r) => r.detail.token === 'If');
    const autopsy = autopsyIllumination(row, {
      tokens, posMap, goldVerb: gold.verb, goldSubject: gold.subject,
      darkTypes: chart.spanning.map((m) => m.type),
    });
    expect(autopsy.class).toBe('complementizer-unmask');
    expect(autopsy.via).toBe('clause');
    expect(autopsy.remainderHeads).toContain('continues');
  });

  it('calls delete-who a subject-strip — the gold subject is the mass', () => {
    const { tokens, gold, chart, beam } = beamOf('who fought the wars ?');
    const row = beam.deletions.find((r) => r.detail.token === 'who');
    const autopsy = autopsyIllumination(row, {
      tokens, posMap, goldVerb: gold.verb, goldSubject: gold.subject,
      darkTypes: chart.spanning.map((m) => m.type),
    });
    expect(autopsy.class).toBe('subject-strip');
    expect(gold.subject).toBe('who');
  });

  it('calls a comma unmask on an n+v vocative punct-unmask via n+v-lift', () => {
    const { tokens, gold, chart, beam } = beamOf('Regards ,');
    const row = beam.deletions.find((r) => r.detail.token === ',');
    const autopsy = autopsyIllumination(row, {
      tokens, posMap, goldVerb: gold.verb, goldSubject: gold.subject,
      darkTypes: chart.spanning.map((m) => m.type),
    });
    expect(autopsy.class).toBe('punct-unmask');
    expect(autopsy.via).toBe('n+v-lift');
    expect(tagsOf('Regards', posMap)).toEqual(expect.arrayContaining(['n', 'v']));
  });

  it('calls The-End delete-The a lexical-lift, not a hidden clause', () => {
    const { tokens, gold, chart, beam } = beamOf('The End');
    const row = beam.deletions.find((r) => r.detail.token === 'The');
    const autopsy = autopsyIllumination(row, {
      tokens, posMap, goldVerb: gold.verb, goldSubject: gold.subject,
      darkTypes: chart.spanning.map((m) => m.type),
    });
    expect(autopsy.class).toBe('lexical-lift');
    expect(autopsy.via).toBe('n+v-lift');
  });

  it('returns null on a non-illuminated row', () => {
    expect(autopsyIllumination({ effect: 'COLLAPSED', kind: 'delete' }, {
      tokens: ['a', 'b'], posMap, goldVerb: 'b', goldSubject: null, darkTypes: ['NP'],
    })).toBeNull();
  });
});

describe('proposeBoons — actionable, never a licence', () => {
  const purity = PURITY_GATE;

  it('emits a CANDIDATE for complementizer-unmask and forbids admitting SBAR', () => {
    const boons = proposeBoons([
      {
        text: 'If she continues !',
        path: 'deletion-lit-gold',
        darkTypes: ['SBAR'],
        goldVerb: 'continues',
        goldSubject: 'she',
        autopsies: [{ class: 'complementizer-unmask', via: 'clause', goldHead: true }],
      },
    ]);
    const hit = boons.find((b) => b.id === 'complementizer-unmask');
    expect(hit.status).toBe('CANDIDATE');
    expect(hit.n).toBe(1);
    expect(hit.gate).toBe(purity);
    expect(hit.forbidden.toLowerCase()).toMatch(/admit|root/);
    expect(hit.nextProbe).toMatch(/purity/i);
    expect(hit.nextProbe.toLowerCase()).not.toMatch(/admit \w+ as a root/);
  });

  it('marks lexical-lift and substitution-only nominals as NOT_A_BOON', () => {
    const boons = proposeBoons([
      {
        text: 'The End',
        path: 'deletion-lit-gold',
        darkTypes: ['NP'],
        goldVerb: 'End',
        goldSubject: null,
        autopsies: [{ class: 'lexical-lift', via: 'n+v-lift', goldHead: true }],
      },
      {
        text: 'The other problem ?',
        path: 'substitution-only',
        darkTypes: ['NP'],
        goldVerb: 'problem',
        goldSubject: null,
        autopsies: [],
      },
    ]);
    expect(boons.find((b) => b.id === 'lexical-lift').status).toBe('NOT_A_BOON');
    expect(boons.find((b) => b.id === 'finished-nominal').status).toBe('NOT_A_BOON');
    expect(boons.find((b) => b.id === 'finished-nominal').forbidden).toMatch(/NP/);
  });

  it('flags INV whose spanning head is not the gold root', () => {
    const boons = proposeBoons([
      {
        text: 'Have fun .',
        path: 'substitution-only',
        darkTypes: ['INV'],
        darkHeads: { INV: ['fun'] },
        goldVerb: 'Have',
        goldSubject: null,
        autopsies: [],
      },
    ]);
    const hit = boons.find((b) => b.id === 'inv-head-mismatch');
    expect(hit.status).toBe('CANDIDATE');
    expect(hit.gate).toBe(purity);
    expect(hit.forbidden.toLowerCase()).toMatch(/admit|root/);
  });

  it('never emits a boon whose nextProbe admits a root type', () => {
    const boons = proposeBoons([
      {
        text: 'If she continues !',
        path: 'deletion-lit-gold',
        darkTypes: ['SBAR'],
        goldVerb: 'continues',
        goldSubject: 'she',
        autopsies: [{ class: 'complementizer-unmask', via: 'clause', goldHead: true }],
      },
      {
        text: 'Have fun .',
        path: 'substitution-only',
        darkTypes: ['INV'],
        darkHeads: { INV: ['fun'] },
        goldVerb: 'Have',
        goldSubject: null,
        autopsies: [],
      },
      {
        text: 'Sincerely ,',
        path: 'substitution-only',
        darkTypes: ['FRONTED'],
        darkHeads: { FRONTED: ['Sincerely'] },
        goldVerb: 'Sincerely',
        goldSubject: null,
        autopsies: [],
      },
    ]);
    expect(boons.length).toBeGreaterThan(0);
    for (const b of boons) {
      expect(b.gate).toBe(purity);
      expect(typeof b.claim).toBe('string');
      expect(typeof b.nextProbe).toBe('string');
      expect(typeof b.forbidden).toBe('string');
      expect(b.nextProbe.toLowerCase()).not.toMatch(/admit \S+ as (a )?root/);
    }
  });
});

describe('corpusTelemetry + agentBrief', () => {
  it('splits illuminations by family so 296 cannot hide 269 substitutions', () => {
    const a = beamOf('If she continues !');
    const b = beamOf('The other problem ?');
    const corpus = corpusTelemetry([
      sentenceTelemetry({
        sentId: a.rec.sentId, tokens: a.tokens, posMap, darkChart: a.chart,
        goldVerb: a.gold.verb, goldSubject: a.gold.subject, beam: a.beam,
      }),
      sentenceTelemetry({
        sentId: b.rec.sentId, tokens: b.tokens, posMap, darkChart: b.chart,
        goldVerb: b.gold.verb, goldSubject: b.gold.subject, beam: b.beam,
      }),
    ]);
    expect(corpus.paths['deletion-lit-gold']).toBe(1);
    expect(corpus.paths['substitution-only']).toBe(1);
    expect(corpus.byFamily.substitute.illuminated).toBeGreaterThan(0);
    expect(corpus.byFamily['delete-token'].goldHead).toBeGreaterThan(0);
    expect(corpus.litTypes).toEqual(['S']);
    expect(corpus.boons.some((x) => x.id === 'complementizer-unmask')).toBe(true);
  });

  it('writes a brief an agent can act on without reconstructing the slices', () => {
    const a = beamOf('If she continues !');
    const corpus = corpusTelemetry([
      sentenceTelemetry({
        sentId: a.rec.sentId, tokens: a.tokens, posMap, darkChart: a.chart,
        goldVerb: a.gold.verb, goldSubject: a.gold.subject, beam: a.beam,
      }),
    ]);
    const brief = agentBrief(corpus);
    expect(brief).toMatch(/deletion-lit-gold/i);
    expect(brief).toMatch(/complementizer-unmask/);
    expect(brief).toMatch(/PURITY/);
    expect(brief.toLowerCase()).not.toMatch(/admit \S+ as (a )?root/);
    expect(litHeadMatchesGold({ stable: [{ type: 'S' }] }, null)).toBeNull();
  });

  it('massMap still reports raw illuminations — telemetry is additive', () => {
    const { beam } = beamOf('The End');
    const map = massMap(beam);
    expect(map.illuminations.length).toBeGreaterThan(0);
    expect(map.effects.ILLUMINATED).toBe(map.illuminations.length);
  });
});

describe('kindWavelength', () => {
  it('maps probe families to spectral bands', () => {
    expect(kindWavelength('delete')).toBe('hard-uv');
    expect(kindWavelength('delete-prefix')).toBe('soft-uv');
    expect(kindWavelength('delete-suffix')).toBe('soft-uv');
    expect(kindWavelength('substitute-v')).toBe('optical-v');
    expect(kindWavelength('substitute-n+v')).toBe('optical-n+v');
    expect(kindWavelength('substitute-n')).toBe('optical-n');
    expect(kindWavelength('substitute-a')).toBe('optical-a');
    expect(kindWavelength('substitute-r')).toBe('optical-r');
    expect(kindWavelength('mask-token')).toBe('infrared');
    expect(kindWavelength('suppress-bond')).toBe('radio');
    expect(kindWavelength('unknown-probe')).toBe('other');
  });
});

describe('Spectral Response Vector & Residual Trace Accumulator', () => {
  it('attaches wavelength and 6D response vector to every fireBeam row', () => {
    const { beam } = beamOf('If she continues !');
    const delIf = beam.deletions.find((r) => r.detail.token === 'If');
    expect(delIf.wavelength).toBe('hard-uv');
    expect(delIf.vector).toBeDefined();
    expect(delIf.vector.rootReachability).toBe(1.0);
    expect(delIf.vector.headDivergence).toBe(0.0);
    expect(delIf.vector.topologyDisplacement).toBeGreaterThanOrEqual(0);
    expect(delIf.vector.spanAperture).toBe(1.0);
  });

  it('separates deletions by response vector and head divergence', () => {
    const { beam } = beamOf('The End');
    const delThe = beam.deletions.find((r) => r.detail.token === 'The');
    const delEnd = beam.deletions.find((r) => r.detail.token === 'End');

    expect(delThe.effect).toBe('ILLUMINATED');
    expect(delThe.goldHead).toBe(true);
    expect(delThe.vector.rootReachability).toBe(1.0);
    expect(delThe.vector.headDivergence).toBe(0.0);

    expect(delEnd.effect).toBe('REFRACTED');
    expect(delEnd.vector.rootReachability).toBe(0.0);
  });

  it('accumulates residual traces and focalizes on the obstruction span', () => {
    const { tokens, chart, beam } = beamOf('who fought the wars ?');
    const allRows = [...beam.edges, ...beam.deletions, ...beam.substitutions];
    const trace = accumulateResidualTraces(tokens, chart, allRows);

    expect(trace.tokenStress).toHaveLength(tokens.length);
    // Token 0 ("who") is the obstruction unmasking the gold head (fought)
    expect(trace.tokenStress[0]).toBeGreaterThan(trace.tokenStress[1]);
    expect(trace.focalSpans.length).toBeGreaterThan(0);
    expect(trace.focalSpans[0].span).toEqual([0, 1]);
    expect(trace.focalSpans[0].text).toBe('who');
  });

  it('sentenceTelemetry carries residualTrace with focalSpans', () => {
    const { rec, tokens, chart, gold, beam } = beamOf('who fought the wars ?');
    const tel = sentenceTelemetry({
      sentId: rec.sentId,
      tokens,
      posMap,
      darkChart: chart,
      goldVerb: gold.verb,
      goldSubject: gold.subject,
      beam,
    });

    expect(tel.residualTrace).toBeDefined();
    expect(tel.residualTrace.tokenStress).toHaveLength(tokens.length);
    expect(tel.residualTrace.focalSpans[0].text).toBe('who');
  });
});

describe('Phase 2: Optical Fusion & Counterfactual Paired Probes', () => {
  it('back-projects descending light to isolate participating atoms and obstruction tokens', () => {
    const { tokens, gold } = beamOf('who fought the wars ?');
    const perturbedTokens = tokens.slice(1); // delete 'who' (index 0)
    const afterChart = composePacked(perturbedTokens, posMap, {});

    const projection = backProjectDescendingLight(tokens, 'delete', { index: 0, token: 'who' }, afterChart, gold.verb);

    expect(projection.recoveredRoot).toBe('S');
    expect(projection.goldHeadMatch).toBe(true);
    expect(projection.participatingTokens).toEqual(['fought', 'the', 'wars', '?']);
    expect(projection.participatingIndices).toEqual([1, 2, 3, 4]);
    expect(projection.obstructionTokens).toEqual(['who']);
    expect(projection.obstructionIndices).toEqual([0]);
    expect(projection.projectedAnswers).toEqual(expect.arrayContaining([
      expect.objectContaining({ verb: 'fought' }),
    ]));
  });

  it('computes counterfactual excess response and distinguishes signal from control noise', () => {
    const { tokens, chart, gold, beam } = beamOf('who fought the wars ?');
    const delWho = beam.deletions.find((r) => r.detail.token === 'who');
    const control = findMatchedControlProbe(delWho, beam.deletions, tokens, posMap);

    expect(control).toBeDefined();
    expect(control.detail.token).not.toBe('who');

    const excess = counterfactualExcess(delWho.vector, control.vector);
    expect(excess.isContrastive).toBe(true);
    expect(excess.excessRootReachability).toBeGreaterThanOrEqual(0);
  });

  it('runs complete tomographicScan and produces integrated scanner telemetry', () => {
    const { rec, tokens, chart, gold } = beamOf('who fought the wars ?');
    const scan = tomographicScan(tokens, posMap, chart, gold.verb, gold.subject);

    expect(scan.tokens).toEqual(tokens);
    expect(scan.residualTrace).toBeDefined();
    expect(scan.topFocalObstruction).toBeDefined();
    expect(scan.topFocalObstruction.text).toBe('who');
    expect(scan.tomographicProjections.length).toBeGreaterThan(0);

    const hit = scan.tomographicProjections.find((p) => p.detail?.token === 'who');
    expect(hit).toBeDefined();
    expect(hit.projection.recoveredRoot).toBe('S');
    expect(hit.projection.participatingTokens).toEqual(['fought', 'the', 'wars', '?']);
    expect(hit.projection.obstructionTokens).toEqual(['who']);
  });
});

describe('Phase 3: Non-Local Spectral Resonance & Three-Arm Counterfactual Assay', () => {
  it('computes spectral cosine similarity between 6D response vectors', () => {
    const v1 = { rootReachability: 1.0, headDivergence: 0.0, derivationDelta: -5, topologyDisplacement: 0.2, resonanceDelta: 0.1, spanAperture: 1.0 };
    const v2 = { rootReachability: 1.0, headDivergence: 0.0, derivationDelta: -5, topologyDisplacement: 0.2, resonanceDelta: 0.1, spanAperture: 1.0 };
    const v3 = { rootReachability: -1.0, headDivergence: 1.0, derivationDelta: 10, topologyDisplacement: 0.8, resonanceDelta: -0.5, spanAperture: 0.2 };

    expect(spectralCosineSimilarity(v1, v2)).toBeCloseTo(1.0, 3);
    expect(spectralCosineSimilarity(v1, v3)).toBeLessThan(0.0);
  });

  it('detects super-additive coupling excess C(i, j) on entangled distant pairs', () => {
    const { rec, tokens, chart, gold } = beamOf('No service .. But good food ..');
    const scan = nonLocalResonanceScan(tokens, posMap, chart, gold.verb, { minDistance: 2 });

    expect(scan.entangledCouplings.length).toBeGreaterThan(0);
    const entangled = scan.entangledCouplings.find((p) => p.tokenI === 'No' && p.tokenJ === '..');
    expect(entangled).toBeDefined();
    expect(entangled.coupling.isSuperAdditive).toBe(true);
    expect(entangled.goldHeadMatch).toBe(true);
  });

  it('identifies structural homology across long-distance name lists', () => {
    const { rec, tokens, chart, gold } = beamOf('Jeffrey Synder , Ryan Hinze , Sheetal Patel , Johnathan Anderson');
    const scan = nonLocalResonanceScan(tokens, posMap, chart, gold.verb, { minDistance: 5 });

    expect(scan.homologousPairs.length).toBeGreaterThan(0);
    const distantPair = scan.homologousPairs.find((p) => p.tokenI === 'Jeffrey' && p.tokenJ === 'Anderson');
    expect(distantPair).toBeDefined();
    expect(distantPair.sim).toBeGreaterThanOrEqual(0.95);
  });

  it('arbitrates three-arm counterfactual assay to classify defect type', () => {
    const { rec, tokens, chart, gold } = beamOf('Jeffrey Synder , Ryan Hinze , Sheetal Patel , Johnathan Anderson');
    const pair = { i: 0, j: 10, tokenI: 'Jeffrey', tokenJ: 'Anderson' };
    const assay = threeArmCounterfactualAssay(tokens, posMap, chart, pair, gold.verb);

    expect(assay.winningArm).toBe('doorway');
    expect(assay.classification).toBe('GRAMMAR_DOORWAY_GAP');
    expect(assay.telemetry.armC.lit).toBe(true);
  });
});
