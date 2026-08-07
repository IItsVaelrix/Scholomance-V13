import { describe, it, expect } from 'vitest';
import { parseDiscoveryInquiry } from '../../../codex/core/constellation/discoveryInquiry.js';
import { buildDiscoveryPlan } from '../../../codex/core/constellation/discoveryPlan.js';
import { resolveQueryIdentity } from '../../../codex/core/constellation/queryIdentity.js';

const planFor = (q) => buildDiscoveryPlan(parseDiscoveryInquiry(resolveQueryIdentity(q)));

describe('buildDiscoveryPlan', () => {
  it('grief + rhyme with sea → semantic gen + hard rhyme constraint', () => {
    const plan = planFor('words semantically near grief that rhyme with sea');
    expect(plan.generators).toEqual([{ type: 'semantic', seed: 'grief' }]);
    expect(plan.constraints).toEqual([{ type: 'rhymeWith', token: 'sea' }]);
    expect(plan.mode).toBe('semantic+rhyme');
    expect(plan.scorerProfile).toBe('semantic');
  });

  it('rhyme with gravity → rhyme generator + rhyme-forward', () => {
    const plan = planFor('words that rhyme with gravity but feel spiritual');
    expect(plan.generators.some((g) => g.type === 'rhyme')).toBe(true);
    expect(plan.constraints).toEqual([{ type: 'rhymeWith', token: 'gravity' }]);
    expect(plan.mode).toBe('rhyme');
    expect(plan.scorerProfile).toBe('rhyme-forward');
    expect(plan.modifiers).toEqual(['spiritual']);
  });

  it('resemble darkness → semantic only', () => {
    const plan = planFor('Words that resemble darkness but feel more emotional');
    expect(plan.generators).toEqual([{ type: 'semantic', seed: 'darkness' }]);
    expect(plan.constraints).toEqual([]);
    expect(plan.mode).toBe('semantic');
  });

  it('returns null-plan shape for refuse parse', () => {
    const plan = buildDiscoveryPlan(parseDiscoveryInquiry(resolveQueryIdentity('words that feel more')));
    expect(plan).toBeNull();
  });
});
