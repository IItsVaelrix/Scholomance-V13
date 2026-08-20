/**
 * Particle orchestration. Runs after the packed chart freezes.
 *
 * I4 Frozen-chart first. I1 No admission. Default OFF at the composePacked
 * call site. Score modes attach a parallel ranking; they do not rewrite
 * `chart.ranked`.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/semantic-particles/annotate
 */

import { canonicalSerialize, particleSchemaChecksum, sha256Hex } from './schema.js';
import { DEFAULT_FEATURE_PROVIDER, featuresFor } from './feature-provider.js';
import { capabilityParticle, transferCapabilities } from './capability-transfer.js';
import {
  collapseReport,
  descendExact,
  identityKey,
  joinRefusals,
  perRootReachability,
} from './root-reachability.js';
import { inferForest } from './forest-inference.js';
import { DEFAULT_LEXICAL_LEXICON, sensesFor } from './lexical-semantics.js';
import { meaningOf } from './compositional-semantics.js';

export function forestFingerprint(chart) {
  const molecules = (chart?.molecules || []).map((node) => ({
    type: node.type,
    from: node.from,
    to: node.to,
    derivations: (node.derivations || []).map((d) => (
      d.lift
        ? `L:${d.child?.type}->${d.lift}`
        : `${d.bond?.[0]}+${d.bond?.[1]}->${d.bond?.[2]}`
    )).sort(),
  }));
  molecules.sort((a, b) => (
    a.from - b.from || a.to - b.to || String(a.type).localeCompare(String(b.type))
  ));
  const stable = (chart?.stable || [])
    .map((node) => `${node.type}:${node.from}:${node.to}`)
    .sort();
  return sha256Hex(canonicalSerialize({
    events: chart?.events ?? 0,
    bondAttempts: chart?.bondAttempts ?? 0,
    bondRefusals: chart?.bondRefusals ?? 0,
    molecules,
    stable,
  }));
}

function lemmaOf(atom) {
  const heads = atom?.nucleus?.headLemmas;
  if (Array.isArray(heads) && heads[0]) return heads[0];
  return String(atom?.token || '').toLowerCase();
}

function normalizeOptions(options) {
  if (options === true || options == null) return { mode: 'observe' };
  if (typeof options === 'string') return { mode: options };
  return { mode: options.mode || 'observe', ...options };
}

export function annotateSemanticParticles(chart, options = {}) {
  const opts = normalizeOptions(options);
  const warnings = [];
  const degradedChannels = [];
  const particles = [];

  const providerExplicitlyAbsent = Object.prototype.hasOwnProperty.call(opts, 'featureProvider')
    && opts.featureProvider == null;
  const featureProvider = providerExplicitlyAbsent
    ? null
    : (opts.featureProvider || DEFAULT_FEATURE_PROVIDER);
  if (providerExplicitlyAbsent) {
    warnings.push('feature-provider-absent');
    degradedChannels.push('microfeatures');
  } else {
    for (const atom of chart?.atoms || []) {
      const feats = featuresFor(lemmaOf(atom), atom.type, featureProvider);
      for (const p of feats) {
        if (p.value !== 'UNKNOWN') particles.push(p);
      }
    }
  }

  const reachability = descendExact(chart);
  const perRoot = perRootReachability(chart);
  const refusals = joinRefusals(chart, reachability);
  const collapse = collapseReport(chart, reachability);

  for (const node of chart?.molecules || []) {
    for (const derivation of node.derivations || []) {
      const caps = transferCapabilities(
        derivation.left || derivation.child || null,
        derivation.right || null,
        derivation.lift
          ? { lift: derivation.lift, src: derivation.child?.type }
          : { bond: derivation.bond },
      );
      if (derivation.clauseOrigin || derivation.lift || (derivation.bond && derivation.bond[2] === 'S')) {
        particles.push(capabilityParticle(caps));
      }
    }
  }

  const inferred = inferForest(chart, {
    featureProvider,
    selectionalIndex: opts.selectionalIndex || null,
  });
  const scoreMode = opts.mode === 'score-derivation' || opts.mode === 'score-token';
  const rankedDerivations = scoreMode && inferred.best?.derivationId
    ? Object.freeze([{
      derivationId: inferred.best.derivationId,
      score: inferred.best.score,
      identity: inferred.best.node ? identityKey(inferred.best.node) : null,
    }])
    : Object.freeze([]);

  const lexiconExplicitlyAbsent = Object.prototype.hasOwnProperty.call(opts, 'lexicalLexicon')
    && opts.lexicalLexicon == null;
  if (lexiconExplicitlyAbsent) {
    warnings.push('lexical-lexicon-absent');
    degradedChannels.push('lexical');
    degradedChannels.push('compositional');
  }
  const lexicalLexicon = lexiconExplicitlyAbsent ? null : (opts.lexicalLexicon || DEFAULT_LEXICAL_LEXICON);
  const lexical = Object.freeze((chart?.atoms || []).map((atom) => {
    const lemma = lemmaOf(atom);
    const senses = lexiconExplicitlyAbsent ? [] : sensesFor(lemma, atom.type, lexicalLexicon);
    return Object.freeze({
      lemma,
      type: atom.type,
      senseIds: Object.freeze(senses.map((s) => s.id)),
      polysemy: senses.length,
    });
  }));
  const compositional = Object.freeze((chart?.stable || []).map((root) => {
    if (lexiconExplicitlyAbsent) {
      return Object.freeze({
        type: root.type,
        from: root.from,
        to: root.to,
        roles: Object.freeze({}),
        rule: null,
        unknown: true,
        sense: null,
      });
    }
    const meaning = meaningOf(root, lexicalLexicon);
    const top = meaning.readings[0] || null;
    return Object.freeze({
      type: root.type,
      from: root.from,
      to: root.to,
      roles: top ? top.roles : Object.freeze({}),
      rule: top ? top.rule : null,
      unknown: top ? top.unknown : true,
      sense: top ? top.sense : null,
    });
  }));

  const report = {
    mode: opts.mode,
    schemaChecksum: particleSchemaChecksum(),
    warnings: Object.freeze(warnings),
    degradedChannels: Object.freeze(degradedChannels),
    particles: Object.freeze(particles),
    lexical,
    compositional,
    reachability: Object.freeze({
      union: reachability.union,
      collisions: reachability.collisions,
      perRoot: perRoot.perRoot,
      refusals,
      collapse,
    }),
    rankedDerivations,
    forest: Object.freeze({
      best: inferred.best,
      nodeCount: inferred.nodes.length,
      // The per-node winning derivation. Not serialised into `reportHash` — it
      // holds live chart nodes, and the hash covers the report, not the chart.
      viterbi: inferred.viterbi,
    }),
  };
  const reportHash = sha256Hex(canonicalSerialize({
    mode: report.mode,
    schemaChecksum: report.schemaChecksum,
    warnings: report.warnings,
    degradedChannels: report.degradedChannels,
    particleIds: report.particles.map((p) => p.id).sort(),
    lexical,
    compositional,
    collisions: reachability.collisions,
    collapse,
    refusals,
    rankedDerivations,
    bestId: inferred.best?.derivationId || null,
    bestScore: Number.isFinite(inferred.best?.score) ? inferred.best.score : null,
    lit: [...reachability.union].map(identityKey).sort(),
  }));

  return Object.freeze({ ...report, reportHash });
}
