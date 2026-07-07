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
 * Executes a deterministic sequence of microprocessors.
 */
export function executeRoute(routeDefinition, context) {
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

  for (const step of routeDefinition.steps) {
    if (step.seam) {
      try {
         validateSeam(step.seam, previousEmits, currentMutations);
      } catch (e) {
         results.diagnostics.ok = false;
         results.diagnostics.failures.push({
           code: "PB_ROUTE_SEAM_VIOLATION",
           route: routeDefinition.name,
           step: step.name,
           seam: step.seam.id,
           message: e.message
         });
         return results; // Fail fast on seam violations
      }
    }

    // Execute microprocessor
    try {
      step.execute(results);
    } catch (e) {
       results.diagnostics.ok = false;
       results.diagnostics.failures.push({
         code: "PB_ROUTE_EXECUTION_ERROR",
         route: routeDefinition.name,
         step: step.name,
         message: e.message
       });
       return results;
    }
    results.diagnostics.steps.push({
      name: step.name,
      seam: step.seam?.id || null,
      ok: true,
    });
  }

  // After all steps, validate required outputs if provided by the route or context
  if (routeDefinition.requiredOutputs) {
    // Need a unified representation of the lattice to check
    // Currently relying on results.silhouette, results.fills, etc.
    // Build a temp lattice object for checking
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
