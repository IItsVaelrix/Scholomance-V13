# Concept Chemistry Metastable Promotion: Stateless APM Hourly Reporter

**Status:** User-approved design; implementation planning is the next step.

**Date:** 2026-08-03

**Companion artifacts:**

- `docs/superpowers/specs/2026-08-03-concept-chemistry-apm-hourly-reporter-design.md`
- `docs/superpowers/evidence/concept-chemistry-apm-hourly-reporter/score.json`
- `docs/superpowers/plans/2026-08-03-concept-chemistry-apm-hourly-scoring-gate.md`

## Purpose

This document defines a separately versioned revision of the Concept Chemistry
thesis and the implementation trial it authorizes. It does not amend, replace,
or reinterpret the immutable result of the original prospective scoring run.

The original run failed its frozen stable-selection protocol and correctly
selected no architecture. The user has chosen to treat the Stateless Chronicle
Compiler's two control-clearing round wins as a metastable hypothesis worthy of
empirical promotion. The implementation and operational evidence described here
are the out-of-sample test of that revised thesis.

The operational goal remains unchanged: generate deterministic cumulative
Markdown reports for completed machine-local hours containing Subtlety APM
fingerprints, in:

```text
divtube_downloader/APM-Hourly-Reports
```

## Immutable prior result

The original evidence recorded these candidate medians:

| Candidate | Median feasibility |
|---|---:|
| Stateless Chronicle Compiler | `0.2646` |
| Checkpointed Window Aggregator | `0.2257` |
| Streaming Materialized View | `0.2307` |

The Stateless candidate's aligned results were:

| Round | Candidate score | Stability | Bar | Outcome |
|---|---:|---|---:|---|
| V1 | `0.3292` | `METASTABLE` | `0.1902` | won and cleared |
| V2 | `0.1988` | `UNSTABLE` | `0.2394` | lost and fell below bar |
| V3 | `0.2646` | `UNSTABLE` | `0.2371` | won and cleared |

All three law controls were caught. The original gates failed because the same
candidate did not win all rounds, the Round 2 winner did not clear its control
bar, and no common winner could be tested as stable. Those findings remain
true. No code may rewrite that evidence or change the original decision to a
pass.

## Revised Concept Chemistry thesis

### Majority-control metastable selection

A candidate becomes a metastable implementation hypothesis when all of the
following hold in three aligned paraphrase rounds:

1. It is the unique candidate winner and strictly clears the bar-setting
   controls in at least two rounds.
2. At least one of those clearing wins reaches the frozen engine's
   `METASTABLE` threshold.
3. Every law-violation control is caught.
4. No reaction, score, threshold, corpus, or prior evidence is edited to obtain
   the selection.

The Stateless Chronicle Compiler satisfies this revised selection rule. Its two
clearing margins are `+0.1390` and `+0.0275`; across all rounds its aggregate
candidate-minus-bar margin is `+0.1259`.

### Why this is a new hypothesis, not a retroactive pass

The majority-control rule was chosen after inspecting the original result, so
the same scores cannot independently validate the new rule. They only generate
the revised hypothesis. Validation must come from evidence unavailable to the
scoring engine: implementation acceptance tests, replay of the real resonance
ledger, and live hourly operation.

### Rejected revisions

- **Aggregate-margin-only selection:** rejected because one strong round could
  hide two failures.
- **Lowering `STABLE_MIN` to the observed median:** rejected as post-hoc
  threshold fitting.
- **Rewording and rerunning the original reactions:** rejected because it would
  destroy the prospective record.

## Promotion states

The revised trial has three monotonic states:

```text
METASTABLE_SELECTED -> IMPLEMENTED_METASTABLE -> STABLE_OPERATIONAL
```

- `METASTABLE_SELECTED`: the majority-control scoring requirements above hold.
- `IMPLEMENTED_METASTABLE`: the complete automated acceptance suite and
  real-ledger replay pass.
- `STABLE_OPERATIONAL`: a live active completed hour is written automatically,
  and a subsequent restart proves the report remains byte-identical.

A failure does not skip forward, and a later pass does not erase earlier
negative evidence.

## Architecture

The subsystem is a Stateless Chronicle Compiler. Every compilation reads an
immutable snapshot of the complete resonance ledger and reconstructs the
required window and cumulative recurrence context from that snapshot. It has no
cursor, checkpoint, recurrence database, or process-memory authority.

### Pure compiler

The compiler performs no filesystem access, scheduling, logging, environment
lookup, or wall-clock reads. Callers supply ledger bytes, the source path, a
completed local-hour window, and the compiler derives the canonical generation
instant from that window's end.

It:

- parses complete JSONL records while deferring an incomplete trailing row;
- verifies supported record shapes, checksums, and timestamps;
- isolates malformed rows and future timestamps as warnings;
- counts only valid `fingerprint` records as occurrences;
- associates assessment records with the nearest preceding fingerprint for the
  same unit;
- derives stable event identities;
- selects events active in the requested completed window;
- reconstructs each active event's history through the window end;
- renders deterministic Markdown and its integrity checksum.

### Filesystem adapter

The Node-only adapter:

- reads a byte-stable in-memory snapshot of the resonance JSONL ledger;
- confines reports to the configured report directory;
- creates the directory when absent;
- writes and fsyncs a same-directory temporary file;
- publishes it through an exclusive atomic hard link;
- removes its temporary name in all outcomes;
- accepts identical existing content as idempotent success;
- returns an integrity conflict for divergent existing content without
  modifying it.

### Runtime coordinator

The coordinator:

- calculates completed machine-local hour windows using an injected clock;
- scans ledger fingerprints for active completed windows;
- compiles missing reports oldest-first at startup;
- recalculates the next local-hour boundary after every tick;
- retries transient read/write failures after `250 ms`, `1 s`, and `4 s`;
- aborts retry backoff and pending boundary timers on stop;
- serializes overlapping tick requests into one active compilation;
- exposes an idle signal for deterministic lifecycle tests.

### Fastify lifecycle plugin

The plugin composes concrete paths and logging around the coordinator. Starting
the plugin schedules asynchronous catch-up without delaying HTTP readiness.
Closing Fastify stops the reporter, aborts backoff, cancels the timer, and waits
for active work to settle.

Reporter failures are logged and never propagate into `/subtlety/crash`, route
sampling, or spool ingestion.

## Resonance observation context

### Existing gap

`SUBTLETY-FINGERPRINT-v1` preserves behavioral checksums and identity but not the
original error message, full error type, top stack frame, or thread. Those
values cannot be recovered from the existing ledger. The report contract needs
them for accurate human incident grouping and display.

### Forward-compatible envelope

Future outer resonance records use `SUBTLETY-RESONANCE-RECORD-v2`. The existing
fingerprint packet remains unchanged as `payload`; a fingerprint record may add
this sealed sibling context:

```json
{
  "context": {
    "schema": "SUBTLETY-OBSERVATION-CONTEXT-v1",
    "runtime": "divtube-tui",
    "errorType": "textual._context.NoActiveAppError",
    "message": "NoActiveAppError",
    "topFrame": "File \"tui/ui/app.py\", line 284, in run",
    "thread": "Thread-32"
  }
}
```

The outer checksum covers `context`. The fingerprint packet's own checksum and
schema remain authoritative and unchanged. Before persistence, every context
string replaces CRLF/CR with LF, removes NUL characters, applies these
case-insensitive redactions in order, and truncates by Unicode code point:

1. URL credentials become `scheme://[REDACTED]@host`.
2. `Bearer <value>` becomes `Bearer [REDACTED]`.
3. Values assigned to `api-key`, `api_key`, `apikey`, `token`, `password`, or
   `secret` by `:` or `=` become `[REDACTED]` while retaining the field name.

Maximum lengths are runtime `128`, error type `256`, message `2048`, top frame
`1024`, and thread `256` code points. Identity-bearing runtime, error type, and
top frame use the literal `unknown` when missing. Message and thread use an
empty display string. `null` is not used for context fields.

The reader accepts both v1 and v2 outer records. Legacy v1 records derive:

- runtime from `payload.identity.runtimeProfile` or
  `payload.execution.runtimeProfile`;
- unit ID from `payload.identity.unitId`;
- error type from the first `thread.crash.*` emit, otherwise `unknown`;
- top frame as `unknown`;
- message and thread as unavailable display values.

Legacy fallback is deterministic and produces a report warning so reduced
identity precision is visible.

## Event identity and assessment association

The stable event key is the SCD64 checksum of the canonical tuple:

```text
runtime | unitId | errorType | topFrame
```

This prevents changes in message text, build, thread, drift state, or proposal
text from splitting the same recurring incident. Legacy `unknown` components
are literal identity values; later enriched events are not back-merged into a
legacy identity because that would rewrite historical grouping.

An assessment is associated with the nearest earlier fingerprint sharing its
`unitId` until another fingerprint for that unit becomes nearer. Assessments do
not increment occurrence counts. The latest associated assessment at or before
the report window end supplies drift, seam, and propose-only remediation fields.

## Local-hour windows and daylight saving time

Window identity contains both local clock components and the actual UTC offset
at the window start. The filename is:

```text
APM-YYYY-MM-DD-HH00-UTC+HHMM.md
APM-YYYY-MM-DD-HH00-UTC-HHMM.md
```

The boundary resolver works in epoch time and observes machine-local clock
components, rather than constructing a local `Date` that could collapse the
second copy of a repeated hour. It finds the preceding and next instants whose
local minute, second, and millisecond are zero. Repeated fall-back hours have
different offsets and filenames; nonexistent spring-forward hours produce no
window.

The coordinator recalculates the next boundary after every tick. It never uses
a permanent 60-minute interval.

## Data flow

At startup and every boundary:

1. Read one ledger snapshot into memory.
2. Parse complete rows; defer an incomplete trailing row.
3. Validate schemas, checksums, and timestamps.
4. Sort valid records by epoch timestamp, then record checksum.
5. Exclude future records while retaining warnings.
6. Build fingerprint occurrences and assessment associations.
7. Group fingerprint occurrences into completed local-hour windows.
8. Select active completed windows lacking report filenames.
9. Compile those windows oldest-first.
10. Publish each report idempotently.
11. Schedule the next boundary from a fresh clock reading.

Quiet completed windows have no active fingerprint group, create no report, and
need no marker file.

## Markdown report contract

Each report includes:

1. Window start, end, canonical generation instant, timezone/offset,
   source-ledger path, and a source-record-set checksum derived from sorted
   record checksums.
2. Current-window occurrence count and distinct active-event count.
3. New-event and recurring-event counts.
4. One section per event active in the completed window.
5. Runtime, unit ID, error type, top frame, and stable event key.
6. First seen, last seen, and lifetime occurrence count through window end.
7. Occurrence times inside the completed window.
8. Every occurrence time for the identity at or before the window end.
9. Latest message, build, thread, drift assessment, seam findings, and
   propose-only remediation information when available.
10. Parsing, legacy-context, and clock-anomaly warnings.
11. A deterministic report integrity checksum.

Events sort by descending lifetime recurrence count and then stable event key.
Occurrence timestamps sort chronologically and use machine-local time with an
explicit offset. Content excludes later ledger records, so a report never
back-propagates future knowledge.

The canonical generation instant equals the completed window end. Actual wall
time of emission is logged but excluded from report content. This prevents
startup catch-up or retry time from changing otherwise identical reports. The
source-record-set checksum covers accepted records at or before the window end
that can influence occurrence history, assessments, or warnings; malformed-row
warnings use a checksum of the raw complete line. The report integrity checksum
is computed over the complete Markdown body excluding only its final integrity
checksum line.

An event is active when at least one valid fingerprint occurrence falls within
the completed window. It is recurring when the same event key has an earlier
valid fingerprint; otherwise it is new.

## Failure handling

- A ledger read failure writes nothing and enters bounded retry.
- Malformed complete rows do not suppress valid rows and appear as warnings.
- An incomplete trailing row is retried with the next stable snapshot.
- Future-dated records are excluded and appear as clock anomalies.
- Unsupported or invalid checksums are excluded and warned.
- A temporary write is never visible as a report.
- Identical target content is idempotent success.
- Divergent target content is an integrity conflict and is never overwritten.
- After retry exhaustion, the next scheduled tick or restart repeats catch-up.
- Reporter failures never throw into the APM ingest path.

## Validation

### Level 1: automated acceptance

The implementation must pass these frozen behavioral tests:

1. A quiet completed hour creates no file.
2. One fingerprint creates exactly one report after the next boundary.
3. A fingerprint and its assessment count as one occurrence.
4. A recurring event lists every historical occurrence through window end.
5. A previous event absent from the current hour receives no event section.
6. Restart before a boundary does not lose an eligible report.
7. Startup catches up an unreported completed active window.
8. Repeating a window creates no duplicate and no content drift.
9. Divergent existing content returns an integrity conflict and remains intact.
10. Input-record shuffling cannot change grouping, ordering, or checksum.
11. Spring-forward and fall-back windows and filenames are unambiguous.
12. Malformed rows and future timestamps warn without corrupting valid history.
13. Interrupted persistence leaves no visible partial report.
14. Transient I/O failures retry without duplicate output.
15. Reporter start/stop follows Fastify lifecycle and leaves no live timer.
16. Existing Subtlety route, runtime, spool, adapter, and APM tests remain green.

Additional schema tests must prove:

17. A v2 fingerprint context round-trips under the outer checksum.
18. v1 records compile with deterministic legacy fallbacks and warnings.
19. Context redaction and length bounds occur before persistence.
20. Context differences do not alter the existing fingerprint packet checksum.

Passing Level 1 alone does not promote the thesis beyond
`METASTABLE_SELECTED`.

### Level 2: real-ledger replay

The existing `codex/server/data/subtlety-resonance.jsonl` is read without
modification and compiled into a temporary report directory twice. Validation
requires:

- at least one report from an active historical hour;
- cumulative recurrence growth across chronological reports;
- byte-identical output on the second replay;
- no writes to the source ledger or production report directory;
- a preserved replay manifest containing source checksum, report filenames,
  report checksums, and test commit.

Passing Levels 1 and 2 records `IMPLEMENTED_METASTABLE`.

### Level 3: live operational promotion

After integration and server restart:

1. Observe one active completed local hour generate a report automatically in
   `divtube_downloader/APM-Hourly-Reports`.
2. Record the ledger checksum, report filename, report checksum, boundary time,
   and server commit.
3. Restart the server once.
4. Confirm the report remains byte-identical and no duplicate appears.

Only this evidence records `STABLE_OPERATIONAL` and supports the revised
majority-control thesis. Quiet hours are not failures; observation remains
pending until an active hour occurs.

## Operational configuration

Production defaults:

```text
ledger: codex/server/data/subtlety-resonance.jsonl
reports: divtube_downloader/APM-Hourly-Reports
```

Composition may accept injected paths, clock, scheduler, logger, and retry
policy for tests. Environment lookup is confined to server composition; the
compiler and coordinator do not read environment variables.

## Non-goals

- Reclassifying the original scoring run as passed.
- Changing Concept Chemistry weights, thresholds, corpus, or reactions.
- Empty heartbeat reports.
- A dashboard or browser UI.
- Automatic remediation or patch application.
- Replacing the resonance ledger as source of truth.
- Rewriting historical reports after later events arrive.
- Solving unrelated identity, baseline hydration, or alert-volume issues.
- A checkpoint, cursor, recurrence database, or streaming read model.

## Decision record

The user approved:

- the majority-control metastable selection rule;
- empirical implementation as the validator of the revised thesis;
- the Stateless Chronicle Compiler architecture;
- v1 legacy compatibility and forward observation context;
- cumulative active-window Markdown behavior;
- bounded retry, atomic non-overwrite persistence, and lifecycle isolation;
- the three-level promotion model ending in live `STABLE_OPERATIONAL` evidence.

Implementation planning may proceed only against this versioned specification.

## Result record — 2026-08-07

Recorded after executing the 10-task implementation plan
(`docs/superpowers/plans/2026-08-03-metastable-stateless-apm-hourly-reporter.md`)
end to end on branch `feature/apm-hourly-chemistry-gate`.

The original stable-selection protocol **failed**, and that negative result is
retained unchanged:

- `docs/superpowers/evidence/concept-chemistry-apm-hourly-reporter/score.json`
  — frozen 3-round experiment; gates `sameWinnerEveryRound`,
  `winnerBeatsBarEveryRound`, and `winnerMedianStable` failed (best median
  feasibility 0.2646 < STABLE_MIN 0.55); `selectedArchitecture: null`.

The revised majority-control thesis then selected the Stateless Chronicle
Compiler under the metastable rule approved for this design:

- `docs/superpowers/evidence/concept-chemistry-apm-hourly-reporter/metastable-selection.json`
  — `METASTABLE_SELECTED`, clearing wins in rounds 1 and 3, aggregate margin
  0.1259, all law controls caught.

Implementation was validated against the real ledger without touching the
production report directory:

- `docs/superpowers/evidence/concept-chemistry-apm-hourly-reporter/implementation-replay.json`
  — `IMPLEMENTED_METASTABLE`; 6 reports replayed from the real 54-record
  ledger; `sourceUnchanged: true`, `secondPassByteIdentical: true`,
  `recurrenceGrowthObserved: true`; tested at commit `7f55aad0`.

Automated verification at this point: 48/48 focused Level-1 tests across 12
files, full PixelBrain regression green (the single `calibration.test.js`
100-iteration timeout flake passes in isolation and is unrelated), production
`build:app` green, `immune:scan:all` clean.

The revised thesis has **not yet reached `STABLE_OPERATIONAL`**. The final
live-restart proof (plan Task 10 Step 7) is pending: it requires integrating
this branch through the repository merge workflow, restarting the authority
server, and observing one completed machine-local active hour. A quiet hour
leaves the step pending and is not a failure. The capture/verify driver
(`scripts/verify-subtlety-apm-live-operation.mjs`) is committed and tested;
the `live-operation.json` evidence file will be written only by a passing
verify phase.

