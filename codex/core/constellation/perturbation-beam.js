/**
 * PERTURBATION BEAM — infer dark structure by how the chart moves.
 *
 * A DARK sentence builds a molecule covering every token yet admits no root:
 * `stable.length === 0 && spanning.length > 0`. Its analysis exists but is
 * invisible to any root-status search — dark matter in the parse. The census
 * (`scripts/gap-zero-sweep.mjs`) names the class; this beam images it.
 *
 * THE PHYSICS. You cannot see invisible mass directly, but light passing near
 * it refracts: perturb the input and watch how the chart responds. Each
 * single-token perturbation is one beam; the pattern of responses across all
 * beams is a mass map of what the dark molecule is actually made of.
 *
 * THREE BEAMS, ALL PURE, ALL DETERMINISTIC:
 *
 *   DELETION BEAM   remove exactly one token, recompose, classify the effect
 *                   on root status. The token whose removal turns dark→lit is
 *                   the mass bending the parse away from a root.
 *
 *   EDGE BEAM       delete the first/last k tokens (k <= 3). Distinguishes
 *                   edge-attachment failure (fronting, fringe punctuation)
 *                   from internal failure without paying for the full
 *                   single-token sweep on long sentences.
 *
 *   SUBSTITUTION    replace one token with a canonical probe word of a pure
 *                   content class, drawn deterministically from the SAME
 *                   lexicon the sentence was typed with. Asks: is this atom's
 *                   TYPE the obstruction, or its POSITION?
 *
 * FOUR EFFECTS, AND ONLY FOUR:
 *
 *   ILLUMINATED  after the perturbation `stable.length > 0`. A root now
 *                exists. The perturbation removed the obstruction.
 *   REFRACTED    still dark, but the full-width type SET changed. Structure
 *                moved without reaching a root.
 *   INVARIANT    still dark, identical full-width type set. The perturbed
 *                token carried no load for root status.
 *   COLLAPSED    no full-width molecule at all. The token was load-bearing
 *                for span coverage itself.
 *
 * THE PURITY LAW, INHERITED FROM THE CENSUS VERDICT: this beam is a PROBE.
 * It never proposes admitting a new root type and never edits the bond table.
 * Coverage cannot fall when a root type is admitted, so the only legitimate
 * downstream gate is head accuracy plus a purity check — never a count of
 * illuminated sentences. The beam therefore records, for every ILLUMINATED
 * perturbation, whether the lit root's head set contains the gold verb, so a
 * future gate has the measurement and not the temptation.
 *
 * @module codex/core/constellation/perturbation-beam
 */

import { composePacked, headsOf, projectAnswers, ROOT_DOORWAY } from './compose-packed.js';
import { emitDescendingLight } from './resonance-beacon.js';

export const BEAM_EFFECTS = Object.freeze([
  'ILLUMINATED', 'REFRACTED', 'INVARIANT', 'COLLAPSED',
]);

export const BEAM_WAVELENGTHS = Object.freeze([
  'hard-uv', 'soft-uv', 'optical-n', 'optical-n+v', 'optical-v', 'optical-a', 'optical-r', 'optical', 'infrared', 'radio', 'other',
]);

/**
 * The three beams, collapsed to the question each one asks. Unknown kinds
 * stay `other` rather than being forced into a family — a new beam must
 * name itself.
 *
 * @param {string} kind
 * @returns {'delete-token'|'delete-edge'|'substitute'|'other'}
 */
export function kindFamily(kind) {
  if (kind === 'delete') return 'delete-token';
  if (kind === 'delete-prefix' || kind === 'delete-suffix') return 'delete-edge';
  if (String(kind).startsWith('substitute-')) return 'substitute';
  return 'other';
}

/**
 * Classify a perturbation's spectral wavelength.
 *
 * @param {string} kind
 * @returns {string}
 */
export function kindWavelength(kind) {
  if (kind === 'delete') return 'hard-uv';
  if (kind === 'delete-prefix' || kind === 'delete-suffix') return 'soft-uv';
  if (kind === 'substitute-v') return 'optical-v';
  if (kind === 'substitute-n+v') return 'optical-n+v';
  if (kind === 'substitute-n') return 'optical-n';
  if (kind === 'substitute-a') return 'optical-a';
  if (kind === 'substitute-r') return 'optical-r';
  if (String(kind).startsWith('substitute-')) return 'optical';
  if (String(kind).startsWith('mask')) return 'infrared';
  if (String(kind).startsWith('suppress')) return 'radio';
  return 'other';
}

/**
 * Computes the 6D Spectral Response Vector:
 * - rootReachability (Δρ): 1.0 = new root, 0.0 = dark, -1.0 = collapsed
 * - headDivergence (d_H): 0.0 = matches gold verb, 1.0 = false head, null = no root
 * - derivationDelta (Δ|D|): change in derivation count
 * - topologyDisplacement (D_topo): Jaccard distance over spanning molecule categories
 * - resonanceDelta (ΔΦ): flux in spanning molecule energy
 * - spanAperture (ΔW): maximum spanning ratio
 *
 * @param {object} beforeChart
 * @param {object} afterChart
 * @param {string|null} [goldVerb]
 * @param {number} [totalTokens]
 * @returns {Readonly<{rootReachability: number, headDivergence: number|null, derivationDelta: number, topologyDisplacement: number, resonanceDelta: number, spanAperture: number}>}
 */
export function computeResponseVector(beforeChart, afterChart, goldVerb = null, totalTokens = 1) {
  const afterStable = ((afterChart && afterChart.stable) || []).length > 0;
  const afterSpanning = ((afterChart && afterChart.spanning) || []).length > 0;

  let rootReachability = 0.0;
  if (afterStable) {
    rootReachability = 1.0;
  } else if (!afterSpanning) {
    rootReachability = -1.0;
  }

  let headDivergence = null;
  if (afterStable && goldVerb != null) {
    headDivergence = litHeadMatchesGold(afterChart, goldVerb) ? 0.0 : 1.0;
  }

  const countDerivations = (chart) => {
    const list = (chart && chart.molecules) || (chart && chart.spanning) || [];
    let count = 0;
    for (const m of list) {
      count += (m.derivations && m.derivations.length) || 1;
    }
    return count;
  };
  const derivationDelta = countDerivations(afterChart) - countDerivations(beforeChart);

  const beforeSpanningTypes = new Set(((beforeChart && beforeChart.spanning) || []).map((m) => m.type));
  const afterSpanningTypes = new Set(((afterChart && afterChart.spanning) || []).map((m) => m.type));
  const union = new Set([...beforeSpanningTypes, ...afterSpanningTypes]);
  let intersectionCount = 0;
  for (const t of beforeSpanningTypes) {
    if (afterSpanningTypes.has(t)) intersectionCount += 1;
  }
  const topologyDisplacement = union.size === 0 ? 0.0 : Number((1.0 - (intersectionCount / union.size)).toFixed(4));

  const energyOf = (chart) => {
    const list = (chart && chart.spanning) || [];
    return list.reduce((acc, m) => acc + (1 / (1 + Math.max(0, (m.to ?? 0) - (m.from ?? 0)))), 0);
  };
  const resonanceDelta = Number((energyOf(afterChart) - energyOf(beforeChart)).toFixed(4));

  const perturbedTokens = Math.max(1, totalTokens);
  let maxSpan = 0;
  for (const m of ((afterChart && afterChart.molecules) || [])) {
    const w = ((m.to ?? 0) - (m.from ?? 0)) + 1;
    if (w > maxSpan) maxSpan = w;
  }
  if (afterSpanning) maxSpan = perturbedTokens;
  const spanAperture = Number(Math.min(1.0, maxSpan / perturbedTokens).toFixed(4));

  return Object.freeze({
    rootReachability,
    headDivergence,
    derivationDelta,
    topologyDisplacement,
    resonanceDelta,
    spanAperture,
  });
}

/**
 * Sorted type/head snapshot of a chart. Attached to every beam row so a
 * consumer can autopsy the remainder without recomposing.
 *
 * @param {{spanning?: object[], stable?: object[]}} chart
 * @returns {{spanning: string[], stable: string[], heads: string[]}}
 */
export function chartSnapshot(chart) {
  const spanning = [...new Set(((chart && chart.spanning) || []).map((m) => m.type))].sort();
  const stable = [...new Set(((chart && chart.stable) || []).map((m) => m.type))].sort();
  const heads = new Set();
  for (const molecule of ((chart && chart.stable) || [])) {
    let found = new Set();
    try { found = headsOf(molecule) || new Set(); } catch { found = new Set(); }
    for (const h of found) heads.add(h);
  }
  return Object.freeze({
    spanning: Object.freeze(spanning),
    stable: Object.freeze(stable),
    heads: Object.freeze([...heads].sort()),
  });
}

/**
 * The token list a perturbation produces. Prefix/suffix/delete drop tokens;
 * substitution replaces one and keeps the length.
 *
 * @param {string} kind
 * @param {object} detail
 * @param {string[]} tokens
 * @returns {string[]}
 */
export function afterTokens(kind, detail, tokens) {
  const src = tokens || [];
  if (kind === 'delete') {
    const i = detail && detail.index;
    return src.slice(0, i).concat(src.slice(i + 1));
  }
  if (kind === 'delete-prefix') return src.slice((detail && detail.k) || 0);
  if (kind === 'delete-suffix') return src.slice(0, src.length - ((detail && detail.k) || 0));
  if (String(kind).startsWith('substitute-') && detail && detail.index != null) {
    const next = src.slice();
    next[detail.index] = detail.probe;
    return next;
  }
  return src.slice();
}

/**
 * Sorted type signature of the full-width molecules of a chart. The identity
 * used for INVARIANT vs REFRACTED: sorted so comparison is order-blind and
 * deterministic, joined so it is a single comparable scalar.
 *
 * @param {{spanning: object[]}} chart
 * @returns {string}
 */
export function spanningSignature(chart) {
  const types = ((chart && chart.spanning) || []).map((m) => m.type);
  return types.slice().sort().join('|');
}

/**
 * Classify what a perturbation did, against the DARK chart it was fired into.
 *
 * `before` is the unperturbed chart (dark by construction at every call site
 * — the beam only fires at dark sentences). `after` is the recomposed chart.
 * Root appearance wins over everything: a chart that is simultaneously
 * refracted and illuminated is ILLUMINATED, because that is the observation
 * the probe exists to make.
 *
 * @param {{spanning: object[], stable: object[]}} before
 * @param {{spanning: object[], stable: object[]}} after
 * @returns {'ILLUMINATED'|'REFRACTED'|'INVARIANT'|'COLLAPSED'}
 */
export function classifyEffect(before, after) {
  if (((after && after.stable) || []).length > 0) return 'ILLUMINATED';
  const afterSpanning = ((after && after.spanning) || []);
  if (afterSpanning.length === 0) return 'COLLAPSED';
  if (spanningSignature(after) === spanningSignature(before)) return 'INVARIANT';
  return 'REFRACTED';
}

/**
 * The stable types a perturbation lit, sorted and de-duplicated. Empty for
 * every non-ILLUMINATED effect, so the field is safe to carry on all rows.
 *
 * @param {{stable: object[]}} after
 * @returns {string[]}
 */
export function litTypes(after) {
  const set = new Set(((after && after.stable) || []).map((m) => m.type));
  return [...set].sort();
}

/**
 * Whether any lit root heads on the gold verb — the census's gate, measured
 * at the moment of illumination. `goldVerb == null` yields `null` (no gold to
 * check), never `false`: absence of evidence is not evidence of absence.
 *
 * @param {{stable: object[]}} after
 * @param {string|null} goldVerb
 * @returns {boolean|null}
 */
export function litHeadMatchesGold(after, goldVerb) {
  if (goldVerb == null) return null;
  for (const molecule of ((after && after.stable) || [])) {
    let heads = new Set();
    try { heads = headsOf(molecule) || new Set(); } catch { heads = new Set(); }
    if ([...heads].includes(goldVerb)) return true;
  }
  return false;
}

/**
 * Whether any lit root PROJECTS an answer whose subject is the gold subject.
 *
 * `litHeadMatchesGold` asks about the verb via `headsOf`; a subject is not a
 * head, so it is only visible through `projectAnswers`. Until this existed,
 * `tomographicScan` accepted a `goldSubject` and never read it — the caller
 * (`scripts/dark-matter-beam.mjs`) has been supplying gold that went nowhere.
 *
 * `goldSubject == null` yields `null`, never `false`: the same discipline as
 * the verb check. Absence of gold is not a failed match.
 *
 * @param {{stable: object[]}} after
 * @param {string|null} goldSubject
 * @returns {boolean|null}
 */
export function litSubjectMatchesGold(after, goldSubject) {
  if (goldSubject == null) return null;
  for (const molecule of ((after && after.stable) || [])) {
    let answers = [];
    try { answers = projectAnswers(molecule) || []; } catch { answers = []; }
    if (answers.some((a) => a && a.subject === goldSubject)) return true;
  }
  return false;
}

/**
 * FIRE EVERY BEAM. One compose per perturbation; the unperturbed chart is
 * composed once and passed in, because the sweep already has it.
 *
 * @param {string[]} tokens
 * @param {Map<string, string[]>} posMap
 * @param {{spanning: object[], stable: object[]}} darkChart
 * @param {string|null} [goldVerb]
 * @param {{edgeK?: number, probes?: Record<string, string>}} [options]
 * @returns {{deletions: object[], edges: object[], substitutions: object[]}}
 */
export function fireBeam(tokens, posMap, darkChart, goldVerb = null, options = {}) {
  const n = (tokens || []).length;
  const edgeK = Math.max(0, Math.min(3, options.edgeK ?? 3));
  /**
   * THE BEAM AND THE DARK CHART MUST READ THE SAME GRAMMAR.
   *
   * This used to be `composePacked(list, posMap, {})`, which meant a caller
   * that composed its dark chart with a root doorway, a bond override or a
   * ledger got a beam composed WITHOUT them. Every effect classification is a
   * before/after comparison, so composing the two sides under different
   * settings changes the medium between exposures and reports the difference
   * as physics. The beam's own keys (`probes`, `edgeK`) are not composition
   * options and are ignored downstream.
   */
  const compose = (list) => composePacked(list, posMap, options);

  const row = (kind, detail, after) => {
    const effect = classifyEffect(darkChart, after);
    const snap = chartSnapshot(after);
    const wavelength = kindWavelength(kind);
    const vector = computeResponseVector(darkChart, after, goldVerb, n);
    return Object.freeze({
      kind,
      wavelength,
      detail,
      effect,
      vector,
      lit: litTypes(after),
      goldHead: effect === 'ILLUMINATED' ? litHeadMatchesGold(after, goldVerb) : null,
      after: Object.freeze({
        tokens: Object.freeze(afterTokens(kind, detail, tokens)),
        spanning: snap.spanning,
        stable: snap.stable,
        heads: snap.heads,
      }),
    });
  };

  // DELETION BEAM — one token at a time. n === 1 cannot be perturbed.
  const deletions = [];
  for (let i = 0; i < n; i += 1) {
    if (n - 1 === 0) break;
    const perturbed = tokens.slice(0, i).concat(tokens.slice(i + 1));
    deletions.push(row('delete', { index: i, token: tokens[i] }, compose(perturbed)));
  }

  // EDGE BEAM — prefixes and suffixes of length k. An edge deletion that
  // coincides with a single-token deletion (n - k === 1 token left) still
  // fires: the classification is cheap and the row belongs to a different
  // question (attachment side, not token identity).
  const edges = [];
  for (let k = 1; k <= edgeK; k += 1) {
    if (n - k <= 0) break;
    edges.push(row('delete-prefix', { k }, compose(tokens.slice(k))));
    edges.push(row('delete-suffix', { k }, compose(tokens.slice(0, n - k))));
  }

  // SUBSTITUTION BEAM — probe words of a pure class, position preserved.
  const substitutions = [];
  const probes = options.probes || {};
  for (const cls of Object.keys(probes).sort()) {
    const probe = probes[cls];
    for (let i = 0; i < n; i += 1) {
      if (tokens[i] === probe) continue; // substituting a word with itself is no beam
      const perturbed = tokens.slice();
      perturbed[i] = probe;
      substitutions.push(row(`substitute-${cls}`, { index: i, probe }, compose(perturbed)));
    }
  }

  return Object.freeze({
    deletions: Object.freeze(deletions),
    edges: Object.freeze(edges),
    substitutions: Object.freeze(substitutions),
  });
}

/**
 * Choose probe words deterministically from the lexicon itself: for each
 * exact content tag set, the alphabetically first word carrying EXACTLY that
 * set. A word with extra tags would smuggle readings into the beam, so
 * partial matches are refused by construction. Classes with no pure word in
 * the lexicon are absent from the result, and the absence is recorded by the
 * caller as evidence, not silently filled.
 *
 * @param {Map<string, string[]>|Record<string, string[]>} posMap
 * @param {string[][]} [classes] default: the five content classes
 * @returns {Record<string, string>} class label -> probe word
 */
export function pickProbeWords(posMap, classes = [['n'], ['n', 'v'], ['v'], ['a'], ['r']]) {
  const entries = posMap instanceof Map
    ? [...posMap.entries()]
    : Object.entries(posMap || {});
  const probes = {};
  for (const cls of classes) {
    const want = cls.slice().sort().join('+');
    const pure = entries
      .filter(([, tags]) => (tags || []).slice().sort().join('+') === want)
      .map(([word]) => word)
      .sort();
    if (pure.length > 0) probes[cls.join('+')] = pure[0];
  }
  return probes;
}

/**
 * Reduce one sentence's beam rows to the mass-map facts: how many tokens of
 * each effect, and the minimal illuminating perturbations (edge deletions
 * first — they name a SIDE; then single deletions; substitutions last).
 *
 * @param {{deletions: object[], edges: object[], substitutions: object[]}} beam
 * @returns {{effects: Record<string, number>, illuminations: object[]}}
 */
export function massMap(beam) {
  const effects = {};
  const all = [
    ...(beam.edges || []), ...(beam.deletions || []), ...(beam.substitutions || []),
  ];
  for (const r of all) effects[r.effect] = (effects[r.effect] || 0) + 1;
  const illuminations = all.filter((r) => r.effect === 'ILLUMINATED');
  return Object.freeze({ effects: Object.freeze(effects), illuminations: Object.freeze(illuminations) });
}

/**
 * Accumulate residual deformation traces across all probe firings for a sentence.
 *
 * Each perturbation deposits a deformation vector into the atom/span lattice.
 * When multiple independent probe families (hard-uv, soft-uv, optical) focalize
 * displacement on the same token or span boundary, that site achieves high-confidence
 * obstruction candidacy.
 *
 * @param {string[]} tokens
 * @param {object} darkChart
 * @param {Array<object>} beamRows
 * @returns {Readonly<{tokenStress: readonly number[], focalSpans: ReadonlyArray<{span: readonly [number, number], text: string, energy: number, confidence: number}>}>}
 */
export function accumulateResidualTraces(tokens, darkChart, beamRows) {
  const tokenList = tokens || [];
  const n = tokenList.length;
  const tokenStress = new Array(n).fill(0);
  const spanEnergy = new Map();
  const rows = beamRows || [];

  for (const row of rows) {
    const v = row.vector;
    if (!v) continue;

    // Illumination energy indicates the site of obstruction removal.
    // Gold head matches carry maximal confidence (4.0x), non-gold illuminations carry 1.5x.
    // Substitutions carry reduced optical scale (0.25x) to prevent false-positive dominance.
    let magnitude = 0;
    if (row.effect === 'ILLUMINATED') {
      const isGold = row.goldHead === true;
      const base = isGold ? 4.0 : 1.5;
      const isOptical = String(row.kind).startsWith('substitute-');
      magnitude = (base * (isOptical ? 0.25 : 1.0)) + (v.topologyDisplacement * 0.5);
    } else if (row.effect === 'COLLAPSED') {
      magnitude = 0.1;
    } else {
      magnitude = v.topologyDisplacement * 0.1;
    }

    if (row.kind === 'delete' && row.detail && row.detail.index != null) {
      const idx = row.detail.index;
      if (idx >= 0 && idx < n) {
        tokenStress[idx] += magnitude;
        const key = `${idx}:${idx + 1}`;
        spanEnergy.set(key, (spanEnergy.get(key) || 0) + magnitude);
      }
    } else if (row.kind === 'delete-prefix') {
      const k = Math.min(n, (row.detail && row.detail.k) || 1);
      for (let i = 0; i < k; i += 1) {
        tokenStress[i] += magnitude / k;
      }
      const key = `0:${k}`;
      spanEnergy.set(key, (spanEnergy.get(key) || 0) + magnitude);
    } else if (row.kind === 'delete-suffix') {
      const k = Math.min(n, (row.detail && row.detail.k) || 1);
      for (let i = n - k; i < n; i += 1) {
        tokenStress[i] += magnitude / k;
      }
      const key = `${n - k}:${n}`;
      spanEnergy.set(key, (spanEnergy.get(key) || 0) + magnitude);
    } else if (String(row.kind).startsWith('substitute-') && row.detail && row.detail.index != null) {
      const idx = row.detail.index;
      if (idx >= 0 && idx < n) {
        tokenStress[idx] += magnitude;
        const key = `${idx}:${idx + 1}`;
        spanEnergy.set(key, (spanEnergy.get(key) || 0) + magnitude);
      }
    }
  }

  const denominator = Math.max(1, rows.length);
  const focalSpans = [...spanEnergy.entries()]
    .map(([key, energy]) => {
      const [from, to] = key.split(':').map(Number);
      const text = tokenList.slice(from, to).join(' ');
      return Object.freeze({
        span: Object.freeze([from, to]),
        text,
        energy: Number(energy.toFixed(3)),
        confidence: Number((energy / denominator).toFixed(3)),
      });
    })
    .sort((a, b) => b.energy - a.energy);

  return Object.freeze({
    tokenStress: Object.freeze(tokenStress.map((s) => Number(s.toFixed(3)))),
    focalSpans: Object.freeze(focalSpans),
  });
}

/**
 * Back-project descending light from a lit root onto the original token coordinates.
 *
 * Traverses downward from every stable root in `afterChart`, collects all lit
 * leaf nodes, and maps their perturbed token coordinates back into the original
 * input coordinate space. Identifies which original dark atoms participate in the
 * recovered clause, which tokens constitute the foreign obstruction, and what
 * answers the recovered root projects.
 *
 * @param {string[]} originalTokens
 * @param {string} kind
 * @param {object} detail
 * @param {object} afterChart
 * @param {string|null} [goldVerb]
 * @returns {Readonly<{
 *   recoveredRoot: string|null,
 *   projectedAnswers: ReadonlyArray<{subject: string|null, verb: string}>,
 *   participatingIndices: readonly number[],
 *   participatingTokens: readonly string[],
 *   obstructionIndices: readonly number[],
 *   obstructionTokens: readonly string[],
 *   goldHeadMatch: boolean|null
 * }>}
 */
export function backProjectDescendingLight(originalTokens, kind, detail, afterChart, goldVerb = null) {
  const orig = originalTokens || [];
  const n = orig.length;
  if (!afterChart || (afterChart.stable || []).length === 0) {
    return Object.freeze({
      recoveredRoot: null,
      projectedAnswers: Object.freeze([]),
      participatingIndices: Object.freeze([]),
      participatingTokens: Object.freeze([]),
      obstructionIndices: Object.freeze(orig.map((_, i) => i)),
      obstructionTokens: Object.freeze([...orig]),
      goldHeadMatch: null,
    });
  }

  const mapToOrigIndex = (perturbedIdx) => {
    if (kind === 'delete' && detail && detail.index != null) {
      return perturbedIdx < detail.index ? perturbedIdx : perturbedIdx + 1;
    }
    if (kind === 'delete-prefix') {
      const k = (detail && detail.k) || 0;
      return perturbedIdx + k;
    }
    if (kind === 'delete-suffix') {
      return perturbedIdx;
    }
    return perturbedIdx;
  };

  const payload = emitDescendingLight(afterChart);
  const participatingIndexSet = new Set();

  for (const node of payload.lit) {
    if (node.from != null && node.to != null && node.from === node.to) {
      const origIdx = mapToOrigIndex(node.from);
      if (origIdx >= 0 && origIdx < n) {
        participatingIndexSet.add(origIdx);
      }
    }
  }

  const participatingIndices = [...participatingIndexSet].sort((a, b) => a - b);
  const obstructionIndices = [];
  for (let i = 0; i < n; i += 1) {
    if (!participatingIndexSet.has(i)) obstructionIndices.push(i);
  }

  const rootNode = afterChart.stable[0];
  let projected = [];
  try {
    projected = projectAnswers(rootNode) || [];
  } catch {
    projected = [];
  }

  return Object.freeze({
    recoveredRoot: rootNode ? rootNode.type : null,
    projectedAnswers: Object.freeze(projected),
    participatingIndices: Object.freeze(participatingIndices),
    participatingTokens: Object.freeze(participatingIndices.map((i) => orig[i])),
    obstructionIndices: Object.freeze(obstructionIndices),
    obstructionTokens: Object.freeze(obstructionIndices.map((i) => orig[i])),
    goldHeadMatch: litHeadMatchesGold(afterChart, goldVerb),
  });
}

/**
 * Compute the excess response vector between a probe and its matched control.
 *
 * @param {object} probeVector 6D response vector of probe
 * @param {object} controlVector 6D response vector of control
 * @returns {Readonly<{
 *   excessRootReachability: number,
 *   excessHeadDivergence: number|null,
 *   excessDerivationDelta: number,
 *   excessTopologyDisplacement: number,
 *   excessResonanceDelta: number,
 *   isContrastive: boolean
 * }>}
 */
export function counterfactualExcess(probeVector, controlVector) {
  const pv = probeVector || {};
  const cv = controlVector || {};

  const excessRootReachability = Number(((pv.rootReachability ?? 0) - (cv.rootReachability ?? 0)).toFixed(4));
  const excessDerivationDelta = (pv.derivationDelta ?? 0) - (cv.derivationDelta ?? 0);
  const excessTopologyDisplacement = Number(((pv.topologyDisplacement ?? 0) - (cv.topologyDisplacement ?? 0)).toFixed(4));
  const excessResonanceDelta = Number(((pv.resonanceDelta ?? 0) - (cv.resonanceDelta ?? 0)).toFixed(4));

  let excessHeadDivergence = null;
  if (pv.headDivergence != null && cv.headDivergence != null) {
    excessHeadDivergence = Number((pv.headDivergence - cv.headDivergence).toFixed(4));
  } else if (pv.headDivergence != null) {
    excessHeadDivergence = pv.headDivergence;
  }

  // A probe is contrastively significant if it lights a root that the control does not,
  // or if both light a root but the target matches gold and the control diverges.
  const isContrastive = (pv.rootReachability === 1.0) && (
    (cv.rootReachability !== 1.0) ||
    (pv.headDivergence === 0.0 && cv.headDivergence === 1.0)
  );

  return Object.freeze({
    excessRootReachability,
    excessHeadDivergence,
    excessDerivationDelta,
    excessTopologyDisplacement,
    excessResonanceDelta,
    isContrastive,
  });
}

/** Nearest row to `i` by an integer field, ties broken by lower value. */
function nearestBy(rows, key, i) {
  if (rows.length === 0) return null;
  return rows.slice().sort((a, b) => {
    const da = Math.abs(a.detail[key] - i);
    const db = Math.abs(b.detail[key] - i);
    return da - db || a.detail[key] - b.detail[key];
  })[0] || null;
}

/**
 * Select a structurally matched counterfactual control perturbation for a probe.
 *
 * ─── EVERY PROBE KIND, NOT ONLY DELETIONS ────────────────────────────────
 *
 * This used to return `null` for anything that was not a single-token
 * deletion, so edge and substitution illuminations entered
 * `tomographicScan`'s projections with `control: null` and `excess: null` —
 * a glow with no counterfactual beside it, which is exactly the shape of
 * evidence this module exists to refuse. The control for each kind is the
 * perturbation that differs in the ONE respect under test:
 *
 *   delete i        -> deletion of the nearest OTHER token. Same operation,
 *                      different identity.
 *   delete-prefix k -> delete-suffix of the same width, and vice versa. Same
 *                      number of tokens removed, opposite side, which is the
 *                      question an edge beam asks.
 *   substitute-C i  -> the SAME probe class at the nearest other index. Same
 *                      injected type, different position — type vs position
 *                      is the substitution beam's whole question, so a
 *                      control of a different class would confound it.
 *
 * `allRows` may be the full row set or a single-kind subset; rows of the
 * wrong kind are filtered out here rather than trusted from the caller.
 *
 * ─── ONE PROMISE DELIBERATELY NOT KEPT ───────────────────────────────────
 *
 * The header this replaces said the deletion control "picks a distinct token j
 * with matching tag class if available" and took `tokens` and `posMap` to do
 * it. It never did — both arguments were accepted and never read, which is the
 * same defect as the `goldSubject` one repaired above it. Tag-class matching
 * would be a BETTER matched control and it is not implemented here, because
 * changing which control a deletion draws changes every excess this module has
 * ever reported and that is a measurement question, not a repair. The
 * parameters are gone rather than left sitting there looking honoured; extra
 * positional arguments from existing callers are ignored harmlessly.
 *
 * @param {object} row
 * @param {Array<object>} allRows every beam row available as a control pool
 * @returns {object|null}
 */
export function findMatchedControlProbe(row, allRows = []) {
  if (!row || !row.detail) return null;
  const rows = (allRows || []).filter((d) => d && d !== row && d.detail);
  const kind = String(row.kind);

  if (kind === 'delete') {
    const i = row.detail.index;
    if (i == null) return null;
    return nearestBy(
      rows.filter((d) => d.kind === 'delete' && d.detail.index != null && d.detail.index !== i),
      'index', i,
    );
  }

  if (kind === 'delete-prefix' || kind === 'delete-suffix') {
    const k = row.detail.k;
    if (k == null) return null;
    const mirror = kind === 'delete-prefix' ? 'delete-suffix' : 'delete-prefix';
    const mirrors = rows.filter((d) => d.kind === mirror && d.detail.k != null);
    // Exact-width mirror first; failing that, the nearest width on that side.
    return mirrors.find((d) => d.detail.k === k) || nearestBy(mirrors, 'k', k);
  }

  if (kind.startsWith('substitute-')) {
    const i = row.detail.index;
    if (i == null) return null;
    return nearestBy(
      rows.filter((d) => d.kind === kind && d.detail.index != null && d.detail.index !== i),
      'index', i,
    );
  }

  return null;
}

/**
 * Complete Semantic Tomography Scan for a dark sentence.
 *
 * Integrates:
 * 1. Multi-frequency beam probes with 6D response vectors
 * 2. Paired counterfactual controls and excess responses, for EVERY probe
 *    kind — deletion, edge and substitution alike
 * 3. Residual-trace accumulation and focal obstruction localization
 * 4. Two-stage optical fusion via descending-light back-projection
 *
 * @param {string[]} tokens
 * @param {Map<string, string[]>} posMap
 * @param {object} darkChart
 * @param {string|null} [goldVerb]
 * @param {string|null} [goldSubject]
 * @param {object} [options]
 * @returns {object}
 */
export function tomographicScan(tokens, posMap, darkChart, goldVerb = null, goldSubject = null, options = {}) {
  const beam = fireBeam(tokens, posMap, darkChart, goldVerb, options);
  const allRows = [...(beam.edges || []), ...(beam.deletions || []), ...(beam.substitutions || [])];
  const residualTrace = accumulateResidualTraces(tokens, darkChart, allRows);

  const illuminations = allRows.filter((r) => r.effect === 'ILLUMINATED');
  const tomographicProjections = [];

  for (const row of illuminations) {
    /**
     * The control pool is EVERY row, not just the deletions. Which of them can
     * legitimately control this probe is `findMatchedControlProbe`'s judgement,
     * not the caller's — see its header for the per-kind pairing.
     */
    const control = findMatchedControlProbe(row, allRows, tokens, posMap);
    const excess = control ? counterfactualExcess(row.vector, control.vector) : null;

    const afterTokensList = (row.after && row.after.tokens) || afterTokens(row.kind, row.detail, tokens);
    // Same composition options as the beam and the dark chart — see fireBeam.
    const afterChart = composePacked(afterTokensList, posMap, options);
    const projection = backProjectDescendingLight(tokens, row.kind, row.detail, afterChart, goldVerb);

    tomographicProjections.push(Object.freeze({
      kind: row.kind,
      wavelength: row.wavelength,
      detail: row.detail,
      vector: row.vector,
      control: control ? Object.freeze({ kind: control.kind, detail: control.detail, vector: control.vector }) : null,
      excess,
      /**
       * The gold SUBJECT verdict — `null` when the caller supplied no gold
       * subject, which is an abstention and not a failed match. This is the
       * argument `tomographicScan` accepted and ignored until 2026-08-20.
       */
      goldSubjectMatch: litSubjectMatchesGold(afterChart, goldSubject),
      projection,
    }));
  }

  const contrastiveCount = tomographicProjections.filter((p) => p.excess && p.excess.isContrastive).length;
  const topFocal = (residualTrace.focalSpans && residualTrace.focalSpans[0]) || null;

  return Object.freeze({
    tokens: Object.freeze([...tokens]),
    beam,
    residualTrace,
    tomographicProjections: Object.freeze(tomographicProjections),
    contrastiveCount,
    topFocalObstruction: topFocal,
  });
}

/**
 * Compute the cosine similarity between two 6D spectral response vectors.
 *
 * @param {object} v1
 * @param {object} v2
 * @returns {number} similarity in range [-1.0, 1.0]
 */
export function spectralCosineSimilarity(v1, v2) {
  if (!v1 || !v2) return 0;
  const a1 = [
    v1.rootReachability ?? 0,
    v1.headDivergence ?? 0.5,
    (v1.derivationDelta ?? 0) / 10.0,
    v1.topologyDisplacement ?? 0,
    v1.resonanceDelta ?? 0,
    v1.spanAperture ?? 0,
  ];
  const a2 = [
    v2.rootReachability ?? 0,
    v2.headDivergence ?? 0.5,
    (v2.derivationDelta ?? 0) / 10.0,
    v2.topologyDisplacement ?? 0,
    v2.resonanceDelta ?? 0,
    v2.spanAperture ?? 0,
  ];
  let dot = 0;
  let norm1 = 0;
  let norm2 = 0;
  for (let i = 0; i < a1.length; i += 1) {
    dot += a1[i] * a2[i];
    norm1 += a1[i] * a1[i];
    norm2 += a2[i] * a2[i];
  }
  if (norm1 === 0 || norm2 === 0) return 0;
  return Number((dot / (Math.sqrt(norm1) * Math.sqrt(norm2))).toFixed(4));
}

/**
 * Compute Coupling Excess C(i, j) = Response(i, j) - Response(i) - Response(j)
 *
 * @param {object} dualVector
 * @param {object} singleVectorA
 * @param {object} singleVectorB
 * @returns {Readonly<{
 *   excessReachability: number,
 *   excessDerivations: number,
 *   excessTopologyDisplacement: number,
 *   isSuperAdditive: boolean
 * }>}
 */
export function couplingExcess(dualVector, singleVectorA, singleVectorB) {
  const dv = dualVector || {};
  const sA = singleVectorA || {};
  const sB = singleVectorB || {};

  const dualReach = dv.rootReachability ?? 0;
  const singleReachA = sA.rootReachability ?? 0;
  const singleReachB = sB.rootReachability ?? 0;

  // Coupling excess on reachability
  const excessReachability = Number((dualReach - Math.max(0, singleReachA) - Math.max(0, singleReachB)).toFixed(4));
  const excessDerivations = (dv.derivationDelta ?? 0) - (sA.derivationDelta ?? 0) - (sB.derivationDelta ?? 0);
  const excessTopologyDisplacement = Number(((dv.topologyDisplacement ?? 0) - ((sA.topologyDisplacement ?? 0) + (sB.topologyDisplacement ?? 0)) / 2).toFixed(4));

  // Super-additive when dual deletion unmasks a root that neither single deletion could achieve
  const isSuperAdditive = (dualReach === 1.0) && (singleReachA !== 1.0) && (singleReachB !== 1.0);

  return Object.freeze({
    excessReachability,
    excessDerivations,
    excessTopologyDisplacement,
    isSuperAdditive,
  });
}

/**
 * Scan dark sentence for non-local spectral resonance and multi-body couplings.
 *
 * @param {string[]} tokens
 * @param {Map<string, string[]>} posMap
 * @param {object} darkChart
 * @param {string|null} [goldVerb]
 * @param {object} [options]
 * @returns {Readonly<{
 *   entangledCouplings: ReadonlyArray<object>,
 *   homologousPairs: ReadonlyArray<object>,
 *   allPairs: ReadonlyArray<object>
 * }>}
 */
export function nonLocalResonanceScan(tokens, posMap, darkChart, goldVerb = null, options = {}) {
  const minDistance = options.minDistance ?? 2;
  const n = (tokens || []).length;
  if (n < 3) {
    return Object.freeze({
      entangledCouplings: Object.freeze([]),
      homologousPairs: Object.freeze([]),
      allPairs: Object.freeze([]),
    });
  }

  const beam = fireBeam(tokens, posMap, darkChart, goldVerb, options);
  const singleVectors = new Map();
  for (const del of (beam.deletions || [])) {
    if (del.detail && del.detail.index != null) {
      singleVectors.set(del.detail.index, del);
    }
  }

  const allPairs = [];
  const entangledCouplings = [];
  const homologousPairs = [];

  for (let i = 0; i < n; i += 1) {
    for (let j = i + minDistance; j < n; j += 1) {
      const dist = j - i;
      const delI = singleVectors.get(i);
      const delJ = singleVectors.get(j);

      const sim = (delI && delJ && delI.vector && delJ.vector)
        ? spectralCosineSimilarity(delI.vector, delJ.vector)
        : 0;

      const dualTokens = tokens.filter((_, idx) => idx !== i && idx !== j);
      const dualChart = composePacked(dualTokens, posMap, {});
      const dualVector = computeResponseVector(darkChart, dualChart, goldVerb, tokens.length);
      const coupling = couplingExcess(dualVector, delI?.vector, delJ?.vector);

      const isDualLit = (dualChart.stable || []).length > 0;
      let goldHeadMatch = null;
      let answers = [];
      if (isDualLit) {
        const rootNode = dualChart.stable[0];
        try { answers = projectAnswers(rootNode); } catch { answers = []; }
        goldHeadMatch = answers.some((a) => a.verb === goldVerb);
      }

      const pair = Object.freeze({
        i,
        j,
        dist,
        tokenI: tokens[i],
        tokenJ: tokens[j],
        sim,
        effectI: delI?.effect || 'UNKNOWN',
        effectJ: delJ?.effect || 'UNKNOWN',
        dualEffect: isDualLit ? 'ILLUMINATED' : ((dualChart.spanning || []).length > 0 ? 'REFRACTED' : 'COLLAPSED'),
        coupling,
        goldHeadMatch,
        answers: Object.freeze(answers),
      });

      allPairs.push(pair);
      if (coupling.isSuperAdditive) {
        entangledCouplings.push(pair);
      } else if (sim >= 0.90) {
        homologousPairs.push(pair);
      }
    }
  }

  return Object.freeze({
    entangledCouplings: Object.freeze(entangledCouplings),
    homologousPairs: Object.freeze(homologousPairs),
    allPairs: Object.freeze(allPairs),
  });
}

/**
 * Three-Arm Counterfactual Resolution Assay for a distant resonant pair.
 *
 * Compares 3 minimal interventions under the Principle of Least Collateral Disturbance:
 * - Arm A: Position Counterfactual (Relocation)
 * - Arm B: Bond Counterfactual (Long-Range Coupling)
 * - Arm C: Grammar / Doorway Counterfactual (Aperture Admission)
 *
 * @param {string[]} tokens
 * @param {Map<string, string[]>} posMap
 * @param {object} darkChart
 * @param {object} pair
 * @param {string|null} [goldVerb]
 * @returns {Readonly<{
 *   pair: object,
 *   winningArm: 'relocation'|'new-bond'|'doorway'|'none',
 *   classification: 'DISPLACEMENT'|'MISSING_LONG_RANGE_COUPLING'|'GRAMMAR_DOORWAY_GAP'|'HOMOLOGOUS_STRUCTURE_ONLY',
 *   telemetry: Readonly<{armA: object, armB: object, armC: object}>
 * }>}
 */
export function threeArmCounterfactualAssay(tokens, posMap, darkChart, pair, goldVerb = null) {
  const { i, j } = pair;
  const n = tokens.length;

  // Arm A: Relocation (move token i adjacent to j)
  const relocatedTokens = [...tokens];
  const [removed] = relocatedTokens.splice(i, 1);
  const targetPos = j > i ? j - 1 : j;
  relocatedTokens.splice(targetPos, 0, removed);
  const chartA = composePacked(relocatedTokens, posMap, {});
  const vecA = computeResponseVector(darkChart, chartA, goldVerb, n);
  const litA = (chartA.stable || []).length > 0;
  const matchA = litA && litHeadMatchesGold(chartA, goldVerb);

  // Arm B: Bond Counterfactual (Hypothetical Long-Range Bond between type of i and type of j)
  // Tested by composing with an added generic coordinate bridge
  const chartB = composePacked(tokens, posMap, { agenda: 'queue' });
  const vecB = computeResponseVector(darkChart, chartB, goldVerb, n);
  const litB = (chartB.stable || []).length > 0;
  const matchB = litB && litHeadMatchesGold(chartB, goldVerb);

  // Arm C: Grammar / Doorway Counterfactual (Admit full-width utterance roots)
  const chartC = composePacked(tokens, posMap, { roots: ROOT_DOORWAY.ALL });
  const vecC = computeResponseVector(darkChart, chartC, goldVerb, n);
  const litC = (chartC.stable || []).length > 0;
  const matchC = litC && litHeadMatchesGold(chartC, goldVerb);

  // Scoring function: Reward gold root illumination, penalize topology displacement & chart growth
  const scoreArm = (lit, match, vec, chart) => {
    if (!lit) return -100;
    let s = 50;
    if (match) s += 50;
    s -= (vec.topologyDisplacement ?? 0) * 20;
    s -= Math.max(0, (chart.molecules || []).length - (darkChart.molecules || []).length);
    return s;
  };

  const scoreA = scoreArm(litA, matchA, vecA, chartA);
  const scoreB = scoreArm(litB, matchB, vecB, chartB);
  const scoreC = scoreArm(litC, matchC, vecC, chartC);

  let winningArm = 'none';
  let classification = 'HOMOLOGOUS_STRUCTURE_ONLY';

  if (scoreC > 0 && scoreC >= scoreA && scoreC >= scoreB) {
    winningArm = 'doorway';
    classification = 'GRAMMAR_DOORWAY_GAP';
  } else if (scoreA > 0 && scoreA > scoreB && scoreA > scoreC) {
    winningArm = 'relocation';
    classification = 'DISPLACEMENT';
  } else if (scoreB > 0 && scoreB > scoreA && scoreB > scoreC) {
    winningArm = 'new-bond';
    classification = 'MISSING_LONG_RANGE_COUPLING';
  }

  return Object.freeze({
    pair,
    winningArm,
    classification,
    telemetry: Object.freeze({
      armA: Object.freeze({ lit: litA, goldMatch: matchA, score: scoreA, vector: vecA }),
      armB: Object.freeze({ lit: litB, goldMatch: matchB, score: scoreB, vector: vecB }),
      armC: Object.freeze({ lit: litC, goldMatch: matchC, score: scoreC, vector: vecC }),
    }),
  });
}
