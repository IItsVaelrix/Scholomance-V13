/**
 * User Fact Ledger — provenance for candidate-supplied numbers (honesty correction).
 *
 * A NUMBER may enter the résumé ONLY through a recorded user-input event, never because it
 * appeared somewhere inside mutable suggestion state. This ledger records each value a
 * candidate types into a required input slot (`UserSuppliedFact`), and exposes the set of
 * user-supplied value tokens that the token-provenance guard (§5.1) treats as legal. Any
 * numeric token in an `after` that is neither in the `before` bullet nor recorded here is
 * refused as `unprovenanced_number` — closing the hole where a rewrite could fabricate a
 * metric ("managing a team of 10") from nowhere.
 */
import type { UserSuppliedFact } from '../types.js';
import type { ResumeSuggestion } from '../../analysis/types.js';
import { INPUT_SENTINEL } from '../../amplify/data/input-sentinel.js';

/** Content tokens of a value, matching the provenance guard's tokenizer (e.g. "40%" → "40",
 *  "$120k" → "120k"). */
export function valueTokens(value: string): string[] {
  return (String(value ?? '').toLowerCase().match(/[a-z0-9][a-z0-9+#.-]*/g) || []).map((t) =>
    t.replace(/[.]+$/g, '')
  );
}

/**
 * A pure, deterministic ledger of user-supplied facts. Identical inputs → identical state.
 */
export class UserFactLedger {
  private readonly facts: UserSuppliedFact[] = [];

  /** Record a single user-supplied fact. */
  record(fact: UserSuppliedFact): void {
    this.facts.push(fact);
  }

  /**
   * Record every filled input slot of an accepted suggestion as a user-supplied fact.
   * `slotValues` maps slotId → the candidate's entered value. Only non-empty values that
   * actually replaced a sentinel are recorded.
   */
  recordFromSuggestion(
    suggestion: ResumeSuggestion,
    slotValues: Record<string, string>,
    acceptedAtRevision: number
  ): UserSuppliedFact[] {
    const recorded: UserSuppliedFact[] = [];
    if (!(suggestion.after ?? '').includes(INPUT_SENTINEL)) {
      // The after no longer has sentinels (already filled) — record each slot's value.
      for (const slot of suggestion.inputSlots || []) {
        const value = (slotValues[slot.id] || '').trim();
        if (!value) continue;
        const fact: UserSuppliedFact = {
          value,
          suggestionId: suggestion.id,
          slotId: slot.id,
          acceptedAtRevision,
        };
        this.record(fact);
        recorded.push(fact);
      }
      return recorded;
    }
    return recorded;
  }

  /** The set of user-supplied value tokens the provenance guard treats as legal. */
  values(): ReadonlySet<string> {
    const set = new Set<string>();
    for (const fact of this.facts) {
      for (const tok of valueTokens(fact.value)) set.add(tok);
    }
    return set;
  }

  /** All recorded facts, in insertion order. */
  all(): readonly UserSuppliedFact[] {
    return this.facts;
  }

  get size(): number {
    return this.facts.length;
  }
}
