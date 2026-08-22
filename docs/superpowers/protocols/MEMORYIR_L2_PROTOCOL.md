# MemoryIR L2 — Transport Conformance Protocol

**For:** any agent participating as a reader in an L2 trial (QWEN, Claude, GPT, local).
**Version:** MemoryIR v1 · 2026-08-22
**Driver:** `scripts/memoryir-l2.ts` · **Spec:** `docs/superpowers/specs/2026-08-22-memoryir-scd64-domain-design.md`

---

## 1. What is being measured

Not you. **The representation.**

L2 asks one question: when a memory record is rendered into English by one model
and read back by a different model, does it come back as the *same record*?

If it does, MemoryIR carries meaning across models and persistent memory can be
shared between agents without prose drift. If it does not, the run tells us
**which slot** failed to survive, which is the actual research result.

There is no judge. You supply slot *values*; the driver supplies the hashing;
`compareSCD64ByBlocks` compares eight hex blocks. Nobody grades anybody.

A failing trial is **not** a failure by you. A slot that no model can recover
from ordinary English is a defect in the vocabulary, and finding it is the point.

---

## 2. The two roles

A trial has a direction. You will be told which role you are playing.

| role | you receive | you return |
|---|---|---|
| **A — RENDER** | eight slot values | one short paragraph of natural English |
| **B — ENCODE** | one paragraph of English | JSON with one value per slot |

A full experiment runs **both directions** — Claude renders / Qwen encodes, then
Qwen renders / Claude encodes. A single direction measures one pair one way and
is not enough to conclude anything.

---

## 3. The eight slots

One SCD64 encodes one memory record. Each slot holds one facet.

| slot (wire name) | alias | what it holds |
|---|---|---|
| `BUGCLASS` | CLAIM_KIND | what kind of claim this is |
| `COORDSYS` | SCOPE | the frame it was measured in |
| `INVARIANT` | MODALITY | how binding it is |
| `MAGNITUDE` | EVIDENCE | how much support it has |
| `MASKING` | EXCEPTION | its declared carve-outs |
| `GATE` | ADMISSION | its lifecycle state |
| `PROPAGATE` | TARGETS | what it points at |
| `VERDICT` | UNBINDS_IF | what would withdraw trust in it |

**Reply keyed by the WIRE name** (`BUGCLASS`, not `CLAIM_KIND`).

---

## 4. The closed vocabulary

Choose **exactly one** value per slot from these lists. Nothing else is legal —
the driver rejects an unlisted value rather than snapping it to the nearest one.

```
CLAIM_KIND  RULE | PREF | REFUTED | MEASURED_WITH | CAUSES | UNBOUND
SCOPE       repo-global | module | file | corpus | held-out-split | session | UNBOUND
MODALITY    mandatory | preferred | forbidden | UNBOUND
EVIDENCE    none | weak | tentative | strong | contradicted | UNBOUND
EXCEPTION   none-declared | user-override | harmful-structure | context-differs | UNBOUND
ADMISSION   experimental | stable | retired | UNBOUND
TARGETS     source-episodes | semantic-pattern | procedure | superseding-pattern | UNBOUND
UNBINDS_IF  counterexample-observed | matched-control-clears-chance | interceptions-zero | never-stated | UNBOUND
```

Get the live list any time with `npx tsx scripts/memoryir-l2.ts vocab`. The
vocabulary is capped at 64 values total, so encoded memory stays cheaper than
prose. If you think a value is missing, **say so after the trial** — do not
invent one during it.

---

## 5. The rules that make the result valid

Breaking any of these voids the trial. They exist because a measurement you can
influence is not a measurement.

**5.1 — Never look at the expected answer.**
If you are encoding, you must not have seen the original slot values, the family
name (`MEM_*`), or the expected wire value. If you have seen any of them, say so
and the trial is discarded. This is the single most important rule.

**5.2 — Abstain rather than guess.**
If the text does not determine a slot, answer `UNBOUND`. Abstentions are scored
in a **separate column** from wrong answers and are **not** a penalty. A guess
that happens to be right is indistinguishable from understanding, and it
corrupts the number for everyone.
*(This is `SEMANTIC_KIND_THEORY_UNBOUND`: an unbound term is never resolved to a
plausible default.)*

**5.3 — Encode what the text says, not what a sensible memory would say.**
Do not repair, complete, or improve the record. If the prose says a preference,
answer `preferred` even if a mandate would be more useful.

**5.4 — Do not optimise for agreement.**
You are not trying to match the other model. Trying to guess what Claude "would
have said" measures your model of Claude, not the representation.

**5.5 — When rendering, add nothing and drop nothing.**
Write the record as ordinary English. Do not name the slots or their values, do
not mention MemoryIR, and do not add qualifications the record does not contain.
If a slot has no natural English form, render it as best you can and **flag it
afterwards** — that is a finding about the vocabulary.

**5.6 — Before you hand over a render, name the span that carries each slot.**
Walk the eight slots and point at the words in your own paragraph that determine
each one. If you cannot point at a span, you dropped that slot and the paragraph
is not finished — go back and put it in. Do this silently; it is a check on your
own prose, not part of the output.

This is a *coverage* check, not an encode. You already know the expected values,
so you must never score your own paragraph — see §10. All you are asserting is
that the information is present in the text, which is exactly what §5.5 requires
and exactly what a hurried render drops.

The failure it prevents is the common one. In the 2026-08-22 run, both of the two
failing trials were caused by a renderer omitting information, not by a reader
losing it: one paragraph never stated that no carve-outs existed (the reader
correctly abstained on `EXCEPTION`), and one described `tentative` support as
"the backing is thin", which honestly reads as `weak`. Both reached 8/8 after a
single clause was restored. A slot the prose never carried cannot be recovered by
any reader, and blaming the vocabulary for it hides the real defect.

The check was validated against that same paragraph: run on it, §5.6 returned a span
for seven slots and `DROPPED` for `EXCEPTION` — naming the failure before the trial
was spent, rather than after.

---

## 6. Output format

Role B returns **only** this, with no prose, no code fence, no commentary:

```json
{"BUGCLASS":"…","COORDSYS":"…","INVARIANT":"…","MAGNITUDE":"…","MASKING":"…","GATE":"…","PROPAGATE":"…","VERDICT":"…"}
```

Unparseable JSON is itself recorded as a transport failure, so keep it clean.

Role A returns one short paragraph of plain English and nothing else.

---

## 7. How a trial is scored

```
npx tsx scripts/memoryir-l2.ts score <FAMILY> '<your JSON>'
```

Output names every slot as ` ok `, `DRIFT` (wrong value) or `ABST` (abstained),
plus a `relationship` from `compareSCD64ByBlocks`:

```
IDENTICAL  8/8 blocks   → PASS
MUTATION   6-7/8
RELATED_FAMILY 4-5/8
WEAK_NEIGHBOR  2-3/8
UNRELATED  0-1/8
```

**PASS requires all eight.** Seven of eight is a fail that names the eighth,
which is more useful than a pass.

---

## 8. After the trial — what to report

Report these, and nothing that requires you to have broken §5.1:

1. Which role you played and which direction the trial ran.
2. Any slot you found **impossible to express** (role A) or **impossible to
   recover** (role B), and why in one sentence.
3. Any value you wanted and the vocabulary did not offer.
4. Whether you had prior exposure to the expected record — honestly. A voided
   trial costs an hour; a silently contaminated one costs the whole result.

Do not report a confidence score in your own answer. Self-reported confidence is
the thing this architecture is built to avoid needing.

---

## 9. Standing limits

- One trial is one record, one pair, one direction. It supports no general claim.
- L1 (well-formedness) is green and separate; a green L1 says nothing about transport.
- Nothing consumes MemoryIR yet — Mnemosyne does not emit MEMORY SCD64s. This
  measures a representation, not a running system.
- The vocabulary and the first prose sample were written by Claude, which biases
  the first direction. The reverse direction is the corrective, not an extra.

---

## 10. Render-time lint — production only, never inside a trial

Once MemoryIR is used for real — writing a memory record out as prose that another
agent will later read back — you want to know the paragraph is recoverable *before*
you commit it. That check is a blind round trip:

```
Model A renders → a reader that has NOT seen the slot values encodes → score
```

If it returns 8/8, the prose carries the record. If a slot drifts or abstains, the
prose is underspecified at that slot; fix the paragraph, not the vocabulary. This is
the same move SCDL's SemQuant makes when it emits `PB-SEM-003` for a declaration
that does not determine its own result.

**Two ways to get this wrong, both of which produce a check that cannot fail:**

- **Linting with yourself.** If the model that rendered the prose also encodes it,
  it already knows the answers and will recover all eight every time. The lint then
  passes unconditionally and measures nothing. This is precisely the contamination
  that voided the first attempted trial on 2026-08-22. The linter must be a reader
  that has never seen the slot values.
- **Linting inside a trial.** Do not lint a trial render. A lint *is* an encode, so
  running one means you have already spent the trial; and if you then rewrite the
  paragraph and re-run, you are selecting renders that your reader happens to agree
  with. That is a §5.4 violation with extra steps, and it manufactures a pass rate.
  Inside a trial, Role A gets §5.6 and nothing more.

So the rule is a clean split. **In a trial:** §5.6 coverage check, no encoder, hand
the paragraph over once and accept the score. **In production:** full blind round
trip, rewrite until it survives, because there is no pass rate to protect — only a
record that has to still mean the same thing when something else reads it back.

A production lint does not license a claim about transport. It says one paragraph
survived one reader; §9 still applies.
