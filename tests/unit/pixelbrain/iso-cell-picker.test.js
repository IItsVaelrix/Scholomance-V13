import { describe, expect, it } from 'vitest';
import { pickBestCandidate, rankPickCandidates } from '../../../codex/core/pixelbrain/iso-cell-picker.js';

describe('iso-cell-picker', () => {
  const entries = [
    { cell: { x: 1, y: 0, z: 1, faceType: 'left', gatherable: false, interactionPriority: 1 } },
    { cell: { x: 1, y: 0, z: 1, faceType: 'top', gatherable: true, requiredTool: 'pickaxe', interactionPriority: 5 } },
    { cell: { x: 2, y: 0, z: 1, faceType: 'top', gatherable: true, requiredTool: 'pickaxe', interactionPriority: 10 } },
  ];

  it('prefers top faces over side faces at the same lattice coordinate', () => {
    const ranked = rankPickCandidates(entries, { toolId: 'pickaxe' });
    expect(ranked[0].cell.faceType).toBe('top');
  });

  it('prefers gatherable cells that match the equipped tool', () => {
    const ranked = rankPickCandidates([
      { cell: { x: 3, y: 0, z: 3, faceType: 'top', gatherable: true, requiredTool: 'sickle' } },
      { cell: { x: 4, y: 0, z: 4, faceType: 'top', gatherable: true, requiredTool: 'pickaxe', interactionPriority: 1 } },
    ], { toolId: 'pickaxe' });
    expect(ranked[0].cell.requiredTool).toBe('pickaxe');
  });

  it('breaks ties by interaction priority when face, tool, and distance match', () => {
    const best = pickBestCandidate([
      { cell: { x: 4, y: 0, z: 4, faceType: 'top', gatherable: true, requiredTool: 'pickaxe', interactionPriority: 5 } },
      { cell: { x: 4, y: 0, z: 4, faceType: 'top', gatherable: true, requiredTool: 'pickaxe', interactionPriority: 10 } },
    ], { toolId: 'pickaxe', playerCell: { x: 4, y: 0, z: 4 } });
    expect(best.cell.interactionPriority).toBe(10);
  });
});