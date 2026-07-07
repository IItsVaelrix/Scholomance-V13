import { describe, expect, it } from 'vitest';
import {
  CONNECTORS,
  MODIFIERS,
  WEAVE_INTENTS,
  getSemanticSchoolRegistry,
  lookupSemanticToken,
  lookupWeaveToken,
} from '../../codex/core/semantics.registry.js';

const COMBAT_SCHOOLS = ['SONIC', 'PSYCHIC', 'ALCHEMY', 'WILL', 'VOID'];

describe('semantic token classes', () => {
  it('resolves modifiers with power scaling', () => {
    const swift = lookupSemanticToken('swift');
    expect(swift?.type).toBe('MODIFIER');
    expect(swift?.powerScale).toBeGreaterThan(1);
  });

  it('resolves connectors with a chain type', () => {
    expect(lookupSemanticToken('then')).toMatchObject({ type: 'CONNECTOR', chainType: 'SEQUENCE' });
    expect(lookupSemanticToken('and')).toMatchObject({ type: 'CONNECTOR', chainType: 'SIMULTANEOUS' });
    expect(lookupSemanticToken('while')).toMatchObject({ type: 'CONNECTOR', chainType: 'SUSTAINED' });
  });

  it('keeps verse predicates in semantic lookup while weave uses octree leaves', () => {
    expect(lookupSemanticToken('ignite')?.type).toBe('PREDICATE');
    expect(lookupWeaveToken('ignite')).toMatchObject({ type: 'INTENT', intentClass: 'OFFENSIVE', manner: 'FLAME' });
    expect(lookupWeaveToken('offensive')).toMatchObject({ type: 'INTENT', intent: 'OFFENSIVE' });
    expect(lookupWeaveToken('flesh')?.type).toBe('OBJECT');
  });

  it('exposes the octree-backed weave intent registry', () => {
    expect(Object.keys(WEAVE_INTENTS).length).toBe(325);
    expect(lookupWeaveToken('REND')).toMatchObject({ type: 'INTENT', intentClass: 'OFFENSIVE' });
    expect(lookupWeaveToken('OFFENSIVE')).toMatchObject({ type: 'INTENT', manner: 'BROAD' });
  });

  it('exposes every declared modifier and connector through lookup', () => {
    Object.keys(MODIFIERS).forEach((token) => {
      expect(lookupSemanticToken(token)?.type).toBe('MODIFIER');
    });
    Object.keys(CONNECTORS).forEach((token) => {
      expect(lookupSemanticToken(token)?.type).toBe('CONNECTOR');
    });
  });
});

describe('school status-chain registries', () => {
  it('provides at least one chain with keywords for every school', () => {
    COMBAT_SCHOOLS.forEach((school) => {
      const registry = getSemanticSchoolRegistry(school);
      const chains = Object.entries(registry);
      expect(chains.length).toBeGreaterThan(0);
      chains.forEach(([chainId, chain]) => {
        expect(chainId).toBeTruthy();
        expect(Array.isArray(chain.keywords)).toBe(true);
        expect(chain.keywords.length).toBeGreaterThan(0);
      });
    });
  });

  it('includes multi-word keywords for phrase matching', () => {
    const voidRegistry = getSemanticSchoolRegistry('VOID');
    expect(voidRegistry.HOLLOWING.keywords).toContain('empty vessel');
  });

  it('degrades unknown schools to an empty registry', () => {
    expect(getSemanticSchoolRegistry('DISCO')).toEqual({});
    expect(getSemanticSchoolRegistry('')).toEqual({});
  });
});
