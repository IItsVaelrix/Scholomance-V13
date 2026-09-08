/**
 * Seam Contracts and Validators
 * Defines what each microprocessor consumes, emits, mutates, and requires.
 */

export function validateSeam(spec, previousEmits, currentMutations) {
  // ensure everything consumed was emitted or is a base input
  for (const c of spec.consumes) {
    if (!previousEmits.has(c) && !isBaseInput(c)) {
      throw new Error(`Seam violation in ${spec.processor}: consumes '${c}' which was not emitted.`);
    }
  }

  // ensure everything mutated was previously emitted or is base
  if (spec.mutates) {
    for (const m of spec.mutates) {
      if (!previousEmits.has(m) && !isBaseInput(m)) {
        throw new Error(`Seam violation in ${spec.processor}: mutates '${m}' which was not emitted.`);
      }
      if (currentMutations.has(m) && !spec.mergeContract) {
        throw new Error(`Seam violation in ${spec.processor}: mutates '${m}' after a prior processor without an ordered merge contract.`);
      }
      currentMutations.add(m);
    }
  }

  for (const e of spec.emits) {
    if (previousEmits.has(e)) {
      throw new Error(`Seam violation in ${spec.processor}: emits shadow copy of '${e}' already owned elsewhere.`);
    }
    previousEmits.add(e);
  }
}

function isBaseInput(key) {
  return key.startsWith('spec.') || key.startsWith('silhouette.') || key.startsWith('construction.') || key.startsWith('template.');
}

function resolvePartField(partById, part, field, seen = new Set()) {
  if (!part) return null;
  if (part[field]) return part[field];
  if (!part.mirrorOf || seen.has(part.id)) return null;
  seen.add(part.id);
  return resolvePartField(partById, partById.get(part.mirrorOf), field, seen);
}

function countCellsForPart(cells, selector) {
  return (cells || []).filter((c) => c.partId === selector).length;
}

export function validateRequiredOutputs(requiredOutputs, lattice) {
  const diagnostics = { ok: true, failures: [] };
  const cells = lattice.cells || [];
  const partById = new Map((lattice.parts || []).map((part) => [part.id, part]));
  
  for (const req of requiredOutputs) {
    // Evaluation depends on kind. This is a simplified check.
    if (req.kind === 'partCells') {
      const partCellCount = countCellsForPart(cells, req.selector);
      if (partCellCount < (req.minCells || 1)) {
        diagnostics.failures.push({
          code: "PB_ROUTE_REQUIRED_OUTPUT_EMPTY",
          requiredOutput: req.id,
          selector: req.selector,
          message: `Required part ${req.selector} stamped ${partCellCount} cells.`
        });
        if (req.fatal) diagnostics.ok = false;
      }
    } else if (req.kind === 'materialSlot') {
       // Validate material exists
       const [partId, slot = 'fill'] = req.selector.split('.');
       const part = partById.get(partId);
       const materialSlot = resolvePartField(partById, part, slot);
       if (!part || !materialSlot?.material) {
         diagnostics.failures.push({
          code: "PB_ROUTE_REQUIRED_MATERIAL_NULL",
          requiredOutput: req.id,
          selector: req.selector,
          message: `Required material for ${req.selector} resolved null.`
         });
         if (req.fatal) diagnostics.ok = false;
       }
    } else if (req.kind === 'heraldryCells') {
       // specific heraldry validation
       const emblemCellCount = countCellsForPart(cells, req.selector);
       if (emblemCellCount < (req.minCells || 1)) {
         diagnostics.failures.push({
           code: "PB_ROUTE_REQUIRED_OUTPUT_EMPTY",
           requiredOutput: req.id,
           selector: req.selector,
           message: `Required heraldry entry ${req.selector} stamped ${emblemCellCount} cells.`
         });
         if (req.fatal) diagnostics.ok = false;
       }
    } else if (req.kind === 'motifCells') {
       // generic motif validation (holyfire-motif-amp, motif-engraver, etc.)
       const motifCellCount = countCellsForPart(cells, req.selector);
       if (motifCellCount < (req.minCells || 1)) {
         diagnostics.failures.push({
           code: "PB_ROUTE_REQUIRED_OUTPUT_EMPTY",
           requiredOutput: req.id,
           selector: req.selector,
           message: `Required motif ${req.selector} stamped ${motifCellCount} cells.`
         });
         if (req.fatal) diagnostics.ok = false;
       }
    } else if (req.kind === 'shaderMask') {
       const maskCells = lattice.geometry?.masks?.[req.selector] || [];
       if (maskCells.length < (req.minCells || 1)) {
         diagnostics.failures.push({
          code: "PB_ROUTE_REQUIRED_OUTPUT_EMPTY",
          requiredOutput: req.id,
          selector: req.selector,
          message: `Required shader target part ${req.selector} missing.`
         });
         if (req.fatal) diagnostics.ok = false;
       }
    } else if (req.kind === 'constructionAnchor') {
       const anchor = lattice.construction?.anchors?.[req.selector]
        || lattice.construction?.constructionHints?.anchors?.[req.selector]
        || lattice.construction?.hints?.anchors?.[req.selector];
       if (!anchor) {
         diagnostics.failures.push({
          code: "PB_ROUTE_REQUIRED_OUTPUT_EMPTY",
          requiredOutput: req.id,
          selector: req.selector,
          message: `Required construction anchor ${req.selector} is unbound.`
         });
         if (req.fatal) diagnostics.ok = false;
       }
    }
  }

  return diagnostics;
}
