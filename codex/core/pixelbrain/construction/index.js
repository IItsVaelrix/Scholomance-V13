/**
 * Construction module barrel export.
 * PB-GEOMETRY-CONSTRUCTION-v1
 */

export {
  CONSTRUCTION_CONTRACT,
  CONSTRUCTION_VERSION,
  SOLVER_VERSION,
  createConstruction,
  validateConstructionSpec,
  computeConstructionChecksum,
  canonicalConstructionStringify,
  deepCloneAndFreeze,
  quantize,
  quantizePoint,
} from './construction-schema.js';

export { constructionError } from './construction-error.js';
export {
  CONSTRAINT_KINDS,
  MAX_CANVAS_DIMENSION,
  PRIMITIVE_KINDS,
  assertValidConstructionSpec,
  collectConstructionIssues,
  computePartDependencies,
} from './construction-validation.js';

export {
  resolveProportion,
  resolveRatioSpec,
  PROPORTION_CONSTANTS,
} from './proportion-laws.js';

export { solve, trySolve } from './solver-orchestrator.js';
export { solveConstraints } from './constraint-solver.js';
export { validateConstruction } from './validation-laws.js';

// Constructors
export { solveEllipse } from './constructors/ellipse.js';
export { solveConicBowl } from './constructors/conic-bowl.js';
export { solveTaperedRibbon } from './constructors/tapered-ribbon.js';
export { solveCapsule } from './constructors/capsule.js';
export { solveWidthProfileRibbon } from './constructors/width-profile-ribbon.js';
export { solveBranchGraph } from './constructors/branch-graph.js';
export { solveRadialShardCluster } from './constructors/radial-shard-cluster.js';
export { solveArchitecturalModuleStack } from './constructors/architectural-module-stack.js';
export { solveOffsetContour } from './constructors/offset-contour.js';
export { solveRoundedPolygon } from './constructors/rounded-polygon.js';
export { solveBezierChain } from './constructors/bezier-chain.js';

// Geometry utilities
export {
  q, qp, dist, lerp, normalize, perp, dot, cross,
  computeDifferentials, buildSolvedPart,
  findSelfIntersections, windingDirection, pointInPolygon,
  centroid, signedArea, segmentIntersection,
} from './geometry-utils.js';

// Controlled modifiers (Phase 6)
export { applyControlledChaikin, offsetFromCenterline } from './modifiers.js';
