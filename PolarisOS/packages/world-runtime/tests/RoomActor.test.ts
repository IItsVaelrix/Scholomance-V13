/**
 * RoomActor tests — Milestone 3 (serialized room actor, PDR §14 Concurrency Model).
 *
 * Verifies:
 *   - Race-safe competition: two concurrent `take lantern` → exactly one wins,
 *     the other is evaluated against UPDATED state (TARGET_UNAVAILABLE).
 *   - Presence join/leave flow through the same serialized two-phase commit.
 *   - Global serialization: concurrent commands (even across rooms) never
 *     interleave, so commits stay contiguous and conflict-free.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { WorldSession, CommitCoordinator, RoomActorHub } from "../src/index.js";
import type { PersistencePort, ExecuteResult } from "../src/index.js";
import { createInitialState, registerPlayer } from "@polaris/world-kernel";
import type { WorldDefinition } from "@polaris/world-kernel";
import type { BoundCommand, DomainEvent, ProposedTransaction, CommitResult, WorldState } from "@polaris/contracts";

// ─── In-memory persistence (always commits if revision matches) ────────────────

class InMemoryPersistence implements PersistencePort {
  revision = 0;
  committedEvents: DomainEvent[] = [];

  async commitTransaction(proposal: ProposedTransaction): Promise<CommitResult> {
    if (proposal.expectedRevision !== this.revision) {
      return { committed: false, reason: "REVISION_MISMATCH" };
    }
    this.revision = proposal.resultingRevision;
    this.committedEvents.push(...proposal.events);
    return { committed: true, revision: proposal.resultingRevision, sequence: proposal.resultingSequence };
  }

  async getWorldRevision(): Promise<number | null> {
    return this.revision;
  }
}

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function buildWorld(): WorldState {
  const def: WorldDefinition = {
    worldId: "actor_test_world",
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
  return state;
}

function takeCmd(playerId: string, targetId: string, roomId: string, id: string): BoundCommand {
  return { commandId: id, actorId: playerId, roomId, action: "TAKE", targetIds: [targetId], arguments: {}, evidence: [] };
}

function sayCmd(playerId: string, roomId: string, id: string, message: string): BoundCommand {
  return { commandId: id, actorId: playerId, roomId, action: "SAY", targetIds: [], arguments: { message }, evidence: [] };
}

interface Harness {
  session: WorldSession;
  hub: RoomActorHub;
  persistence: InMemoryPersistence;
  broadcast: DomainEvent[];
}

function makeHarness(): Harness {
  const state = buildWorld();
  const persistence = new InMemoryPersistence();
  const session = new WorldSession(structuredClone(state), { rulesetVersion: "mvp-1" });
  const broadcast: DomainEvent[] = [];
  const coordinator = new CommitCoordinator(session, persistence, {
    onCommit: (events) => broadcast.push(...events),
  });
  const hub = new RoomActorHub(coordinator);
  return { session, hub, persistence, broadcast };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("RoomActor", () => {
  it("RACE: two concurrent takes — exactly one wins, the other sees updated state", async () => {
    const { hub, persistence, broadcast } = makeHarness();
    const actor = hub.actorFor("room_a");

    const [r1, r2] = await Promise.all([
      actor.enqueue(takeCmd("p1", "lantern", "room_a", "race_1")),
      actor.enqueue(takeCmd("p2", "lantern", "room_a", "race_2")),
    ]);

    const outcomes = [r1, r2];
    const winners = outcomes.filter((r) => r.resolution.accepted && r.commit?.committed);
    const losers = outcomes.filter((r) => !r.resolution.accepted);

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);

    // The loser is refused because the lantern is no longer in the room.
    const loser = losers[0].resolution as { accepted: false; refusal: string };
    expect(loser.refusal).toBe("TARGET_UNAVAILABLE");

    // Exactly one ENTITY_TAKEN event exists in the ledger and broadcast.
    const taken = persistence.committedEvents.filter((e) => e.eventType === "ENTITY_TAKEN");
    expect(taken).toHaveLength(1);
    expect(broadcast.filter((e) => e.eventType === "ENTITY_TAKEN")).toHaveLength(1);
  });

  it("join enqueues a PLAYER_ENTERED_ROOM event and registers the player", async () => {
    const { hub, session, broadcast } = makeHarness();
    const actor = hub.actorFor("room_b");

    const result = await actor.enqueueJoin("p3", "Carol", "join_p3");
    expect(result.resolution.accepted).toBe(true);
    expect(result.commit?.committed).toBe(true);

    const state = session.getState();
    expect(state.players["p3"]).toBeDefined();
    expect(state.rooms["room_b"].occupantIds).toContain("p3");
    expect(broadcast.some((e) => e.eventType === "PLAYER_ENTERED_ROOM")).toBe(true);
  });

  it("leave removes the occupant and emits PLAYER_LEFT_ROOM", async () => {
    const { hub, session, broadcast } = makeHarness();
    const actor = hub.actorFor("room_a");

    await actor.enqueueLeave("p1", "leave_p1");
    const state = session.getState();
    expect(state.rooms["room_a"].occupantIds).not.toContain("p1");
    expect(state.players["p1"].connectionState).toBe("disconnected");
    expect(broadcast.some((e) => e.eventType === "PLAYER_LEFT_ROOM")).toBe(true);
  });

  it("serializes concurrent commands into contiguous sequences", async () => {
    const { hub, persistence } = makeHarness();
    const actor = hub.actorFor("room_a");

    // Fire several commands concurrently; they must commit in order, no conflicts.
    const results = await Promise.all([
      actor.enqueue(sayCmd("p1", "room_a", "s1", "one")),
      actor.enqueue(sayCmd("p2", "room_a", "s2", "two")),
      actor.enqueue(sayCmd("p1", "room_a", "s3", "three")),
      actor.enqueue(sayCmd("p2", "room_a", "s4", "four")),
    ]);

    for (const r of results) {
      expect(r.resolution.accepted).toBe(true);
      expect(r.commit?.committed).toBe(true);
    }

    const seqs = persistence.committedEvents.map((e) => e.sequence);
    expect(seqs).toEqual([0, 1, 2, 3]);
  });

  it("serializes across rooms through the shared hub chain", async () => {
    const { hub, persistence } = makeHarness();
    const actorA = hub.actorFor("room_a");
    const actorB = hub.actorFor("room_b");

    const results = await Promise.all([
      actorA.enqueue(sayCmd("p1", "room_a", "a1", "in a")),
      actorB.enqueue(sayCmd("p2", "room_b", "b1", "in b")),
      actorA.enqueue(takeCmd("p1", "lantern", "room_a", "a2")),
    ]);

    // All commit successfully (no revision conflict) because they are serialized.
    for (const r of results) {
      expect(r.commit?.committed).toBe(true);
    }
    expect(persistence.revision).toBe(3);

    const seqs = persistence.committedEvents.map((e) => e.sequence).sort((a, b) => a - b);
    expect(seqs).toEqual([0, 1, 2]);
  });

  it("getRevision reflects the room revision", async () => {
    const { hub } = makeHarness();
    const actor = hub.actorFor("room_a");
    const before = actor.getRevision();
    await actor.enqueue(takeCmd("p1", "lantern", "room_a", "rev_cmd"));
    expect(actor.getRevision()).toBeGreaterThan(before);
  });
});
