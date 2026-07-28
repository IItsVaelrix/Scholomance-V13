/**
 * createInitialState — factory for building a WorldState from a worldpack definition.
 * Used at server startup and in tests.
 */

import type { WorldState, RoomState, EntityState } from "@polaris/contracts";

export interface WorldDefinition {
  worldId: string;
  rulesetVersion: string;
  rooms: RoomDefinition[];
  entities: EntityDefinition[];
}

export interface RoomDefinition {
  roomId: string;
  title: string;
  descriptionKey: string;
  exitIds: string[];
  /** Direction → destination roomId (e.g. `{ west: "forest_path" }`). */
  exitDirections?: Record<string, string>;
  flags?: Record<string, boolean | string | number>;
}

export interface EntityDefinition {
  entityId: string;
  entityType: "object" | "environment" | "character";
  definitionId: string;
  roomId: string;
  flags?: Record<string, boolean | string | number>;
}

export function createInitialState(def: WorldDefinition): WorldState {
  const rooms: Record<string, RoomState> = {};
  const entities: Record<string, EntityState> = {};

  for (const roomDef of def.rooms) {
    const roomState: RoomState = {
      roomId: roomDef.roomId,
      revision: 0,
      title: roomDef.title,
      descriptionKey: roomDef.descriptionKey,
      exitIds: roomDef.exitIds,
      occupantIds: [],
      entityIds: [],
      flags: roomDef.flags ?? {},
    };
    // Only carry the direction map when authored; absence means "no direction
    // exits" and keeps legacy fixtures byte-identical (schema field is optional).
    if (roomDef.exitDirections && Object.keys(roomDef.exitDirections).length > 0) {
      roomState.exitDirections = roomDef.exitDirections;
    }
    rooms[roomDef.roomId] = roomState;
  }

  for (const entityDef of def.entities) {
    entities[entityDef.entityId] = {
      entityId: entityDef.entityId,
      entityType: entityDef.entityType,
      definitionId: entityDef.definitionId,
      location: { type: "room", roomId: entityDef.roomId },
      flags: entityDef.flags ?? {},
    };
    // Register entity in its room
    const room = rooms[entityDef.roomId];
    if (room) {
      room.entityIds.push(entityDef.entityId);
    }
  }

  return {
    worldId: def.worldId,
    revision: 0,
    rulesetVersion: def.rulesetVersion,
    rooms,
    players: {},
    entities,
  };
}

/**
 * Register a player into the world state (called on connection / reconnection).
 *
 * A join refreshes PRESENCE; it must never destroy what a player is carrying.
 * If the player already exists (a reconnect, or a restart-restored record), we
 * preserve their inventoryIds so persistent causality holds (PDR §5.6) and the
 * lantern owner remains correct across reconnect + restart (PDR §24.13). A brand
 * new player starts with an empty inventory.
 */
export function registerPlayer(
  state: WorldState,
  playerId: string,
  displayName: string,
  spawnRoomId: string,
): WorldState {
  const next = structuredClone(state);
  const existing = next.players[playerId];
  next.players[playerId] = {
    playerId,
    displayName,
    roomId: spawnRoomId,
    inventoryIds: existing?.inventoryIds ?? [],
    connectionState: "connected",
  };
  const room = next.rooms[spawnRoomId];
  if (room && !room.occupantIds.includes(playerId)) {
    room.occupantIds.push(playerId);
  }
  return next;
}
