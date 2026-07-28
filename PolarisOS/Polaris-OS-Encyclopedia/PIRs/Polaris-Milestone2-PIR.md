# Polaris OS — Milestone 2: Persistence — Post-Implementation Review

**Date:** 2026-06-14
**Status:** ✅ COMPLETE
**Tests:** 46 passing (12 new persistence tests + 34 existing)
**Duration:** ~1.5 hours

---

## 1. Objective

Implement PDR §13: SQLite WAL persistence with atomic command transactions, append-only event ledger, and restart restoration.

### Deliverables (PDR §25, Milestone 2)

| Deliverable | Status |
|---|---|
| SQLite WAL persistence adapter | ✅ |
| Atomic command transactions (all-or-nothing) | ✅ |
| Append-only event ledger | ✅ |
| Restart restoration (snapshot + replay) | ✅ |
| Revision validation (optimistic concurrency) | ✅ |

---

## 2. Critical Architecture Decision: Two-Phase Commit

### The Problem

The original `WorldSession.processCommand()` applied events to state **immediately** after resolution. If persistence failed afterward, the session already "believed" the command happened. This violated the user directive:

> "If the database commit fails, the active session must not 'believe' the command happened."

### The Solution

Refactored to a strict two-phase commit flow:

```
WorldSession.proposeCommand(cmd)
    → ProposedTransaction (state NOT mutated)
        → persistence.commitTransaction(proposal)
            → validates expected revision
            → rejects duplicates
            → atomic write (events + revision)
                → CommitResult { committed: true/false }
                    → session.acceptCommit(proposal)  [ONLY on success]
                        → onCommit callback (broadcast)
```

**If the database commit fails, the session state is UNCHANGED.**

### New Types

```typescript
// @polaris/contracts/src/transaction.ts
interface ProposedTransaction {
  proposalId: string;
  commandId: string;
  worldId: string;
  events: DomainEvent[];
  expectedRevision: number;      // optimistic concurrency lock
  resultingRevision: number;
  resultingSequence: number;
  projectedState: WorldState;    // computed but NOT applied yet
}

type CommitResult =
  | { committed: true; revision: number; sequence: number }
  | { committed: false; reason: CommitFailureReason };
```

### New Classes

| Class | Package | Role |
|---|---|---|
| `CommitCoordinator` | world-runtime | Orchestrates the two-phase flow |
| `PersistencePort` | world-runtime | Interface (no SQLite import) |
| `SqlitePersistence` | persistence-sqlite | Implements PersistencePort |

---

## 3. What Was Built

### 3.1 WorldSession Refactoring

- `proposeCommand(cmd)` → returns `ProposedTransaction` **without mutating state**
- `acceptCommit(proposal)` → applies state **only after persistence confirms**
- `processCommand(cmd)` → retained as test convenience (propose + accept in one shot)
- `restoreFromSnapshot(state, sequence, appliedIds)` → restart restoration entry point

### 3.2 CommitCoordinator

Enforces the flow:
1. `session.proposeCommand(cmd)` → proposal or refusal
2. `persistence.commitTransaction(proposal)` → validates + atomic write
3. On success: `session.acceptCommit(proposal)` + `onCommit` callback
4. On failure: **nothing happens** — session state unchanged

### 3.3 SqlitePersistence (PersistencePort implementation)

- `commitTransaction(proposal)`:
  - Validates world exists
  - Validates `expectedRevision === db.revision` (optimistic concurrency)
  - Pre-checks for duplicate eventIds
  - Validates sequence continuity
  - Atomic transaction: insert events + update revision with `WHERE revision = expected`
  - Returns structured `CommitResult`

- `restoreWorld(worldId)`:
  - Loads latest snapshot (if any)
  - Loads events after snapshot sequence
  - Returns both for session replay

- `initializeWorld(worldId, rulesetVersion)`:
  - Seeds the worlds table

### 3.4 Bug Fix: MOVE Command

Discovered and fixed: `PLAYER_ENTERED_ROOM` event was referencing the source room instead of the destination. The player would "enter" the room they were already in.

**Fix:** `enteredEvent.roomId = destinationId` in `CommandResolver.ts`

### 3.5 Bug Fix: Snapshot Sequence Boundary

`loadEventsAfter` used `sequence > N` but snapshot at sequence N means "next event is N". Changed to `sequence >= N`.

---

## 4. Test Results

```
 ✓ packages/scene-compiler/tests/SceneCompiler.test.ts    (6 tests)
 ✓ packages/command-language/tests/CommandBinder.test.ts  (10 tests)
 ✓ packages/world-kernel/tests/WorldKernel.test.ts        (9 tests)
 ✓ packages/world-runtime/tests/Milestone2Gate.test.ts    (9 tests)
 ✓ tests/persistence/Milestone2.test.ts                   (12 tests)

 Test Files  5 passed (5)
      Tests  46 passed (46)
   Duration  1.39s
```

### Milestone 2 Test Coverage

| Test | Invariant |
|---|---|
| M2-1 | Full round-trip: propose → commit → accept |
| M2-2 | **Failed commit leaves session UNCHANGED** |
| M2-3 | Revision mismatch rejected by persistence |
| M2-4 | Duplicate eventId rejected at DB level |
| M2-5 | Restart restoration via full event replay |
| M2-6 | Restart restoration via snapshot + partial replay |
| M2-7 | Scene manifests identical before/after restart |
| M2-8 | Atomic commit: multi-event batch is all-or-nothing |
| M2-9 | Multiple sequential commands persist with correct revisions |
| M2-10 | onCommit broadcast callback fires on success |
| M2-11 | onCommit does NOT fire on failure |
| M2-12 | Refused commands never reach persistence |

---

## 5. Dependency Law Compliance

```
contracts ← world-kernel ← world-runtime ← persistence-sqlite
                                ↑                    ↑
                          (PersistencePort)    (implements port)
```

- `world-runtime` defines `PersistencePort` interface — **zero SQLite imports**
- `persistence-sqlite` implements the port — injected at composition root
- `CommitCoordinator` depends on the interface, not the concrete adapter
- No SQLite logic crept into WorldSession ✅

---

## 6. PDR §13 Compliance Audit

| Requirement | Status | Evidence |
|---|---|---|
| §13.1: SQLite WAL mode | ✅ | `PRAGMA journal_mode = WAL` in schema |
| §13.2: Atomic command transactions | ✅ | `db.transaction()` wraps all writes |
| §13.3: Append-only event ledger | ✅ | No UPDATE/DELETE on domain_events |
| §13.4: Restart restoration | ✅ | Snapshot + replay tested (M2-5, M2-6) |
| §13.5: Revision validation | ✅ | `WHERE revision = expected` in commit |

---

## 7. Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Snapshot doesn't store applied eventIds | MEDIUM | Test M2-6 reconstructs from ledger; production should store in snapshot metadata |
| No concurrent writer test | LOW | Single-threaded MVP; Milestone 3 adds room actor serialization |
| `better-sqlite3` is synchronous | LOW | Acceptable for MVP; async wrapper possible later |
| No event compaction/archival | LOW | Not needed until event count grows large |

---

## 8. File Inventory

### New Files
- `packages/contracts/src/transaction.ts` — ProposedTransaction + CommitResult types
- `packages/world-runtime/src/CommitCoordinator.ts` — two-phase orchestrator
- `tests/persistence/Milestone2.test.ts` — 12 integration tests

### Modified Files
- `packages/world-runtime/src/WorldSession.ts` — refactored to two-phase commit
- `packages/world-runtime/src/index.ts` — exports CommitCoordinator + PersistencePort
- `packages/persistence-sqlite/src/SqlitePersistence.ts` — full rewrite with revision validation
- `packages/persistence-sqlite/src/index.ts` — updated exports
- `packages/persistence-sqlite/package.json` — added world-runtime dependency
- `packages/contracts/src/index.ts` — exports transaction types
- `packages/world-kernel/src/CommandResolver.ts` — MOVE bug fix + EventType typing

---

## 9. Metrics

| Metric | Value |
|---|---|
| Total tests | 46 |
| New tests (Milestone 2) | 12 |
| Test duration | 1.39s |
| New source files | 2 |
| Modified source files | 7 |
| New LOC (src) | ~450 |
| New LOC (tests) | ~520 |
| Typecheck errors (new) | 0 |

---

## 10. Conclusion

Milestone 2 is complete. The two-phase commit architecture ensures that:

1. **WorldSession proposes** — no state mutation until persistence confirms
2. **Persistence validates** — revision check, duplicate rejection, sequence continuity
3. **Atomic commit** — all events + revision update in one SQLite transaction
4. **Session accepts** — only after `committed: true`
5. **Broadcast fires** — only after session accepts

The session NEVER believes a failed command happened. SQLite logic is fully isolated behind the `PersistencePort` interface.

**Next: Milestone 3 (Realtime)** — Room actor queue, WebSocket subscriptions, two-client sync.
