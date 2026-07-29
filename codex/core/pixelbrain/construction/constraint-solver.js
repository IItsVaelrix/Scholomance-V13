/**
 * Deterministic analytic constraint application and verification.
 *
 * Only coaxial, concentric, coincident, and connected may translate geometry.
 * Every declared constraint is verified after all translations, so a later
 * transform cannot silently invalidate an earlier relationship.
 */

import {
  centroid,
  contourCrossesBoundary,
  dist,
  dot,
  hasReflectedCounterpart,
  minimumContourDistance,
  nearestPointIndex,
  polygonContainsPoint,
  q,
} from './geometry-utils.js';

export const CONSTRAINT_TOLERANCE = 0.01;
const DEFAULT_TANGENT_DEGREES = 5;

function getContour(part) {
  return part?.closedContour || part?.spine || [];
}

function constraintTolerance(constraint) {
  return constraint.tolerance ?? CONSTRAINT_TOLERANCE;
}

function addFailure(failures, constraint, reason) {
  failures.push({ constraint, reason });
}

function partCenter(part) {
  const contour = getContour(part);
  const uniqueContour = contour.length > 1
    && dist(contour[0], contour[contour.length - 1]) <= CONSTRAINT_TOLERANCE
    ? contour.slice(0, -1)
    : contour;
  return centroid(uniqueContour);
}

function shiftPoints(points, dx, dy) {
  return points?.map(point => [q(point[0] + dx), q(point[1] + dy)]);
}

function shiftPart(part, dx, dy) {
  if (part.spine) part.spine = shiftPoints(part.spine, dx, dy);
  if (part.leftBank) part.leftBank = shiftPoints(part.leftBank, dx, dy);
  if (part.rightBank) part.rightBank = shiftPoints(part.rightBank, dx, dy);
  if (part.closedContour) part.closedContour = shiftPoints(part.closedContour, dx, dy);
  if (part.namedPoints) {
    part.namedPoints = Object.fromEntries(Object.entries(part.namedPoints).map(
      ([name, point]) => [name, [q(point[0] + dx), q(point[1] + dy)]],
    ));
  }
  if (part.branchSegments) {
    part.branchSegments = part.branchSegments.map(segment => ({
      ...segment,
      start: [q(segment.start[0] + dx), q(segment.start[1] + dy)],
      end: [q(segment.end[0] + dx), q(segment.end[1] + dy)],
    }));
  }
  if (part.shards) {
    part.shards = part.shards.map(shard => ({
      ...shard,
      triangle: shiftPoints(shard.triangle, dx, dy),
      inner: [q(shard.inner[0] + dx), q(shard.inner[1] + dy)],
      outer: [q(shard.outer[0] + dx), q(shard.outer[1] + dy)],
    }));
  }
  if (part.modules) {
    part.modules = part.modules.map(module => ({
      ...module,
      topLeft: [q(module.topLeft[0] + dx), q(module.topLeft[1] + dy)],
      topRight: [q(module.topRight[0] + dx), q(module.topRight[1] + dy)],
      bottomLeft: [q(module.bottomLeft[0] + dx), q(module.bottomLeft[1] + dy)],
      bottomRight: [q(module.bottomRight[0] + dx), q(module.bottomRight[1] + dy)],
      center: [q(module.center[0] + dx), q(module.center[1] + dy)],
    }));
  }
}

function resolvePartPoint(parts, reference) {
  return parts[reference?.ref]?.namedPoints?.[reference?.point] ?? null;
}

function middleTangent(part) {
  if (!part?.tangents?.length) return null;
  return part.tangents[Math.floor(part.tangents.length / 2)];
}

function namedTangent(part, pointName) {
  const namedPoint = part?.namedPoints?.[pointName];
  const contour = getContour(part);
  if (!namedPoint || contour.length === 0 || !part?.tangents?.length) return null;
  const index = nearestPointIndex(contour, namedPoint);
  return index < 0 ? null : part.tangents[Math.min(index, part.tangents.length - 1)];
}

function resolveMetric(parts, reference) {
  if (typeof reference !== 'string') return null;
  const separator = reference.indexOf('.');
  if (separator <= 0 || separator === reference.length - 1) return null;
  const part = parts[reference.slice(0, separator)];
  if (!part) return null;
  const path = reference.slice(separator + 1).split('.');
  let value = path[0] in (part.measurements ?? {})
    ? part.measurements[path.shift()]
    : part[path.shift()];
  for (const segment of path) value = value?.[segment];
  return Number.isFinite(value) ? value : null;
}

/**
 * Apply the four deterministic translation classes.
 * Structural reference failures are reported during the verification pass.
 */
export function applyTransformConstraints(parts, constraints) {
  for (const constraint of constraints) {
    switch (constraint.kind) {
      case 'coaxial': {
        const partList = constraint.parts?.map(id => parts[id]);
        if (!partList?.every(Boolean) || partList.length < 2) break;
        const targetX = partCenter(partList[0])[0];
        partList.slice(1).forEach(part => {
          const dx = targetX - partCenter(part)[0];
          if (Math.abs(dx) > constraintTolerance(constraint)) shiftPart(part, dx, 0);
        });
        break;
      }
      case 'concentric': {
        const first = parts[constraint.a];
        const second = parts[constraint.b];
        if (!first || !second) break;
        const target = partCenter(first);
        const current = partCenter(second);
        shiftPart(second, target[0] - current[0], target[1] - current[1]);
        break;
      }
      case 'coincident': {
        const first = resolvePartPoint(parts, constraint.a);
        const secondPart = parts[constraint.b?.ref];
        const second = resolvePartPoint(parts, constraint.b);
        if (!first || !secondPart || !second) break;
        shiftPart(secondPart, first[0] - second[0], first[1] - second[1]);
        break;
      }
      case 'connected': {
        const first = parts[constraint.a];
        const second = parts[constraint.b];
        const firstContour = getContour(first);
        const secondContour = getContour(second);
        if (firstContour.length === 0 || secondContour.length === 0) break;
        let minimum = Infinity;
        let closestFirst = null;
        let closestSecond = null;
        for (const firstPoint of firstContour) {
          for (const secondPoint of secondContour) {
            const candidate = dist(firstPoint, secondPoint);
            if (candidate < minimum) {
              minimum = candidate;
              closestFirst = firstPoint;
              closestSecond = secondPoint;
            }
          }
        }
        if (minimum > constraintTolerance(constraint)) {
          shiftPart(
            second,
            closestFirst[0] - closestSecond[0],
            closestFirst[1] - closestSecond[1],
          );
        }
        break;
      }
      default:
        break;
    }
  }
}

function verifyTwoParts(parts, constraint, failures) {
  const first = parts[constraint.a];
  const second = parts[constraint.b];
  if (!first || !second) {
    addFailure(
      failures,
      constraint,
      `Unknown part reference "${!first ? constraint.a : constraint.b}"`,
    );
    return null;
  }
  return [first, second];
}

/** Verify all fifteen constraint kinds without mutating solved geometry. */
export function verifyConstraints(parts, constraints, anchors = {}) {
  const failures = [];

  for (const constraint of constraints) {
    const tolerance = constraintTolerance(constraint);
    switch (constraint.kind) {
      case 'coaxial': {
        const partList = constraint.parts?.map(id => parts[id]);
        if (!partList?.every(Boolean) || partList.length < 2) {
          addFailure(failures, constraint, 'Coaxial constraint has an unknown part');
          break;
        }
        const targetX = partCenter(partList[0])[0];
        if (partList.slice(1).some(part => Math.abs(partCenter(part)[0] - targetX) > tolerance)) {
          addFailure(failures, constraint, 'Coaxial centers differ after transforms');
        }
        break;
      }
      case 'concentric': {
        const pair = verifyTwoParts(parts, constraint, failures);
        if (!pair) break;
        if (dist(partCenter(pair[0]), partCenter(pair[1])) > tolerance) {
          addFailure(failures, constraint, 'Concentric centers differ after transforms');
        }
        break;
      }
      case 'coincident': {
        const first = resolvePartPoint(parts, constraint.a);
        const second = resolvePartPoint(parts, constraint.b);
        if (!first || !second) {
          addFailure(failures, constraint, 'Coincident constraint has an unknown named point');
        } else if (dist(first, second) > tolerance) {
          addFailure(failures, constraint, 'Coincident named points differ after transforms');
        }
        break;
      }
      case 'connected': {
        const pair = verifyTwoParts(parts, constraint, failures);
        if (!pair) break;
        const actual = minimumContourDistance(getContour(pair[0]), getContour(pair[1]));
        if (actual > tolerance) {
          addFailure(
            failures,
            constraint,
            `Connection distance ${q(actual)} exceeds tolerance ${tolerance}`,
          );
        }
        break;
      }
      case 'tangent': {
        const firstPart = parts[constraint.a?.ref];
        const secondPart = parts[constraint.b?.ref];
        const first = namedTangent(firstPart, constraint.a?.point);
        const second = namedTangent(secondPart, constraint.b?.point);
        if (!first || !second) {
          addFailure(failures, constraint, 'Tangent constraint has an unknown named point');
          break;
        }
        const cosine = Math.min(1, Math.abs(dot(first, second)));
        const degrees = Math.acos(cosine) * 180 / Math.PI;
        if (degrees > (constraint.toleranceDegrees ?? DEFAULT_TANGENT_DEGREES)) {
          addFailure(
            failures,
            constraint,
            `Tangent deviation ${degrees.toFixed(1)}° exceeds ${constraint.toleranceDegrees ?? DEFAULT_TANGENT_DEGREES}°`,
          );
        }
        break;
      }
      case 'parallel':
      case 'perpendicular': {
        const pair = verifyTwoParts(parts, constraint, failures);
        if (!pair) break;
        const first = middleTangent(pair[0]);
        const second = middleTangent(pair[1]);
        if (!first || !second) {
          addFailure(failures, constraint, `${constraint.kind} requires tangent data`);
          break;
        }
        const cosine = Math.abs(dot(first, second));
        const passed = constraint.kind === 'parallel'
          ? Math.abs(1 - cosine) <= tolerance
          : cosine <= tolerance;
        if (!passed) addFailure(failures, constraint, `Parts are not ${constraint.kind}`);
        break;
      }
      case 'symmetric':
      case 'mirror-symmetry': {
        const axis = anchors[constraint.axis?.anchor];
        if (!axis) {
          addFailure(failures, constraint, 'Symmetry constraint has an unknown axis anchor');
          break;
        }
        const selected = constraint.parts ?? Object.keys(parts);
        for (const partId of selected) {
          const contour = getContour(parts[partId]);
          if (
            contour.length === 0
            || contour.some(point => (
              !hasReflectedCounterpart(point, contour, axis[0], tolerance)
            ))
          ) {
            addFailure(
              failures,
              constraint,
              `Part "${partId}" has no reflected counterpart within tolerance`,
            );
            break;
          }
        }
        break;
      }
      case 'contained': {
        const inner = parts[constraint.inner];
        const outer = parts[constraint.outer];
        const innerContour = getContour(inner);
        const outerContour = getContour(outer);
        if (innerContour.length === 0 || outerContour.length < 3) {
          addFailure(failures, constraint, 'Containment constraint has unusable geometry');
          break;
        }
        const outside = innerContour.find(point => (
          !polygonContainsPoint(point, outerContour, tolerance)
        ));
        if (outside) {
          addFailure(
            failures,
            constraint,
            `Part "${constraint.inner}" lies outside "${constraint.outer}" at (${q(outside[0])}, ${q(outside[1])})`,
          );
        } else if (contourCrossesBoundary(innerContour, outerContour, tolerance)) {
          addFailure(
            failures,
            constraint,
            `Part "${constraint.inner}" crosses the boundary of "${constraint.outer}"`,
          );
        }
        break;
      }
      case 'ratio': {
        const numerator = resolveMetric(parts, constraint.a);
        const denominator = resolveMetric(parts, constraint.b);
        if (numerator === null || denominator === null || Math.abs(denominator) <= tolerance) {
          addFailure(failures, constraint, 'Ratio constraint has an unresolved metric');
          break;
        }
        const actual = numerator / denominator;
        if (Math.abs(actual - constraint.value) > tolerance) {
          addFailure(
            failures,
            constraint,
            `Metric ratio ${q(actual)} differs from requested ratio ${constraint.value}`,
          );
        }
        break;
      }
      case 'equal-length': {
        const pair = verifyTwoParts(parts, constraint, failures);
        if (!pair) break;
        if (Math.abs(pair[0].arcLength - pair[1].arcLength) > tolerance) {
          addFailure(failures, constraint, 'Part arc lengths are not equal');
        }
        break;
      }
      case 'minimum-distance': {
        const pair = verifyTwoParts(parts, constraint, failures);
        if (!pair) break;
        const actual = minimumContourDistance(getContour(pair[0]), getContour(pair[1]));
        if (actual < constraint.value - tolerance) {
          addFailure(
            failures,
            constraint,
            `Minimum distance ${constraint.value} violated by ${q(actual)}`,
          );
        }
        break;
      }
      case 'maximum-curvature': {
        const part = parts[constraint.part];
        if (!part) {
          addFailure(failures, constraint, `Unknown part "${constraint.part}"`);
          break;
        }
        const actual = Math.max(...(part.curvature ?? [0]));
        if (actual > constraint.value + tolerance) {
          addFailure(
            failures,
            constraint,
            `Maximum curvature ${q(actual)} exceeds ${constraint.value}`,
          );
        }
        break;
      }
      case 'monotonic-taper': {
        const part = parts[constraint.part];
        if (!part?.leftBank || !part?.rightBank) {
          addFailure(failures, constraint, 'Monotonic taper requires both banks');
          break;
        }
        const widths = part.leftBank.map((point, index) => dist(point, part.rightBank[index]));
        for (let index = 1; index < widths.length; index += 1) {
          const violates = constraint.direction === 'decreasing'
            ? widths[index] > widths[index - 1] + tolerance
            : widths[index] < widths[index - 1] - tolerance;
          if (violates) {
            addFailure(
              failures,
              constraint,
              `Width violates ${constraint.direction} taper at index ${index}`,
            );
            break;
          }
        }
        break;
      }
      default:
        addFailure(failures, constraint, `Unknown constraint kind "${constraint.kind}"`);
        break;
    }
  }
  return failures;
}

export function solveConstraints(parts, constraints, anchors = {}) {
  applyTransformConstraints(parts, constraints, anchors);
  return { failures: verifyConstraints(parts, constraints, anchors) };
}
