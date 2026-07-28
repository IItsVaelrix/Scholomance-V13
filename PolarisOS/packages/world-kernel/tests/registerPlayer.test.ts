/**
 * registerPlayer reconnect tests — Milestone 6 hardening.
 *
 * A join refreshes PRESENCE; it must never destroy what a player carries. This
 * locks in the fix for the latent bug where re-registering an existing player
 * reset inventoryIds to [], which would make a reconnecting owner lose the
 * lantern (violating PDR §5.6 persistent causality and §24.13 "the lantern
 * owner remains correct").
 */
import { describe, it, expect } from "vitest";
import { createInitialState, registerPlayer, applyEvents } from "../src/index.js";
import type { WorldDefinition } from "../src/createInitialState.js";
import type { DomainEvent } from "@polaris/contracts";

function buildWorld() {
  const def: WorldDefinition = {
    worldId: "reconnect_world",
    rulesetVersion: "mvp-1",
    rooms: [
      { roomId: "shrine", title: "Shrine", descriptionKey: "s", exitIds: [], flags: {} },
    ],
    entities: [
      { entityId: "lantern", entityType: "object", definitionId: "lantern", roomId: "shrine", flags: {} },
    ],
  };
  return createInitialState(def);
}

describe("registerPlayer (reconnect hardening)", () => {
  it("gives a brand-new player an empty inventory", () => {
    const state = registerPlayer(buildWorld(), "alice", "Alice", "shrine");
    expect(state.players["alice"].inventoryIds).toEqual([]);
    expect(state.rooms["shrine"].occupantIds).toContain("alice");
  });

  it("preserves inventory when an existing player re-registers (reconnect)", () => {
    const state = registerPlayer(buildWorld(), "alice", "Alice", "shrine");
    // Alice acquires the lantern.
    state.players["alice"].inventoryIds = ["lantern"];
    state.entities["lantern"].location = { type: "inventory", playerId: "alice" };

    // Alice reconnects: re-registering must NOT wipe her inventory.
    const rejoined = registerPlayer(state, "alice", "Alice", "shrine");
    expect(rejoined.players["alice"].inventoryIds).toEqual(["lantern"]);
    expect(rejoined.players["alice"].connectionState).toBe("connected");
  });

  it("refreshes presence (room/connection) while preserving inventory", () => {
    const state = registerPlayer(buildWorld(), "alice", "Alice", "shrine");
    state.players["alice"].inventoryIds = ["lantern"];
    state.players["alice"].connectionState = "disconnected";

    const rejoined = registerPlayer(state, "alice", "Alice", "shrine");
    expect(rejoined.players["alice"].connectionState).toBe("connected");
    expect(rejoined.players["alice"].roomId).toBe("shrine");
    expect(rejoined.players["alice"].inventoryIds).toEqual(["lantern"]);
  });

  it("does not duplicate the occupant on reconnect", () => {
    let state = registerPlayer(buildWorld(), "alice", "Alice", "shrine");
    state = registerPlayer(state, "alice", "Alice", "shrine");
    expect(state.rooms["shrine"].occupantIds.filter((id) => id === "alice")).toHaveLength(1);
  });

  it("end-to-end: a replayed take survives a reconnect re-registration", () => {
    // Simulate restart restoration: replay a join + take from the ledger.
    let state = buildWorld();
    const join: DomainEvent = {
      eventId: "e0",
      worldId: "reconnect_world",
      roomId: "shrine",
      sequence: 0,
      worldRevision: 1,
      eventType: "PLAYER_ENTERED_ROOM",
      actorId: "alice",
      payload: { playerId: "alice", displayName: "Alice", fromRoomId: null },
      rulesetVersion: "mvp-1",
      occurredAt: "2026-07-28T00:00:00.000Z",
    };
    const take: DomainEvent = {
      eventId: "e1",
      worldId: "reconnect_world",
      roomId: "shrine",
      sequence: 1,
      worldRevision: 2,
      eventType: "ENTITY_TAKEN",
      actorId: "alice",
      payload: { entityId: "lantern", entityName: "Lantern", fromRoomId: "shrine" },
      rulesetVersion: "mvp-1",
      occurredAt: "2026-07-28T00:00:01.000Z",
    };
    state = applyEvents(state, [join, take]);
    expect(state.players["alice"].inventoryIds).toEqual(["lantern"]);

    // Alice reconnects after the restart — inventory must survive.
    const rejoined = registerPlayer(state, "alice", "Alice", "shrine");
    expect(rejoined.players["alice"].inventoryIds).toEqual(["lantern"]);
    expect(rejoined.entities["lantern"].location).toEqual({ type: "inventory", playerId: "alice" });
  });
});
