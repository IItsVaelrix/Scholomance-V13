/**
 * loadWorldpack — reads a worldpack directory into a WorldDefinition + catalogs.
 *
 * Application-layer concern (apps/server). Reads the authored JSON under
 * worldpacks/<name>/ and produces:
 *   - a WorldDefinition the kernel can turn into initial state
 *   - display catalogs (room prose/exits, entity names) used to enrich snapshots
 *
 * The kernel never reads the filesystem; this loader is the boundary that feeds it.
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { WorldDefinition, RoomDefinition, EntityDefinition } from "@polaris/world-kernel";

export interface RoomInfo {
  title: string;
  description: string;
  exits: Record<string, { direction: string; label: string }>;
  /** Authored illustration metadata (PDR §15) used to build scene hints. */
  illustration?: {
    backgroundAsset?: string;
    ambientEffects?: string[];
  };
}

export interface EntityInfo {
  displayName: string;
  description: string;
  /** Authored illustration metadata (PDR §15) used to build scene hints. */
  illustration?: {
    asset?: string;
    activatedAsset?: string;
    layerType?: string;
    position?: { x: number; y: number };
    interactable?: boolean;
    hotspotCommand?: string;
  };
}

export interface LoadedWorldpack {
  worldId: string;
  rulesetVersion: string;
  spawnRoomId: string;
  definition: WorldDefinition;
  roomCatalog: Record<string, RoomInfo>;
  entityCatalog: Record<string, EntityInfo>;
}

async function readJson<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as T;
}

/**
 * Flags must conform to the wire contract (FlagValueSchema: boolean|string|number).
 * Authored JSON may carry null/undefined "unset" markers or nested values; drop
 * anything non-conforming so kernel state — and therefore every scene.patch /
 * room.snapshot — always validates on the client. A single bad flag otherwise
 * quarantines the whole frame and silently blanks the scene (PDR §11.1, §13).
 */
function sanitizeFlags(flags: unknown): Record<string, boolean | string | number> {
  const out: Record<string, boolean | string | number> = {};
  if (flags === null || typeof flags !== "object") return out;
  for (const [key, value] of Object.entries(flags as Record<string, unknown>)) {
    if (typeof value === "boolean" || typeof value === "string" || typeof value === "number") {
      out[key] = value;
    }
  }
  return out;
}

/** Resolve the bundled demo world independently of npm's workspace cwd. */
export function resolveDefaultWorldpackDir(): string {
  return fileURLToPath(new URL("../../../worldpacks/shrine-demo", import.meta.url));
}

/**
 * Derive the command an interactable hotspot should submit (PDR §16.1).
 * Environmental objects expose their first activation as a verb
 * ("lit" → "light brazier"); portable objects map to "take <thing>".
 */
function deriveHotspotCommand(entity: any): string {
  const name = entity.definitionId ?? entity.entityId;
  if (entity.entityType === "environment") {
    const activation = Array.isArray(entity.activations) ? entity.activations[0] : undefined;
    const verb = activation === "lit" ? "light" : activation ?? "examine";
    return `${verb} ${name}`;
  }
  return `take ${name}`;
}

export async function loadWorldpack(dir: string): Promise<LoadedWorldpack> {
  const world = await readJson<{
    worldId: string;
    rulesetVersion: string;
    spawnRoomId: string;
    rooms: string[];
  }>(join(dir, "world.json"));

  const roomCatalog: Record<string, RoomInfo> = {};
  const rooms: RoomDefinition[] = [];

  for (const roomId of world.rooms) {
    const room = await readJson<any>(join(dir, "rooms", `${roomId}.json`));
    const exitIds: string[] = Array.isArray(room.exitIds)
      ? room.exitIds
      : Object.keys(room.exits ?? {});

    // Direction → destination roomId, authored via each room's `exits` map
    // (`{ <targetRoomId>: { direction, label } }`). Fed into runtime state so the
    // pure command binder/resolver can resolve "go west" → forest_path (PDR §6.3).
    const exitDirections: Record<string, string> = {};
    const exitsObj = (room.exits ?? {}) as Record<string, { direction?: unknown }>;
    for (const [targetRoomId, exit] of Object.entries(exitsObj)) {
      if (exit && typeof exit.direction === "string" && exit.direction.length > 0) {
        exitDirections[exit.direction] = targetRoomId;
      }
    }

    rooms.push({
      roomId: room.roomId,
      title: room.title,
      descriptionKey: room.descriptionKey ?? room.roomId,
      exitIds,
      exitDirections,
      flags: sanitizeFlags(room.flags),
    });

    roomCatalog[room.roomId] = {
      title: room.title,
      description: room.description ?? "",
      exits: room.exits ?? {},
      illustration: room.illustration
        ? {
            backgroundAsset: room.illustration.backgroundAsset,
            ambientEffects: room.illustration.ambientEffects,
          }
        : undefined,
    };
  }

  const entityCatalog: Record<string, EntityInfo> = {};
  const entities: EntityDefinition[] = [];

  const entityFiles = await readdir(join(dir, "entities"));
  for (const file of entityFiles) {
    if (!file.endsWith(".json")) continue;
    const entity = await readJson<any>(join(dir, "entities", file));
    entities.push({
      entityId: entity.entityId,
      entityType: entity.entityType,
      definitionId: entity.definitionId,
      roomId: entity.roomId,
      flags: sanitizeFlags(entity.flags),
    });
    entityCatalog[entity.entityId] = {
      displayName: entity.displayName ?? entity.definitionId,
      description: entity.description ?? "",
      illustration: {
        asset: entity.illustration?.asset,
        activatedAsset: entity.illustration?.activatedAsset,
        layerType: entity.illustration?.layerType,
        position: entity.illustration?.defaultPosition ?? entity.illustration?.position,
        interactable: entity.interactable === true,
        hotspotCommand: entity.interactable === true ? deriveHotspotCommand(entity) : undefined,
      },
    };
  }

  return {
    worldId: world.worldId,
    rulesetVersion: world.rulesetVersion,
    spawnRoomId: world.spawnRoomId,
    definition: {
      worldId: world.worldId,
      rulesetVersion: world.rulesetVersion,
      rooms,
      entities,
    },
    roomCatalog,
    entityCatalog,
  };
}
