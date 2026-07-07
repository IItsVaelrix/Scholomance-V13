/**
 * semantic-unifier.js
 *
 * SemQuant — PB-Semantics unification pass (TurboQuant-inspired).
 * Takes raw IR nodes from any adapter, attaches deterministic semantic annotations,
 * emits diagnostics for semantic issues.
 *
 * Goal: Give high-level authoring ops stable meaning (role, part, material, effect,
 * provenance) before they reach deterministic raster/lowering passes.
 */

import {
  PB_SEMANTIC_SCHEMA_VERSION,
  SemanticDiagnosticCodes,
} from './semantic-types.js';

import { ROLE_ALIASES } from '../semantic-registry.js';

function normalizeToken(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_/-]/g, '');
}

function inferRoleFromText(text) {
  const normalized = normalizeToken(text);
  if (!normalized) return null;

  const parts = normalized.split(/[_/-]+/g);

  for (const part of parts) {
    if (ROLE_ALIASES[part]) {
      const canonical = ROLE_ALIASES[part];
      return {
        canonicalType: canonical,
        semanticType: part,
        confidence: part === canonical ? 1.0 : 0.86,
      };
    }
  }

  return null;
}

function createAnnotation({
  domain,
  semanticType,
  canonicalType,
  confidence,
  sourceRefs,
  notes = [],
}) {
  return {
    domain,
    semanticType,
    canonicalType,
    confidence,
    sourceRefs: Array.isArray(sourceRefs) ? [...sourceRefs] : [],
    notes: Array.isArray(notes) ? [...notes] : [],
  };
}

function inferAnnotations(node, diagnostics) {
  const annotations = [];
  const sourceRefs = node.provenance?.sourceRefs ?? [];

  // Collect candidate strings that might carry role/part/layer/op information
  // Order matters for first-match: prefer descriptive fields first
  const candidates = [
    node.payload?.layerName,
    node.payload?.id,
    node.id,
    node.payload?.role,
    node.payload?.partId,
    node.payload?.op,
  ].filter(Boolean);

  const seenRoles = new Set();

  for (const candidate of candidates) {
    const role = inferRoleFromText(candidate);
    if (role && !seenRoles.has(role.canonicalType)) {
      annotations.push(
        createAnnotation({
          domain: 'role',
          semanticType: role.semanticType,
          canonicalType: role.canonicalType,
          confidence: role.confidence,
          sourceRefs,
        })
      );
      seenRoles.add(role.canonicalType);
    }
  }

  // Explicit handling for ConstructionGuide kind (from construction adapter or SCDL)
  if (node.kind === 'ConstructionGuide' && !seenRoles.has('constructionGuide')) {
    annotations.push(
      createAnnotation({
        domain: 'role',
        semanticType: 'constructionGuide',
        canonicalType: 'constructionGuide',
        confidence: 0.98,
        sourceRefs,
      })
    );
    seenRoles.add('constructionGuide');
  }

  // Simple material inference from payload (expand later)
  if (node.payload?.material) {
    annotations.push(
      createAnnotation({
        domain: 'material',
        semanticType: normalizeToken(node.payload.material),
        canonicalType: normalizeToken(node.payload.material),
        confidence: 0.95,
        sourceRefs,
      })
    );
  }

  // Effect inference (e.g. glow, aura)
  const effectVal = node.payload?.effect || node.payload?.op;
  if (effectVal && ['glow', 'aura', 'trace'].includes(normalizeToken(effectVal))) {
    if (!annotations.some(a => a.domain === 'effect')) {
      annotations.push(
        createAnnotation({
          domain: 'effect',
          semanticType: normalizeToken(effectVal),
          canonicalType: normalizeToken(effectVal),
          confidence: 0.9,
          sourceRefs,
        })
      );
    }
  }

  // Part inference
  if (node.payload?.partId && !annotations.some(a => a.domain === 'part')) {
    annotations.push(
      createAnnotation({
        domain: 'part',
        semanticType: normalizeToken(node.payload.partId),
        canonicalType: normalizeToken(node.payload.partId),
        confidence: 0.95,
        sourceRefs,
      })
    );
  }

  // Glow / effect intent detection
  const hasGlow =
    node.payload?.op === 'glow' ||
    normalizeToken(node.payload?.effect) === 'glow' ||
    normalizeToken(node.payload?.op) === 'glow';

  const material = node.payload?.material;
  const hasExplicitMaterial = Boolean(material) && normalizeToken(material) !== 'source';

  const hasMaterialAnnotation = annotations.some((a) => a.domain === 'material' && normalizeToken(a.semanticType) !== 'source');

  if (hasGlow && !hasExplicitMaterial && !hasMaterialAnnotation) {
    diagnostics.push({
      code: SemanticDiagnosticCodes.MISSING_MATERIAL_BINDING,
      severity: 'warn',
      message:
        'Glow intent has no material binding. Defaulting may reduce visual fidelity.',
      nodeId: node.id,
      sourceRefs,
    });
  }

  return annotations;
}

function mergeAnnotations(existing = [], inferred = []) {
  const seen = new Set();

  const all = [...existing, ...inferred];

  return all.filter((annotation) => {
    const key = [
      annotation.domain,
      annotation.semanticType,
      annotation.canonicalType,
    ].join(':');

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function semanticUnifierPass(input) {
  if (!input || !Array.isArray(input.nodes)) {
    return {
      schemaVersion: PB_SEMANTIC_SCHEMA_VERSION,
      nodes: [],
      diagnostics: [],
    };
  }

  const diagnostics = [];

  const nodes = input.nodes.map((node) => {
    const inferred = inferAnnotations(node, diagnostics);

    const mergedAnnotations = mergeAnnotations(node.annotations ?? [], inferred);

    return {
      ...node,
      annotations: mergedAnnotations,
      provenance: {
        ...(node.provenance ?? {}),
        loweringSteps: [
          ...(node.provenance?.loweringSteps ?? []),
          {
            pass: 'semanticUnifierPass',
            schemaVersion: PB_SEMANTIC_SCHEMA_VERSION,
          },
        ],
      },
    };
  });

  return {
    schemaVersion: PB_SEMANTIC_SCHEMA_VERSION,
    nodes,
    diagnostics,
  };
}
