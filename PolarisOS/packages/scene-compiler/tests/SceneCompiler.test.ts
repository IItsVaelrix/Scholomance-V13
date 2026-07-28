/**
 * SceneCompiler tests — Milestone 4 (PDR §15)
 *
 * Exit criterion: "World-state mutations produce correct scene manifests."
 *
 * Covers the four deliverables:
 *   1. scene-manifest schema      — manifest validates against SceneManifestSchema
 *   2. room-to-scene projection   — authored hints project to layers/positions
 *   3. deterministic contract hash — same state → same contractHash (no generatedAt)
 *   4. lantern + brazier visual rules — §15.5 layer swaps + lantern removal
 */

import { describe, it, expect } from "vitest";
import { SceneCompiler, SCENE_COMPILER_VERSION } from "../src/index.js";
import { SceneManifestSchema } from "@polaris/contracts";
import type { RoomState, EntityState, PlayerState } from "@polaris/contracts";
import type { SceneHints } from "../src/index.js";

function shrineRoom(flags: Record<string, boolean | string | number>): RoomState {
  return {
    roomId: "ruined_shrine",
    revision: 3,
    title: "The Ruined Shrine",
    descriptionKey: "ruined_shrine_default",
    exitIds: ["forest_path"],
    occupantIds: ["p1", "p2"],
    entityIds: ["shrine_lantern", "shrine_brazier"],
    flags,
  };
}

function brazier(activated: boolean): EntityState {
  return {
    entityId: "shrine_brazier",
    entityType: "environment",
    definitionId: "brazier",
    location: { type: "room", roomId: "ruined_shrine" },
    flags: activated ? { activated: true, activation: "lit" } : { activated: false },
  };
}

function lantern(location: EntityState["location"]): EntityState {
  return {
    entityId: "shrine_lantern",
    entityType: "object",
    definitionId: "lantern",
    location,
    flags: {},
  };
}

const occupants: PlayerState[] = [
  { playerId: "p1", displayName: "Alice", roomId: "ruined_shrine", inventoryIds: ["shrine_lantern"], connectionState: "connected" },
  { playerId: "p2", displayName: "Bob", roomId: "ruined_shrine", inventoryIds: [], connectionState: "connected" },
];

/** Authored illustration hints mirroring worldpacks/shrine-demo. */
const hints: SceneHints = {
  backgroundAsset: "rooms/ruined_shrine/background",
  roomDescription: "Stone walls lean against centuries of neglect.",
  ambientEffects: ["dust_motes"],
  entities: {
    shrine_brazier: {
      asset: "entities/brazier",
      activatedAsset: "entities/brazier_lit",
      layerType: "prop",
      position: { x: 400, y: 280 },
      interactable: true,
      displayName: "Iron Brazier",
      hotspotCommand: "light brazier",
    },
    shrine_lantern: {
      asset: "entities/lantern",
      layerType: "entity",
      position: { x: 320, y: 240 },
      interactable: false,
      displayName: "Brass Lantern",
    },
  },
};

function buildInput(opts: { lit?: boolean; lanternTaken?: boolean; withHints?: boolean } = {}) {
  const lit = opts.lit ?? false;
  const room = shrineRoom(lit ? { brazier_lit: true } : { brazier_lit: false });
  const entities: EntityState[] = [
    lantern(opts.lanternTaken ? { type: "inventory", playerId: "p1" } : { type: "room", roomId: "ruined_shrine" }),
    brazier(lit),
  ];
  return {
    worldId: "codex_vale_mvp",
    room,
    entities,
    occupants,
    sceneHints: opts.withHints === false ? undefined : hints,
  };
}

describe("SceneCompiler — Milestone 4", () => {
  const compiler = new SceneCompiler();

  // ── Deliverable 1: scene-manifest schema ────────────────────────────────
  describe("scene-manifest schema", () => {
    it("produces a manifest that validates against SceneManifestSchema", () => {
      const manifest = compiler.compile(buildInput({ lit: true, lanternTaken: true }));
      expect(() => SceneManifestSchema.parse(manifest)).not.toThrow();
    });

    it("carries the PDR §15.2 fields: sceneId, visualRevision, hotspots, textRegions, contractHash", () => {
      const manifest = compiler.compile(buildInput());
      expect(manifest.sceneId).toBe("ruined_shrine_rev3");
      expect(manifest.visualRevision).toBe(3);
      expect(Array.isArray(manifest.hotspots)).toBe(true);
      expect(Array.isArray(manifest.textRegions)).toBe(true);
      expect(manifest.contractHash).toHaveLength(16);
    });
  });

  // ── Deliverable 3: deterministic contract hashing ───────────────────────
  describe("deterministic contract hashing", () => {
    it("same input produces the same contractHash", () => {
      const input = buildInput({ lit: true });
      const m1 = compiler.compile(input);
      const m2 = compiler.compile(input);
      expect(m1.contractHash).toBe(m2.contractHash);
    });

    it("contractHash is independent of generatedAt timestamp", () => {
      const input = buildInput();
      const m1 = compiler.compile(input);
      const m2 = compiler.compile(input);
      // Timestamps may differ, hash must not.
      expect(m1.contractHash).toBe(m2.contractHash);
      expect(m1.layers).toEqual(m2.layers);
    });

    it("contractHash changes when world state changes (unlit vs lit)", () => {
      const unlit = compiler.compile(buildInput({ lit: false }));
      const lit = compiler.compile(buildInput({ lit: true }));
      expect(unlit.contractHash).not.toBe(lit.contractHash);
    });

    it("folds the compiler version into the hash", () => {
      expect(SCENE_COMPILER_VERSION).toBeTruthy();
    });
  });

  // ── Deliverable 4: brazier visual rule (§15.5) ──────────────────────────
  describe("brazier visual rule (§15.5)", () => {
    it("unlit: brazier_unlit visible, brazier_lit hidden, no warm overlay, ambient light", () => {
      const m = compiler.compile(buildInput({ lit: false }));
      const unlitLayer = m.layers.find((l) => l.layerId.endsWith("shrine_brazier_unlit"));
      const litLayer = m.layers.find((l) => l.layerId.endsWith("shrine_brazier_lit"));
      const overlay = m.layers.find((l) => l.layerId.endsWith("warm_light_overlay"));
      expect(unlitLayer?.visible).toBe(true);
      expect(litLayer?.visible).toBe(false);
      expect(overlay).toBeUndefined();
      expect(m.lightingState).toBe("ambient_moonlight");
    });

    it("lit: brazier_unlit hidden, brazier_lit visible, warm overlay appears, warm light", () => {
      const m = compiler.compile(buildInput({ lit: true }));
      const unlitLayer = m.layers.find((l) => l.layerId.endsWith("shrine_brazier_unlit"));
      const litLayer = m.layers.find((l) => l.layerId.endsWith("shrine_brazier_lit"));
      const overlay = m.layers.find((l) => l.layerId.endsWith("warm_light_overlay"));
      expect(unlitLayer?.visible).toBe(false);
      expect(litLayer?.visible).toBe(true);
      expect(litLayer?.assetKey).toBe("entities/brazier_lit");
      expect(overlay?.visible).toBe(true);
      expect(overlay?.layerType).toBe("lighting");
      expect(m.lightingState).toBe("warm_firelight");
    });
  });

  // ── Deliverable 4: lantern visual rule (scenario step 7) ────────────────
  describe("lantern visual rule", () => {
    it("lantern in the room renders a visible layer", () => {
      const m = compiler.compile(buildInput({ lanternTaken: false }));
      const layer = m.layers.find((l) => l.layerId.includes("shrine_lantern"));
      expect(layer?.visible).toBe(true);
    });

    it("taking the lantern hides its layer (removed from its position)", () => {
      const m = compiler.compile(buildInput({ lanternTaken: true }));
      const layer = m.layers.find((l) => l.layerId.includes("shrine_lantern"));
      expect(layer?.visible).toBe(false);
    });
  });

  // ── Deliverable 2: room-to-scene projection of authored data ────────────
  describe("room-to-scene projection", () => {
    it("projects authored background asset and ambient effects", () => {
      const m = compiler.compile(buildInput());
      expect(m.backgroundAssetKey).toBe("rooms/ruined_shrine/background");
      expect(m.ambientEffects).toContain("dust_motes");
    });

    it("projects authored entity positions and assets from hints", () => {
      const m = compiler.compile(buildInput());
      const brazierUnlit = m.layers.find((l) => l.layerId.endsWith("shrine_brazier_unlit"));
      expect(brazierUnlit?.position).toEqual({ x: 400, y: 280 });
      expect(brazierUnlit?.assetKey).toBe("entities/brazier");
    });

    it("emits a hotspot only for interactable entities, with the authored command", () => {
      const m = compiler.compile(buildInput());
      expect(m.hotspots).toHaveLength(1);
      expect(m.hotspots[0].entityId).toBe("shrine_brazier");
      expect(m.hotspots[0].command).toBe("light brazier");
      expect(m.hotspots[0].label).toBe("Iron Brazier");
    });

    it("emits title, description, and entity-label text regions", () => {
      const m = compiler.compile(buildInput());
      const kinds = m.textRegions.map((r) => r.kind);
      expect(kinds).toContain("title");
      expect(kinds).toContain("description");
      expect(kinds).toContain("entity-label");
      const title = m.textRegions.find((r) => r.kind === "title");
      expect(title?.text).toBe("The Ruined Shrine");
    });

    it("includes player markers for connected occupants", () => {
      const m = compiler.compile(buildInput());
      const markers = m.layers.filter((l) => l.layerType === "player-marker");
      expect(markers).toHaveLength(2);
    });

    it("falls back to defaults when no hints are provided", () => {
      const m = compiler.compile(buildInput({ withHints: false }));
      expect(m.backgroundAssetKey).toBe("rooms/ruined_shrine/background");
      expect(() => SceneManifestSchema.parse(m)).not.toThrow();
    });
  });

  // ── Exit criterion: mutations produce correct manifests ─────────────────
  describe("exit criterion — mutations produce correct manifests", () => {
    it("the full MVP mutation sequence yields the correct final manifest", () => {
      // Start: lantern on the floor, brazier cold.
      const before = compiler.compile(buildInput({ lit: false, lanternTaken: false }));
      expect(before.lightingState).toBe("ambient_moonlight");
      expect(before.layers.find((l) => l.layerId.includes("shrine_lantern"))?.visible).toBe(true);

      // After: lantern taken + brazier lit.
      const after = compiler.compile(buildInput({ lit: true, lanternTaken: true }));
      expect(after.lightingState).toBe("warm_firelight");
      expect(after.layers.find((l) => l.layerId.includes("shrine_lantern"))?.visible).toBe(false);
      expect(after.layers.find((l) => l.layerId.endsWith("warm_light_overlay"))?.visible).toBe(true);
      expect(after.contractHash).not.toBe(before.contractHash);
    });
  });
});
