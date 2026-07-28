/**
 * SnapshotBuilder — composes a full room.snapshot message from authoritative state.
 *
 * Milestone 3 deliverable: "snapshots and incremental events". A snapshot is the
 * complete projection a client needs to (re)render a room: the room state, the
 * entities visible there (room + occupants' inventories), the occupants, and a
 * deterministic SceneManifest. Display-only catalogs (prose, names) are attached
 * as non-authoritative convenience fields.
 */

import type { WorldState, RoomSnapshot, RevisionEnvelope, EntityState, PlayerState, RoomState, SceneLayerType } from "@polaris/contracts";
import type { SceneCompiler, SceneHints, EntityIllustrationHint } from "@polaris/scene-compiler";
import type { RoomInfo, EntityInfo } from "./loadWorldpack.js";

export interface SnapshotDeps {
  sceneCompiler: SceneCompiler;
  roomCatalog: Record<string, RoomInfo>;
  entityCatalog: Record<string, EntityInfo>;
}

export type RichRoomSnapshot = RoomSnapshot & {
  roomInfo?: RoomInfo;
  entityInfo?: Record<string, EntityInfo>;
};

export function buildRoomSnapshot(
  worldId: string,
  roomId: string,
  state: WorldState,
  sequence: number,
  deps: SnapshotDeps,
): RichRoomSnapshot {
  const room = state.rooms[roomId];

  const occupants: PlayerState[] = room
    ? room.occupantIds
        .map((id) => state.players[id])
        .filter((p): p is PlayerState => Boolean(p))
    : [];

  // Entities physically in the room (these feed the scene compiler).
  const roomEntities: EntityState[] = room
    ? room.entityIds
        .map((id) => state.entities[id])
        .filter((e): e is EntityState => Boolean(e))
    : [];

  // Visible entities = room entities + anything an occupant is carrying,
  // so the client can render both the scene and inventory panels.
  const visibleEntities = collectVisibleEntities(state, room, occupants);

  const sceneManifest = room
    ? deps.sceneCompiler.compile({
        worldId,
        room,
        entities: roomEntities,
        occupants,
        sceneHints: buildSceneHints(roomId, roomEntities, deps),
      })
    : null;

  const envelope: RevisionEnvelope = {
    worldId,
    roomId,
    sequence,
    roomRevision: room?.revision ?? 0,
  };

  return {
    type: "room.snapshot",
    envelope,
    room: room ?? null,
    entities: visibleEntities,
    players: occupants,
    sceneManifest,
    roomInfo: deps.roomCatalog[roomId],
    entityInfo: deps.entityCatalog,
  };
}

/**
 * Collect the entities a client can see for a room: everything physically in
 * the room plus anything an occupant is carrying (so inventory panels render).
 * Deterministic order (sorted by entityId). Shared by the initial snapshot and
 * the incremental scene.patch so both project identical panel state.
 */
export function collectVisibleEntities(
  state: WorldState,
  room: RoomState | undefined,
  occupants: PlayerState[],
): EntityState[] {
  const visibleIds = new Set<string>(room?.entityIds ?? []);
  for (const player of occupants) {
    for (const id of player.inventoryIds) visibleIds.add(id);
  }
  return [...visibleIds]
    .map((id) => state.entities[id])
    .filter((e): e is EntityState => Boolean(e))
    .sort((a, b) => a.entityId.localeCompare(b.entityId));
}

/**
 * Assemble authored illustration hints (PDR §15) from the display catalogs so
 * the scene compiler can project faithful asset keys, positions, hotspots, and
 * text regions. Hints are static worldpack data — they never carry authority.
 */
export function buildSceneHints(roomId: string, roomEntities: EntityState[], deps: SnapshotDeps): SceneHints {
  const roomInfo = deps.roomCatalog[roomId];
  const entities: Record<string, EntityIllustrationHint> = {};

  for (const entity of roomEntities) {
    const info = deps.entityCatalog[entity.entityId];
    const ill = info?.illustration;
    if (!ill) continue;
    entities[entity.entityId] = {
      asset: ill.asset,
      activatedAsset: ill.activatedAsset,
      layerType: ill.layerType as SceneLayerType | undefined,
      position: ill.position,
      interactable: ill.interactable,
      displayName: info?.displayName,
      hotspotCommand: ill.hotspotCommand,
    };
  }

  return {
    backgroundAsset: roomInfo?.illustration?.backgroundAsset,
    roomDescription: roomInfo?.description,
    ambientEffects: roomInfo?.illustration?.ambientEffects,
    entities,
  };
}
