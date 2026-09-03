/**
 * PixelBrain Edit Compiler
 * Implements the missing system for round-trip polish, deltas, semantic edits,
 * anchors, masks, constraints, and style profiles.
 *
 * Per user spec: "The Missing System: PixelBrain Edit Compiler"
 * All operations are deterministic, lattice-first, packet-based.
 * Loud failure on constraint violations.
 */

import {
  createPixelBrainAssetPacket,
  normalizePixelBrainAssetPacket,
  normalizePB_POLISH_DELTA_v1,
  POLISH_DELTA_KINDS,
} from './pixelbrain-asset-packet.js';

import { setCell, getCell } from './template-grid-engine.js'; // for some helpers

import { rehydrateVoidChestplateCells } from './void-chestplate-profile.js';

// 1. Round-Trip Lattice Importer
// Takes a polished raster (via getPixel callback for portability, no hard deps)
// and reconstructs a canonical packet.
// For the 640x800 @10x example, detects scale and grid.

export function importPolishedRasterToPacket(getPixel, options = {}) {
  const {
    sourceWidth = 640,
    sourceHeight = 800,
    gridWidth = 64,
    gridHeight = 80,
    sourceScale = null, // auto-detect if null
    parentAssetId = null,
  } = options;

  let inferredScale = sourceScale;
  if (!inferredScale) {
    // Simple nearest-neighbor scale detection: assume uniform scale, check consistency
    inferredScale = Math.round(sourceWidth / gridWidth);
    if (inferredScale < 1) inferredScale = 1;
  }

  const coordinates = [];
  const colorCounts = new Map();

  for (let gy = 0; gy < gridHeight; gy++) {
    for (let gx = 0; gx < gridWidth; gx++) {
      // Sample center of the source cell rect for quantization (robust to anti-alias edges)
      const sx = Math.floor(gx * inferredScale + inferredScale / 2);
      const sy = Math.floor(gy * inferredScale + inferredScale / 2);

      let color = null;
      if (typeof getPixel === 'function') {
        const p = getPixel(sx, sy);
        if (p && (p.a === undefined || p.a > 10)) {
          const r = Math.round(p.r || 0);
          const g = Math.round(p.g || 0);
          const b = Math.round(p.b || 0);
          color = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
        }
      }

      if (color) {
        coordinates.push({ x: gx, y: gy, color, partId: 'imported' });
        colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
      }
    }
  }

  // Inferred palettes: top colors by usage
  const sortedColors = Array.from(colorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([c]) => c);

  const palettes = sortedColors.length
    ? [{ key: 'imported', colors: sortedColors }]
    : [];

  let finalCoords = coordinates;

  // Optional semantic rehydration for known assets (e.g. void chestplate)
  if (options.rehydrate && options.assetKind === 'void.chestplate') {
    finalCoords = rehydrateVoidChestplateCells(coordinates, { width: gridWidth, height: gridHeight });
  }

  return createPixelBrainAssetPacket({
    canvas: {
      width: gridWidth,
      height: gridHeight,
      gridSize: 1,
    },
    coordinates: finalCoords,
    palettes,
    metadata: {
      source: 'polished-raster-import',
      scale: inferredScale,
      parentAssetId,
      sourceDimensions: { width: sourceWidth, height: sourceHeight },
      rehydrated: !!options.rehydrate,
    },
  });
}

// 2 & 5. Polish Delta + Constraint-Preserving Edit Operations

export function applyPolishDelta(packet, delta) {
  const normalizedDelta = normalizePB_POLISH_DELTA_v1(delta);
  let coords = [...(packet.geometry?.coordinates || packet.coordinates || [])];

  for (const op of normalizedDelta.operations) {
    const { kind, x, y, color, from, to, partId, material } = op;

    if (kind === POLISH_DELTA_KINDS.ADD_CELL) {
      const existing = coords.findIndex(c => c.x === x && c.y === y);
      if (existing >= 0) coords[existing] = { ...coords[existing], color: color || coords[existing].color, partId: partId || coords[existing].partId };
      else coords.push({ x, y, color: color || '#FFFFFF', partId: partId || 'polish' });
    } else if (kind === POLISH_DELTA_KINDS.REMOVE_CELL) {
      coords = coords.filter(c => !(c.x === x && c.y === y));
    } else if (kind === POLISH_DELTA_KINDS.RECOLOR_CELL) {
      coords = coords.map(c =>
        (c.x === x && c.y === y && (!from || c.color === from))
          ? { ...c, color: to || c.color }
          : c
      );
    } else if (kind === POLISH_DELTA_KINDS.REASSIGN_PART) {
      coords = coords.map(c =>
        (c.x === x && c.y === y) ? { ...c, partId } : c
      );
    } else if (kind === POLISH_DELTA_KINDS.PROMOTE_TO_TRIM || kind === POLISH_DELTA_KINDS.PROMOTE_TO_MOTIF) {
      coords = coords.map(c =>
        (c.x === x && c.y === y) ? { ...c, partId, role: kind === POLISH_DELTA_KINDS.PROMOTE_TO_TRIM ? 'trim' : 'motif' } : c
      );
    }
  }

  return createPixelBrainAssetPacket({
    ...packet,
    coordinates: coords,
    metadata: postForgeMetadata(
      packet,
      {
        kind: 'apply-polish-delta',
        delta: normalizedDelta.targetAssetId || 'polish-delta',
        operations: normalizedDelta.operations.length,
        // The cells touched, as data. This is the channel a hand edit should go
        // through: it lands in the provenance chain, so "authored by spec" and
        // "authored by spec plus N hand edits" stay distinguishable on the asset.
        touched: Object.freeze(normalizedDelta.operations.map(
          (op) => Object.freeze({ kind: op.kind, x: op.x, y: op.y }),
        )),
      },
      { ...packet.metadata, lastDelta: normalizedDelta.targetAssetId || 'polish-delta' },
    ),
  });
}

// Constraint validators (loud failure)
export function validatePixelBrainEdit(packet, { previousPacket = null, operation = null, constraints = {} } = {}) {
  const failures = [];
  const coords = packet.geometry?.coordinates || packet.coordinates || [];

  if (constraints.preventOutOfBounds) {
    const w = packet.canvas?.width || 64;
    const h = packet.canvas?.height || 80;
    for (const c of coords) {
      if (c.x < 0 || c.x >= w || c.y < 0 || c.y >= h) {
        failures.push({ code: 'OUT_OF_BOUNDS', cell: c });
      }
    }
  }

  if (constraints.requireMaterialAuthority && operation?.kind === 'remap-material') {
    // simplistic: ensure material is known (expand with registry in real use)
    if (!operation.material) failures.push({ code: 'NO_MATERIAL_AUTHORITY' });
  }

  if (constraints.mirrorX != null && operation?.mirror) {
    // basic symmetry check stub
    const mirrorX = constraints.mirrorX;
    // (full mirror validation would compare left/right)
  }

  return {
    ok: failures.length === 0,
    failures,
  };
}

// 5. Constraint-Preserving Edit Operations (verbs, not brushes)

/**
 * Post-forge provenance chain.
 *
 * WHY THIS EXISTS (audit 2026-09-03, DR-2026-09-03-PIXELBRAIN-UX, MAJOR #2).
 * The flagship asset is not the declarative spec alone: `forgeItemAsset` output
 * is then widened, moved and hand-dotted with literal coordinates. That is a
 * legitimate authoring choice, but the packet carried no trace of it, so every
 * consumer reading `metadata.compatibility.spec.hash` believed it was looking at
 * a pure ITEM-SPEC-v1 derivation. It was not, and nothing said so.
 *
 * The identity problem is worse than an unlisted provenance. `createPixelBrainAssetPacket`
 * honours `input.id` verbatim, and every edit here rebuilds with
 * `createPixelBrainAssetPacket({ ...packet, coordinates })`, so the pre-edit id is
 * carried across a pixel change. Measured directly, 2026-09-03: two packets with
 * different positions and different colours both returned `pbasset_e122cff3`.
 *
 * Recomputing the id on mismatch is NOT the fix, and was tried and rejected:
 * `stableId` seeds on partly unnormalized input (`source` is a string at first
 * build and an object after `normalizeSource`), so an id does not generally equal
 * the digest of its own packet. Re-hydrating a stored packet would rename it.
 *
 * So instead: `contentDigest` is recomputed from normalized pixels on every build
 * and never inherited, and every geometry-changing edit appends a link here. An
 * inherited id is then detectable as `entry.digestBefore !== packet.contentDigest`,
 * and "spec-declared" vs "spec + hand edits" is a fact on the asset rather than a
 * rumour about the script that made it.
 */
export const POSTFORGE_PROVENANCE_KEY = 'postForgeEdits';

/**
 * Build the `metadata` object for an edit's output packet, appending this edit to
 * the chain the input packet already carries.
 * @param {object} packet   the packet BEFORE this edit
 * @param {object} operation { kind, ...params }
 * @param {object} [extra]   other metadata fields this edit's output should carry
 */
export function postForgeMetadata(packet, operation, extra = {}) {
  const metadata = packet?.metadata || {};
  const compatibility = metadata?.compatibility || {};
  const prior = Array.isArray(compatibility[POSTFORGE_PROVENANCE_KEY])
    ? compatibility[POSTFORGE_PROVENANCE_KEY]
    : [];
  const { kind, ...params } = operation || { kind: 'unknown' };
  const entry = Object.freeze({
    kind,
    params: Object.freeze(params),
    idBefore: packet?.id ?? null,
    digestBefore: packet?.contentDigest ?? null,
    cellCountBefore: packet?.geometry?.coordinates?.length ?? packet?.coordinates?.length ?? 0,
  });
  return {
    ...metadata,
    ...extra,
    compatibility: {
      ...compatibility,
      [POSTFORGE_PROVENANCE_KEY]: Object.freeze([...prior, entry]),
    },
  };
}

/** True when this packet's pixels are not what its id was minted for. */
export function hasInheritedEditId(packet) {
  const edits = packet?.metadata?.compatibility?.[POSTFORGE_PROVENANCE_KEY];
  if (!Array.isArray(edits) || edits.length === 0) return false;
  const first = edits[0];
  return !!first?.digestBefore && first.digestBefore !== packet.contentDigest;
}

/**
 * One line per rejected edit, naming the cell rather than dumping it.
 *
 * `throw new Error(... + JSON.stringify(diag.failures))` printed four complete
 * cell records — 3.5 KB for a 4-pixel overflow — which is the same failure mode
 * the 2026-09-03 audit logged against the SCDL CLI's inline `PB-ERR-v1` blobs:
 * the payload buries the one fact the author needs. A rejected edit now reads
 * `OUT_OF_BOUNDS at (-1,10 left_pauldron), (64,10 right_pauldron) +2 more`.
 */
export function describeEditFailures(failures = [], limit = 4) {
  const parts = [];
  let rest = 0;
  for (const f of failures) {
    if (!f) continue;
    if (parts.length >= limit) { rest++; continue; }
    const c = f.cell;
    const where = c && Number.isFinite(c.x) && Number.isFinite(c.y)
      ? ` at (${c.x},${c.y}${c.partId ? ` ${c.partId}` : ''})`
      : '';
    parts.push(`${f.code || 'EDIT_REJECTED'}${where}`);
  }
  if (failures.length === 0) return 'unknown failure';
  return rest > 0 ? `${parts.join(', ')} +${rest} more` : parts.join(', ');
}

export function widenPauldrons(packet, amount = 2) {
  const parts = ['left_pauldron_shell', 'left_pauldron_trim', 'right_pauldron_shell', 'right_pauldron_trim', 'left_pauldron', 'right_pauldron'];
  let coords = [...(packet.geometry?.coordinates || packet.coordinates || [])];

  coords = coords.map(cell => {
    if (!parts.includes(cell.partId)) return cell;
    const dir = cell.x < (packet.canvas?.width || 64) / 2 ? -1 : 1;
    const newX = cell.x + dir * amount;
    return { ...cell, x: newX, snappedX: (cell.snappedX ?? cell.x) + dir * amount };
  });

  const next = createPixelBrainAssetPacket({
    ...packet,
    coordinates: coords,
    metadata: postForgeMetadata(packet, { kind: 'widen-part', amount, parts }),
  });
  const diag = validatePixelBrainEdit(next, { previousPacket: packet, operation: { kind: 'widen-part', amount }, constraints: { preventOutOfBounds: true } });
  if (!diag.ok) throw new Error(`widenPauldrons validation failed: ${describeEditFailures(diag.failures)}`);

  return next;
}

export function moveCore(packet, dy = 1) {
  const parts = ['sternum_core_socket', 'core_crystal'];
  let coords = [...(packet.geometry?.coordinates || packet.coordinates || [])];

  coords = coords.map(cell => {
    if (!parts.includes(cell.partId)) return cell;
    const newY = cell.y + dy;
    return { ...cell, y: newY, snappedY: (cell.snappedY ?? cell.y) + dy };
  });

  const next = createPixelBrainAssetPacket({
    ...packet,
    coordinates: coords,
    metadata: postForgeMetadata(packet, { kind: 'move-part', dy, parts }),
  });
  const diag = validatePixelBrainEdit(next, { previousPacket: packet, operation: { kind: 'move-part', dy }, constraints: { preventOutOfBounds: true } });
  if (!diag.ok) throw new Error(`moveCore validation failed: ${describeEditFailures(diag.failures)}`);

  return next;
}

export function remapTrimMaterial(packet, nextMaterial, resolveColor = (m) => '#FFD700') {
  const parts = ['left_pauldron_trim', 'right_pauldron_trim', 'collar_bridge', 'waist_guard'];
  let coords = [...(packet.geometry?.coordinates || packet.coordinates || [])];

  coords = coords.map(cell => {
    if (!parts.includes(cell.partId)) return cell;
    return { ...cell, material: nextMaterial, color: resolveColor(nextMaterial) };
  });

  return createPixelBrainAssetPacket({
    ...packet,
    coordinates: coords,
    metadata: postForgeMetadata(packet, { kind: 'remap-trim-material', material: nextMaterial, parts }),
  });
}

// 6. Region Selection Masks (attach to packet)
export function attachMasks(packet, masks = {}) {
  return createPixelBrainAssetPacket({
    ...packet,
    masks: Object.freeze(masks),
  });
}

// 4. Anchor Rig support (simple relative transform stub)
export function transformRelativeToAnchor(packet, anchor, dx = 0, dy = 0, parts = []) {
  let coords = [...(packet.geometry?.coordinates || packet.coordinates || [])];
  coords = coords.map(cell => {
    if (parts.length && !parts.includes(cell.partId)) return cell;
    return { ...cell, x: cell.x + dx, y: cell.y + dy };
  });
  return createPixelBrainAssetPacket({
    ...packet,
    coordinates: coords,
    metadata: postForgeMetadata(packet, { kind: 'transform-relative-to-anchor', anchor, dx, dy, parts }),
  });
}

// 8. Minimal PB-EDIT-SESSION implementation
export function createEditableAssetSession(basePacket, options = {}) {
  const base = normalizePixelBrainAssetPacket(basePacket);
  const session = {
    contract: 'PB-EDIT-SESSION-v1',
    version: '1.0.0',
    basePacket: base,
    currentPacket: base,
    deltas: [],
    constraints: {
      mirrorX: options.mirrorX ?? 31.5,  // use .5 for pixel-perfect center mirror on even w (e.g. 64) so 0↔63 etc.
      preservePartConnectivity: true,
      preventOutOfBounds: true,
      requireMaterialAuthority: true,
      ...options.constraints,
    },
    apply(operation) {
      let next = this.currentPacket;

      if (operation.kind === 'widen-part' && operation.partId?.includes('pauldron')) {
        next = widenPauldrons(next, operation.amount || 2);
      } else if (operation.kind === 'move-part' && operation.partId?.includes('core')) {
        next = moveCore(next, operation.dy || 0);
      } else if (operation.kind === 'remap-material') {
        next = remapTrimMaterial(next, operation.material);
      } else if (operation.kind === 'polish-delta') {
        next = applyPolishDelta(next, operation.delta);
      } else {
        // generic delta or no-op
        next = applyPolishDelta(next, { operations: [operation] });
      }

      const diagnostics = validatePixelBrainEdit(next, {
        previousPacket: this.currentPacket,
        operation,
        constraints: this.constraints,
      });
      if (!diagnostics.ok) {
        throw new Error('Edit validation failed: ' + JSON.stringify(diagnostics.failures, null, 2));
      }

      this.deltas.push(operation);
      this.currentPacket = next;
      return this;
    },
    getCurrentPacket() {
      return this.currentPacket;
    },
  };
  return session;
}

// Re-export key constants
export { POLISH_DELTA_KINDS };

// ─────────────────────────────────────────────────────────────────────────────
// Algorithmic Tuning Helpers (for feedback-driven polish passes)
// These are deterministic post-processing verbs suitable for chestplates and
// other intricate assets. They address common pixel-art quality issues.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Orphan Pixel Noise cleanup.
 * Merges isolated (orphan) pixels into their dominant neighboring color
 * unless they belong to protected geometric/intentional motifs.
 * This reduces visual noise at small scales while preserving deliberate dots,
 * crosses, and core details.
 */
export function cleanupOrphanPixels(packet, options = {}) {
  const {
    protectPartIds = ['small_cross', 'emblem', 'center_core', 'top_crystal', 'rune_channels', 'core_crystal', 'sternum_core_socket'],
    minSameNeighbors = 1, // 4-connected; 0 or 1 => candidate for cleanup
    use8ForDominant = true,
    protectIfInMotifCluster = true,
  } = options;

  let coords = [...(packet.geometry?.coordinates || packet.coordinates || [])];
  if (coords.length === 0) return packet;

  const posKey = (c) => `${c.x},${c.y}`;
  const colorMap = new Map(coords.map(c => [posKey(c), c.color]));
  const partMap = new Map(coords.map(c => [posKey(c), c.partId || '']));
  const roleMap = new Map(coords.map(c => [posKey(c), c.role || '']));

  const isProtected = (x, y) => {
    const key = `${x},${y}`;
    const pid = partMap.get(key) || '';
    if (protectPartIds.some(p => pid.includes(p))) return true;
    if (protectIfInMotifCluster && (roleMap.get(key) || '').includes('motif')) return true;
    return false;
  };

  const fourDirs = [[-1,0],[1,0],[0,-1],[0,1]];
  const eightDirs = [...fourDirs, [-1,-1],[-1,1],[1,-1],[1,1]];

  const sameNeighborCount = (x, y, color) => {
    let n = 0;
    for (const [dx, dy] of fourDirs) {
      if (colorMap.get(`${x+dx},${y+dy}`) === color) n++;
    }
    return n;
  };

  const dominantColor = (x, y) => {
    const counts = new Map();
    const dirs = use8ForDominant ? eightDirs : fourDirs;
    for (const [dx, dy] of dirs) {
      const c = colorMap.get(`${x + dx},${y + dy}`);
      if (c) counts.set(c, (counts.get(c) || 0) + 1);
    }
    let best = null;
    let bestCount = -1;
    for (const [col, cnt] of counts.entries()) {
      if (cnt > bestCount) { bestCount = cnt; best = col; }
    }
    return best || colorMap.get(`${x},${y}`);
  };

  let modified = 0;
  const updated = coords.map((c) => {
    if (isProtected(c.x, c.y)) return c;
    const sameN = sameNeighborCount(c.x, c.y, c.color);
    if (sameN <= minSameNeighbors) {
      const dom = dominantColor(c.x, c.y);
      if (dom && dom !== c.color) {
        modified++;
        return { ...c, color: dom };
      }
    }
    return c;
  });

  // Always record the pass (even if 0 changes) so caller can see it ran
  const baseMeta = { ...(packet.metadata || {}) };
  const metaUpdate = { lastPolishPass: 'cleanupOrphanPixels', orphansMerged: modified, orphanCandidatesConsidered: coords.length };

  // Only a pass that actually moved pixels gets a provenance link: a no-op must
  // not leave the chain implying an edit that never happened.
  return createPixelBrainAssetPacket({
    ...packet,
    coordinates: updated,
    metadata: modified > 0
      ? postForgeMetadata(packet, { kind: 'cleanup-orphan-pixels', minSameNeighbors }, { ...baseMeta, ...metaUpdate })
      : { ...baseMeta, ...metaUpdate },
  });
}

/**
 * Enforce structural rigidity on inner (non-silhouette) regions.
 * Reduces "blobby" amorphous inner purple/dark shapes by:
 * - Snapping jagged single-pixel protrusions on inner color boundaries.
 * - Encouraging straighter horizontal/vertical runs for designated inner parts.
 * The outer gold trim/silhouette remains untouched (it already has strong rigidity).
 */
export function enforceInnerStructuralRigidity(packet, options = {}) {
  const {
    innerPartIds = ['left_void_panel', 'right_void_panel', 'mantle', 'harness', 'waist_guard', 'collar_bridge'],
    innerColors = ['#01030A', '#030308', '#0B0B14', '#16161F', '#191C2D', '#20284A', '#05050D', '#0E1020'],
    maxJog = 1,
  } = options;

  let coords = [...(packet.geometry?.coordinates || packet.coordinates || [])];
  if (coords.length === 0) return packet;

  const byPos = new Map(coords.map(c => [`${c.x},${c.y}`, c]));
  const w = packet.canvas?.width || 64;

  const isInnerColor = (col) => innerColors.includes(col);
  const isInnerPart = (pid) => innerPartIds.some(p => (pid || '').includes(p));

  let modified = 0;

  // Pass 1: For each row, look at inner part cells and remove/correct 1px jags (protrusions)
  const byY = new Map();
  coords.forEach(c => {
    if (!byY.has(c.y)) byY.set(c.y, []);
    byY.get(c.y).push(c);
  });

  byY.forEach((rowCells, y) => {
    // Focus on cells that are inner fabric (by part or by color for generator assets that use 'body'/'mantle')
    const innerRow = rowCells.filter(c => isInnerPart(c.partId) || isInnerColor(c.color));
    if (innerRow.length < 3) return;

    // Sort by x
    innerRow.sort((a, b) => a.x - b.x);

    // Detect and smooth single-pixel jogs
    for (let i = 1; i < innerRow.length - 1; i++) {
      const prev = innerRow[i - 1];
      const cur = innerRow[i];
      const next = innerRow[i + 1];
      const leftGap = cur.x - prev.x;
      const rightGap = next.x - cur.x;

      if ((leftGap > maxJog + 1 && rightGap === 1) || (rightGap > maxJog + 1 && leftGap === 1)) {
        const dom = (byPos.get(`${cur.x - 1},${y}`) || byPos.get(`${cur.x + 1},${y}`) || byPos.get(`${cur.x},${y-1}`) || byPos.get(`${cur.x},${y+1}`))?.color;
        if (dom && dom !== cur.color && isInnerColor(dom)) {
          const idx = coords.findIndex(cc => cc.x === cur.x && cc.y === cur.y);
          if (idx >= 0) {
            coords[idx] = { ...coords[idx], color: dom };
            modified++;
          }
        }
      }
    }
  });

  // Pass 2: Vertical boundary straightening using color primarily (robust for 'body'/'mantle' inner darks)
  const panelCells = coords.filter(c => isInnerPart(c.partId) || isInnerColor(c.color));
  const panelByY = new Map();
  panelCells.forEach(c => {
    if (!panelByY.has(c.y)) panelByY.set(c.y, []);
    panelByY.get(c.y).push(c);
  });

  const ys = Array.from(panelByY.keys()).sort((a,b)=>a-b);
  for (let i = 1; i < ys.length; i++) {
    const y = ys[i];
    const cells = (panelByY.get(y) || []).filter(c => isInnerColor(c.color));
    if (cells.length < 4) continue;
    const xs = cells.map(c => c.x).sort((a,b)=>a-b);
    const minX = xs[0], maxX = xs[xs.length-1];

    const prevY = ys[i-1];
    const prevCells = (panelByY.get(prevY) || []).filter(c => isInnerColor(c.color));
    if (prevCells.length >= 3) {
      const pmin = Math.min(...prevCells.map(c=>c.x));
      const pmax = Math.max(...prevCells.map(c=>c.x));
      cells.forEach(c => {
        if (c.x === minX && minX < pmin - 1) {
          const idx = coords.findIndex(cc => cc.x===c.x && cc.y===c.y);
          if (idx>=0) { coords[idx] = {...coords[idx], x: pmin-1}; modified++; }
        }
        if (c.x === maxX && maxX > pmax + 1) {
          const idx = coords.findIndex(cc => cc.x===c.x && cc.y===c.y);
          if (idx>=0) { coords[idx] = {...coords[idx], x: pmax+1}; modified++; }
        }
      });
    }
  }

  const baseMeta2 = { ...(packet.metadata || {}) };
  return createPixelBrainAssetPacket({
    ...packet,
    coordinates: coords,
    metadata: modified > 0
      ? postForgeMetadata(packet, { kind: 'enforce-inner-structural-rigidity', innerJogsFixed: modified }, { ...baseMeta2, lastPolishPass: 'enforceInnerStructuralRigidity', innerJogsFixed: modified })
      : { ...baseMeta2, lastPolishPass: 'enforceInnerStructuralRigidity', innerJogsFixed: modified },
  });
}

/**
 * Drop Shadow for 3D volume.
 * Casts simple deterministic drop shadows from raised elements (e.g. blue pauldrons/collar)
 * onto the fabric beneath (dark purple/void panels). This breaks the "flat plane" read.
 * Shadows are added as darker variants with role 'shadow' and reduced emphasis.
 */
export function applyDropShadow(packet, options = {}) {
  const {
    sourcePartIds = ['left_pauldron_shell', 'right_pauldron_shell', 'left_pauldron', 'right_pauldron', 'mantle'],
    targetPartIdsOrColors = ['left_void_panel', 'right_void_panel', 'harness', 'waist_guard'],
    targetTestColors = ['#01030A', '#030308', '#0B0B14', '#16161F', '#05050D', '#0E1020', '#191C2D'],
    shadowColor = '#020308',
    maxOffset = 2,
    feather = true,
  } = options;

  let coords = [...(packet.geometry?.coordinates || packet.coordinates || [])];
  if (coords.length === 0) return packet;

  const byPos = new Map(coords.map(c => [`${c.x},${c.y}`, c]));
  const isSource = (c) => sourcePartIds.some(id => (c.partId || '').includes(id));
  const isTarget = (c) => {
    const pid = c.partId || '';
    if (targetPartIdsOrColors.some(id => pid.includes(id))) return true;
    return targetTestColors.includes(c.color);
  };

  const additions = [];

  // Find per-column bottom-most source edge. Also support color-based pauldron blue detection
  // for generator assets (pauldron parts carry the bright blue enamel #3920A0 range).
  const pauldronBlueHints = ['#3920A0', '#7463E8', '#B8B0FF'];
  const bottomEdge = new Map(); // x -> y
  coords.forEach(c => {
    const looksBlue = pauldronBlueHints.includes(c.color);
    if (isSource(c) || looksBlue) {
      const cur = bottomEdge.get(c.x);
      if (cur == null || c.y > cur) bottomEdge.set(c.x, c.y);
    }
  });

  bottomEdge.forEach((srcY, x) => {
    for (let off = 1; off <= maxOffset; off++) {
      const sy = srcY + off;
      const key = `${x},${sy}`;
      const target = byPos.get(key);
      if (target && isTarget(target)) {
        const strength = off === 1 ? 1.0 : (feather ? 0.6 : 0.8);
        const useColor = off === 1 ? shadowColor : (feather ? '#05050D' : shadowColor);
        additions.push({
          ...target,
          color: useColor,
          partId: (target.partId || 'inner') + '_shadow',
          emphasis: Math.max(0, (target.emphasis || 0.5) * strength * 0.7),
          role: 'shadow',
          isShadow: true,
        });

        if (feather && off === 1) {
          for (const dx of [-1, 1]) {
            const fkey = `${x + dx},${sy}`;
            const ftarget = byPos.get(fkey);
            if (ftarget && isTarget(ftarget)) {
              additions.push({
                ...ftarget,
                color: '#05050D',
                partId: (ftarget.partId || 'inner') + '_shadow',
                emphasis: (ftarget.emphasis || 0.4) * 0.5,
                role: 'shadow',
                isShadow: true,
              });
            }
          }
        }
      }
    }
  });

  if (additions.length === 0) return packet;

  const outMap = new Map(coords.map(c => [`${c.x},${c.y}`, c]));
  additions.forEach(a => outMap.set(`${a.x},${a.y}`, a));

  const nextCoords = Array.from(outMap.values());

  const baseMeta3 = { ...(packet.metadata || {}) };
  return createPixelBrainAssetPacket({
    ...packet,
    coordinates: nextCoords,
    metadata: postForgeMetadata(packet, { kind: 'apply-drop-shadow', shadowsCast: additions.length }, {
      ...baseMeta3,
      lastPolishPass: 'applyDropShadow',
      shadowsCast: additions.length,
    }),
  });
}
