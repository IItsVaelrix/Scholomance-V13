/**
 * Direction-movement regression tests (PDR §6.3, §26.1).
 *
 * Guards the fix for the bug where direction commands ("go west") returned
 * TARGET_NOT_FOUND: room `exitIds` are room IDs, so a typed direction word never
 * matched. The authored direction → roomId map (`exitDirections`) now lives in
 * runtime room state and the binder/resolver consult it. These tests exercise
 * the full bind → resolve → apply chain so a regression cannot hide behind a
 * bare `action === "MOVE"` assertion again.
 */

import { describe, it, expect } from "vitest";
import { CommandBinder } from "../src/index.js";
import {
  createInitialState,
  registerPlayer,
  CommandResolver,
  applyEvents,
} from "@polaris/world-kernel";
import type { WorldDefinition } from "@polaris/world-kernel";
import { buildResolutionContext } from "@polaris/contracts";

function buildWorld() {
  const def: WorldDefinition = {
    worldId: "vale",
    rulesetVersion: "mvp-1",
    rooms: [
      {
        roomId: "forest_path",
        title: "Forest",
        descriptionKey: "f",
        exitIds: ["ruined_shrine", "moonlit_clearing"],
        exitDirections: { east: "ruined_shrine", west: "moonlit_clearing" },
        flags: {},
      },
      {
        roomId: "ruined_shrine",
        title: "Shrine",
        descriptionKey: "s",
        exitIds: ["forest_path", "moonlit_clearing"],
        exitDirections: { west: "forest_path", north: "moonlit_clearing" },
        flags: {},
      },
      {
        roomId: "moonlit_clearing",
        title: "Clearing",
        descriptionKey: "c",
        exitIds: ["forest_path", "ruined_shrine"],
        exitDirections: { east: "forest_path", south: "ruined_shrine" },
        flags: {},
      },
    ],
    entities: [],
  };
  let state = createInitialState(def);
  state = registerPlayer(state, "p1", "Alice", "forest_path");
  return state;
}

describe("direction movement", () => {
  const binder = new CommandBinder();
  const resolver = new CommandResolver("mvp-1");

  it("createInitialState carries authored exitDirections into room state", () => {
    const state = buildWorld();
    expect(state.rooms["forest_path"].exitDirections).toEqual({
      east: "ruined_shrine",
      west: "moonlit_clearing",
    });
  });

  it("omits the optional field when a room authors no directions", () => {
    const def: WorldDefinition = {
      worldId: "w",
      rulesetVersion: "mvp-1",
      rooms: [{ roomId: "void", title: "Void", descriptionKey: "v", exitIds: [], flags: {} }],
      entities: [],
    };
    const state = createInitialState(def);
    expect(state.rooms["void"].exitDirections).toBeUndefined();
  });

  it("binds 'go east' to the destination room ID via the direction map", () => {
    const state = buildWorld();
    const result = binder.bind("go east", {
      commandId: "c1", actorId: "p1", roomId: "forest_path", state,
    });
    expect(result.success).toBe(true);
    expect(result.command?.action).toBe("MOVE");
    expect(result.command?.targetIds).toEqual(["ruined_shrine"]);
    expect(result.command?.arguments["direction"]).toBe("east");
  });

  it("binds a bare direction word ('west') to the destination room ID", () => {
    const state = buildWorld();
    const result = binder.bind("west", {
      commandId: "c2", actorId: "p1", roomId: "forest_path", state,
    });
    expect(result.success).toBe(true);
    expect(result.command?.targetIds).toEqual(["moonlit_clearing"]);
  });

  it("still resolves a room-name substring ('go shrine')", () => {
    const state = buildWorld();
    const result = binder.bind("go shrine", {
      commandId: "c3", actorId: "p1", roomId: "forest_path", state,
    });
    expect(result.success).toBe(true);
    expect(result.command?.targetIds).toEqual(["ruined_shrine"]);
  });

  it("resolver accepts a direction-bound MOVE and moves the player", () => {
    const state = buildWorld();
    const bound = binder.bind("go east", {
      commandId: "c4", actorId: "p1", roomId: "forest_path", state,
    });
    expect(bound.success).toBe(true);
    const context = buildResolutionContext(
      state.worldId, "c4", "mvp-1", 4, 0, state.revision + 1,
    );
    const resolution = resolver.resolve(state, bound.command!, context);
    expect(resolution.accepted).toBe(true);
    expect(resolution.events.map((e) => e.eventType)).toEqual([
      "PLAYER_LEFT_ROOM",
      "PLAYER_ENTERED_ROOM",
    ]);
    const entered = resolution.events.find((e) => e.eventType === "PLAYER_ENTERED_ROOM");
    expect(entered?.roomId).toBe("ruined_shrine");

    const next = applyEvents(state, resolution.events);
    expect(next.players["p1"].roomId).toBe("ruined_shrine");
    expect(next.rooms["forest_path"].occupantIds).not.toContain("p1");
    expect(next.rooms["ruined_shrine"].occupantIds).toContain("p1");
    // The direction map survives event application (rooms are mutated in place).
    expect(next.rooms["ruined_shrine"].exitDirections).toEqual({
      west: "forest_path",
      north: "moonlit_clearing",
    });
  });

  it("refuses a direction that has no matching exit", () => {
    const state = buildWorld();
    const bound = binder.bind("go north", {
      commandId: "c5", actorId: "p1", roomId: "forest_path", state,
    });
    // Binder cannot resolve north from the forest; it forwards the raw token.
    expect(bound.success).toBe(true);
    expect(bound.command?.targetIds).toEqual(["north"]);
    const context = buildResolutionContext(
      state.worldId, "c5", "mvp-1", 4, 0, state.revision + 1,
    );
    const resolution = resolver.resolve(state, bound.command!, context);
    expect(resolution.accepted).toBe(false);
    expect(resolution.refusal).toBe("TARGET_NOT_FOUND");
  });
});
