# Efficacy corpus pre-registration (written before compiler logic exists)

Written before implementing `RoadmapCompiler`'s rule logic, to avoid the same
self-grading risk already named in this project's own memory
(`project-mutation-testing-masked-rules.md`: "I authored the mutants... a
100% mutation score measures coverage of the rules that EXIST, not rules
never written"). The same caveat applies here: I am both the author of the
compiler and the grader of its output. The defense is pre-registering the
required discovery and the comparison baseline before the compiler's rules
are written in detail, and writing each rule generally enough that it is not
hardcoded to the specific fixture that will test it.

## Arm A — meaning-agnostic (interval-classifier-shaped task, no domain evidence)

**Compiler rule under test (general, not fixture-specific):** if the task
description names a function that classifies or compares two or more inputs
into 3+ discrete named outcome categories via ordinal/numeric comparison (a
"boundary classifier" task shape), the compiled roadmap's verification phase
must include a completion check requiring test coverage for boundary-equality
cases — inputs where a compared value is exactly equal, not merely ordered —
for every pair of categories that share a boundary.

**Required discovery:** given the `classify_intervals` task (no real brain
evidence available or relevant — confirmed empirically today,
`project-brain-vs-noassist-mutation-experiment.md`), the compiled roadmap
must surface this completion check explicitly, distinct from a generic "add
tests" reminder.

**Baseline (already measured, not re-run):** my own unassisted process for
this exact task, today, produced a test suite that mutation-tested at 7/15
(46.7%) — all 8 survivors in exactly the category this rule targets
(CONTAINS/CONTAINED_BY boundary-tightness, OVERLAPPING strict-inequality
edges). The baseline did not enforce this check as an explicit, named item;
it was left to ad hoc instinct, which this run demonstrably missed.

## Arm B — evidence-grounded (real project law citation available)

**Compiler rule under test (general, not fixture-specific):** if accepted
findings include a real quoted line with an explicit citation path (the
`"<term>" per <path>: "<quote>"` shape already produced by
LORE_BRAIN/ARCHITECTURE_BRAIN/UI_BRAIN today), the compiled roadmap's
verification phase must include a completion check requiring the
implementation to be checked against the SPECIFIC content of that quote —
not a generic "consult the docs" reminder.

**Required discovery:** given the real `BrainBridge` output for "plan a
refactor across architecture layers" (measured earlier this session:
`ARCHITECTURE_BRAIN` returns an accepted finding quoting this project's own
law, `"...this project's own law states: \"CODEx has four strict
layers...\""`), the compiled roadmap must surface a completion check tied to
that specific quoted text.

**Baseline:** an unassisted plan for the same request, written the way I
would naturally write one without consulting this prototype — expected to be
generic ("identify affected files, make the change, run tests") with no
completion check naming the specific four-layer constraint.

## What would falsify each arm

Arm A is falsified (rule does not hold / no discriminating benefit) if the
compiled roadmap for the interval task does NOT include a distinct
boundary-equality completion check, or includes one so generic it would not
have caught the actual 8 survivors.

Arm B is falsified if the compiled roadmap does not tie a completion check to
the specific quoted law text, or if an unassisted baseline plan would
realistically have included the same check anyway (in which case there is no
discriminating benefit, and this must be reported as such).

Both arms report the null result plainly if the rule fails to fire or fires
too generically to matter — per the Delivery Sequence's own instruction, a
null result narrows the claim rather than being hidden.

## Arm C — self blind-spot probe (silence vs. failure), added 2026-08-28

Requested directly: find my own most prevalent, already-measured blind spot
and see whether the compiler catches it. The candidate is not chosen freely —
it is the one already quantified in this project's own memory
(`feedback-silence-vs-failure-blind-spot.md`) and diagnosed in
`AGENT_BLIND_SPOT_DIAGNOSTIC_2026-08-28.md`: writing a new
`try/except Exception:` fallback around a lookup/query and collapsing
"confirmed absent" and "the lookup mechanism itself broke" into the identical
return value (`None`/`{}`/silent pass). Measured real rate: **14 such blocks
added in one session; at least 12 collapsed the two cases**, found only by
direct hand-inspection after `ask_brain`/CODE_BRAIN itself failed to find the
structural pattern from a plain-language query.

**Compiler rule under test (general, not fixture-specific):** if the task
description asks to add new exception-handling/fallback code around a
lookup, query, fetch, parse, or connection operation, the compiled roadmap's
verification phase must include a completion check requiring a test that
simulates a genuine *operational failure* of the underlying mechanism (not
mere absence of the thing being looked up) and asserts that this failure
path is distinguishable from the confirmed-absent path — not a generic "add
error handling" or "add tests" reminder.

**Required discovery:** given a task description shaped like the real
historical one (add a new helper that looks something up and falls back
silently on any exception), the compiled roadmap must surface this specific
completion check, phrased in terms of confirmed-absent vs. could-not-confirm,
not generically.

**Baseline (already measured, not hypothetical):** my own real, unassisted
process, same session, writing this exact shape of code 14 times, missed the
distinction 12 of 14 times — despite having already fixed the identical
shape of bug in someone else's code earlier the same session, and despite
the general principle already being written into this session's own
`RISK_BRAIN` docstring ("Silence is not safety"). This is the strongest
baseline available: not a hypothetical unassisted plan, but the actual
measured failure rate of the unassisted process this rule is meant to guard.

**What would falsify this arm:** the compiled roadmap does not mention the
absent-vs-broken distinction at all, phrases it so generically ("add error
handling") that it would not plausibly have prevented any of the 12 real
sites, or requires keyword-matching so narrow/fixture-specific that it would
only fire on the exact historical wording rather than the general task
shape. Any of these is reported as a null result, same as the other arms.
