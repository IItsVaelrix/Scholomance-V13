/**
 * Pure weave-to-scene target resolver.
 *
 * Scene assets declare which OBJECT tokens they accept; the vocabulary stays pure.
 * Phaser builds a SceneContextSnapshot; this module binds parsed weave clauses to
 * concrete target ids without importing Phaser or Codex scene state.
 */

import { lookupWeaveIntent } from '../../../codex/core/weave-intent-octree.js';
import { OBJECTS } from '../../../codex/core/semantics.registry.js';
import { tokenize } from '../../../codex/core/tokenizer.js';

/** @typedef {keyof typeof OBJECTS} WeaveObjectToken */

/** @typedef {'combatant' | 'structure' | 'loot' | 'gatherable' | 'terrain'} SceneTargetKind */

/**
 * @typedef {Object} SceneTarget
 * @property {string} id
 * @property {string} label
 * @property {SceneTargetKind} kind
 * @property {WeaveObjectToken[]} weaveObjects
 * @property {number} [tx]
 * @property {number} [ty]
 * @property {number} [z]
 * @property {boolean} inRange
 * @property {boolean} [reachable]
 * @property {number} [interactionPriority]
 * @property {boolean} [blocked]
 * @property {string[]} [weaveAliases] - extra name tokens that bind this target in weave text
 * @property {Record<string, unknown>} [metadata]
 */

/**
 * @typedef {Object} SceneContextSnapshot
 * @property {string} sceneId
 * @property {string} casterId
 * @property {number} [tick]
 * @property {string | null} [selectedCombatTargetId]
 * @property {SceneTarget[]} targets
 */

/**
 * @typedef {Object} ParsedWeaveClause
 * @property {WeaveObjectToken} [objectToken]
 * @property {string} [intentToken]
 * @property {'SINGLE' | 'SIMULTANEOUS' | 'SEQUENCE' | 'SUSTAINED' | 'MIXED'} [chainType]
 */

/**
 * @typedef {Object} ResolvedWeaveTarget
 * @property {WeaveObjectToken} objectToken
 * @property {{ id: string, confidence: number, reason: string } | null} resolvedTarget
 * @property {Array<{ id: string, confidence: number, reason: string }>} alternatives
 */

export const WEAVE_OBJECT_TOKENS = Object.freeze(Object.keys(OBJECTS));

const KIND_PRIORITY = Object.freeze({
  combatant: 500,
  structure: 400,
  gatherable: 300,
  loot: 200,
  terrain: 100,
});

/** Intent-class bias when multiple assets accept the same object token. */
const MODE_KIND_BIAS = Object.freeze({
  combat: Object.freeze({ combatant: 120, gatherable: -60 }),
  puzzle: Object.freeze({ structure: 140, loot: 40, gatherable: -80 }),
  gather: Object.freeze({ gatherable: 200, structure: -140 }),
  inspect: Object.freeze({ terrain: 40 }),
});

/** @typedef {'combat' | 'puzzle' | 'gather' | 'inspect'} CastModeHint */

export function deriveCastModeHint(clauses) {
  if (!Array.isArray(clauses) || clauses.length === 0) return null;
  const intentToken = clauses.find((clause) => clause.intentToken)?.intentToken;
  if (!intentToken) return null;
  return modeHintFromIntent(intentToken);
}

function modeHintFromIntent(intentToken) {
  const leaf = lookupWeaveIntent(intentToken);
  const intentClass = leaf?.intentClass || leaf?.intent;
  switch (intentClass) {
    case 'OFFENSIVE':
    case 'HEALING':
    case 'DEFENSIVE':
      return /** @type {CastModeHint} */ ('combat');
    case 'DISRUPTION':
      return /** @type {CastModeHint} */ ('puzzle');
    case 'UTILITY':
      return /** @type {CastModeHint} */ ('gather');
    default:
      return /** @type {CastModeHint} */ ('combat');
  }
}

function scoreTargetForObject(target, objectToken, modeHint = 'combat') {
  if (!target.weaveObjects.includes(objectToken)) {
    return { score: -Infinity, reason: 'object_mismatch' };
  }

  if (target.blocked) {
    return { score: -Infinity, reason: 'blocked' };
  }

  let score = 0;
  const reasons = ['object_match'];

  if (target.inRange) {
    score += 1000;
    reasons.push('in_range');
  } else {
    score -= 500;
    reasons.push('out_of_range');
  }

  if (target.reachable !== false) {
    score += 100;
    reasons.push('reachable');
  } else {
    score -= 250;
    reasons.push('unreachable');
  }

  score += target.interactionPriority ?? KIND_PRIORITY[target.kind] ?? 0;

  const modeBias = MODE_KIND_BIAS[modeHint] || {};
  score += modeBias[target.kind] ?? 0;
  if (modeBias[target.kind]) {
    reasons.push(`mode_${modeHint}`);
  }

  return {
    score,
    reason: reasons.join('+'),
  };
}

function confidenceFromScore(score) {
  return Math.max(0, Math.min(1, score / 1500));
}

function normalizeAliasToken(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * @param {SceneTarget} target
 * @returns {Set<string>}
 */
export function collectTargetAliases(target) {
  const aliases = new Set();
  const addPhrase = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return;
    const normalized = normalizeAliasToken(raw);
    if (normalized) aliases.add(normalized);
    const words = raw.toLowerCase().match(/\b(\w+)\b/g) || [];
    for (const word of words) {
      if (word.length >= 3) aliases.add(word.toUpperCase());
    }
  };

  addPhrase(target.id);
  addPhrase(target.label);
  if (target.metadata?.shortLabel) addPhrase(target.metadata.shortLabel);
  if (Array.isArray(target.weaveAliases)) target.weaveAliases.forEach(addPhrase);
  if (Array.isArray(target.metadata?.weaveAliases)) target.metadata.weaveAliases.forEach(addPhrase);
  return aliases;
}

/**
 * @param {string} token
 * @param {SceneContextSnapshot} [sceneContext]
 */
export function lookupSceneEnemyToken(token, sceneContext) {
  const normalized = String(token || '').toUpperCase();
  if (!normalized || !sceneContext?.targets?.length) return null;

  for (const target of sceneContext.targets) {
    if (target.kind !== 'combatant') continue;
    if (collectTargetAliases(target).has(normalized)) {
      return { target, matchedAlias: normalized };
    }
  }
  return null;
}

/**
 * @param {SceneTarget} target
 * @param {'alias' | 'full_id' | 'short_label'} matchKind
 * @param {CastModeHint} modeHint
 */
function scoreNamedTargetMatch(target, matchKind, modeHint = 'combat') {
  let score = 820;
  if (target.inRange) {
    score += 1000;
  } else {
    score -= 500;
  }
  if (target.reachable !== false) {
    score += 100;
  } else {
    score -= 250;
  }
  score += target.interactionPriority ?? KIND_PRIORITY[target.kind] ?? 0;
  const modeBias = MODE_KIND_BIAS[modeHint] || {};
  score += modeBias[target.kind] ?? 0;
  if (matchKind === 'full_id') score += 220;
  if (matchKind === 'short_label') score += 140;
  return score;
}

/**
 * @param {string} weaveText
 * @param {SceneContextSnapshot} [sceneContext]
 */
export function findNamedEnemyMatches(weaveText, sceneContext) {
  const tokens = tokenize(weaveText).map((token) => token.toUpperCase());
  if (!tokens.length || !sceneContext?.targets?.length) return [];

  const tokenSet = new Set(tokens);
  const matches = [];
  const combatants = sceneContext.targets.filter((target) => target.kind === 'combatant');

  for (const target of combatants) {
    const aliases = collectTargetAliases(target);
    for (const alias of aliases) {
      if (!tokenSet.has(alias)) continue;
      matches.push({
        target,
        alias,
        matchKind: /** @type {'alias'} */ ('alias'),
        score: scoreNamedTargetMatch(target, 'alias', 'combat'),
      });
    }

    const idParts = String(target.id || '').toLowerCase().split(/[-_]/).filter(Boolean);
    if (idParts.length > 1 && idParts.every((part) => tokenSet.has(part.toUpperCase()))) {
      matches.push({
        target,
        alias: normalizeAliasToken(target.id),
        matchKind: /** @type {'full_id'} */ ('full_id'),
        score: scoreNamedTargetMatch(target, 'full_id', 'combat'),
      });
    }

    const shortLabel = target.metadata?.shortLabel;
    if (shortLabel) {
      const shortNorm = normalizeAliasToken(shortLabel);
      if (shortNorm && tokenSet.has(shortNorm)) {
        matches.push({
          target,
          alias: shortNorm,
          matchKind: /** @type {'short_label'} */ ('short_label'),
          score: scoreNamedTargetMatch(target, 'short_label', 'combat'),
        });
      }
    }
  }

  const bestByTarget = new Map();
  for (const entry of matches) {
    const prev = bestByTarget.get(entry.target.id);
    if (!prev || entry.score > prev.score) {
      bestByTarget.set(entry.target.id, entry);
    }
  }

  return [...bestByTarget.values()]
    .filter((entry) => entry.target.inRange && entry.target.reachable !== false)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.target.id.localeCompare(b.target.id);
    });
}

/**
 * @param {string} weaveText
 * @param {SceneContextSnapshot} [sceneContext]
 * @param {CastModeHint} [modeHint]
 */
export function resolveNamedEnemyTargets(weaveText, sceneContext, modeHint = 'combat') {
  const ranked = findNamedEnemyMatches(weaveText, sceneContext)
    .map((entry) => ({
      ...entry,
      score: scoreNamedTargetMatch(entry.target, entry.matchKind, modeHint),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.target.id.localeCompare(b.target.id);
    });

  const best = ranked[0];
  if (!best) {
    return {
      clauses: [],
      primaryTargetId: null,
      unresolvedObjects: [],
      modeHint,
      namedTargetId: null,
    };
  }

  const clause = {
    objectToken: null,
    nameToken: best.alias,
    resolvedTarget: {
      id: best.target.id,
      confidence: confidenceFromScore(best.score),
      reason: `name_match:${best.matchKind}`,
    },
    alternatives: ranked.slice(1).map((entry) => ({
      id: entry.target.id,
      confidence: confidenceFromScore(entry.score),
      reason: `name_match:${entry.matchKind}`,
    })),
  };

  return {
    clauses: [clause],
    primaryTargetId: best.target.id,
    unresolvedObjects: [],
    modeHint,
    namedTargetId: best.target.id,
  };
}

/**
 * Map parseWeave() output into resolver-ready clauses (one entry per object token).
 * @param {import('../../../codex/core/spellweave.engine.js').parseWeave extends Function ? ReturnType<import('../../../codex/core/spellweave.engine.js').parseWeave> : any} parsed
 * @returns {ParsedWeaveClause[]}
 */
export function extractParsedClauses(parsed) {
  const chainType = parsed?.chainType || 'SINGLE';
  const active = (parsed?.clauses || []).filter((clause) => clause.legality !== 'inert');
  const rows = [];

  for (const clause of active) {
    const intentToken = clause.intents?.[0];
    if (!clause.objects?.length) {
      rows.push({ intentToken, chainType });
      continue;
    }
    for (const objectToken of clause.objects) {
      const upper = String(objectToken || '').toUpperCase();
      if (!WEAVE_OBJECT_TOKENS.includes(upper)) continue;
      rows.push({
        intentToken,
        objectToken: /** @type {WeaveObjectToken} */ (upper),
        chainType,
      });
    }
  }

  return rows;
}

/**
 * @param {ParsedWeaveClause[]} clauses
 * @param {SceneContextSnapshot} [sceneContext]
 */
export function resolveWeaveTargets(clauses, sceneContext) {
  const modeHint = deriveCastModeHint(clauses);

  if (
    !sceneContext
    || !Array.isArray(sceneContext.targets)
    || !Array.isArray(clauses)
    || clauses.length === 0
  ) {
    return {
      clauses: [],
      primaryTargetId: null,
      unresolvedObjects: [],
      modeHint,
    };
  }

  const resolvedClauses = [];
  const unresolvedObjects = [];

  for (const clause of clauses) {
    if (!clause.objectToken) continue;

    const clauseModeHint = modeHintFromIntent(clause.intentToken);

    const candidates = sceneContext.targets
      .map((target) => {
        const scored = scoreTargetForObject(target, clause.objectToken, clauseModeHint);
        return {
          target,
          score: scored.score,
          reason: scored.reason,
        };
      })
      .filter((entry) => Number.isFinite(entry.score))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.target.id.localeCompare(b.target.id);
      });

    const best = candidates[0];

    if (!best || !best.target.inRange || best.target.reachable === false) {
      unresolvedObjects.push(clause.objectToken);
      resolvedClauses.push({
        objectToken: clause.objectToken,
        resolvedTarget: null,
        alternatives: candidates.map((entry) => ({
          id: entry.target.id,
          confidence: confidenceFromScore(entry.score),
          reason: entry.reason,
        })),
      });
      continue;
    }

    resolvedClauses.push({
      objectToken: clause.objectToken,
      resolvedTarget: {
        id: best.target.id,
        confidence: confidenceFromScore(best.score),
        reason: best.reason,
      },
      alternatives: candidates.slice(1).map((entry) => ({
        id: entry.target.id,
        confidence: confidenceFromScore(entry.score),
        reason: entry.reason,
      })),
    });
  }

  return {
    clauses: resolvedClauses,
    primaryTargetId:
      resolvedClauses.find((clause) => clause.resolvedTarget)?.resolvedTarget?.id ?? null,
    unresolvedObjects,
    modeHint,
  };
}

function mergeResolvedTargetResults(objectResult, namedResult) {
  if (!namedResult?.primaryTargetId) return objectResult;

  const namedClauses = namedResult.clauses || [];
  const objectClauses = objectResult.clauses || [];
  const mergedClauses = [
    ...namedClauses,
    ...objectClauses.filter((clause) => (
      !clause.resolvedTarget
      || clause.resolvedTarget.id !== namedResult.primaryTargetId
    )),
  ];

  return {
    ...objectResult,
    clauses: mergedClauses,
    primaryTargetId: namedResult.primaryTargetId,
    namedTargetId: namedResult.primaryTargetId,
    unresolvedObjects: objectResult.unresolvedObjects.filter((token) => (
      !namedClauses.some((clause) => clause.nameToken === token)
    )),
  };
}

/**
 * Convenience: parseWeave output + scene snapshot → resolved targets.
 * Enemy names typed in the weave (e.g. SENTINEL, BRAZIER) auto-bind combatants.
 *
 * @param {ReturnType<import('../../../codex/core/spellweave.engine.js').parseWeave>} parsed
 * @param {SceneContextSnapshot} [sceneContext]
 * @param {string} [weaveText]
 */
export function resolveWeaveTargetsFromParsed(parsed, sceneContext, weaveText = '') {
  const clauses = extractParsedClauses(parsed);
  const objectResult = resolveWeaveTargets(clauses, sceneContext);
  const namedResult = resolveNamedEnemyTargets(
    weaveText,
    sceneContext,
    objectResult.modeHint,
  );
  return mergeResolvedTargetResults(objectResult, namedResult);
}

/**
 * Label lookup for HUD hints.
 * @param {SceneContextSnapshot} [sceneContext]
 * @param {string} targetId
 */
export function findSceneTargetLabel(sceneContext, targetId) {
  if (!sceneContext || !targetId || !Array.isArray(sceneContext.targets)) return targetId || null;
  return sceneContext.targets.find((target) => target.id === targetId)?.label ?? targetId;
}