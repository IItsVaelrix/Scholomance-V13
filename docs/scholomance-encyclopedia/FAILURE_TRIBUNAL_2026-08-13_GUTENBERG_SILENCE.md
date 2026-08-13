# Failure Tribunal: The Gutenberg Silence

**Date:** 2026-08-13  
**Severity:** S1 — measurement-integrity failure  
**Incident substrate:** `scripts/compound-identity-experiment.mjs`  
**Affected evidence:** the off-gold Project Gutenberg population used by the
compound-identity experiment  
**Unaffected evidence:** UD English-EWT treebank gates and every instrument that
consumes its pre-segmented gold records  
**Verdict:** **The experiment silently changed the population it claimed to
measure. The paired causal claim survived; its absolute corpus rates did not
deserve trust until the population was reconstructed and every exclusion was
counted.**

---

## I. Convening Order

This Tribunal was ordered after a corpus-sanitation probe discovered that the
Project Gutenberg extractor did two things in sequence:

1. it treated every period followed by whitespace as a sentence boundary; and
2. it silently discarded every resulting segment outside a three-to-ten-token
   window.

Either operation can be legitimate in a bounded experiment. Their composition,
without an exclusion ledger, was not.

The first operation manufactured fragments. The second selected among those
fragments according to a property strongly related to parser difficulty. The
published population was therefore neither the source corpus nor a declared
sample from it. It was an invisible, difficulty-biased derivative.

This document distinguishes four questions that must never again be collapsed:

- Did Project Gutenberg contain typesetting and editorial matter? **Yes.**
- Did the extractor mistake some of that matter for linguistic structure?
  **Yes.**
- Did the extractor itself manufacture more damage through segmentation and
  silent filtering? **Yes, and this was the dominant integrity failure.**
- Did the compound-identity treatment effect survive a lawful remeasurement?
  **Yes.**

Survival of the treatment effect is not an acquittal. It is evidence that the
paired design was stronger than the extractor wrapped around it.

---

## II. The Indictment

The extractor is charged with the following failures.

### Count 1 — False sentence boundaries

The former segmentation rule was equivalent to:

```js
flat.split(/(?<=[.!?])\s+/)
```

That expression knows punctuation but not sentencehood. It split:

```text
Mr. Bennet planted the peach-tree. It grew.
```

into:

```text
Mr.
Bennet planted the peach-tree.
It grew.
```

It did the same to `Mrs.`, `Dr.`, `St.`, name initials such as `J. R.`, and
enumerations such as `Vol. II.`.

This is not merely an imperfect natural-language heuristic. It is a category
error: the period was taken as sufficient evidence of sentence closure even
when the token carrying it declared a known abbreviation construction.

### Count 2 — Silent population deletion

After segmentation, the extractor accepted only segments with three through ten
tokens. The former branch was materially equivalent to:

```js
if (tokens.length < 3 || tokens.length > 10) continue;
```

The `continue` had no counter, record, reason, or output artifact. A caller could
not distinguish:

- source text that was never read;
- wrapper or structural matter intentionally excluded;
- a sentence broken at an abbreviation;
- a legitimate sentence below the floor;
- a legitimate sentence above the termination ceiling;
- a sentence without a hyphen-declared compound; or
- a chart failure.

All were represented by the same value: absence.

### Count 3 — Difficulty-dependent selection

The ten-token ceiling was introduced for a real operational reason. The classic
composer materializes each parse and may not terminate on long ambiguous input.
The ceiling itself was therefore not the offense.

The offense was allowing a termination control to become an invisible sampling
policy.

Longer sentences are generally more syntactically complex. Abbreviation damage
also creates very short fragments, and short fragments are often easier for a
coverage parser to span. The extractor consequently:

- deleted much of the difficult long tail;
- retained some artificially easy fragments;
- discarded other fragments whose loss could no longer be reconstructed; and
- reported coverage over the survivors without reporting how the survivors had
  been chosen.

This is selection on the outcome's causes. It is not missing-at-random.

### Count 4 — Structural matter without provenance

Project Gutenberg plain text legitimately contains non-prose substrate:

- licence wrappers;
- chapter, book, act, scene, and canto headings;
- illustration captions;
- asterisms and separator rules;
- typographic markup;
- physical line wrapping; and
- edition-specific front and back matter.

The old extractor removed the outer wrapper but did not classify the remaining
structural population. Anything that happened to fit the token window could
enter the parser as though it were ordinary prose.

### Count 5 — Evidence without a population ledger

The experiment froze phrase outcomes and correctly compared three arms, but its
artifact did not seal the counts by which the source population became those
phrases. It proved outcomes for accepted phrases while leaving the acceptance
mechanism largely unproved.

A large sample did not cure this. Repeating a biased selection 2.9 million times
only estimates the biased population more precisely.

---

## III. Forensic Reconstruction

### A. The audited population

The full audit covered 900 cached books and 2,919,191 naive segments.

| Event | Count | Share of naive segments |
|---|---:|---:|
| Began after an abbreviation | 93,511 | 3.2% |
| Began after a name initial | 34,835 | 1.2% |
| Silently dropped below three tokens | 342,671 | 11.7% |
| Silently dropped above ten tokens | 1,710,773 | 58.6% |
| Kept | 865,747 | 29.7% |

The discarded material totaled approximately **248 million characters**.

The categories overlap conceptually: an abbreviation split may create a segment
that is then counted in a length exclusion. That relationship is precisely why
the pipeline must report stages and reasons rather than one final survivor count.

### B. Concrete irreversible damage

The same failure mode was reproduced independently in the ten-book
`scholomance_corpus.sqlite` ingest:

```text
Lady Lucas was ... a valuable neighbour to Mrs.
Bennet.
They had several children.
```

The splitter made `Bennet.` a separate record. A later short-length filter
deleted it. The persisted corpus became:

```text
Lady Lucas was ... a valuable neighbour to Mrs.
They had several children.
```

No database-only stitching algorithm can infer the missing surname with
certainty. The immutable raw source is required for lawful reconstruction.

This distinction matters:

- **normalization** can be replayed from raw evidence;
- **quarantine** preserves evidence while restricting an experiment; and
- **silent deletion** destroys the information needed to audit either choice.

### C. Why malformed fragments flatter coverage

Let `P(x)` be whether the parser spans segment `x`, and let `S(x)` be whether the
extractor keeps it. The reported absolute coverage was:

```text
sum(P(x) * S(x)) / sum(S(x))
```

That is a lawful estimate of the accepted population only if the accepted
population is the declared estimand. It is not an estimate of source-corpus
coverage when `S(x)` depends on sentence length, abbreviation damage, structural
matter, and the presence of a target compound.

Here `S(x)` was also correlated with `P(x)`:

- long, difficult sentences had `S(x) = 0`;
- short fragments often had `S(x) = 1`; and
- some short fragments had `S(x) = 0`, deleting the evidence that the preceding
  record ended mid-clause.

The direction of bias is therefore toward an easier observed population, even
though individual deletions can move a particular rate either way.

---

## IV. Why the Compound Claim Survived

The experiment did not compare its observed coverage number to an unrelated
corpus. It applied three treatments to the same accepted phrases:

```text
SPLIT  — the compound is supplied as separate pieces
FUSED  — the compound remains one token, with compound identity disabled
UNION  — the compound remains one token and offers the union of its pieces
```

The primary product claim is the paired contrast `FUSED -> UNION`.

For each accepted phrase, source damage and selection were shared by both arms.
The paired discordance table asks:

- how many phrases failed under FUSED and succeeded under UNION; and
- how many succeeded under FUSED and failed under UNION.

Damage common to both arms does not enter either discordant cell. That is why a
paired design can preserve a causal treatment contrast even when the sampling
frame is damaged.

This protection has limits:

1. It protects the within-phrase delta, not the representativeness of the phrase
   population.
2. It fails if sanitation or tokenization differs between arms.
3. It does not validate absolute FUSED, SPLIT, or UNION coverage.
4. It does not validate a claim about sentences longer than the declared cap.
5. It does not excuse an undisclosed selection function.

### Measurements across the repair

The first sanitation replay reported:

| Arm | Before sanitation | After first sanitation |
|---|---:|---:|
| FUSED | 12.1% | 12.2% |
| UNION | 31.3% | 31.5% |
| Paired delta | +19.2 pp | +19.3 pp |
| FUSED losses caused by UNION | 0 | 0 |

After the sanitation logic was extracted into a contract, made context-aware,
and taught to recognize sentence punctuation followed by closing quotation
marks, the 900-book/4,000-phrase replay produced:

| Arm | Contract-hardened replay |
|---|---:|
| SPLIT | 22.7% |
| FUSED | 12.7% |
| UNION | 32.9% |
| FUSED -> UNION | **+20.1 pp** |
| Gained | **805** |
| Lost | **0** |
| Exact McNemar p | **9.37e-243** |

The absolute rates moved as the population became more faithful. The paired
claim did not merely remain positive; it retained zero losses and overwhelming
paired evidence.

Zero FUSED losses are also an architectural property. Compound identity runs
only when no prior lexical source named the fused token. It adds atoms; it does
not remove existing atoms. The experiment keeps measuring this invariant so a
future implementation change can falsify it.

---

## V. Root Cause

The proximate cause was a regex followed by two silent `continue` branches. The
systemic cause was deeper.

### 1. Extraction was treated as plumbing

The experiment invested rigor in its treatment arms, exact paired statistic,
and hard-negative fixture. It treated corpus extraction as a prelude rather than
part of the measurement apparatus.

But the extractor defined the population. It was therefore as scientifically
important as the parser switch under test.

### 2. Operational safety and scientific scope were conflated

The ten-token maximum protected the machine from nontermination. Because the
same branch also defined inclusion, an operational guard became a scientific
sampling decision without being named as one.

The correct representation is:

```text
reason = tooLong
count += 1
quarantine record remains auditable
```

not:

```text
continue
```

### 3. Absence was allowed to carry multiple meanings

Unreadable books, structural paragraphs, too-short candidates, too-long
candidates, and sentences without target compounds all vanished through control
flow. Because absence carried no provenance, downstream code could not tell
whether a count was small because the phenomenon was rare or because evidence
had been discarded.

### 4. No direct segmentation fixture existed

The repository froze parse outcomes but did not pin the boundary cases that
created the phrases. Consequently `Mr. Bennet`, `J. R. Hartley`, `Vol. II.`, and
punctuation followed by closing quotes had no executable claim over the
extractor.

### 5. A successful result reduced suspicion

The treatment effect was large, consistent, and monotonic. Those are good
properties, but they encouraged attention toward the parser mechanism and away
from the population mechanism. A correct conclusion can be supported by an
unacceptable measurement process. The conclusion's survival does not make the
process retroactively sound.

---

## VI. Blast Radius

### Directly affected

- `scripts/compound-identity-experiment.mjs` population extraction.
- Absolute coverage rates reported from the pre-sanitation Gutenberg sample.
- The representativeness of its frozen phrase population before regeneration.

### Indirectly exposed, but separately remediated

- Any future off-gold Gutenberg experiment that copied the same period splitter
  or silent length filtering pattern.
- The general belief that a large local corpus automatically confers reliable
  absolute coverage.

### Not affected

- UD English-EWT DEV and TEST records. They arrive with gold sentence boundaries
  and are never segmented by this module.
- The treebank gate introduced by `45725adf`.
- The atomless census and wh-word ceiling probe, which consume the same gold
  treebank substrate.
- The Grammar Valence Cyclotron's grammar-only reports, which require gold-POS
  diagnosis before a vacancy enters the report.
- Runtime user queries and their Constellation tokenization path.
- The product implementation of compound identity itself.

The blast radius is narrow in code and enormous in the compromised experiment's
population. Both facts must be held at once.

---

## VII. Remediation Entered Into Law

### A. A pure sanitation contract

`scripts/lib/gutenberg-corpus-sanitizer.mjs` now owns:

- wrapper removal;
- physical whitespace normalization;
- context-aware abbreviation protection;
- name-initial protection;
- numeric/Roman enumeration protection;
- sentence boundaries after closing quotation marks;
- narrow structural classification;
- bounded token selection; and
- reason-ledger accounting.

The emitted packet is `SCHOL-GUTENBERG-SANITIZATION-v1`.

### B. No-silent-exclusion invariant

For every content sentence candidate:

```text
accepted + sentenceQuarantined = sentenceCandidates
```

If the equality fails, the sanitizer throws instead of emitting a plausible
packet.

Structural paragraphs are counted separately because they are classified before
sentence segmentation. Their reasons remain explicit.

### C. Closed reason vocabulary

The lawful reason codes are:

```text
illustration
asterism
heading
markup
tooShort
tooLong
noCompound
unreadable
```

An unknown reason throws. There is no `misc`, `junk`, or `other` bucket.

`noCompound` is deliberately included even though it is not contamination. It
is a scope exclusion made by the experiment, and scope exclusions alter the
population just as surely as sanitation exclusions do.

### D. Direct regression fixtures

The test suite now pins:

```text
Mr. Bennet planted the peach-tree. It grew.
Dr. Watson waited at St. Paul. It rained.
J. R. Hartley wrote it. Vol. II. It sold.
“Run!” cried Dr. Watson. He ran.
```

It also pins wrapper boundaries, structural classification, contextual `etc.`,
the closed reason vocabulary, and the accounting equality.

### E. Frozen experimental evidence regenerated

The 900-book/4,000-phrase fixture was regenerated from the contract-hardened
population. Every frozen UNION/FUSED/SPLIT outcome remains executable without
requiring the 1.8 GB local corpus.

### F. Schema sovereignty

`SCHEMA_CONTRACT.md` version 1.44 now records the sanitation packet and its
invariants. The contract explicitly states that:

- raw source remains immutable;
- parser bounds are quarantines, not silence;
- absolute selected-corpus coverage is not transferable; and
- paired deltas are admissible only when the accepted set is identical across
  arms and every exclusion is reported.

---

## VIII. Controls That Failed

| Expected control | Why it failed | Replacement |
|---|---|---|
| Large sample size | Precision cannot remove selection bias | Population ledger and declared estimand |
| Wrapper stripping | Removed licence text but not internal structural matter | Narrow structural reason codes |
| Token-length cap | Prevented nontermination but silently changed scope | Counted `tooShort` / `tooLong` quarantine |
| Frozen phrase fixture | Pinned accepted outcomes, not how phrases were accepted | Direct sanitizer tests plus regenerated fixture |
| Paired statistic | Protected the delta but not absolute rates or representativeness | Preserve paired design and report population limits |
| Human-readable comments | Explained intent but could not fail | Executable accounting invariant |

---

## IX. Permanent Measurement Rules

The Tribunal enters the following rules into Scholomance measurement practice.

1. **Every exclusion is data.** A filter without a reason code is prohibited in
   evidence-producing code.
2. **Operational bounds declare scope.** Time, memory, token, and chart limits
   must be reported as quarantine counts.
3. **Raw evidence is immutable.** Sanitized text is a derived view with enough
   provenance to replay the transformation.
4. **Segmentation is part of the instrument.** Sentence boundary logic receives
   direct fixtures before any corpus metric is trusted.
5. **Absolute and paired claims are different claims.** A paired delta may
   survive shared damage; that survival does not validate absolute rates.
6. **The population denominator travels with the result.** Accepted counts alone
   are insufficient.
7. **No generic quarantine bucket.** New failure shapes require new named
   reasons and review.
8. **Gold boundaries outrank heuristic boundaries.** A pre-segmented gold
   treebank must never be routed through an off-gold sanitizer.
9. **A stronger result does not waive an audit.** Effect magnitude is not a
   substitute for measurement integrity.
10. **Silence is a state mutation.** Deleting evidence without recording why is
    treated as corruption, not cleanup.

---

## X. Judgment

The extractor is found guilty on all counts.

The original compound-identity mechanism is not found guilty. Its paired claim
was remeasured on a sanitized population and survived with a slightly larger
effect, 805 gains, zero losses, and an exact paired probability far below any
plausible evidentiary threshold.

The old absolute Gutenberg coverage values are vacated. They may remain in
historical records only when labelled as products of the pre-sanitation
population.

The phrase “the filtering was necessary” is rejected as a defense. The token cap
was necessary. The silence was not.

---

## XI. Sentence

The sentence is structural, not rhetorical:

- sanitation logic removed from ad hoc experiment control flow;
- pure contract established;
- direct boundary tests established;
- closed reason ledger established;
- frozen evidence regenerated;
- schema version advanced;
- full 900-book paired replay required; and
- future silent corpus exclusions prohibited.

The Tribunal is adjourned with one final finding:

> A discarded record with a reason is a declared boundary of an experiment. A
> discarded record without a reason is an invisible hand on the scale.
