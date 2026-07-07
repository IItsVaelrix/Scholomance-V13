const FACE_RANK = Object.freeze({
  top: 0,
  left: 1,
  right: 2,
});

export function latticeCellKey(cell) {
  if (!cell) return '';
  return `${cell.x},${cell.y},${cell.z}`;
}

/**
 * Deterministic ordering when multiple lattice cells share a screen pixel.
 * Priority:
 *   1. top face before side faces
 *   2. gatherable with the active tool
 *   3. reachable cells before unreachable
 *   4. nearest to the player
 *   5. highest interactionPriority
 *   6. stable lattice key
 */
export function rankPickCandidates(entries, context = {}) {
  const {
    toolId = null,
    playerCell = null,
    reachableKeys = new Set(),
    manhattan = defaultManhattan,
  } = context;

  return [...entries].sort((a, b) => {
    const cellA = a.cell || a;
    const cellB = b.cell || b;

    const faceA = FACE_RANK[cellA.faceType] ?? 9;
    const faceB = FACE_RANK[cellB.faceType] ?? 9;
    if (faceA !== faceB) return faceA - faceB;

    const gatherA = cellA.gatherable && cellA.requiredTool === toolId ? 0 : 1;
    const gatherB = cellB.gatherable && cellB.requiredTool === toolId ? 0 : 1;
    if (gatherA !== gatherB) return gatherA - gatherB;

    const reachA = reachableKeys.has(latticeCellKey(cellA)) ? 0 : 1;
    const reachB = reachableKeys.has(latticeCellKey(cellB)) ? 0 : 1;
    if (reachA !== reachB) return reachA - reachB;

    if (playerCell) {
      const distA = manhattan(cellA, playerCell);
      const distB = manhattan(cellB, playerCell);
      if (distA !== distB) return distA - distB;
    }

    const priA = Number(cellA.interactionPriority) || 0;
    const priB = Number(cellB.interactionPriority) || 0;
    if (priA !== priB) return priB - priA;

    return latticeCellKey(cellA).localeCompare(latticeCellKey(cellB));
  });
}

export function pickBestCandidate(entries, context = {}) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  return rankPickCandidates(entries, context)[0];
}

function defaultManhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
}