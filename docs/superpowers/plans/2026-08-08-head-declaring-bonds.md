# Head-Declaring Bonds Implementation Plan

> **For agentic workers:** This plan is **complete**. Steps use checkbox syntax for tracking; every step below is checked. As-built deviations from the original snippets are recorded in [Completion & as-built](#completion--as-built).

**Status:** **complete** — all three tasks shipped and measured (2026-08-08).
**Spec:** [`docs/superpowers/specs/2026-08-08-head-declaring-bonds-design.md`](../specs/2026-08-08-head-declaring-bonds-design.md)
**Evidence:** [`docs/superpowers/evidence/2026-08-08-head-declaration-result.md`](../evidence/2026-08-08-head-declaration-result.md)

**Goal:** Make every bond declare which child is its head, so head-finding stops being a positional guess with hand-carved exceptions.

**Architecture:** Each `BONDS` entry gains a required 4th element — `0` for left, `1` for right — assigned by Universal Dependencies' content-head convention, because UD is the answer key we are scored against. `headOf` and `headsOf` then follow the declared child, and the lone `DET` exception is deleted because it becomes one row of data.

**Tech Stack:** Node ESM, vitest, UD English-EWT in `cache/ud/`, `scholomance_dict.sqlite`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-08-head-declaring-bonds-design.md`.
- **The grammar itself must not change.** No bond added, removed, or retyped. Only a 4th element appended to existing entries. If a bond looks wrong, report it — do not fix it here.
- **The 4th element is required on all 68 entries.** Module load throws if any entry lacks a head index in `{0, 1}`. A default would silently preserve today's behaviour for unreviewed bonds, which is exactly how this bug survived.
- `compose.js` `headOf` and `compose-packed.js` `headsOf` must stay behaviourally identical — a differential harness compares them across 2,001 sentences.
- Core modules under `codex/core/` do zero I/O.
- The repo is ESM (`"type": "module"`). Use `import`, not `require`.
- Tests are vitest under `tests/qa/features/`. Run one file with `npx vitest run <path>`.
- The working tree has pre-existing unrelated changes (pixelbrain/subtlety). **Never `git add -A` or `git commit -a`.** Stage only the exact paths each task names.
- **Never run the classic parser over a corpus without `--limit` or the default `--max-tokens 28`** — it does not terminate. The packed parser (`--parser packed --max-tokens 999`) is safe and takes about 3 seconds.
- A pre-commit hook (`pathogen.rename-without-consumer-grep`) flags changed export lines. Do not bypass it; keep exported signature lines textually unchanged, or grep consumers and satisfy it honestly.

---

## File Structure

| File | Responsibility | Status |
|---|---|---|
| `codex/core/constellation/compose.js` | `BONDS` 4-tuples; `validateBonds`; `headOf` follows the declaration | done |
| `codex/core/constellation/compose-packed.js` | `headsOf` follows the declaration | done |
| `tests/qa/features/constellation-compose.test.js` | assertions updated to content-word heads | done |
| `tests/qa/features/constellation-compose-packed.test.js` | bug-compatible test rewritten; head-declaration tests added | done |
| `docs/superpowers/evidence/2026-08-08-head-declaration-result.md` | measured before/after against the recorded prediction | done |

---

## Task 1: Declare a head on every bond (inert data + guard)

**Files:**
- Modify: `codex/core/constellation/compose.js` — the `BONDS` array and a new load-time assertion
- Test: `tests/qa/features/constellation-compose-packed.test.js` (append one describe block)

**Interfaces:**
- Consumes: nothing.
- Produces: `BONDS` entries become `[leftType, rightType, resultType, headIndex]` where `headIndex` is `0` (left child is head) or `1` (right child is head). `LIFTS` is unchanged — a unary lift's single child is trivially its head.

**This task changes no behaviour.** `compose` destructures `for (const [l, r, result] of BONDS)`, so a 4th element is ignored. That is deliberate: this task adds the data and the guard, and the next task starts reading it. A reviewer can therefore check the assignments in isolation from their effects.

- [x] **Step 1: Record the baseline test result**

Run: `npx vitest run tests/qa/features/constellation-compose.test.js tests/qa/features/constellation-irregular.test.js tests/qa/features/constellation-compose-packed.test.js 2>&1 | tail -5`

Write down the exact "Tests N passed" line. Step 5 compares against it.

- [x] **Step 2: Append the head index to each bond, in order**

Open `codex/core/constellation/compose.js` and append a 4th element to every entry of `BONDS`, **preserving every existing comment, blank line, and the array's order**. Do not rewrite the array wholesale — edit entries in place.

The table below is in the array's current order. The middle column is the bond as it appears today, so you can confirm alignment as you go. If any row does not match the entry at that position, STOP and report — the array has changed since this plan was written and the rest of the mapping cannot be trusted.

```
 0  DET+N->NP           1     UD det: the noun is the head
 1  P+NP->PP            1     UD case: the preposition is a dependent
 2  V+PP->VP            0
 3  NP+VP->S            1     UD roots a clause on its verb
 4  V+PP->PART          0
 5  NP+PART->NP         0
 6  V+NP->VP            0
 7  V+NPO->VP           0
 8  P+NPO->PP           1     UD case
 9  V+ADJ->VP           0
10  VP+PP->VP           0
11  NP+PP->NP           0
12  ADJ+N->N            1     THE BUG: attributive adjective is amod, not the head
13  ADV+ADJ->ADJ        1
14  ADV+VP->VP          1
15  VP+ADV->VP          0
16  COP+ADJ->VP         1     UD cop: `is tired` roots on tired
17  COP+NP->VP          1     UD cop: `is a man` roots on man
18  COP+VP->VP          1     THE BUG
19  AUX+VP->VP          1     THE BUG: `had gone` roots on gone
20  MODAL+VP->VP        1     THE BUG: `can run` roots on run
21  REL+VP->RELC        1
22  NP+RELC->NP         0
23  CONJ+NP->CONJNP     1     UD cc: the conjunction is a dependent
24  NP+CONJNP->NP       0     UD conj attaches to the FIRST conjunct
25  CONJ+VP->CONJVP     1
26  VP+CONJVP->VP       0     first conjunct
27  CONJ+S->CONJS       1
28  S+CONJS->S          0     first conjunct
29  CONJ+S->S           1     sentence-initial `And ...`; the clause is the head
30  TO+VP->INF          1     UD mark
31  V+INF->VP           0
32  COP+INF->VP         1     UD cop
33  NP+INF->NP          0
34  SUB+S->SBAR         1     UD mark
35  S+SBAR->S           0     main clause is the head
36  SBAR+S->S           1     fronted subordinate clause; main clause is the head
37  THAN+NP->THANP      1
38  ADJ+THANP->ADJ      0
39  VP+THANP->VP        0
40  POSS+N->N           1
41  NP+POSS->GEN        0     RULING: the possessor noun heads the possessor phrase
42  GEN+N->NP           1     UD nmod:poss: the POSSESSED noun is the head
43  ADV+COMMA->FRONTED  0     the comma is punct
44  SBAR+COMMA->FRONTED 0
45  PP+COMMA->FRONTED   0
46  FRONTED+S->S        1     main clause is the head
47  NP+COMMA->NPCOMMA   0
48  NPCOMMA+NP->APPOS   0     RULING: UD appos attaches to the FIRST NP
49  APPOS+COMMA->NP     0
50  NPCOMMA+NP->NP      0     first conjunct
51  S+COMMA->SCOMMA     0
52  SCOMMA+S->S         0     RULING: UD conj — first clause heads, though the
                              result type matches the RIGHT child. UD's convention
                              beats endocentricity here, and that is the point of
                              declaring rather than inferring.
53  S+PUNCT->S          0
54  V+PRT->V            0     UD compound:prt
55  VP+PRT->VP          0
56  PP+S->S             1
57  ADV+S->S            1
58  REL+S->SBAR         1
59  V+SBAR->VP          0
60  COP+SBAR->VP        1     UD cop
61  ADJ+INF->ADJ        0
62  MODAL+NP->INV       1     RULING: INV bundles an auxiliary with the subject;
63  AUX+NP->INV         1     the subject NP is the content word, so it heads INV.
64  COP+NP->INV         1     INV is never itself a head in bonds 65-67.
65  INV+VP->S           1     main verb heads the clause
66  INV+ADJ->S          1     UD cop: `is he happy` roots on happy
67  INV+NP->S           1     UD cop
```

Put the short justifications in the code as comments where the file's existing style has room. The five rows marked RULING must each carry their comment — they are the assignments not settled by the content-head rule, and a future reader needs to know they were decided rather than defaulted.

- [x] **Step 3: Add the load-time assertion**

Immediately after the `BONDS` array's closing `];` in `codex/core/constellation/compose.js`, add a load-time check that every entry has `length === 4` and `bond[3] ∈ {0, 1}`.

**As-built (preferred):** the check is `export function validateBonds(bonds)` called as `validateBonds(BONDS)`. It also rejects duplicate `(left, right, result)` signatures — the property `headOf`'s lookup depends on — and is unit-tested with a synthetic duplicate so the failure branch is proven. See [Completion & as-built](#completion--as-built).

Original sketch (superseded by the as-built form):

```js
for (const bond of BONDS) {
  if (bond.length !== 4 || (bond[3] !== 0 && bond[3] !== 1)) {
    throw new Error(`BONDS entry missing a head index: ${JSON.stringify(bond)}`);
  }
}
```

- [x] **Step 4: Write the exhaustiveness test**

Append to `tests/qa/features/constellation-compose-packed.test.js`. That file already imports `compose` from `../../../codex/core/constellation/compose.js` for its agreement tests — **widen that existing import to include `BONDS`**. Do not add a second import line from the same module.

```js
describe('BONDS head declarations', () => {
  it('declares a head on every bond', () => {
    const undeclared = BONDS.filter((b) => b.length !== 4 || (b[3] !== 0 && b[3] !== 1));
    expect(undeclared).toEqual([]);
  });

  /**
   * The three constructions the positional default got wrong. Pinning them by
   * signature means a future edit that reorders or retypes them is caught here
   * rather than in a coverage number three weeks later.
   */
  it.each([
    ['ADJ', 'N', 'N', 1],
    ['AUX', 'VP', 'VP', 1],
    ['MODAL', 'VP', 'VP', 1],
    ['COP', 'VP', 'VP', 1],
    ['DET', 'N', 'NP', 1],
  ])('declares %s + %s -> %s with head index %i', (l, r, result, head) => {
    const found = BONDS.find((b) => b[0] === l && b[1] === r && b[2] === result);
    expect(found).toBeDefined();
    expect(found[3]).toBe(head);
  });
});
```

- [x] **Step 5: Run the tests and confirm NOTHING changed**

Run: `npx vitest run tests/qa/features/constellation-compose.test.js tests/qa/features/constellation-irregular.test.js tests/qa/features/constellation-compose-packed.test.js 2>&1 | tail -5`

Expected: the Step 1 count **plus the 6 new tests**, all passing. Any pre-existing test that changed result means the data was not inert — revert and find out why.

- [x] **Step 6: Commit**

```bash
git add codex/core/constellation/compose.js tests/qa/features/constellation-compose-packed.test.js
git commit -m "feat(constellation): every bond declares its head

Inert data plus a load-time guard. headOf still finds heads by position; the
next commit makes it read these.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Read the declaration in both charts

**Files:**
- Modify: `codex/core/constellation/compose.js` — `headOf`
- Modify: `codex/core/constellation/compose-packed.js` — `headsOf`
- Modify: `tests/qa/features/constellation-compose.test.js` — assertions encoding the bug
- Modify: `tests/qa/features/constellation-compose-packed.test.js` — the bug-compatible test, plus new tests

**Interfaces:**
- Consumes: `BONDS` 4-tuples from Task 1.
- Produces: `headOf(molecule)` and `headsOf(node, memo)` both follow the declared head child. Signatures unchanged.

- [x] **Step 1: Write the failing tests**

Append to `tests/qa/features/constellation-compose-packed.test.js`. The module-scope helpers `pos`, `T` and `composePacked` already exist in that file; reuse them. Add these lexicon entries to the existing `pos` map if absent: `['is', []]`, `['will', []]`, `['was', []]`, `['chasing', ['v', 'a']]`.

```js
describe('the head is declared, not guessed by position', () => {
  const answerOf = (text) => {
    const r = composePacked(T(text), pos);
    return r.stable.length > 0 ? projectAnswers(r.stable[0]) : [];
  };

  it('takes the noun as the head of an attributive adjective phrase', () => {
    expect(answerOf('the old man fell')).toEqual([{ subject: 'man', verb: 'fell' }]);
  });

  it('takes the noun when there is no determiner either', () => {
    expect(answerOf('old men ran')).toEqual([{ subject: 'men', verb: 'ran' }]);
  });

  it('does not let an auxiliary steal the verb', () => {
    expect(answerOf('the dog is chasing the cat .')).toContainEqual({ subject: 'dog', verb: 'chasing' });
  });

  it('does not let a modal steal the verb', () => {
    expect(answerOf('the dog will run .')).toContainEqual({ subject: 'dog', verb: 'run' });
  });

  it('still honours the determiner rule now that it is data', () => {
    expect(answerOf('the dog chased the cat')).toEqual([{ subject: 'dog', verb: 'chased' }]);
  });
});
```

- [x] **Step 2: Update the test that deliberately encodes the bug**

`tests/qa/features/constellation-compose-packed.test.js` contains a test named `reproduces the classic chart, adjective-head bug included`, asserting the head of `the old man` is `old`. Its comment says the fix belongs in `compose.js` where both charts inherit it. That is now happening, so rewrite the test rather than deleting it, keeping the history legible:

```js
  /**
   * WAS bug-compatible on purpose. `headOf` used to take parts[0] with one
   * exception for determiners, so the head of `the old man` came back as `old`.
   * Both charts now read a declared head, so both say `man`.
   */
  it('takes the noun as the head of a determined noun phrase', () => {
    const r = composePacked(T('the old man fell'), pos);
    const np = r.molecules.find((m) => m.type === 'NP' && m.from === 0 && m.to === 2);
    expect([...headsOf(np)]).toEqual(['man']);
  });
```

- [x] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/qa/features/constellation-compose-packed.test.js`
Expected: the five new tests FAIL (reporting `old`, `is`, `will`), and the rewritten test FAILS.

- [x] **Step 4: Make `headOf` read the declaration**

In `codex/core/constellation/compose.js`, replace `headOf` so it looks up the bond by `(leftType, rightType, resultType)` and descends into `m.parts[bond[3]]`. Unary molecules still recurse on the single child; leaves return `m.token`.

**As-built (preferred):** if no bond matches, **throw** — do not fall back to `m.parts[0]`. A silent left fallback reintroduces the positional bug through the one unwatched path. Uniqueness of signatures is enforced by `validateBonds` at module load. See [Completion & as-built](#completion--as-built).

Original sketch used a left-child fallback on missing bond; that form is **not** what shipped:

```js
// SUPERSEDED — as-built throws instead of `bond ? parts[bond[3]] : parts[0]`
function headOf(m) {
  if (m.parts.length === 0) return m.token;
  if (m.parts.length === 1) return headOf(m.parts[0]);
  const bond = BONDS.find(
    (b) => b[0] === m.parts[0].type && b[1] === m.parts[1].type && b[2] === m.type,
  );
  return headOf(bond ? m.parts[bond[3]] : m.parts[0]);
}
```

- [x] **Step 5: Make `headsOf` read the declaration**

In `codex/core/constellation/compose-packed.js`, the derivation already carries its bond as `d.bond`, so no lookup is needed. Replace the head-selection line inside `headsOf` — currently choosing `d.right` when `node.type === 'NP' && d.left.type === 'DET'` and `d.left` otherwise — with:

```js
      // The bond declares which child is the head; see BONDS in compose.js.
      const source = d.bond[3] === 1 ? d.right : d.left;
```

Delete the `NP`/`DET` special case and its comment. Leave the lift branch alone: a lift has one child, which is its head.

- [x] **Step 6: Run the tests**

Run: `npx vitest run tests/qa/features/constellation-compose.test.js tests/qa/features/constellation-irregular.test.js tests/qa/features/constellation-compose-packed.test.js`

Expected: the new tests PASS. Some pre-existing assertions in `constellation-compose.test.js` will now fail — those reading a subject or verb from a sentence containing a prenominal adjective, auxiliary, modal, or copula. **Update them to the correct answer; do not weaken them.** For each one you change, note in your report the sentence, the old expectation, and the new one, so a reviewer can confirm each change is the bug being fixed rather than a regression being absorbed.

- [x] **Step 7: Confirm the two charts still agree**

Run:
```bash
node --input-type=module -e "
import { compose, projectAnswer } from './codex/core/constellation/compose.js';
import { composePacked, projectAnswers } from './codex/core/constellation/compose-packed.js';
const pos = new Map([['old',['a']],['man',['n']],['men',['n']],['fell',['a','n','v']],['ran',['v']],['dog',['n']],['chased',['v']],['cat',['n']],['run',['n','v']],['chasing',['v','a']]]);
const key = (a) => \`\${a.subject || ''}|\${a.verb || ''}\`;
for (const s of ['the old man fell','old men ran','the dog chased the cat','the dog will run .','the dog is chasing the cat .']) {
  const t = s.split(' ');
  const c = [...new Set(compose(t,pos).stable.map(projectAnswer).map(key))].sort();
  const p = [...new Set(composePacked(t,pos).stable.flatMap(n=>projectAnswers(n)).map(key))].sort();
  console.log(s.padEnd(30), JSON.stringify(c) === JSON.stringify(p) ? 'MATCH' : \`DIVERGE classic=\${c} packed=\${p}\`);
}
"
```
Expected: `MATCH` on every line. A `DIVERGE` means the two head implementations drifted — fix before committing.

- [x] **Step 8: Commit**

```bash
git add codex/core/constellation/compose.js codex/core/constellation/compose-packed.js tests/qa/features/constellation-compose.test.js tests/qa/features/constellation-compose-packed.test.js
git commit -m "fix(constellation): follow the declared head instead of guessing left

Deletes the DET exception — it is data now. Auxiliaries stop stealing the verb
and attributive adjectives stop stealing the subject.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Measure it against the recorded prediction

**Files:**
- Create: `docs/superpowers/evidence/2026-08-08-head-declaration-result.md`

**Interfaces:**
- Consumes: `scripts/treebank-report.mjs`, `.superpowers/sdd/2026-08-08-packed-chart/wrongness.mjs`.
- Produces: the evidence document.

- [x] **Step 1: Re-run the report on both splits**

```bash
node scripts/treebank-report.mjs --split dev  --parser packed --max-tokens 999 > /tmp/head-dev.txt 2>&1
node scripts/treebank-report.mjs --split test --parser packed --max-tokens 999 > /tmp/head-test.txt 2>&1
```

- [x] **Step 2: Re-run the wrongness breakdown**

Run: `node .superpowers/sdd/2026-08-08-packed-chart/wrongness.mjs dev`

This is the script that produced the before-numbers. It classifies parsed-but-wrong sentences into: correct, subject-right-verb-wrong, constituent-not-built, head-taken-from-inside, and different-span-won.

- [x] **Step 3: Write the evidence document**

Create `docs/superpowers/evidence/2026-08-08-head-declaration-result.md`, filling every slot from the captured output.

**Filled (as-built)** — no placeholders remain in the evidence file:

| | before | after |
|---|---|---|
| dev coverage | 21.7% | 21.7% |
| dev containment | 5.2% | 10.9% |
| test coverage | 21.9% | 21.9% |
| test containment | 5.9% | 11.4% |
| correct | 38 (16.3%) | 130 (55.8%) |
| subject right, VERB wrong | 108 (46.4%) | 12 (5.2%) |
| subject constituent NOT BUILT | 4 (1.7%) | 3 (1.3%) |
| built, head taken from inside | 13 (5.6%) | 4 (1.7%) |
| built, different span won | 70 (30.0%) | 84 (36.1%) |

Coverage did not move (control). Residual dominant bucket is selection. Full
narrative is in the evidence document; do not re-author from this plan.
- [x] **Step 4: Verify no placeholder survived**

Run: `grep -n '\.\.\.' docs/superpowers/evidence/2026-08-08-head-declaration-result.md`
Expected: no output.

- [x] **Step 5: Run the whole feature suite**

Run: `npm run test:qa:features`
Expected: the same pass/fail set as before this plan started. If something fails, check whether it failed before these commits, and report it as failing rather than filing it under "pre-existing".

- [x] **Step 6: Commit**

```bash
git add docs/superpowers/evidence/2026-08-08-head-declaration-result.md
git commit -m "docs(constellation): head declaration measured against its prediction

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Out of scope

- **Generalising the punctuation rule in `projectAnswers`.** With declared heads,
  the existing `PUNCT` special case could become "descend while the result type
  equals the head child's type", which would also fix `FRONTED + S -> S`,
  `PP + S -> S`, `ADV + S -> S` and the coordination bonds, where the projection
  currently reads the wrong child as the subject. The spec puts this out of
  scope so its effect is measured separately rather than blended into this
  result. It is the obvious next task and should get its own before/after.
- **The selection bucket** — the right constituent built and a different span
  won. Was 30.0% before this work; **36.1% after** (now dominant). Larger than
  the residual head bug and a different problem: it needs a selection principle.
- Subcategorisation frames, semantic valence, retrieval. The ~1.7%
  "constituent not built" measurement rules these out as limits on
  correctness-given-a-parse; they remain relevant to coverage.
- The pre-existing pixelbrain/subtlety working-tree changes.

---

## Completion & as-built

**Closed 2026-08-08.** All Task 1–3 steps checked. Grammar unchanged (68 bonds,
same types); every bond carries a head index; both charts follow it; evidence
banked.

### Result (from evidence)

| | before | after |
|---|---|---|
| correct (dev, scoreable) | 38 (16.3%) | **130 (55.8%)** |
| subject right, VERB wrong | 108 (46.4%) | 12 (5.2%) |
| head taken from inside | 13 (5.6%) | 4 (1.7%) |
| different span won | 70 (30.0%) | 84 (36.1%) — now dominant |
| dev / test coverage | 21.7% / 21.9% | unchanged (control) |
| dev / test containment | 5.2% / 5.9% | 10.9% / 11.4% |

Ceiling was 159/233 (68%); actual 130/233 = **81.8% of ceiling** (over-shoot
factor 1.22x vs 1.47x on the prior punctuation prediction). Full narrative:
`docs/superpowers/evidence/2026-08-08-head-declaration-result.md`.

### Commits

| commit | task |
|---|---|
| `4cbd0aff` | Task 1 — inert head indices + load-time guard |
| `86cd3396` | Task 2 — `headOf` / `headsOf` follow declaration |
| `463cd5f6` | Task 2 follow-up — `headsOf` JSDoc |
| `79dc565b` | Task 3 — evidence document |
| `052ec757` | review hardening (below) |

### Deviations from the original plan snippets (intentional, post-review)

These strengthen the same invariants; they do not change the grammar or the
measured head-declaration result (coverage/containment still 21.7%/10.9% on dev
after the review commit).

1. **`validateBonds(bonds)`** — exported; checks head indices **and** unique
   `(left, right, result)` signatures. Called at module load as
   `validateBonds(BONDS)`. A unit test feeds a synthetic duplicate so the
   failure branch is proven (the real table only proves cleanliness, not that
   the check works).
2. **`headOf` missing-bond path throws** — original sketch fell back to
   `m.parts[0]`; as-built throws
   `headOf: no bond found for L + R -> T`. Silent left fallback was the bug
   class under a different door.
3. **Review co-travelers in the same fix commit** (not required by Tasks 1–3,
   but closed as blockers on the branch): packed-chart `events` counts agenda
   pops in the drain loop; `projectAnswersFrom` rejects non-`S` roots the way
   classic `projectAnswer` does. Neither alters BONDS/LIFTS.

### Files touched (as planned)

| File | Role |
|---|---|
| `codex/core/constellation/compose.js` | `BONDS` 4-tuples, `validateBonds`, `headOf` |
| `codex/core/constellation/compose-packed.js` | `headsOf` reads `d.bond[3]` |
| `tests/qa/features/constellation-compose.test.js` | assertions updated to correct heads |
| `tests/qa/features/constellation-compose-packed.test.js` | exhaustiveness + head-declaration tests |
| `docs/superpowers/evidence/2026-08-08-head-declaration-result.md` | before/after measurement |

### Next work (explicitly not this plan)

1. **Selection principle** for the 36.1% "different span won" bucket.
2. **Generalised punctuation / endocentric descent** in projection (own
   before/after).
