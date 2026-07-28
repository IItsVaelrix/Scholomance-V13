/**
 * World Kernel unit tests — Milestone 1
 *
 * Exit criterion: "The lantern race can be simulated entirely in memory."
 * Tests: deterministic resolution, race conditions, state transitions.
 */

import { describe, it, expect } from "vitest";
import { WorldKernel, createInitialState, registerPlayer } from "../src/index.js";
import type { WorldDefinition } from "../src/createInitialState.js";
import type { BoundCommand } from "@polaris/contracts";

function buildTestWorld() {
  const def: WorldDefinition = {
    worldId: "test_world",
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

describe("WorldKernel", () => {
  it("initializes with correct state", () => {
    const { state } = buildTestWorld();
    const kernel = new WorldKernel(state, { rulesetVersion: "mvp-1" });

    expect(kernel.getWorldRevision()).toBe(0);
    expect(kernel.getRoomRevision("room_a")).toBe(0);
    expect(kernel.getState().players["p1"].displayName).toBe("Alice");
  });

  it("resolves TAKE successfully for first player", () => {
    const { state } = buildTestWorld();
    const kernel = new WorldKernel(state, { rulesetVersion: "mvp-1" });

    const cmd = makeTakeCommand("p1", "lantern", "room_a", "cmd_1");
    const result = kernel.processCommand(cmd);

    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.events).toHaveLength(1);
      expect(result.events[0].eventType).toBe("ENTITY_TAKEN");
    }

    // Verify state mutation
    const newState = kernel.getState();
    expect(newState.entities["lantern"].location).toEqual({ type: "inventory", playerId: "p1" });
    expect(newState.players["p1"].inventoryIds).toContain("lantern");
    expect(newState.rooms["room_a"].entityIds).not.toContain("lantern");
  });

  it("LANTERN RACE: second player gets TARGET_UNAVAILABLE", () => {
    const { state } = buildTestWorld();
    const kernel = new WorldKernel(state, { rulesetVersion: "mvp-1" });

    // Player 1 takes lantern first
    const cmd1 = makeTakeCommand("p1", "lantern", "room_a", "cmd_1");
    const result1 = kernel.processCommand(cmd1);
    expect(result1.accepted).toBe(true);

    // Player 2 tries to take the same lantern
    const cmd2 = makeTakeCommand("p2", "lantern", "room_a", "cmd_2");
    const result2 = kernel.processCommand(cmd2);

    expect(result2.accepted).toBe(false);
    if (!result2.accepted) {
      expect(result2.refusal).toBe("TARGET_UNAVAILABLE");
    }

    // Only one ENTITY_TAKEN event should exist
    const finalState = kernel.getState();
    expect(finalState.entities["lantern"].location).toEqual({ type: "inventory", playerId: "p1" });
    expect(finalState.players["p2"].inventoryIds).not.toContain("lantern");
  });

  it("resolves ACTIVATE on environment entity", () => {
    const { state } = buildTestWorld();
    const kernel = new WorldKernel(state, { rulesetVersion: "mvp-1" });

    const cmd: BoundCommand = {
      commandId: "cmd_act",
      actorId: "p1",
      roomId: "room_a",
      action: "ACTIVATE",
      targetIds: ["brazier"],
      arguments: { activation: "lit" },
      evidence: [],
    };

    const result = kernel.processCommand(cmd);
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.events[0].eventType).toBe("ENTITY_ACTIVATED");
      expect((result.events[0].payload as any).activation).toBe("lit");
    }

    const newState = kernel.getState();
    expect(newState.entities["brazier"].flags["activated"]).toBe(true);
    expect(newState.entities["brazier"].flags["activation"]).toBe("lit");
  });

  it("refuses TAKE on environment entities", () => {
    const { state } = buildTestWorld();
    const kernel = new WorldKernel(state, { rulesetVersion: "mvp-1" });

    const cmd = makeTakeCommand("p1", "brazier", "room_a", "cmd_bad");
    const result = kernel.processCommand(cmd);

    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.refusal).toBe("PERMISSION_DENIED");
    }
  });

  it("resolves MOVE between rooms", () => {
    const { state } = buildTestWorld();
    const kernel = new WorldKernel(state, { rulesetVersion: "mvp-1" });

    const cmd: BoundCommand = {
      commandId: "cmd_move",
      actorId: "p1",
      roomId: "room_a",
      action: "MOVE",
      targetIds: ["room_b"],
      arguments: { direction: "east" },
      evidence: [],
    };

    const result = kernel.processCommand(cmd);
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.events.some((e) => e.eventType === "PLAYER_LEFT_ROOM")).toBe(true);
      expect(result.events.some((e) => e.eventType === "PLAYER_ENTERED_ROOM")).toBe(true);
    }
  });

  it("resolves SAY and produces PLAYER_SPOKE event", () => {
    const { state } = buildTestWorld();
    const kernel = new WorldKernel(state, { rulesetVersion: "mvp-1" });

    const cmd: BoundCommand = {
      commandId: "cmd_say",
      actorId: "p1",
      roomId: "room_a",
      action: "SAY",
      targetIds: [],
      arguments: { message: "The rain is getting worse." },
      evidence: [],
    };

    const result = kernel.processCommand(cmd);
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.events[0].eventType).toBe("PLAYER_SPOKE");
      expect((result.events[0].payload as any).message).toBe("The rain is getting worse.");
    }
  });

  it("increments world revision on each accepted command", () => {
    const { state } = buildTestWorld();
    const kernel = new WorldKernel(state, { rulesetVersion: "mvp-1" });

    expect(kernel.getWorldRevision()).toBe(0);

    kernel.processCommand(makeTakeCommand("p1", "lantern", "room_a", "c1"));
    expect(kernel.getWorldRevision()).toBe(1);

    const sayCmd: BoundCommand = {
      commandId: "c2", actorId: "p2", roomId: "room_a",
      action: "SAY", targetIds: [], arguments: { message: "hi" }, evidence: [],
    };
    kernel.processCommand(sayCmd);
    expect(kernel.getWorldRevision()).toBe(2);
  });

  it("is deterministic: same inputs produce same event types", () => {
    const { state } = buildTestWorld();
    const kernel1 = new WorldKernel(structuredClone(state), { rulesetVersion: "mvp-1" });
    const kernel2 = new WorldKernel(structuredClone(state), { rulesetVersion: "mvp-1" });

    const cmd = makeTakeCommand("p1", "lantern", "room_a", "det_cmd");
    const r1 = kernel1.processCommand(cmd);
    const r2 = kernel2.processCommand(cmd);

    expect(r1.accepted).toBe(r2.accepted);
    if (r1.accepted && r2.accepted) {
      expect(r1.events.map((e) => e.eventType)).toEqual(r2.events.map((e) => e.eventType));
      expect(r1.events.map((e) => e.payload)).toEqual(r2.events.map((e) => e.payload));
    }
  });
});
