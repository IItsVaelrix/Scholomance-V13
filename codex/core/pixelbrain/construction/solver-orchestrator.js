/**
 * Solver Orchestrator — top-level solve(construction) → SolverResult.
 * PDR §3 Phase 4: solves all parts in dependency order, applies constraints,
 * runs validation laws, and returns a frozen, checksummed result.
 *
 * Deterministic: same construction + same solver version → same bytes.
 * Refusal: unsatisfiable constraints produce structured error, never silent degradation.
 */

import {
  SOLVER_VERSION,
  canonicalConstructionStringify,
  deepCloneAndFreeze,
} from './construction-schema.js';
import { solveConstraints } from './constraint-solver.js';
import { validateConstruction } from './validation-laws.js';
import { inBounds } from './geometry-utils.js';
import { constructionError } from './construction-error.js';
import { sha256Hex } from '../sha256.js';

// ── Constructor registry ──────────────────────────────────────────────
import { solveEllipse } from './constructors/ellipse.js';
import { solveConicBowl } from './constructors/conic-bowl.js';
import { solveTaperedRibbon } from './constructors/tapered-ribbon.js';
import { solveCapsule } from './constructors/capsule.js';
import { solveWidthProfileRibbon } from './constructors/width-profile-ribbon.js';
import { solveBranchGraph } from './constructors/branch-graph.js';
import { solveRadialShardCluster } from './constructors/radial-shard-cluster.js';
import { solveArchitecturalModuleStack } from './constructors/architectural-module-stack.js';
import { solveOffsetContour } from './constructors/offset-contour.js';
import { solveRoundedPolygon } from './constructors/rounded-polygon.js';
import { solveBezierChain } from './constructors/bezier-chain.js';

const CONSTRUCTORS = {
  'ellipse': solveEllipse,
  'conic-bowl': solveConicBowl,
  'tapered-ribbon': solveTaperedRibbon,
  'capsule': solveCapsule,
  'width-profile-ribbon': solveWidthProfileRibbon,
  'branch-graph': solveBranchGraph,
  'radial-shard-cluster': solveRadialShardCluster,
  'architectural-module-stack': solveArchitecturalModuleStack,
  'offset-contour': solveOffsetContour,
  'rounded-polygon': solveRoundedPolygon,
  'bezier-chain': solveBezierChain,
};

/**
 * Determine solve order via topological sort on part dependencies.
 * Parts that reference other parts (via PartRef) must be solved after their deps.
 */
function computeSolveOrder(parts) {
  const deps = new Map();
  const partIds = parts.map(p => p.id);

  for (const part of parts) {
    const prim = part.primitive;
    const partDeps = new Set();

    // Scan primitive for PartRef references
    const scan = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      if (obj.ref && partIds.includes(obj.ref)) {
        partDeps.add(obj.ref);
      }
      if (Array.isArray(obj)) {
        obj.forEach(scan);
      } else {
        Object.values(obj).forEach(scan);
      }
    };
    scan(prim);
    deps.set(part.id, partDeps);
  }

  // Kahn's algorithm
  const order = [];
  const resolved = new Set();
  const remaining = new Set(partIds);

  while (remaining.size > 0) {
    let progress = false;
    for (const id of remaining) {
      const partDeps = deps.get(id);
      const allResolved = [...partDeps].every(d => resolved.has(d));
      if (allResolved) {
        order.push(id);
        resolved.add(id);
        remaining.delete(id);
        progress = true;
      }
    }
    if (!progress) {
      // Circular dependency — refuse
      throw constructionError('STATE', 'circular part dependency', {
        parts: [...remaining],
      });
    }
  }

  return order;
}

/**
 * Compute a result checksum over the solved parts.
 */
function computeResultChecksum(constructionId, parts) {
  const canonical = canonicalConstructionStringify({
    constructionId,
    solverVersion: SOLVER_VERSION,
    parts,
  });
  return `sha256-canonical-v1:${sha256Hex(canonical)}`;
}

function solvedPartPoints(part) {
  return [
    ...(part.spine || []),
    ...(part.leftBank || []),
    ...(part.rightBank || []),
    ...(part.closedContour || []),
    ...Object.values(part.namedPoints || {}),
  ];
}

function assertCanvasContainment(parts, canvas) {
  for (const [partId, part] of Object.entries(parts)) {
    const point = solvedPartPoints(part).find(candidate => !inBounds(candidate, canvas));
    if (point) {
      throw constructionError('COORD', 'solved geometry exceeds canvas bounds', {
        partId,
        point,
        canvas,
      });
    }
  }
}

function wrapConstructionFailure(error, reason, context = {}) {
  if (error?.name === 'BytecodeError' && /^PB-ERR-v1-/.test(error.bytecode || error.message)) {
    return error;
  }
  return constructionError('COORD', reason, {
    ...context,
    cause: error?.message || String(error),
  });
}

/**
 * Solve a construction.
 *
 * @param {object} construction - A PB-GEOMETRY-CONSTRUCTION-v1 packet
 * @returns {object} SolverResult (frozen)
 * @throws {Error} On unsatisfiable constraints or circular dependencies
 */
export function solve(construction) {
  if (!construction || construction.contract !== 'PB-GEOMETRY-CONSTRUCTION-v1') {
    throw constructionError(
      'FORMULA',
      'solve() requires a PB-GEOMETRY-CONSTRUCTION-v1 packet',
    );
  }

  const { parts: partSpecs, constraints, validation, anchors, canvas } = construction;

  // ── Step 1: Topological sort ────────────────────────────────────────
  const solveOrder = computeSolveOrder(partSpecs);

  // ── Step 2: Solve each part in dependency order ─────────────────────
  const resolvedParts = {};
  const ctx = { anchors, canvas, resolvedParts, constraints };

  for (const partId of solveOrder) {
    const spec = partSpecs.find(p => p.id === partId);
    const kind = spec.primitive.kind;
    const constructor = CONSTRUCTORS[kind];

    if (!constructor) {
      throw constructionError('FORMULA', 'unsupported construction primitive', {
        kind,
        partId,
      });
    }

    // Inject partId into spec for the constructor
    const specWithId = { ...spec.primitive, _partId: partId };
    try {
      resolvedParts[partId] = constructor(specWithId, ctx);
    } catch (error) {
      throw wrapConstructionFailure(error, 'primitive construction failed', {
        kind,
        partId,
      });
    }
  }

  // ── Step 3: Solve constraints ───────────────────────────────────────
  const constraintResult = solveConstraints(resolvedParts, constraints, anchors);

  if (validation.requireCanvasContainment) {
    assertCanvasContainment(resolvedParts, canvas);
  }

  // ── Step 4: Validate ────────────────────────────────────────────────
  const validationReport = validateConstruction(resolvedParts, validation);

  // Merge constraint failures into validation report
  const allFailures = [...validationReport.failures, ...constraintResult.failures];
  const finalReport = {
    passed: allFailures.length === 0,
    checks: validationReport.checks,
    failures: allFailures,
  };

  // ── Step 5: Deterministic refusal ───────────────────────────────────
  if (!finalReport.passed) {
    const err = constructionError('COORD', 'construction validation failed', {
      constructionId: construction.id,
      failures: allFailures,
    });
    err.validationReport = finalReport;
    err.constructionId = construction.id;
    throw err;
  }

  // ── Step 6: Build frozen result ─────────────────────────────────────
  const result = deepCloneAndFreeze({
    constructionId: construction.id,
    solverVersion: SOLVER_VERSION,
    parts: resolvedParts,
    validationReport: finalReport,
    constructionChecksum: construction.checksum,
    resultChecksum: computeResultChecksum(construction.id, resolvedParts),
  });

  return result;
}

/**
 * Solve a construction, returning null instead of throwing on failure.
 * Useful for preview/diagnostic contexts.
 */
export function trySolve(construction) {
  try {
    return { result: solve(construction), error: null };
  } catch (err) {
    return { result: null, error: err };
  }
}
