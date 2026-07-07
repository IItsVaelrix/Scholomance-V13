import { tileKey } from './combatPathfinding.js';

export const COMBAT_GATHER_REACH = 2;
export const COMBAT_PLATEAU_HEIGHT = 12;

export function latticeCellKey(cell) {
  return `${cell.x},${cell.y},${cell.z}`;
}

/** Map combat-grid coordinates into the shared lattice used by iso projection. */
export function combatGridToLattice(tx, ty, y = 0) {
  return Object.freeze({ x: tx, y, z: ty });
}

/** Map island heightmap coordinates into lattice space. */
export function islandVoxelToLattice(vx, vy, vz) {
  return Object.freeze({ x: vx, y: Math.floor(vz), z: vy });
}

export function heightmapToCombatCoord(vx, vy, radius = 14, combatCenter = 4) {
  return {
    tx: vx - radius + combatCenter,
    ty: vy - radius + combatCenter,
  };
}

export function createCombatLatticeAuthority(initialCells = []) {
  const cells = new Map();
  const depleted = new Set();
  for (const cell of initialCells) {
    const key = latticeCellKey(cell);
    const entry = { ...cell, depleted: !!cell.depleted };
    cells.set(key, entry);
    if (entry.depleted) depleted.add(key);
  }
  return { cells, depleted };
}

export function registerCombatGridCell(authority, tx, ty, extra = {}) {
  const cell = {
    ...combatGridToLattice(tx, ty, extra.y ?? 0),
    faceType: 'top',
    gatherable: false,
    interactionPriority: extra.isObelisk ? 80 : 10,
    interactionKind: 'grid',
    combatTx: tx,
    combatTy: ty,
    isObelisk: !!extra.isObelisk,
    blocked: !!extra.blocked,
    ...extra,
  };
  authority.cells.set(latticeCellKey(cell), cell);
  return cell;
}

export function registerGatherableCell(authority, cell) {
  const entry = {
    faceType: 'top',
    gatherable: true,
    requiredTool: 'pickaxe',
    yield: 'void-ore',
    interactionPriority: 60,
    interactionKind: 'gather',
    ...cell,
  };
  authority.cells.set(latticeCellKey(entry), entry);
  return entry;
}

export function getPlayerLatticePosition(playerGridPos) {
  if (!playerGridPos) return null;
  return combatGridToLattice(playerGridPos.tx, playerGridPos.ty, 0);
}

export function buildReachableLatticeKeys(reachableTiles) {
  const keys = new Set();
  if (!reachableTiles) return keys;
  for (const key of reachableTiles) {
    const [tx, ty] = key.split(',').map(Number);
    keys.add(latticeCellKey(combatGridToLattice(tx, ty, 0)));
  }
  return keys;
}

export function validateCombatGatherIntent(authority, playerState, intent) {
  const targetCell = intent?.targetCell;
  const toolId = intent?.toolId;
  if (!targetCell || !toolId) return { ok: false, code: 'INVALID_INTENT' };

  const key = latticeCellKey(targetCell);
  const cell = authority.cells.get(key);
  if (!cell) return { ok: false, code: 'NO_TILE' };
  if (authority.depleted.has(key) || cell.depleted) return { ok: false, code: 'DEPLETED' };
  if (!cell.gatherable) return { ok: false, code: 'NOT_GATHERABLE' };
  if (cell.requiredTool !== toolId) return { ok: false, code: 'WRONG_TOOL' };
  if (!(playerState.tools || []).includes(toolId)) return { ok: false, code: 'TOOL_MISSING' };
  if (cell.blocked) return { ok: false, code: 'BLOCKED' };

  const anchorTx = cell.combatTx ?? targetCell.x;
  const anchorTy = cell.combatTy ?? targetCell.z;
  const dist = Math.abs(anchorTx - playerState.tx) + Math.abs(anchorTy - playerState.ty);
  if (dist > COMBAT_GATHER_REACH) return { ok: false, code: 'OUT_OF_REACH' };

  return { ok: true, yield: cell.yield || 'void-ore', key };
}

export function applyCombatGatherIntent(authority, playerState, intent) {
  const verdict = validateCombatGatherIntent(authority, playerState, intent);
  if (!verdict.ok) return verdict;
  authority.depleted.add(verdict.key);
  const cell = authority.cells.get(verdict.key);
  if (cell) cell.depleted = true;
  return { ok: true, yield: verdict.yield, key: verdict.key };
}

export function isPlayerLatticePick(cell, playerGridPos) {
  if (!cell || !playerGridPos) return false;
  return cell.combatTx === playerGridPos.tx && cell.combatTy === playerGridPos.ty;
}

export { tileKey };