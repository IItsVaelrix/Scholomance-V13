/**
 * T3 — PACKED-FOREST INSIDE-OUTSIDE PARTICLES
 *
 * Scores concrete derivations, not projected pairs. Span width is the
 * well-founded order; same-span lifts use a visit set. The forest is never
 * rewritten.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/semantic-particles/forest-inference
 */

import { quantizeScore } from './schema.js';
import {
  bindingSignature,
  childNodeId,
  derivationId,
  extractBindings,
  localFactors,
  nodeId,
} from './derivation-factors.js';

export {
  bindingSignature,
  derivationId,
  extractBindings,
  localFactors,
  nodeId,
};

function childrenOf(derivation) {
  if (!derivation) return [];
  if (derivation.lift && derivation.child) return [derivation.child];
  const kids = [];
  if (derivation.left) kids.push(derivation.left);
  if (derivation.right) kids.push(derivation.right);
  return kids;
}

function logsumexp(values) {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return -Infinity;
  const max = Math.max(...finite);
  let sum = 0;
  for (const v of finite) sum += Math.exp(v - max);
  return max + Math.log(sum);
}

function orderedNodes(chart) {
  return [...(chart?.molecules || [])].sort((a, b) => {
    const wa = a.to - a.from;
    const wb = b.to - b.from;
    if (wa !== wb) return wa - wb;
    if (a.from !== b.from) return a.from - b.from;
    return String(a.type).localeCompare(String(b.type));
  });
}

function better(a, b) {
  if (!a) return b;
  if (b.score > a.score) return b;
  if (b.score < a.score) return a;
  if (b.derivationId < a.derivationId) return b;
  return a;
}

export function inferForest(chart, ctx = {}) {
  const nodes = orderedNodes(chart);
  const viterbi = new Map();
  const insideMap = new Map();
  const incoming = new Map();

  for (const node of nodes) {
    if (!node.derivations || node.derivations.length === 0) {
      const id = `${childNodeId(node)}:leaf`;
      viterbi.set(node, { score: 0, derivation: null, derivationId: id, node });
      insideMap.set(node, 0);
      incoming.set(node, []);
      continue;
    }
    let best = null;
    const insides = [];
    const edges = [];
    node.derivations.forEach((derivation, index) => {
      const factors = localFactors(node, derivation, { ...ctx, chart, index });
      const kids = childrenOf(derivation);
      const childSum = kids.reduce((s, kid) => s + (viterbi.get(kid)?.score ?? 0), 0);
      const score = quantizeScore(factors.total + childSum);
      const id = derivationId(node, derivation, index);
      const cand = { score, derivation, derivationId: id, node };
      best = better(best, cand);
      const childInside = kids.reduce((s, kid) => s + (insideMap.get(kid) ?? 0), 0);
      insides.push(factors.total + childInside);
      edges.push({ id, score, local: factors.total, kids });
    });
    viterbi.set(node, best);
    insideMap.set(node, logsumexp(insides));
    incoming.set(node, edges);
  }

  const outsideMap = new Map();
  for (const node of nodes) outsideMap.set(node, -Infinity);
  for (const root of chart?.stable || []) outsideMap.set(root, 0);

  const decreasing = [...nodes].reverse();
  for (const parent of decreasing) {
    const parentOut = outsideMap.get(parent);
    if (!Number.isFinite(parentOut) && parentOut !== 0) continue;
    (parent.derivations || []).forEach((derivation, index) => {
      const factors = localFactors(parent, derivation, { ...ctx, chart, index });
      const kids = childrenOf(derivation);
      kids.forEach((kid, kidIndex) => {
        const others = kids
          .filter((_, i) => i !== kidIndex)
          .reduce((s, sib) => s + (insideMap.get(sib) ?? 0), 0);
        const candidate = parentOut + factors.total + others;
        const prev = outsideMap.get(kid);
        outsideMap.set(kid, prev == null ? candidate : logsumexp([prev, candidate]));
      });
    });
  }

  let best = null;
  for (const root of chart?.stable || []) {
    best = better(best, viterbi.get(root));
  }

  /**
   * `viterbi` IS THE READOUT, AND IT USED TO BE THROWN AWAY.
   *
   * The map holds the winning derivation for EVERY node; only the root's was
   * returned. A caller who wanted an answer therefore had to walk down from
   * `best.derivation`, whose `left`/`right` are still packed chart nodes — so it
   * landed straight back in the union of alternatives this whole inference
   * exists to resolve. `headedAtoms` unioning heads across a packed node's
   * derivations is the same wound, and it is why answer accuracy for
   * `ADJ+S`-built roots would not move: no scoring function can separate
   * readings the readout has already merged.
   *
   * Returned as the Map itself, by node identity. See `viterbi-answer.js`.
   */
  return Object.freeze({
    nodes,
    best: best || Object.freeze({ score: null, derivationId: null }),
    viterbi,
    inside: nodes.map((n) => insideMap.get(n)),
    outside: nodes.map((n) => outsideMap.get(n)),
    incoming,
  });
}

function expand(node, budget, pathScore, ctx, visiting, out) {
  if (!node || out.trees.length >= budget.maxTrees) return;
  if (visiting.has(node)) return;
  if (!node.derivations || node.derivations.length === 0) {
    out.trees.push({
      score: quantizeScore(pathScore),
      derivationId: `${childNodeId(node)}:leaf`,
    });
    return;
  }
  visiting.add(node);
  node.derivations.forEach((derivation, index) => {
    if (out.trees.length >= budget.maxTrees) return;
    const factors = localFactors(node, derivation, { ...ctx, index });
    const id = derivationId(node, derivation, index);
    const kids = childrenOf(derivation);
    if (kids.length === 0) {
      out.trees.push({ score: quantizeScore(pathScore + factors.total), derivationId: id });
      return;
    }
    const childTrees = [];
    const collect = { trees: [] };
    for (const kid of kids) {
      const sub = { trees: [] };
      expand(kid, { maxTrees: budget.maxTrees }, 0, ctx, new Set(visiting), sub);
      childTrees.push(sub.trees);
    }
    if (childTrees.some((list) => list.length === 0)) return;
    const walk = (i, score, rootId) => {
      if (out.trees.length >= budget.maxTrees) return;
      if (i >= childTrees.length) {
        out.trees.push({
          score: quantizeScore(pathScore + factors.total + score),
          derivationId: rootId,
        });
        return;
      }
      for (const child of childTrees[i]) {
        walk(i + 1, score + child.score, rootId);
      }
    };
    walk(0, 0, id);
    collect.trees.length = 0;
  });
  visiting.delete(node);
}

export function enumerateBounded(chart, budget = { maxTrees: 64 }) {
  const trees = [];
  const bag = { trees };
  for (const root of chart?.stable || []) {
    expand(root, budget, 0, { chart }, new Set(), bag);
  }
  trees.sort((a, b) => b.score - a.score || a.derivationId.localeCompare(b.derivationId));
  return Object.freeze({ trees: Object.freeze(trees) });
}
