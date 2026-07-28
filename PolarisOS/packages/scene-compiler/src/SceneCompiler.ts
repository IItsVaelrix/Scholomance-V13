/**
 * SceneCompiler — deterministic room state → SceneManifest projection.
 *
 * Milestone 4 (PDR §15). Given authoritative room state + its entities +
 * occupants (+ optional authored illustration hints), produces a SceneManifest
 * with layered visual instructions, interactable hotspots, and text regions.
 *
 * Guarantees (§15.4): the same room state and compiler version always produce
 * the same layer ordering, asset references, hotspot list, visual state, and
 * contractHash. `generatedAt` is the only non-deterministic field and is
 * excluded from the hash.
 *
 * MVP visual rules (§15.5, scenario steps 6–10):
 *   - Brazier: an environmental entity authored with an `activatedAsset` splits
 *     into mutually-exclusive `<id>_unlit` / `<id>_lit` layers. When lit, the
 *     unlit layer hides, the lit layer shows, and a `warm_light_overlay`
 *     lighting layer appears; lightingState becomes `warm_firelight`.
 *   - Lantern: a portable object renders only while located in the room. Taking
 *     it moves it to inventory, hiding its layer (removed from its position).
 */

import type {
  RoomState,
  EntityState,
  PlayerState,
  SceneManifest,
  SceneLayer,
  SceneLayerType,
  SceneHotspot,
  SceneTextRegion,
} from "@polaris/contracts";
import { createHash } from "crypto";

/** Compiler version folded into the contractHash (§15.4). */
export const SCENE_COMPILER_VERSION = "mvp-1-scene-1";

/** Authored illustration metadata for a single entity (from the worldpack). */
export interface EntityIllustrationHint {
  asset?: string;
  activatedAsset?: string;
  layerType?: SceneLayerType;
  position?: { x: number; y: number };
  interactable?: boolean;
  displayName?: string;
  /** Suggested hotspot command; derived from the entity when omitted. */
  hotspotCommand?: string;
}

/** Optional authored illustration metadata fed by the application layer. */
export interface SceneHints {
  backgroundAsset?: string;
  roomDescription?: string;
  ambientEffects?: string[];
  entities?: Record<string, EntityIllustrationHint>;
}

export interface SceneCompileInput {
  worldId: string;
  room: RoomState;
  entities: EntityState[];
  occupants: PlayerState[];
  sceneHints?: SceneHints;
}

const DEFAULT_HOTSPOT_SIZE = { w: 96, h: 96 };

type LayerFlagValue = boolean | string | number;

/**
 * Scene-layer flags must be boolean|string|number (SceneLayerSchema). Source
 * entity flags may carry null/undefined "unset" markers (e.g. `activation: null`)
 * which carry no visual meaning — drop them so the manifest stays schema-valid.
 */
function cleanFlags(flags: Record<string, unknown>): Record<string, LayerFlagValue> {
  const out: Record<string, LayerFlagValue> = {};
  for (const [key, value] of Object.entries(flags)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "boolean" || typeof value === "string" || typeof value === "number") {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Layer flags = the entity's authoritative visual flags plus the authored
 * `displayName`, so a renderer can label its sprite (and fallback text) with a
 * human-readable name. This mirrors the player-marker layer, which already
 * carries `{ displayName }`. Adding the display name does NOT affect the
 * contractHash — flags are deliberately excluded from the hash inputs (§15.4),
 * so this enrichment is backward-compatible with the Milestone 4 visual contract.
 */
function layerFlags(entity: EntityState, hint?: EntityIllustrationHint): Record<string, LayerFlagValue> {
  const flags = cleanFlags(entity.flags);
  if (hint?.displayName) flags.displayName = hint.displayName;
  return flags;
}

export class SceneCompiler {
  /**
   * Compile room state into a deterministic scene manifest.
   */
  compile(input: SceneCompileInput): SceneManifest {
    const { worldId, room, entities, occupants, sceneHints } = input;
    const hints = sceneHints ?? {};
    const layers: SceneLayer[] = [];

    // --- Background layer ---
    const backgroundAssetKey = hints.backgroundAsset ?? `rooms/${room.roomId}/background`;
    layers.push({
      layerId: `${room.roomId}_bg`,
      layerType: "background",
      assetKey: backgroundAssetKey,
      position: { x: 0, y: 0 },
      zIndex: 0,
      visible: true,
      flags: {},
    });

    // --- Entity layers (sorted by entityId for determinism) ---
    const sortedEntities = [...entities].sort((a, b) => a.entityId.localeCompare(b.entityId));
    let warmLightEmitted = false;
    for (const entity of sortedEntities) {
      const inRoom = entity.location.type === "room" && entity.location.roomId === room.roomId;
      const hint = hints.entities?.[entity.entityId];
      const activated = this.isActivated(entity);

      if (hint?.activatedAsset) {
        // §15.5 split layer: unlit / lit are mutually exclusive.
        const position = hint.position ?? { x: 0, y: 0 };
        const layerType: SceneLayerType = hint.layerType ?? "prop";
        layers.push({
          layerId: `${room.roomId}_entity_${entity.entityId}_unlit`,
          layerType,
          assetKey: hint.asset ?? `entities/${entity.definitionId}`,
          position,
          zIndex: 10,
          visible: inRoom && !activated,
          flags: layerFlags(entity, hint),
        });
        layers.push({
          layerId: `${room.roomId}_entity_${entity.entityId}_lit`,
          layerType,
          assetKey: hint.activatedAsset,
          position,
          zIndex: 11,
          visible: inRoom && activated,
          flags: layerFlags(entity, hint),
        });
        if (inRoom && activated && !warmLightEmitted) {
          layers.push(this.warmLightOverlay(room.roomId));
          warmLightEmitted = true;
        }
      } else {
        layers.push({
          layerId: `${room.roomId}_entity_${entity.entityId}`,
          layerType: hint?.layerType ?? (entity.entityType === "environment" ? "prop" : "entity"),
          assetKey: hint?.asset ?? `entities/${entity.definitionId}`,
          position: hint?.position ?? { x: 0, y: 0 },
          zIndex: 10,
          visible: inRoom,
          flags: layerFlags(entity, hint),
        });
      }
    }

    // --- Player markers (sorted by playerId for determinism) ---
    const sortedOccupants = [...occupants].sort((a, b) => a.playerId.localeCompare(b.playerId));
    for (const player of sortedOccupants) {
      layers.push({
        layerId: `${room.roomId}_player_${player.playerId}`,
        layerType: "player-marker",
        assetKey: `players/marker_default`,
        position: { x: 0, y: 0 },
        zIndex: 20,
        visible: player.connectionState === "connected",
        flags: { displayName: player.displayName },
      });
    }

    const lightingState = this.deriveLighting(room, sortedEntities);
    const ambientEffects = this.deriveEffects(room, hints);
    const hotspots = this.deriveHotspots(room, sortedEntities, hints);
    const textRegions = this.deriveTextRegions(room, sortedEntities, hints);

    // visualRevision tracks roomRevision: the manifest is a pure projection of
    // room state, so the visual contract changes exactly when the room does.
    const visualRevision = room.revision;

    const contractHash = this.computeContractHash({
      roomId: room.roomId,
      roomRevision: room.revision,
      backgroundAssetKey,
      layers,
      hotspots,
      textRegions,
      lightingState,
      ambientEffects,
      flags: room.flags,
    });

    return {
      sceneId: `${room.roomId}_rev${room.revision}`,
      roomId: room.roomId,
      roomRevision: room.revision,
      visualRevision,
      worldId,
      backgroundAssetKey,
      layers,
      hotspots,
      textRegions,
      lightingState,
      ambientEffects,
      contractHash,
      generatedAt: new Date().toISOString(),
    };
  }

  // --- Visual rules -------------------------------------------------------

  private warmLightOverlay(roomId: string): SceneLayer {
    return {
      layerId: `${roomId}_warm_light_overlay`,
      layerType: "lighting",
      assetKey: `rooms/${roomId}/lit_overlay`,
      position: { x: 0, y: 0 },
      zIndex: 30,
      visible: true,
      flags: { source: "brazier" },
    };
  }

  private isActivated(entity: EntityState): boolean {
    return entity.flags.activated === true || entity.flags.activation === "lit";
  }

  private deriveLighting(room: RoomState, entities: EntityState[]): string {
    for (const [key, value] of Object.entries(room.flags)) {
      if (key.endsWith("_lit") && value === true) return "warm_firelight";
    }
    if (entities.some((e) => e.entityType === "environment" && this.isActivated(e))) {
      return "warm_firelight";
    }
    return "ambient_moonlight";
  }

  private deriveEffects(room: RoomState, hints: SceneHints): string[] {
    const effects = new Set<string>(hints.ambientEffects ?? []);
    for (const [key, value] of Object.entries(room.flags)) {
      if (value === true && key.startsWith("fx_")) effects.add(key.slice(3));
    }
    return [...effects].sort();
  }

  private deriveHotspots(room: RoomState, entities: EntityState[], hints: SceneHints): SceneHotspot[] {
    const hotspots: SceneHotspot[] = [];
    for (const entity of entities) {
      const inRoom = entity.location.type === "room" && entity.location.roomId === room.roomId;
      if (!inRoom) continue;
      const hint = hints.entities?.[entity.entityId];
      const interactable = hint?.interactable ?? entity.entityType !== "character";
      if (!interactable) continue;

      const position = hint?.position ?? { x: 0, y: 0 };
      hotspots.push({
        hotspotId: `${room.roomId}_hotspot_${entity.entityId}`,
        entityId: entity.entityId,
        label: hint?.displayName ?? entity.definitionId,
        command: hint?.hotspotCommand ?? this.deriveCommand(entity),
        region: {
          x: position.x - DEFAULT_HOTSPOT_SIZE.w / 2,
          y: position.y - DEFAULT_HOTSPOT_SIZE.h / 2,
          w: DEFAULT_HOTSPOT_SIZE.w,
          h: DEFAULT_HOTSPOT_SIZE.h,
        },
        visible: true,
      });
    }
    return hotspots.sort((a, b) => a.hotspotId.localeCompare(b.hotspotId));
  }

  private deriveCommand(entity: EntityState): string {
    if (entity.entityType === "environment") {
      const activation = Array.isArray((entity as any).activations)
        ? (entity as any).activations[0]
        : "lit";
      return `${activation ?? "light"} ${entity.definitionId}`;
    }
    return `take ${entity.definitionId}`;
  }

  private deriveTextRegions(room: RoomState, entities: EntityState[], hints: SceneHints): SceneTextRegion[] {
    const regions: SceneTextRegion[] = [
      {
        regionId: `${room.roomId}_title`,
        kind: "title",
        anchor: { x: 24, y: 24 },
        width: 640,
        text: room.title,
      },
      {
        regionId: `${room.roomId}_description`,
        kind: "description",
        anchor: { x: 24, y: 64 },
        width: 640,
        text: hints.roomDescription ?? "",
      },
    ];

    for (const entity of entities) {
      const inRoom = entity.location.type === "room" && entity.location.roomId === room.roomId;
      if (!inRoom) continue;
      const hint = hints.entities?.[entity.entityId];
      const position = hint?.position ?? { x: 0, y: 0 };
      regions.push({
        regionId: `${room.roomId}_label_${entity.entityId}`,
        kind: "entity-label",
        anchor: { x: position.x, y: position.y + 48 },
        width: 160,
        text: hint?.displayName ?? entity.definitionId,
      });
    }

    return regions.sort((a, b) => a.regionId.localeCompare(b.regionId));
  }

  // --- Deterministic contract hash (§15.4) --------------------------------

  private computeContractHash(parts: {
    roomId: string;
    roomRevision: number;
    backgroundAssetKey: string;
    layers: SceneLayer[];
    hotspots: SceneHotspot[];
    textRegions: SceneTextRegion[];
    lightingState: string;
    ambientEffects: string[];
    flags: Record<string, boolean | string | number>;
  }): string {
    const content = JSON.stringify({
      compiler: SCENE_COMPILER_VERSION,
      roomId: parts.roomId,
      roomRevision: parts.roomRevision,
      backgroundAssetKey: parts.backgroundAssetKey,
      flags: sortRecord(parts.flags),
      layers: parts.layers.map((l) => ({
        id: l.layerId,
        type: l.layerType,
        asset: l.assetKey,
        x: l.position.x,
        y: l.position.y,
        z: l.zIndex,
        visible: l.visible,
      })),
      hotspots: parts.hotspots.map((h) => ({
        id: h.hotspotId,
        entity: h.entityId,
        command: h.command,
        visible: h.visible,
      })),
      textRegions: parts.textRegions.map((t) => ({ id: t.regionId, kind: t.kind, text: t.text })),
      lighting: parts.lightingState,
      effects: [...parts.ambientEffects].sort(),
    });
    return createHash("sha256").update(content).digest("hex").slice(0, 16);
  }
}

function sortRecord(record: Record<string, boolean | string | number>): Record<string, boolean | string | number> {
  const sorted: Record<string, boolean | string | number> = {};
  for (const key of Object.keys(record).sort()) sorted[key] = record[key];
  return sorted;
}
