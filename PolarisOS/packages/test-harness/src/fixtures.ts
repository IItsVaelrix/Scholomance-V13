/**
 * Test fixtures — pre-built world states for the shrine-demo scenario.
 */

import type { WorldState, BoundCommand } from "@polaris/contracts";
import { createInitialState, registerPlayer } from "@polaris/world-kernel";
import type { WorldDefinition } from "@polaris/world-kernel";

/**
 * Build the MVP shrine-demo world with two players in the ruined shrine.
 */
export function buildShrineDemoWorld(): { state: WorldState; definition: WorldDefinition } {
  const definition: WorldDefinition = {
    worldId: "codex_vale_mvp",
    rulesetVersion: "mvp-1",
    rooms: [
      {
        roomId: "forest_path",
        title: "The Forest Path",
        descriptionKey: "forest_path_default",
        exitIds: ["ruined_shrine", "moonlit_clearing"],
        flags: { weather: "rain" },
      },
      {
        roomId: "ruined_shrine",
        title: "The Ruined Shrine",
        descriptionKey: "ruined_shrine_default",
        exitIds: ["forest_path", "moonlit_clearing"],
        flags: { brazier_lit: false },
      },
      {
        roomId: "moonlit_clearing",
        title: "The Moonlit Clearing",
        descriptionKey: "moonlit_clearing_default",
        exitIds: ["forest_path", "ruined_shrine"],
        flags: {},
      },
    ],
    entities: [
      {
        entityId: "shrine_lantern",
        entityType: "object",
        definitionId: "lantern",
        roomId: "ruined_shrine",
        flags: { lit: false },
      },
      {
        entityId: "shrine_brazier",
        entityType: "environment",
        definitionId: "brazier",
        roomId: "ruined_shrine",
        flags: { activated: false },
      },
      {
        entityId: "broken_altar",
        entityType: "environment",
        definitionId: "altar",
        roomId: "ruined_shrine",
        flags: {},
      },
      {
        entityId: "fallen_sign",
        entityType: "environment",
        definitionId: "sign",
        roomId: "forest_path",
        flags: {},
      },
      {
        entityId: "stone_well",
        entityType: "environment",
        definitionId: "well",
        roomId: "moonlit_clearing",
        flags: {},
      },
    ],
  };

  let state = createInitialState(definition);
  state = registerPlayer(state, "player_01", "Vaelrix", "ruined_shrine");
  state = registerPlayer(state, "player_02", "Maren", "ruined_shrine");

  return { state, definition };
}

/**
 * Simulate the lantern race: both players try to take the lantern.
 * Returns the commands in submission order.
 */
export function simulateLanternRace(): { cmd1: BoundCommand; cmd2: BoundCommand } {
  const cmd1: BoundCommand = {
    commandId: "cmd_001",
    actorId: "player_01",
    roomId: "ruined_shrine",
    action: "TAKE",
    targetIds: ["shrine_lantern"],
    arguments: {},
    evidence: [{ source: "test", confidence: 1.0 }],
  };

  const cmd2: BoundCommand = {
    commandId: "cmd_002",
    actorId: "player_02",
    roomId: "ruined_shrine",
    action: "TAKE",
    targetIds: ["shrine_lantern"],
    arguments: {},
    evidence: [{ source: "test", confidence: 1.0 }],
  };

  return { cmd1, cmd2 };
}
