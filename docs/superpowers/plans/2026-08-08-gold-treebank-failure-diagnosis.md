# Gold Treebank and Failure Diagnosis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `codex/core/constellation/compose.js` a human-annotated gold treebank to be scored against, and an instrument that turns each parse failure into a located, named linguistic category.

**Architecture:** Two pure core modules (a CoNLL-U reader, a failure diagnoser) plus a pure metrics aggregator, driven by two thin I/O scripts (a fetcher and a runner). Reachability is read from `compose`'s existing return value — every molecule already carries `from`/`to` — so `compose.js` is never modified by this work.

**Tech Stack:** Node ESM, vitest, `better-sqlite3` (already a dependency, `^12.6.2`), Universal Dependencies English-EWT.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-08-gold-treebank-failure-diagnosis-design.md`.
- **`codex/core/constellation/compose.js` must not be modified.** The instrument may not change the thing it measures. If a task appears to require a change there, stop and report it.
- Core modules under `codex/core/` do zero I/O — no `fs`, no network, no sqlite. All I/O lives in `scripts/`.
- The repo is ESM (`"type": "module"`). Use `import`, not `require`.
- Tests are vitest under `tests/qa/features/`. Run a single file with `npx vitest run <path>`.
- The working tree has pre-existing unrelated changes (pixelbrain/subtlety). **Never `git add -A` or `git commit -a`.** Stage only the exact paths listed in each task's commit step.
- UD tags used for the answer projection are `nsubj`, `nsubj:pass`, and `root`. UPOS values that map to a compose lexical tag: `NOUN`→`n`, `PROPN`→`n`, `VERB`→`v`, `ADJ`→`a`, `ADV`→`r`. No other UPOS maps.
- `cache/` is for downloaded corpora and is gitignored per-directory (see `.gitignore:187`, `cache/gutenberg/`).

---

## File Structure

| File | Responsibility | New? |
|---|---|---|
| `codex/core/constellation/treebank.js` | Pure CoNLL-U reader; gold answer and gold POS projections | create |
| `codex/core/constellation/failure-diagnosis.js` | Pure outcome classification and minimal-unreachable-subtree frontier | create |
| `codex/core/constellation/treebank-metrics.js` | Pure aggregation of per-sentence rows into the report tables | create |
| `scripts/fetch-ud-treebank.mjs` | Download EWT train/dev/test into `cache/ud/` | create |
| `scripts/treebank-report.mjs` | Runner: load corpus + lexicon, run `compose` twice, aggregate, print | create |
| `tests/qa/features/constellation-treebank.test.js` | Tests for the reader | create |
| `tests/qa/features/constellation-failure-diagnosis.test.js` | Tests for the diagnoser | create |
| `tests/qa/features/constellation-treebank-metrics.test.js` | Tests for the aggregator | create |
| `.gitignore` | Add `cache/ud/` | modify |
| `package.json` | Add `treebank:fetch` and `treebank:report` scripts | modify |

---

## Task 1: CoNLL-U reader and gold projections

**Files:**
- Create: `codex/core/constellation/treebank.js`
- Test: `tests/qa/features/constellation-treebank.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `parseConllu(text: string) => Array<{sentId: string|null, text: string|null, tokens: Token[]}>` where `Token = {id: number, form: string, lemma: string, upos: string, head: number, deprel: string}`
  - `goldAnswer(record) => {subject: string|null, verb: string|null}`
  - `goldPosMap(record) => Map<string, string[]>`

- [ ] **Step 1: Write the failing test**

Create `tests/qa/features/constellation-treebank.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { parseConllu, goldAnswer, goldPosMap } from '../../../codex/core/constellation/treebank.js';

/**
 * A real EWT sentence. The subject is token 6 and the root is token 4 —
 * `projectAnswer` reads the subject positionally from `parts[0]`, so this is
 * the shape that coverage-only measurement cannot see going wrong.
 */
const INVERTED = `# sent_id = ewt-0001
# text = From the AP comes this story :
1\tFrom\tfrom\tADP\tIN\t_\t3\tcase\t3:case\t_
2\tthe\tthe\tDET\tDT\t_\t3\tdet\t3:det\t_
3\tAP\tAP\tPROPN\tNNP\t_\t4\tobl\t4:obl\t_
4\tcomes\tcome\tVERB\tVBZ\t_\t0\troot\t0:root\t_
5\tthis\tthis\tDET\tDT\t_\t6\tdet\t6:det\t_
6\tstory\tstory\tNOUN\tNN\t_\t4\tnsubj\t4:nsubj\t_
7\t:\t:\tPUNCT\t:\t_\t4\tpunct\t4:punct\t_
`;

/** A range line and an empty node. Neither is a token. */
const RANGE_AND_EMPTY = `# sent_id = ewt-0002
# text = I don't know
1\tI\tI\tPRON\tPRP\t_\t4\tnsubj\t4:nsubj\t_
2-3\tdon't\t_\t_\t_\t_\t_\t_\t_\t_
2\tdo\tdo\tAUX\tVBP\t_\t4\taux\t4:aux\t_
3\tn't\tnot\tPART\tRB\t_\t4\tadvmod\t4:advmod\t_
4\tknow\tknow\tVERB\tVB\t_\t0\troot\t0:root\t_
4.1\t_\t_\t_\t_\t_\t_\t_\t4:orphan\t_
`;

/** Web text roots on a noun. There is no verb, and inventing one would lie. */
const NOMINAL_ROOT = `# sent_id = ewt-0003
# text = Great food !
1\tGreat\tgreat\tADJ\tJJ\t_\t2\tamod\t2:amod\t_
2\tfood\tfood\tNOUN\tNN\t_\t0\troot\t0:root\t_
3\t!\t!\tPUNCT\t.\t_\t2\tpunct\t2:punct\t_
`;

describe('parseConllu', () => {
  it('reads sent_id, text and tokens from a sentence block', () => {
    const [r] = parseConllu(INVERTED);
    expect(r.sentId).toBe('ewt-0001');
    expect(r.text).toBe('From the AP comes this story :');
    expect(r.tokens).toHaveLength(7);
    expect(r.tokens[3]).toMatchObject({ id: 4, form: 'comes', upos: 'VERB', head: 0, deprel: 'root' });
  });

  it('skips range lines and empty nodes, which are not tokens', () => {
    const [r] = parseConllu(RANGE_AND_EMPTY);
    expect(r.tokens.map((t) => t.id)).toEqual([1, 2, 3, 4]);
    expect(r.tokens.map((t) => t.form)).toEqual(['I', 'do', "n't", 'know']);
  });

  it('separates sentences on blank lines', () => {
    const records = parseConllu(`${INVERTED}\n${NOMINAL_ROOT}`);
    expect(records).toHaveLength(2);
    expect(records[1].sentId).toBe('ewt-0003');
  });
});

describe('goldAnswer', () => {
  it('reads the subject from the nsubj edge, not from position', () => {
    const [r] = parseConllu(INVERTED);
    expect(goldAnswer(r)).toEqual({ subject: 'story', verb: 'comes' });
  });

  it('carries a non-verbal root rather than dropping it', () => {
    const [r] = parseConllu(NOMINAL_ROOT);
    expect(goldAnswer(r)).toEqual({ subject: null, verb: 'food' });
  });

  it('returns nulls when there is no root', () => {
    expect(goldAnswer({ tokens: [] })).toEqual({ subject: null, verb: null });
  });
});

describe('goldPosMap', () => {
  it('maps only the four lexical UPOS values', () => {
    const [r] = parseConllu(INVERTED);
    const map = goldPosMap(r);
    expect(map.get('ap')).toEqual(['n']);
    expect(map.get('comes')).toEqual(['v']);
    expect(map.get('story')).toEqual(['n']);
    expect(map.get('the')).toEqual([]);
    expect(map.get('from')).toEqual([]);
  });

  it('unions tags when a form appears twice with different UPOS', () => {
    const record = {
      tokens: [
        { id: 1, form: 'run', lemma: 'run', upos: 'VERB', head: 0, deprel: 'root' },
        { id: 2, form: 'run', lemma: 'run', upos: 'NOUN', head: 1, deprel: 'obj' },
      ],
    };
    expect(goldPosMap(record).get('run').sort()).toEqual(['n', 'v']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/constellation-treebank.test.js`
Expected: FAIL — `Failed to resolve import ".../treebank.js"`.

- [ ] **Step 3: Write minimal implementation**

Create `codex/core/constellation/treebank.js`:

```js
/**
 * A GOLD TREEBANK READER.
 *
 * Coverage — "did some molecule of type S span the input" — cannot say whether
 * a parse is right. A sentence that spans with the wrong subject scores as a
 * success, so 36.6% coverage is consistent with any accuracy including zero.
 * This module supplies the other half: a human annotation the parser can
 * disagree with.
 *
 * The gold is Universal Dependencies English-EWT (CC BY-SA 4.0). A dependency
 * treebank fits without conversion because `projectAnswer` returns
 * `{subject, verb}` = `headOf(parts[0])`, `headOf(parts[1])`, which in
 * dependency terms is exactly `nsubj` + `root`.
 */

/**
 * Which UPOS values name a lexical category `compose` can type an atom with.
 * Everything else — DET, ADP, PRON, AUX, CCONJ, SCONJ, PART, NUM, PUNCT, INTJ,
 * SYM, X — is absent on purpose: `atomsFor` types those from its closed-class
 * sets keyed on the literal word, and a POS entry for them would say nothing.
 */
const UPOS_TO_TAG = new Map([
  ['NOUN', 'n'], ['PROPN', 'n'], ['VERB', 'v'], ['ADJ', 'a'], ['ADV', 'r'],
]);

/**
 * Read CoNLL-U text into sentence records.
 *
 * @param {string} text
 * @returns {Array<{sentId: string|null, text: string|null, tokens: Array<{id: number, form: string, lemma: string, upos: string, head: number, deprel: string}>}>}
 */
export function parseConllu(text) {
  const records = [];
  let sentId = null;
  let sentText = null;
  let tokens = [];

  const flush = () => {
    if (tokens.length > 0) records.push({ sentId, text: sentText, tokens });
    sentId = null;
    sentText = null;
    tokens = [];
  };

  for (const rawLine of String(text || '').split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (line.trim() === '') { flush(); continue; }
    if (line.startsWith('#')) {
      const meta = /^#\s*(sent_id|text)\s*=\s*(.*)$/.exec(line);
      if (meta && meta[1] === 'sent_id') sentId = meta[2].trim();
      if (meta && meta[1] === 'text') sentText = meta[2].trim();
      continue;
    }
    const fields = line.split('\t');
    if (fields.length < 8) continue;
    const id = fields[0];
    /**
     * A RANGE LINE (`2-3  don't`) is a surface form covering two tokens, and an
     * EMPTY NODE (`4.1`) is an elided element with no surface form. Counting
     * either as a token misaligns every index downstream of here.
     */
    if (id.includes('-') || id.includes('.')) continue;
    tokens.push({
      id: Number(id),
      form: fields[1],
      lemma: fields[2],
      upos: fields[3],
      head: Number(fields[6]),
      deprel: fields[7],
    });
  }
  flush();
  return records;
}

/**
 * The gold answer for the anchor query, in the shape `projectAnswer` returns.
 *
 * The subject is read from the `nsubj` edge rather than from position, because
 * English inverts: `From the AP comes this story` has its subject after the
 * verb. `root` may be non-verbal — web text roots on nouns (`Great food !`) —
 * and that is carried as-is rather than dropped, because a missing verb is a
 * fact about the sentence, not about the reader.
 *
 * @param {object} record
 * @returns {{subject: string|null, verb: string|null}}
 */
export function goldAnswer(record) {
  const tokens = (record && record.tokens) || [];
  const root = tokens.find((t) => t.head === 0);
  if (!root) return { subject: null, verb: null };
  const subject = tokens.find(
    (t) => t.head === root.id && (t.deprel === 'nsubj' || t.deprel === 'nsubj:pass'),
  );
  return { subject: subject ? subject.form : null, verb: root.form };
}

/**
 * An ORACLE POS table for one sentence, in the shape `compose` consumes.
 *
 * A form whose UPOS is not lexical maps to an EMPTY array rather than being
 * absent, which records that gold saw the word and assigned it no lexical
 * reading. Note that an empty array does not suppress `guessPos` inside
 * `atomsFor` — the oracle is therefore not perfectly clean, and the runner
 * measures how dirty it is instead of assuming.
 *
 * @param {object} record
 * @returns {Map<string, string[]>}
 */
export function goldPosMap(record) {
  const map = new Map();
  for (const token of (record && record.tokens) || []) {
    const key = String(token.form).toLowerCase();
    const tag = UPOS_TO_TAG.get(token.upos);
    if (!tag) {
      if (!map.has(key)) map.set(key, []);
      continue;
    }
    const existing = map.get(key);
    if (existing && existing.length > 0) {
      if (!existing.includes(tag)) existing.push(tag);
    } else {
      map.set(key, [tag]);
    }
  }
  return map;
}

export { UPOS_TO_TAG };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/constellation-treebank.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add codex/core/constellation/treebank.js tests/qa/features/constellation-treebank.test.js
git commit -m "feat(constellation): a gold treebank reader the parser can disagree with

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Treebank fetch script

**Files:**
- Create: `scripts/fetch-ud-treebank.mjs`
- Modify: `.gitignore` (append after the existing `cache/pg_catalog.csv` line, currently `.gitignore:188`)
- Modify: `package.json` (`scripts` block)

**Interfaces:**
- Consumes: nothing.
- Produces: files at `cache/ud/en_ewt-ud-{train,dev,test}.conllu`, read by Task 6's runner.

- [ ] **Step 1: Add the cache directory to .gitignore**

Append to `.gitignore` immediately after the line `cache/pg_catalog.csv`:

```
# Universal Dependencies English-EWT — gold treebank, fetched by
# scripts/fetch-ud-treebank.mjs. CC BY-SA 4.0, not vendored.
cache/ud/
```

- [ ] **Step 2: Write the fetch script**

Create `scripts/fetch-ud-treebank.mjs`:

```js
/**
 * Fetch Universal Dependencies English-EWT into `cache/ud/`.
 *
 * The treebank is NOT vendored into the repo — only this script is, so any
 * number the report prints is reproducible from a clean clone with one command.
 * EWT is CC BY-SA 4.0 and human-annotated, which is the whole point: a gold set
 * annotated by the same model that wrote the parser is partly self-agreement.
 *
 * Idempotent: an existing non-empty file is left alone.
 */
import { mkdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const BASE = 'https://raw.githubusercontent.com/UniversalDependencies/UD_English-EWT/master';
const FILES = ['en_ewt-ud-train.conllu', 'en_ewt-ud-dev.conllu', 'en_ewt-ud-test.conllu'];
const OUT_DIR = path.resolve('cache/ud');

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const name of FILES) {
    const dest = path.join(OUT_DIR, name);
    if (existsSync(dest) && statSync(dest).size > 0) {
      console.log(`skip  ${name}  (${statSync(dest).size} bytes already present)`);
      continue;
    }
    const url = `${BASE}/${name}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${url} -> HTTP ${response.status}`);
    }
    const body = await response.text();
    if (body.length === 0) throw new Error(`${url} -> empty body`);
    writeFileSync(dest, body, 'utf8');
    console.log(`fetch ${name}  ${body.length} bytes`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
```

- [ ] **Step 3: Add npm scripts**

In `package.json`, inside the `"scripts"` block, add these two entries next to the other `test:qa:*` entries:

```json
    "treebank:fetch": "node scripts/fetch-ud-treebank.mjs",
    "treebank:report": "node scripts/treebank-report.mjs",
```

- [ ] **Step 4: Run the fetch and verify**

Run: `npm run treebank:fetch`
Expected: three `fetch ...` lines, no error.

Then verify it is idempotent and the content parses:

Run:
```bash
npm run treebank:fetch
node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { parseConllu, goldAnswer } from './codex/core/constellation/treebank.js';
const r = parseConllu(readFileSync('cache/ud/en_ewt-ud-dev.conllu','utf8'));
console.log('sentences', r.length);
console.log('first', r[0].text, '->', goldAnswer(r[0]));
"
```
Expected: the second `treebank:fetch` prints three `skip` lines. The node command prints roughly `sentences 2002` and `first From the AP comes this story : -> { subject: 'story', verb: 'comes' }`.

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch-ud-treebank.mjs .gitignore package.json
git commit -m "feat(constellation): fetch UD English-EWT into a gitignored cache

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Failure diagnosis — outcomes and the minimal unreachable frontier

**Files:**
- Create: `codex/core/constellation/failure-diagnosis.js`
- Test: `tests/qa/features/constellation-failure-diagnosis.test.js`

**Interfaces:**
- Consumes: `parseConllu` records from Task 1; `compose()` results (`{atoms, molecules, spanning, stable}`, each molecule carrying `type`, `from`, `to`).
- Produces:
  - `OUTCOME` — frozen object with keys `PARSED`, `LEXICAL`, `GRAMMAR`, `ROOT_TYPE_MISMATCH`, each mapping to its own name as a string.
  - `diagnose(record, result, goldResult = null) => {outcome: string, overGenerated: boolean, categories: Category[], nonProjective: number}` where `Category = {deprel: string, label: string, from: number, to: number}`.

- [ ] **Step 1: Write the failing test**

Create `tests/qa/features/constellation-failure-diagnosis.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { diagnose, OUTCOME } from '../../../codex/core/constellation/failure-diagnosis.js';

/** `the dog barked` — det(dog<-the), nsubj(barked<-dog), root(barked). */
const DOG = {
  tokens: [
    { id: 1, form: 'the', lemma: 'the', upos: 'DET', head: 2, deprel: 'det' },
    { id: 2, form: 'dog', lemma: 'dog', upos: 'NOUN', head: 3, deprel: 'nsubj' },
    { id: 3, form: 'barked', lemma: 'bark', upos: 'VERB', head: 0, deprel: 'root' },
  ],
};

const molecule = (type, from, to) => ({ type, from, to, parts: [] });
const result = (molecules, spanning = [], stable = []) => ({
  atoms: [], molecules, spanning, stable,
});

describe('diagnose', () => {
  it('reports PARSED when a spanning S exists', () => {
    const r = result([molecule('S', 0, 2)], [molecule('S', 0, 2)], [molecule('S', 0, 2)]);
    expect(diagnose(DOG, r)).toMatchObject({ outcome: OUTCOME.PARSED, categories: [] });
  });

  /**
   * The 2x2's top-right cell: the parse exists only because the POS table was
   * vague. Coverage counts it as a clean win, so it has to be flagged.
   */
  it('flags a parse that gold POS forbids as overGenerated', () => {
    const real = result([molecule('S', 0, 2)], [molecule('S', 0, 2)], [molecule('S', 0, 2)]);
    const gold = result([], [], []);
    expect(diagnose(DOG, real, gold).overGenerated).toBe(true);
  });

  it('reports LEXICAL when gold POS parses what the real table could not', () => {
    const real = result([molecule('N', 1, 1)], [], []);
    const gold = result([molecule('S', 0, 2)], [molecule('S', 0, 2)], [molecule('S', 0, 2)]);
    expect(diagnose(DOG, real, gold).outcome).toBe(OUTCOME.LEXICAL);
  });

  /**
   * The `(end)` blocker shape: the chart reached the top and failed a type
   * check. That is not a missing construction and must not be counted as one.
   */
  it('reports ROOT_TYPE_MISMATCH when the chart spans but the root type is wrong', () => {
    const np = molecule('NP', 0, 2);
    const r = result([np], [np], []);
    expect(diagnose(DOG, r)).toMatchObject({ outcome: OUTCOME.ROOT_TYPE_MISMATCH, categories: [] });
  });

  it('names the minimal unreachable subtree by its deprel and head UPOS', () => {
    // `the dog` composed; `barked` typed; the join to a clause did not happen.
    const r = result([
      molecule('DET', 0, 0), molecule('N', 1, 1), molecule('NP', 0, 1), molecule('V', 2, 2),
    ], [], []);
    const d = diagnose(DOG, r);
    expect(d.outcome).toBe(OUTCOME.GRAMMAR);
    expect(d.categories).toHaveLength(1);
    expect(d.categories[0]).toMatchObject({
      deprel: 'root', label: 'root (VERB -> ROOT)', from: 0, to: 2,
    });
  });

  it('reports only the minimal site, never an ancestor of one', () => {
    // Nothing above the atoms composed: `dog`'s subtree (the dog) is already
    // unreachable, so `barked`'s must not also be reported.
    const r = result([
      molecule('DET', 0, 0), molecule('N', 1, 1), molecule('V', 2, 2),
    ], [], []);
    const d = diagnose(DOG, r);
    expect(d.categories.map((c) => c.deprel)).toEqual(['nsubj']);
  });

  it('locates the site at the subtree of an untyped token', () => {
    // No molecule at 1:1 at all — `dog` received no atom. The reported span is
    // `dog`'s subtree (`the dog`, 0:1), which is the constituent that failed.
    const r = result([molecule('DET', 0, 0), molecule('V', 2, 2)], [], []);
    const d = diagnose(DOG, r);
    expect(d.categories.map((c) => c.deprel)).toEqual(['nsubj']);
    expect(d.categories[0]).toMatchObject({ from: 0, to: 1 });
  });

  /**
   * A discontinuous gold subtree has no single span, so span-based reachability
   * is meaningless for it. Counting it is honest; guessing about it is not.
   *
   * `A hearing is scheduled on the issue today` — `on the issue` modifies
   * `hearing`, which sits at index 1, so `hearing`'s subtree is {0,1,4,5,6}:
   * five tokens across a seven-wide span. The edge crosses `is scheduled`.
   */
  it('counts a non-projective subtree instead of categorising it', () => {
    const nonProjective = {
      tokens: [
        { id: 1, form: 'A', lemma: 'a', upos: 'DET', head: 2, deprel: 'det' },
        { id: 2, form: 'hearing', lemma: 'hearing', upos: 'NOUN', head: 4, deprel: 'nsubj:pass' },
        { id: 3, form: 'is', lemma: 'be', upos: 'AUX', head: 4, deprel: 'aux:pass' },
        { id: 4, form: 'scheduled', lemma: 'schedule', upos: 'VERB', head: 0, deprel: 'root' },
        { id: 5, form: 'on', lemma: 'on', upos: 'ADP', head: 7, deprel: 'case' },
        { id: 6, form: 'the', lemma: 'the', upos: 'DET', head: 7, deprel: 'det' },
        { id: 7, form: 'issue', lemma: 'issue', upos: 'NOUN', head: 2, deprel: 'nmod' },
        { id: 8, form: 'today', lemma: 'today', upos: 'NOUN', head: 4, deprel: 'obl' },
      ],
    };
    const d = diagnose(nonProjective, result([], [], []));
    expect(d.nonProjective).toBe(1);
    // `hearing` is undiagnosable, so `scheduled` above it must not be named.
    expect(d.categories.map((c) => c.deprel)).not.toContain('root');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/constellation-failure-diagnosis.test.js`
Expected: FAIL — `Failed to resolve import ".../failure-diagnosis.js"`.

- [ ] **Step 3: Write minimal implementation**

Create `codex/core/constellation/failure-diagnosis.js`:

```js
/**
 * TURNING A PARSE FAILURE INTO A LOCATED, NAMED CATEGORY.
 *
 * The predecessor of this module asked whether a failing sentence CONTAINED a
 * hand-listed marker. That is correlational: a marker equally common in
 * successes is not a blocker, and the list is blind to anything not on it.
 *
 * This asks a causal question instead. The gold tree gives the correct
 * bracketing; the chart gives how far up the composer actually got. The
 * diagnosis is the frontier between them — the lowest gold subtrees the chart
 * failed to build. Location comes from the chart, the NAME comes from the UD
 * annotators, and the ranking comes from our own failures. The external
 * resource supplies vocabulary, never a priority ordering.
 */

/**
 * @type {Readonly<{PARSED: string, LEXICAL: string, GRAMMAR: string, ROOT_TYPE_MISMATCH: string}>}
 */
export const OUTCOME = Object.freeze({
  PARSED: 'PARSED',
  LEXICAL: 'LEXICAL',
  GRAMMAR: 'GRAMMAR',
  ROOT_TYPE_MISMATCH: 'ROOT_TYPE_MISMATCH',
});

/**
 * Token span of every gold subtree, by head id.
 *
 * `contiguous` is false when the subtree's tokens are discontinuous — a
 * non-projective dependency. Such a subtree has no single span, so asking the
 * chart whether it built one is not a question the chart can answer.
 */
function subtreeSpans(tokens) {
  const children = new Map();
  for (const token of tokens) {
    if (!children.has(token.head)) children.set(token.head, []);
    children.get(token.head).push(token.id);
  }
  const spans = new Map();
  const visiting = new Set();

  const visit = (id) => {
    if (spans.has(id)) return spans.get(id);
    // A malformed file could cycle. Treat a re-entry as a leaf rather than
    // overflowing the stack, because a crashed runner diagnoses nothing.
    if (visiting.has(id)) return { min: id - 1, max: id - 1, size: 1, contiguous: true };
    visiting.add(id);
    let min = id - 1;
    let max = id - 1;
    let size = 1;
    for (const child of children.get(id) || []) {
      const span = visit(child);
      if (span.min < min) min = span.min;
      if (span.max > max) max = span.max;
      size += span.size;
    }
    visiting.delete(id);
    const out = { min, max, size, contiguous: max - min + 1 === size };
    spans.set(id, out);
    return out;
  };

  for (const token of tokens) visit(token.id);
  return { spans, children };
}

/**
 * The minimal unreachable subtrees: every child reachable, the subtree itself
 * not. Reporting an ancestor as well would name a site that was never going to
 * build, and reporting a descendant's parent instead of the descendant would
 * point past the actual stopping point.
 */
function minimalUnreachable(tokens, result) {
  const cells = new Set();
  for (const molecule of (result && result.molecules) || []) {
    cells.add(`${molecule.from}:${molecule.to}`);
  }
  const { spans, children } = subtreeSpans(tokens);
  const byId = new Map(tokens.map((token) => [token.id, token]));

  let nonProjective = 0;
  /** true | false | null, where null means "not a question spans can answer". */
  const reachable = new Map();
  for (const token of tokens) {
    const span = spans.get(token.id);
    if (!span.contiguous) {
      nonProjective += 1;
      reachable.set(token.id, null);
      continue;
    }
    reachable.set(token.id, cells.has(`${span.min}:${span.max}`));
  }

  const categories = [];
  for (const token of tokens) {
    if (reachable.get(token.id) !== false) continue;
    const kids = children.get(token.id) || [];
    // A non-projective child leaves this site undiagnosable, not diagnosed.
    if (!kids.every((child) => reachable.get(child) === true)) continue;
    const head = byId.get(token.head);
    const span = spans.get(token.id);
    categories.push({
      deprel: token.deprel,
      label: `${token.deprel} (${token.upos} -> ${head ? head.upos : 'ROOT'})`,
      from: span.min,
      to: span.max,
    });
  }
  return { categories, nonProjective };
}

/**
 * Classify one sentence.
 *
 * PRECEDENCE. `LEXICAL` outranks `ROOT_TYPE_MISMATCH`: if gold POS makes the
 * sentence parse, the cause is tagging by definition, and that is the more
 * actionable of the two.
 *
 * `ROOT_TYPE_MISMATCH` is read off `spanning` and `stable` directly — the chart
 * reached the top and the molecule there was not a root type. That is the
 * `(end)`-blocker shape, where sentences composed fully and failed a type
 * check, and it is a different thing from a missing construction.
 *
 * @param {object} record from `parseConllu`
 * @param {object} result `compose(tokens, realPosMap)`
 * @param {object|null} goldResult `compose(tokens, goldPosMap(record))`, or null
 *   when the ablation was not run
 * @returns {{outcome: string, overGenerated: boolean, categories: Array<{deprel: string, label: string, from: number, to: number}>, nonProjective: number}}
 */
export function diagnose(record, result, goldResult = null) {
  const tokens = (record && record.tokens) || [];
  const parsed = Boolean(result && result.stable && result.stable.length > 0);
  const goldParsed = Boolean(goldResult && goldResult.stable && goldResult.stable.length > 0);

  if (parsed) {
    return {
      outcome: OUTCOME.PARSED,
      overGenerated: Boolean(goldResult) && !goldParsed,
      categories: [],
      nonProjective: 0,
    };
  }

  const frontier = minimalUnreachable(tokens, result);

  if (goldParsed) {
    return { outcome: OUTCOME.LEXICAL, overGenerated: false, ...frontier };
  }
  if (result && result.spanning && result.spanning.length > 0) {
    return {
      outcome: OUTCOME.ROOT_TYPE_MISMATCH,
      overGenerated: false,
      categories: [],
      nonProjective: frontier.nonProjective,
    };
  }
  return { outcome: OUTCOME.GRAMMAR, overGenerated: false, ...frontier };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/constellation-failure-diagnosis.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add codex/core/constellation/failure-diagnosis.js tests/qa/features/constellation-failure-diagnosis.test.js
git commit -m "feat(constellation): failure diagnosis by minimal unreachable subtree

Location from the chart, name from the annotators, ranking from our failures.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Off-gold frontier signature

**Files:**
- Modify: `codex/core/constellation/failure-diagnosis.js` (append)
- Test: `tests/qa/features/constellation-failure-diagnosis.test.js` (append a describe block)

**Interfaces:**
- Consumes: a `compose()` result.
- Produces: `frontierSignature(result, tokenCount) => string` — space-joined molecule types of the greedy maximal tiling, with `?` for a position no molecule starts at.

- [ ] **Step 1: Write the failing test**

Append to `tests/qa/features/constellation-failure-diagnosis.test.js`:

```js
import { frontierSignature } from '../../../codex/core/constellation/failure-diagnosis.js';

describe('frontierSignature', () => {
  it('tiles the input with the widest molecule starting at each position', () => {
    const r = result([
      molecule('DET', 0, 0), molecule('N', 1, 1), molecule('NP', 0, 1), molecule('V', 2, 2),
    ]);
    expect(frontierSignature(r, 3)).toBe('NP V');
  });

  it('marks a position no molecule starts at, rather than skipping it', () => {
    const r = result([molecule('DET', 0, 0), molecule('V', 2, 2)]);
    expect(frontierSignature(r, 3)).toBe('DET ? V');
  });

  it('is empty for an empty chart over zero tokens', () => {
    expect(frontierSignature(result([]), 0)).toBe('');
  });
});
```

Move the `import { frontierSignature }` line up into the existing import at the top of the file so there is one import from that module:

```js
import { diagnose, frontierSignature, OUTCOME } from '../../../codex/core/constellation/failure-diagnosis.js';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/constellation-failure-diagnosis.test.js -t frontierSignature`
Expected: FAIL — `frontierSignature is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `codex/core/constellation/failure-diagnosis.js`:

```js
/**
 * A signature for text with NO gold tree — the Gutenberg corpus every prior
 * coverage number was measured against.
 *
 * The greedy maximal tiling is where the chart stopped, expressed as a type
 * sequence. It is deliberately NOT given a construction name here: a name is
 * earned only by matching a signature to a deprel category on the golded side.
 * The caller reports unmatched signatures as UNCLASSIFIED with a count, because
 * a classifier with an "other" bucket always achieves 100% coverage.
 *
 * Ties are broken by first appearance, which is deterministic given that
 * `compose` enumerates its chart in a fixed order.
 *
 * @param {object} result
 * @param {number} tokenCount
 * @returns {string}
 */
export function frontierSignature(result, tokenCount) {
  const widest = new Map();
  for (const molecule of (result && result.molecules) || []) {
    const current = widest.get(molecule.from);
    if (!current || molecule.to > current.to) widest.set(molecule.from, molecule);
  }
  const out = [];
  let at = 0;
  while (at < tokenCount) {
    const molecule = widest.get(at);
    if (!molecule) { out.push('?'); at += 1; continue; }
    out.push(molecule.type);
    at = molecule.to + 1;
  }
  return out.join(' ');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/constellation-failure-diagnosis.test.js`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add codex/core/constellation/failure-diagnosis.js tests/qa/features/constellation-failure-diagnosis.test.js
git commit -m "feat(constellation): frontier signature for text with no gold tree

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Metrics aggregation

**Files:**
- Create: `codex/core/constellation/treebank-metrics.js`
- Test: `tests/qa/features/constellation-treebank-metrics.test.js`

**Interfaces:**
- Consumes: `OUTCOME` from Task 3.
- Produces: `summarize(rows) => Report`, where a row is

  ```js
  {
    outcome: string,          // an OUTCOME value
    overGenerated: boolean,
    categories: Array<{deprel: string, label: string, from: number, to: number}>,
    nonProjective: number,
    rootUpos: string,         // gold root's UPOS, or 'NONE'
    contained: boolean,       // gold answer is among the projected answers
    decided: boolean|null,    // top-ranked parse projects to the gold answer;
                              // null when no sense source was available
  }
  ```

  and `Report` is

  ```js
  {
    n: number,
    coverage: number,
    containment: number,
    decision: number|null,
    byRootUpos: Array<{upos: string, n: number, coverage: number, containment: number}>,
    ablation: {bothFine: number, overGenerated: number, tagging: number, grammar: number},
    categories: Array<{label: string, deprel: string, failures: number, soleCause: number}>,
    classifier: {failures: number, withCategory: number, meanCauses: number},
    nonProjective: number,
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/qa/features/constellation-treebank-metrics.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { summarize } from '../../../codex/core/constellation/treebank-metrics.js';
import { OUTCOME } from '../../../codex/core/constellation/failure-diagnosis.js';

const row = (over) => ({
  outcome: OUTCOME.PARSED, overGenerated: false, categories: [], nonProjective: 0,
  rootUpos: 'VERB', contained: true, decided: true, ...over,
});

describe('summarize', () => {
  it('separates coverage from containment from decision', () => {
    const report = summarize([
      row({}),
      row({ contained: false, decided: false }),
      row({ outcome: OUTCOME.GRAMMAR, contained: false, decided: false }),
    ]);
    expect(report.n).toBe(3);
    expect(report.coverage).toBeCloseTo(2 / 3);
    expect(report.containment).toBeCloseTo(1 / 3);
    expect(report.decision).toBeCloseTo(1 / 3);
  });

  /**
   * With no sense counts every attraction score is 1, ties keep insertion
   * order, and `decision` would silently become "the first parse the chart
   * enumerated" while still printing as an accuracy.
   */
  it('reports decision as null when any row could not be decided', () => {
    const report = summarize([row({ decided: null }), row({})]);
    expect(report.decision).toBeNull();
    expect(report.coverage).toBe(1);
  });

  it('fills the POS ablation 2x2', () => {
    const report = summarize([
      row({}),
      row({ overGenerated: true }),
      row({ outcome: OUTCOME.LEXICAL }),
      row({ outcome: OUTCOME.GRAMMAR }),
      row({ outcome: OUTCOME.ROOT_TYPE_MISMATCH }),
    ]);
    expect(report.ablation).toEqual({
      bothFine: 1, overGenerated: 1, tagging: 1, grammar: 2,
    });
  });

  it('ranks categories by failure count and counts sole causes separately', () => {
    const xcomp = { deprel: 'xcomp', label: 'xcomp (VERB -> VERB)', from: 0, to: 2 };
    const advcl = { deprel: 'advcl', label: 'advcl (VERB -> VERB)', from: 3, to: 5 };
    const report = summarize([
      row({ outcome: OUTCOME.GRAMMAR, categories: [xcomp] }),
      row({ outcome: OUTCOME.GRAMMAR, categories: [xcomp] }),
      row({ outcome: OUTCOME.GRAMMAR, categories: [xcomp, advcl] }),
    ]);
    expect(report.categories[0]).toMatchObject({
      label: 'xcomp (VERB -> VERB)', failures: 3, soleCause: 2,
    });
    expect(report.categories[1]).toMatchObject({
      label: 'advcl (VERB -> VERB)', failures: 1, soleCause: 0,
    });
  });

  /**
   * An instrument that explains every failure and assigns four causes to each
   * is a horoscope. The report has to expose that rather than hide it.
   */
  it('reports how much of the failure set it actually classified', () => {
    const cat = { deprel: 'conj', label: 'conj (VERB -> VERB)', from: 0, to: 1 };
    const report = summarize([
      row({ outcome: OUTCOME.GRAMMAR, categories: [cat, cat] }),
      row({ outcome: OUTCOME.ROOT_TYPE_MISMATCH, categories: [] }),
      row({}),
    ]);
    expect(report.classifier).toEqual({ failures: 2, withCategory: 1, meanCauses: 1 });
  });

  it('breaks out by root UPOS instead of averaging over fragments', () => {
    const report = summarize([
      row({ rootUpos: 'VERB' }),
      row({ rootUpos: 'NOUN', outcome: OUTCOME.GRAMMAR, contained: false }),
      row({ rootUpos: 'NOUN', outcome: OUTCOME.GRAMMAR, contained: false }),
    ]);
    const noun = report.byRootUpos.find((b) => b.upos === 'NOUN');
    expect(noun).toMatchObject({ n: 2, coverage: 0, containment: 0 });
  });

  it('returns zeroes rather than NaN for an empty run', () => {
    const report = summarize([]);
    expect(report).toMatchObject({ n: 0, coverage: 0, containment: 0, decision: 0 });
    expect(report.categories).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/constellation-treebank-metrics.test.js`
Expected: FAIL — `Failed to resolve import ".../treebank-metrics.js"`.

- [ ] **Step 3: Write minimal implementation**

Create `codex/core/constellation/treebank-metrics.js`:

```js
/**
 * AGGREGATION FOR THE TREEBANK REPORT.
 *
 * Coverage is one number and it hides three. A sentence that spans as S with
 * the wrong subject is a success under coverage and a failure under both of the
 * others, so they are reported side by side and never collapsed.
 */
import { OUTCOME } from './failure-diagnosis.js';

const ratio = (part, whole) => (whole === 0 ? 0 : part / whole);

/**
 * @param {Array<object>} rows one per sentence; see the plan's Interfaces block
 * @returns {object} the report
 */
export function summarize(rows) {
  const all = rows || [];
  const n = all.length;
  const parsed = all.filter((r) => r.outcome === OUTCOME.PARSED);
  const failures = all.filter((r) => r.outcome !== OUTCOME.PARSED);

  /**
   * DECISION IS NULL, NOT ZERO, WHEN IT COULD NOT BE TAKEN. Substituting a
   * number here would print a metric for a measurement nobody made.
   */
  const undecidable = all.some((r) => r.decided === null);
  const decision = undecidable ? null : ratio(all.filter((r) => r.decided === true).length, n);

  const byUpos = new Map();
  for (const r of all) {
    const key = r.rootUpos || 'NONE';
    if (!byUpos.has(key)) byUpos.set(key, []);
    byUpos.get(key).push(r);
  }
  const byRootUpos = [...byUpos.entries()]
    .map(([upos, group]) => ({
      upos,
      n: group.length,
      coverage: ratio(group.filter((r) => r.outcome === OUTCOME.PARSED).length, group.length),
      containment: ratio(group.filter((r) => r.contained === true).length, group.length),
    }))
    .sort((a, b) => b.n - a.n);

  const ablation = {
    bothFine: parsed.filter((r) => !r.overGenerated).length,
    overGenerated: parsed.filter((r) => r.overGenerated).length,
    tagging: all.filter((r) => r.outcome === OUTCOME.LEXICAL).length,
    grammar: all.filter(
      (r) => r.outcome === OUTCOME.GRAMMAR || r.outcome === OUTCOME.ROOT_TYPE_MISMATCH,
    ).length,
  };

  const counts = new Map();
  for (const r of failures) {
    const labels = new Set((r.categories || []).map((c) => c.label));
    for (const label of labels) {
      if (!counts.has(label)) {
        const first = (r.categories || []).find((c) => c.label === label);
        counts.set(label, { label, deprel: first.deprel, failures: 0, soleCause: 0 });
      }
      const entry = counts.get(label);
      entry.failures += 1;
      /**
       * THE FALSIFIABLE PREDICTION. A sentence whose whole frontier is this one
       * category is a sentence that a bond for it would unblock. A sentence
       * with a mixed frontier needs more than one fix and must not be promised.
       */
      if (labels.size === 1) entry.soleCause += 1;
    }
  }
  const categories = [...counts.values()].sort(
    (a, b) => b.failures - a.failures || a.label.localeCompare(b.label),
  );

  const withCategory = failures.filter((r) => (r.categories || []).length > 0);
  const totalCauses = withCategory.reduce(
    (sum, r) => sum + new Set(r.categories.map((c) => c.label)).size,
    0,
  );

  return {
    n,
    coverage: ratio(parsed.length, n),
    containment: ratio(all.filter((r) => r.contained === true).length, n),
    decision: n === 0 ? 0 : decision,
    byRootUpos,
    ablation,
    categories,
    classifier: {
      failures: failures.length,
      withCategory: withCategory.length,
      meanCauses: withCategory.length === 0 ? 0 : totalCauses / withCategory.length,
    },
    nonProjective: all.reduce((sum, r) => sum + (r.nonProjective || 0), 0),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/constellation-treebank-metrics.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add codex/core/constellation/treebank-metrics.js tests/qa/features/constellation-treebank-metrics.test.js
git commit -m "feat(constellation): split coverage into coverage, containment, decision

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: The runner

**Files:**
- Create: `scripts/treebank-report.mjs`
- Reads: `cache/ud/en_ewt-ud-*.conllu`, `scholomance_dict.sqlite`

**Interfaces:**
- Consumes: `parseConllu`, `goldAnswer`, `goldPosMap` (Task 1); `diagnose`, `OUTCOME` (Task 3); `summarize` (Task 5); `compose`, `projectAnswer`, `rankByAttraction`, `guessPos` from `compose.js`; `irregularPos` from `codex/core/lexical-analysis/irregular-forms.js`; `tokenize` from `codex/core/tokenizer.js`.
- Produces: printed tables. No exports.

**Lexicon facts this task depends on** (verified 2026-08-08 against `scholomance_dict.sqlite` at the repo root):
- `lemma_form(surface_lower TEXT, lemma_lower TEXT, pos TEXT, ...)` where `pos` is spelled out: `noun`, `verb`, `adjective`, `adverb`.
- `wordnet_lemma(lemma, lemma_lower, synset_id, sense_rank, pos, ...)` where `pos` is a single letter `n`/`v`/`a`/`r`/`s`. `s` is a satellite adjective and folds into `a`, matching `atomsFor`, which types both as `ADJ`.

- [ ] **Step 1: Write the runner**

Create `scripts/treebank-report.mjs`:

```js
/**
 * THE TREEBANK REPORT.
 *
 * Runs `compose` over UD English-EWT twice per sentence — once with the real
 * lemma_form POS table, once with gold UPOS — and prints what coverage alone
 * could not say: whether the parse is right, and when it is wrong, which gold
 * subtree the chart failed to build.
 *
 * Usage:
 *   node scripts/treebank-report.mjs [--split dev|test|train] [--limit N]
 *
 * The default split is `dev`. `test` is the held-out set: reporting on it while
 * iterating on the grammar makes "coverage went up" and "the eval set was
 * fitted" indistinguishable.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { parseConllu, goldAnswer, goldPosMap } from '../codex/core/constellation/treebank.js';
import { diagnose, frontierSignature, OUTCOME } from '../codex/core/constellation/failure-diagnosis.js';
import { summarize } from '../codex/core/constellation/treebank-metrics.js';
import {
  compose, projectAnswer, rankByAttraction, guessPos,
} from '../codex/core/constellation/compose.js';
import { irregularPos } from '../codex/core/lexical-analysis/irregular-forms.js';
import { tokenize } from '../codex/core/tokenizer.js';

const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const SPLIT = argOf('--split', 'dev');
const LIMIT = Number(argOf('--limit', '0')) || Infinity;

const CORPUS = path.resolve(`cache/ud/en_ewt-ud-${SPLIT}.conllu`);
const DICT = path.resolve('scholomance_dict.sqlite');

if (!existsSync(CORPUS)) {
  console.error(`missing ${CORPUS} — run: npm run treebank:fetch`);
  process.exit(1);
}

const LEMMA_POS = new Map([
  ['noun', 'n'], ['verb', 'v'], ['adjective', 'a'], ['adverb', 'r'],
]);
/** UPOS values that name a lexical category; anything else is not one. */
const LEXICAL_UPOS = new Set(['NOUN', 'PROPN', 'VERB', 'ADJ', 'ADV']);

function loadLexicon() {
  if (!existsSync(DICT)) return { posMap: new Map(), senseMap: null };
  const db = new Database(DICT, { readonly: true });

  const posMap = new Map();
  for (const r of db.prepare('SELECT surface_lower, pos FROM lemma_form').iterate()) {
    const tag = LEMMA_POS.get(r.pos);
    if (!tag) continue;
    const have = posMap.get(r.surface_lower);
    if (have) { if (!have.includes(tag)) have.push(tag); } else posMap.set(r.surface_lower, [tag]);
  }

  const senseMap = new Map();
  const rows = db.prepare(
    'SELECT lemma_lower, pos, COUNT(*) AS n FROM wordnet_lemma GROUP BY lemma_lower, pos',
  ).all();
  for (const r of rows) {
    // Satellite adjectives are adjectives — `atomsFor` types `a` and `s` alike.
    const key = r.pos === 's' ? 'a' : r.pos;
    if (!['n', 'v', 'a', 'r'].includes(key)) continue;
    const entry = senseMap.get(r.lemma_lower) || {};
    entry[key] = (entry[key] || 0) + r.n;
    senseMap.set(r.lemma_lower, entry);
  }
  db.close();
  return { posMap, senseMap: senseMap.size > 0 ? senseMap : null };
}

const { posMap, senseMap } = loadLexicon();
const records = parseConllu(readFileSync(CORPUS, 'utf8'));
const sample = records.slice(0, LIMIT === Infinity ? records.length : LIMIT);

const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

let tokenizerAgree = 0;
let tokenizerTotal = 0;
let oracleLeaks = 0;
let oracleTokens = 0;
const signatures = new Map();

const rows = sample.map((record) => {
  const tokens = record.tokens.map((t) => t.form);
  const gold = goldAnswer(record);
  const goldMap = goldPosMap(record);

  /**
   * ORACLE IMPURITY. An empty POS entry does not stop `atomsFor` falling
   * through to `irregularPos` and `guessPos`, so gold UPOS cannot fully
   * suppress a lexical reading. `during` ends in `-ing` and `several` in `-al`;
   * both pick up a lexical atom gold forbids. Claiming a clean oracle would be
   * a check that cannot fail, so the leak is counted and printed instead.
   */
  for (const t of record.tokens) {
    oracleTokens += 1;
    if (LEXICAL_UPOS.has(t.upos)) continue;
    const lower = String(t.form).toLowerCase();
    if (irregularPos(lower).length > 0 || guessPos(lower).length > 0) oracleLeaks += 1;
  }

  let result;
  let goldResult;
  try {
    result = compose(tokens, posMap);
    goldResult = compose(tokens, goldMap);
  } catch {
    return null;
  }

  const answers = result.stable.map(projectAnswer);
  const contained = answers.some((a) => same(a.subject, gold.subject) && same(a.verb, gold.verb));

  let decided = null;
  if (senseMap) {
    const ranked = rankByAttraction(result.stable, senseMap);
    const top = ranked.length > 0 ? projectAnswer(ranked[0].molecule) : null;
    decided = Boolean(top && same(top.subject, gold.subject) && same(top.verb, gold.verb));
  }

  const d = diagnose(record, result, goldResult);

  if (d.outcome !== OUTCOME.PARSED) {
    // Same signature the off-gold Gutenberg path would produce, recorded here
    // so the two can be matched later. Unnamed on purpose.
    const sig = frontierSignature(result, tokens.length);
    signatures.set(sig, (signatures.get(sig) || 0) + 1);
  }

  const rootToken = record.tokens.find((t) => t.head === 0);
  tokenizerTotal += 1;
  if (record.text && tokenize(record.text).length === tokens.length) tokenizerAgree += 1;

  return {
    outcome: d.outcome,
    overGenerated: d.overGenerated,
    categories: d.categories,
    nonProjective: d.nonProjective,
    rootUpos: rootToken ? rootToken.upos : 'NONE',
    contained,
    decided,
  };
}).filter(Boolean);

const report = summarize(rows);
const pct = (x) => (x === null ? '  null' : `${(x * 100).toFixed(1)}%`);

console.log(`\nUD English-EWT / ${SPLIT} — ${report.n} sentences\n`);
console.log(`coverage      ${pct(report.coverage)}   a spanning S exists`);
console.log(`containment   ${pct(report.containment)}   gold answer is among the projected answers`);
console.log(`decision      ${pct(report.decision)}   top-ranked parse projects to the gold answer`);
if (report.decision === null) {
  console.log('              (no sense source — decision is not reported rather than faked)');
}

console.log('\nby gold root UPOS');
for (const b of report.byRootUpos) {
  console.log(`  ${b.upos.padEnd(6)} n=${String(b.n).padStart(5)}  coverage ${pct(b.coverage)}  containment ${pct(b.containment)}`);
}

console.log('\nPOS ablation (real lemma_form table vs gold UPOS)');
console.log(`  parses with both                  ${report.ablation.bothFine}`);
console.log(`  parses only because POS was vague ${report.ablation.overGenerated}   <- coverage counts these as wins`);
console.log(`  tagging failure                   ${report.ablation.tagging}`);
console.log(`  grammar failure                   ${report.ablation.grammar}`);
console.log(`  oracle impurity: ${oracleLeaks}/${oracleTokens} tokens (${(oracleLeaks / Math.max(oracleTokens, 1) * 100).toFixed(1)}%) got a lexical atom gold forbids`);

console.log('\nfailure categories — predicted unblock if this bond alone is added');
for (const c of report.categories.slice(0, 20)) {
  console.log(`  ${c.label.padEnd(34)} ${String(c.failures).padStart(5)} failures   ${String(c.soleCause).padStart(5)} sole cause`);
}

console.log('\ninstrument honesty');
console.log(`  failures                 ${report.classifier.failures}`);
console.log(`  classified               ${report.classifier.withCategory} (${(report.classifier.withCategory / Math.max(report.classifier.failures, 1) * 100).toFixed(1)}%)`);
console.log(`  mean causes per failure  ${report.classifier.meanCauses.toFixed(2)}`);
console.log(`  non-projective subtrees  ${report.nonProjective} (excluded from categorisation)`);
console.log(`  tokenizer agreement      ${tokenizerAgree}/${tokenizerTotal} sentences match UD's token count`);

console.log('\nunnamed frontier signatures (top 10)');
for (const [sig, n] of [...signatures.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${String(n).padStart(5)}  ${sig}`);
}
console.log('');
```

- [ ] **Step 2: Smoke-run on a small slice**

Run: `node scripts/treebank-report.mjs --split dev --limit 200`
Expected: all sections print; `coverage`, `containment`, `decision` are percentages; `decision` is not `null` (the dict is present at the repo root); no stack trace.

If `decision` prints `null`, the sense query returned nothing — check `scholomance_dict.sqlite` exists at the repo root and that `wordnet_lemma` has rows. Do not "fix" it by passing an empty map.

- [ ] **Step 3: Full dev run**

Run: `npm run treebank:report`
Expected: `n` around 2000, completes without error.

Sanity checks before moving on — if any fails, stop and report rather than adjusting the number:
- `containment` is less than or equal to `coverage`. A gold answer cannot be contained in a parse set that is empty.
- `decision` is less than or equal to `containment`. The top parse is one of the parses.
- The `VERB` row of the root-UPOS breakout has a higher coverage than the `NOUN` row. If not, that is a real finding about fragments, and it goes in the Task 7 report.

- [ ] **Step 4: Commit**

```bash
git add scripts/treebank-report.mjs
git commit -m "feat(constellation): treebank report — coverage, containment, decision

Prints the POS ablation, the ranked failure categories with their predicted
unblock counts, and the instrument's own classification rate.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Baseline on the held-out split, and the recorded predictions

**Files:**
- Create: `docs/superpowers/evidence/2026-08-08-treebank-baseline.md`

**Interfaces:**
- Consumes: `scripts/treebank-report.mjs`.
- Produces: a dated evidence document holding the baseline numbers and the predicted-unblock counts, which later grammar work is scored against.

- [ ] **Step 1: Run both splits and capture the output**

Run:
```bash
node scripts/treebank-report.mjs --split dev  > /tmp/tb-dev.txt 2>&1
node scripts/treebank-report.mjs --split test > /tmp/tb-test.txt 2>&1
```

- [ ] **Step 2: Write the evidence document**

Create `docs/superpowers/evidence/2026-08-08-treebank-baseline.md` with this structure, filling every bracketed slot from the captured output. Do not round toward a nicer number and do not omit a row because it is unflattering.

```markdown
# Treebank Baseline — 2026-08-08

Instrument: `scripts/treebank-report.mjs`, commit <SHA of Task 6's commit>.
Corpus: UD English-EWT, fetched by `npm run treebank:fetch`.
Grammar: `codex/core/constellation/compose.js`, UNCHANGED by this work.

## Headline

| split | n | coverage | containment | decision |
|---|---|---|---|---|
| dev | ... | ... | ... | ... |
| test | ... | ... | ... | ... |

Coverage on Gutenberg was previously reported as 36.6%. State plainly whether
the EWT number is higher or lower and do not explain the gap away — EWT is
modern web text and Gutenberg is archaic prose, so a difference is expected in
an unknown direction.

## What coverage was hiding

Containment minus coverage, and decision minus containment, in absolute
sentences. If decision is close to containment, say so: it means
`rankByAttraction` is nearly idle, and that is a finding.

## POS ablation

Paste the 2x2 block. Call out the "parses only because POS was vague" count as
a fraction of coverage — that fraction of the headline is not a clean win.

Record the oracle impurity percentage. If it is above 5%, say explicitly that
the tagging-vs-grammar split is weakened by it.

## Failure categories, and the predictions being recorded

Paste the ranked table. Then state, as a numbered list, the top five
predictions in this exact form:

1. Adding a bond for `<label>` unblocks <soleCause> sentences on <split>.

These numbers are recorded BEFORE any rule is built. When a bond is added,
re-run the report and compare. An instrument whose predictions do not land is
wrong, and this is how that gets found.

## Instrument honesty

Classification rate, mean causes per failure, non-projective count. If the
classifier explains nearly every failure with several causes each, say that it
is behaving like a horoscope.

## Tokenizer

Agreement between `codex/core/tokenizer.js` and UD tokenization.

`tokenize` is `text.toLowerCase().match(/\b(\w+)\b/g)`, which drops ALL
punctuation including commas — and `compose` has a `COMMA` atom type, with the
comma constructions worth +1.4 coverage points on the Gutenberg run. Record the
measured disagreement rate and whether it is concentrated in punctuation.

## Unnamed frontier signatures

Paste the top 10. These have no construction names yet, on purpose.
```

- [ ] **Step 3: Verify no placeholder survived**

Run: `grep -n '\.\.\.\|<SHA\|<label\|<split' docs/superpowers/evidence/2026-08-08-treebank-baseline.md`
Expected: no output. Any hit is an unfilled slot.

- [ ] **Step 4: Run the full feature suite**

Run: `npx vitest run tests/qa/features/constellation-treebank.test.js tests/qa/features/constellation-failure-diagnosis.test.js tests/qa/features/constellation-treebank-metrics.test.js`
Expected: PASS, 26 tests across 3 files.

Then confirm nothing else broke:

Run: `npm run test:qa:features`
Expected: the same pass/fail set as before this work started. If a test fails, check whether it failed before these commits — and if it did, report it as failing rather than filing it under "pre-existing".

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/evidence/2026-08-08-treebank-baseline.md
git commit -m "docs(constellation): treebank baseline and the recorded unblock predictions

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Out of scope

Named here so no task quietly grows into them:

- Any rule or lexicon change to `compose.js`. Acting on the printed roadmap is separate work.
- Wiring `compose.js` into a consumer. It is still imported by nothing.
- Running the off-gold path over `cache/gutenberg/`. `frontierSignature` is built and tested; pointing it at Gutenberg is a follow-up once signatures have earned names.
- The pre-existing pixelbrain/subtlety working-tree changes.
