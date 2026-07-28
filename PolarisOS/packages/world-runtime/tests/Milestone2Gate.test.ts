/**
 * Milestone 2 Entry Gate Tests
 *
 * These tests MUST pass before SQLite persistence is wired.
 * They verify the determinism, duplicate-rejection, and sequence-continuity
 * invariants that the persistence layer will depend on.
 *
 * Required by: PIR Correction §1–§3 (2026-06-14)
 */

import { describe, it, expect } from "vitest";
import { WorldSession } from "../src/index.js";
import { createInitialState, registerPlayer, applyEvents } from "@polaris/world-kernel";
import { buildResolutionContext, deriveEventId } from "@polaris/contracts";
import type { WorldDefinition } from "@polaris/world-kernel";
import type { BoundCommand, DomainEvent, WorldState } from "@polaris/contracts";
import { SceneCompiler } from "@polaris/scene-compiler";

function buildTestWorld() {
  const def: WorldDefinition = {
    worldId: "gate_test_world",
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

describe("Milestone 2 Entry Gate", () => {
  // ─── TEST 1: Full event equality is deterministic ───────────────────────────

  it("GATE-1: full event equality is deterministic with identical metadata", () => {
    const { state } = buildTestWorld();
    const session1 = new WorldSession(structuredClone(state), { rulesetVersion: "mvp-1" });
    const session2 = new WorldSession(structuredClone(state), { rulesetVersion: "mvp-1" });

    const cmd = makeTakeCommand("p1", "lantern", "room_a", "det_cmd_001");
    const r1 = session1.processCommand(cmd);
    const r2 = session2.processCommand(cmd);

    expect(r1.accepted).toBe(true);
    expect(r2.accepted).toBe(true);

    if (r1.accepted && r2.accepted) {
      // FULL event equality — not just types and payloads, but eventId, sequence, occurredAt
      // occurredAt will differ (wall-clock), so we compare everything EXCEPT occurredAt
      const strip = (events: DomainEvent[]) =>
        events.map(({ occurredAt, ...rest }) => rest);

      expect(strip(r1.events)).toEqual(strip(r2.events));

      // eventId must be identical (derived from stable inputs)
      expect(r1.events[0].eventId).toBe(r2.events[0].eventId);
      expect(r1.events[0].sequence).toBe(r2.events[0].sequence);
      expect(r1.events[0].worldRevision).toBe(r2.events[0].worldRevision);
    }
  });

  // ─── TEST 2: Duplicate event replay is rejected ────────────────────────────

  it("GATE-2: reapplying a duplicate event is rejected", () => {
    const { state } = buildTestWorld();
    const session = new WorldSession(structuredClone(state), { rulesetVersion: "mvp-1" });

    const cmd = makeTakeCommand("p1", "lantern", "room_a", "dup_cmd");
    const result = session.processCommand(cmd);
    expect(result.accepted).toBe(true);

    if (result.accepted) {
      const event = result.events[0];

      // Attempting to replay the same event must throw
      expect(() => session.replayEvents([event])).toThrow(/REPLAY_DUPLICATE/);
    }
  });

  // ─── TEST 3: Replay rejects sequence gaps ──────────────────────────────────

  it("GATE-3: replay rejects sequence gaps", () => {
    const { state } = buildTestWorld();
    const session = new WorldSession(structuredClone(state), { rulesetVersion: "mvp-1" });

    // Process one command to advance sequence to 1
    session.processCommand(makeTakeCommand("p1", "lantern", "room_a", "gap_cmd"));

    // Fabricate an event with sequence 5 (gap: expected 1)
    const gapEvent: DomainEvent = {
      eventId: "evt_gap_test",
      worldId: "gate_test_world",
      roomId: "room_a",
      sequence: 5, // GAP — should be 1
      worldRevision: 2,
      eventType: "PLAYER_SPOKE",
      actorId: "p2",
      payload: { playerId: "p2", displayName: "Bob", message: "hello" },
      rulesetVersion: "mvp-1",
      occurredAt: "2026-01-01T00:00:00.000Z",
    };

    expect(() => session.replayEvents([gapEvent])).toThrow(/REPLAY_SEQUENCE_GAP/);
  });

  // ─── TEST 4: Replay rejects out-of-order events ────────────────────────────

  it("GATE-4: replay rejects out-of-order events", () => {
    const { state } = buildTestWorld();
    const session = new WorldSession(structuredClone(state), { rulesetVersion: "mvp-1" });

    // Process two commands to advance sequence to 2
    session.processCommand(makeTakeCommand("p1", "lantern", "room_a", "order_cmd_1"));
    session.processCommand(makeSayCommand("p2", "room_a", "order_cmd_2", "hi"));

    // Try to replay an event with sequence 0 (already passed)
    const oldEvent: DomainEvent = {
      eventId: "evt_old_order",
      worldId: "gate_test_world",
      roomId: "room_a",
      sequence: 0, // OUT OF ORDER — current counter is 2
      worldRevision: 1,
      eventType: "PLAYER_SPOKE",
      actorId: "p1",
      payload: { playerId: "p1", displayName: "Alice", message: "old" },
      rulesetVersion: "mvp-1",
      occurredAt: "2026-01-01T00:00:00.000Z",
    };

    expect(() => session.replayEvents([oldEvent])).toThrow(/REPLAY_SEQUENCE_GAP/);
  });

  // ─── TEST 5: Duplicate eventId insertion is impossible ─────────────────────

  it("GATE-5: duplicate eventId insertion is impossible", () => {
    const { state } = buildTestWorld();
    const session = new WorldSession(structuredClone(state), { rulesetVersion: "mvp-1" });

    // Use SAY because it always succeeds regardless of state changes
    const cmd = makeSayCommand("p1", "room_a", "unique_say_cmd", "hello");
    const result = session.processCommand(cmd);
    expect(result.accepted).toBe(true);

    if (result.accepted) {
      const eventId = result.events[0].eventId;
      expect(session.hasEvent(eventId)).toBe(true);

      // Processing the exact same command again derives the same eventId
      // (deterministic: same worldId + commandId + index + ruleset)
      // The session must reject it as a duplicate
      expect(() => {
        session.processCommand(cmd);
      }).toThrow(/DUPLICATE_EVENT_ID/);
    }
  });

  // ─── TEST 6: Command + mutations commit atomically ─────────────────────────

  it("GATE-6: command and materialized mutations commit atomically", () => {
    const { state } = buildTestWorld();
    const session = new WorldSession(structuredClone(state), { rulesetVersion: "mvp-1" });

    const cmd = makeTakeCommand("p1", "lantern", "room_a", "atomic_cmd");
    const result = session.processCommand(cmd);

    expect(result.accepted).toBe(true);
    if (result.accepted) {
      // After processing, ALL of these must be true simultaneously:
      const finalState = session.getState();

      // Entity moved to inventory
      expect(finalState.entities["lantern"].location).toEqual({ type: "inventory", playerId: "p1" });
      // Player inventory updated
      expect(finalState.players["p1"].inventoryIds).toContain("lantern");
      // Room entity list updated
      expect(finalState.rooms["room_a"].entityIds).not.toContain("lantern");
      // Revision incremented exactly once
      expect(session.getWorldRevision()).toBe(1);
      // Sequence advanced by event count
      expect(session.getSequenceCounter()).toBe(1);
    }
  });

  // ─── TEST 7: Failed commit leaves in-memory state unchanged ────────────────

  it("GATE-7: failed commit leaves in-memory state unchanged", () => {
    const { state } = buildTestWorld();
    const session = new WorldSession(structuredClone(state), { rulesetVersion: "mvp-1" });

    // Process a valid command first
    session.processCommand(makeTakeCommand("p1", "lantern", "room_a", "pre_fail_cmd"));
    const stateBefore = session.getState();
    const revisionBefore = session.getWorldRevision();
    const sequenceBefore = session.getSequenceCounter();

    // Attempt an invalid command (refused — no state change)
    const badCmd = makeTakeCommand("p2", "lantern", "room_a", "fail_cmd");
    const result = session.processCommand(badCmd);
    expect(result.accepted).toBe(false);

    // State must be unchanged
    expect(session.getState()).toEqual(stateBefore);
    expect(session.getWorldRevision()).toBe(revisionBefore);
    expect(session.getSequenceCounter()).toBe(sequenceBefore);
  });

  // ─── TEST 8: Revision, sequence, and event ledger cannot disagree ──────────

  it("GATE-8: persisted revision, in-memory revision, and event sequence cannot disagree", () => {
    const { state } = buildTestWorld();
    const session = new WorldSession(structuredClone(state), { rulesetVersion: "mvp-1" });

    const allEvents: DomainEvent[] = [];

    // Process 3 commands
    const cmds = [
      makeTakeCommand("p1", "lantern", "room_a", "agree_cmd_1"),
      makeSayCommand("p2", "room_a", "agree_cmd_2", "hello"),
      makeSayCommand("p1", "room_a", "agree_cmd_3", "world"),
    ];

    for (const cmd of cmds) {
      const result = session.processCommand(cmd);
      if (result.accepted) {
        allEvents.push(...result.events);
      }
    }

    // Invariant: worldRevision === number of accepted commands
    expect(session.getWorldRevision()).toBe(3);

    // Invariant: sequenceCounter === total events produced
    expect(session.getSequenceCounter()).toBe(allEvents.length);

    // Invariant: last event's worldRevision === session revision
    const lastEvent = allEvents[allEvents.length - 1];
    expect(lastEvent.worldRevision).toBe(session.getWorldRevision());

    // Invariant: events are contiguous
    for (let i = 0; i < allEvents.length; i++) {
      expect(allEvents[i].sequence).toBe(i);
    }
  });

  // ─── TEST 9: Scene manifests identical before and after replay ─────────────

  it("GATE-9: scene manifests generated before and after replay are identical", () => {
    const { state } = buildTestWorld();

    // Phase 1: Process commands live
    const session1 = new WorldSession(structuredClone(state), { rulesetVersion: "mvp-1" });
    const cmd1 = makeTakeCommand("p1", "lantern", "room_a", "scene_cmd_1");
    const result1 = session1.processCommand(cmd1);
    expect(result1.accepted).toBe(true);

    const liveState = session1.getState();
    const compiler = new SceneCompiler();
    const liveManifest = compiler.compile({
      worldId: "gate_test_world",
      room: liveState.rooms["room_a"],
      entities: Object.values(liveState.entities),
      occupants: Object.values(liveState.players).filter((p) => p.roomId === "room_a"),
    });

    // Phase 2: Replay the same events into a fresh session
    const session2 = new WorldSession(structuredClone(state), { rulesetVersion: "mvp-1" });
    if (result1.accepted) {
      session2.replayEvents(result1.events);
    }

    const replayedState = session2.getState();
    const replayedManifest = compiler.compile({
      worldId: "gate_test_world",
      room: replayedState.rooms["room_a"],
      entities: Object.values(replayedState.entities),
      occupants: Object.values(replayedState.players).filter((p) => p.roomId === "room_a"),
    });

    // Manifests must be identical (excluding generatedAt timestamp)
    const { generatedAt: _t1, ...liveClean } = liveManifest;
    const { generatedAt: _t2, ...replayedClean } = replayedManifest;

    expect(liveClean).toEqual(replayedClean);
    expect(liveManifest.contractHash).toBe(replayedManifest.contractHash);
  });
});
