/**
 * CommandBinder unit tests
 */

import { describe, it, expect } from "vitest";
import { CommandBinder } from "../src/index.js";
import { createInitialState, registerPlayer } from "@polaris/world-kernel";
import type { WorldDefinition } from "@polaris/world-kernel";

function buildWorld() {
  const def: WorldDefinition = {
    worldId: "test",
    rulesetVersion: "mvp-1",
    rooms: [
      { roomId: "shrine", title: "Shrine", descriptionKey: "s", exitIds: ["forest"], flags: {} },
      { roomId: "forest", title: "Forest", descriptionKey: "f", exitIds: ["shrine"], flags: {} },
    ],
    entities: [
      { entityId: "lantern_01", entityType: "object", definitionId: "lantern", roomId: "shrine", flags: {} },
      { entityId: "brazier_01", entityType: "environment", definitionId: "brazier", roomId: "shrine", flags: {} },
    ],
  };
  let state = createInitialState(def);
  state = registerPlayer(state, "p1", "Alice", "shrine");
  return state;
}

describe("CommandBinder", () => {
  const binder = new CommandBinder();

  it("binds 'take lantern' to TAKE action", () => {
    const state = buildWorld();
    const result = binder.bind("take lantern", {
      commandId: "c1", actorId: "p1", roomId: "shrine", state,
    });
    expect(result.success).toBe(true);
    expect(result.command?.action).toBe("TAKE");
    expect(result.command?.targetIds).toContain("lantern_01");
  });

  it("binds 'pick up the lantern' to TAKE action", () => {
    const state = buildWorld();
    const result = binder.bind("pick up the lantern", {
      commandId: "c2", actorId: "p1", roomId: "shrine", state,
    });
    expect(result.success).toBe(true);
    expect(result.command?.action).toBe("TAKE");
  });

  it("binds 'grab the lantern' to TAKE action", () => {
    const state = buildWorld();
    const result = binder.bind("grab the lantern", {
      commandId: "c3", actorId: "p1", roomId: "shrine", state,
    });
    expect(result.success).toBe(true);
    expect(result.command?.action).toBe("TAKE");
  });

  it("binds 'light brazier' to ACTIVATE with activation=lit", () => {
    const state = buildWorld();
    const result = binder.bind("light brazier", {
      commandId: "c4", actorId: "p1", roomId: "shrine", state,
    });
    expect(result.success).toBe(true);
    expect(result.command?.action).toBe("ACTIVATE");
    expect(result.command?.arguments["activation"]).toBe("lit");
  });

  it("binds 'east' to MOVE", () => {
    const state = buildWorld();
    const result = binder.bind("east", {
      commandId: "c5", actorId: "p1", roomId: "shrine", state,
    });
    expect(result.success).toBe(true);
    expect(result.command?.action).toBe("MOVE");
  });

  it("binds 'say hello world' to SAY with message", () => {
    const state = buildWorld();
    const result = binder.bind("say hello world", {
      commandId: "c6", actorId: "p1", roomId: "shrine", state,
    });
    expect(result.success).toBe(true);
    expect(result.command?.action).toBe("SAY");
    expect(result.command?.arguments["message"]).toBe("hello world");
  });

  it("refuses unknown verbs", () => {
    const state = buildWorld();
    const result = binder.bind("dance wildly", {
      commandId: "c7", actorId: "p1", roomId: "shrine", state,
    });
    expect(result.success).toBe(false);
    expect(result.refusal).toBe("INVALID_ACTION");
  });

  it("returns TARGET_NOT_FOUND for missing entities", () => {
    const state = buildWorld();
    const result = binder.bind("take sword", {
      commandId: "c8", actorId: "p1", roomId: "shrine", state,
    });
    expect(result.success).toBe(false);
    expect(result.refusal).toBe("TARGET_NOT_FOUND");
  });

  it("binds 'inventory' to INVENTORY", () => {
    const state = buildWorld();
    const result = binder.bind("inventory", {
      commandId: "c9", actorId: "p1", roomId: "shrine", state,
    });
    expect(result.success).toBe(true);
    expect(result.command?.action).toBe("INVENTORY");
  });

  it("binds 'look at brazier' to EXAMINE", () => {
    const state = buildWorld();
    const result = binder.bind("look at brazier", {
      commandId: "c10", actorId: "p1", roomId: "shrine", state,
    });
    expect(result.success).toBe(true);
    expect(result.command?.action).toBe("EXAMINE");
  });
});
