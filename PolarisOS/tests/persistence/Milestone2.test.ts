/**
 * Milestone 2: Persistence Integration Tests
 *
 * Tests the full two-phase commit flow:
 *   WorldSession proposes → persistence validates → atomic commit → session accepts
 *
 * Verifies:
 *   - Full round-trip persistence
 *   - Restart restoration (snapshot + replay)
 *   - Failed commit leaves session UNCHANGED
 *   - Revision mismatch rejection
 *   - Duplicate eventId rejection at DB level
 *   - Scene manifest identity across restart
 *   - Atomic commit (all-or-nothing)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { tmpdir } from "os";
import { mkdtempSync, rmSync } from "fs";
import { WorldSession, CommitCoordinator } from "@polaris/world-runtime";
import type { PersistencePort } from "@polaris/world-runtime";
import { SqlitePersistence } from "@polaris/persistence-sqlite";
import { createInitialState, registerPlayer } from "@polaris/world-kernel";
import type { WorldDefinition } from "@polaris/world-kernel";
import type { BoundCommand, WorldState, ProposedTransaction, CommitResult } from "@polaris/contracts";
import { SceneCompiler } from "@polaris/scene-compiler";

// ─── Test Fixtures ─────────────────────────────────────────────────────────────

function buildTestWorld() {
  const def: WorldDefinition = {
    worldId: "persist_test_world",
    rulesetVersion: "mvp-1",
    rooms: [
      { roomId: "room_a", title: "Room A", descriptionKey: "a", exitIds: ["room_b"], flags: {} },
      { roomId: "room_b", title: "Room B", descriptionKey: "b", exitIds: ["room_a"], flags: {} },
    ],
    entities: [
      { entityId: "lantern", entityType: "object", definitionId: "lantern", roomId: "room_a", flags: {} },
      { entityId: "brazier", entityType: "environment", definitionId: "brazier", roomId: "room_a", flags: {} },
    ],
  };

  let state = createInitialState(def);
  state = registerPlayer(state, "p1", "Alice", "room_a");
  state = registerPlayer(state, "p2", "Bob", "room_a");
  return { state, def };
}

function makeTakeCommand(playerId: string, targetId: string, roomId: string, cmdId: string): BoundCommand {
  return {
    commandId: cmdId,
    actorId: playerId,
    roomId,
    action: "TAKE",
    targetIds: [targetId],
    arguments: {},
    evidence: [],
  };
}

function makeSayCommand(playerId: string, roomId: string, cmdId: string, message: string): BoundCommand {
  return {
    commandId: cmdId,
    actorId: playerId,
    roomId,
    action: "SAY",
    targetIds: [],
    arguments: { message },
    evidence: [],
  };
}

// ─── Failing Persistence (test double) ─────────────────────────────────────────

class FailingPersistence implements PersistencePort {
  public failReason: CommitResult = { committed: false, reason: "DB_ERROR" };
  public commitAttempts: ProposedTransaction[] = [];

  async commitTransaction(proposal: ProposedTransaction): Promise<CommitResult> {
    this.commitAttempts.push(proposal);
    return this.failReason;
  }

  async getWorldRevision(_worldId: string): Promise<number | null> {
    return 0;
  }
}

// ─── Test Suite ────────────────────────────────────────────────────────────────

describe("Milestone 2: Persistence", () => {
  let tempDir: string;
  let dbPath: string;
  let persistence: SqlitePersistence;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "polaris-test-"));
    dbPath = join(tempDir, "test.db");
    persistence = new SqlitePersistence({ dbPath });
    await persistence.initialize();
    await persistence.initializeWorld("persist_test_world", "mvp-1");
  });

  afterEach(async () => {
    await persistence.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ─── TEST 1: Full two-phase commit round-trip ──────────────────────────────

  it("M2-1: full round-trip — propose, commit, accept", async () => {
    const { state } = buildTestWorld();
    const session = new WorldSession(structuredClone(state), { rulesetVersion: "mvp-1" });
    const coordinator = new CommitCoordinator(session, persistence);

    const cmd = makeTakeCommand("p1", "lantern", "room_a", "rt_cmd_1");
    const result = await coordinator.executeCommand(cmd);

    // Command accepted
    expect(result.resolution.accepted).toBe(true);
    // Persistence committed
    expect(result.commit?.committed).toBe(true);
    if (result.commit?.committed) {
      expect(result.commit.revision).toBe(1);
      expect(result.commit.sequence).toBe(1);
    }

    // Session state advanced
    const finalState = session.getState();
    expect(finalState.entities["lantern"].location).toEqual({ type: "inventory", playerId: "p1" });
    expect(session.getWorldRevision()).toBe(1);
    expect(session.getSequenceCounter()).toBe(1);

    // DB revision matches session revision
    const dbRevision = await persistence.getWorldRevision("persist_test_world");
    expect(dbRevision).toBe(1);
  });

  // ─── TEST 2: Failed commit leaves session UNCHANGED ────────────────────────

  it("M2-2: failed commit leaves session state unchanged", async () => {
    const { state } = buildTestWorld();
    const session = new WorldSession(structuredClone(state), { rulesetVersion: "mvp-1" });
    const failingPersistence = new FailingPersistence();
    failingPersistence.failReason = { committed: false, reason: "DB_ERROR" };

    const coordinator = new CommitCoordinator(session, failingPersistence);

    const stateBefore = session.getState();
    const revisionBefore = session.getWorldRevision();
    const sequenceBefore = session.getSequenceCounter();

    const cmd = makeTakeCommand("p1", "lantern", "room_a", "fail_cmd_1");
    const result = await coordinator.executeCommand(cmd);

    // Command was accepted by kernel...
    expect(result.resolution.accepted).toBe(true);
    // ...but persistence FAILED
    expect(result.commit?.committed).toBe(false);

    // SESSION STATE IS UNCHANGED — the session does NOT believe the command happened
    expect(session.getState()).toEqual(stateBefore);
    expect(session.getWorldRevision()).toBe(revisionBefore);
    expect(session.getSequenceCounter()).toBe(sequenceBefore);

    // The lantern is still in the room
    expect(session.getState().entities["lantern"].location).toEqual({ type: "room", roomId: "room_a" });
  });

  // ─── TEST 3: Revision mismatch rejection ───────────────────────────────────

  it("M2-3: revision mismatch is rejected by persistence", async () => {
    const { state } = buildTestWorld();
    const session = new WorldSession(structuredClone(state), { rulesetVersion: "mvp-1" });
    const coordinator = new CommitCoordinator(session, persistence);

    // First command succeeds — advances to revision 1
    await coordinator.executeCommand(makeTakeCommand("p1", "lantern", "room_a", "rev_cmd_1"));
    expect(session.getWorldRevision()).toBe(1);

    // Simulate a stale session: create a new session at revision 0
    // but the DB is already at revision 1
    const staleSession = new WorldSession(structuredClone(state), { rulesetVersion: "mvp-1" });
    const staleCoordinator = new CommitCoordinator(staleSession, persistence);

    const result = await staleCoordinator.executeCommand(
      makeSayCommand("p2", "room_a", "rev_cmd_2", "hello"),
    );

    // Kernel accepts (it doesn't know about DB state)...
    expect(result.resolution.accepted).toBe(true);
    // ...but persistence REJECTS due to revision mismatch
    expect(result.commit?.committed).toBe(false);
    if (result.commit && !result.commit.committed) {
      expect(result.commit.reason).toBe("REVISION_MISMATCH");
    }

    // Stale session state is UNCHANGED
    expect(staleSession.getWorldRevision()).toBe(0);
  });

  // ─── TEST 4: Duplicate eventId rejection at DB level ───────────────────────

  it("M2-4: duplicate eventId is rejected by persistence", async () => {
    const { state } = buildTestWorld();
    const session = new WorldSession(structuredClone(state), { rulesetVersion: "mvp-1" });
    const coordinator = new CommitCoordinator(session, persistence);

    // First command
    const cmd = makeTakeCommand("p1", "lantern", "room_a", "dup_db_cmd");
    const result1 = await coordinator.executeCommand(cmd);
    expect(result1.commit?.committed).toBe(true);

    // Manually try to commit the same events again (simulating a replay attack)
    const proposal = session.proposeCommand(
      makeSayCommand("p2", "room_a", "dup_db_cmd_2", "hi"),
    ) as ProposedTransaction;

    // Tamper: reuse an existing eventId
    if (proposal.events.length > 0) {
      proposal.events[0] = { ...proposal.events[0], eventId: result1.resolution.accepted ? (result1.resolution as any).events[0].eventId : "fake" };
    }

    const commitResult = await persistence.commitTransaction(proposal);
    expect(commitResult.committed).toBe(false);
    if (!commitResult.committed) {
      expect(commitResult.reason).toBe("DUPLICATE_EVENT_ID");
    }
  });

  // ─── TEST 5: Restart restoration (full replay) ─────────────────────────────

  it("M2-5: restart restoration via full event replay", async () => {
    const { state } = buildTestWorld();

    // Phase 1: Run commands and persist
    const session1 = new WorldSession(structuredClone(state), { rulesetVersion: "mvp-1" });
    const coordinator1 = new CommitCoordinator(session1, persistence);

    await coordinator1.executeCommand(makeTakeCommand("p1", "lantern", "room_a", "restore_cmd_1"));
    await coordinator1.executeCommand(makeSayCommand("p2", "room_a", "restore_cmd_2", "hello"));
    await coordinator1.executeCommand(makeSayCommand("p1", "room_a", "restore_cmd_3", "world"));

    const stateBeforeRestart = session1.getState();
    expect(session1.getWorldRevision()).toBe(3);
    expect(session1.getSequenceCounter()).toBe(3);

    // Phase 2: "Restart" — create a fresh session and restore from DB
    const { snapshot, eventsAfterSnapshot } = await persistence.restoreWorld("persist_test_world");

    const session2 = new WorldSession(structuredClone(state), { rulesetVersion: "mvp-1" });

    if (snapshot) {
      // Restore from snapshot + replay remaining
      session2.restoreFromSnapshot(snapshot.state, snapshot.sequence, []);
      session2.replayEvents(eventsAfterSnapshot);
    } else {
      // No snapshot — full replay
      const allEvents = await persistence.loadAllEvents("persist_test_world");
      session2.replayEvents(allEvents);
    }

    // Restored state must match pre-restart state
    expect(session2.getState()).toEqual(stateBeforeRestart);
    expect(session2.getWorldRevision()).toBe(3);
    expect(session2.getSequenceCounter()).toBe(3);
  });

  // ─── TEST 6: Restart restoration with snapshot ─────────────────────────────

  it("M2-6: restart restoration via snapshot + partial replay", async () => {
    const { state } = buildTestWorld();

    // Phase 1: Run 2 commands, take snapshot, run 1 more
    const session1 = new WorldSession(structuredClone(state), { rulesetVersion: "mvp-1" });
    const coordinator1 = new CommitCoordinator(session1, persistence);

    await coordinator1.executeCommand(makeTakeCommand("p1", "lantern", "room_a", "snap_cmd_1"));
    await coordinator1.executeCommand(makeSayCommand("p2", "room_a", "snap_cmd_2", "hello"));

    // Take snapshot at sequence 2
    await persistence.saveSnapshot("persist_test_world", session1.getSequenceCounter(), session1.getState());

    // One more command after snapshot
    await coordinator1.executeCommand(makeSayCommand("p1", "room_a", "snap_cmd_3", "world"));

    const stateBeforeRestart = session1.getState();

    // Phase 2: Restore from snapshot + replay only events after snapshot
    const { snapshot, eventsAfterSnapshot } = await persistence.restoreWorld("persist_test_world");

    expect(snapshot).not.toBeNull();
    expect(snapshot!.sequence).toBe(2);
    expect(eventsAfterSnapshot.length).toBe(1); // Only the 3rd command's event

    const session2 = new WorldSession(structuredClone(state), { rulesetVersion: "mvp-1" });
    session2.restoreFromSnapshot(snapshot!.state, snapshot!.sequence, []);

    // Collect eventIds from snapshot state for duplicate tracking
    // (In production, the snapshot would include applied event IDs)
    const snapshotEvents = await persistence.loadEventsAfter("persist_test_world", -1);
    const snapshotEventIds = snapshotEvents
      .filter(e => e.sequence < snapshot!.sequence)
      .map(e => e.eventId);
    session2.restoreFromSnapshot(snapshot!.state, snapshot!.sequence, snapshotEventIds);

    session2.replayEvents(eventsAfterSnapshot);

    expect(session2.getState()).toEqual(stateBeforeRestart);
    expect(session2.getWorldRevision()).toBe(3);
  });

  // ─── TEST 7: Scene manifest identity across restart ────────────────────────

  it("M2-7: scene manifests identical before and after restart", async () => {
    const { state } = buildTestWorld();
    const compiler = new SceneCompiler();

    // Phase 1: Run commands
    const session1 = new WorldSession(structuredClone(state), { rulesetVersion: "mvp-1" });
    const coordinator1 = new CommitCoordinator(session1, persistence);

    await coordinator1.executeCommand(makeTakeCommand("p1", "lantern", "room_a", "scene_cmd_1"));

    const liveState = session1.getState();
    const liveManifest = compiler.compile({
      worldId: "persist_test_world",
      room: liveState.rooms["room_a"],
      entities: Object.values(liveState.entities),
      occupants: Object.values(liveState.players).filter(p => p.roomId === "room_a"),
    });

    // Phase 2: Restart and restore
    const allEvents = await persistence.loadAllEvents("persist_test_world");
    const session2 = new WorldSession(structuredClone(state), { rulesetVersion: "mvp-1" });
    session2.replayEvents(allEvents);

    const restoredState = session2.getState();
    const restoredManifest = compiler.compile({
      worldId: "persist_test_world",
      room: restoredState.rooms["room_a"],
      entities: Object.values(restoredState.entities),
      occupants: Object.values(restoredState.players).filter(p => p.roomId === "room_a"),
    });

    // Content hash must be identical
    expect(liveManifest.contractHash).toBe(restoredManifest.contractHash);

    // Full manifest equality (excluding generatedAt timestamp)
    const { generatedAt: _t1, ...liveClean } = liveManifest;
    const { generatedAt: _t2, ...restoredClean } = restoredManifest;
    expect(liveClean).toEqual(restoredClean);
  });

  // ─── TEST 8: Atomic commit — all events or none ────────────────────────────

  it("M2-8: atomic commit — partial event batch is impossible", async () => {
    const { state } = buildTestWorld();
    const session = new WorldSession(structuredClone(state), { rulesetVersion: "mvp-1" });
    const coordinator = new CommitCoordinator(session, persistence);

    // Process a MOVE command (produces 2 events: LEAVE + ENTER)
    // First, move player to room_b
    const moveCmd: BoundCommand = {
      commandId: "atomic_move_cmd",
      actorId: "p1",
      roomId: "room_a",
      action: "MOVE",
      targetIds: ["room_b"],
      arguments: {},
      evidence: [],
    };

    const result = await coordinator.executeCommand(moveCmd);
    expect(result.resolution.accepted).toBe(true);
    expect(result.commit?.committed).toBe(true);

    // Verify BOTH events are in the ledger (not just one)
    const events = await persistence.loadAllEvents("persist_test_world");
    expect(events.length).toBe(2); // PLAYER_LEFT_ROOM + PLAYER_ENTERED_ROOM
    expect(events[0].eventType).toBe("PLAYER_LEFT_ROOM");
    expect(events[1].eventType).toBe("PLAYER_ENTERED_ROOM");

    // Sequences are contiguous
    expect(events[0].sequence).toBe(0);
    expect(events[1].sequence).toBe(1);

    // Player is in room_b
    expect(session.getState().players["p1"].roomId).toBe("room_b");
  });

  // ─── TEST 9: Multiple commands persist correctly ───────────────────────────

  it("M2-9: multiple sequential commands persist with correct revisions", async () => {
    const { state } = buildTestWorld();
    const session = new WorldSession(structuredClone(state), { rulesetVersion: "mvp-1" });
    const coordinator = new CommitCoordinator(session, persistence);

    const commands = [
      makeTakeCommand("p1", "lantern", "room_a", "multi_cmd_1"),
      makeSayCommand("p2", "room_a", "multi_cmd_2", "hello"),
      makeSayCommand("p1", "room_a", "multi_cmd_3", "world"),
    ];

    for (let i = 0; i < commands.length; i++) {
      const result = await coordinator.executeCommand(commands[i]);
      expect(result.commit?.committed).toBe(true);
      if (result.commit?.committed) {
        expect(result.commit.revision).toBe(i + 1);
      }
    }

    // Final state checks
    expect(session.getWorldRevision()).toBe(3);
    expect(session.getSequenceCounter()).toBe(3);

    // DB agrees
    const dbRevision = await persistence.getWorldRevision("persist_test_world");
    expect(dbRevision).toBe(3);

    // All events in ledger
    const events = await persistence.loadAllEvents("persist_test_world");
    expect(events.length).toBe(3);
    for (let i = 0; i < events.length; i++) {
      expect(events[i].sequence).toBe(i);
      expect(events[i].worldRevision).toBe(i + 1);
    }
  });

  // ─── TEST 10: onCommit broadcast callback fires ────────────────────────────

  it("M2-10: onCommit callback fires with events after successful commit", async () => {
    const { state } = buildTestWorld();
    const session = new WorldSession(structuredClone(state), { rulesetVersion: "mvp-1" });

    const broadcastLog: string[] = [];
    const coordinator = new CommitCoordinator(session, persistence, {
      onCommit: (events) => {
        for (const e of events) {
          broadcastLog.push(`${e.eventType}:${e.eventId}`);
        }
      },
    });

    await coordinator.executeCommand(makeTakeCommand("p1", "lantern", "room_a", "broadcast_cmd"));

    expect(broadcastLog.length).toBe(1);
    expect(broadcastLog[0]).toContain("ENTITY_TAKEN");
  });

  // ─── TEST 11: onCommit does NOT fire on failed commit ──────────────────────

  it("M2-11: onCommit callback does NOT fire on failed commit", async () => {
    const { state } = buildTestWorld();
    const session = new WorldSession(structuredClone(state), { rulesetVersion: "mvp-1" });
    const failingPersistence = new FailingPersistence();

    const broadcastLog: string[] = [];
    const coordinator = new CommitCoordinator(session, failingPersistence, {
      onCommit: (events) => {
        for (const e of events) {
          broadcastLog.push(e.eventType);
        }
      },
    });

    await coordinator.executeCommand(makeTakeCommand("p1", "lantern", "room_a", "no_broadcast_cmd"));

    // No broadcast on failure
    expect(broadcastLog.length).toBe(0);
  });

  // ─── TEST 12: Refused commands never reach persistence ─────────────────────

  it("M2-12: refused commands never reach persistence", async () => {
    const { state } = buildTestWorld();
    const session = new WorldSession(structuredClone(state), { rulesetVersion: "mvp-1" });
    const coordinator = new CommitCoordinator(session, persistence);

    // Try to take an entity that doesn't exist
    const badCmd = makeTakeCommand("p1", "nonexistent", "room_a", "refused_cmd");
    const result = await coordinator.executeCommand(badCmd);

    expect(result.resolution.accepted).toBe(false);
    expect(result.commit).toBeUndefined(); // Never reached persistence

    // DB has no events
    const events = await persistence.loadAllEvents("persist_test_world");
    expect(events.length).toBe(0);
  });
});
