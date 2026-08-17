#!/usr/bin/env node
/**
 * Observe-only attribution probe for the Phase 3B fire movement.
 *
 * Prereg spillover rule (PREREG-phase-3b-complement-lexical, P4/P5):
 *   - complement-relation fires must be exactly 0 (no COMPAT rows exist
 *     for INFINITIVAL_COMPLEMENT / PROPOSITIONAL_COMPLEMENT);
 *   - any global fire movement must decompose into the declared 3B
 *     material (clause defaults, VP alias, want/need/tried authoring).
 *
 * Method: run the frozen DEV chamber twice — once with the 3B provider,
 * once with an exact reconstruction of the pre-3B seed (the documented
 * change set, subtracted key by key). The difference isolates 3B.
 *
 * TEST sealed. OBSERVE only. Does not write evidence artifacts.
 *
 *   node scripts/phase-3b-attribution-probe.mjs
 */
import { composePacked } from '../codex/core/constellation/compose-packed.js';
import { createFeatureProvider } from '../codex/core/constellation/semantic-particles/feature-provider.js';
import {
  EXPERIMENTAL_FEATURE_PROVIDER,
  EXPERIMENTAL_FEATURE_DIMENSIONS,
  EXPERIMENTAL_FEATURE_SCHEMA_VERSION,
} from '../codex/core/constellation/semantic-particles/experimental-inventory.js';
import { DEFAULT_LEXICAL_LEXICON } from '../codex/core/constellation/semantic-particles/lexical-semantics.js';
import { diagnoseCompetitionEdge } from '../codex/core/constellation/semantic-particles/compat-waterfall.js';
import { derivationSignature, isGlueBond, lemmaOf } from '../codex/core/constellation/semantic-particles/decision-bearing.js';
import { loadPosMap, loadSplit } from './lib/constellation-corpus.mjs';

const MAX_TOKENS = 28;

// Exact reconstruction of the pre-3B seed: subtract the documented
// change set, key by key. Any residue would indicate undocumented change.
// Union-membership law: lemmas that entered the compileSeed union ONLY
// through 3B (tried via IRREGULAR; wants/wanted/wanting/needed via the
// COGNITION addition) are stripped wholesale — the PROPN heuristic would
// otherwise leave phantom human-class entries behind. 'want', 'need',
// 'needs' were union members pre-3B (ABSTRACT bag) and keep their
// nominal entries.
const UNION_NEW = new Set(['tried', 'wants', 'wanted', 'wanting', 'needed']);

function stripThreeB(seed) {
  const out = Object.create(null);
  const stripped = { vpAlias: 0, clauseDefaults: 0, governors: 0 };
  for (const [key, value] of Object.entries(seed)) {
    const [lemma, type] = key.includes('::') ? key.split('::') : [key, ''];
    if (lemma === '*' && (type === 'S' || type === 'SBAR' || type === 'INF')) {
      stripped.clauseDefaults += 1;
      continue;
    }
    if (type === 'VP') {
      stripped.vpAlias += 1;
      continue;
    }
    if (UNION_NEW.has(lemma)) {
      stripped.governors += 1;
      continue;
    }
    if ((lemma === 'want' || lemma === 'need') && type === 'V') {
      stripped.governors += 1;
      continue;
    }
    out[key] = value;
  }
  return { out, stripped };
}

function runChamber(provider, label) {
  const posMap = loadPosMap();
  const dev = loadSplit('dev');
  const lexicon = DEFAULT_LEXICAL_LEXICON;
  const fires = new Map(); // relation -> count
  const mappings = new Map();
  const firedSignatures = [];
  let edges = 0;
  let totalFire = 0;
  let analysed = 0;
  for (const rec of dev) {
    const tokens = (rec.tokens || []).map((t) => t.form);
    if (!tokens.length || tokens.length > MAX_TOKENS) continue;
    analysed += 1;
    if (analysed % 400 === 0) process.stderr.write(`[attribution:${label}] ${analysed}\n`);
    let chart;
    try {
      chart = composePacked(tokens, posMap, { semanticParticles: { mode: 'observe' } });
    } catch {
      continue;
    }
    for (const node of chart.molecules || []) {
      const bySignature = new Map();
      for (const derivation of node.derivations || []) {
        const sig = derivationSignature(derivation);
        if (!bySignature.has(sig)) bySignature.set(sig, derivation);
      }
      const unique = [...bySignature.values()];
      const decision = unique.filter((d) => !isGlueBond(d.bond));
      if (decision.length < 2) continue;
      for (const derivation of decision) {
        const row = diagnoseCompetitionEdge(derivation, lexicon, provider);
        edges += 1;
        if (!row.stages) continue;
        const relation = row.relation || '(none)';
        if (row.stages.compatMappingAvailable) {
          mappings.set(relation, (mappings.get(relation) || 0) + 1);
        }
        if (row.stages.actualCompatFire) {
          totalFire += 1;
          fires.set(relation, (fires.get(relation) || 0) + 1);
          if (relation === 'compound') {
            firedSignatures.push(
              `${rec.id}|${row.signature}|${lemmaOf(derivation.left)}+${lemmaOf(derivation.right)}`,
            );
          }
        }
      }
    }
  }
  return { edges, totalFire, fires, mappings, firedSignatures };
}

const { out: preSeed, stripped: strippedKeys } = stripThreeB(EXPERIMENTAL_FEATURE_PROVIDER.seed);
console.error(`[attribution] stripped pre-3B keys: ${JSON.stringify(strippedKeys)}`);
const preProvider = createFeatureProvider(preSeed, {
  version: 'reconstructed-3a',
  role: 'experimental-pre3b-reconstruction',
  dimensions: EXPERIMENTAL_FEATURE_DIMENSIONS,
});

const withThreeB = runChamber(EXPERIMENTAL_FEATURE_PROVIDER, '3B');
const preThreeB = runChamber(preProvider, 'pre3B');

const relations = new Set([...withThreeB.fires.keys(), ...preThreeB.fires.keys()]);
const rows = [...relations].sort().map((relation) => ({
  relation,
  pre3B: preThreeB.fires.get(relation) || 0,
  post3B: withThreeB.fires.get(relation) || 0,
  delta: (withThreeB.fires.get(relation) || 0) - (preThreeB.fires.get(relation) || 0),
}));

console.log(JSON.stringify({
  probe: 'phase-3b-attribution',
  schemaVersion: EXPERIMENTAL_FEATURE_SCHEMA_VERSION,
  strippedKeys: strippedKeys,
  totals: {
    pre3B: { edges: preThreeB.edges, fires: preThreeB.totalFire },
    post3B: { edges: withThreeB.edges, fires: withThreeB.totalFire },
  },
  complementRelationFires: {
    INFINITIVAL_COMPLEMENT: withThreeB.fires.get('INFINITIVAL_COMPLEMENT') || 0,
    PROPOSITIONAL_COMPLEMENT: withThreeB.fires.get('PROPOSITIONAL_COMPLEMENT') || 0,
  },
  byRelation: rows,
  mappingsPost: Object.fromEntries([...withThreeB.mappings.entries()].sort()),
  mappingsPre: Object.fromEntries([...preThreeB.mappings.entries()].sort()),
  compoundFireDiff: {
    newPost: withThreeB.firedSignatures.filter((s) => !preThreeB.firedSignatures.includes(s)).slice(0, 20),
    lostPre: preThreeB.firedSignatures.filter((s) => !withThreeB.firedSignatures.includes(s)).slice(0, 20),
  },
}, null, 2));
