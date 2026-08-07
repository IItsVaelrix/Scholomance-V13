/**
 * CONSTELLATION — discovery adapter (expand → constrain → score → rank)
 *
 * Local-only generators (lexicon + rhyme engines). Hard rhyme constraint before
 * ranking. Pre-score via pure discoveryScoring; rank via PLS rankCandidates only.
 *
 * Spec: docs/superpowers/specs/2026-08-07-constellationos-poetic-discovery-design.md §4.5–4.9
 */

import { parseDiscoveryInquiry } from '../../../core/constellation/discoveryInquiry.js';
import { buildDiscoveryPlan } from '../../../core/constellation/discoveryPlan.js';
import {
  DISCOVERY_HIT_LIMIT,
  DISCOVERY_PER_SOURCE_CAP,
  DISCOVERY_GLOBAL_CAP,
  DISCOVERY_SOURCE_ORDER,
  WEIGHT_PROFILES,
} from '../../../core/constellation/discoveryWeights.js';
import {
  computeModifierFit,
  computeRarityBoost,
  applyDiscoveryPreScore,
  buildHitEvidence,
} from '../../../core/constellation/discoveryScoring.js';
import { corpusFreqToRarity } from '../../../core/constellation/rarity.js';
import { rankCandidates } from '../../../../src/lib/pls/ranker.js';

export const DISCOVERY_ADAPTER_VERSION = 'disc-adapter-1';

const MODIFIER_ATTRACTOR_CAP = 15;

/**
 * @param {string} lemma
 * @returns {string}
 */
function normLemma(lemma) {
  return String(lemma || '')
    .trim()
    .toLowerCase();
}

/**
 * Deterministic lemma ASC sort + cap.
 * @param {string[]} lemmas
 * @param {number} cap
 * @returns {string[]}
 */
function sortCap(lemmas, cap = DISCOVERY_PER_SOURCE_CAP) {
  const unique = [...new Set(lemmas.map(normLemma).filter(Boolean))];
  unique.sort((a, b) => a.localeCompare(b));
  return unique.slice(0, cap);
}

/**
 * Tokenize gloss text for modifierFit overlap.
 * @param {string} gloss
 * @returns {string[]}
 */
export function glossTokensFor(gloss) {
  if (!gloss || typeof gloss !== 'string') return [];
  return gloss
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

/**
 * Collect gloss tokens for a candidate from lexicon.
 * @param {string} token
 * @param {object} lexiconAdapter
 * @returns {string[]}
 */
function candidateGlossTokens(token, lexiconAdapter) {
  const entries = lexiconAdapter.lookupWord?.(token) || [];
  const tokens = new Set();
  for (const entry of entries) {
    const senses = Array.isArray(entry?.senses) ? entry.senses : [];
    for (const sense of senses) {
      let gloss = '';
      if (typeof sense === 'string') gloss = sense;
      else if (sense && typeof sense.gloss === 'string') gloss = sense.gloss;
      else if (lexiconAdapter.extractGloss) {
        gloss = lexiconAdapter.extractGloss([sense]) || '';
      }
      for (const t of glossTokensFor(gloss)) tokens.add(t);
    }
  }
  return [...tokens];
}

/**
 * Fetch lemmas for one source in canonical order.
 * @param {'synonyms'|'related'|'symbols'|'fts'} source
 * @param {string} seed
 * @param {'semantic'|'antonym'} genType
 * @param {object} lexiconAdapter
 * @returns {{ lemmas: string[], viaTag: string }}
 */
function fetchSource(source, seed, genType, lexiconAdapter) {
  const viaPrefix =
    source === 'synonyms'
      ? genType === 'antonym'
        ? 'antonym'
        : 'synonym'
      : source;

  if (source === 'synonyms') {
    const rows =
      genType === 'antonym'
        ? lexiconAdapter.lookupAntonyms?.(seed) || []
        : lexiconAdapter.lookupSynonyms?.(seed) || [];
    const lemmas = rows.map((r) => normLemma(r?.lemma ?? r)).filter(Boolean);
    return { lemmas: sortCap(lemmas), viaTag: `${viaPrefix}:${seed}` };
  }

  if (source === 'related') {
    const rel = lexiconAdapter.lookupRelated?.(seed) || {};
    const raw = [
      ...(rel.broader || []),
      ...(rel.narrower || []),
      ...(rel.akin || []),
    ].map((r) => normLemma(r?.lemma ?? r));
    return { lemmas: sortCap(raw), viaTag: `related:${seed}` };
  }

  if (source === 'symbols') {
    const rows = lexiconAdapter.lookupSymbolsLoose?.(seed) || [];
    const lemmas = rows.map((r) => normLemma(r?.lemma ?? r)).filter(Boolean);
    return { lemmas: sortCap(lemmas), viaTag: `symbols:${seed}` };
  }

  if (source === 'fts') {
    const rows = lexiconAdapter.searchEntries?.(seed) || [];
    const lemmas = rows
      .map((r) => normLemma(r?.headword ?? r?.lemma ?? r))
      .filter(Boolean);
    return { lemmas: sortCap(lemmas), viaTag: `fts:${seed}` };
  }

  return { lemmas: [], viaTag: `${source}:${seed}` };
}

/**
 * Expand semantic/antonym generator: walk DISCOVERY_SOURCE_ORDER.
 * Mutates pool Map token → { token, via: string[], generator: string }.
 *
 * @param {{ type: string, seed: string }} generator
 * @param {object} lexiconAdapter
 * @param {Map<string, { token: string, via: string[], generator: string }>} pool
 * @param {Set<string>} exclude
 */
export function expandSemantic(generator, lexiconAdapter, pool, exclude) {
  const seed = normLemma(generator.seed);
  const genType = generator.type === 'antonym' ? 'antonym' : 'semantic';

  for (const source of DISCOVERY_SOURCE_ORDER) {
    if (pool.size >= DISCOVERY_GLOBAL_CAP) return;
    let lemmas;
    let viaTag;
    try {
      ({ lemmas, viaTag } = fetchSource(source, seed, genType, lexiconAdapter));
    } catch {
      continue; // source failure → empty that source
    }
    for (const lemma of lemmas) {
      if (pool.size >= DISCOVERY_GLOBAL_CAP) return;
      if (!lemma || exclude.has(lemma) || lemma === seed) continue;
      if (pool.has(lemma)) continue; // first-seen wins
      pool.set(lemma, {
        token: lemma,
        via: [viaTag],
        generator: genType,
      });
    }
  }
}

/**
 * Expand rhyme generator from engine/repo.
 * @param {{ type: string, seed: string }} generator
 * @param {object} deps
 * @param {Map<string, { token: string, via: string[], generator: string }>} pool
 * @param {Set<string>} exclude
 */
export async function expandRhyme(generator, deps, pool, exclude) {
  const seed = normLemma(generator.seed);
  const viaTag = `rhyme:${seed}`;
  const tokens = await collectRhymeTokens(seed, deps);

  for (const lemma of tokens) {
    if (pool.size >= DISCOVERY_GLOBAL_CAP) return;
    if (!lemma || exclude.has(lemma) || lemma === seed) continue;
    if (pool.has(lemma)) continue;
    pool.set(lemma, {
      token: lemma,
      via: [viaTag],
      generator: 'rhyme',
    });
  }
}

/**
 * Collect rhyme member tokens for a target, sorted ASC.
 * @param {string} target
 * @param {object} deps
 * @returns {Promise<string[]>}
 */
async function collectRhymeTokens(target, deps) {
  const out = new Set();
  const { rhymeQueryEngine, rhymeLexiconRepo } = deps || {};

  if (rhymeQueryEngine?.query) {
    try {
      const result = await rhymeQueryEngine.query({ text: target, mode: 'word' });
      const constellation = result?.constellations?.[0];
      for (const id of constellation?.members || []) {
        const node = rhymeLexiconRepo?.lookupNodeById?.(id);
        const tok = normLemma(node?.token ?? id);
        if (tok) out.add(tok);
      }
      for (const m of result?.topMatches || []) {
        const tok = normLemma(m?.token);
        if (tok) out.add(tok);
      }
    } catch {
      // degrade empty
    }
  }

  // Repo may expose direct membership enumeration (mock-friendly)
  if (rhymeLexiconRepo?.listRhymesFor) {
    try {
      for (const t of rhymeLexiconRepo.listRhymesFor(target) || []) {
        const tok = normLemma(t);
        if (tok) out.add(tok);
      }
    } catch {
      // ignore
    }
  }

  return sortCap([...out], DISCOVERY_PER_SOURCE_CAP);
}

/**
 * Rhyme evidence for hard constraint.
 * 1. rhymeLexiconRepo.rhymesWith
 * 2. rhymeQueryEngine.query members/topMatches
 * 3. optional phoneme rhymeKey equality
 * 4. false
 *
 * @param {string} candidate
 * @param {string} target
 * @param {object} deps
 * @returns {Promise<boolean>}
 */
export async function hasRhymeEvidence(candidate, target, deps) {
  const a = normLemma(candidate);
  const b = normLemma(target);
  if (!a || !b) return false;
  if (a === b) return true;

  const repo = deps?.rhymeLexiconRepo;
  const engine = deps?.rhymeQueryEngine;
  const phonemeEngine = deps?.phonemeEngine;

  if (typeof repo?.rhymesWith === 'function') {
    try {
      if (repo.rhymesWith(a, b)) return true;
    } catch {
      // fall through
    }
  }

  if (engine?.query) {
    try {
      const result = await engine.query({ text: b, mode: 'word' });
      const members = new Set();
      const constellation = result?.constellations?.[0];
      for (const id of constellation?.members || []) {
        const node = repo?.lookupNodeById?.(id);
        members.add(normLemma(node?.token ?? id));
      }
      for (const m of result?.topMatches || []) {
        members.add(normLemma(m?.token));
      }
      if (members.has(a)) return true;
    } catch {
      // fall through
    }
  }

  if (phonemeEngine?.rhymeKey) {
    try {
      const ka = phonemeEngine.rhymeKey(a);
      const kb = phonemeEngine.rhymeKey(b);
      if (ka && kb && ka === kb) return true;
    } catch {
      // ignore
    }
  }

  // Optional node rhymeKey equality via repo
  if (repo?.lookupNodeByNormalized) {
    try {
      const na = repo.lookupNodeByNormalized(a);
      const nb = repo.lookupNodeByNormalized(b);
      if (na?.rhymeKey && nb?.rhymeKey && na.rhymeKey === nb.rhymeKey) return true;
    } catch {
      // ignore
    }
  }

  return false;
}

/**
 * @param {Array<{ token: string, via: string[], generator: string }>} candidates
 * @param {string} rhymeWith
 * @param {object} deps
 * @returns {Promise<{ survivors: typeof candidates, warning: string|null }>}
 */
export async function applyRhymeConstraint(candidates, rhymeWith, deps) {
  const target = normLemma(rhymeWith);
  const hasRepo = typeof deps?.rhymeLexiconRepo?.rhymesWith === 'function';
  const hasEngine = typeof deps?.rhymeQueryEngine?.query === 'function';
  const hasPhoneme = typeof deps?.phonemeEngine?.rhymeKey === 'function';
  const hasNodeKey =
    typeof deps?.rhymeLexiconRepo?.lookupNodeByNormalized === 'function';

  if (!hasRepo && !hasEngine && !hasPhoneme && !hasNodeKey) {
    // No rhyme authority — all drop
    return {
      survivors: [],
      warning: 'constraint.rhymeWith: rhyme engines missing; all candidates dropped',
    };
  }

  const survivors = [];
  for (const c of candidates) {
    // eslint-disable-next-line no-await-in-loop -- sequential evidence checks (deterministic)
    const ok = await hasRhymeEvidence(c.token, target, deps);
    if (ok) {
      const via = [...c.via];
      if (!via.some((v) => v.startsWith('rhyme:') || v.startsWith('rhymeWith:'))) {
        via.push(`rhymeWith:${target}`);
      }
      survivors.push({ ...c, via });
    }
  }

  if (survivors.length === 0) {
    return {
      survivors: [],
      warning: 'constraint.rhymeWith eliminated all candidates',
    };
  }

  return { survivors, warning: null };
}

/**
 * Build modifier attractor set: modifier lemmas + syn/related (cap 15 each, sorted).
 * @param {string[]} modifiers
 * @param {object} lexiconAdapter
 * @returns {Set<string>}
 */
function buildAttractorSet(modifiers, lexiconAdapter) {
  const attractors = new Set();
  for (const mod of modifiers) {
    const m = normLemma(mod);
    if (!m) continue;
    attractors.add(m);

    let syns = [];
    try {
      syns = (lexiconAdapter.lookupSynonyms?.(m) || [])
        .map((r) => normLemma(r?.lemma ?? r))
        .filter(Boolean);
    } catch {
      syns = [];
    }
    for (const s of sortCap(syns, MODIFIER_ATTRACTOR_CAP)) attractors.add(s);

    let relLemmas = [];
    try {
      const rel = lexiconAdapter.lookupRelated?.(m) || {};
      relLemmas = [
        ...(rel.broader || []),
        ...(rel.narrower || []),
        ...(rel.akin || []),
      ]
        .map((r) => normLemma(r?.lemma ?? r))
        .filter(Boolean);
    } catch {
      relLemmas = [];
    }
    for (const s of sortCap(relLemmas, MODIFIER_ATTRACTOR_CAP)) attractors.add(s);
  }
  return attractors;
}

/**
 * @param {object|null} parse
 * @param {string} status
 * @param {object} [overrides]
 */
function channelFromParse(parse, status, overrides = {}) {
  return {
    status,
    mode: overrides.mode || 'semantic',
    relation: parse?.relation || 'unknown',
    seeds: parse?.seeds ? [...parse.seeds] : [],
    modifiers: parse?.modifiers ? [...parse.modifiers] : [],
    constraints: {
      rhymeWith: parse?.constraints?.rhymeWith ?? null,
    },
    hits: overrides.hits || [],
    warnings: overrides.warnings || [],
    parse: {
      reasons: parse?.reasons ? [...parse.reasons] : [],
      modifierSources: parse?.modifierSources
        ? parse.modifierSources.map((m) => ({ ...m }))
        : [],
    },
  };
}

/**
 * Run discovery: parse → plan → expand → constrain → pre-score → rankCandidates.
 *
 * @param {string} rawQuery
 * @param {{ normalized?: string, tokens?: string[], raw?: string }|null} identity
 * @param {{ lexiconAdapter: object, rhymeQueryEngine?: object, rhymeLexiconRepo?: object, phonemeEngine?: object }} deps
 * @returns {Promise<object|null>}
 */
export async function analyzeDiscovery(rawQuery, identity, deps) {
  if (!deps?.lexiconAdapter) return null;

  const lexiconAdapter = deps.lexiconAdapter;
  const parseInput = identity || rawQuery;
  const parse = parseDiscoveryInquiry(parseInput);
  const plan = buildDiscoveryPlan(parse);

  if (!plan) {
    return channelFromParse(parse, 'refused', {
      warnings: [parse?.refusal || 'no discovery plan'].filter(Boolean),
    });
  }

  const warnings = [];
  const exclude = new Set(plan.seeds.map(normLemma));
  /** @type {Map<string, { token: string, via: string[], generator: string }>} */
  const pool = new Map();

  // --- EXPAND ---
  for (const generator of plan.generators) {
    if (pool.size >= DISCOVERY_GLOBAL_CAP) break;
    if (generator.type === 'rhyme') {
      // eslint-disable-next-line no-await-in-loop
      await expandRhyme(generator, deps, pool, exclude);
    } else {
      expandSemantic(generator, lexiconAdapter, pool, exclude);
    }
  }

  let candidates = [...pool.values()];

  // --- CONSTRAIN (hard rhyme) ---
  const rhymeConstraint = plan.constraints.find((c) => c.type === 'rhymeWith');
  if (rhymeConstraint) {
    const { survivors, warning } = await applyRhymeConstraint(
      candidates,
      rhymeConstraint.token,
      deps,
    );
    if (warning) warnings.push(warning);
    candidates = survivors;

    if (candidates.length === 0) {
      return channelFromParse(parse, 'empty', {
        mode: plan.mode,
        warnings,
        hits: [],
      });
    }
  }

  if (candidates.length === 0) {
    return channelFromParse(parse, 'empty', {
      mode: plan.mode,
      warnings: [...warnings, 'no candidates from generators'],
      hits: [],
    });
  }

  // --- ATTRACTORS + PRE-SCORE ---
  const attractorSet = buildAttractorSet(plan.modifiers, lexiconAdapter);
  const tokens = candidates.map((c) => c.token);
  let freqMap = new Map();
  try {
    freqMap = lexiconAdapter.getCorpusFrequencies?.(tokens) || new Map();
  } catch {
    freqMap = new Map();
  }

  const n = candidates.length;
  /** @type {Array<{ token: string, score: number, badge?: string }>} */
  const synonymResults = [];
  /** @type {Array<{ token: string, score: number, badge?: string }>} */
  const rhymeResults = [];
  /** @type {Map<string, {
   *   via: string[],
   *   modifierFit: { score: number, paths: string[] },
   *   rarityBoost: number,
   *   synonymScore: number,
   * }>} */
  const metaByToken = new Map();

  candidates.forEach((c, i) => {
    const baseEvidence = Array.isArray(c.via) && c.via.length > 0;
    if (!baseEvidence) return; // invalid — skip

    const rankScore = n > 0 ? 1 - i / n : 0.5;
    const baseSyn = Number.isFinite(rankScore) ? rankScore : 0.5;

    const glossToks = candidateGlossTokens(c.token, lexiconAdapter);
    const modFit = computeModifierFit(c.token, attractorSet, glossToks);

    const freq = freqMap.get(c.token);
    const rarityInfo = corpusFreqToRarity(freq ?? 0);
    const rarityBand = rarityInfo?.band ?? null;
    const rarityBoost = computeRarityBoost(baseEvidence, rarityBand);

    const synonymScore = applyDiscoveryPreScore(baseSyn, modFit.score, rarityBoost);

    metaByToken.set(c.token, {
      via: [...c.via],
      modifierFit: modFit,
      rarityBoost,
      synonymScore,
      generator: c.generator,
    });

    if (c.generator === 'rhyme') {
      rhymeResults.push({ token: c.token, score: synonymScore });
      // also feed synonym channel lightly so validity path works with synonym profile
      synonymResults.push({ token: c.token, score: synonymScore * 0.5 });
    } else {
      synonymResults.push({ token: c.token, score: synonymScore });
      // if constraint-passed rhyme, mark rhyme score for survivors
      if (c.via.some((v) => v.startsWith('rhyme') || v.startsWith('rhymeWith'))) {
        rhymeResults.push({ token: c.token, score: 1 });
      }
    }
  });

  if (metaByToken.size === 0) {
    return channelFromParse(parse, 'empty', {
      mode: plan.mode,
      warnings: [...warnings, 'no evidenced candidates'],
      hits: [],
    });
  }

  const allTokens = [...metaByToken.keys()];
  const validity = allTokens.map((token) => ({
    token,
    scores: { validity: 1 },
  }));

  const profile = WEIGHT_PROFILES[plan.scorerProfile] || WEIGHT_PROFILES.semantic;

  // --- RANK (PLS only) ---
  const ranked = rankCandidates(
    {
      synonym: synonymResults,
      rhyme: rhymeResults,
      prefix: [],
    },
    {
      meter: [],
      color: [],
      validity,
      democracy: [],
      predictability: [],
    },
    profile,
    {},
    DISCOVERY_HIT_LIMIT,
  );

  // --- MAP HITS ---
  const hits = ranked
    .map((r) => {
      const meta = metaByToken.get(r.token);
      if (!meta) return null;

      const via = meta.via;
      const badges = [];
      // Badge law: only with recoverable provenance
      if (via.some((v) => v.startsWith('synonym:'))) badges.push('SYNONYM');
      if (via.some((v) => v.startsWith('rhyme:') || v.startsWith('rhymeWith:'))) {
        badges.push('RHYME');
      }
      if (meta.modifierFit.score > 0 && meta.modifierFit.paths.length > 0) {
        badges.push('MODIFIER');
      }
      if (meta.rarityBoost > 0) badges.push('RARE');

      const evidence = buildHitEvidence(meta.modifierFit, meta.rarityBoost);
      const reasons = [...via];
      if (meta.modifierFit.score > 0) {
        reasons.push(`modifierFit:${meta.modifierFit.score.toFixed(3)}`);
      }
      if (meta.rarityBoost > 0) {
        reasons.push(`rarityBoost:${meta.rarityBoost.toFixed(3)}`);
      }

      return {
        token: r.token,
        score: r.score,
        badges,
        reasons,
        via,
        evidence,
      };
    })
    .filter(Boolean);

  const status = hits.length > 0 ? 'resolved' : 'empty';

  return channelFromParse(parse, status, {
    mode: plan.mode,
    warnings,
    hits,
  });
}
