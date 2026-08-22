/**
 * Tests: MemoryIR L2 — transport conformance.
 *
 * L1 asked whether a memory record is well-formed. L2 asks the only question
 * that matters: when a memory is rendered to prose by one model and read back
 * by another, does it come back as the SAME record?
 *
 * The comparator is arithmetic over hex blocks. There is no judge anywhere.
 *
 * THE CONSTRAINT THAT MAKES THIS POSSIBLE. A slot's hex is sha256 of its
 * canonical string, so `IDENTICAL` is reachable only if the second model
 * reproduces that string EXACTLY. Free-form canonicals can never do that. So
 * every slot draws from a closed published vocabulary, and a model that cannot
 * map a slot answers UNBOUND rather than inventing a plausible value —
 * SEMANTIC_KIND_THEORY_UNBOUND, fail-closed.
 */

import { describe, it, expect } from 'vitest';
import { MEMORY_FAMILIES } from '../../../../src/core/scd64/glossary';
import { SCD64_SLOT_NAMES, MEMORY_SLOT_VOCAB, MEMORY_UNBOUND } from '../../../../src/core/scd64/constants';
import { generateSCD64 } from '../../../../src/core/scd64/generateSCD64FromSlots';
import { memoryRecordToSCD64, scoreTransport } from '../../../../src/core/scd64/memoryTransport';

const valuesOf = (familyName: string) =>
  Object.fromEntries(
    (MEMORY_FAMILIES as any)[familyName].canonicals.map(
      (c: any) => [c.slot, c.canonical.split(':').slice(1).join(':')],
    ),
  );

// ─── The closed vocabulary ───────────────────────────────────────────────────

describe('MEMORY_SLOT_VOCAB', () => {
  it('publishes a closed value list for all eight slots', () => {
    for (const slot of SCD64_SLOT_NAMES) {
      const values = MEMORY_SLOT_VOCAB[slot];
      expect(Array.isArray(values)).toBe(true);
      expect(values.length).toBeGreaterThan(1);
    }
  });

  it('offers UNBOUND on every slot so a model never has to guess', () => {
    for (const slot of SCD64_SLOT_NAMES) {
      expect(MEMORY_SLOT_VOCAB[slot]).toContain(MEMORY_UNBOUND);
    }
  });

  it('stays small enough to be worth encoding at all', () => {
    // Amortization: encoded memory only beats prose while the vocabulary a
    // reader must carry stays small. This is that budget, asserted.
    const total = SCD64_SLOT_NAMES.reduce((n, s) => n + MEMORY_SLOT_VOCAB[s].length, 0);
    expect(total).toBeLessThanOrEqual(64);
  });
});

// ─── Reproducibility: the property L1 silently lacked ────────────────────────

describe('canonical reproducibility', () => {
  it('every family value is drawn from the published vocabulary', () => {
    for (const familyName of Object.keys(MEMORY_FAMILIES)) {
      const values = valuesOf(familyName);
      for (const slot of SCD64_SLOT_NAMES) {
        expect(MEMORY_SLOT_VOCAB[slot], `${familyName}.${slot}="${values[slot]}"`)
          .toContain(values[slot]);
      }
    }
  });

  it('rebuilding a family from its own slot values reproduces its wire value', () => {
    // If this fails, no model could ever score IDENTICAL and L2 is unpassable.
    for (const familyName of Object.keys(MEMORY_FAMILIES)) {
      expect(memoryRecordToSCD64(valuesOf(familyName))).toBe(generateSCD64(familyName));
    }
  });
});

// ─── Scoring ─────────────────────────────────────────────────────────────────

describe('scoreTransport', () => {
  it('scores a faithful round-trip as IDENTICAL with no drift', () => {
    const result = scoreTransport('MEM_RULE_MANDATORY', valuesOf('MEM_RULE_MANDATORY'));
    expect(result.relationship).toBe('IDENTICAL');
    expect(result.pass).toBe(true);
    expect(result.drifted).toEqual([]);
    expect(result.abstained).toEqual([]);
  });

  it('names the drifted slot by its MEMORY alias, not the wire name', () => {
    const values = { ...valuesOf('MEM_RULE_MANDATORY'), INVARIANT: 'preferred' };
    const result = scoreTransport('MEM_RULE_MANDATORY', values);

    expect(result.pass).toBe(false);
    expect(result.drifted).toEqual([{ slot: 'MODALITY', expected: 'mandatory', got: 'preferred' }]);
  });

  it('counts UNBOUND as an abstention, never as a match', () => {
    const values = { ...valuesOf('MEM_RULE_MANDATORY'), INVARIANT: MEMORY_UNBOUND };
    const result = scoreTransport('MEM_RULE_MANDATORY', values);

    expect(result.pass).toBe(false);
    expect(result.abstained).toEqual(['MODALITY']);
    // An abstention is a REFUSAL to answer, so it must not also be reported as
    // a wrong answer — those are different failures with different fixes.
    expect(result.drifted).toEqual([]);
  });

  it('refuses a value outside the published vocabulary', () => {
    const values = { ...valuesOf('MEM_RULE_MANDATORY'), INVARIANT: 'sort-of-preferred' };
    expect(() => scoreTransport('MEM_RULE_MANDATORY', values)).toThrow(/vocabulary/i);
  });

  it('refuses a record missing a slot rather than defaulting it', () => {
    const values: any = valuesOf('MEM_RULE_MANDATORY');
    delete values.VERDICT;
    expect(() => scoreTransport('MEM_RULE_MANDATORY', values)).toThrow(/VERDICT|UNBINDS_IF/);
  });
});
