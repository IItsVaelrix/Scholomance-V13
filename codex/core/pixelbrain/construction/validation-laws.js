/**
 * Validation laws — post-solve geometric invariant checks.
 * PDR §3: closure, self-intersection, winding, curvature, connectivity.
 */

import { dist, findSelfIntersections, windingDirection } from './geometry-utils.js';

const TOLERANCE = 0.01;

/**
 * Validate solved parts against the construction's validation laws.
 *
 * @param {Record<string, SolvedPart>} parts
 * @param {object} laws - ValidationLaws from the construction IR
 * @returns {{ passed: boolean, checks: Array, failures: Array }}
 */
export function validateConstruction(parts, laws) {
  const checks = [];
  const failures = [];

  // ── Closure ─────────────────────────────────────────────────────────
  for (const partId of (laws.closedParts || [])) {
    const part = parts[partId];
    if (!part) {
      checks.push({ law: 'closure', passed: false, detail: `Part "${partId}" not found` });
      failures.push({ constraint: { kind: 'closure', part: partId }, reason: 'Part not found' });
      continue;
    }
    const contour = part.closedContour || part.spine;
    if (!contour || contour.length < 3) {
      checks.push({ law: 'closure', passed: false, detail: `Part "${partId}" has < 3 points` });
      failures.push({ constraint: { kind: 'closure', part: partId }, reason: 'Too few points' });
      continue;
    }
    const first = contour[0];
    const last = contour[contour.length - 1];
    const gap = dist(first, last);
    const passed = gap <= TOLERANCE;
    checks.push({
      law: 'closure',
      passed,
      detail: `Part "${partId}": gap=${gap.toFixed(4)} (tol=${TOLERANCE})`,
    });
    if (!passed) {
      failures.push({
        constraint: { kind: 'closure', part: partId },
        reason: `Closure gap ${gap.toFixed(4)} exceeds tolerance ${TOLERANCE}`,
      });
    }
  }

  // ── Self-intersection ───────────────────────────────────────────────
  if (laws.forbidSelfIntersections) {
    for (const [partId, part] of Object.entries(parts)) {
      const contour = part.closedContour || part.spine;
      if (!contour || contour.length < 4) continue;
      const isClosed = !!part.closedContour;
      const hits = findSelfIntersections(contour, isClosed);
      const passed = hits.length === 0;
      checks.push({
        law: 'no-self-intersection',
        passed,
        detail: `Part "${partId}": ${hits.length} intersections`,
      });
      if (!passed) {
        failures.push({
          constraint: { kind: 'no-self-intersection', part: partId },
          reason: `${hits.length} self-intersections found`,
        });
      }
    }
  }

  // ── Consistent winding ──────────────────────────────────────────────
  if (laws.consistentWinding) {
    for (const [partId, part] of Object.entries(parts)) {
      if (!part.closedContour || part.closedContour.length < 3) continue;
      const winding = windingDirection(part.closedContour);
      const passed = winding === laws.consistentWinding;
      checks.push({
        law: 'consistent-winding',
        passed,
        detail: `Part "${partId}": ${winding} (expected ${laws.consistentWinding})`,
      });
      if (!passed) {
        failures.push({
          constraint: { kind: 'consistent-winding', part: partId },
          reason: `Winding is ${winding}, expected ${laws.consistentWinding}`,
        });
      }
    }
  }

  // ── Minimum curvature radius ────────────────────────────────────────
  if (typeof laws.minimumCurvatureRadius === 'number' && laws.minimumCurvatureRadius > 0) {
    for (const [partId, part] of Object.entries(parts)) {
      const curvatures = part.curvature || [];
      const maxK = Math.max(...curvatures, 0);
      const minRadius = maxK > 1e-9 ? 1 / maxK : Infinity;
      const passed = minRadius >= laws.minimumCurvatureRadius;
      checks.push({
        law: 'minimum-curvature-radius',
        passed,
        detail: `Part "${partId}": minRadius=${minRadius === Infinity ? '∞' : minRadius.toFixed(3)} (min=${laws.minimumCurvatureRadius})`,
      });
      if (!passed) {
        failures.push({
          constraint: { kind: 'minimum-curvature-radius', part: partId },
          reason: `Curvature radius ${minRadius.toFixed(3)} < ${laws.minimumCurvatureRadius}`,
        });
      }
    }
  }

  // ── Connected assembly ──────────────────────────────────────────────
  if (laws.requireConnectedAssembly) {
    const partIds = Object.keys(parts);
    if (partIds.length > 1) {
      // Build adjacency using the same explicit geometric contact tolerance as
      // the connected constraint. No two-cell proximity shortcut.
      const connectionTolerance = laws.connectionTolerance ?? TOLERANCE;
      const adj = new Map(partIds.map(id => [id, new Set()]));

      for (let i = 0; i < partIds.length; i++) {
        for (let j = i + 1; j < partIds.length; j++) {
          const ci = parts[partIds[i]].closedContour || parts[partIds[i]].spine || [];
          const cj = parts[partIds[j]].closedContour || parts[partIds[j]].spine || [];
          let connected = false;
          for (const pi of ci) {
            for (const pj of cj) {
              if (dist(pi, pj) <= connectionTolerance) { connected = true; break; }
            }
            if (connected) break;
          }
          if (connected) {
            adj.get(partIds[i]).add(partIds[j]);
            adj.get(partIds[j]).add(partIds[i]);
          }
        }
      }

      // BFS from first part
      const visited = new Set([partIds[0]]);
      const queue = [partIds[0]];
      while (queue.length > 0) {
        const current = queue.shift();
        for (const neighbor of adj.get(current)) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }

      const passed = visited.size === partIds.length;
      checks.push({
        law: 'connected-assembly',
        passed,
        detail: `${visited.size}/${partIds.length} parts connected`,
      });
      if (!passed) {
        const disconnected = partIds.filter(id => !visited.has(id));
        failures.push({
          constraint: { kind: 'connected-assembly' },
          reason: `Disconnected parts: ${disconnected.join(', ')}`,
        });
      }
    } else {
      checks.push({ law: 'connected-assembly', passed: true, detail: 'Single part' });
    }
  }

  return {
    passed: failures.length === 0,
    checks,
    failures,
  };
}
