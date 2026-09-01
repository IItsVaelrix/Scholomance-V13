# Efficacy corpus result — Step 1 prototype

Pre-registration: `PREREGISTRATION.md` (written before the compiler's rule
logic existed). Both arms below are reported against that pre-registration,
including the one place the result was imperfect.

## Arm A — meaning-agnostic (`classify_intervals`)

**Required discovery:** a distinct boundary-equality completion check, not
generic "add tests."

**Result: discovered.** Fed the real task description (no useful brain
evidence available or relevant, matching today's actual measurement) through
`compile_roadmap`. Output:

> Test boundary-equality cases (compared values exactly equal, not just
> ordered) for every pair of adjacent/boundary-sharing categories among:
> DISJOINT_BEFORE, DISJOINT_AFTER, TOUCHING_BEFORE, TOUCHING_AFTER, EQUAL,
> CONTAINS, CONTAINED_BY, OVERLAPPING_LEFT, OVERLAPPING_RIGHT.

**Baseline it beats:** my own unassisted process for this exact task, same
day (`project-brain-vs-noassist-mutation-experiment.md`), produced a test
suite with 8/15 mutants surviving — every survivor in exactly this category
(CONTAINS/CONTAINED_BY boundary-tightness, OVERLAPPING strict-inequality
edges). The baseline never named this as an explicit, required check; it was
left to instinct, and instinct missed it that day.

**Bug found and fixed during this same run:** the label-detection regex
originally required an underscore (`_LABEL_TOKEN`), so single-word labels
`EQUAL` and `CONTAINS` were silently dropped from the printed list even
though they're real categories in the task — the check's substance was
still correct (it would have caught the actual survivors), but the
generated text undercounted the category list. Caught by re-reading the
compiler's own output rather than trusting the assertion. Fixed with a
regression test (`test_single_word_all_caps_labels_are_not_silently_dropped`,
confirmed RED before the fix) and a broadened regex
(`\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)*\b`); all 7 prototype tests pass, and the
live output above (re-run after the fix) now lists all nine categories.

## Arm B — evidence-grounded (real `BrainBridge` call)

**Required discovery:** a completion check tied to the SPECIFIC content of a
real quoted citation, not "consult the docs" generically.

**Result: discovered, against live evidence, not a fabricated fixture.** Ran
`direct_brain.forcefield_ask("plan a refactor across architecture layers")`
for real. `ARCHITECTURE_BRAIN` returned:

> Multi-layer project — this project's own law states: "**CODEx has four
> strict layers** (no layer may skip):"

Fed those real `acceptedFindings` through `compile_roadmap`. Output:

> Verify the implementation against the quoted constraint: "**CODEx has four
> strict layers** (no layer may skip):" (not a generic "consult the docs"
> check).

**Baseline it beats:** an unassisted plan for the same request would
realistically be "identify affected files, make the change, run tests" —
generic, with no completion check naming the specific four-layer constraint
by its actual sourced text.

**Also observed, unprompted:** `CODE_BRAIN`'s own search for "architecture"
was blocked mid-call by a real SCDNA gene
(`ARCH_RULE_BACKEND_TRUTH_AUTHORITY`, confidence 0.97) that judged the query
already resolved — a real, live example of governance actually functioning,
not a fabricated demo.

## Arm C — self blind-spot probe (silence vs. failure), added 2026-08-28

Requested directly: point the compiler at my own most prevalent, already-
measured blind spot, not a freshly invented one. Candidate:
`feedback-silence-vs-failure-blind-spot.md` /
`AGENT_BLIND_SPOT_DIAGNOSTIC_2026-08-28.md` — 14 new `except Exception:`
fallback blocks added in one real session, at least 12 collapsing "confirmed
absent" and "the lookup mechanism itself broke" into the identical return
value.

**Required discovery:** given a task shaped like the real historical one (add
a new lookup/query helper with an exception-fallback), the compiler must
surface a completion check requiring a test that simulates the lookup
mechanism *itself* failing, distinguishable from confirmed absence — not
generic "add error handling."

**Result: discovered**, on task text deliberately reworded from the test
fixture and from the original historical wording, to check the rule
generalizes rather than string-matching a known fixture:

> Write ipa_for_word(word) that queries the local pronunciation dictionary
> sqlite file and returns the ARPAbet transcription; if anything goes wrong,
> catch the exception and return None.

Output:

> Add a test that simulates the underlying lookup/connection mechanism
> itself failing (not just the item being absent), and assert this failure
> path is distinguishable from the confirmed-absent path — do not let both
> collapse to the same None/empty result.

**Baseline it beats:** not hypothetical — the actual measured unassisted
rate for this exact task shape, same session: 12 misses out of 14 attempts,
including on this literal function, despite the general principle already
being written into this session's own `RISK_BRAIN` docstring the same day.

**Honest scope limit, found by testing the rule against its own blind spot
again:** the rule fires on the lookup/query/fetch/retrieve/connect/cache-
shaped subset of the 12 real sites (covers the 3 `_scholomance_dict.py`
sites and the 3 quote-helper sites — 6 of 12) but does **not** fire on a
naturally-worded version of one of the other real sites:

> Report the current live state of the desktop cockpit to the phone; if the
> snapshot provider fails, fall back to reporting idle so the reconnect flow
> does not crash.

This produced no distinguishability check — confirmed by running it, not
assumed. That site ("snapshot provider fails" / "fall back to idle") was, in
real life, the single highest-severity one of the twelve (the phone-facing
wire protocol).

**This is not a coverage gap to patch with more keywords — it is the rule
reproducing, by hand, the exact limitation `AGENT_BLIND_SPOT_DIAGNOSTIC_2026-08-28.md`
already found in `CODE_BRAIN`: "it can find words, it cannot find shapes."**
`_is_lookup_exception_fallback_task` detects lexical co-occurrence (a
lookup-shaped verb plus an exception-shaped verb in the same request), not
the underlying concept (a new fallback path whose return value could mean
two different things). It matched the dictionary-lookup wording because that
task happened to use "queries"/"catch". It missed the snapshot-provider
wording because the identical defect was described with different words
("report", "provider fails", "fall back to reporting idle"). Adding "report"
and "record" to the verb list would only relocate the miss to whatever word
the next task uses — this is an enumeration problem, not a threshold to
tune, because a regex can only ever match vocabulary it was given, never the
concept behind it.

**Scope conclusion:** Arms A and B are lexical-extraction tasks (name the
labels literally present in the request text; quote the citation literally
present in the accepted findings) — a deterministic regex compiler is
well-matched to those, and both results stand. Arm C is a shape-detection
task (recognize a structural defect class regardless of the words used to
describe it) that a regex compiler cannot generally solve, only pattern-match
around one framing of at a time. Report this as a genuine boundary of what
the roadmap-compiler architecture can do, not as a fixable partial score for
this arm.

## What this does and doesn't establish

All three arms show a real, pre-registered, falsifiable discriminating
benefit over an empirically-measured (Arm A, Arm C) or realistic (Arm B)
no-protocol baseline. None is a fabricated fixture: Arm A's and Arm C's
baselines are today's own real, measured failures (a 7/15 mutation score; a
12/14 blind-spot rate); Arm B's evidence is a real, live brain call, not
hand-typed. Arm C additionally, under the same testing discipline it was
built to demonstrate, found a genuine architectural boundary rather than a
tunable gap: its rule is lexical co-occurrence matching, so it reproduces
CODE_BRAIN's own already-documented limitation ("finds words, not shapes")
the moment the same real defect is described in different words — the
highest-severity real site (the phone wire-protocol snapshot) is not caught
by its natural wording, and no amount of added synonyms fixes that in
general, only for the next example tried.

The honest limit: I am both the compiler's author and the grader of its
output, the same structural risk this project's own memory names
(`project-mutation-testing-masked-rules.md`: "a 100% mutation score measures
coverage of the rules that EXIST"). The mitigation used — pre-registering
the required discovery before writing the rule, writing each rule generally
rather than fixture-specific, and including a negative control per rule — is
real but not equivalent to an independent, adversarial evaluator. The
compiler's actual source of value here is *not* new brain evidence; CODE_BRAIN
still found nothing for Arm A, and Arm C exists precisely because CODE_BRAIN
could not find this pattern from a plain-language query either. The value is
a deterministic rule engine encoding general software-engineering
completion-check patterns (boundary-equality testing for multi-category
classifiers; specific-not-generic verification against cited constraints;
absent-vs-broken distinguishability on lookup fallbacks), applied
consistently regardless of whether the human happens to think of it under
time pressure or under the narrower lens of whatever bug they were just
hunting. That is a real capability distinct from "the brain network found
something," and it is what the Acceptance Criteria's "amplification" claim
should be scoped to, per this run — not general cognition, a consistently-
applied checklist derived from the task's own shape and the evidence it's
actually given, with real, tested gaps in that checklist's current coverage.

**Per the Delivery Sequence:** this positive, discriminating result across
all three arms — including Arm C's honestly-reported partial coverage — is
the trigger for the explicit review decision the spec requires before
persistence, MCP tools, or the opt-in skill get built. It is not itself that
decision.
