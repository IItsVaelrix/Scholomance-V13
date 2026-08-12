/**
 * CHART VOCABULARY CONTRACT — the category set declared in four rooms.
 *
 * The chart categories (`N`, `NP`, `NPO`, `V`, `VP`, `PP`, …) are declared
 * independently in four places that never import each other:
 *
 *   1. `bond-synthesizer.js`  ATOM_INVENTORY         — the theory's own inventory
 *   2. `grimoire/index.js`    CONSTRUCTIONS          — left/right/result of the gold set
 *   3. `projection-laws.js`   PROJECTION_TRANSITIONS — head/result of the spine
 *   4. `compose.js`           LIFTS                  — unary token→phrase promotions
 *
 * There is no shared source of truth and no import edge between (1) and the
 * rest — deliberately. `bond-synthesizer.js` states it "does NOT read the human
 * BONDS table to invent reactions", because the rediscovery experiment measures
 * how many human constructions fall inside a cloud generated from theory alone.
 * An inventory derived from the gold set would be reading the answer key.
 *
 * ─── WHY THIS TEST EXISTS, AND WHY IT DOES NOT MERGE THE FOUR ──────────────
 *
 * That independence is load-bearing, so this test does NOT reconcile the
 * vocabularies. It pins the divergence so it cannot grow silently, because the
 * divergence is not free: `synthesizeBonds()` enumerates candidates FROM
 * ATOM_INVENTORY, so any construction whose categories are missing from the
 * inventory is unreachable by synthesis — it can never be rediscovered, and it
 * silently lowers the rediscovery ratio no matter how good the laws are.
 *
 * This is a characterization test, not an approval. It fails in BOTH
 * directions: if a new category drifts in, and if someone closes the gap
 * without updating the pin. Closing the gap is a THEORY decision (does the
 * theory of English chart categories own a pronoun atom?) and belongs to a
 * human, not to a test that quietly widens its allowlist.
 */
import { describe, it, expect } from 'vitest';
import { ATOM_INVENTORY } from '../../../codex/core/constellation/grimoire/bond-synthesizer.js';
import { CONSTRUCTIONS } from '../../../codex/core/constellation/grimoire/index.js';
import { PROJECTION_TRANSITIONS } from '../../../codex/core/constellation/grimoire/projection-laws.js';
import { LIFTS } from '../../../codex/core/constellation/compose.js';

const inventory = new Set(ATOM_INVENTORY);

/** Every category named anywhere in the gold construction set. */
const constructionCategories = () => {
  const s = new Set();
  for (const c of CONSTRUCTIONS) {
    s.add(c.left);
    s.add(c.right);
    s.add(c.result);
  }
  return s;
};

/** Every category named on the projection spine. */
const projectionCategories = () => {
  const s = new Set();
  for (const t of PROJECTION_TRANSITIONS) {
    s.add(t.head);
    s.add(t.result);
  }
  return s;
};

/** Every category named in the unary lift table. */
const liftCategories = () => {
  const s = new Set();
  for (const [from, to] of LIFTS) {
    s.add(from);
    s.add(to);
  }
  return s;
};

const missingFromInventory = (used) => [...used].filter((c) => !inventory.has(c)).sort();

/**
 * THE PINNED DIVERGENCE — measured, not assumed.
 *
 * `PRON`   — a pronoun atom. Used by the grammar, the spine, and the lifts.
 *            The inventory knows PROPN and N but has no pronoun, which is an
 *            omission in the theory's own terms rather than an artifact of the
 *            gold set. Adding it is defensible without contamination.
 * `PRONACC`— accusative pronoun, lifted to NPO by `compose.js` so that `him ran`
 *            cannot span while `the man saw him` still does.
 * `CONJADJ`— the coordination intermediate for adjectives. The inventory already
 *            carries CONJNP, CONJVP and CONJS, so this is the fourth member of a
 *            pattern the theory already commits to — but it is ALSO the label a
 *            gold construction uses, so adding it edges closest to reading the
 *            answer key. Left to a human.
 */
const KNOWN_ABSENT_FROM_INVENTORY = ['CONJADJ', 'PRON', 'PRONACC'];

describe('chart vocabulary contract', () => {
  it('pins exactly which categories the grammar uses that the theory has no atom for', () => {
    expect(missingFromInventory(constructionCategories())).toEqual(['CONJADJ', 'PRON']);
  });

  it('pins the projection spine divergence', () => {
    expect(missingFromInventory(projectionCategories())).toEqual(['PRON']);
  });

  it('pins the unary lift divergence', () => {
    expect(missingFromInventory(liftCategories())).toEqual(['PRON', 'PRONACC']);
  });

  it('admits no category beyond the three that were measured', () => {
    const all = new Set([
      ...missingFromInventory(constructionCategories()),
      ...missingFromInventory(projectionCategories()),
      ...missingFromInventory(liftCategories()),
    ]);
    expect([...all].sort()).toEqual(KNOWN_ABSENT_FROM_INVENTORY);
  });

  it('declares no atom that nothing downstream ever uses', () => {
    const used = new Set([
      ...constructionCategories(),
      ...projectionCategories(),
      ...liftCategories(),
    ]);
    expect([...inventory].filter((c) => !used.has(c)).sort()).toEqual([]);
  });

  /**
   * THE CONSEQUENCE, STATED AS A NUMBER.
   *
   * These constructions cannot be produced by `synthesizeBonds()` at any
   * quality of law, because the atoms they are built from are not in the
   * inventory being enumerated. `coord-adj-complete` carries status `grammar` —
   * a claimed linguistic fact — so the rediscovery ratio is capped by a
   * vocabulary gap rather than by the theory being wrong.
   */
  it('names the constructions synthesis cannot reach, and their cost', () => {
    const unreachable = CONSTRUCTIONS.filter(
      (c) => ![c.left, c.right, c.result].every((x) => inventory.has(x))
    );
    expect(unreachable.map((c) => c.id).sort()).toEqual([
      'coord-adj-bridge',
      'coord-adj-complete',
      'det-pron',
    ]);
    // At least one is claimed grammar, not scaffold — the gap costs a real fact.
    expect(unreachable.some((c) => c.status === 'grammar')).toBe(true);
  });
});
