import { describe, expect, it } from 'vitest';
import {
  applyCombatGatherIntent,
  createCombatLatticeAuthority,
  registerGatherableCell,
  validateCombatGatherIntent,
} from '../../../src/game/combat/combatLatticeAuthority.js';

describe('combatLatticeAuthority', () => {
  it('validates gather intents against canonical lattice cells and player tools', () => {
    const authority = createCombatLatticeAuthority();
    registerGatherableCell(authority, {
      x: 10,
      y: 8,
      z: 12,
      combatTx: 5,
      combatTy: 4,
    });

    const verdict = validateCombatGatherIntent(
      authority,
      { tx: 4, ty: 4, tools: ['pickaxe'] },
      { targetCell: { x: 10, y: 8, z: 12 }, toolId: 'pickaxe' },
    );
    expect(verdict.ok).toBe(true);
  });

  it('applies gather depletion server-side on the lattice authority', () => {
    const authority = createCombatLatticeAuthority();
    registerGatherableCell(authority, {
      x: 10,
      y: 8,
      z: 12,
      combatTx: 4,
      combatTy: 4,
    });
    const player = { tx: 4, ty: 4, tools: ['pickaxe'] };
    const intent = { targetCell: { x: 10, y: 8, z: 12 }, toolId: 'pickaxe' };
    expect(applyCombatGatherIntent(authority, player, intent).ok).toBe(true);
    expect(validateCombatGatherIntent(authority, player, intent).code).toBe('DEPLETED');
  });
});