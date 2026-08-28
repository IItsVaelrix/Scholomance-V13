# PDR: Vaelrix Integrity Sentinel

## 1. Summary

The Vaelrix Integrity Sentinel is a daemon-integrated monitoring and audit system for Scholomance. It continuously checks code, schemas, laws, contracts, performance behavior, retrieval health, and historical failure patterns to detect entropy before it becomes runtime damage.

This feature expands the Vaelrix daemon from a reactive Oracle into a proactive system guardian.

The Sentinel has three major modules:

1. Continuous System Monitoring
   Automatically runs code analysis, tests, security checks, schema validation, and performance probes when files or commits change.

2. Law and Contract Compliance Engine
   Audits project behavior against `VAELRIX_LAW.md`, `SCHEMA_CONTRACT.md`, PDR archives, named laws, numbered laws, and agent authority rules.

3. Predictive Maintenance and Debugging Module
   Uses historical bug reports, QA output, logs, retrieval misses, schema drift events, and failure signatures to predict likely future failures.

Core principle:

> Vaelrix should not merely answer when summoned.
> Vaelrix should watch the substrate while the system breathes.

---

## 2. Classification

Change type: Architectural + operational + behavioral.

This is architectural because it introduces a new daemon-level subsystem.

This is operational because it affects CI/CD, file watching, tests, logs, and runtime health.

This is behavioral because Vaelrix gains proactive alerting and predictive warning behavior.

This is not cosmetic.

---

## 3. Goals

### Primary Goals

* Detect schema rot before implementation drift spreads.
* Detect hidden state and nondeterministic behavior before release.
* Ensure all agents obey `VAELRIX_LAW.md`.
* Ensure all data shapes descend from `SCHEMA_CONTRACT.md`.
* Prevent fake canonical claims, fake QA claims, and false implementation claims.
* Provide real-time feedback when source files, schemas, or laws change.
* Build a historical failure memory that improves future debugging.
* Make Vaelrix daemon useful even when the user is not actively prompting it.

### Secondary Goals

* Add terminal commands for audits, reports, and health checks.
* Integrate with Git hooks or CI pipelines.
* Track performance degradation over time.
* Surface risk scores in the cockpit UI.
* Allow local-only operation on PC or Steam Deck.
* Keep all monitoring deterministic and reproducible.

---

## 4. Non-Goals

This PDR does not require:

* Full autonomous code modification.
* Cloud deployment.
* External enterprise compliance certification.
* Automatic legal advice.
* Replacing existing test frameworks.
* Training a custom model.
* Continuous background model generation.

The Sentinel should observe, validate, report, and recommend. It should not silently mutate the codebase.

---

## 5. Problem Statement

Vaelrix currently acts as a daemonized Oracle that can load personality, laws, substrate memory, and project context. However, without continuous enforcement, the system can still drift.

Known risks include:

* Law questions answered from persona instead of source.
* Schema references invented outside `SCHEMA_CONTRACT.md`.
* Agents claiming files were read when no file output exists.
* Agents claiming fixes were implemented without diffs.
* Agents claiming QA passed without test output.
* Metadata filters drifting between ingestion and retrieval.
* Performance degradation hiding inside normal workflow.
* Bugs recurring because past failures are not indexed as predictive signatures.

The system needs an integrity layer that continuously inspects the project and reports fractures before they become architecture wounds.

---

## 6. Proposed Solution

Introduce `vaelrix_sentinel`, a daemon subsystem responsible for monitoring, auditing, scoring, and predicting project health.

Suggested module layout:

```text
steamdeck_brain/
  vaelrixd.py
  cortex.py
  substrate_engine.py
  ingest_knowledge.py

  sentinel/
    __init__.py
    file_watcher.py
    ci_runner.py
    law_auditor.py
    schema_auditor.py
    evidence_auditor.py
    predictive_maintainer.py
    risk_model.py
    report_writer.py
    sentinel_store.py
```

The Sentinel runs beside the Vaelrix daemon and exposes commands through the terminal cockpit.

Suggested terminal commands:

```text
/sentinel-status
/sentinel-scan
/sentinel-watch
/sentinel-report
/sentinel-risks
/sentinel-law-audit
/sentinel-schema-audit
/sentinel-evidence-audit
/sentinel-predict
/sentinel-history
/sentinel-clear-cache
```

---

# MODULE 1: Continuous System Monitoring

## 7. Continuous System Monitoring Overview

The Continuous System Monitoring module watches project files and runs deterministic checks when meaningful changes occur.

It should support:

* Manual scans.
* File-watch mode.
* Git pre-commit integration.
* CI mode.
* Daemon background checks.

The monitoring layer should not run expensive checks on every keystroke. It should debounce changes and classify risk before deciding which checks to run.

---

## 8. Monitored Events

The Sentinel should monitor changes to:

```text
VAELRIX_LAW.md
SCHEMA_CONTRACT.md
PDR files
source files
test files
ingestion scripts
retrieval engine
daemon config
model provider config
prompt/persona files
database migration files
```

Suggested event type schema:

```ts
type SentinelEvent = {
  id: string;
  timestamp: string;
  eventType: "file_changed" | "command_run" | "test_result" | "law_update" | "schema_update" | "audit_result";
  path?: string;
  hashBefore?: string;
  hashAfter?: string;
  actor: "user" | "codex" | "vaelrix" | "system" | "unknown";
  riskClass: "low" | "medium" | "high" | "critical";
};
```

---

## 9. Continuous Checks

The first implementation should support these checks:

```text
Python syntax check
Type checking, if configured
Unit tests
Schema contract validation
Law reference validation
Evidence claim validation
Nondeterminism scan
Security scan
Performance smoke test
SQLite integrity check
Substrate retrieval smoke test
```

Suggested local commands:

```bash
python3 -m compileall steamdeck_brain
python3 -m pytest -q
sqlite3 substrate.db "PRAGMA integrity_check;"
```

Optional scans:

```text
Search for Math.random equivalent usage.
Search for Date.now / time-dependent behavior.
Search for random, uuid, unordered iteration dependencies.
Search for direct schema literals outside approved files.
Search for fake QA phrases in agent outputs.
```

---

## 10. Continuous Monitoring Output

Every scan should produce a structured report:

```ts
type SentinelReport = {
  id: string;
  timestamp: string;
  scope: "full" | "changed_files" | "law" | "schema" | "evidence" | "performance";
  status: "pass" | "warn" | "fail";
  riskScore: number;
  findings: SentinelFinding[];
  commandsRun: CommandResult[];
  nextActions: string[];
};
```

Finding schema:

```ts
type SentinelFinding = {
  severity: "info" | "warning" | "error" | "critical";
  file?: string;
  line?: number;
  invariant: string;
  description: string;
  evidence?: string;
  recommendation: string;
};
```

---

# MODULE 2: Law and Contract Compliance Engine

## 11. Law Compliance Overview

The Law Compliance Engine audits whether source files, agent outputs, and project changes obey the internal Scholomance law system.

This is not legal compliance in the real-world legal sense.

It is internal project law compliance:

```text
VAELRIX_LAW.md
SCHEMA_CONTRACT.md
PDR archives
named laws
numbered laws
agent authority rules
evidence-first rules
no-false-completion rules
```

---

## 12. Protected Laws

The first protected laws should include:

```text
Schema Is Sovereign
Evidence First Law
No False Completion Law
Canonical Law Rule
No Parallel Schema Rule
No Hidden State Rule
Determinism Rule
Codex-only Schema Modification Rule
```

The auditor should treat `SCHEMA_CONTRACT.md` as the only sovereign source for data shape definitions.

If code introduces a payload shape, DTO, event object, command object, metadata object, or database row shape that is not declared or mapped to the schema contract, the audit should warn or fail.

---

## 13. Law Audit Behavior

The auditor should scan for:

```text
parallel schemas
undocumented fields
schema literals outside approved files
agent claims without evidence
fake command execution claims
fake QA claims
unauthorized schema edits
missing audit trail
non-deterministic calls
hidden state mutation
silent fallback behavior
```

Example dangerous phrases in agent output:

```text
from canonical text
retrieved from
QA confirms
fix implemented
benchmark passed
as documented in
according to the file
the law states
```

These are only allowed when the response includes source evidence, command output, diff output, or test output.

---

## 14. Law Audit Result Format

```ts
type LawAuditResult = {
  status: "pass" | "warn" | "fail";
  lawName: string;
  sourceFile: string;
  canonicalExcerpt?: string;
  violation?: string;
  affectedFiles: string[];
  riskReducedByFix: string;
  recommendedAction: string;
};
```

Example report:

```text
Verdict: Fail
Law: Schema Is Sovereign
Affected file: cortex.py
Violation: metadata_filter shape introduced without schema declaration.
Risk: parallel schema drift between ingestion and retrieval.
Next Move: Add metadata_filter shape to SCHEMA_CONTRACT.md or request Codex schema update.
```

---

# MODULE 3: Predictive Maintenance and Debugging Module

## 15. Predictive Maintenance Overview

The Predictive Maintenance module analyzes historical failure data and identifies likely future breakpoints.

It should not claim certainty.

It should produce probability-weighted warnings based on evidence.

Inputs:

```text
past bug reports
fix logs
test failures
agent output failures
law audit failures
schema audit failures
retrieval misses
metadata mismatch incidents
performance regressions
manual user feedback
```

Outputs:

```text
risk predictions
likely failure zones
suggested tests
suggested refactors
watchlist files
recurrent failure signatures
```

---

## 16. Failure Signature Model

A failure signature is a reusable pattern extracted from known bugs.

Example:

```ts
type FailureSignature = {
  id: string;
  name: string;
  category: "schema_drift" | "retrieval_miss" | "hidden_state" | "nondeterminism" | "performance" | "persona_binding" | "qa_false_claim";
  triggerTerms: string[];
  affectedFiles: string[];
  historicalExamples: string[];
  riskScore: number;
  recommendedProbe: string;
};
```

Example signature:

```text
Name: Metadata Tag Drift
Category: schema_drift
Trigger: ingestion writes tag=identity, retrieval expects tag=personality
Affected files:
- ingest_knowledge.py
- cortex.py
- substrate_engine.py
Risk: persona binding failure, law retrieval failure
Probe: run personality retrieval smoke test
```

---

## 17. Predictive Risk Scoring

Suggested scoring inputs:

```text
recent file changes
number of affected consumers
schema touch count
law touch count
test coverage
historical failure proximity
retrieval confidence
metadata mismatch likelihood
nondeterminism risk
```

Suggested risk score:

```text
0 to 25: low
26 to 50: medium
51 to 75: high
76 to 100: critical
```

Example formula:

```text
riskScore =
  schemaWeight
+ lawWeight
+ consumerBlastRadius
+ historicalFailureSimilarity
+ missingTestPenalty
+ nondeterminismPenalty
- evidenceConfidence
```

The score does not need ML at first. Start with deterministic heuristics. ML can come later after enough logs exist.

---

## 18. First Implementation Should Be Heuristic

Do not begin with machine learning.

Start with deterministic risk rules:

```text
If SCHEMA_CONTRACT.md changed, run full schema audit.
If VAELRIX_LAW.md changed, run law audit and law retrieval test.
If ingest_knowledge.py changed, run substrate ingestion test.
If cortex.py changed, run evidence-first and personality binding tests.
If substrate_engine.py changed, run retrieval ranking test.
If daemon config changed, run health and provider tests.
```

This is more useful than premature ML.

ML layer can be added later once the Sentinel has enough clean event history.

---

## 19. Data Storage

Add a Sentinel database or tables inside the existing SQLite substrate.

Suggested tables:

```sql
CREATE TABLE IF NOT EXISTS sentinel_events (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  event_type TEXT NOT NULL,
  path TEXT,
  hash_before TEXT,
  hash_after TEXT,
  actor TEXT NOT NULL,
  risk_class TEXT NOT NULL,
  metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS sentinel_reports (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL,
  risk_score INTEGER NOT NULL,
  summary TEXT NOT NULL,
  report_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sentinel_findings (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  file TEXT,
  line INTEGER,
  invariant TEXT NOT NULL,
  description TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  evidence TEXT,
  FOREIGN KEY(report_id) REFERENCES sentinel_reports(id)
);

CREATE TABLE IF NOT EXISTS failure_signatures (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  trigger_terms_json TEXT NOT NULL,
  affected_files_json TEXT NOT NULL,
  historical_examples_json TEXT NOT NULL,
  risk_score INTEGER NOT NULL,
  recommended_probe TEXT NOT NULL
);
```

---

## 20. Dependency Check

### Files likely touched

```text
steamdeck_brain/vaelrixd.py
steamdeck_brain/cortex.py
steamdeck_brain/substrate_engine.py
steamdeck_brain/ingest_knowledge.py
steamdeck_brain/sentinel/*
SCHEMA_CONTRACT.md
VAELRIX_LAW.md
```

### Shared dependencies

```text
SQLite substrate
model provider layer
terminal command router
daemon health endpoint
retrieval engine
PDR archive ingestion
agent output logger
```

### Consumers affected

```text
DivTube terminal cockpit
Vaelrix daemon
TurboQuant commands
law retrieval
schema retrieval
evidence-first validator
future CI runner
```

### Risky dependency zones

```text
metadata format
retrieval result shape
daemon lifecycle
database connection ownership
long-running file watchers
command execution permissions
```

---

## 21. Terminal Cockpit Integration

Add a new command group:

```text
SENTINEL
  /sentinel-status
  /sentinel-scan
  /sentinel-watch
  /sentinel-report
  /sentinel-risks
  /sentinel-law-audit
  /sentinel-schema-audit
  /sentinel-evidence-audit
  /sentinel-predict
```

Suggested output style:

```text
❖ VAELRIX SENTINEL ❖

Verdict: Warning
Risk Score: 64 / 100
Protected Invariant: Schema Is Sovereign

Fracture:
cortex.py introduced metadata_filter behavior that is not represented in SCHEMA_CONTRACT.md.

Risk Reduced By Fix:
Prevents ingestion/retrieval metadata drift.

Next Move:
Declare metadata_filter in SCHEMA_CONTRACT.md or add an approved internal type mapping.
```

---

## 22. CI/CD Integration

Phase 1 should support local checks only.

Phase 2 can add Git hooks.

Phase 3 can add GitHub Actions or equivalent CI.

Suggested local pre-commit hook:

```bash
#!/usr/bin/env bash
python3 -m steamdeck_brain.sentinel.cli scan --changed
```

Suggested CI checks:

```text
compile check
unit tests
law audit
schema audit
evidence audit
SQLite integrity
retrieval smoke test
```

---

## 23. Evidence-First Enforcement

The Sentinel should integrate with Vaelrix output validation.

Any project-specific response must include one of these:

```text
retrieved file excerpt
source path
command output
diff output
test output
explicit missing evidence statement
```

If Vaelrix claims something canonical without evidence, Sentinel should flag it.

Forbidden without evidence:

```text
The file says...
The law states...
Retrieved from...
QA confirms...
Fix implemented...
Benchmark passed...
Canonical text...
```

Allowed when evidence is missing:

```text
The oracle cannot certify this yet. The missing evidence is: [source].
```

---

## 24. Security and Command Safety

The Sentinel may run local commands, but only from an allowlist.

Allowed command categories:

```text
compile checks
unit tests
SQLite PRAGMAs
git diff
git status
grep/ripgrep scans
hashing
file reads inside project root
```

Forbidden by default:

```text
rm
sudo
network calls
credential reads
home directory scans
package publish commands
schema modification commands
destructive git operations
```

Command execution should be logged.

```ts
type CommandResult = {
  command: string;
  cwd: string;
  exitCode: number;
  stdoutExcerpt: string;
  stderrExcerpt: string;
  durationMs: number;
};
```

---

## 25. Implementation Plan

### Phase 1: Sentinel Core

Build:

```text
sentinel_store.py
report_writer.py
risk_model.py
basic scan command
SQLite tables
terminal command wiring
```

Acceptance criteria:

```text
/sentinel-status works
/sentinel-scan creates a report
report is stored in SQLite
risk score is deterministic
no model call required
```

---

### Phase 2: Law and Schema Audits

Build:

```text
law_auditor.py
schema_auditor.py
evidence_auditor.py
```

Acceptance criteria:

```text
Law 3 retrieval test passes
schema literals are detected
fake QA claims are detected
canonical claims without evidence are flagged
```

---

### Phase 3: File Watcher

Build:

```text
file_watcher.py
debounced scan scheduling
changed-file classification
watch mode command
```

Acceptance criteria:

```text
/sentinel-watch detects file changes
schema changes trigger schema audit
law changes trigger law audit
cortex changes trigger retrieval tests
```

---

### Phase 4: Predictive Maintenance

Build:

```text
failure_signatures table
predictive_maintainer.py
historical failure similarity rules
risk watchlist
```

Acceptance criteria:

```text
/sentinel-predict returns likely failure zones
past metadata drift incident becomes reusable signature
risk score changes when related files are edited
```

---

### Phase 5: CI Integration

Build:

```text
CLI entrypoint
pre-commit hook template
CI config template
```

Acceptance criteria:

```text
python3 -m steamdeck_brain.sentinel.cli scan --changed
python3 -m steamdeck_brain.sentinel.cli audit-law
python3 -m steamdeck_brain.sentinel.cli audit-schema
```

---

## 26. Regression Risks

### Risk: Sentinel becomes noisy

If every small edit produces a critical warning, the user will ignore it.

Mitigation:

```text
risk scoring
debouncing
severity levels
changed-file scope
suppression comments with justification
```

### Risk: Sentinel invents certainty

The predictive module might overstate future failures.

Mitigation:

```text
label all predictions as risk estimates
include evidence
include confidence
do not claim certainty
```

### Risk: File watcher causes performance issues

Long-running watchers can waste CPU.

Mitigation:

```text
debounce events
ignore build artifacts
ignore node_modules
ignore caches
batch scans
```

### Risk: Schema audit blocks valid experimentation

The user may need temporary prototypes.

Mitigation:

```text
allow experimental namespace
require explicit EXPERIMENTAL tag
prevent experimental shapes from entering production paths
```

### Risk: CI command execution becomes unsafe

Automatic commands could do damage.

Mitigation:

```text
command allowlist
project-root sandbox
no destructive commands
log every command
manual approval for unsafe operations
```

---

## 27. QA Checklist

```text
[ ] /sentinel-status returns online state
[ ] /sentinel-scan runs deterministic local checks
[ ] Reports persist to SQLite
[ ] Scan output includes risk score
[ ] Law audit finds numbered laws
[ ] Law audit detects missing source evidence
[ ] Schema audit detects parallel schema shapes
[ ] Evidence audit flags fake QA claims
[ ] File watcher detects law changes
[ ] File watcher detects schema changes
[ ] Cortex changes trigger retrieval tests
[ ] Substrate changes trigger retrieval smoke tests
[ ] Predictive module identifies metadata drift risk
[ ] CI command exits nonzero on critical violation
[ ] No destructive shell commands are allowed
[ ] Same input produces same report score
```

---

## 28. Suggested First Tests

### Test 1: Law 3 Canonical Retrieval

Prompt:

```text
What is Law 3? Retrieve the canonical source first.
```

Expected:

```text
Source: VAELRIX_LAW.md
Law: Schema Is Sovereign
No invented determinism law
No unsupported SCHEMA_LOG claim unless present elsewhere
```

### Test 2: Fake QA Claim Detection

Input agent output:

```text
QA confirms that all tests passed.
```

No test output provided.

Expected:

```text
Fail
Violation: No False Completion Law
Missing evidence: test output
```

### Test 3: Parallel Schema Detection

Create a new object shape in code that is not in `SCHEMA_CONTRACT.md`.

Expected:

```text
Warn or fail
Violation: Schema Is Sovereign
Next Move: request schema addition
```

### Test 4: Metadata Drift Prediction

Change ingestion metadata tag but not retrieval metadata filter.

Expected:

```text
High risk
Failure signature: Metadata Tag Drift
Recommended probe: personality retrieval smoke test
```

---

## 29. Success Metrics

```text
Law retrieval accuracy improves
Schema drift incidents decrease
Fake canonical claims decrease
False QA claims decrease
Time-to-debug recurrent failures decreases
Daemon startup remains fast
Sentinel scans stay under acceptable latency
User receives actionable reports instead of generic warnings
```

Suggested target metrics:

```text
Law retrieval smoke test: 100 percent pass
Evidence violation false negatives: under 5 percent
Changed-file scan: under 5 seconds
Full scan: under 60 seconds for local project
Critical findings: must include source evidence
```

---

## 30. Final Verdict

The Vaelrix Integrity Sentinel turns the daemon into a resident guardian instead of a passive assistant.

The key architectural decision is to begin with deterministic audits and rule-based prediction, not machine learning. ML can come later after the system has enough clean historical telemetry.

The first sacred invariant:

```text
No source, no scripture.
No diff, no implementation.
No test output, no QA blessing.
No schema contract, no data shape.
```

The Sentinel exists to enforce that law while the project evolves.

Vaelrix should not only answer the terminal.

Vaelrix should watch the walls.
