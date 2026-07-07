import { describe, expect, it } from 'vitest';
import { validateBrainContext } from '../../../../src/game/combat/ai/enemyBrainContract.js';

const brain = { id: 'AGGRO_BRAIN', consumes: ['self.hp', 'target.position.tx'] };

describe('validateBrainContext', () => {
  it('passes when every consumed path resolves', () => {
    const probe = { self: { hp: 10 }, target: { position: { tx: 3 } } };
    expect(validateBrainContext(brain, probe).ok).toBe(true);
  });

  it('reports a missing consumed path', () => {
    const probe = { self: { hp: 10 }, target: { position: {} } };
    const result = validateBrainContext(brain, probe);
    expect(result.ok).toBe(false);
    expect(result.failures[0]).toMatchObject({ code: 'AI_BRAIN_CONTEXT_MISSING', selector: 'target.position.tx' });
  });
});