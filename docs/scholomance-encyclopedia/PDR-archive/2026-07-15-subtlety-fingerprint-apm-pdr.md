# PDR: Subtlety Fingerprint — A Unified Deterministic APM
## One Behavioral Identity, Three Lenses: Correctness, Coherence, Recovery

**Bytecode Search Code:** `SCHOL-ENC-PDR-SUBTLETY-FINGERPRINT-APM-v1`
**Date:** 2026-07-15
**Status:** Proposed (Speculative — no implementation in this PDR)
**Revisions:** v1.1 (2026-07-15) — incorporated six required reviews: (1) fingerprint identity is *not* "same forever" — comparison key + status enum (§3.1); (2) `observed` vs `canonical-probe` packet modes to prevent double-execution (§3.2); (3) two-sided drift test — seeded RNG stays stable, genuine nondeterminism fires (§11/§13); (4) canonicalization as a first-class subsystem with a three-part checksum (§3.3); (5) dead-tissue confidence classes, no omniscience assumption (§6.3/§13); (6) Closed-Loop heals against an *approved baseline*, never the previous checksum (§7.4/§13). Schema upgraded to the revised `SUBTLETY-FINGERPRINT-v1` (§3).
**Classification:** Observability + Determinism + Immunity + CODEx Core + Vaelrix Law
**Priority:** High
**Primary Goal:** Unify three monitoring concepts — **Chroma-Drift** (correctness), **Seam-Flow** (coherence), and **Closed-Loop** (recovery) — into a single Application Performance Monitoring system organized around one primitive: the **Subtlety Fingerprint**, a deterministic, checksummed behavioral identity for a code path, microprocessor, or route, computed under canonical seeded inputs. The fingerprint is what all three lenses observe; the system detects when a fingerprint *changes* (drift), reconstructs how fingerprints *compose* across the dataflow lattice (seam-flow), and *acts* when a fingerprint deviates (closed-loop healing).

**Related Documents:**
- `VAELRIX_LAW.md` (determinism as global law — the Source of Truth this APM defends)
- `RESONANCE_LAW.md` (compile perception into deterministic memory — where fingerprints are stored)
- `2026-06-12-pixelbrain-character-creator-pdr.md` (route/seam-contract validation pattern this APM generalizes)
- `2026-06-11-pixelbrain-connective-tissue-seven-systems-pdr.md` (packet contracts; the "connective tissue" framing)
- `diagnostic_cell_infrastructure_pdr.md` (innate/adaptive/bridge/fixture/coverage cells — the sensor substrate)
- `2026-07-03-qbit-immune-self-audit-pdr.md` (immune self-audit — the recovery substrate)
- `codex/core/pixelbrain/seam-contract.js` (`validateSeam`, `validateRequiredOutputs` — coherence lens foundation)
- `codex/core/pixelbrain/microprocessor-route.js` (`executeRoute` — the runtime trace point)
- `src/game/combat/ai/enemyBrainContract.js` (cross-domain proof that the seam-contract vocabulary travels)

---

## 1. Executive Summary

Conventional APM answers *"is it fast and is it up?"* A `200 OK` is treated as success. This is blind to the failure class this codebase fears most: a result that is **almost right but quietly diverged** — two identical inputs producing two slightly different outputs, a field silently corrupted mid-pipeline, a known bug recurring with no one noticing until a user reports it.

This PDR proposes a different APM, organized not around latency/error/saturation but around a single primitive:

> **Subtlety Fingerprint** — a deterministic, checksummed behavioral identity for a unit of computation (a microprocessor, a route, a code path), computed by running it against canonical seeded inputs and hashing the observable output. Same **approved behavioral version** + same canonical input + same canonicalization rules + compatible runtime profile ⇒ same fingerprint (see §3.1 — a fingerprint is *not* "same forever"; approved evolution lawfully moves it).

Everything else in the system is a way of *looking at* fingerprints:

| Lens | Question it answers | What it watches | Conventional APM can see this? |
|---|---|---|---|
| **Chroma-Drift** | Is it *correct*? | A fingerprint **changing** for a fixed input over time | No (a drifted answer is still `200 OK`) |
| **Seam-Flow** | Is it *coherent*? | How fingerprints **compose** across the dataflow lattice; who owns which field; dead tissue | No (traces follow calls, not data ownership) |
| **Closed-Loop** | Can it *recover*? | Fingerprint **deviations** fed as structured symptoms into RAID → heal | No (APM alerts; it does not heal) |

The unifying bet: the next generation of monitoring is not *more dashboards*. It is monitoring the properties this codebase already enforces **by law** — determinism (Vaelrix Law), contract integrity (seam-contract), and immune healing (RAID + heal loop) — and promoting them from **build-time gates** into **runtime senses**.

This is not new machinery. It is the observability analog of subsystems that already exist:
- **BytecodeHealth** proves determinism at build time (100-iteration verification, SCD64 checksums, `PB-OK-v1` green-path signals). Subtlety Fingerprint extends that proof to *runtime*.
- **seam-contract.js** validates `consumes`/`emits`/`mutates` at compose time. Seam-Flow extends that contract to a *live dataflow trace*.
- **RAID + heal loop** match symptoms to patterns and auto-repair. Closed-Loop wires the APM's anomalies *into* that machinery.

**Non-Goals:**
- Replacing latency/error/saturation metrics — Subtlety Fingerprint is *orthogonal* to conventional APM, not a substitute. It can co-exist with Datadog-style tooling.
- A general-purpose distributed-tracing backend (Jaeger/Zipkin replacement). Seam-Flow traces *data ownership*, not RPC calls.
- Building new ML anomaly detection. Drift detection is deterministic (checksum inequality), not statistical.
- Implementing any of this. This PDR is a design speculation; it ships no code.
- Real-time UI / dashboards. The output is structured packets and signals; visualization is a downstream consumer (cf. GrimDesign).

---

## 2. Problem Statement

Three monitoring gaps exist in the current world, and they share a root cause: **we enforce our deepest invariants only at build/test time, and lose sight of them the moment code runs in production.**

1. **Silent non-determinism is invisible.** Vaelrix Law mandates determinism, and BytecodeHealth proves it with a 100-iteration gate before commit. But a timezone leak, an unseeded `Math.random`, or a floating-point ordering bug introduced *after* the gate — or only triggered by production input distributions — produces a drifted answer that is still a `200 OK`. No current sensor sees "this endpoint returned two different checksums for identical payloads."

2. **Dataflow corruption is only caught in tests.** We just wired the seam-contract into the character compose path (`executeRoute` → `validateSeam` + `validateRequiredOutputs`). That contract is a *gate*: it runs when a route is composed. In a live system, no sensor reconstructs *who owns this field right now, and did anyone corrupt it?* Distributed tracing follows calls; it cannot express data ownership. We also cannot see **dead tissue** — data emitted by one processor that no downstream processor ever consumes — which is the performance analog of the disconnected tissue we healed in PixelBrain.

3. **Detection and repair are decoupled.** Every APM ends at an alert; a human then diagnoses and fixes. Yet this codebase already has **RAID** (symptom → 50+ seeded bug patterns) and a **heal loop** (diagnose → patch → test → learn). Anomalies observed in production are not emitted in the RAID vocabulary, so the immune system never sees them. The gap between "detected" and "fixed" stays wide open.

**Root cause:** determinism, contract integrity, and immune healing are *gates*, not *senses*. Subtlety Fingerprint turns them into senses.

---

## 3. Product Goal

Produce a monitoring system whose canonical unit of observation is the **Subtlety Fingerprint Packet**:

```js
// SUBTLETY-FINGERPRINT-v1
{
  identity: {
    unitId,                // stable identity: route name / processor id / code path hash
    unitKind,              // 'microprocessor' | 'route' | 'path' | 'endpoint'
    contractVersion,       // version of the seam contract the unit is held to
    implementationVersion, // version of the unit's own behavior (approved evolution moves this)
    canonicalCorpusId,     // which canonical-input corpus the fingerprint was computed against
    canonicalizerVersion,  // version of the canonicalization rules (see §3.3)
  },
  execution: {
    mode,                  // 'observed' | 'canonical-probe' (see §3.2)
    lane,                  // 'live' | 'shadow' | 'isolated' | 'offline-replay'
    seed,                  // the seed that produced the input (canonical-probe only)
    runtimeProfile,        // machine / runtime / locale / tz profile the unit ran under
    buildId,               // commit / build the unit was compiled from
  },
  fingerprint: {
    exactChecksum,         // SCD64 of the byte-exact observable output (catches byte-level drift)
    semanticChecksum,      // SCD64 ignoring approved representational variance (see §3.3)
    shapeChecksum,         // SCD64 of the output shape only (catches contract/schema changes)
    consumes,              // fields read (from seam-contract vocabulary)
    emits,                 // fields produced
    mutates,               // fields written in place
  },
  comparison: {
    baselineId,            // the approved baseline fingerprint this reading is compared against
    baselineBuildId,       // build the baseline was promoted from
    status,                // see §3.1 — stable | approved-change | unexpected-change |
                           //   within-tolerance | non-reproducible | incomparable
    changedPaths,          // which output paths differ from the baseline
    toleranceApplied,      // whether semanticChecksum tolerance was applied (and which policy)
  },
  readings: {
    drift,                 // Chroma-Drift reading (see §5)
    seam,                  // Seam-Flow reading (see §6)
    recovery,              // Closed-Loop reading (see §7)
  },
  provenance: {
    iterationCount,        // how many runs confirmed stability (cf. BytecodeHealth 100)
    inputChecksum,         // SCD64 of the canonical input itself
    outputChecksum,        // SCD64 of the raw output before canonicalization
    samplerVersion,        // version of the sampling/compute harness
  },
}
```

The system continuously samples these packets in production and emits three derived signal streams — **drift alerts**, **seam violations / dead-tissue reports**, and **healing proposals** — each grounded in the same fingerprint.

### 3.1 Identity & Comparison Model — A Fingerprint Is Not "Same Forever"

A naive reading of "deterministic behavioral identity" is that a unit's fingerprint must never change. That is wrong, and dangerous: **intentional, approved code changes should often produce new outputs.** A changed checksum can mean any of:

- nondeterministic execution (a real defect),
- accidental regression (a real defect),
- **approved behavioral evolution** (lawful — not a defect),
- **representation-only change** (lawful — e.g. key reordering, see §3.3),
- **environment incompatibility** (a profile mismatch, not a behavior change).

If all five collapse into a single condition — "drift" — the system will treat legitimate evolution as tissue damage and fight its own developers.

**Comparison key.** Two fingerprints are only comparable when their full identity key matches:

```
{ unitId, contractVersion, implementationVersion,
  canonicalCorpusId, canonicalizerVersion, runtimeProfile, seed }
```

A change in `implementationVersion` or `canonicalizerVersion` does not mean the unit broke — it means the *question changed*, and the answer is compared against a different baseline (or is `incomparable`).

**Comparison status.** Every comparison resolves to one of:

| status | meaning |
|---|---|
| `stable` | identical to the approved baseline under a matching key |
| `approved-change` | differs, but `implementationVersion`/`contractVersion` moved and the new baseline was promoted |
| `unexpected-change` | differs under an *unchanged* approved key — genuine drift |
| `within-tolerance` | `exactChecksum` differs but `semanticChecksum` matches under an applied tolerance policy (§3.3) |
| `non-reproducible` | the same input produced different outputs across re-runs — nondeterminism |
| `incomparable` | identity keys do not match (different corpus, canonicalizer, or runtime profile) — no verdict possible |

**The actual invariant:**

> Same **approved behavioral version** + same canonical input + same canonicalization rules + compatible runtime profile ⇒ same fingerprint.

This is the invariant the system defends — not "same forever." It prevents the APM from pathologizing lawful evolution while still catching genuine non-determinism and regression.

### 3.2 Packet Modes — Observed vs Canonical-Probe

Hooking fingerprint sampling at `executeRoute` is a natural trace point, but **re-running canonical inputs there can be dangerous.** Some routes mutate state, write to storage, enqueue jobs, consume rate limits, generate external side effects, or depend on request-scoped resources. An observability system that accidentally executes business behavior twice is worse than no observability at all.

The packet therefore carries an `execution.mode` that splits sampling into two safe forms:

| mode | What it hashes | Safe for | Use |
|---|---|---|---|
| `observed` | The output of the request **that already executed** — no re-run | Side-effecting routes, live traffic | Seam-Flow, shape monitoring, field ownership, comparing repeated real inputs |
| `canonical-probe` | A fixture or replay-safe run of the unit against **approved canonical inputs** | Deterministic reproducibility, golden-baseline checks | Chroma-Drift stability, baseline promotion |

`canonical-probe` further declares an `execution.lane` so it never touches production state:

- `isolated` — runs in a sandbox with no external I/O,
- `shadow` — runs alongside live traffic on a copy of inputs, results discarded,
- `offline-replay` — runs later, out of band, against recorded canonical inputs.

This distinction removes the single largest implementation risk in the design: **the monitoring system executing business behavior twice.** `observed` mode never re-runs anything; `canonical-probe` only ever runs in a lane proven side-effect-free.

### 3.3 Canonicalization Is a First-Class Subsystem

Raw output hashing generates noise. Two outputs can be **behaviorally identical but byte-different**:

```js
{ a: 1, b: 2 }   // same behavior
{ b: 2, a: 1 }   // same behavior, different bytes
```

Other byte-different-but-equivalent troublemakers: timestamps, generated IDs, map/set iteration order, floating-point precision, filesystem paths and machine-dependent separators, locale-sensitive formatting, unordered collections, harmless metadata, and redacted secrets. Hashing these raw would make Chroma-Drift scream at nothing.

Canonicalization is therefore a **versioned subsystem in its own right**, declared in every packet:

```js
canonicalization: {
  schema: 'SUBTLETY-CANON-v1',
  version,            // canonicalizer rules version (== identity.canonicalizerVersion)
  ignoredPaths,       // output paths excluded from hashing (timestamps, generated IDs, secrets)
  orderedPaths,       // collections sorted before hashing so iteration order is irrelevant
  numericPolicy,      // float rounding / epsilon tolerance
  redactionPolicy,    // how secrets / PII are normalized before hashing
}
```

And the fingerprint itself is **three-part**, so each class of change is diagnosed separately:

| checksum | hashes | catches |
|---|---|---|
| `exactChecksum` | the byte-exact output | byte-level drift (the strictest signal) |
| `semanticChecksum` | the output after canonicalization | genuine behavioral change, ignoring approved representational variance |
| `shapeChecksum` | the output shape only (keys/types) | contract / schema changes, independent of values |

A reading where `exactChecksum` differs but `semanticChecksum` matches is `within-tolerance` (representational, not behavioral). A reading where `shapeChecksum` differs is a contract change and is escalated regardless of the other two. This three-part identity is what makes Chroma-Drift **diagnostically useful** rather than merely noisy.

---

## 4. Design Principles

### 4.1 The Fingerprint Is the Asset

Mirroring PixelBrain's "the lattice is the asset": the canonical source of truth is the fingerprint (checksum + structural signature + seam vocabulary). Dashboards, alerts, and healing proposals are **projections**. Never alert on a derived view that cannot be traced back to a fingerprint.

### 4.2 Determinism All the Way Down

A fingerprint must be reproducible by construction. Per §3.1, the invariant is: same **approved behavioral version** + same canonical input + same canonicalization rules + compatible runtime profile ⇒ identical checksum. This is the invariant BytecodeHealth verifies at build time; Subtlety Fingerprint merely refuses to observe anything it cannot reproduce. Crucially, "reproducible" is **not** "immutable": approved evolution lawfully moves the fingerprint (§3.1 `approved-change`), and representation-only variance is absorbed by canonicalization (§3.3 `within-tolerance`). What is *never* tolerated is `non-reproducible` — if a fingerprint cannot be stably recomputed under an unchanged approved key, that instability **is the signal** (genuine nondeterminism), not an error to suppress.

### 4.3 Failure Is Loud

A drifted, corrupted, or dead unit produces a structured diagnostic with a stable code (extending the `PB_ROUTE_*` / SCD64 families), never a silent pass. Mirrors the seam-contract's `PB_ROUTE_REQUIRED_OUTPUT_EMPTY` philosophy.

### 4.4 Observe What the Law Already Mandates

The system invents no new notion of "correct." Correctness = Vaelrix determinism. Coherence = seam-contract integrity. Recovery = RAID/heal. The APM is a *lens on existing law*, which keeps it from becoming a second, divergent source of truth.

### 4.5 Sensors, Then Immune Response — In That Order

The three lenses are layered and strictly ordered: **detect** (Chroma-Drift) → **localize** (Seam-Flow) → **act** (Closed-Loop). Healing is never attempted before a deviation is both detected and localized to a fingerprint. Autonomy is auditable and reversible (§7.3).

---

## 5. Lens I — Chroma-Drift (Correctness)

**Watches:** a fingerprint *changing* for a fixed canonical input over time.

### 5.1 Determinism Score
Per code path, the fraction of recent re-runs of the same canonical input that reproduced the fingerprint under a matching identity key (§3.1). This is BytecodeHealth's 100-iteration verification, but **sampled live in production** rather than run once at the gate. The score is read against the three-part checksum (§3.3): a path whose `exactChecksum` varies but whose `semanticChecksum` holds is `within-tolerance` (representational noise, not drift); a path whose `semanticChecksum` varies under an unchanged approved key is genuinely drifting (`unexpected-change` or `non-reproducible`). Only the latter lowers the determinism score.

### 5.2 Drift Rate Over Time
Does a unit's output entropy creep upward across deploys? A rising drift rate is a canary for an unseeded `Math.random`, a timezone leak, or a floating-point ordering bug — the subtlest class of bug, because every individual response still looks plausible.

### 5.3 Divergence Alerts
Fire not on error, but on **non-reproducibility**: "unit `X` produced two different checksums for identical payloads within a 5-minute window." This is the alert no conventional APM can express, because both responses were `200 OK`.

**Gives us:** detection of silent non-determinism *before* it corrupts downstream memory (RESONANCE_LAW) or rendering.

---

## 6. Lens II — Seam-Flow (Coherence)

**Watches:** how fingerprints *compose* across the dataflow lattice.

The seam-contract (`validateSeam`, `validateRequiredOutputs`) already speaks a vocabulary of `consumes` / `emits` / `mutates`. Seam-Flow promotes that vocabulary from a compose-time gate to a **runtime trace** — distributed tracing, but for the microprocessor lattice instead of microservices.

### 6.1 Live Dataflow Graph
Reconstruct, **per request**, which processor consumed which field, who emitted it, and who mutated it — reconstructed from observed fingerprints, not just declared in a route definition.

### 6.2 Runtime Seam Violations
Detect, in production traffic:
- a processor reading a field nobody emitted (**dangling input**),
- two processors writing the same field without an ordered merge (**write-write race**),
- a shadow-emit colliding with an established owner (**ownership collision**).

These are exactly the conditions `validateSeam` checks at compose time — observed live.

### 6.3 Hot-Path / Cold-Path & Dead Tissue
Which processors are on the critical path? Which emit data that **no downstream fingerprint ever consumes**? Dead tissue is the performance analog of the disconnected PixelBrain tissue we healed — emitted-but-never-consumed data that costs compute and invites drift without earning its keep.

**But "never consumed" is not self-evident.** An emitted field with no observed downstream consumer can mean many things, most of them *lawful*:

- genuinely dead output (the real target),
- optional-feature output (consumed only when a flag is on),
- telemetry consumed asynchronously (outside the traced lattice),
- branch-specific data (consumed only on a path the corpus didn't exercise),
- future-compatible extension field (reserved for a later contract version),
- externally-consumed response field (read by a client, not a processor),
- diagnostic metadata,
- cache material.

Runtime observation is **not omniscient** — it can only see what the corpus exercised. Dead-tissue findings are therefore reported with a **confidence class**, never as a bare assertion:

```js
deadTissue: {
  status,          // 'confirmed-dead' | 'unobserved' | 'conditionally-consumed' |
                   //   'externally-exposed' | 'reserved'
  evidenceCount,   // how many sampled requests observed (non-)consumption
  corpusCoverage,  // fraction of the route's branches the corpus actually exercised
}
```

Only `confirmed-dead` (no consumer across full branch coverage) is actionable as removal; `unobserved` and `conditionally-consumed` are *leads*, not verdicts.

**Gives us:** the ability to see, in a live system, the exact processor where a field went wrong — and to surface dead-tissue *candidates* with calibrated confidence, rather than false certainty.

---

## 7. Lens III — Closed-Loop (Recovery)

**Watches:** fingerprint deviations, and feeds them into the immune system.

Every APM ends at an alert. This codebase already has the pieces to close the loop: **RAID** (symptom → 50+ seeded bug patterns) and the **heal loop** (diagnose → patch → test → learn). Closed-Loop wires the APM into them.

### 7.1 Anomalies as Structured Symptoms
Each deviation (drift alert or seam violation) is emitted as a **structured symptom in the RAID vocabulary**, not just a pager ping. The APM becomes a sensor for the immune system.

### 7.2 Pattern-Recurrence Tracking
When the same symptom class keeps firing, correlate it to a known RAID bug pattern and **propose** the templated fix. In a trusted lane (and only there), apply it.

### 7.3 Healing Ledger
Every auto-remediation is logged with its **before/after fingerprint** and its test result, so autonomy is auditable and reversible. This reframes on-call from "react to alerts" to "review the system's own repair proposals."

### 7.4 Heal Against an Approved Baseline — Not the Previous Checksum

Closed-Loop must remediate toward an **approved baseline**, never merely toward "whatever the checksum was last time." Otherwise this sequence becomes possible:

1. Version B **intentionally** changes behavior from Version A.
2. Baseline promotion is missing or delayed.
3. Closed-Loop identifies Version B as drift.
4. The heal loop "repairs" the system **back to Version A**.

The monitoring system has become an **automated regression engine** — reverting lawful change because it mistook evolution for damage. 🫠

Every remediation proposal must therefore reference the baseline it is defending:

```js
{
  expectedBaselineId,   // the approved baseline the unit is expected to match
  baselineApproval,     // proof the baseline was promoted for this behavioral version
  currentBuildId,       // what is running now
  targetBuildId,        // what the patch would move it to
  symptomCode,          // the RAID symptom that triggered the proposal
  proposedPatchHash,    // checksum of the proposed fix
  rollbackPatchHash,    // checksum of the inverse, so any auto-fix is reversible
}
```

**Auto-healing is prohibited whenever the system cannot prove that the expected fingerprint belongs to the current approved behavioral contract.** If `baselineApproval` is absent, stale, or mismatched against `implementationVersion`, the deviation is surfaced to a human (§7.3 propose-only) and *never* auto-repaired. This is the guardrail that keeps Closed-Loop from fighting approved evolution — the same distinction §3.1 draws between `unexpected-change` and `approved-change`.

**Gives us:** mean-time-to-recovery approaching zero for known-pattern failures, plus a continuously growing memory of which anomalies the system can self-heal versus which still need a human — *without ever reverting lawful change.*

---

## 8. Architecture

```
                 ┌───────────────────────────────────────────────────┐
                 │              CANONICAL INPUT GENERATOR             │
                 │   seeded, normalized inputs per unit (no Math.random) │
                 └───────────────────────┬───────────────────────────┘
                                          │ run unit
                                          ▼
                 ┌───────────────────────────────────────────────────┐
                 │            FINGERPRINT COMPUTE (SCD64)             │
                 │   checksum + outputShape + consumes/emits/mutates  │
                 └───────────────────────┬───────────────────────────┘
                                          │ SUBTLETY-FINGERPRINT-v1
              ┌───────────────────────────┼───────────────────────────┐
              ▼                           ▼                           ▼
   ┌────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
   │  LENS I: DRIFT     │    │  LENS II: SEAM-FLOW │    │  LENS III: CLOSED-  │
   │  determinism score │    │  live dataflow graph│    │  LOOP: symptoms →   │
   │  drift rate        │    │  seam violations    │    │  RAID → heal loop   │
   │  divergence alerts │    │  dead-tissue scan   │    │  healing ledger     │
   └─────────┬──────────┘    └──────────┬──────────┘    └──────────┬──────────┘
             │                          │                           │
             └──────────────┬───────────┴───────────────────────────┘
                            ▼
              ┌───────────────────────────────────────────┐
              │  RESONANCE STORE (deterministic memory)    │
              │  fingerprint history + healing ledger      │
              └───────────────────────────────────────────┘
```

**Substrate reuse (no new primitives):**
- **Fingerprint compute** reuses the SCD64 checksum machinery (`scd64_scan` / `scd64_decode`) and the BytecodeHealth determinism harness (`health_verify`).
- **Seam vocabulary** reuses `seam-contract.js` verbatim — the same `consumes`/`emits`/`mutates` the character and item foundries already validate, and that `enemyBrainContract.js` already borrows cross-domain.
- **Sensors** reuse the diagnostic-cell substrate (innate/adaptive/bridge/fixture/coverage).
- **Recovery** reuses `raid_query` and the `heal` loop unchanged.
- **Storage** is the RESONANCE_LAW deterministic memory store.

---

## 9. Integration Points

| Existing subsystem | Role in Subtlety Fingerprint | Reuse, don't rebuild |
|---|---|---|
| **BytecodeHealth** (`health_emit`, `health_verify`, SCD64) | The determinism proof + checksum primitive, extended from build-time to runtime | Fingerprint checksum *is* an SCD64 |
| **seam-contract.js** (`validateSeam`, `validateRequiredOutputs`) | The coherence vocabulary + checks, extended from compose-time to runtime | Seam-Flow imports it directly |
| **microprocessor-route.js** (`executeRoute`) | The natural runtime trace point — every route already flows through here | Hook **`observed`-mode** sampling at `executeRoute` (hash the already-executed output; **never re-run** — §3.2). Deterministic reproducibility is checked separately via `canonical-probe` in an `isolated`/`shadow`/`offline-replay` lane, never on the live path. |
| **Diagnostic cells** (innate/adaptive/bridge/fixture/coverage) | The sensor substrate that emits fingerprint readings | New readings ride existing cells |
| **RAID** (`raid_query`, 50+ patterns) | The pattern matcher that turns deviations into known-bug matches | Closed-Loop emits symptoms in its vocabulary |
| **heal loop** | The autonomous repair engine | Closed-Loop proposes; heal executes + verifies |
| **enemyBrainContract.js** | Proof the seam vocabulary already travels across domains (combat AI borrows it) | Validates that Seam-Flow generalizes beyond PixelBrain |
| **RESONANCE_LAW memory** | Where fingerprint history + healing ledger persist deterministically | Storage layer |
| **Vaelrix Law** | The definition of "correct" the whole system defends | Source of truth, not a component |

---

## 10. Determinism & Law Compliance

- **Vaelrix Law (determinism):** The fingerprint generator uses only seeded inputs; no `Math.random`. A unit that cannot be fingerprinted reproducibly is flagged as drift, not hidden. The APM never *introduces* nondeterminism into the path it observes (sampling is side-effect-free and read-only).
- **RESONANCE_LAW:** All fingerprint history and healing-ledger entries are compiled into deterministic memory — same inputs ⇒ same stored record.
- **Render-adjacency:** Per the law's layer rules, the fingerprint compute and lens logic live in **core/service**, never in render-adjacent code. Projections (dashboards) are the only render-facing surface and are downstream consumers.
- **No new Source of Truth:** "Correct," "coherent," and "recovered" are defined by existing law and subsystems. The APM is a lens, not an authority.

---

## 11. Testing Strategy

Because the system is itself a determinism guardian, it must be tested deterministically:

1. **Fingerprint stability test:** for a fixed unit + canonical input + seed, assert the SCD64 is identical across N runs and across two machine profiles. (Mirrors BytecodeHealth's 100-iteration gate.)
2. **Drift detection test (two-sided).** A correctly *seeded* random source reproduces the same result and must **not** cause drift — so the test asserts both directions:
   - **Controlled variability stays stable:** a fixture unit using a *seeded* RNG produces an identical fingerprint across re-runs (`status: stable`). This proves the system does not mistake controlled, reproducible randomness for drift.
   - **Actual nondeterminism fires:** inject a *genuine* nondeterminism source and assert Chroma-Drift fires a divergence alert (`status: non-reproducible`) while a conventional error monitor stays silent. Valid injection sources include: unseeded `Math.random()`, `Date.now()`, `new Date().getTimezoneOffset()`, object iteration with unstable construction order, locale-sensitive formatting, and race-dependent asynchronous aggregation.
3. **Seam violation test:** construct a route with a dangling input and a write-write race; assert Seam-Flow reports both, matching `validateSeam`'s compose-time verdict.
4. **Dead-tissue test (confidence-classed):** emit a field no downstream processor consumes under full branch coverage; assert it is classified `confirmed-dead`. Separately, assert that declared **optional**, **externally-exposed**, and **conditionally-consumed** fixture outputs are *not* misclassified as dead (Revision 5 — no false classifications against declared lawful outputs).
5. **Closed-loop test (dry-run):** feed a known-pattern deviation against an **approved baseline**; assert RAID matches it and the heal loop produces a patch that, when applied, restores the *approved baseline* fingerprint — verified against the healing ledger. Then assert the **guardrail**: with `baselineApproval` absent or stale, the same deviation is surfaced to a human and auto-heal is **refused** (Revision 6 — never revert lawful change).
6. **Golden fingerprint corpus:** a committed set of known-good fingerprints (cf. PixelBrain's golden-corpus PDR) so regressions are byte-detectable.

---

## 12. Phasing / Rollout

- **Phase 0 — Fingerprint primitive (core):** define `SUBTLETY-FINGERPRINT-v1`, the canonical-input generator, and SCD64 compute. Ship with the stability test only. No production sampling yet.
- **Phase 1 — Chroma-Drift (read-only):** sample fingerprints at `executeRoute` for the PixelBrain item + character paths (which already flow through the seam-contract). Emit determinism scores + divergence alerts. Pure observation; zero behavioral change.
- **Phase 2 — Seam-Flow:** reconstruct the live dataflow graph from sampled fingerprints; report runtime seam violations + dead tissue. Still read-only.
- **Phase 3 — Closed-Loop (propose-only):** emit deviations as RAID symptoms; surface healing *proposals* to a human. No auto-apply.
- **Phase 4 — Closed-Loop (trusted lane):** enable auto-apply for a whitelisted set of known-pattern fixes, gated on the healing ledger and a review step (cf. the Merlin-review requirement in the QBIT immune PDR).

Each phase is independently valuable and independently shippable. Phase 1 alone delivers the alert no conventional APM can.

---

## 13. Acceptance Criteria

1. A fingerprint is reproducible byte-for-byte across runs and machines for a fixed unit + canonical input + seed **under a matching identity key** (§3.1). Reproducibility is not immutability: an `implementationVersion`/`contractVersion` bump with a promoted baseline yields `approved-change`, not drift.
2. **Two-sided determinism:** a *seeded* RNG injected into any monitored unit leaves the fingerprint `stable` (no alert); a *genuine* nondeterminism source (unseeded `Math.random()`, `Date.now()`, timezone offset, unstable iteration order, locale formatting, async race) produces a Chroma-Drift divergence alert (`non-reproducible`) within one sampling window, with no conventional error fired.
3. Every runtime seam violation Seam-Flow reports matches the compose-time verdict of `validateSeam` for the same route (the two lenses never disagree).
4. **Dead tissue is classified, not merely flagged:** the system detects all declared dead-tissue fixtures in the golden corpus as `confirmed-dead`, with **no false classifications** against declared `optional`, `externally-exposed`, `conditionally-consumed`, or `reserved` outputs (Revision 5 — measurable and deterministic, without pretending runtime observation is omniscient).
5. Every Closed-Loop remediation is recorded in the healing ledger with a before/after fingerprint, an `expectedBaselineId` + `baselineApproval`, and a passing test result; none are applied outside the whitelisted trusted lane; and **auto-heal is refused** whenever the expected fingerprint cannot be proven to belong to the current approved behavioral contract (Revision 6 — the system never reverts lawful change).
6. The system introduces no nondeterminism into any path it observes (verified by a before/after fingerprint of the path with sampling on vs. off), and `observed`-mode sampling never re-executes business behavior (§3.2).
7. All lens logic lives in core/service layers; no render-adjacent imports (Vaelrix layer audit passes).

---

## 14. Risks & Open Questions

- **Canonical-input coverage.** A fingerprint is only as good as its canonical input. If production exercises input regions the canonical set misses, drift there goes unseen. *Open:* how is the canonical corpus grown — from RESONANCE memory of real traffic, or curated?
- **Sampling cost & double-execution (largely resolved by §3.2).** The original risk — recomputing fingerprints at `executeRoute` adding work to the hot path, or worse, re-running side-effecting routes — is addressed by the two-mode split: `observed` mode hashes the already-executed output (cheap, never re-runs), while `canonical-probe` runs only in an `isolated`/`shadow`/`offline-replay` lane. *Residual open:* the cost of the `canonical-probe` lane itself, and the sampling rate for `observed` shape monitoring.
- **Canonicalization policy is itself a source of truth (Revision 4).** The `semanticChecksum` is only as sound as the canonicalization rules. An over-aggressive `ignoredPaths`/`numericPolicy` can mask real drift; a too-strict one generates noise. Because `canonicalizerVersion` is part of the identity key (§3.1), a canonicalizer change re-baselines rather than silently altering verdicts — but *who approves canonicalization policy* and how it is versioned remains open.
- **Baseline-promotion lag (Revision 6).** Closed-Loop is only as safe as the freshness of baseline promotion. If approved behavioral changes are slow to promote a new baseline, deviations pile up as `unexpected-change` and (in the trusted lane) could tempt reversion. The `baselineApproval` guardrail prevents auto-reversion, but the *process* that keeps baselines current — and who owns promotion — is open.
- **Fingerprint granularity.** Too fine (per-function) ⇒ noise; too coarse (per-endpoint) ⇒ drift hides inside. *Open:* the right unit boundary — likely the microprocessor/route, matching the seam-contract's existing grain.
- **Autonomy trust.** Auto-healing in production is high-risk. Phase 4 is deliberately gated and reversible; the healing ledger exists so any auto-fix can be audited and rolled back. *Open:* who owns the whitelist (Merlin review?).
- **Storage growth.** Fingerprint history is unbounded. *Open:* retention + compaction policy in the RESONANCE store, consistent with deterministic memory.
- **Relationship to conventional APM.** This system is orthogonal to latency/error/saturation monitoring. *Open:* whether it ships alongside an existing APM or subsumes parts of it.

---

## 15. The Through-Line

These are not three tools. They are three lenses on one fingerprint:

| Lens | Question | Conventional APM | Subtlety Fingerprint |
|---|---|---|---|
| **Chroma-Drift** | Is it *correct*? | No (`200 = fine`) | Reproducibility as an SLI |
| **Seam-Flow** | Is it *coherent*? | No (sees calls, not data) | Data-ownership tracing |
| **Closed-Loop** | Can it *recover*? | No (alerts only) | Self-remediation |

The fingerprint is what makes them one system: **Chroma-Drift** notices the fingerprint changed, **Seam-Flow** localizes *where* in the lattice it broke, and **Closed-Loop** restores it — each step grounded in the same deterministic identity. The unifying bet is that monitoring should stop measuring proxies for health and start measuring the invariants this codebase already enforces by law — determinism, contract integrity, and immune healing — promoted from build-time gates into runtime senses.
