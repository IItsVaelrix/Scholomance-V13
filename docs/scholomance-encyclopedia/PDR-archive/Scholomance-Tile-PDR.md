# PDR: Scholomance Procedural Tile Forge v2

**Feature:** Deterministic Microprocessor-Based Tile and Map Forge
**Core Stack:** Geometry AMP → Tile Microprocessors → Fibonacci Processor → Volume AMP → Symmetry AMP → Perlin/Noise → Biome/Material AMP → Prop Scatter → TurboQuant Memory → QBIT Snap Validation → Human Curation
**Date:** 2026-07-06
**Status:** Revised PDR
**Primary Goal:** Build a procedural tile and map-piece authoring system that generates reusable isometric chunks, remembers their layered generation state, supports deterministic snapping through QBIT lattice metadata, and allows human curation instead of fully automatic world generation.

---

# Section 1: Product Design Record

## 1. Summary

This PDR defines the **Scholomance Procedural Tile Forge v2**, a deterministic authoring pipeline for generating isometric tile chunks, cave pieces, floating islands, biome transitions, arenas, terrain fragments, and reusable map components.

The system is **not** intended to produce an infinite procedural game world.

It is intended to produce **curatable procedural map pieces**.

The revised architecture uses four critical solutions:

```txt
1. TurboQuant memory cells preserve layered generation state.
2. QBIT lattice cells store biome, socket, elevation, and snap metadata.
3. Each generation concern is split into separate microprocessors.
4. Cave occlusion is solved through transparent ceiling layers instead of complex isometric raycasting.
```

The design goal is controlled procedural abundance:

```txt
Generate many strong candidates.
Lock the good layers.
Reroll the weak layers.
Snap pieces together deterministically.
Move pieces by hand.
Promote the best chunks into final maps.
```

The engine should behave like a **procedural forge**, not a slot machine.

---

## 2. Core Philosophy

The Tile Forge must preserve authorship.

The system should not say:

```txt
Here is your randomly generated world. Good luck.
```

It should say:

```txt
Here are 50 valid void ice island chunks.
This one has excellent seams.
This one has strong silhouette.
This one has bad walkability.
This one can snap to your cave entrance.
Choose, lock, reroll, move, promote.
```

The correct mental model is:

```txt
Procedural generation creates raw material.
Human curation creates the final world.
```

---

## 3. Problem Statement

Handmade tiles are beautiful but expensive. Full procedural generation is fast but often ugly, incoherent, and hostile to level design.

Scholomance needs a hybrid system:

```txt
Fast enough to generate many map pieces.
Structured enough to produce valid gameplay.
Deterministic enough to debug.
Flexible enough to curate.
Modular enough to extend.
Memory-backed enough to preserve good generations.
```

The main risks in procedural map generation are:

```txt
- seam mismatch
- broken walkability
- material bleeding
- noise soup
- lost good generations
- monolithic code
- cave occlusion complexity
- impossible regeneration
- untestable randomness
- loss of handcrafted identity
```

This PDR resolves those risks through QBIT, TurboQuant, layered processors, and curation-first architecture.

---

## 4. Design Classification

**Change Type:** Architectural + Structural + Behavioral

### Architectural

Adds a new deterministic procedural tile forge built from composable microprocessors.

### Structural

Adds canonical schemas for tile chunks, QBIT snap profiles, memory snapshots, processor outputs, and curation state.

### Behavioral

Allows procedural generation, selective regeneration, layer locking, biome-aware snapping, map-piece assembly, cave transparency, and promotion into canonical map assets.

### Cosmetic

Produces visible tile and map art, but the feature is not merely cosmetic. It is production infrastructure.

---

## 5. Assumptions

1. PixelBrain uses deterministic lattice-based asset data.
2. QBIT lattice cells can store metadata beyond simple visual color.
3. TurboQuant memory cells can store compressed or indexed generation state.
4. Geometry AMP already handles at least some geometric region logic.
5. Symmetry AMP, Volume AMP, and Fibonacci processors either exist or can be implemented as modular stages.
6. Perlin/noise generation must be seeded and deterministic.
7. Maps are assembled map-by-map, not generated as infinite runtime terrain.
8. The first implementation target is likely **80×45 isometric tiles**.
9. Caves can be represented as layered tile groups.
10. Human curation is required for final map quality.

---

## 6. Non-Goals

The system should not attempt to:

```txt
- generate the entire game world automatically
- replace handcrafted map design
- use runtime randomness for canonical assets
- allow Math.random() or time-based generation
- make Geometry AMP responsible for materials, props, lore, and export
- put all procedural logic into one giant generate() function
- solve cave occlusion with expensive 3D raycasting in the MVP
- use biome names alone as snapping truth
- export rendered images as the canonical source
- allow good generated chunks to vanish without memory provenance
```

---

## 7. Revised High-Level Pipeline

```txt
TileIntent
  ↓
TileForgePipeline
  ↓
Geometry Microprocessor
  ↓
Iso Tile Microprocessor
  ↓
Tile Socket Microprocessor
  ↓
Fibonacci Field Microprocessor
  ↓
Volume Microprocessor
  ↓
Symmetry Microprocessor
  ↓
Masked Noise / Perlin Microprocessor
  ↓
Biome Material Microprocessor
  ↓
Prop Scatter Microprocessor
  ↓
QBIT Snap Validation
  ↓
TurboQuant Memory Snapshot
  ↓
Human Curation Layer
  ↓
PixelBrain Packet Export
```

This pipeline should be preset-driven, not permanently fixed.

Different map pieces need different stage ordering.

---

## 8. Key Architectural Decisions

## 8.1 TurboQuant Memory Cells Are Required

TurboQuant solves the problem of generation memory, layer locking, reroll history, and curation recovery.

Each generated chunk should preserve enough state to answer:

```txt
What seed made this?
Which processors touched it?
Which layers are locked?
Which layers can be rerolled?
Which version of the processor created this?
What previous attempts existed?
Was this promoted, rejected, or hand-edited?
```

TurboQuant is not merely storage. It is **procedural memory discipline**.

---

## 8.2 QBIT Lattice Cells Store Snap Metadata

Each relevant lattice cell should carry structured identity:

```txt
biomeId
materialFamily
socketType
elevationClass
transitionType
walkable
regionId
edgeId
connector status
```

This turns seam validation from a complex visual/geometric problem into a deterministic cell contract problem.

Instead of asking:

```txt
Do these generated shapes look like they connect?
```

The engine asks:

```txt
Do these edge-cell snap profiles match or have an allowed compatibility rule?
```

This is much cheaper, cleaner, and more reliable.

---

## 8.3 The Forge Must Be Split Into Microprocessors

The Tile Forge must not become a monolith.

Each processor should do one job:

```txt
Geometry creates regions.
Tile processor creates tile structure.
Socket processor creates connection contracts.
Fibonacci creates organic seed fields.
Volume creates height and mass.
Symmetry stabilizes structure.
Noise creates natural variation.
Biome maps regions to materials.
Props consume anchors.
Validation checks legality.
Exporter emits canonical packets.
```

This makes selective regeneration possible.

Example:

```txt
Lock geometry.
Keep volume.
Reroll noise.
Reroll props.
Preserve biome.
Export again.
```

That workflow only works if the processors are decoupled.

---

## 8.4 Cave Ceilings Use Transparency Layers

Caves should not require full isometric occlusion logic in the first implementation.

A cave should be represented with layered regions:

```txt
cave_floor
cave_walls
cave_ceiling
cave_occluders
cave_lighting_zone
```

When the player enters a cave trigger, the ceiling layer fades or hides.

Important constraint:

```txt
Lighting should remain stable enough that the transparency trick feels intentional.
```

This avoids a huge class of 2D-isometric projection problems.

---

# 9. Core Pipeline Responsibilities

## 9.1 Tile Intent

Input object describing what to generate.

Example:

```js
const intent = {
  id: "void_ice_chunk_001",
  seed: "scholo_seed_001",
  preset: "organicVoidIsland",
  projection: "isometric",
  tileSize: { width: 80, height: 45 },
  chunkType: "floating_island",
  biomeId: "void_ice",
  elevation: 3,
  symmetryMode: "soft",
  caveMode: false,

  noise: {
    enabled: true,
    scale: 0.12,
    intensity: 0.35
  },

  fibonacci: {
    enabled: true,
    count: 24,
    mode: "decorative_growth"
  }
};
```

---

## 9.2 Geometry Microprocessor

Owns base shapes and regions.

Responsibilities:

```txt
- diamond footprint
- bounds
- primitive regions
- projection geometry
- base masks
- anchor points
- rough region partitioning
```

Does not own:

```txt
- final materials
- prop placement
- biome semantics
- render effects
- cave visibility behavior
```

---

## 9.3 Iso Tile Microprocessor

Turns raw geometry into tile-specific structure.

Responsibilities:

```txt
- top plane
- side planes
- rim cells
- corner masks
- edge masks
- walkable candidates
- local tile coordinates
- visible cell groups
```

Recommended name:

```txt
IsoTileGeometryMicroprocessor
```

---

## 9.4 Tile Socket Microprocessor

Creates deterministic connection data.

Responsibilities:

```txt
- north/east/south/west sockets
- edge cell snap profiles
- elevation matching data
- biome compatibility data
- transition type metadata
- walkability continuity markers
```

This is where QBIT lattice memory becomes powerful.

Socket data must not be visual-only. It must be gameplay-aware.

---

## 9.5 Fibonacci Field Microprocessor

Creates organic distribution fields.

Good uses:

```txt
- crystal growth
- moss clumps
- corruption veins
- rune placement
- grass clusters
- magical residue
- fracture rhythm
```

Bad uses:

```txt
- core walkability
- required bridge connection
- strict collision boundaries
- map-critical exits
```

Fibonacci should enhance the tile, not decide whether the player survives crossing it.

---

## 9.6 Volume Microprocessor

Adds height and mass.

Responsibilities:

```txt
- height map
- tile thickness
- cliff faces
- overhang hints
- cavities
- raised platforms
- floating island undersides
- cave interior volumes
```

For cave pieces, Volume Microprocessor should emit cave-related regions:

```txt
interiorVolume
ceilingLayer
wallLayer
floorLayer
occlusionTriggers
```

---

## 9.7 Symmetry Microprocessor

Applies structural balance.

Modes:

```txt
none
soft
edgeOnly
socketOnly
bilateralX
bilateralY
radial
architectural
ritual
```

Use hard symmetry for:

```txt
- boss arenas
- temples
- bridges
- stairs
- ritual platforms
```

Use soft or no symmetry for:

```txt
- caves
- forests
- ruins
- erosion
- corruption
- natural terrain
```

---

## 9.8 Masked Noise / Perlin Microprocessor

Adds natural variation inside valid masks.

Responsibilities:

```txt
- snow patches
- ice grain
- grass variation
- cliff erosion
- dirt wear
- fog density
- corruption spread
- surface roughness
```

Noise must be masked.

Correct:

```txt
Apply Perlin inside topPlane only.
Apply erosion noise along sidePlane only.
Apply corruption noise inside allowed biome transition cells only.
```

Incorrect:

```txt
Apply global noise to every cell and hope it becomes art.
```

---

## 9.9 Biome Material Microprocessor

Maps validated regions to materials.

Responsibilities:

```txt
- assign biome material IDs
- assign palette values
- resolve top/side/rim/crack/cavity materials
- handle transition compatibility
- prevent material bleeding
```

Example material assignment:

```js
{
  topPlane: "void_ice_top",
  sidePlane: "obsidian_side",
  rim: "cyan_frost_rim",
  cracks: "deep_void_purple",
  underside: "blackglass_cavity"
}
```

---

## 9.10 Prop Scatter Microprocessor

Places decorative and interactive objects.

Responsibilities:

```txt
- crystals
- trees
- rocks
- obelisks
- loot chests
- rune stones
- grass tufts
- cave props
- enemy spawn hints
- spell anchors
```

Props must consume anchors and walkability data.

Props should not block required paths unless the prop is explicitly marked as a blocker.

---

## 9.11 QBIT Snap Validation

Validates edge compatibility through QBIT cell metadata.

Responsibilities:

```txt
- compare edge lengths
- compare socket profiles
- check biome compatibility
- check elevation compatibility
- check walkability continuation
- check transition rules
- detect seam conflicts
```

This should happen after core generation and before promotion.

---

## 9.12 TurboQuant Memory Snapshot

Stores generation provenance and layer state.

Responsibilities:

```txt
- store processor hashes
- store layer output hashes
- store locked/unlocked state
- store reroll history
- store promoted/rejected state
- allow selective regeneration
- allow rollback
```

This makes the forge usable as an editor.

---

## 9.13 Human Curation Layer

Allows the developer to turn generated output into handcrafted maps.

Required operations:

```txt
- lock geometry
- lock volume
- lock materials
- lock props
- reroll noise
- reroll props
- reroll biome
- move chunk
- mirror chunk
- duplicate chunk
- promote candidate
- reject candidate
- annotate candidate
- add chunk to map
```

This layer is not optional. It is the difference between a toy generator and a production tool.

---

## 9.14 Export Layer

Exports deterministic PixelBrain-compatible packets.

Responsibilities:

```txt
- lattice cells
- QBIT metadata
- material assignments
- gameplay masks
- tile forge metadata
- processor version map
- seed provenance
- checksum-compatible output
```

Rendered art is a projection. The packet is the truth.

---

# 10. Code Architecture

## 10.1 Proposed Directory Layout

```txt
codex/core/pixelbrain/
  tile-forge/
    tile-forge.pipeline.js
    tile-forge.presets.js
    tile-forge.schema.js
    tile-forge.validator.js
    tile-forge.scorer.js
    tile-forge.exporter.js
    tile-forge.curation.js
    tile-forge.memory.js
    tile-forge.snap-validator.js

  amps/
    geometry/
      geometry-amp.js
      processors/
        geometry.microprocessor.js
        iso-tile-geometry.microprocessor.js
        tile-footprint.microprocessor.js
        tile-edge-mask.microprocessor.js
        tile-socket.microprocessor.js

    fibonacci/
      fibonacci-field.microprocessor.js
      fibonacci-seed-field.js

    volume/
      volume-amp.js
      processors/
        volume.microprocessor.js
        heightmap.microprocessor.js
        tile-thickness.microprocessor.js
        cliff-face.microprocessor.js
        cave-volume.microprocessor.js
        cave-layer-visibility.microprocessor.js

    symmetry/
      symmetry-amp.js
      processors/
        tile-symmetry.microprocessor.js
        edge-symmetry.validator.js

    noise/
      deterministic-noise.js
      perlin-field.microprocessor.js
      noise-mask.microprocessor.js

    biome/
      biome-material.microprocessor.js
      biome-compatibility.rules.js
      material-resolver.js

    props/
      prop-scatter.microprocessor.js
      anchor-selector.js

    turboquant/
      turboquant-memory-cell.js
      turboquant-layer-snapshot.js
      turboquant-reroll-history.js

    qbit/
      qbit-cell-profile.js
      qbit-snap-profile.js
      qbit-edge-contract.js
```

---

## 10.2 Processor Contract

Every microprocessor should follow the same shape.

```js
export class TileForgeMicroprocessor {
  constructor({ id, version }) {
    this.id = id;
    this.version = version;
  }

  run({ intent, input, context }) {
    throw new Error("Microprocessor must implement run().");
  }
}
```

Expected output:

```js
{
  output,
  diagnostics: {
    warnings: [],
    errors: [],
    metrics: {}
  },
  hash: "deterministic-layer-hash",
  processor: {
    id: "isoTileGeometry",
    version: "1.0.0"
  }
}
```

---

## 10.3 Main Pipeline

```js
export class TileForgePipeline {
  constructor({
    processors,
    presets,
    validator,
    scorer,
    snapValidator,
    memoryStore,
    exporter
  }) {
    this.processors = processors;
    this.presets = presets;
    this.validator = validator;
    this.scorer = scorer;
    this.snapValidator = snapValidator;
    this.memoryStore = memoryStore;
    this.exporter = exporter;
  }

  generate(intent) {
    const preset = this.presets[intent.preset];

    if (!preset) {
      throw new Error(`Unknown Tile Forge preset: ${intent.preset}`);
    }

    const context = {
      layers: {},
      diagnostics: [],
      processorVersionMap: {},
      lockedLayers: intent.lockedLayers || {}
    };

    for (const processorId of preset.steps) {
      const processor = this.processors[processorId];

      if (!processor) {
        throw new Error(`Missing processor: ${processorId}`);
      }

      if (context.lockedLayers[processorId]) {
        context.layers[processorId] = this.memoryStore.restoreLayer({
          intent,
          processorId
        });
        continue;
      }

      const result = processor.run({
        intent,
        input: context.layers,
        context
      });

      context.layers[processorId] = result.output;
      context.diagnostics.push(result.diagnostics);
      context.processorVersionMap[processorId] = processor.version;

      this.memoryStore.snapshotLayer({
        intent,
        processorId,
        result
      });
    }

    const candidate = this.composeCandidate(intent, context);

    const validation = this.validator.validate(candidate);
    const snapValidation = this.snapValidator.validate(candidate);
    const score = this.scorer.score(candidate, validation, snapValidation);

    const memorySnapshot = this.memoryStore.snapshotCandidate({
      candidate,
      validation,
      snapValidation,
      score
    });

    const exportPacket = this.exporter.toPixelBrainPacket({
      candidate,
      validation,
      snapValidation,
      score,
      memorySnapshot
    });

    return {
      candidate,
      validation,
      snapValidation,
      score,
      memorySnapshot,
      exportPacket
    };
  }

  composeCandidate(intent, context) {
    return {
      id: intent.id,
      type: "isometric_tile_chunk",
      intent,
      layers: context.layers,
      processorVersionMap: context.processorVersionMap,
      diagnostics: context.diagnostics
    };
  }
}
```

---

## 10.4 Pipeline Presets

```js
export const TILE_FORGE_PRESETS = {
  organicVoidIsland: {
    steps: [
      "geometry",
      "isoTile",
      "tileSockets",
      "fibonacciField",
      "volume",
      "symmetrySoft",
      "maskedNoise",
      "biomeMaterial",
      "propScatter"
    ]
  },

  cleanArchitectural: {
    steps: [
      "geometry",
      "isoTile",
      "tileSockets",
      "symmetryArchitectural",
      "volume",
      "fibonacciField",
      "maskedNoise",
      "biomeMaterial",
      "propScatter"
    ]
  },

  caveChunk: {
    steps: [
      "geometry",
      "isoTile",
      "tileSockets",
      "volume",
      "caveVolume",
      "maskedNoise",
      "fibonacciField",
      "symmetryOptional",
      "biomeMaterial",
      "caveLayerVisibility",
      "propScatter"
    ]
  },

  bossArena: {
    steps: [
      "geometry",
      "isoTile",
      "tileSockets",
      "symmetryArchitectural",
      "volume",
      "fibonacciField",
      "maskedNoise",
      "biomeMaterial",
      "propScatter"
    ]
  }
};
```

---

# 11. Canonical Data Schemas

## 11.1 Tile Forge Candidate

```js
export const TileForgeCandidateSchema = {
  id: "string",
  type: "isometric_tile_chunk",
  intent: "TileIntent",
  layers: "Record<string, ProcessorOutput>",
  qbit: "QbitCell[]",
  snapProfiles: "TileSnapProfile[]",
  memory: "TurboQuantCandidateMemory",
  authoring: "TileAuthoringState",
  validation: "TileValidationResult",
  score: "TileScoreResult"
};
```

---

## 11.2 QBIT Cell

```js
export const QbitTileCellSchema = {
  x: "number",
  y: "number",
  slot: "string",

  regionId: "string",
  partId: "string",

  biomeId: "string",
  materialId: "string",
  materialFamily: "string",

  elevation: "number",
  elevationClass: "flat|raised_1|raised_2|raised_3|raised_4|deep",

  flags: {
    visible: "boolean",
    walkable: "boolean",
    blocked: "boolean",
    rim: "boolean",
    cliff: "boolean",
    connector: "boolean",
    caveInterior: "boolean",
    caveCeiling: "boolean"
  },

  snapProfile: "TileSnapProfile"
};
```

---

## 11.3 Tile Snap Profile

Do not use biome name alone for snapping. Use a structured snap profile.

```js
export const TileSnapProfileSchema = {
  biomeId: "string",
  socketType: [
    "walkable_path",
    "cliff_edge",
    "wall",
    "water_edge",
    "void_gap",
    "stairs",
    "bridge",
    "cave_entrance",
    "portal"
  ],

  elevationClass: [
    "flat",
    "raised_1",
    "raised_2",
    "raised_3",
    "raised_4",
    "deep"
  ],

  materialFamily: "string",

  transitionType: [
    "hard_edge",
    "soft_blend",
    "rim",
    "bridge",
    "portal",
    "cave_mouth",
    "stairs"
  ],

  walkable: "boolean",
  connector: "boolean"
};
```

---

## 11.4 Socket Compatibility Rules

```js
export const BIOME_COMPATIBILITY = {
  void_ice: ["void_ice", "obsidian", "frost_ruin", "blackglass"],
  grass: ["grass", "dirt", "forest", "stone_path"],
  cave: ["cave", "stone", "obsidian", "frost_ruin"],
  lava: ["lava", "basalt", "ash"],
  water: ["water", "shore", "ice"]
};

export const SOCKET_COMPATIBILITY = {
  walkable_path: ["walkable_path", "stairs", "bridge"],
  cliff_edge: ["cliff_edge", "void_gap"],
  cave_entrance: ["cave_entrance", "walkable_path"],
  bridge: ["bridge", "walkable_path"],
  stairs: ["stairs", "walkable_path"]
};
```

---

## 11.5 Snap Validation Function

```js
export function areSnapProfilesCompatible(a, b, rules) {
  const biomeOk =
    a.biomeId === b.biomeId ||
    rules.biomeCompatibility[a.biomeId]?.includes(b.biomeId);

  const socketOk =
    a.socketType === b.socketType ||
    rules.socketCompatibility[a.socketType]?.includes(b.socketType);

  const elevationOk = a.elevationClass === b.elevationClass;

  const walkableOk = a.walkable === b.walkable;

  return biomeOk && socketOk && elevationOk && walkableOk;
}

export function canSnapEdges(edgeA, edgeB, rules) {
  if (edgeA.length !== edgeB.length) {
    return false;
  }

  return edgeA.every((cellA, index) => {
    const cellB = edgeB[index];

    return areSnapProfilesCompatible(
      cellA.snapProfile,
      cellB.snapProfile,
      rules
    );
  });
}
```

---

## 11.6 TurboQuant Memory Snapshot

```js
export const TurboQuantCandidateMemorySchema = {
  chunkId: "string",
  seed: "string",
  preset: "string",

  processorVersionMap: "Record<string, string>",

  lockedLayers: {
    geometry: "boolean",
    isoTile: "boolean",
    tileSockets: "boolean",
    fibonacciField: "boolean",
    volume: "boolean",
    symmetry: "boolean",
    maskedNoise: "boolean",
    biomeMaterial: "boolean",
    propScatter: "boolean"
  },

  layerSnapshots: {
    geometryHash: "string",
    isoTileHash: "string",
    tileSocketHash: "string",
    fibonacciHash: "string",
    volumeHash: "string",
    symmetryHash: "string",
    noiseHash: "string",
    materialHash: "string",
    propHash: "string"
  },

  rerollHistory: [
    {
      processorId: "string",
      seed: "string",
      accepted: "boolean",
      createdAt: "nonCanonicalTimestamp"
    }
  ],

  authoring: {
    promoted: "boolean",
    rejected: "boolean",
    handEdited: "boolean",
    notes: "string[]"
  }
};
```

Important:

```txt
Timestamps may exist for editor UX, but they must not affect canonical checksums.
```

---

## 11.7 Curation State

```js
export const TileAuthoringStateSchema = {
  lockedLayers: {
    geometry: "boolean",
    volume: "boolean",
    noise: "boolean",
    materials: "boolean",
    props: "boolean"
  },

  promoted: "boolean",
  rejected: "boolean",
  handEdited: "boolean",

  editableOperations: [
    "lockLayer",
    "unlockLayer",
    "rerollLayer",
    "moveChunk",
    "mirrorChunk",
    "duplicateChunk",
    "promoteCandidate",
    "rejectCandidate",
    "annotateCandidate"
  ],

  notes: "string[]"
};
```

---

## 11.8 Cave Layer Schema

```js
export const CaveLayerSchema = {
  caveId: "string",

  layers: {
    floor: "Cell[]",
    walls: "Cell[]",
    ceiling: "Cell[]",
    occluders: "Cell[]",
    lightingZone: "Cell[]"
  },

  triggers: {
    interiorRegion: "Cell[]",
    entranceRegion: "Cell[]",
    exitRegion: "Cell[]"
  },

  visibility: {
    outsideCeilingAlpha: "number",
    insideCeilingAlpha: "number",
    deepCaveCeilingAlpha: "number",
    transitionFrames: "number"
  },

  lighting: {
    preserveBaseLighting: "boolean",
    allowAccentLights: "boolean",
    maxLightingDelta: "number"
  }
};
```

---

# 12. Cave Transparency Design

## 12.1 Cave Rendering Modes

```txt
outsideCave:
  ceiling alpha = 1.0
  occluders alpha = 1.0

insideCave:
  ceiling alpha = 0.15 to 0.35
  occluders alpha = 0.20 to 0.40

deepCave:
  ceiling alpha = 0.0 to 0.15
  rim silhouette remains visible
```

---

## 12.2 Cave Trigger Logic

```js
export function updateCaveVisibility({ playerCell, cave, renderer }) {
  const inside = cave.triggers.interiorRegion.some(
    cell => cell.x === playerCell.x && cell.y === playerCell.y
  );

  if (inside) {
    renderer.setLayerAlpha(cave.layers.ceiling, cave.visibility.insideCeilingAlpha);
    renderer.setLayerAlpha(cave.layers.occluders, 0.25);
    return;
  }

  renderer.setLayerAlpha(cave.layers.ceiling, cave.visibility.outsideCeilingAlpha);
  renderer.setLayerAlpha(cave.layers.occluders, 1.0);
}
```

---

## 12.3 Cave Lighting Rule

Do not change lighting dramatically when ceiling transparency toggles.

Allowed:

```txt
- subtle interior glow
- small rim highlights
- minor fog accent
- controlled cyan/void accent light
```

Avoid:

```txt
- sudden full-scene exposure changes
- lighting that makes the ceiling pop visibly
- flickering alpha during movement
- hiding gameplay-critical cells behind transparent clutter
```

---

# 13. Top 10 Pitfalls

## 13.1 Pitfall 1: Treating TurboQuant As Infinite Junk Storage

TurboQuant should preserve useful procedural state, not every failed artifact forever.

**Risk:** memory bloat and unusable history.

**Fix:** keep promoted chunks, locked layers, and last N rerolls. Discard unbookmarked rejects.

---

## 13.2 Pitfall 2: Snapping by Biome Name Only

Biome name is not enough.

**Risk:** `void_ice` could mean path, cliff, wall, rim, or cave ceiling.

**Fix:** use full `snapProfile`.

---

## 13.3 Pitfall 3: Monolithic Tile Forge

One giant generator will become brittle.

**Risk:** impossible selective regeneration and debugging.

**Fix:** separate microprocessors with stable contracts.

---

## 13.4 Pitfall 4: Noise Mutating Structural Truth

Noise should not erase paths, sockets, or required gameplay cells.

**Risk:** beautiful but broken maps.

**Fix:** use masked noise only.

---

## 13.5 Pitfall 5: Overengineering Cave Occlusion

Full 3D occlusion is unnecessary for MVP.

**Risk:** huge time sink.

**Fix:** transparent ceiling layers with stable lighting.

---

## 13.6 Pitfall 6: Processor Order Treated As Universal

Caves, arenas, islands, and bridges require different generation order.

**Risk:** one preset damages every specialized piece.

**Fix:** use named presets.

---

## 13.7 Pitfall 7: No Processor Version Tracking

A seed alone is not enough if processors change.

**Risk:** same seed produces different output after code changes.

**Fix:** store processor version map in TurboQuant memory.

---

## 13.8 Pitfall 8: No Human Curation Layer

Generation without curation creates disposable output.

**Risk:** good chunks are lost or hard to reuse.

**Fix:** lock, reroll, promote, reject, annotate.

---

## 13.9 Pitfall 9: Prop Scatter Blocking Required Paths

Props can accidentally ruin walkability.

**Risk:** map looks good but plays badly.

**Fix:** props consume validated anchors and must pass walkability checks.

---

## 13.10 Pitfall 10: Exporting Art Without QBIT Metadata

A rendered image cannot explain walkability, sockets, biome, or snap rules.

**Risk:** impossible map assembly.

**Fix:** export canonical lattice metadata first.

---

# 14. Top 5 Brilliant Moves

## 14.1 Brilliant Move 1: TurboQuant Layer Snapshots

Layer snapshots make procedural generation editable.

**Why it matters:** You can lock geometry and reroll only noise or props.

---

## 14.2 Brilliant Move 2: QBIT Snap Profiles

Cell metadata makes snapping deterministic.

**Why it matters:** Seam validation becomes data comparison instead of visual guessing.

---

## 14.3 Brilliant Move 3: Separate Microprocessors

Each generator stage becomes testable and replaceable.

**Why it matters:** The system scales without becoming a hydra wearing a trench coat.

---

## 14.4 Brilliant Move 4: Cave Transparency Instead of Raycasting

Layer fading solves the visibility problem cleanly.

**Why it matters:** It avoids a massive rendering problem while preserving the isometric illusion.

---

## 14.5 Brilliant Move 5: Human Curation As Core Workflow

The developer remains in command.

**Why it matters:** The world stays authored, not algorithmically abandoned.

---

# 15. Top 5 Worst Moves

## 15.1 Worst Move 1: Building Infinite Runtime World Generation First

This explodes scope.

**Consequence:** weak level design and endless debugging.

---

## 15.2 Worst Move 2: Making Geometry AMP Own Everything

Geometry should not own materials, props, biome rules, and export.

**Consequence:** god-object architecture.

---

## 15.3 Worst Move 3: Using Math.random()

This breaks determinism.

**Consequence:** impossible reproduction and failed tests.

---

## 15.4 Worst Move 4: Treating Transparent Ceilings As a Rendering Hack Only

Cave transparency must be supported by proper cave region metadata.

**Consequence:** visual trick works once, then breaks when caves become complex.

---

## 15.5 Worst Move 5: Skipping Snap Validation

Without snap validation, generated chunks cannot reliably become maps.

**Consequence:** seams, broken paths, bad transitions, goblin math everywhere.

---

# 16. Top 10 Things To Look Out For

```txt
1. Edge sockets must match in both shape and metadata.
2. QBIT snap profiles must use stable IDs, not loose labels.
3. TurboQuant snapshots must not affect canonical checksum through timestamps.
4. Noise must stay inside masks.
5. Props must not block required traversal.
6. Cave transparency must preserve readability.
7. Lighting changes inside caves must be subtle.
8. Processor outputs must be hashable and deterministic.
9. Preset order must fit the chunk type.
10. Export packets must preserve both visual and gameplay metadata.
```

---

# 17. Most Difficult Implementations

## 17.1 QBIT Snap Profile Design

This is deceptively hard.

The profile must be rich enough to validate seams but simple enough to maintain.

Needs:

```txt
- biome compatibility
- socket compatibility
- elevation compatibility
- transition compatibility
- walkability compatibility
```

If this schema is too small, snapping breaks.

If it is too large, every tile becomes bureaucracy with pixels.

---

## 17.2 TurboQuant Selective Regeneration

Layer locking and rerolling require clean boundaries.

Difficult requirements:

```txt
- restore old layer outputs
- rerun downstream processors only when needed
- preserve locked layers
- maintain deterministic hashes
- avoid stale dependencies
```

Example:

```txt
If geometry changes, sockets, volume, noise, materials, props, and validation must rerun.
If only props reroll, geometry and volume should not rerun.
```

---

## 17.3 Volume and Cave Layer Separation

Cave chunks require both physical volume and visual layer management.

Difficult questions:

```txt
- What cells are floor?
- What cells are wall?
- What cells are ceiling?
- What cells hide the player?
- What trigger activates transparency?
- What lighting remains stable?
```

---

## 17.4 Deterministic Noise

Perlin/noise must be seeded, masked, and reproducible.

Difficult requirements:

```txt
same seed + same processor version = same field
same mask = same affected cells
locked geometry remains untouched
```

---

## 17.5 Curation UX

The backend can generate chunks, but the tool is only useful if curation feels fast.

Needed operations:

```txt
- compare candidates
- preview snap compatibility
- lock layers
- reroll layers
- promote chunks
- move chunks
- annotate chunks
```

This becomes the forge’s cockpit.

---

# 18. Dependency Check

Before implementation, inspect:

```txt
- Geometry AMP API
- Symmetry AMP API
- Volume AMP API
- existing QBIT lattice cell schema
- existing TurboQuant memory utilities
- PixelBrainAssetPacket exporter
- seeded RNG utilities
- lattice grid constants
- material/biome resolver
- raster math helpers
- SDF evaluator
- coordinate mapping helpers
- existing renderer layer system
- cave/volume collision systems, if any
```

Do not refactor shared systems blindly.

Add the Tile Forge as an additive layer first.

---

# 19. Regression Risks

## 19.1 Existing Geometry Assets

Risk:

```txt
Changing Geometry AMP may break existing asset generation.
```

Mitigation:

```txt
Add tile-specific microprocessors instead of rewriting Geometry AMP internals.
```

---

## 19.2 QBIT Cell Schema Drift

Risk:

```txt
Adding too much metadata directly to every cell may affect existing QBIT consumers.
```

Mitigation:

```txt
Namespace tile metadata under qbit.tileForge or snapProfile.
```

---

## 19.3 TurboQuant Memory Overreach

Risk:

```txt
Memory layer becomes coupled to every processor.
```

Mitigation:

```txt
Store processor outputs through a common snapshot interface.
```

---

## 19.4 Cave Layer Rendering Bugs

Risk:

```txt
Transparent ceilings could reveal hidden map seams or clutter.
```

Mitigation:

```txt
Use cave-specific visibility modes and alpha constraints.
```

---

## 19.5 Export Compatibility

Risk:

```txt
Existing PixelBrain renderers may not understand tileForge metadata.
```

Mitigation:

```txt
Add metadata non-destructively and preserve existing render fields.
```

---

# 20. QA Checklist

## 20.1 Determinism QA

```txt
[ ] Same seed produces same export packet.
[ ] Same seed plus same processor versions produces same hashes.
[ ] Different seed changes allowed procedural fields.
[ ] Math.random() is not used.
[ ] Date/time does not affect canonical output.
```

---

## 20.2 Geometry QA

```txt
[ ] Footprint fits tile bounds.
[ ] Top plane is non-empty.
[ ] Side planes exist when elevation > 0.
[ ] Edge masks are valid.
[ ] Corner masks are valid.
[ ] Anchors are inside bounds.
```

---

## 20.3 QBIT Snap QA

```txt
[ ] Every edge cell has a snapProfile.
[ ] Compatible edges pass validation.
[ ] Incompatible biome transitions fail unless allowed by rules.
[ ] Elevation mismatch fails unless transition supports stairs/bridge.
[ ] Walkable paths continue across snapped edges.
```

---

## 20.4 TurboQuant QA

```txt
[ ] Layer snapshots are saved.
[ ] Locked layers are restored instead of rerun.
[ ] Rerolled layers produce new hashes.
[ ] Promoted candidates persist.
[ ] Rejected unbookmarked candidates can be discarded.
```

---

## 20.5 Noise QA

```txt
[ ] Noise is deterministic.
[ ] Noise is masked.
[ ] Noise does not alter sockets.
[ ] Noise does not erase required walkability.
```

---

## 20.6 Cave QA

```txt
[ ] Cave floor, wall, ceiling, and occluder layers exist.
[ ] Player entering cave changes ceiling alpha.
[ ] Player exiting cave restores ceiling alpha.
[ ] Lighting remains stable.
[ ] Player remains readable under transparent ceiling.
```

---

## 20.7 Export QA

```txt
[ ] Export packet includes lattice cells.
[ ] Export packet includes tileForge metadata.
[ ] Export packet includes QBIT snap profiles.
[ ] Export packet includes seed and preset.
[ ] Export renders in existing PixelBrain renderer.
```

---

# Section 2: Implementation Spec Sheet

## 1. Feature Name

```txt
Scholomance Procedural Tile Forge v2
```

---

## 2. First MVP Target

Generate one deterministic **80×45 void ice floating island chunk** with:

```txt
- geometry footprint
- top plane
- side plane
- QBIT snap profiles
- Fibonacci decorative seeds
- simple volume height map
- masked Perlin/noise field
- biome material assignment
- TurboQuant layer snapshots
- validation report
- snap validation report
- PixelBrain-compatible export packet
```

No full map editor yet.

No full infinite world generation.

No advanced cave system in the first tiny step unless the implementation is already available.

---

## 3. Required New Files

```txt
codex/core/pixelbrain/tile-forge/tile-forge.pipeline.js
codex/core/pixelbrain/tile-forge/tile-forge.presets.js
codex/core/pixelbrain/tile-forge/tile-forge.schema.js
codex/core/pixelbrain/tile-forge/tile-forge.validator.js
codex/core/pixelbrain/tile-forge/tile-forge.scorer.js
codex/core/pixelbrain/tile-forge/tile-forge.exporter.js
codex/core/pixelbrain/tile-forge/tile-forge.memory.js
codex/core/pixelbrain/tile-forge/tile-forge.snap-validator.js

codex/core/pixelbrain/amps/geometry/processors/iso-tile-geometry.microprocessor.js
codex/core/pixelbrain/amps/geometry/processors/tile-socket.microprocessor.js

codex/core/pixelbrain/amps/noise/deterministic-noise.js
codex/core/pixelbrain/amps/noise/perlin-field.microprocessor.js

codex/core/pixelbrain/amps/qbit/qbit-snap-profile.js
codex/core/pixelbrain/amps/turboquant/turboquant-layer-snapshot.js
```

Optional later:

```txt
codex/core/pixelbrain/amps/volume/processors/cave-volume.microprocessor.js
codex/core/pixelbrain/amps/volume/processors/cave-layer-visibility.microprocessor.js
codex/core/pixelbrain/tile-forge/tile-forge.curation.js
```

---

## 4. Public API

```js
generateTileForgeCandidate(intent): TileForgeGenerationResult
```

Example:

```js
const result = generateTileForgeCandidate({
  id: "void_ice_chunk_001",
  seed: "scholo_seed_001",
  preset: "organicVoidIsland",
  projection: "isometric",
  tileSize: { width: 80, height: 45 },
  chunkType: "floating_island",
  biomeId: "void_ice",
  elevation: 3,
  symmetryMode: "soft",

  lockedLayers: {
    geometry: false,
    isoTile: false,
    tileSockets: false,
    fibonacciField: false,
    volume: false,
    maskedNoise: false,
    biomeMaterial: false,
    propScatter: false
  },

  noise: {
    enabled: true,
    scale: 0.12,
    intensity: 0.35
  },

  fibonacci: {
    enabled: true,
    count: 24,
    mode: "decorative_growth"
  }
});
```

Output:

```js
{
  candidate,
  validation,
  snapValidation,
  score,
  memorySnapshot,
  exportPacket
}
```

---

## 5. Required MVP Processors

## 5.1 Geometry Processor

```js
geometry.run({ intent, input, context })
```

Returns:

```js
{
  bounds,
  footprint,
  regions,
  anchors
}
```

---

## 5.2 Iso Tile Processor

```js
isoTile.run({ intent, input, context })
```

Returns:

```js
{
  topPlane,
  sidePlanes,
  edgeMasks,
  cornerMasks,
  rimCells,
  walkableCandidates
}
```

---

## 5.3 Tile Socket Processor

```js
tileSockets.run({ intent, input, context })
```

Returns:

```js
{
  edges: {
    north: "QbitTileCell[]",
    east: "QbitTileCell[]",
    south: "QbitTileCell[]",
    west: "QbitTileCell[]"
  },
  sockets: "Socket[]",
  snapProfiles: "TileSnapProfile[]"
}
```

---

## 5.4 Fibonacci Field Processor

```js
fibonacciField.run({ intent, input, context })
```

Returns:

```js
{
  seeds,
  fields
}
```

---

## 5.5 Volume Processor

```js
volume.run({ intent, input, context })
```

Returns:

```js
{
  heightMap,
  thickness,
  cliffs,
  cavities,
  overhangs
}
```

---

## 5.6 Masked Noise Processor

```js
maskedNoise.run({ intent, input, context })
```

Returns:

```js
{
  fields,
  masks,
  affectedCells
}
```

---

## 5.7 Biome Material Processor

```js
biomeMaterial.run({ intent, input, context })
```

Returns:

```js
{
  assignments,
  palette,
  materialCells
}
```

---

## 5.8 TurboQuant Memory

```js
memoryStore.snapshotLayer({ intent, processorId, result })
memoryStore.restoreLayer({ intent, processorId })
memoryStore.snapshotCandidate({ candidate, validation, snapValidation, score })
```

---

## 5.9 Snap Validator

```js
snapValidator.validate(candidate)
```

Returns:

```js
{
  ok: true,
  errors: [],
  warnings: [],
  metrics: {
    compatibleEdges: 0,
    incompatibleEdges: 0,
    snapCoverage: 0
  }
}
```

---

## 6. Deterministic RNG Requirement

Do not use:

```js
Math.random()
Date.now()
performance.now()
crypto.randomUUID()
```

Use:

```js
const rng = createSeededRng(seed);

rng.next();
rng.int(min, max);
rng.pick(array);
```

---

## 7. Minimal Determinism Test

```js
const intent = {
  id: "test_void_ice_001",
  seed: "same_seed",
  preset: "organicVoidIsland",
  projection: "isometric",
  tileSize: { width: 80, height: 45 },
  chunkType: "floating_island",
  biomeId: "void_ice",
  elevation: 3,
  symmetryMode: "soft",
  noise: { enabled: true, scale: 0.12, intensity: 0.35 },
  fibonacci: { enabled: true, count: 24, mode: "decorative_growth" }
};

const resultA = generateTileForgeCandidate(intent);
const resultB = generateTileForgeCandidate(intent);

console.assert(
  JSON.stringify(resultA.exportPacket) === JSON.stringify(resultB.exportPacket)
);

console.assert(resultA.validation.ok === true);
console.assert(resultA.snapValidation.ok === true);
```

---

## 8. Minimal Snap Test

```js
const edgeA = resultA.candidate.layers.tileSockets.edges.east;
const edgeB = resultB.candidate.layers.tileSockets.edges.west;

const canSnap = canSnapEdges(edgeA, edgeB, {
  biomeCompatibility: BIOME_COMPATIBILITY,
  socketCompatibility: SOCKET_COMPATIBILITY
});

console.assert(canSnap === true);
```

---

## 9. Minimal TurboQuant Test

```js
const first = generateTileForgeCandidate(intent);

const lockedIntent = {
  ...intent,
  lockedLayers: {
    geometry: true,
    isoTile: true,
    tileSockets: true,
    volume: true,
    maskedNoise: false
  },
  seed: "same_seed_noise_reroll_002"
};

const second = generateTileForgeCandidate(lockedIntent);

console.assert(
  first.memorySnapshot.layerSnapshots.geometryHash ===
  second.memorySnapshot.layerSnapshots.geometryHash
);

console.assert(
  first.memorySnapshot.layerSnapshots.noiseHash !==
  second.memorySnapshot.layerSnapshots.noiseHash
);
```

---

## 10. Minimal Cave Test For Later Phase

```js
const caveIntent = {
  id: "test_cave_001",
  seed: "cave_seed_001",
  preset: "caveChunk",
  projection: "isometric",
  tileSize: { width: 80, height: 45 },
  chunkType: "cave",
  biomeId: "frost_cave",
  caveMode: true
};

const result = generateTileForgeCandidate(caveIntent);

console.assert(result.candidate.layers.caveVolume.layers.floor.length > 0);
console.assert(result.candidate.layers.caveVolume.layers.ceiling.length > 0);
```

---

## 11. Fastest Implementation Order

```txt
1. Add TileForge schema file.
2. Add seeded RNG utility or reuse existing deterministic RNG.
3. Add IsoTileGeometryMicroprocessor.
4. Add basic 80×45 footprint, topPlane, sidePlane, edgeMasks.
5. Add QBIT snap profile schema.
6. Add TileSocketMicroprocessor.
7. Add snap compatibility rules.
8. Add TileForgePipeline shell.
9. Add TurboQuant layer snapshot interface.
10. Add Fibonacci seed field.
11. Add simple volume height map.
12. Add masked noise.
13. Add biome material resolver stub.
14. Add validator.
15. Add snap validator.
16. Add exporter.
17. Add determinism test.
18. Add layer lock/reroll test.
19. Add cave transparency processor later.
```

---

## 12. Required MVP Acceptance Criteria

The MVP is done when:

```txt
[ ] One 80×45 void ice floating island chunk generates.
[ ] Same seed produces same export packet.
[ ] QBIT cells include snap profiles.
[ ] East/west and north/south edge compatibility can be validated.
[ ] TurboQuant stores layer hashes.
[ ] Locked geometry can be restored.
[ ] Noise can be rerolled without changing geometry.
[ ] Export packet includes tileForge metadata.
[ ] Existing PixelBrain renderer does not break.
```

---

# Section 3: Rationale and AI Guidance

## 1. Why TurboQuant Was Added

TurboQuant solves the practical problem of curation memory.

Without TurboQuant, the system can generate a good chunk and immediately lose the exact layered state that made it useful.

With TurboQuant, the engine can preserve:

```txt
- seed
- preset
- processor versions
- locked layers
- hashes
- reroll history
- authoring status
```

This turns the Tile Forge into a real production tool.

The AI should not treat TurboQuant as optional if curation is required.

---

## 2. Why QBIT Snap Profiles Were Added

Tile snapping should not rely on eyeballing geometry.

QBIT cells already live on the lattice, so they are the correct place to store tile identity.

A cell should know:

```txt
I am void ice.
I am on the north edge.
I am walkable.
I am raised_3.
I connect as a walkable_path.
I transition softly into frost ruin or obsidian.
```

This makes snapping deterministic.

The AI should not implement expensive shape matching before attempting QBIT metadata matching.

---

## 3. Why Biome Name Alone Is Not Enough

Biome is flavor. Socket profile is function.

This is weak:

```js
cell.biomeId = "void_ice";
```

This is strong:

```js
cell.snapProfile = {
  biomeId: "void_ice",
  socketType: "walkable_path",
  elevationClass: "raised_3",
  materialFamily: "frost_obsidian",
  transitionType: "soft_blend",
  walkable: true,
  connector: true
};
```

The AI must use structured snap profiles.

---

## 4. Why Microprocessors Are Required

The system needs selective regeneration.

That means each layer must be independently runnable, hashable, and restorable.

If everything lives inside one function, this becomes impossible:

```txt
Lock geometry.
Reroll props.
Preserve volume.
Change biome.
Restore old noise.
```

Separate microprocessors make the forge editable.

---

## 5. Why Caves Use Transparency

Isometric cave visibility can become a monster.

Instead of solving true 3D occlusion, the first implementation should use a classic game-dev solution:

```txt
When player enters cave, fade ceiling layer.
When player exits cave, restore ceiling layer.
Keep lighting mostly stable.
```

This is a deliberate design choice, not a shortcut born of weakness.

It preserves readability and avoids overengineering.

---

## 6. Why Lighting Should Not Change Much In Caves

If the ceiling fades and lighting changes dramatically at the same time, the player sees the trick.

The better illusion:

```txt
ceiling fades
base lighting remains stable
small accent lights appear
player remains readable
```

The AI must not add aggressive dynamic lighting to cave transitions unless explicitly requested.

---

## 7. Why Pipeline Presets Exist

Different map pieces need different order.

Organic island:

```txt
Geometry → Tile → Fibonacci → Volume → Soft Symmetry → Noise → Materials
```

Boss arena:

```txt
Geometry → Tile → Hard Symmetry → Volume → Noise → Materials
```

Cave:

```txt
Geometry → Tile → Volume → Cave Layers → Noise → Materials → Visibility
```

The AI must not assume one universal pipeline order.

---

## 8. Why Validation and Snap Validation Are Separate

Validation answers:

```txt
Is this tile internally valid?
```

Snap validation answers:

```txt
Can this tile connect to another tile?
```

A tile can be internally valid but fail to connect cleanly.

These systems should remain separate.

---

## 9. Why Export Must Preserve QBIT and TurboQuant Data

Pixel art alone is not enough.

The exported packet must preserve:

```txt
- lattice cells
- QBIT cell metadata
- snap profiles
- material IDs
- gameplay masks
- tile forge metadata
- seed
- preset
- processor version map
```

This keeps the asset editable, testable, and reusable.

---

## 10. Why MVP Should Stay Narrow

The first target should be one strong tile type:

```txt
80×45 void ice floating island chunk
```

This proves the whole system without drowning in feature sprawl.

After that:

```txt
- cave chunks
- bridge chunks
- boss arenas
- biome transitions
- full map assembly
```

The AI should build the spine before decorating the cathedral.

---

## 11. Final Architectural Decision

The selected architecture is:

```txt
A deterministic, microprocessor-based procedural tile forge using TurboQuant memory cells for curation state, QBIT lattice snap profiles for seam validation, masked procedural fields for visual richness, transparent cave layers for isometric occlusion, and PixelBrain-compatible packets for canonical export.
```

In plain language:

```txt
The tile remembers what it is.
The forge remembers how it was made.
The processors remember their jobs.
The cave hides its ceiling politely.
The designer remains in command.
```

This is the correct architecture for Scholomance.
