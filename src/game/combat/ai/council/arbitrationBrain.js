import { manhattan } from '../../combatPathfinding.js';
import { getActiveBattleBoard } from '../../tacticalBoardSession.js';

export const ArbitrationBrain = {
  id: 'ARBITRATION_BRAIN',
  domain: ['arbitration', 'environment'],
  activationSignals: [],
  consumes: ['abilityKit', 'target.position'],
  weight: 1.2,
  score(candidate, ctx) {
    let score = 0;
    const findings = [];
    const endTile = candidate.endTile;
    
    // 1. Distance to Player
    const distToPlayer = manhattan(endTile, ctx.target.position);
    const preferred = ctx.abilityKit?.preferredRange ?? 1;
    if (distToPlayer === preferred) {
      score += 2;
      findings.push('Optimal combat distance');
    } else if (distToPlayer < preferred) {
      score -= 1;
      findings.push('Too close to player');
    }
    
    // 2. Special Tiles
    const board = getActiveBattleBoard();
    if (board && board.getTile) {
      const tileData = board.getTile(endTile.tx, endTile.ty);
      if (tileData && tileData.type) {
        if (tileData.type === 'obelisk' || tileData.type === 'chest') {
          score += 1.5;
          findings.push('Securing special objective tile');
        } else if (tileData.hazard) {
          score -= 2.0;
          findings.push('Avoiding hazard tile');
        }
      }
    }
    
    // 3. Distance to Escape (Edges of the map)
    const gridSize = 9; // COMBAT_GRID_SIZE
    const distToEscape = Math.min(
      endTile.tx, 
      endTile.ty, 
      (gridSize - 1) - endTile.tx, 
      (gridSize - 1) - endTile.ty
    );
    
    // If injured, prioritize escape routes (edges)
    const healthPercent = ctx.self.hp / ctx.self.maxHp;
    if (healthPercent < 0.4) {
      if (distToEscape <= 1) {
        score += 3;
        findings.push('Seeking escape route at low health');
      }
    }
    
    return { brainId: 'ARBITRATION_BRAIN', score, findings, tieredSignals: [] };
  },
};
