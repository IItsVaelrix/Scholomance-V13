import { describe, expect, it } from 'vitest';
import { parseWeave, calculateSyntacticBridge } from '../../codex/core/spellweave.engine.js';

describe('parseWeave clause grammar', () => {
  it('parses a legal INTENT→OBJECT clause', () => {
    const parsed = parseWeave('offensive the flesh');
    expect(parsed.clauses).toHaveLength(1);
    expect(parsed.clauses[0].intents).toEqual(['OFFENSIVE']);
    expect(parsed.clauses[0].objects).toEqual(['FLESH']);
    expect(parsed.clauses[0].legality).toBe('legal');
    expect(parsed.chainType).toBe('SINGLE');
    expect(parsed.strikes).toBe(1);
  });

  it('accepts granular intent leaves from the octree', () => {
    const parsed = parseWeave('rend the flesh');
    expect(parsed.clauses[0].intents).toEqual(['REND']);
    expect(parsed.clauses[0].legality).toBe('legal');
  });

  it('marks an object spoken before its intent as inverted', () => {
    const parsed = parseWeave('the flesh offensive');
    expect(parsed.clauses[0].legality).toBe('inverted');
  });

  it('marks an intent with no object as unfocused', () => {
    const parsed = parseWeave('offensive');
    expect(parsed.clauses[0].legality).toBe('unfocused');
  });

  it('marks a modifier with nothing to bind to as dangling', () => {
    const parsed = parseWeave('swift the zephyr');
    expect(parsed.clauses[0].legality).toBe('dangling');
    expect(parsed.syntax.danglingModifiers).toBe(1);
  });

  it('splits clauses on connectors and reports the chain type', () => {
    const parsed = parseWeave('swift offensive the flesh then offensive the stone');
    expect(parsed.clauses).toHaveLength(2);
    expect(parsed.clauses[0].modifiers).toEqual(['SWIFT']);
    expect(parsed.clauses[0].legality).toBe('legal');
    expect(parsed.clauses[1].intents).toEqual(['OFFENSIVE']);
    expect(parsed.chainType).toBe('SEQUENCE');
    expect(parsed.strikes).toBe(2);
  });

  it('reports MIXED when connectors disagree', () => {
    const parsed = parseWeave('offensive the flesh and offensive the stone then disruption the soul');
    expect(parsed.chainType).toBe('MIXED');
    expect(parsed.strikes).toBe(3);
  });

  it('keeps the flat intent and object fields', () => {
    const parsed = parseWeave('offensive the flesh then offensive the stone');
    expect(parsed.intents).toEqual(['OFFENSIVE']);
    expect(parsed.objects).toEqual(['FLESH', 'STONE']);
    expect(parsed.predicates).toEqual([]);
    expect(parsed.tokens).toContain('OFFENSIVE');
  });

  it('scales modifier power from the registry', () => {
    const parsed = parseWeave('utter offensive the flesh');
    expect(parsed.syntax.modifierPower).toBeCloseTo(1.25, 5);
  });
});

describe('calculateSyntacticBridge word-order law', () => {
  const base = { verse: 'The iron bell answers the hollow dark.', dominantSchool: 'WILL' };

  it('rewards legal order over inverted order for the same lexemes', () => {
    const legal = calculateSyntacticBridge({ ...base, weave: 'offensive the flesh' });
    const inverted = calculateSyntacticBridge({ ...base, weave: 'the flesh offensive' });
    expect(legal.resonance).toBeGreaterThan(inverted.resonance);
  });

  it('collapses only when a single clause overloads', () => {
    const overloaded = calculateSyntacticBridge({
      ...base,
      weave: 'offensive disruption utility offensive the flesh',
    });
    expect(overloaded.collapsed).toBe(true);
    expect(overloaded.events.some((event) => event.type === 'WEAVE_COLLAPSE')).toBe(true);

    const chained = calculateSyntacticBridge({
      ...base,
      weave: 'offensive the flesh then offensive the stone then disruption the soul then offensive the fire',
    });
    expect(chained.collapsed).toBe(false);
    expect(chained.strikes).toBe(4);
  });

  it('escalates SEQUENCE combos and emits a COMBO_CHAIN event', () => {
    const single = calculateSyntacticBridge({ ...base, weave: 'offensive the flesh' });
    const combo = calculateSyntacticBridge({ ...base, weave: 'offensive the flesh then offensive the stone' });
    expect(combo.resonance).toBeGreaterThan(single.resonance - 0.001);
    expect(combo.events.some((event) => event.type === 'COMBO_CHAIN' && event.strikes === 2)).toBe(true);
  });

  it('marks SUSTAINED channels', () => {
    const sustained = calculateSyntacticBridge({ ...base, weave: 'offensive the flesh while defensive the soul' });
    expect(sustained.chainType).toBe('SUSTAINED');
    expect(sustained.sustained).toBe(true);
  });

  it('resolves the primary intent in spoken order', () => {
    const bridge = calculateSyntacticBridge({ ...base, weave: 'healing the flesh then offensive the stone' });
    expect(bridge.intent).toBe('HEALING');
  });

  it('derives school from the verse dominant school', () => {
    const bridge = calculateSyntacticBridge({ ...base, weave: 'offensive the flesh' });
    expect(bridge.school).toBe('WILL');
  });

  it('is deterministic', () => {
    const first = calculateSyntacticBridge({ ...base, weave: 'utter offensive the flesh then offensive the stone' });
    const second = calculateSyntacticBridge({ ...base, weave: 'utter offensive the flesh then offensive the stone' });
    expect(second).toEqual(first);
  });
});