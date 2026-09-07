/**
 * Deterministic Relevance Evaluator and Plan Generator for SCDL v2 Universal AMP Substrate.
 *
 * Provides truth-in-advertising relevance evaluation:
 * - Matches asset context (materials, shapes, tags, layers, canvas, pipeline) against manifest criteria.
 * - Records explicit activation reasons for selected AMPs.
 * - Records explicit skip reasons for dormant AMPs.
 * - Produces an immutable, explainable execution plan frozen into bytecode.
 */

import { buildConveyorBelt } from './scdl-v2.amp-stages.js';

function getFieldValues(context, field) {
  if (!context || typeof context !== 'object') return [];

  if (field === 'materials') {
    if (Array.isArray(context.materials)) return context.materials;
    if (context.materials instanceof Set) return [...context.materials];
    return [];
  }
  if (field === 'tags') {
    if (Array.isArray(context.tags)) return context.tags;
    if (context.tags instanceof Set) return [...context.tags];
    return [];
  }
  if (field === 'class' || field === 'archetype') {
    return context[field] ? [String(context[field])] : [];
  }
  if (field === 'pipeline') {
    return context.pipeline ? [String(context.pipeline)] : [];
  }
  if (field === 'layers') {
    return Array.isArray(context.layers) ? context.layers.map((l) => l.id || l.name) : [];
  }
  if (field.startsWith('canvas.')) {
    const prop = field.slice('canvas.'.length);
    return context.canvas && context.canvas[prop] !== undefined ? [String(context.canvas[prop])] : [];
  }
  return context[field] !== undefined ? [String(context[field])] : [];
}

function evaluateLeafClause(context, clause) {
  const { field, op, value } = clause;
  const values = getFieldValues(context, field);

  if (op === 'includes') {
    const targets = Array.isArray(value) ? value : [value];
    const match = targets.some((t) => values.includes(t));
    return {
      ok: match,
      reason: match ? `field '${field}' includes '${targets.join(', ')}'` : `field '${field}' does not include '${targets.join(', ')}'`,
    };
  }

  if (op === 'eq') {
    const target = String(value);
    const match = values.some((v) => v === target);
    return {
      ok: match,
      reason: match ? `field '${field}' equals '${target}'` : `field '${field}' does not equal '${target}'`,
    };
  }

  if (op === 'matches') {
    const pattern = new RegExp(String(value));
    const match = values.some((v) => pattern.test(v));
    return {
      ok: match,
      reason: match ? `field '${field}' matches '${value}'` : `field '${field}' does not match '${value}'`,
    };
  }

  return { ok: false, reason: `Unknown clause op '${op}'` };
}

function evaluateClause(context, clause) {
  if (clause.anyOf && Array.isArray(clause.anyOf)) {
    const results = clause.anyOf.map((c) => evaluateClause(context, c));
    const hit = results.find((r) => r.ok);
    if (hit) return { ok: true, reason: hit.reason };
    return { ok: false, reason: `None of anyOf conditions matched: [${results.map((r) => r.reason).join('; ')}]` };
  }

  if (clause.allOf && Array.isArray(clause.allOf)) {
    const results = clause.allOf.map((c) => evaluateClause(context, c));
    const miss = results.find((r) => !r.ok);
    if (miss) return { ok: false, reason: miss.reason };
    return { ok: true, reason: `All of conditions matched: [${results.map((r) => r.reason).join('; ')}]` };
  }

  if (clause.noneOf && Array.isArray(clause.noneOf)) {
    const results = clause.noneOf.map((c) => evaluateClause(context, c));
    const hit = results.find((r) => r.ok);
    if (hit) return { ok: false, reason: `Forbidden condition matched: ${hit.reason}` };
    return { ok: true, reason: 'None of forbidden conditions matched' };
  }

  return evaluateLeafClause(context, clause);
}

/**
 * Evaluates whether an AMP manifest is relevant to the given program context.
 *
 * @param {Object} manifest - PB-AMP-ABI-v1 manifest
 * @param {Object} context - { materials, tags, class, archetype, pipeline, canvas, layers }
 * @returns {{ relevant: boolean, reason: string }}
 */
export function evaluateAmpRelevance(manifest, context = {}) {
  const relevance = manifest?.relevance;

  if (!relevance || (typeof relevance !== 'object')) {
    return {
      relevant: false,
      reason: 'No relevance conditions declared; requires explicit APPLY_AMP invocation',
    };
  }

  if (context.stage && manifest.stage !== context.stage) {
    return {
      relevant: false,
      reason: `Stage mismatch: manifest stage '${manifest.stage}' does not match requested stage '${context.stage}'`,
    };
  }

  if (Array.isArray(relevance.pipelines) && relevance.pipelines.length > 0) {
    if (context.pipeline && !relevance.pipelines.includes(context.pipeline)) {
      return {
        relevant: false,
        reason: `Pipeline mismatch: asset pipeline '${context.pipeline}' not in [${relevance.pipelines.join(', ')}]`,
      };
    }
  }

  if (Array.isArray(relevance.conditions) && relevance.conditions.length > 0) {
    for (const clause of relevance.conditions) {
      const res = evaluateClause(context, clause);
      if (!res.ok) {
        return { relevant: false, reason: `Condition not met: ${res.reason}` };
      }
    }
  }

  return {
    relevant: true,
    reason: `All relevance criteria satisfied for ${manifest.ampId}`,
  };
}

/**
 * Builds the frozen execution plan containing both selected active AMPs and
 * dormant skipped AMPs with explicit explanatory reasons.
 *
 * @param {Array<Object>} manifests - Complete manifest list from the catalog
 * @param {Object} context - Program analysis context
 * @param {Array<Object>} explicitActivations - Author-specified APPLY_AMP declarations
 * @returns {Object} { selectedPlan, dormantList, fullPlan }
 */
export function resolveAmpPlan(manifests = [], context = {}, explicitActivations = [], options = {}) {
  const selectedEntries = [];
  const dormantEntries = [];
  const selectAmpsEnabled = Boolean(context.selectAmpsEnabled ?? options.selectAmpsEnabled);

  const explicitMap = new Map();
  for (const item of explicitActivations) {
    explicitMap.set(item.ampId, item);
  }

  for (const manifest of manifests) {
    const explicit = explicitMap.get(manifest.ampId);
    if (explicit) {
      selectedEntries.push({
        ampId: manifest.ampId,
        manifest,
        stage: explicit.stage || manifest.stage,
        order: manifest.order,
        inputs: explicit.inputs || {},
        params: explicit.params || {},
        targetSymbol: explicit.targetSymbol || null,
        targetType: explicit.targetType || manifest.output?.type,
        source: 'EXPLICIT_APPLY',
        activationReason: 'Explicitly declared in SCDL source via APPLY_AMP',
      });
      continue;
    }

    if (!selectAmpsEnabled) {
      dormantEntries.push({
        ampId: manifest.ampId,
        manifest,
        stage: manifest.stage,
        order: manifest.order,
        source: 'DORMANT',
        skipReason: 'Relevance selection not requested (SELECT_AMPS omitted)',
      });
      continue;
    }

    const evalResult = evaluateAmpRelevance(manifest, context);
    if (evalResult.relevant) {
      selectedEntries.push({
        ampId: manifest.ampId,
        manifest,
        stage: manifest.stage,
        order: manifest.order,
        inputs: {},
        params: {},
        targetSymbol: null,
        targetType: manifest.output?.type,
        source: 'RELEVANCE_SELECT',
        activationReason: evalResult.reason,
      });
    } else {
      dormantEntries.push({
        ampId: manifest.ampId,
        manifest,
        stage: manifest.stage,
        order: manifest.order,
        source: 'DORMANT',
        skipReason: evalResult.reason,
      });
    }
  }

  const conveyorBelt = buildConveyorBelt(selectedEntries);

  const fullPlan = Object.freeze([
    ...conveyorBelt,
    ...dormantEntries.map((d) => Object.freeze({ ...d })),
  ]);

  return Object.freeze({
    selectedPlan: conveyorBelt,
    dormantList: Object.freeze(dormantEntries),
    fullPlan,
  });
}
