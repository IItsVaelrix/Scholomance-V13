import { describe, expect, it } from 'vitest';
import { buildCastEvents, calculateCombatScore } from '../../codex/core/combat.scoring.js';

describe('buildCastEvents', () => {
  it('emits DISCOVERY_INEXPLICABLE for inexplicable lexicon hits', () => {
    const events = buildCastEvents({
      verse: 'The phoenix answers the hollow bell.',
      weave: 'strike the flesh',
    });
    const discovery = events.find((event) => event.type === 'DISCOVERY_INEXPLICABLE');
    expect(discovery).toBeTruthy();
    expect(discovery.word).toBe('phoenix');
    expect(discovery.domain).toBe('mythic');
    expect(discovery.source).toBe('verse');
    expect(Number.isInteger(discovery.seed)).toBe(true);
  });

  it('dedupes repeated inexplicable words within a cast', () => {
    const events = buildCastEvents({ verse: 'phoenix phoenix phoenix', weave: '' });
    expect(events.filter((event) => event.type === 'DISCOVERY_INEXPLICABLE')).toHaveLength(1);
  });

  it('emits EPIC_CAST with a deterministic animation cue at MYTHIC and above', () => {
    const params = {
      verse: 'The comet crowns the sovereign throne.',
      weave: 'strike the flesh then shatter the stone',
      rarity: { id: 'MYTHIC', ordinal: 3 },
      bridge: { chainType: 'SEQUENCE', strikes: 2, events: [] },
      school: 'VOID',
    };
    const first = buildCastEvents(params);
    const second = buildCastEvents(params);
    const epic = first.find((event) => event.type === 'EPIC_CAST');
    expect(epic).toBeTruthy();
    expect(epic.animationCue.motif).toBe('collapse-star-combo');
    expect(epic.animationCue.school).toBe('VOID');
    expect(epic.animationCue.seed).toBe(second.find((event) => event.type === 'EPIC_CAST').animationCue.seed);
  });

  it('does not emit EPIC_CAST below the epic threshold', () => {
    const events = buildCastEvents({
      verse: 'plain words',
      weave: 'strike the flesh',
      rarity: { id: 'GRIMOIRE', ordinal: 2 },
    });
    expect(events.some((event) => event.type === 'EPIC_CAST')).toBe(false);
  });

  it('forwards bridge and chess events', () => {
    const events = buildCastEvents({
      verse: '',
      weave: '',
      bridge: { events: [{ type: 'COMBO_CHAIN', strikes: 2 }] },
      syntacticalChess: { events: [{ type: 'SYNTAX_FORM_ADVANTAGE' }] },
    });
    expect(events.some((event) => event.type === 'COMBO_CHAIN')).toBe(true);
    expect(events.some((event) => event.type === 'SYNTAX_FORM_ADVANTAGE')).toBe(true);
  });
});

describe('calculateCombatScore event surface', () => {
  it('exposes events, strikes, and chainType on the score result', () => {
    const result = calculateCombatScore({
      text: 'The phoenix names the hollow dark and the bell answers twice.',
      weave: 'strike the flesh then shatter the stone',
      scoreData: { totalScore: 40, traces: [] },
    });
    expect(Array.isArray(result.events)).toBe(true);
    expect(result.events.some((event) => event.type === 'DISCOVERY_INEXPLICABLE')).toBe(true);
    expect(result.strikes).toBe(2);
    expect(result.chainType).toBe('SEQUENCE');
  });
});
