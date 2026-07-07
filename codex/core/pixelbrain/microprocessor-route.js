import { validateSeam, validateRequiredOutputs } from './seam-contract.js';

function requiredOutputEmissionKeys(requiredOutput) {
  if (!requiredOutput) return [];
  if (requiredOutput.kind === 'partCells') return [`part.${requiredOutput.selector}.cells`, 'silhouette.partOf'];
  if (requiredOutput.kind === 'materialSlot') {
    const [partId, slot = 'fill'] = String(requiredOutput.selector || '').split('.');
    return [`material.${partId}.${slot}`, 'fills.coordinates'];
  }
  if (requiredOutput.kind === 'motifCells') return [`motif.${requiredOutput.selector}.cells`, 'motif.cells'];
  if (requiredOutput.kind === 'heraldryCells') return [`part.${requiredOutput.selector}.cells`, 'heraldry.cells'];
  if (requiredOutput.kind === 'shaderMask') return [`geometry.mask.${requiredOutput.selector}`, 'geometry.masks'];
  if (requiredOutput.kind === 'constructionAnchor') return [`construction.anchor.${requiredOutput.selector}`, 'construction.anchors'];
  return [];
}

function validateRouteRequiredEmitters(routeDefinition) {
  const emitted = new Set();
  for (const step of routeDefinition.steps || []) {
    for (const key of step.seam?.emits || []) emitted.add(key);
  }
  const failures = [];
  for (const req of routeDefinition.requiredOutputs || []) {
    const keys = requiredOutputEmissionKeys(req);
    if (!keys.some((key) => emitted.has(key))) {
      failures.push({
        code: 'PB_ROUTE_REQUIRED_OUTPUT_UNOWNED',
        route: routeDefinition.name,
        requiredOutput: req.id,
        selector: req.selector,
        message: `Required output ${req.id} has no responsible emitting processor.`,
      });
    }
  }
  return failures;
}

/**
 * Run a route's contract checks and (optionally) execute its real steps.
 *
 * The route is a *contract* on the data flow that the foundry must produce
 * outside the route. Most steps in factory grammars are contract-only: their
 * `seam` declaration is what gets validated, not their `execute` body (which
 * is omitted). A small number of steps (currently `createVolumeLiftStep`) are
 * real executors that mutate the results — they are the only reason a
 * `step.execute(results)` call exists in this module.
 *
 *   - `validateRoute` runs the contract only (ownership + seam walk +
 *     required-output validation). No step `execute` is called. Use this for
 *     test assertions on failure modes and for "would this spec produce a
 *     valid route?" checks.
 *   - `executeRoute` runs the contract *and* calls each step's `execute`
 *     body. Use this only when a real executor must run (e.g. volume lift,
 *     which produces `results.voxel.volume` consumed by the foundry).
 *
 * Both functions return `{ diagnostics, ...context }` and never throw; all
 * failures land in `diagnostics.failures` with a `PB_ROUTE_*` code.
 */
function runRoute(routeDefinition, context, { execute }) {
  const previousEmits = new Set();
  const currentMutations = new Set();

  const results = {
    diagnostics: {
      ok: true,
      route: routeDefinition.name,
      failures: [],
      steps: []
    },
    ...context
  };

  const ownershipFailures = validateRouteRequiredEmitters(routeDefinition);
  if (ownershipFailures.length) {
    results.diagnostics.ok = false;
    results.diagnostics.failures.push(...ownershipFailures);
    return results;
  }

  for (const step of routeDefinition.steps || []) {
    if (step.seam) {
      try {
        validateSeam(step.seam, previousEmits, currentMutations);
      } catch (e) {
        results.diagnostics.ok = false;
        results.diagnostics.failures.push({
          code: 'PB_ROUTE_SEAM_VIOLATION',
          route: routeDefinition.name,
          step: step.name,
          seam: step.seam.id,
          message: e.message
        });
        return results; // Fail fast on seam violations
      }
    }

    if (execute && typeof step.execute === 'function') {
      try {
        step.execute(results);
      } catch (e) {
        results.diagnostics.ok = false;
        results.diagnostics.failures.push({
          code: 'PB_ROUTE_EXECUTION_ERROR',
          route: routeDefinition.name,
          step: step.name,
          message: e.message
        });
        return results;
      }
    }
    results.diagnostics.steps.push({
      name: step.name,
      seam: step.seam?.id || null,
      ok: true,
    });
  }

  // After all steps, validate required outputs against the lattice that the
  // foundry (or, for volume lift, the route itself) has produced.
  if (routeDefinition.requiredOutputs) {
    const lattice = {
      cells: results.fills?.coordinates || results.silhouette?.cells || [],
      parts: results.spec?.parts || [],
      geometry: results.geometry || {},
      construction: results.construction || null,
    };

    const reqDiagnostics = validateRequiredOutputs(routeDefinition.requiredOutputs, lattice);
    if (!reqDiagnostics.ok) {
      results.diagnostics.ok = false;
      results.diagnostics.failures.push(...reqDiagnostics.failures.map(f => ({
        ...f,
        route: routeDefinition.name,
        step: routeDefinition.requiredOutputSteps?.[f.requiredOutput] || null,
        seam: routeDefinition.requiredOutputSeams?.[f.requiredOutput] || null,
      })));
    }
  }

  return results;
}

/**
 * Validate a route's contract without executing any step.
 * Use this for contract-level assertions (ownership, seams, required outputs).
 */
export function validateRoute(routeDefinition, context) {
  return runRoute(routeDefinition, context, { execute: false });
}

/**
 * Validate a route's contract and execute its real steps.
 * Use this only when a step's `execute` body is required (e.g. `createVolumeLiftStep`).
 */
export function executeRoute(routeDefinition, context) {
  return runRoute(routeDefinition, context, { execute: true });
}
