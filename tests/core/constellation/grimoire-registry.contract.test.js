/**
 * GRIMOIRE REGISTRY CONTRACT
 *
 * Registering a construction family takes three coordinated edits in
 * `grimoire/index.js` — the import, the `ALL_BY_FAMILY` key, and (for one
 * family) knowing that `relative.js` registers as `relative-clause`. Nothing
 * checked that the ritual was performed correctly. These assertions hold
 * today; the point is to stop them depending on someone remembering.
 *
 * WHAT THIS ACTUALLY CATCHES — established by mutation, not by assertion.
 * Each defect below was introduced into the source, the suite was run, and
 * the result recorded:
 *
 *   1. A new `families/*.js` that nobody wired into ALL_BY_FAMILY
 *      -> CAUGHT (named the orphan file and its id).
 *   2. A typo in one record's `family:` field, silently splitting a family
 *      in two -> CAUGHT by the per-file count.
 *   3. A registration KEY that disagrees with its records
 *      ('relative-clause' -> 'relative') -> NOT CAUGHT, and cannot be.
 *
 * Case 3 is worth writing down, because it is the opposite of what the
 * structure suggests. `POOL` is built from
 * `Object.values(ALL_BY_FAMILY).flat()`, which discards the keys entirely —
 * every downstream consumer groups on the record's own `family` field. The
 * ALL_BY_FAMILY key is therefore DOCUMENTATION, not data: changing it moves
 * nothing. Do not add an assertion pretending otherwise, and do not "fix" a
 * key/record mismatch expecting behaviour to change.
 *
 * Written against the PUBLIC surface (`familyInventory`, `CONSTRUCTIONS`) so
 * the contract survives internals staying private. Note that `CONSTRUCTIONS`
 * is `ORDER.map(...)` over bond signatures, so a registered family whose
 * signatures are absent from ORDER never reaches the chart at all — which is
 * exactly the dead weight assertion 1 exists to surface.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  familyInventory,
  CONSTRUCTIONS,
} from '../../../codex/core/constellation/grimoire/index.js';

const FAMILIES_DIR = join(
  process.cwd(), 'codex/core/constellation/grimoire/families');

/** Family ids as the family FILES declare them, read straight off disk. */
function declaredFamilyIds() {
  const ids = new Map(); // id -> source file
  for (const file of readdirSync(FAMILIES_DIR).filter((f) => f.endsWith('.js'))) {
    const src = readFileSync(join(FAMILIES_DIR, file), 'utf8');
    for (const [, id] of src.matchAll(/family:\s*'([\w-]+)'/g)) {
      if (!ids.has(id)) ids.set(id, file);
    }
  }
  return ids;
}

/** Family ids that actually reach the projected chart. */
function projectedFamilyIds() {
  return new Set(familyInventory().map((row) => row.family));
}

describe('grimoire registry — declared families and projected families agree', () => {
  it('every family declared in families/ reaches the chart', () => {
    const declared = declaredFamilyIds();
    const projected = projectedFamilyIds();

    const unregistered = [...declared.keys()]
      .filter((id) => !projected.has(id))
      .map((id) => `${id} (declared in ${declared.get(id)})`);

    // A new families/*.js that nobody wired into ALL_BY_FAMILY lands here.
    expect(unregistered).toEqual([]);
  });

  it('no family reaches the chart without a file declaring it', () => {
    const declared = declaredFamilyIds();
    const phantom = [...projectedFamilyIds()].filter((id) => !declared.has(id));

    // Symmetry half of assertion 1. This does NOT catch a bad ALL_BY_FAMILY
    // key — the keys are discarded before anything reads them (see header).
    expect(phantom).toEqual([]);
  });

  it('every construction carries a family id that some file declares', () => {
    const declared = declaredFamilyIds();
    const orphans = CONSTRUCTIONS
      .filter((c) => !declared.has(c.family))
      .map((c) => `${c.id ?? `${c.left}|${c.right}|${c.result}`} → ${c.family}`);

    expect(orphans).toEqual([]);
  });

  it('counts one family per family file', () => {
    const fileCount = readdirSync(FAMILIES_DIR)
      .filter((f) => f.endsWith('.js')).length;

    // Not cosmetic: a file declaring two ids, or two files declaring one,
    // means the "one family per file" convention has quietly stopped being
    // true and the three-edit registration ritual no longer describes reality.
    expect(declaredFamilyIds().size).toBe(fileCount);
    expect(projectedFamilyIds().size).toBe(fileCount);
  });
});
