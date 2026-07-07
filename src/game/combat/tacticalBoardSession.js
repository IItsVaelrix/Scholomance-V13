/** @type {import('../../../codex/core/combat/tactical-board.compiler.js').BattleBoardState|null} */
let activeBoard = null;

export function setActiveBattleBoard(boardState) {
  activeBoard = boardState;
}

export function getActiveBattleBoard() {
  return activeBoard;
}

export function clearActiveBattleBoard() {
  activeBoard = null;
}

export function getTileAt(x, y) {
  if (!activeBoard) return null;
  const { width, height, tiles } = activeBoard;
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  return tiles[y * width + x] || null;
}