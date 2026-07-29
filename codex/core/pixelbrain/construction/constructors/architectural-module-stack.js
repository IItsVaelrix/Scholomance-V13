/**
 * Architectural-module-stack constructor — stacked rectangular modules.
 * PDR §3: { kind:'architectural-module-stack', modules: ModuleSpec[] }
 * Each module: { width, height, label? }
 */

import { buildSolvedPart } from '../geometry-utils.js';

/**
 * Solve an architectural-module-stack primitive.
 * Modules are stacked vertically from a base anchor, centered horizontally.
 */
export function solveArchitecturalModuleStack(spec, ctx) {
  const modules = spec.modules;
  if (!Array.isArray(modules) || modules.length === 0) {
    throw new Error('ArchitecturalModuleStack: modules must be a non-empty array');
  }

  // Base anchor: first module's bottom-center
  const baseRef = spec.base || { anchor: 'origin' };
  const baseAnchor = ctx.anchors[baseRef.anchor] || [0, 0];
  const baseX = baseAnchor[0] + (baseRef.offset?.[0] ?? 0);
  const baseY = baseAnchor[1] + (baseRef.offset?.[1] ?? 0);

  const solvedModules = [];
  let currentY = baseY;
  const spine = [];

  for (const mod of modules) {
    const w = mod.width;
    const h = mod.height;
    const top = currentY - h; // stack upward (negative y)

    const rect = {
      label: mod.label || `module-${solvedModules.length}`,
      width: w,
      height: h,
      topLeft: [baseX - w / 2, top],
      topRight: [baseX + w / 2, top],
      bottomLeft: [baseX - w / 2, currentY],
      bottomRight: [baseX + w / 2, currentY],
      center: [baseX, top + h / 2],
    };

    solvedModules.push(rect);
    spine.push([baseX, top + h / 2]);
    currentY = top;
  }

  const namedPoints = {
    base: [baseX, baseY],
    top: [baseX, currentY],
    center: [baseX, (baseY + currentY) / 2],
  };

  // Add per-module named points
  for (const mod of solvedModules) {
    namedPoints[`${mod.label}.center`] = mod.center;
    namedPoints[`${mod.label}.top`] = mod.topLeft; // approximate
  }

  const part = buildSolvedPart(spec._partId || 'architectural-module-stack', 'architectural-module-stack', {
    spine,
    namedPoints,
    closed: false,
  });

  part.modules = solvedModules;
  return part;
}
