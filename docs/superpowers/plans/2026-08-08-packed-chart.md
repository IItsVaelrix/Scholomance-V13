# Packed Chart with an Activation Agenda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the parse-forest explosion in `compose.js` with a packed chart that stores each `(span, category)` once, so parsing terminates on real input.

**Architecture:** A new module beside `compose.js` reuses its grammar and atom typing, but stores a cell as `Map<category, Node>` and drives growth with an activation agenda: a node broadcasts to its neighbours only when a cell gains a category it did not have. Correctness is established differentially — both parsers over 2,001 real gold sentences must agree.

**Tech Stack:** Node ESM, vitest, `better-sqlite3`, UD English-EWT (already in `cache/ud/`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-08-packed-chart-design.md`.
- **`compose.js` logic must not change.** Task 1 adds an export statement and nothing else. No edit to any function body, constant value, or control flow. The 71-test compose suite must report identically before and after.
- **The grammar must not change.** No new bonds, no new lifts, no new categories. This is a representation change; coverage must not move. If coverage moves, that is a divergence and a bug, not an improvement.
- Core modules under `codex/core/` do zero I/O — no `fs`, no network, no sqlite.
- The repo is ESM (`"type": "module"`). Use `import`, not `require`.
- Tests are vitest under `tests/qa/features/`. Run one file with `npx vitest run <path>`.
- The working tree has pre-existing unrelated changes (pixelbrain/subtlety). **Never `git add -A` or `git commit -a`.** Stage only the exact paths each task names.
- **Never run an uncapped classic parse of the full `test` split.** It does not terminate — one sub-28-token sentence held 1,382 MB for 8m15s. Any command touching the classic parser over a corpus must pass `--limit` or a token cap, or run under `timeout`.
- Grammar facts, verified 2026-08-08: **64 binary bonds, 6 unary lifts, 39 categories.** `BONDS` entries are `[leftType, rightType, resultType]`; `LIFTS` entries are `[srcType, dstType]`.

---

## File Structure

| File | Responsibility | New? |
|---|---|---|
| `codex/core/constellation/compose.js` | export `BONDS`, `LIFTS`, `atomsFor` — no other change | modify |
| `codex/core/constellation/compose-packed.js` | packed chart, activation agenda, `headsOf`, `projectAnswers` | create |
| `scripts/treebank-report.mjs` | `--parser packed\|classic` | modify |
| `scripts/parser-equivalence.mjs` | differential harness | create |
| `tests/qa/features/constellation-compose-packed.test.js` | packing invariants | create |
| `docs/superpowers/evidence/2026-08-08-packed-chart-equivalence.md` | the measured result | create |

---

## Task 1: Expose the grammar and atom typing

**Files:**
- Modify: `codex/core/constellation/compose.js` (append one export statement at end of file)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `BONDS: Array<[string, string, string]>` — `[leftType, rightType, resultType]`, 64 entries
  - `LIFTS: Array<[string, string]>` — `[srcType, dstType]`, 6 entries
  - `atomsFor(token: string, index: number, posMap: Map<string,string[]>) => Array<{type, from, to, parts: [], token}>`

- [ ] **Step 1: Record the baseline test result**

Run: `npx vitest run tests/qa/features/constellation-compose.test.js tests/qa/features/constellation-irregular.test.js 2>&1 | tail -5`

Write down the exact "Tests N passed" line. You will compare against it in Step 4.

- [ ] **Step 2: Append the export statement**

At the very end of `codex/core/constellation/compose.js`, append:

```js
/**
 * EXPOSED FOR `compose-packed.js`, which reuses this grammar and this atom
 * typing verbatim rather than copying them.
 *
 * A second copy of `atomsFor` would be a second place for the capitalisation
 * rule and the lexicon/irregular/suffix precedence to drift, and the two
 * parsers must be comparable atom-for-atom or the equivalence harness proves
 * nothing about the chart.
 *
 * This is an export-only addition. No logic in this file changes.
 */
export { BONDS, LIFTS, atomsFor };
```

Change nothing else. Do not reorder, reformat, or "tidy" any part of this file.

- [ ] **Step 3: Verify the diff is one hunk of additions**

Run: `git diff --stat codex/core/constellation/compose.js && git diff codex/core/constellation/compose.js | grep '^-' | grep -v '^---'`

Expected: the stat shows insertions only (`+N` with no deletions), and the grep prints nothing. If any line was removed, revert and redo Step 2.

- [ ] **Step 4: Verify the tests are unchanged**

Run: `npx vitest run tests/qa/features/constellation-compose.test.js tests/qa/features/constellation-irregular.test.js 2>&1 | tail -5`

Expected: the identical "Tests N passed" line from Step 1. Any change in the count or in pass/fail means logic moved — revert and redo.

- [ ] **Step 5: Commit**

```bash
git add codex/core/constellation/compose.js
git commit -m "refactor(constellation): expose BONDS, LIFTS and atomsFor

Export-only. No logic change; the compose suite reports identically.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: The packed chart and the activation agenda

**Files:**
- Create: `codex/core/constellation/compose-packed.js`
- Test: `tests/qa/features/constellation-compose-packed.test.js`

**Interfaces:**
- Consumes: `BONDS`, `LIFTS`, `atomsFor` from `compose.js` (Task 1).
- Produces: `composePacked(tokens, posMap, options = {}) => {atoms, molecules, spanning, stable, events}` where a `Node` is `{type, from, to, derivations, token}` and a derivation is `{bond: [l,r,result], left: Node, right: Node}` or `{lift: string, child: Node}`. Atoms have `derivations: []` and a non-null `token`. `events` is the number of nodes ever enqueued.

- [ ] **Step 1: Write the failing test**

Create `tests/qa/features/constellation-compose-packed.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { composePacked } from '../../../codex/core/constellation/compose-packed.js';
import { compose } from '../../../codex/core/constellation/compose.js';

const pos = new Map([
  ['stars', ['n']], ['burn', ['n', 'v']], ['bright', ['a', 'r']],
  ['dog', ['n']], ['chased', ['v']], ['cat', ['n']], ['garden', ['n']],
  ['barn', ['n']], ['road', ['n']], ['river', ['n']],
  ['horse', ['n', 'v']], ['raced', ['v']], ['past', ['a', 'n', 'r']], ['fell', ['a', 'n', 'v']],
  ['old', ['a']], ['man', ['n']], ['men', ['n']],
]);
const T = (s) => s.split(' ');

/** Four stacked PPs. Catalan says 42 parses; packing must not need 42 nodes. */
const STACKED = T('the dog chased the cat through the garden past the barn across the road by the river');

describe('composePacked — the packing invariant', () => {
  it('holds at most one node per (span, category)', () => {
    const r = composePacked(STACKED, pos);
    const seen = new Set();
    for (const m of r.molecules) {
      const key = `${m.from}:${m.to}:${m.type}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  /**
   * The 42 readings are not discarded — they become derivations on one node
   * instead of 42 nodes. If this ever reads 1, packing turned lossy.
   */
  it('keeps the alternatives as derivations rather than as nodes', () => {
    const r = composePacked(STACKED, pos);
    const totalDerivations = r.molecules.reduce((sum, m) => sum + m.derivations.length, 0);
    expect(totalDerivations).toBeGreaterThan(r.molecules.length);
  });

  it('enqueues each (span, category) exactly once', () => {
    const r = composePacked(STACKED, pos);
    expect(r.events).toBe(r.molecules.length);
  });

  /**
   * THE BOUND. n(n+1)/2 spans x 39 categories. Exceeding it means the wake
   * rule is leaking and a cell is re-broadcasting on a category it already had.
   */
  it('stays under the span x category bound', () => {
    const n = STACKED.length;
    const r = composePacked(STACKED, pos);
    expect(r.events).toBeLessThanOrEqual((n * (n + 1)) / 2 * 39);
  });
});

describe('composePacked — agreement with the classic chart', () => {
  const CASES = [
    'stars burn',
    'stars burn bright',
    'the dog chased the cat',
    'the old man fell',
    'old men fell',
    'the horse raced past the barn fell',
    'the dog chased the cat through the garden',
  ];

  it.each(CASES)('finds a spanning S exactly when the classic chart does: "%s"', (text) => {
    const tokens = T(text);
    const classic = compose(tokens, pos);
    const packed = composePacked(tokens, pos);
    expect(packed.stable.length > 0).toBe(classic.stable.length > 0);
  });

  it.each(CASES)('reaches exactly the same spans and categories: "%s"', (text) => {
    const tokens = T(text);
    const key = (m) => `${m.from}:${m.to}:${m.type}`;
    const classic = new Set(compose(tokens, pos).molecules.map(key));
    const packed = new Set(composePacked(tokens, pos).molecules.map(key));
    expect([...packed].sort()).toEqual([...classic].sort());
  });
});

describe('composePacked — edges', () => {
  it('returns empty structures for no tokens', () => {
    const r = composePacked([], pos);
    expect(r).toMatchObject({ atoms: [], molecules: [], spanning: [], stable: [], events: 0 });
  });

  it('returns empty structures with no posMap', () => {
    expect(composePacked(T('stars burn'), null).molecules).toEqual([]);
  });

  it('honours a declared root other than S', () => {
    const r = composePacked(T('the old man'), pos, { roots: ['NP'] });
    expect(r.stable.map((m) => m.type)).toContain('NP');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/constellation-compose-packed.test.js`
Expected: FAIL — `Failed to resolve import ".../compose-packed.js"`.

- [ ] **Step 3: Write the implementation**

Create `codex/core/constellation/compose-packed.js`:

```js
/**
 * A PACKED CHART WITH AN ACTIVATION AGENDA.
 *
 * `compose.js` pushes a separate object for every DERIVATION, so a span
 * buildable as NP in 400 ways holds 400 NP objects, and the layer above
 * multiplies against all 400. The chart is an unpacked parse forest and its
 * size follows the Catalan numbers — measured at 1,382 MB and 8m15s on a single
 * sub-28-token sentence before it was killed.
 *
 * Here a cell holds each CATEGORY once. The 400 ways survive as 400 entries in
 * one node's `derivations`. Storing the factors instead of the product turns a
 * multiplication into a sum, which is what a logarithm does, and the bound goes
 * from 4^n to n^3.
 *
 * NOTHING IS DISCARDED. This is not pruning. Every parse the classic chart
 * represents is still represented; it merely stops being enumerated. A pruning
 * damper was considered and rejected: it can only act on molecules that already
 * exist, and once a reading is dropped a missing grammar rule and a discarded
 * reading look identical.
 */
import { BONDS, LIFTS, atomsFor } from './compose.js';

/**
 * Compose bottom-up over a packed chart.
 *
 * @param {string[]} tokens
 * @param {Map<string, string[]>} posMap
 * @param {{roots?: string[]}} [options] acceptable root types; defaults to a
 *   complete clause, matching `compose`.
 * @returns {{atoms: object[], molecules: object[], spanning: object[],
 *   stable: object[], events: number}} `events` is how many nodes were ever
 *   enqueued — the termination measurement, exposed so a test can assert the
 *   bound rather than trust it.
 */
export function composePacked(tokens, posMap, options = {}) {
  const roots = options.roots || ['S'];
  const n = (tokens || []).length;
  if (n === 0 || !posMap) {
    return { atoms: [], molecules: [], spanning: [], stable: [], events: 0 };
  }

  /** cell[from][to] = Map<category, Node>. One node per category, never more. */
  const cell = Array.from({ length: n }, () => Array.from({ length: n }, () => new Map()));
  const agenda = [];
  let events = 0;

  /**
   * THE WAKE RULE. A derivation for a category the cell already has is
   * recorded and broadcasts NOTHING — the span is no more reachable than it
   * was, so no neighbour can newly combine with it. Only a genuinely new
   * category wakes the neighbourhood, which is what bounds the agenda by
   * spans x categories regardless of how ambiguous the sentence is.
   */
  const offer = (from, to, type, derivation) => {
    const existing = cell[from][to].get(type);
    if (existing) { existing.derivations.push(derivation); return; }
    const node = { type, from, to, derivations: [derivation], token: null };
    cell[from][to].set(type, node);
    agenda.push(node);
    events += 1;
  };

  const atoms = [];
  for (let i = 0; i < n; i += 1) {
    for (const a of atomsFor(tokens[i], i, posMap)) {
      // Two atoms of the same type at the same position ARE the same node.
      if (cell[i][i].has(a.type)) continue;
      const node = { type: a.type, from: i, to: i, derivations: [], token: a.token };
      cell[i][i].set(a.type, node);
      atoms.push(node);
      agenda.push(node);
      events += 1;
    }
  }

  while (agenda.length > 0) {
    const node = agenda.pop();

    // Unary lifts occupy the same span, so they are offered like any other
    // derivation. A lift onto a category the cell already has adds a
    // derivation and stops — which is why no identity guard is needed here,
    // unlike `closeUnderLifts` in compose.js.
    for (const [src, dst] of LIFTS) {
      if (node.type !== src) continue;
      offer(node.from, node.to, dst, { lift: dst, child: node });
    }

    // This node as the LEFT half of a bond. Snapshot the neighbour cell before
    // iterating: `offer` can insert into a cell we are walking.
    if (node.to + 1 < n) {
      for (let k = node.to + 1; k < n; k += 1) {
        for (const right of [...cell[node.to + 1][k].values()]) {
          for (const bond of BONDS) {
            if (node.type !== bond[0] || right.type !== bond[1]) continue;
            offer(node.from, k, bond[2], { bond, left: node, right });
          }
        }
      }
    }

    // This node as the RIGHT half. A neighbour created after this node was
    // dequeued will pair with it when that neighbour is itself dequeued, so
    // no combination is missed by processing order.
    if (node.from - 1 >= 0) {
      for (let j = 0; j <= node.from - 1; j += 1) {
        for (const left of [...cell[j][node.from - 1].values()]) {
          for (const bond of BONDS) {
            if (left.type !== bond[0] || node.type !== bond[1]) continue;
            offer(j, node.to, bond[2], { bond, left, right: node });
          }
        }
      }
    }
  }

  const molecules = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = i; j < n; j += 1) {
      for (const node of cell[i][j].values()) molecules.push(node);
    }
  }
  const spanning = [...cell[0][n - 1].values()];
  const stable = spanning.filter((m) => roots.includes(m.type));

  return { atoms, molecules, spanning, stable, events };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/constellation-compose-packed.test.js`
Expected: PASS, 21 tests.

**One spec test is deliberately absent, and this is the record of why.** The spec lists "a lift cycle terminates with no identity guard present". No such test is written, because the current `LIFTS` is acyclic — `N->NP, V->VP, PRON->NP, PROPN->NP, PRONACC->NPO, VP->S` — and `LIFTS` is a module constant with no injection point, so a cycle cannot be constructed to test against. Writing a test that passes because no cycle exists would be a check that cannot fail. The `offer` wake rule handles cycles structurally; that property is asserted by the enqueue-once test, which would catch a lift re-firing.

If "reaches exactly the same spans and categories" fails, do NOT relax it. It is the correctness claim. Print both sets and find which span+category one chart reaches and the other does not — that difference is either a packing bug or a real bug in `compose.js`, and both matter.

- [ ] **Step 5: Commit**

```bash
git add codex/core/constellation/compose-packed.js tests/qa/features/constellation-compose-packed.test.js
git commit -m "feat(constellation): packed chart — one node per span and category

Catalan growth comes from materialising every derivation. Storing the factors
instead of the product bounds the agenda by spans x categories.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Heads and answers over the packed forest

**Files:**
- Modify: `codex/core/constellation/compose-packed.js` (append)
- Test: `tests/qa/features/constellation-compose-packed.test.js` (append a describe block)

**Interfaces:**
- Consumes: `Node` from Task 2.
- Produces:
  - `headsOf(node, memo = new Map()) => Set<string>`
  - `projectAnswers(node, memo = new Map()) => Array<{subject: string|null, verb: string}>` — deduped, order not significant.

**Deviation from the spec, deliberate.** The spec says `projectAnswers` returns a `Set`. It returns a deduped **Array** instead: a `Set` of object references cannot dedup by value, so `{subject:'dog',verb:'ran'}` built twice would appear twice inside it. Dedup happens on a string key and the result is returned as an array. This plan governs.

- [ ] **Step 1: Write the failing test**

Append to `tests/qa/features/constellation-compose-packed.test.js`. Widen the existing import at the top of the file to `import { composePacked, headsOf, projectAnswers } from '../../../codex/core/constellation/compose-packed.js';` — do not add a second import line.

```js
const answerKey = (a) => `${a.subject || ''}|${a.verb || ''}`;

describe('headsOf / projectAnswers', () => {
  it('reads an atom head as its own token', () => {
    const r = composePacked(T('stars burn'), pos);
    const atom = r.atoms.find((a) => a.from === 0 && a.type === 'N');
    expect([...headsOf(atom)]).toEqual(['stars']);
  });

  it('takes the noun as the head of a determined noun phrase', () => {
    const r = composePacked(T('the old man fell'), pos);
    const np = r.molecules.find((m) => m.type === 'NP' && m.from === 0 && m.to === 2);
    expect([...headsOf(np)]).toContain('man');
    expect([...headsOf(np)]).not.toContain('the');
  });

  /**
   * THE POINT OF THE MODULE. Four stacked PPs are 42 readings in the classic
   * chart and one answer. Packed, the 42 are never built — the answer set is
   * read straight off the forest.
   */
  it('collapses the stacked-PP forest to a single answer', () => {
    const r = composePacked(STACKED, pos);
    const answers = projectAnswers(r.stable[0]);
    expect(answers.map(answerKey)).toEqual(['dog|chased']);
  });

  it('projects an imperative with a null subject', () => {
    const r = composePacked(T('chased the cat'), pos, { roots: ['S'] });
    const answers = projectAnswers(r.stable[0]);
    expect(answers.some((a) => a.subject === null && a.verb === 'chased')).toBe(true);
  });

  it('returns no answers for a node that is not there', () => {
    expect(projectAnswers(undefined)).toEqual([]);
  });

  /**
   * A node built two ways with two different heads must report BOTH. Taking
   * derivations[0] would pass every other test in this file and silently
   * answer about one arbitrary tree.
   */
  it('unions heads across derivations rather than taking the first', () => {
    const left = { type: 'N', from: 0, to: 0, derivations: [], token: 'alpha' };
    const right = { type: 'N', from: 1, to: 1, derivations: [], token: 'beta' };
    const twoWays = {
      type: 'NP', from: 0, to: 1, token: null,
      derivations: [
        { bond: ['N', 'N', 'NP'], left, right },
        { bond: ['DET', 'N', 'NP'], left: { ...left, type: 'DET' }, right },
      ],
    };
    expect([...headsOf(twoWays)].sort()).toEqual(['alpha', 'beta']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/constellation-compose-packed.test.js -t headsOf`
Expected: FAIL — `headsOf is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `codex/core/constellation/compose-packed.js`:

```js
/**
 * Every head this node can have, across all its derivations.
 *
 * The classic `headOf` returns ONE head because it walks one concrete tree.
 * A packed node stands for many trees at once, so the honest return is a set.
 * Its size is the ambiguity that actually matters — measured at a mean of 1.54
 * distinct answers while parses reached 32.02, which is why this stays cheap.
 *
 * The DET rule matches `compose.js`: `headOf` takes `parts[1]` when an NP was
 * built from a determiner, and `parts[0]` otherwise.
 *
 * @param {object} node
 * @param {Map<object, Set<string>>} [memo] shared across a traversal
 * @returns {Set<string>}
 */
export function headsOf(node, memo = new Map()) {
  if (!node) return new Set();
  const cached = memo.get(node);
  if (cached) return cached;

  /**
   * A lift chain could in principle cycle. It cannot today — LIFTS is
   * N->NP, V->VP, PRON->NP, PROPN->NP, PRONACC->NPO, VP->S, which is acyclic —
   * so this guard is defensive, and memoising is safe while it holds. A cycle
   * contributes nothing rather than recursing forever.
   */
  memo.set(node, new Set());

  const out = new Set();
  if (node.derivations.length === 0) {
    if (node.token != null) out.add(node.token);
  } else {
    for (const d of node.derivations) {
      if (d.lift) {
        for (const h of headsOf(d.child, memo)) out.add(h);
        continue;
      }
      const source = node.type === 'NP' && d.left.type === 'DET' ? d.right : d.left;
      for (const h of headsOf(source, memo)) out.add(h);
    }
  }
  memo.set(node, out);
  return out;
}

/**
 * The distinct `{subject, verb}` answers a root node stands for.
 *
 * The classic pipeline builds every parse and then projects each to an answer,
 * discarding the distinction it spent exponential work to produce. This reads
 * the answer set straight off the forest and never builds a tree.
 *
 * A single-child derivation is the VP->S lift, which is the imperative: the
 * subject is genuinely absent and projects as null rather than as an invented
 * `you`.
 *
 * @param {object} node a root node, or undefined
 * @param {Map<object, Set<string>>} [memo]
 * @returns {Array<{subject: string|null, verb: string}>}
 */
export function projectAnswers(node, memo = new Map()) {
  if (!node) return [];
  const byKey = new Map();
  for (const d of node.derivations) {
    if (d.lift) {
      for (const verb of headsOf(d.child, memo)) {
        byKey.set(`|${verb}`, { subject: null, verb });
      }
      continue;
    }
    for (const subject of headsOf(d.left, memo)) {
      for (const verb of headsOf(d.right, memo)) {
        byKey.set(`${subject}|${verb}`, { subject, verb });
      }
    }
  }
  return [...byKey.values()];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/constellation-compose-packed.test.js`
Expected: PASS, 27 tests.

- [ ] **Step 5: Commit**

```bash
git add codex/core/constellation/compose-packed.js tests/qa/features/constellation-compose-packed.test.js
git commit -m "feat(constellation): read answers off the packed forest

A packed node stands for many trees, so its head is a set. projectAnswers
computes the quantity neutrality said was real without building the parses.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Run the packed parser through the treebank instrument

**Files:**
- Modify: `scripts/treebank-report.mjs`

**Interfaces:**
- Consumes: `composePacked`, `projectAnswers` (Tasks 2-3); the existing `diagnose`, `summarize`, `frontierSignature`.
- Produces: `node scripts/treebank-report.mjs --parser packed` producing the same report sections.

- [ ] **Step 1: Add the flag and the parser switch**

In `scripts/treebank-report.mjs`:

1. Add to the imports:

```js
import { composePacked, projectAnswers } from '../codex/core/constellation/compose-packed.js';
```

2. Beside the existing `SPLIT` / `LIMIT` / `MAX_TOKENS` flag parsing, add:

```js
const PARSER = argOf('--parser', 'classic');
if (PARSER !== 'classic' && PARSER !== 'packed') {
  console.error(`--parser must be classic or packed, got ${PARSER}`);
  process.exit(1);
}
```

3. Where the sentence loop currently calls `compose(tokens, posMap)` and `compose(tokens, goldMap)`, branch:

```js
  let result;
  let goldResult;
  try {
    result = PARSER === 'packed' ? composePacked(tokens, posMap) : compose(tokens, posMap);
    goldResult = PARSER === 'packed' ? composePacked(tokens, goldMap) : compose(tokens, goldMap);
  } catch {
    dropped += 1;
    return null;
  }
```

4. Replace the `answers` / `contained` / `decided` block with:

```js
  const answers = PARSER === 'packed'
    ? result.stable.flatMap((s) => projectAnswers(s))
    : result.stable.map(projectAnswer);
  const contained = answers.some((a) => same(a.subject, gold.subject) && same(a.verb, gold.verb));

  /**
   * DECISION IS NOT AVAILABLE FOR THE PACKED PARSER. `rankByAttraction` scores
   * the leaves of one concrete parse, and a packed node is not one parse. Its
   * geometric mean is not Viterbi-decomposable because `counted` varies by
   * derivation, so making it work is a separate, measured decision. Reporting
   * null is the honest form; substituting a number would print an accuracy for
   * a measurement nobody made.
   */
  let decided = null;
  if (PARSER === 'classic' && senseMap) {
    const ranked = rankByAttraction(result.stable, senseMap);
    const top = ranked.length > 0 ? projectAnswer(ranked[0].molecule) : null;
    decided = Boolean(top && same(top.subject, gold.subject) && same(top.verb, gold.verb));
  }
```

5. Add `PARSER` to the header line so a reader of the output knows which chart produced it:

```js
console.log(`\nUD English-EWT / ${SPLIT} — ${report.n} sentences (parser: ${PARSER}, cap: --max-tokens ${MAX_TOKENS})\n`);
```

- [ ] **Step 2: Verify both parsers run on a small slice**

Run: `node scripts/treebank-report.mjs --split dev --limit 100 --parser classic 2>&1 | head -8`
Expected: the header says `parser: classic`, and coverage/containment/decision all print.

Run: `node scripts/treebank-report.mjs --split dev --limit 100 --parser packed 2>&1 | head -8`
Expected: the header says `parser: packed`, coverage and containment print, and `decision` prints `null`.

- [ ] **Step 3: Verify the packed parser runs UNCAPPED where the classic one cannot**

Run: `time node scripts/treebank-report.mjs --split test --parser packed --max-tokens 999`
Expected: completes. Record the wall time and the `skipped (> 999 tokens)` count, which should be 0.

If this does not complete within 10 minutes, stop and report BLOCKED with the elapsed time — the bound is not holding and Task 2 needs revisiting rather than papering over.

- [ ] **Step 4: Audit every reader of `stable.length`**

Packed, `stable.length` is 0 or 1 — it is no longer a parse count. Find every reader and confirm none treats it as one:

Run: `grep -rn "stable\.length\|stable)\.length\|\.stable\b" --include=*.js --include=*.mjs codex/ scripts/ tests/ | grep -v node_modules`

For each hit, classify it in your report as one of: a boolean test (`> 0`), a `.map`/`.flatMap` over the list, or **a parse count** (a defect). Report any parse-count reader rather than fixing it silently — the classic parser's own tests legitimately count parses and must not be touched, so a hit inside `constellation-compose.test.js` is expected and correct.

- [ ] **Step 5: Commit**

```bash
git add scripts/treebank-report.mjs
git commit -m "feat(constellation): run either chart through the same instrument

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: The differential equivalence harness

**Files:**
- Create: `scripts/parser-equivalence.mjs`

**Interfaces:**
- Consumes: `compose`, `composePacked`, `projectAnswer`, `projectAnswers`, `parseConllu`, `diagnose`.
- Produces: a printed divergence report. No exports.

- [ ] **Step 1: Write the harness**

Create `scripts/parser-equivalence.mjs`:

```js
/**
 * DIFFERENTIAL TEST: the packed chart against the classic one.
 *
 * Unit tests check invariants I thought to write down. This checks the claim
 * that actually matters — that packing changed the representation and not the
 * language — against 2,000 sentences of real annotated English.
 *
 * Sentences the CLASSIC parser cannot finish are excluded and COUNTED. That
 * count is itself a result: it is how much of the corpus was unmeasurable
 * before this work.
 *
 * Usage:
 *   node scripts/parser-equivalence.mjs [--split dev|test] [--limit N] [--max-tokens N]
 *
 * `--max-tokens` (default 24) bounds the CLASSIC parser only; the packed
 * parser runs on every sentence regardless.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { parseConllu } from '../codex/core/constellation/treebank.js';
import { diagnose } from '../codex/core/constellation/failure-diagnosis.js';
import { compose, projectAnswer } from '../codex/core/constellation/compose.js';
import { composePacked, projectAnswers } from '../codex/core/constellation/compose-packed.js';

const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const SPLIT = argOf('--split', 'dev');
const LIMIT = Number(argOf('--limit', '0')) || Infinity;
const CLASSIC_CAP = Number(argOf('--max-tokens', '24')) || 24;

const CORPUS = path.resolve(`cache/ud/en_ewt-ud-${SPLIT}.conllu`);
const DICT = path.resolve('scholomance_dict.sqlite');
if (!existsSync(CORPUS)) {
  console.error(`missing ${CORPUS} — run: npm run treebank:fetch`);
  process.exit(1);
}

const LEMMA_POS = new Map([['noun', 'n'], ['verb', 'v'], ['adjective', 'a'], ['adverb', 'r']]);
const posMap = new Map();
if (existsSync(DICT)) {
  const db = new Database(DICT, { readonly: true });
  for (const r of db.prepare('SELECT surface_lower, pos FROM lemma_form').iterate()) {
    const tag = LEMMA_POS.get(r.pos);
    if (!tag) continue;
    const have = posMap.get(r.surface_lower);
    if (have) { if (!have.includes(tag)) have.push(tag); } else posMap.set(r.surface_lower, [tag]);
  }
  db.close();
}

const records = parseConllu(readFileSync(CORPUS, 'utf8'));
const sample = records.slice(0, LIMIT === Infinity ? records.length : LIMIT);

const answerKey = (a) => `${a.subject == null ? '' : String(a.subject).toLowerCase()}|${a.verb == null ? '' : String(a.verb).toLowerCase()}`;
const setOf = (list) => [...new Set(list.map(answerKey))].sort().join(' , ');
const categoriesOf = (d) => [...new Set(d.categories.map((c) => c.label))].sort().join(' , ');

let compared = 0;
let excluded = 0;
let agree = 0;
const divergences = [];
let packedEvents = 0;
let packedNodes = 0;

for (const record of sample) {
  const tokens = record.tokens.map((t) => t.form);

  // The classic chart does not terminate on long or highly ambiguous input.
  if (tokens.length > CLASSIC_CAP) { excluded += 1; continue; }

  let classic;
  try { classic = compose(tokens, posMap); } catch { excluded += 1; continue; }

  const packed = composePacked(tokens, posMap);
  if (packed.events > packedEvents) packedEvents = packed.events;
  if (packed.molecules.length > packedNodes) packedNodes = packed.molecules.length;

  compared += 1;

  const classicSpans = setOf(classic.stable.map(projectAnswer));
  const packedSpans = setOf(packed.stable.flatMap((s) => projectAnswers(s)));
  const classicParsed = classic.stable.length > 0;
  const packedParsed = packed.stable.length > 0;
  const classicCats = categoriesOf(diagnose(record, classic));
  const packedCats = categoriesOf(diagnose(record, packed));

  const same = classicParsed === packedParsed
    && classicSpans === packedSpans
    && classicCats === packedCats;

  if (same) { agree += 1; continue; }
  divergences.push({
    sentId: record.sentId,
    text: record.text,
    classicParsed, packedParsed,
    classicSpans, packedSpans,
    classicCats, packedCats,
  });
}

console.log(`\nPARSER EQUIVALENCE — EWT ${SPLIT}, classic capped at ${CLASSIC_CAP} tokens\n`);
console.log(`  compared   ${compared}`);
console.log(`  agree      ${agree}`);
console.log(`  DIVERGE    ${divergences.length}`);
console.log(`  excluded   ${excluded}   (classic could not finish — previously unmeasurable)`);
console.log(`\n  packed worst-case: ${packedEvents} agenda events, ${packedNodes} nodes`);

for (const d of divergences.slice(0, 20)) {
  console.log(`\n  ${d.sentId}`);
  console.log(`    ${d.text}`);
  console.log(`    spanning S   classic=${d.classicParsed}  packed=${d.packedParsed}`);
  if (d.classicSpans !== d.packedSpans) {
    console.log(`    answers      classic=[${d.classicSpans}]`);
    console.log(`                 packed =[${d.packedSpans}]`);
  }
  if (d.classicCats !== d.packedCats) {
    console.log(`    categories   classic=[${d.classicCats}]`);
    console.log(`                 packed =[${d.packedCats}]`);
  }
}
console.log('');
```

- [ ] **Step 2: Run it on a slice**

Run: `node scripts/parser-equivalence.mjs --split dev --limit 200`
Expected: prints the summary. Note whether `DIVERGE` is 0.

- [ ] **Step 3: Run the full dev split**

Run: `time node scripts/parser-equivalence.mjs --split dev`
Expected: completes. Record `compared`, `agree`, `DIVERGE`, `excluded`, and the worst-case event/node counts.

**If `DIVERGE` is not 0, do not proceed to Task 6 and do not adjust the harness to hide it.** Report DONE_WITH_CONCERNS with the first few divergences. A divergence means either the packing is wrong or `compose.js` has a bug packing exposed, and which one it is must be established before any equivalence claim is written down.

- [ ] **Step 4: Commit**

```bash
git add scripts/parser-equivalence.mjs
git commit -m "test(constellation): differential harness for the two charts

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Measure the hung sentence, and record the result

**Files:**
- Create: `docs/superpowers/evidence/2026-08-08-packed-chart-equivalence.md`

**Interfaces:**
- Consumes: `scripts/parser-equivalence.mjs`, `scripts/treebank-report.mjs`.
- Produces: the evidence document.

- [ ] **Step 1: Find the sentence the classic chart cannot finish**

Run this to locate the first EWT test sentence under 28 tokens that the classic parser cannot parse in 5 seconds, using the packed parser as the control:

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { parseConllu } from './codex/core/constellation/treebank.js';
import { composePacked } from './codex/core/constellation/compose-packed.js';
const M = new Map([['noun','n'],['verb','v'],['adjective','a'],['adverb','r']]);
const db = new Database('scholomance_dict.sqlite', { readonly: true });
const posMap = new Map();
for (const r of db.prepare('SELECT surface_lower, pos FROM lemma_form').iterate()) {
  const t = M.get(r.pos); if (!t) continue;
  const h = posMap.get(r.surface_lower);
  if (h) { if (!h.includes(t)) h.push(t); } else posMap.set(r.surface_lower, [t]);
}
db.close();
const recs = parseConllu(readFileSync('cache/ud/en_ewt-ud-test.conllu','utf8'));
let worst = null;
for (const rec of recs) {
  const tk = rec.tokens.map(t => t.form);
  if (tk.length > 28) continue;
  const t0 = Date.now();
  const p = composePacked(tk, posMap);
  const ms = Date.now() - t0;
  if (!worst || p.events > worst.events) worst = { sentId: rec.sentId, text: rec.text, len: tk.length, events: p.events, nodes: p.molecules.length, derivations: p.molecules.reduce((s,m)=>s+m.derivations.length,0), ms };
}
console.log(JSON.stringify(worst, null, 2));
"
```

Record the printed object. This is the packed parser's cost on the corpus's worst sentence.

- [ ] **Step 2: Confirm the classic parser cannot do the same sentence**

Take the `sentId` from Step 1 and run the classic parser on that one sentence under a hard 60-second timeout:

```bash
timeout 60 node --input-type=module -e "
import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { parseConllu } from './codex/core/constellation/treebank.js';
import { compose } from './codex/core/constellation/compose.js';
const TARGET = 'PASTE_THE_SENT_ID_FROM_STEP_1';
const M = new Map([['noun','n'],['verb','v'],['adjective','a'],['adverb','r']]);
const db = new Database('scholomance_dict.sqlite', { readonly: true });
const posMap = new Map();
for (const r of db.prepare('SELECT surface_lower, pos FROM lemma_form').iterate()) {
  const t = M.get(r.pos); if (!t) continue;
  const h = posMap.get(r.surface_lower);
  if (h) { if (!h.includes(t)) h.push(t); } else posMap.set(r.surface_lower, [t]);
}
db.close();
const rec = parseConllu(readFileSync('cache/ud/en_ewt-ud-test.conllu','utf8')).find(r => r.sentId === TARGET);
const t0 = Date.now();
const c = compose(rec.tokens.map(t => t.form), posMap);
console.log('classic finished:', c.molecules.length, 'molecules in', Date.now()-t0, 'ms');
"; echo "exit=$?"
```

`exit=124` means the timeout killed it — that is the expected result and the number to record. If it finishes, record the molecule count and time instead; the comparison is still the point.

- [ ] **Step 3: Run the packed baseline on both splits, uncapped**

```bash
node scripts/treebank-report.mjs --split dev  --parser packed --max-tokens 999 > /tmp/packed-dev.txt 2>&1
node scripts/treebank-report.mjs --split test --parser packed --max-tokens 999 > /tmp/packed-test.txt 2>&1
```

- [ ] **Step 4: Write the evidence document**

Create `docs/superpowers/evidence/2026-08-08-packed-chart-equivalence.md`, filling every slot from the outputs you captured. Do not round toward a nicer number and do not omit an unflattering row.

```markdown
# Packed Chart — Equivalence and Cost — 2026-08-08

Charts compared: `codex/core/constellation/compose.js` (classic) and
`codex/core/constellation/compose-packed.js` (packed, commit <SHA of Task 3>).
Grammar identical in both: 64 bonds, 6 lifts, 39 categories. No rule changed.

## Equivalence

Paste the full `parser-equivalence.mjs --split dev` summary.

State plainly whether DIVERGE is 0. If it is not, list every divergence and say
which chart is wrong — do not report a divergence count without a verdict.

Report `excluded` as its own finding: that is how many EWT dev sentences the
classic chart could not finish, and therefore how much of the corpus was
unmeasurable before this change.

## Cost on the worst sentence in the corpus

| | classic | packed |
|---|---|---|
| result | ... | ... |
| time | ... | ... |
| nodes / molecules | ... | ... |

Include the sentence text and its token count. If the classic run hit the
60-second timeout, say so explicitly rather than writing a number.

Also report the packed worst case against the predicted bound: agenda events vs
n(n+1)/2 x 39 for that sentence's length. If events exceed the bound the wake
rule is leaking and this document should say so.

## The baseline, uncapped at last

| split | n | coverage | containment | decision |
|---|---|---|---|---|
| dev | ... | ... | ... | null |
| test | ... | ... | ... | null |

`decision` is null by design — `rankByAttraction` needs one concrete parse and a
packed node is not one. It is not a failure to measure; it is a measurement not
taken. See the spec's ranking section.

Compare against the capped classic dev figures recorded on 2026-08-08:
coverage 3.7% (74/2001), containment 1.7% (34/2001). State whether the numbers
moved. **They should not.** This was a representation change, and a coverage
change means a bug — say which if one appears.

## Does the punctuation finding still dominate?

Paste the packed run's failure-category table. The classic run's top four were
all `punct (PUNCT -> X)` — 1697 failures, 569 sole cause. Confirm or refute.
```

- [ ] **Step 5: Verify no placeholder survived**

Run: `grep -n '\.\.\.\|<SHA\|PASTE_THE' docs/superpowers/evidence/2026-08-08-packed-chart-equivalence.md`
Expected: no output.

- [ ] **Step 6: Run the whole feature suite**

Run: `npm run test:qa:features`
Expected: the same pass/fail set as before this plan started. If something fails, check whether it failed before these commits, and report it as failing rather than filing it under "pre-existing".

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/evidence/2026-08-08-packed-chart-equivalence.md
git commit -m "docs(constellation): packed chart equivalence and cost

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Out of scope

- Changing the grammar. No new bonds or lifts, including the missing punctuation
  atoms — real, separate work.
- Making `rankByAttraction` decomposable so `decision` works packed.
- Deleting `compose.js` or switching any consumer to the packed parser by
  default. That decision belongs after the equivalence number exists.
- The pre-existing pixelbrain/subtlety working-tree changes.
