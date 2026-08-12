/**
 * Slingshot generator tests — PB-QUARK-CHAMBER-v1
 *
 * The reference values here were reproduced from the working tree on
 * 2026-08-12 before any chamber code existed. If one of them changes, the
 * SUBSTRATE changed and that is the finding — do not edit the expectation.
 */

import { describe, it, expect } from 'vitest';
import {
  QUARK_CHAMBER_CONTRACT,
  buildBridgeMap,
  licenseFor,
  licensedPortEdges,
  generateQuarkCandidates,
} from '../../../../../codex/core/pixelbrain/quark-chamber/slingshot.js';
import { ATOM_BLUEPRINTS, BRIDGE_RULES } from '../../../../../scripts/semantic-valence-cyclotron.mjs';
import { buildDefaultBank } from '../../../../../codex/core/pixelbrain/codebase-nuclei-bank.js';

const ATOM = (id, offers, seeks) => ({
  id,
  label: `${id} test atom`,
  domain: 'synthesis',
  offers,
  seeks,
  traits: [],
  inhibits: [],
  evidence: ['codex/core/pixelbrain/canonical-json.js'],
  grounding: 0.8,
});

// A -> W1 -> B and A -> W2 -> B, both hops by exact match.
// Slingshot yields exactly one candidate rule: 'p-a' -> 'p-w', witnesses [W1, W2].
const TOY_BANK = [
  ATOM('atom-a', ['p-a'], []),
  ATOM('way-1', ['p-w'], ['p-a']),
  ATOM('way-2', ['p-w'], ['p-a']),
  ATOM('atom-b', ['p-b'], ['p-w']),
];

const { blueprints: FULL_ATOMS, bridges: FULL_BRIDGES } =
  buildDefaultBank(ATOM_BLUEPRINTS, BRIDGE_RULES, {});

describe('slingshot (PB-QUARK-CHAMBER-v1)', () => {
  it('declares its contract', () => {
    expect(QUARK_CHAMBER_CONTRACT).toBe('PB-QUARK-CHAMBER-v1');
  });

  describe('licensing', () => {
    it('licenses an exact port match as satisfies at strength 1', () => {
      expect(licenseFor('p-a', 'p-a', buildBridgeMap([]))).toEqual({ relation: 'satisfies', strength: 1 });
    });

    it('licenses an authored bridge at its own relation and strength', () => {
      const map = buildBridgeMap([{ from: 'p-a', to: 'p-b', relation: 'carries', strength: 0.9 }]);
      expect(licenseFor('p-a', 'p-b', map)).toEqual({ relation: 'carries', strength: 0.9 });
    });

    it('licenses nothing otherwise', () => {
      expect(licenseFor('p-a', 'p-b', buildBridgeMap([]))).toBeNull();
    });
  });

  describe('confinement law', () => {
    it('emits a candidate witnessed by two independent waypoints', () => {
      const candidates = generateQuarkCandidates(TOY_BANK, [], {});
      expect(candidates).toHaveLength(1);
      expect(candidates[0].from).toBe('p-a');
      expect(candidates[0].to).toBe('p-w');
      expect(candidates[0].witnesses).toEqual(['way-1', 'way-2']);
      expect(candidates[0].compositions).toEqual(['satisfies|satisfies']);
    });

    it('suppresses a candidate with only one waypoint', () => {
      const single = TOY_BANK.filter((a) => a.id !== 'way-2');
      expect(generateQuarkCandidates(single, [], {})).toHaveLength(0);
    });

    it('counts one waypoint once however many routes pass through it', () => {
      // Two source atoms both reach atom-b through the SAME waypoint. That is one
      // witness, not two — independence is per waypoint atom, so this stays
      // suppressed. Getting this wrong would let a single hub manufacture its own
      // corroboration.
      const oneHub = [
        ATOM('atom-a1', ['p-a'], []),
        ATOM('atom-a2', ['p-a'], []),
        ATOM('way-1', ['p-w'], ['p-a']),
        ATOM('atom-b', ['p-b'], ['p-w']),
      ];
      expect(generateQuarkCandidates(oneHub, [], { confinementMin: 1 })).toHaveLength(1);
      expect(generateQuarkCandidates(oneHub, [], { confinementMin: 1 })[0].witnesses).toEqual(['way-1']);
      expect(generateQuarkCandidates(oneHub, [], {})).toHaveLength(0);
    });

    it('never emits a rule that is already licensed', () => {
      const bridged = [{ from: 'p-a', to: 'p-w', relation: 'carries', strength: 0.9 }];
      expect(generateQuarkCandidates(TOY_BANK, bridged, {})).toHaveLength(0);
    });

    it('emits no score of any kind (F10)', () => {
      const [candidate] = generateQuarkCandidates(TOY_BANK, [], {});
      expect(Object.keys(candidate).sort()).toEqual(['compositions', 'from', 'to', 'witnesses']);
    });
  });

  describe('v1 scope', () => {
    it('refuses any depth but 1', () => {
      expect(() => generateQuarkCandidates(TOY_BANK, [], { depth: 2 })).toThrow(/depth/i);
    });

    it('rejects a non-integer confinement threshold rather than coercing it', () => {
      expect(() => generateQuarkCandidates(TOY_BANK, [], { confinementMin: 1.5 })).toThrow(/confinementMin/i);
      expect(() => generateQuarkCandidates(TOY_BANK, [], { confinementMin: 0 })).toThrow(/confinementMin/i);
    });
  });

  describe('measured full-bank reference values', () => {
    it('reproduces 56 atoms, 20 bridges and 191 directed licensed edges', () => {
      expect(FULL_ATOMS).toHaveLength(56);
      expect(FULL_BRIDGES).toHaveLength(20);
      expect(licensedPortEdges(FULL_ATOMS, FULL_BRIDGES)).toHaveLength(191);
    });

    it('reproduces 169 candidate rules, multiplicity {1:154, 2:14, 3:1}, 15 confined', () => {
      const all = generateQuarkCandidates(FULL_ATOMS, FULL_BRIDGES, { confinementMin: 1 });
      expect(all).toHaveLength(169);

      const multiplicity = {};
      for (const c of all) multiplicity[c.witnesses.length] = (multiplicity[c.witnesses.length] ?? 0) + 1;
      expect(multiplicity).toEqual({ 1: 154, 2: 14, 3: 1 });

      expect(generateQuarkCandidates(FULL_ATOMS, FULL_BRIDGES, {})).toHaveLength(15);
    });

    it('reproduces the ritual bank: 98 edges, 89 rules, 1 confined', () => {
      expect(licensedPortEdges(ATOM_BLUEPRINTS, BRIDGE_RULES)).toHaveLength(98);
      expect(generateQuarkCandidates(ATOM_BLUEPRINTS, BRIDGE_RULES, { confinementMin: 1 })).toHaveLength(89);
      expect(generateQuarkCandidates(ATOM_BLUEPRINTS, BRIDGE_RULES, {})).toHaveLength(1);
    });

    it('is deterministic across repeated calls', () => {
      const a = generateQuarkCandidates(FULL_ATOMS, FULL_BRIDGES, {});
      const b = generateQuarkCandidates(FULL_ATOMS, FULL_BRIDGES, {});
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
  });
});
