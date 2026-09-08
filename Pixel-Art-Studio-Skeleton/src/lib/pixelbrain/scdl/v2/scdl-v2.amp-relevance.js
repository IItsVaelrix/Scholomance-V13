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

function hashParams(params = {}) {
  const keys = Object.keys(params || {}).sort();
  const normalized = {};
  for (const k of keys) normalized[k] = params[k];
  return JSON.stringify(normalized);
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

  const manifestMap = new Map(manifests.map((m) => [m.ampId, m]));
  const explicitKeySet = new Set();
  const explicitByAmp = new Map();

  // 1. Process explicit activations with composite invocation keys (ampId, targetSymbol, paramsHash)
  for (const item of explicitActivations) {
    const manifest = manifestMap.get(item.ampId) || {
      ampId: item.ampId,
      stage: item.stage || 'SHAPE_POST',
      order: 100,
    };
    const pHash = hashParams(item.params);
    const targetSymbol = item.targetSymbol || null;
    const invocationKey = `${item.ampId}::${targetSymbol || ''}::${pHash}`;

    explicitKeySet.add(invocationKey);
    if (!explicitByAmp.has(item.ampId)) {
      explicitByAmp.set(item.ampId, []);
    }
    explicitByAmp.get(item.ampId).push(item);

    selectedEntries.push({
      ampId: item.ampId,
      manifest,
      stage: item.stage || manifest.stage,
      order: manifest.order,
      inputs: item.inputs || {},
      params: item.params || {},
      targetSymbol,
      targetType: item.targetType || manifest.output?.type,
      source: 'EXPLICIT_APPLY',
      status: 'ACTIVE',
      invocationKey,
      activationReason: 'Explicitly declared in SCDL source via APPLY_AMP',
    });
  }

  // 2. Evaluate catalog manifests for relevance selection and dormancy
  for (const manifest of manifests) {
    const hasExplicit = explicitByAmp.has(manifest.ampId);

    if (!selectAmpsEnabled) {
      if (!hasExplicit) {
        dormantEntries.push({
          ampId: manifest.ampId,
          manifest,
          stage: manifest.stage,
          order: manifest.order,
          source: 'DORMANT',
          status: 'DORMANT',
          skipReason: 'Relevance selection not requested (SELECT_AMPS omitted)',
        });
      }
      continue;
    }

    const evalResult = evaluateAmpRelevance(manifest, context);
    if (evalResult.relevant) {
      // Check if an explicit declaration already applied this AMP to default target with empty/default params
      const isDuplicate = hasExplicit && (explicitByAmp.get(manifest.ampId) || []).some((e) => (e.targetSymbol || null) === null);
      if (isDuplicate) {
        dormantEntries.push({
          ampId: manifest.ampId,
          manifest,
          stage: manifest.stage,
          order: manifest.order,
          source: 'RELEVANCE_SELECT',
          status: 'DEDUPLICATED',
          skipReason: 'Deduplicated: explicitly declared for target',
        });
      } else {
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
          status: 'ACTIVE',
          invocationKey: `${manifest.ampId}::::{}`,
          activationReason: evalResult.reason,
        });
      }
    } else {
      if (!hasExplicit) {
        dormantEntries.push({
          ampId: manifest.ampId,
          manifest,
          stage: manifest.stage,
          order: manifest.order,
          source: 'DORMANT',
          status: 'SKIPPED',
          skipReason: evalResult.reason,
        });
      }
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
