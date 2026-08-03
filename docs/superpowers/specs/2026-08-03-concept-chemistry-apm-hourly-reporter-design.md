# Concept Chemistry Prospective Validation: Subtlety APM Hourly Reporter

**Date:** 2026-08-03

**Status:** Frozen design pending written-spec review

**Target:** Subtlety Fingerprint APM

**Output directory:** `divtube_downloader/APM-Hourly-Reports`

**Output format:** Markdown (`.md`)

## Purpose

Use Concept Chemistry prospectively, rather than retrospectively, to select an
architecture for a missing Subtlety APM subsystem. The selected subsystem must
compile useful hourly Markdown reports from the persistent resonance ledger.
Implementation is authorized only if the frozen Concept Chemistry experiment
passes every scoring and control gate in this document.

This is a constructive test of the Concept Chemistry thesis:

1. Freeze the operational problem, candidate reactions, controls, corpus,
   scoring engine, and executable acceptance criteria.
2. Let Concept Chemistry rank the candidates without changing their wording.
3. Implement the winner only if it reaches `STABLE` and clears all controls.
4. Judge the implementation against the acceptance criteria frozen before the
   score was known.

A successful implementation is prospective constructive evidence. Repeated
success across unrelated domains would be required for broad thesis validation.

## Existing-system finding

`tests/codex/server/subtlety-routes.test.js` passes, but its contract covers
ingest, deduplication, status, authentication, spool draining, and alert-record
construction. It does not require scheduled report artifacts.

The running design currently appends `fingerprint` and `assessment` records to
`codex/server/data/subtlety-resonance.jsonl`. It has no top-of-hour scheduler,
hourly aggregation compiler, or writer for `APM-Hourly-Reports`. The requested
behavior is therefore a missing subsystem rather than a failing route handler.

## User-approved behavior

- Use the machine's local clock and timezone.
- Close reporting windows at the top of each hour.
- A window covers the completed local-clock hour, for example 14:00 through
  14:59:59.999 and is evaluated just after 15:00.
- Do not create a report for a quiet window.
- If a window contains APM activity, create exactly one Markdown report.
- For every event active in that window, include its complete historical
  recurrence timeline through the window end, including occurrences before the
  current window. Later occurrences never back-propagate into an older report.
- Store reports in `divtube_downloader/APM-Hourly-Reports`.
- Restarts must not lose eligible reports or create duplicates.

## Experimental integrity

Before scoring, record:

- Git commit and dirty-worktree state.
- `PB-CONCEPT-CHEM-v1` engine source checksum.
- Grounding-index checksum and corpus document count.
- The exact reactions and controls below.
- The scoring thresholds and pass/fail rules below.
- The implementation acceptance tests below.

The experiment uses the real encyclopedia index through
`loadEncyclopediaIndex()` and `prepareForSynthesize()`. Hand-authored grounding
scores are prohibited. No engine weight, corpus document, reaction wording,
control wording, threshold, or acceptance criterion may change after the first
score is observed.

### Score protocol

Each architecture and control has three meaning-preserving variants. Run three
aligned rounds: round 1 uses every V1, round 2 every V2, and round 3 every V3.

For each candidate:

- `medianFeasibility` is the median of its three feasibility scores.
- The same candidate must rank first among candidates in all three rounds.
- In every round, that winner must beat every bar-setting control.
- Its median feasibility must be at least `STABLE_MIN` (`0.55` in the frozen
  engine), not merely `METASTABLE`.
- Every law-violation control must return a `LAW_VIOLATION` note.

Any failed condition ends the prospective experiment without implementation.
No alternate candidate may be substituted after a failed gate.

## Frozen reaction matrix

### Candidate A: Stateless Chronicle Compiler

#### A-V1

- **A:** append-only resonance ledger preserving timestamped APM fingerprints
  and assessments
- **B:** stateless closed-hour temporal fold reconstructing cumulative event
  history from immutable records
- **Product:** deterministic hourly Markdown chronicle emitted only for active
  windows, grouping stable event identities with complete recurrence timelines

#### A-V2

- **A:** immutable chronological store of Subtlety observations and evaluations
- **B:** pure completed-hour reduction rebuilding recurrence context from all
  prior entries
- **Product:** content-addressed Markdown incident chronicle for nonempty local
  hour windows with full previous occurrence times

#### A-V3

- **A:** durable append-only APM history of observed failures and assessments
- **B:** replayable stateless window compiler deriving active event groups from
  the complete log
- **Product:** idempotent local-hour Markdown reports that omit quiet hours and
  list cumulative recurrence histories

### Candidate B: Checkpointed Window Aggregator

#### B-V1

- **A:** append-only resonance ledger preserving timestamped APM fingerprints
  and assessments
- **B:** sealed checkpoint cursor with tumbling-hour aggregation and a persistent
  cumulative recurrence index
- **Product:** restart-safe hourly Markdown reporting from checkpointed event
  windows and historically indexed event identities

#### B-V2

- **A:** immutable chronological store of Subtlety observations and evaluations
- **B:** durable cursor advancing across completed hourly buckets while an
  indexed recurrence table retains prior event times
- **Product:** hour-boundary Markdown reports produced from a recoverable
  checkpoint and cumulative identity index

#### B-V3

- **A:** durable append-only APM history of observed failures and assessments
- **B:** transactional checkpoint plus persistent recurrence table incrementally
  folding newly appended records
- **Product:** restart-resilient nonempty-hour Markdown summaries with historical
  occurrence lists

### Candidate C: Streaming Materialized View

#### C-V1

- **A:** live Subtlety APM crash and route-observation event stream
- **B:** persistent materialized recurrence view updated atomically as each event
  arrives
- **Product:** streaming APM projection producing atomic cumulative Markdown
  reports at machine-clock hour boundaries

#### C-V2

- **A:** Subtlety observations delivered continuously as failures and
  assessments occur
- **B:** durable query projection maintaining per-identity occurrence timelines
  during ingestion
- **Product:** atomic machine-hour Markdown snapshots rendered from a live
  cumulative incident view

#### C-V3

- **A:** continuous APM stream of timestamped fingerprints
- **B:** event-driven persistent read model grouping identities and appending
  recurrence times
- **Product:** nonempty hourly Markdown reports emitted from a streaming
  historical projection

## Frozen controls

### Nonsense control

#### N-V1

- **A:** APM crash ledger and incident history
- **B:** layered pastry recipe calendar with flour icing and serving plates
- **Product:** hourly monitoring chronicle organized as decorative frosting
  layers and dessert courses

#### N-V2

- **A:** Subtlety fingerprints and runtime assessments
- **B:** garden planting almanac for herbs flowers and watering cans
- **Product:** operational failure reports grouped by garden beds and bouquet
  arrangements

#### N-V3

- **A:** timestamped software-error observations
- **B:** wardrobe catalogue sorted by fabric buttons and seasonal colors
- **Product:** cumulative APM incidents rendered as clothing combinations and
  tailoring patterns

### False-friend control: current-window-only snapshot

#### S-V1

- **A:** hourly APM reporting
- **B:** isolated current-window event counter without historical state
- **Product:** Markdown snapshot containing only the completed hour and omitting
  every prior recurrence

#### S-V2

- **A:** top-of-hour Subtlety status summary
- **B:** ephemeral bucket discarded after its current counts are printed
- **Product:** incident report that forgets previous appearances of active errors

#### S-V3

- **A:** scheduled monitoring report
- **B:** one-hour-only aggregation with no cumulative event identity
- **Product:** local-hour Markdown counts that cannot show whether an issue is
  ongoing

### False-friend control: raw ledger copy

#### R-V1

- **A:** append-only APM resonance JSONL
- **B:** hourly file copy with a Markdown filename
- **Product:** ungrouped raw ledger duplication presented as a human incident
  report

#### R-V2

- **A:** persistent Subtlety fingerprint records
- **B:** verbatim text export at each clock boundary
- **Product:** Markdown artifact with no stable event grouping or recurrence
  timeline

#### R-V3

- **A:** chronological monitoring data
- **B:** scheduled replication of every source line
- **Product:** hourly report that copies storage syntax without compiling
  operational meaning

### Law-violation control

#### L-V1

- **A:** APM event history
- **B:** unseeded random selection and destructive rewriting of earlier records
- **Product:** hourly reports generated by random sampling until incidents look
  plausible

#### L-V2

- **A:** Subtlety resonance ledger
- **B:** arbitrary deletion of prior failures and stochastic event selection
- **Product:** nondeterministic monitoring summaries that erase inconvenient
  history

#### L-V3

- **A:** cumulative incident evidence
- **B:** unseeded shuffling with mutable replacement of previous observations
- **Product:** random hourly narratives that cannot be reproduced from the
  ledger

## Shared subsystem contract

The winning architecture must expose the same logical boundaries.

### Core compiler

Pure functions:

- Select a completed machine-local hour window.
- Parse and validate an immutable ledger snapshot supplied by the caller.
- Count only `fingerprint` records as occurrences.
- Associate assessment records without counting them as new occurrences.
- Derive stable event identity from runtime, unit ID, error type, and top frame.
- Select identities active in the completed window.
- Reconstruct recurrence timelines through the completed window end for
  selected identities.
- Render deterministic Markdown and derive an integrity checksum.

Core code performs no filesystem access, scheduling, logging, or environment
lookup.

### Persistence service

- Read a byte-stable snapshot of the resonance JSONL ledger.
- Confine output to `divtube_downloader/APM-Hourly-Reports`.
- Write a temporary file in the destination directory and atomically rename it.
- If the target already contains identical content, leave it untouched.
- If existing content differs, return an integrity conflict and never overwrite.

### Runtime coordinator

- Calculate completed local-clock windows using an injected clock.
- Determine which active windows lack reports.
- Compile and persist missing reports chronologically.
- Retry transient read/write failures with bounded backoff.
- Recalculate the next hour boundary after every tick.
- Stop cleanly by cancelling pending scheduling work.

### Server lifecycle

- Start the reporter with the Fastify/server lifecycle.
- Catch up completed active windows on startup.
- Stop the reporter during graceful shutdown.
- Report reporter failures through logging/diagnostics without crashing the APM
  ingest path.

## Candidate-specific internals

- **Stateless Chronicle Compiler:** rebuild selection and recurrence context from
  the complete ledger snapshot on every run. It has no cursor or derived-state
  database.
- **Checkpointed Window Aggregator:** advance a sealed cursor and durable
  recurrence index, with replay from the ledger when checkpoint validation
  fails.
- **Streaming Materialized View:** update a durable recurrence projection during
  event ingestion and render hourly snapshots from that projection, with ledger
  replay as the recovery authority.

The external contract and acceptance criteria do not change with the winner.

## Markdown report contract

Filename template:

```text
APM-YYYY-MM-DD-HH00-UTC±HHMM.md
```

The date and hour identify the completed window's local start. The explicit UTC
offset makes repeated daylight-saving hours unambiguous.

Each report contains:

1. Window start, window end, generation time, timezone/offset, source-ledger
   path, and a canonical source-record-set checksum derived after sorting record
   checksums rather than hashing incidental JSONL line order.
2. Current-window occurrence count and distinct active-event count.
3. New-event and recurring-event counts.
4. One section per event active during the completed window.
5. Runtime, unit ID, error type, top stack frame, and stable event key.
6. First seen, last seen, and lifetime occurrence count.
7. Occurrence times inside the completed window.
8. Every occurrence time for that identity at or before the completed window
   end, in chronological order.
9. Latest message, build, thread, drift assessment, seam findings, and
   propose-only remediation information when available.
10. Ledger parsing and clock-anomaly warnings.
11. A deterministic report integrity checksum.

Events sort by descending lifetime recurrence count, then stable identity.
Timestamps within an event sort chronologically.

An event is **active** when at least one valid `fingerprint` occurrence falls in
the completed window. It is **recurring** when the same stable identity has at
least one valid occurrence before the window start; otherwise it is **new**.

## Scheduling and recovery

- Use machine-local wall-clock boundaries.
- Recalculate the delay to the next boundary after every run; do not use a
  permanent 60-minute interval.
- On startup, scan for completed active windows without corresponding reports
  and compile them oldest-first.
- A quiet window has no report and needs no marker file.
- Report existence plus ledger history determines catch-up work; process memory
  is never authoritative.
- Retry transient persistence failures with bounded backoff. Idempotent output
  prevents retries from duplicating reports.

## Failure handling

- Malformed complete JSONL rows are isolated, counted, and described in the
  report warning section while valid records continue.
- An incomplete trailing row is deferred until a later stable snapshot.
- Future-dated records are excluded and reported as clock anomalies.
- A ledger read failure produces no report and schedules retry.
- A partial temporary file is never promoted.
- An integrity conflict with an existing report is surfaced and never repaired
  by silent overwrite.
- Reporter failures never throw into the crash-ingest path.

## Frozen implementation acceptance tests

1. A quiet completed hour creates no file.
2. One fingerprint in a completed hour creates exactly one Markdown report just
   after the next local-hour boundary.
3. A fingerprint and its assessment count as one occurrence.
4. An event recurring across several hours shows every historical occurrence in
   the active hour's report.
5. A previous event absent from the current hour does not receive its own event
   section.
6. Restart before the boundary does not lose the eligible report.
7. Startup catches up an unreported completed active window.
8. Running the same window twice produces no duplicate and no content drift.
9. Existing divergent content returns an integrity conflict and remains intact.
10. Input-record shuffling cannot change grouped ordering or checksum.
11. Spring-forward and fall-back transitions produce correct, unambiguous local
    windows and filenames.
12. Malformed rows and future timestamps appear as warnings without corrupting
    valid event histories.
13. An interrupted atomic write leaves no visible partial `.md` report.
14. Transient I/O failures retry without duplicate output.
15. Reporter start/stop follows server lifecycle and leaves no live timer after
    shutdown.
16. Existing Subtlety route, runtime, spool, adapter, and APM tests remain green.

## Evidence and decision record

The scoring run must preserve:

- Per-round feasibility, stability, law note, grounding, bond, coherence, and
  checksum for every candidate and control.
- Per-candidate median feasibility.
- Per-round candidate winner and best bar control.
- Corpus and engine checksums.
- An explicit pass/fail result for every gate.
- The selected architecture, if and only if all gates pass.

If scoring passes, the next artifact is an implementation plan for the selected
architecture. If scoring fails, record the negative result and stop. Do not
rewrite reactions or implement a preferred fallback under this experiment.

## Non-goals

- Empty heartbeat reports.
- Dashboard or browser UI.
- Automatic remediation or patch application.
- Replacing the resonance ledger as source of truth.
- Rewriting historical reports after later events arrive.
- Changing Concept Chemistry weights or promoting diagnostic channels into the
  feasibility score.
- Solving unrelated APM identity, baseline-hydration, or alert-volume issues in
  the same implementation.
