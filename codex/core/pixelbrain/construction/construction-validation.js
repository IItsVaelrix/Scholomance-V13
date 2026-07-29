import { constructionError } from './construction-error.js';

export const MAX_CANVAS_DIMENSION = 256;

export const PRIMITIVE_KINDS = Object.freeze([
  'ellipse',
  'conic-bowl',
  'tapered-ribbon',
  'capsule',
  'width-profile-ribbon',
  'branch-graph',
  'radial-shard-cluster',
  'architectural-module-stack',
  'offset-contour',
  'rounded-polygon',
  'bezier-chain',
]);

export const CONSTRAINT_KINDS = Object.freeze([
  'coaxial',
  'tangent',
  'coincident',
  'connected',
  'concentric',
  'parallel',
  'perpendicular',
  'symmetric',
  'mirror-symmetry',
  'contained',
  'equal-length',
  'ratio',
  'minimum-distance',
  'maximum-curvature',
  'monotonic-taper',
]);

const PRIMITIVE_KIND_SET = new Set(PRIMITIVE_KINDS);
const CONSTRAINT_KIND_SET = new Set(CONSTRAINT_KINDS);
const WINDING_DIRECTIONS = new Set(['clockwise', 'counterclockwise']);
const TAPER_DIRECTIONS = new Set(['increasing', 'decreasing']);

const NAMED_POINTS_BY_KIND = Object.freeze({
  ellipse: Object.freeze(['center', 'topCenter', 'bottomCenter', 'left', 'right']),
  'conic-bowl': Object.freeze(['topCenter', 'bottomCenter', 'left', 'right', 'center']),
  'tapered-ribbon': Object.freeze([
    'start', 'end', 'startLeft', 'startRight', 'endLeft', 'endRight', 'center',
  ]),
  capsule: Object.freeze([
    'start', 'end', 'center', 'topCenter', 'bottomCenter', 'left', 'right',
  ]),
  'width-profile-ribbon': Object.freeze([
    'start', 'end', 'center', 'startLeft', 'startRight', 'endLeft', 'endRight',
  ]),
  'branch-graph': Object.freeze(['root', 'tip', 'center']),
  'radial-shard-cluster': Object.freeze(['center', 'topShard']),
  'architectural-module-stack': Object.freeze(['base', 'top', 'center']),
  'offset-contour': Object.freeze(['center']),
  'rounded-polygon': Object.freeze(['center']),
  'bezier-chain': Object.freeze(['start', 'end', 'center']),
});

function issue(issues, category, reason, context = {}) {
  issues.push({ category, reason, context });
}

function requireFinite(value, field, issues) {
  if (!Number.isFinite(value)) {
    issue(issues, 'RANGE', `${field} must be finite`, { field, value: String(value) });
    return false;
  }
  return true;
}

function requirePositive(value, field, issues) {
  if (!requireFinite(value, field, issues)) return false;
  if (value <= 0) {
    issue(issues, 'RANGE', `${field} must be greater than zero`, { field, value });
    return false;
  }
  return true;
}

function requireNonNegative(value, field, issues) {
  if (!requireFinite(value, field, issues)) return false;
  if (value < 0) {
    issue(issues, 'RANGE', `${field} must be non-negative`, { field, value });
    return false;
  }
  return true;
}

function requirePositiveInteger(value, field, issues) {
  if (!Number.isInteger(value) || value <= 0) {
    issue(issues, 'RANGE', `${field} must be a positive integer`, { field, value });
    return false;
  }
  return true;
}

function requireArray(value, field, minimumLength, issues) {
  if (!Array.isArray(value) || value.length < minimumLength) {
    issue(issues, 'VALUE', `${field} must contain at least ${minimumLength} entries`, {
      field,
      actualLength: Array.isArray(value) ? value.length : null,
    });
    return false;
  }
  return true;
}

function requireAnchorRef(value, field, issues) {
  if (!value || typeof value !== 'object' || typeof value.anchor !== 'string' || !value.anchor) {
    issue(issues, 'VALUE', `${field} must be an AnchorRef`, { field });
    return false;
  }
  if (value.offset !== undefined) {
    if (!Array.isArray(value.offset) || value.offset.length !== 2) {
      issue(issues, 'VALUE', `${field}.offset must be a two-number tuple`, { field });
      return false;
    }
    requireFinite(value.offset[0], `${field}.offset[0]`, issues);
    requireFinite(value.offset[1], `${field}.offset[1]`, issues);
  }
  return true;
}

function requirePartPointRef(value, field, issues) {
  if (
    !value
    || typeof value !== 'object'
    || typeof value.ref !== 'string'
    || !value.ref
    || typeof value.point !== 'string'
    || !value.point
  ) {
    issue(issues, 'VALUE', `${field} must be a PartPointRef`, { field });
    return false;
  }
  return true;
}

function requirePointRef(value, field, issues) {
  if (value?.anchor) return requireAnchorRef(value, field, issues);
  return requirePartPointRef(value, field, issues);
}

function requireRatioSpec(value, field, issues) {
  if (!value?.ratio || typeof value.ratio !== 'object') {
    issue(issues, 'VALUE', `${field} must be a RatioSpec`, { field });
    return false;
  }
  const { reference, value: ratio } = value.ratio;
  if (typeof reference === 'number') {
    requirePositive(reference, `${field}.ratio.reference`, issues);
  } else {
    requirePartPointRef(reference, `${field}.ratio.reference`, issues);
  }
  return requirePositive(ratio, `${field}.ratio.value`, issues);
}

function validateBranches(branches, depth, issues, field = 'branches') {
  if (!requireArray(branches, field, 1, issues)) return;
  if (depth > 6) {
    issue(issues, 'RANGE', 'branch depth exceeds 6', { field, depth });
    return;
  }
  branches.forEach((branch, index) => {
    if (!branch || typeof branch !== 'object') {
      issue(issues, 'VALUE', `${field}[${index}] must be an object`);
      return;
    }
    requireFinite(branch.angle ?? 0, `${field}[${index}].angle`, issues);
    requirePositive(branch.length, `${field}[${index}].length`, issues);
    if (branch.children !== undefined) {
      validateBranches(branch.children, depth + 1, issues, `${field}[${index}].children`);
    }
  });
}

const PRIMITIVE_VALIDATORS = Object.freeze({
  ellipse: (primitive, issues) => {
    requireAnchorRef(primitive.center, 'center', issues);
    requirePositive(primitive.radiusX, 'radiusX', issues);
    requirePositive(primitive.radiusY, 'radiusY', issues);
  },
  'conic-bowl': (primitive, issues) => {
    requirePartPointRef(primitive.topRef, 'topRef', issues);
    requireRatioSpec(primitive.depth, 'depth', issues);
  },
  'tapered-ribbon': (primitive, issues) => {
    requirePointRef(primitive.start, 'start', issues);
    requirePointRef(primitive.end, 'end', issues);
    requirePositive(primitive.startWidth, 'startWidth', issues);
    requirePositive(primitive.endWidth, 'endWidth', issues);
  },
  capsule: (primitive, issues) => {
    requireAnchorRef(primitive.start, 'start', issues);
    requireAnchorRef(primitive.end, 'end', issues);
    requirePositive(primitive.radius, 'radius', issues);
  },
  'width-profile-ribbon': (primitive, issues) => {
    if (requireArray(primitive.spine, 'spine', 2, issues)) {
      primitive.spine.forEach((ref, index) => requireAnchorRef(ref, `spine[${index}]`, issues));
    }
    if (requireArray(primitive.profile, 'profile', 2, issues)) {
      primitive.profile.forEach((width, index) => requirePositive(width, `profile[${index}]`, issues));
    }
  },
  'branch-graph': (primitive, issues) => {
    requireAnchorRef(primitive.root, 'root', issues);
    validateBranches(primitive.branches, 0, issues);
  },
  'radial-shard-cluster': (primitive, issues) => {
    requireAnchorRef(primitive.center, 'center', issues);
    requirePositiveInteger(primitive.count, 'count', issues);
    requireNonNegative(primitive.innerRadius, 'innerRadius', issues);
    requirePositive(primitive.outerRadius, 'outerRadius', issues);
    if (
      Number.isFinite(primitive.innerRadius)
      && Number.isFinite(primitive.outerRadius)
      && primitive.outerRadius <= primitive.innerRadius
    ) {
      issue(issues, 'RANGE', 'outerRadius must exceed innerRadius');
    }
  },
  'architectural-module-stack': (primitive, issues) => {
    if (primitive.base !== undefined) requireAnchorRef(primitive.base, 'base', issues);
    if (requireArray(primitive.modules, 'modules', 1, issues)) {
      primitive.modules.forEach((module, index) => {
        requirePositive(module?.width, `modules[${index}].width`, issues);
        requirePositive(module?.height, `modules[${index}].height`, issues);
      });
    }
  },
  'offset-contour': (primitive, issues) => {
    requirePartPointRef(primitive.source, 'source', issues);
    requirePositive(primitive.distance, 'distance', issues);
    if (primitive.side !== 1 && primitive.side !== -1) {
      issue(issues, 'VALUE', 'side must be 1 or -1');
    }
  },
  'rounded-polygon': (primitive, issues) => {
    if (requireArray(primitive.points, 'points', 3, issues)) {
      primitive.points.forEach((ref, index) => requireAnchorRef(ref, `points[${index}]`, issues));
    }
    requirePositive(primitive.cornerRadius, 'cornerRadius', issues);
  },
  'bezier-chain': (primitive, issues) => {
    if (primitive.degree !== 2 && primitive.degree !== 3) {
      issue(issues, 'VALUE', 'degree must be 2 or 3');
    }
    const degree = primitive.degree === 2 ? 2 : 3;
    if (requireArray(primitive.controlPoints, 'controlPoints', degree + 1, issues)) {
      primitive.controlPoints.forEach((ref, index) => (
        requireAnchorRef(ref, `controlPoints[${index}]`, issues)
      ));
    }
  },
});

function collectReferences(value, found = { anchors: [], parts: [] }) {
  if (!value || typeof value !== 'object') return found;
  if (typeof value.anchor === 'string') found.anchors.push(value);
  if (typeof value.ref === 'string') found.parts.push(value);
  Object.values(value).forEach(entry => collectReferences(entry, found));
  return found;
}

function namedPointIsLegal(part, point) {
  const allowed = NAMED_POINTS_BY_KIND[part.primitive.kind] ?? [];
  if (allowed.includes(point)) return true;
  if (part.primitive.kind === 'rounded-polygon' && /^vertex\d+$/.test(point)) {
    return Number(point.slice(6)) < part.primitive.points.length;
  }
  if (part.primitive.kind === 'architectural-module-stack') {
    return part.primitive.modules.some(module => (
      point === `${module.label}.center` || point === `${module.label}.top`
    ));
  }
  return false;
}

export function computePartDependencies(parts) {
  const ids = new Set(parts.map(part => part.id));
  const dependencies = new Map(parts.map(part => [part.id, new Set()]));
  parts.forEach(part => {
    const references = collectReferences(part.primitive);
    references.parts.forEach(ref => {
      if (ids.has(ref.ref)) dependencies.get(part.id).add(ref.ref);
    });
  });
  return dependencies;
}

function validateAcyclic(parts, issues) {
  const dependencies = computePartDependencies(parts);
  const resolved = new Set();
  const remaining = new Set(parts.map(part => part.id));
  while (remaining.size > 0) {
    const ready = [...remaining].filter(id => (
      [...dependencies.get(id)].every(dependency => resolved.has(dependency))
    ));
    if (ready.length === 0) {
      issue(issues, 'STATE', 'circular part dependency', { parts: [...remaining] });
      return;
    }
    ready.forEach(id => {
      remaining.delete(id);
      resolved.add(id);
    });
  }
}

function requirePartId(value, field, partById, issues) {
  if (typeof value !== 'string' || !value) {
    issue(issues, 'VALUE', `${field} must be a part id`, { field });
  } else if (!partById.has(value)) {
    issue(issues, 'STATE', `${field} references unknown part "${value}"`, { field, value });
  }
}

function requireTolerance(value, field, issues) {
  if (value !== undefined) requireNonNegative(value, field, issues);
}

function validateConstraint(constraint, index, partById, anchors, issues) {
  const field = `constraints[${index}]`;
  if (!constraint || typeof constraint !== 'object') {
    issue(issues, 'VALUE', `${field} must be an object`);
    return;
  }
  if (!CONSTRAINT_KIND_SET.has(constraint.kind)) {
    issue(issues, 'VALUE', `unknown constraint kind "${constraint.kind}"`);
    return;
  }

  const twoParts = () => {
    requirePartId(constraint.a, `${field}.a`, partById, issues);
    requirePartId(constraint.b, `${field}.b`, partById, issues);
    requireTolerance(constraint.tolerance, `${field}.tolerance`, issues);
  };

  switch (constraint.kind) {
    case 'coaxial':
      if (requireArray(constraint.parts, `${field}.parts`, 2, issues)) {
        constraint.parts.forEach((id, partIndex) => (
          requirePartId(id, `${field}.parts[${partIndex}]`, partById, issues)
        ));
      }
      requireTolerance(constraint.tolerance, `${field}.tolerance`, issues);
      break;
    case 'tangent':
    case 'coincident':
      requirePartPointRef(constraint.a, `${field}.a`, issues);
      requirePartPointRef(constraint.b, `${field}.b`, issues);
      if (constraint.a?.ref) requirePartId(constraint.a.ref, `${field}.a.ref`, partById, issues);
      if (constraint.b?.ref) requirePartId(constraint.b.ref, `${field}.b.ref`, partById, issues);
      requireTolerance(
        constraint.kind === 'tangent' ? constraint.toleranceDegrees : constraint.tolerance,
        constraint.kind === 'tangent' ? `${field}.toleranceDegrees` : `${field}.tolerance`,
        issues,
      );
      break;
    case 'connected':
    case 'concentric':
    case 'parallel':
    case 'perpendicular':
    case 'equal-length':
      twoParts();
      break;
    case 'symmetric':
    case 'mirror-symmetry':
      requireAnchorRef(constraint.axis, `${field}.axis`, issues);
      if (constraint.axis?.anchor && !(constraint.axis.anchor in anchors)) {
        issue(issues, 'STATE', `${field}.axis references unknown anchor`, {
          anchor: constraint.axis.anchor,
        });
      }
      if (constraint.parts !== undefined) {
        if (requireArray(constraint.parts, `${field}.parts`, 1, issues)) {
          constraint.parts.forEach((id, partIndex) => (
            requirePartId(id, `${field}.parts[${partIndex}]`, partById, issues)
          ));
        }
      }
      requireTolerance(constraint.tolerance, `${field}.tolerance`, issues);
      break;
    case 'contained':
      requirePartId(constraint.inner, `${field}.inner`, partById, issues);
      requirePartId(constraint.outer, `${field}.outer`, partById, issues);
      requireTolerance(constraint.tolerance, `${field}.tolerance`, issues);
      break;
    case 'ratio':
      if (typeof constraint.a !== 'string' || !constraint.a.includes('.')) {
        issue(issues, 'VALUE', `${field}.a must be a dotted metric reference`);
      }
      if (typeof constraint.b !== 'string' || !constraint.b.includes('.')) {
        issue(issues, 'VALUE', `${field}.b must be a dotted metric reference`);
      }
      requirePositive(constraint.value, `${field}.value`, issues);
      requireTolerance(constraint.tolerance, `${field}.tolerance`, issues);
      break;
    case 'minimum-distance':
      twoParts();
      requireNonNegative(constraint.value, `${field}.value`, issues);
      break;
    case 'maximum-curvature':
      requirePartId(constraint.part, `${field}.part`, partById, issues);
      requireNonNegative(constraint.value, `${field}.value`, issues);
      requireTolerance(constraint.tolerance, `${field}.tolerance`, issues);
      break;
    case 'monotonic-taper':
      requirePartId(constraint.part, `${field}.part`, partById, issues);
      if (!TAPER_DIRECTIONS.has(constraint.direction)) {
        issue(issues, 'VALUE', `${field}.direction must be increasing or decreasing`);
      }
      requireTolerance(constraint.tolerance, `${field}.tolerance`, issues);
      break;
    default:
      break;
  }
}

function validateReferences(parts, anchors, issues) {
  const partById = new Map(parts.map(part => [part.id, part]));
  parts.forEach(part => {
    const references = collectReferences(part.primitive);
    references.anchors.forEach(ref => {
      if (!(ref.anchor in anchors)) {
        issue(issues, 'STATE', `part "${part.id}" references unknown anchor "${ref.anchor}"`, {
          part: part.id,
          anchor: ref.anchor,
        });
      }
    });
    references.parts.forEach(ref => {
      const target = partById.get(ref.ref);
      if (!target) {
        issue(issues, 'STATE', `part "${part.id}" references unknown part "${ref.ref}"`, {
          part: part.id,
          reference: ref.ref,
        });
      } else if (typeof ref.point === 'string' && !namedPointIsLegal(target, ref.point)) {
        issue(
          issues,
          'STATE',
          `part "${part.id}" references illegal point "${ref.point}" on "${ref.ref}"`,
          { part: part.id, reference: ref.ref, point: ref.point },
        );
      }
    });
  });
}

export function collectConstructionIssues(spec) {
  const issues = [];
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    issue(issues, 'VALUE', 'spec must be an object');
    return issues;
  }

  if (typeof spec.id !== 'string' || !spec.id.trim()) {
    issue(issues, 'VALUE', 'id must be a non-empty string');
  }

  if (!spec.canvas || typeof spec.canvas !== 'object') {
    issue(issues, 'VALUE', 'canvas must be an object');
  } else {
    for (const field of ['width', 'height']) {
      const value = spec.canvas[field];
      if (!Number.isInteger(value) || value <= 0 || value > MAX_CANVAS_DIMENSION) {
        issue(issues, 'RANGE', `canvas.${field} must be an integer in [1, 256]`, {
          field,
          value,
        });
      }
    }
  }

  const anchors = spec.anchors && typeof spec.anchors === 'object' && !Array.isArray(spec.anchors)
    ? spec.anchors
    : null;
  if (!anchors) {
    issue(issues, 'VALUE', 'anchors must be an object');
  } else {
    Object.entries(anchors).forEach(([name, point]) => {
      if (
        !Array.isArray(point)
        || point.length !== 2
        || !Number.isFinite(point[0])
        || !Number.isFinite(point[1])
      ) {
        issue(issues, 'RANGE', `anchor "${name}" must be a finite two-number tuple`);
      }
    });
  }

  const parts = Array.isArray(spec.parts) ? spec.parts : null;
  if (!parts) {
    issue(issues, 'VALUE', 'parts must be an array');
  } else {
    const ids = new Set();
    parts.forEach((part, index) => {
      if (!part || typeof part !== 'object') {
        issue(issues, 'VALUE', `parts[${index}] must be an object`);
        return;
      }
      if (typeof part.id !== 'string' || !part.id.trim()) {
        issue(issues, 'VALUE', `parts[${index}].id must be a non-empty string`);
      } else if (ids.has(part.id)) {
        issue(issues, 'VALUE', `duplicate part id "${part.id}"`);
      } else {
        ids.add(part.id);
      }
      const kind = part.primitive?.kind;
      if (!PRIMITIVE_KIND_SET.has(kind)) {
        issue(issues, 'VALUE', `part "${part.id}" has unknown primitive kind "${kind}"`);
      } else {
        PRIMITIVE_VALIDATORS[kind](part.primitive, issues);
      }
    });
  }

  if (!Array.isArray(spec.constraints)) {
    issue(issues, 'VALUE', 'constraints must be an array');
  }

  if (!spec.validation || typeof spec.validation !== 'object' || Array.isArray(spec.validation)) {
    issue(issues, 'VALUE', 'validation must be an object');
  } else {
    const laws = spec.validation;
    if (!Array.isArray(laws.closedParts)) {
      issue(issues, 'VALUE', 'validation.closedParts must be an array');
    }
    if (typeof laws.forbidSelfIntersections !== 'boolean') {
      issue(issues, 'VALUE', 'validation.forbidSelfIntersections must be boolean');
    }
    if (!WINDING_DIRECTIONS.has(laws.consistentWinding)) {
      issue(issues, 'VALUE', 'validation.consistentWinding must be clockwise or counterclockwise');
    }
    requireNonNegative(laws.minimumCurvatureRadius, 'validation.minimumCurvatureRadius', issues);
    if (typeof laws.requireConnectedAssembly !== 'boolean') {
      issue(issues, 'VALUE', 'validation.requireConnectedAssembly must be boolean');
    }
    if (
      laws.requireCanvasContainment !== undefined
      && typeof laws.requireCanvasContainment !== 'boolean'
    ) {
      issue(issues, 'VALUE', 'validation.requireCanvasContainment must be boolean');
    }
    requireTolerance(laws.connectionTolerance, 'validation.connectionTolerance', issues);
  }

  if (parts && anchors) {
    const partById = new Map(parts.filter(Boolean).map(part => [part.id, part]));
    validateReferences(parts, anchors, issues);
    if (Array.isArray(spec.constraints)) {
      spec.constraints.forEach((constraint, index) => (
        validateConstraint(constraint, index, partById, anchors, issues)
      ));
    }
    const closedParts = spec.validation?.closedParts;
    if (Array.isArray(closedParts)) {
      closedParts.forEach((partId, index) => (
        requirePartId(partId, `validation.closedParts[${index}]`, partById, issues)
      ));
    }
    validateAcyclic(parts, issues);
  }

  return issues;
}

export function validateConstructionSpec(spec) {
  const issues = collectConstructionIssues(spec);
  return {
    valid: issues.length === 0,
    errors: issues.map(entry => entry.reason),
  };
}

export function assertValidConstructionSpec(spec) {
  const issues = collectConstructionIssues(spec);
  if (issues.length > 0) {
    const first = issues[0];
    throw constructionError(first.category, first.reason, {
      ...first.context,
      errors: issues.map(entry => entry.reason),
    });
  }
}
