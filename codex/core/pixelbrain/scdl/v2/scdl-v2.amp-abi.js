/**
 * PB-AMP-ABI-v1 — The Universal AMP ABI Manifest Contract for SCDL v2.
 *
 * Every cataloged AMP must declare an immutable, versioned manifest meeting
 * this specification. It defines execution class, stage order, input/parameter
 * requirements, output type, determinism guarantees, and cost model.
 *
 * @bytecode PB-AMP-ABI-v1
 */

import { sha256Hex } from '../../sha256.js';
import { SCDL_V2_TYPES } from './scdl-v2.types.js';

export const AMP_ABI_CONTRACT = 'PB-AMP-ABI-v1';

export const AMP_EXECUTION_CLASSES = Object.freeze(['COMPILE', 'ANALYZE', 'DESCRIPTOR']);

export const AMP_STAGES = Object.freeze([
  'SOURCE_ANALYSIS',
  'CONSTRUCTION',
  'SHAPE_PRE',
  'SHAPE_POST',
  'MASK',
  'PAINT',
  'LAYER_POST',
  'PACKET_POST',
  'RENDER',
  'TIMELINE',
  'RUNTIME_DESCRIPTOR',
  'WORLD_DESCRIPTOR',
]);

export const AMP_SCOPES = Object.freeze([
  'PROGRAM',
  'ASSET',
  'SHAPE',
  'LAYER',
  'MASK',
  'TIMELINE',
]);

export const AMP_DETERMINISM_CLASSES = Object.freeze(['PURE', 'SEEDED', 'CONTEXTUAL']);

export const AMP_COST_MODELS = Object.freeze([
  'CONSTANT',
  'LINEAR_IN_CELLS',
  'QUADRATIC_IN_CELLS',
  'PER_SAMPLE',
]);

const VALID_INPUT_TYPES = Object.freeze([
  ...SCDL_V2_TYPES,
  'PACKET',
  'ASSET',
  'ANY',
]);

function isPlainObject(val) {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * Produces deterministic, canonical JSON for computing the ABI checksum.
 * Key ordering is strictly normalized to guarantee semantic identity.
 */
export function canonicalAmpAbiJSON(manifest) {
  if (!manifest || typeof manifest !== 'object') return '{}';

  const inputs = Array.isArray(manifest.inputs)
    ? [...manifest.inputs]
        .map((inp) => ({
          description: inp.description ?? '',
          name: String(inp.name),
          required: inp.required !== false,
          type: String(inp.type),
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  const parameters = Array.isArray(manifest.parameters)
    ? [...manifest.parameters]
        .map((p) => ({
          default: p.default ?? null,
          description: p.description ?? '',
          enum: Array.isArray(p.enum) ? [...p.enum].sort() : null,
          max: typeof p.max === 'number' ? p.max : null,
          min: typeof p.min === 'number' ? p.min : null,
          name: String(p.name),
          required: Boolean(p.required),
          type: String(p.type),
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  const scope = Array.isArray(manifest.scope)
    ? [...manifest.scope].sort()
    : [];

  const normalized = {
    ampId: String(manifest.ampId || ''),
    contract: AMP_ABI_CONTRACT,
    cost: {
      fixed: typeof manifest.cost?.fixed === 'number' ? manifest.cost.fixed : 0,
      model: String(manifest.cost?.model || 'CONSTANT'),
      multiplier: typeof manifest.cost?.multiplier === 'number' ? manifest.cost.multiplier : 1,
    },
    determinism: {
      class: String(manifest.determinism?.class || 'PURE'),
      seedRequired: Boolean(manifest.determinism?.seedRequired),
    },
    execution: String(manifest.execution || ''),
    inputs,
    order: Number.isInteger(manifest.order) ? manifest.order : 0,
    output: {
      description: manifest.output?.description ? String(manifest.output.description) : '',
      type: String(manifest.output?.type || ''),
    },
    parameters,
    relevance: manifest.relevance && typeof manifest.relevance === 'object'
      ? {
          conditions: Array.isArray(manifest.relevance.conditions) ? [...manifest.relevance.conditions] : [],
          pipelines: Array.isArray(manifest.relevance.pipelines) ? [...manifest.relevance.pipelines].sort() : [],
        }
      : null,
    scope,
    stage: String(manifest.stage || ''),
    version: String(manifest.version || '1.0.0'),
  };

  return JSON.stringify(normalized);
}

/**
 * Computes the 64-character hex SHA-256 checksum of an AMP ABI manifest.
 */
export function computeAmpAbiChecksum(manifest) {
  return sha256Hex(canonicalAmpAbiJSON(manifest));
}

/**
 * Validates a manifest object against PB-AMP-ABI-v1 contract laws.
 * Returns { ok: boolean, errors: string[], warnings: string[] }.
 */
export function validateAmpAbiManifest(manifest) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(manifest)) {
    return { ok: false, errors: ['Manifest must be a non-null object.'], warnings };
  }

  if (manifest.contract !== AMP_ABI_CONTRACT) {
    errors.push(`contract: must be exactly '${AMP_ABI_CONTRACT}' (received '${manifest.contract}')`);
  }

  if (typeof manifest.ampId !== 'string' || !/^[a-z0-9]+(\.[a-z0-9_-]+)+$/.test(manifest.ampId)) {
    errors.push(`ampId: must be a qualified lower-case dot-separated string (e.g. 'pixelbrain.facet'), received '${manifest.ampId}'`);
  }

  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    errors.push(`version: must be a semver string (e.g. '1.0.0'), received '${manifest.version}'`);
  }

  if (!AMP_EXECUTION_CLASSES.includes(manifest.execution)) {
    errors.push(`execution: must be one of [${AMP_EXECUTION_CLASSES.join(', ')}], received '${manifest.execution}'`);
  }

  if (!AMP_STAGES.includes(manifest.stage)) {
    errors.push(`stage: must be one of the 12 fixed stages [${AMP_STAGES.join(', ')}], received '${manifest.stage}'`);
  }

  if (!Array.isArray(manifest.scope) || manifest.scope.length === 0) {
    errors.push('scope: must be a non-empty array of scope names');
  } else {
    for (const s of manifest.scope) {
      if (!AMP_SCOPES.includes(s)) {
        errors.push(`scope: invalid scope '${s}' (valid: ${AMP_SCOPES.join(', ')})`);
      }
    }
  }

  if (!Array.isArray(manifest.inputs)) {
    errors.push('inputs: must be an array');
  } else {
    const inputNames = new Set();
    for (let i = 0; i < manifest.inputs.length; i++) {
      const inp = manifest.inputs[i];
      const pfx = `inputs[${i}]`;
      if (!isPlainObject(inp)) {
        errors.push(`${pfx}: must be an object`);
        continue;
      }
      if (typeof inp.name !== 'string' || !inp.name) {
        errors.push(`${pfx}.name: must be a non-empty string`);
      } else if (inputNames.has(inp.name)) {
        errors.push(`${pfx}.name: duplicate input '${inp.name}'`);
      } else {
        inputNames.add(inp.name);
      }
      if (typeof inp.type !== 'string' || !VALID_INPUT_TYPES.includes(inp.type)) {
        errors.push(`${pfx}.type: unknown input type '${inp.type}'`);
      }
    }
  }

  if (!Array.isArray(manifest.parameters)) {
    errors.push('parameters: must be an array');
  } else {
    const paramNames = new Set();
    for (let i = 0; i < manifest.parameters.length; i++) {
      const p = manifest.parameters[i];
      const pfx = `parameters[${i}]`;
      if (!isPlainObject(p)) {
        errors.push(`${pfx}: must be an object`);
        continue;
      }
      if (typeof p.name !== 'string' || !p.name) {
        errors.push(`${pfx}.name: must be a non-empty string`);
      } else if (paramNames.has(p.name)) {
        errors.push(`${pfx}.name: duplicate parameter '${p.name}'`);
      } else {
        paramNames.add(p.name);
      }
      if (typeof p.type !== 'string' || !VALID_INPUT_TYPES.includes(p.type)) {
        errors.push(`${pfx}.type: unknown parameter type '${p.type}'`);
      }
      if (p.min !== undefined && typeof p.min !== 'number') {
        errors.push(`${pfx}.min: must be a number`);
      }
      if (p.max !== undefined && typeof p.max !== 'number') {
        errors.push(`${pfx}.max: must be a number`);
      }
      if (typeof p.min === 'number' && typeof p.max === 'number' && p.min > p.max) {
        errors.push(`${pfx}: min (${p.min}) cannot exceed max (${p.max})`);
      }
    }
  }

  if (!isPlainObject(manifest.output)) {
    errors.push('output: must be an object');
  } else {
    if (typeof manifest.output.type !== 'string' || !VALID_INPUT_TYPES.includes(manifest.output.type)) {
      errors.push(`output.type: unknown output type '${manifest.output?.type}'`);
    }
  }

  if (!isPlainObject(manifest.determinism)) {
    errors.push('determinism: must be an object');
  } else {
    if (!AMP_DETERMINISM_CLASSES.includes(manifest.determinism.class)) {
      errors.push(`determinism.class: must be one of [${AMP_DETERMINISM_CLASSES.join(', ')}], received '${manifest.determinism.class}'`);
    }
    if (manifest.determinism.class === 'SEEDED' && !manifest.determinism.seedRequired) {
      warnings.push('determinism: class is SEEDED but seedRequired is false');
    }
  }

  if (!isPlainObject(manifest.cost)) {
    errors.push('cost: must be an object');
  } else {
    if (!AMP_COST_MODELS.includes(manifest.cost.model)) {
      errors.push(`cost.model: must be one of [${AMP_COST_MODELS.join(', ')}], received '${manifest.cost.model}'`);
    }
    if (manifest.cost.multiplier !== undefined && (typeof manifest.cost.multiplier !== 'number' || manifest.cost.multiplier < 0)) {
      errors.push('cost.multiplier: must be a non-negative number');
    }
  }

  if (typeof manifest.order !== 'number' || !Number.isInteger(manifest.order)) {
    errors.push('order: must be an integer (conveyor-belt order within stage)');
  }

  if (manifest.execution === 'COMPILE' && (manifest.stage === 'RUNTIME_DESCRIPTOR' || manifest.stage === 'WORLD_DESCRIPTOR')) {
    errors.push(`execution COMPILE is incompatible with descriptor stage '${manifest.stage}' (must be execution 'DESCRIPTOR')`);
  }

  if (manifest.execution === 'DESCRIPTOR' && !(manifest.stage === 'RUNTIME_DESCRIPTOR' || manifest.stage === 'WORLD_DESCRIPTOR')) {
    errors.push(`execution DESCRIPTOR is only permitted in RUNTIME_DESCRIPTOR or WORLD_DESCRIPTOR stages (received '${manifest.stage}')`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
