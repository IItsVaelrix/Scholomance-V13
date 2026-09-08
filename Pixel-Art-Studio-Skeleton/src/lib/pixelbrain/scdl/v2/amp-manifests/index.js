/**
 * Static anchor manifests export for SCDL v2 browser-safe runtime.
 *
 * Provides static exports for all registered manifests, avoiding runtime
 * node:fs/node:path imports in the compiler dependency graph.
 */

export const BIOME_COHERENCE_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.biome-coherence",
  "version": "1.0.0",
  "execution": "DESCRIPTOR",
  "stage": "WORLD_DESCRIPTOR",
  "scope": [
    "ASSET"
  ],
  "inputs": [
    {
      "name": "targetId",
      "type": "ANY",
      "required": false,
      "description": "Target asset or voxel region identifier"
    }
  ],
  "parameters": [
    {
      "name": "coherenceThreshold",
      "type": "FIXED",
      "min": 0,
      "max": 1,
      "default": 0.5,
      "description": "Biome boundary coherence threshold"
    }
  ],
  "output": {
    "type": "ANY",
    "description": "Immutable world biome coherence descriptor"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "CONSTANT",
    "multiplier": 1,
    "fixed": 10
  },
  "order": 100,
  "relevance": {
    "pipelines": [
      "world-voxel"
    ],
    "conditions": []
  },
  "checksum": "5bedaf2afc84e85aa314e8ea2ead9429751853dacad6fa465d064a8836ccff5d"
});

export const BIOME_MATERIAL_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.biome-material",
  "version": "1.0.0",
  "execution": "DESCRIPTOR",
  "stage": "WORLD_DESCRIPTOR",
  "scope": [
    "ASSET"
  ],
  "inputs": [
    {
      "name": "targetId",
      "type": "ANY",
      "required": false,
      "description": "Biome region identifier"
    }
  ],
  "parameters": [
    {
      "name": "biome",
      "type": "ANY",
      "default": "forest",
      "description": "Biome type identifier"
    }
  ],
  "output": {
    "type": "ANY",
    "description": "Immutable biome-to-material binding descriptor"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "CONSTANT",
    "multiplier": 1,
    "fixed": 10
  },
  "order": 106,
  "relevance": {
    "pipelines": [
      "world-voxel"
    ],
    "conditions": []
  },
  "checksum": "4adb037c20f9f96ab307845365f20eb628ccf04dc00cfd15c2241a61bfd5cebd"
});

export const CHESTPLATE_BEVEL_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.chestplate-bevel",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "SHAPE_POST",
  "scope": [
    "SHAPE"
  ],
  "inputs": [
    {
      "name": "geometry",
      "type": "SHAPE",
      "required": true,
      "description": "Torso plate geometry"
    }
  ],
  "parameters": [
    {
      "name": "depth",
      "type": "I32",
      "min": 1,
      "max": 8,
      "default": 2,
      "description": "Edge bevel depth in cells"
    }
  ],
  "output": {
    "type": "SHAPE",
    "description": "Beveled torso plate geometry with contour depth"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 2,
    "fixed": 0
  },
  "order": 42,
  "relevance": {
    "pipelines": [
      "item"
    ],
    "conditions": [
      {
        "field": "archetype",
        "op": "includes",
        "value": "chestplate"
      }
    ]
  },
  "checksum": "56788172559a31d717c6d44e002e1e9f6018b901f04752f00a1ae1e0c39fc67c"
});

export const CHESTPLATE_SURFACE_TEXTURE_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.chestplate-surface-texture",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "PAINT",
  "scope": [
    "LAYER",
    "SHAPE"
  ],
  "inputs": [
    {
      "name": "target",
      "type": "LAYER",
      "required": true,
      "description": "Plate surface layer"
    }
  ],
  "parameters": [
    {
      "name": "roughness",
      "type": "FIXED",
      "min": 0,
      "max": 1,
      "default": 0.3,
      "description": "Surface micro-texture roughness"
    }
  ],
  "output": {
    "type": "LAYER",
    "description": "Layer with plate surface micro-texture shading"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 3,
    "fixed": 0
  },
  "order": 52,
  "relevance": {
    "pipelines": [
      "item"
    ],
    "conditions": [
      {
        "field": "archetype",
        "op": "includes",
        "value": "chestplate"
      }
    ]
  },
  "checksum": "b7347a7e67761f2d01a6087be94cae77441254d2413854e0f57dbdbaa9db5113"
});

export const CHESTPLATE_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.chestplate",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "SHAPE_POST",
  "scope": [
    "SHAPE",
    "LAYER"
  ],
  "inputs": [
    {
      "name": "geometry",
      "type": "SHAPE",
      "required": true,
      "description": "Chestplate base torso geometry"
    }
  ],
  "parameters": [
    {
      "name": "tier",
      "type": "I32",
      "min": 1,
      "max": 5,
      "default": 1,
      "description": "Armor tier level"
    },
    {
      "name": "profile",
      "type": "ANY",
      "default": "armor.chestplate",
      "description": "Armor profile identifier"
    }
  ],
  "output": {
    "type": "SHAPE",
    "description": "Structured chestplate geometry with torso volume and rim slots"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 3,
    "fixed": 0
  },
  "order": 41,
  "relevance": {
    "pipelines": [
      "item"
    ],
    "conditions": [
      {
        "field": "archetype",
        "op": "includes",
        "value": "chestplate"
      }
    ]
  },
  "checksum": "f5aa1f6e71c309280d6c3db0208748cd0c0485b1655d4352a0e654ccc1f6f91c"
});

export const CHUNKS_SEAM_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.chunks-seam",
  "version": "1.0.0",
  "execution": "DESCRIPTOR",
  "stage": "WORLD_DESCRIPTOR",
  "scope": [
    "ASSET"
  ],
  "inputs": [
    {
      "name": "targetId",
      "type": "ANY",
      "required": false,
      "description": "Chunk boundary identifier"
    }
  ],
  "parameters": [
    {
      "name": "seamMargin",
      "type": "I32",
      "min": 0,
      "max": 8,
      "default": 1,
      "description": "Inter-chunk overlap seam margin"
    }
  ],
  "output": {
    "type": "ANY",
    "description": "Immutable chunk seam stitching descriptor"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "CONSTANT",
    "multiplier": 1,
    "fixed": 10
  },
  "order": 103,
  "relevance": {
    "pipelines": [
      "world-voxel"
    ],
    "conditions": []
  },
  "checksum": "8099dddd72e7058b5d5847a33f1c88d3cfa2c00020cd1a3858b40265d81d9a41"
});

export const CRYSTAL_CORE_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.crystal-core",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "SHAPE_POST",
  "scope": [
    "SHAPE",
    "LAYER"
  ],
  "inputs": [
    {
      "name": "geometry",
      "type": "SHAPE",
      "required": true,
      "description": "Crystal core geometry"
    }
  ],
  "parameters": [
    {
      "name": "resonance",
      "type": "FIXED",
      "min": 0,
      "max": 1,
      "default": 0.8,
      "description": "Crystal core resonance intensity"
    }
  ],
  "output": {
    "type": "SHAPE",
    "description": "Crystal shape with inner resonance core and facet highlight metadata"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 3,
    "fixed": 0
  },
  "order": 44,
  "relevance": {
    "pipelines": [
      "item",
      "render-fidelity"
    ],
    "conditions": [
      {
        "field": "materials",
        "op": "includes",
        "value": "crystal"
      }
    ]
  },
  "checksum": "437ac5ccd79822c07922591a53e9c6b19a8308bafab8843f8ef78fefc3a85113"
});

export const FACET_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.facet",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "SHAPE_POST",
  "scope": [
    "SHAPE",
    "LAYER"
  ],
  "inputs": [
    {
      "name": "geometry",
      "type": "SHAPE",
      "required": true,
      "description": "Input shape to facet into angular planar regions"
    }
  ],
  "parameters": [
    {
      "name": "facetCount",
      "type": "I32",
      "min": 3,
      "max": 32,
      "default": 8,
      "description": "Number of radial facet divisions"
    }
  ],
  "output": {
    "type": "SHAPE",
    "description": "Faceted shape geometry with faceted region metadata"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 4,
    "fixed": 0
  },
  "order": 40,
  "relevance": {
    "pipelines": [
      "item",
      "render-fidelity"
    ],
    "conditions": [
      {
        "field": "materials",
        "op": "includes",
        "value": "gem"
      }
    ]
  },
  "checksum": "9b4e952848668f470ab38ba938e8912557e0f4a48e8805819d91e73df94ef28a"
});

export const FIBONACCI_FIELD_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.fibonacci-field",
  "version": "1.0.0",
  "execution": "DESCRIPTOR",
  "stage": "RUNTIME_DESCRIPTOR",
  "scope": [
    "ASSET",
    "TIMELINE"
  ],
  "inputs": [
    {
      "name": "targetId",
      "type": "ANY",
      "required": false,
      "description": "Field center identifier"
    }
  ],
  "parameters": [
    {
      "name": "count",
      "type": "I32",
      "min": 1,
      "max": 144,
      "default": 21,
      "description": "Count of procedural field nodes"
    },
    {
      "name": "goldenAngle",
      "type": "FIXED",
      "min": 0,
      "max": 360,
      "default": 137.5,
      "description": "Divergence angle in degrees"
    }
  ],
  "output": {
    "type": "ANY",
    "description": "Immutable Fibonacci spiral field distribution descriptor"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "CONSTANT",
    "multiplier": 1,
    "fixed": 10
  },
  "order": 112,
  "relevance": {
    "pipelines": [
      "world-voxel"
    ],
    "conditions": []
  },
  "checksum": "9f93e00722619a33608f6010ad5935c000dd5f525d4bc66ef3d034a2fa69db18"
});

export const FIBONACCI_SEED_FIELD_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.fibonacci-seed-field",
  "version": "1.0.0",
  "execution": "DESCRIPTOR",
  "stage": "RUNTIME_DESCRIPTOR",
  "scope": [
    "ASSET",
    "TIMELINE"
  ],
  "inputs": [
    {
      "name": "targetId",
      "type": "ANY",
      "required": false,
      "description": "Seed origin identifier"
    }
  ],
  "parameters": [
    {
      "name": "seed",
      "type": "I32",
      "default": 42,
      "description": "PRNG seed"
    },
    {
      "name": "points",
      "type": "I32",
      "min": 1,
      "max": 89,
      "default": 13,
      "description": "Number of phyllotaxis seed points"
    }
  ],
  "output": {
    "type": "ANY",
    "description": "Immutable phyllotaxis seed point distribution descriptor"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "CONSTANT",
    "multiplier": 1,
    "fixed": 10
  },
  "order": 113,
  "relevance": {
    "pipelines": [
      "world-voxel"
    ],
    "conditions": []
  },
  "checksum": "6d5f050c81942d46968b21cb0c3da0042ef3c5581a3ac9f9f21bf3ded47d51ee"
});

export const FLAME_TIP_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.flame-tip",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "SHAPE_POST",
  "scope": [
    "SHAPE"
  ],
  "inputs": [
    {
      "name": "geometry",
      "type": "SHAPE",
      "required": true,
      "description": "Flame or motif apex geometry"
    }
  ],
  "parameters": [
    {
      "name": "intensity",
      "type": "FIXED",
      "min": 0,
      "max": 1,
      "default": 0.7,
      "description": "Flame tip thermal luminance intensity"
    }
  ],
  "output": {
    "type": "SHAPE",
    "description": "Apex geometry with dynamic flame taper and gradient tips"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 2,
    "fixed": 0
  },
  "order": 46,
  "relevance": {
    "pipelines": [
      "item"
    ],
    "conditions": [
      {
        "field": "materials",
        "op": "includes",
        "value": "fire"
      }
    ]
  },
  "checksum": "3f85a97e7a59f23c93353bcd69a90aac7e669d1af40cb5f282024ae48d3d5226"
});

export const GEAR_GLIDE_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.gear-glide",
  "version": "1.0.0",
  "execution": "DESCRIPTOR",
  "stage": "RUNTIME_DESCRIPTOR",
  "scope": [
    "TIMELINE",
    "ASSET"
  ],
  "inputs": [
    {
      "name": "targetId",
      "type": "ANY",
      "required": false,
      "description": "Optional target layer or shape identifier"
    }
  ],
  "parameters": [
    {
      "name": "bpm",
      "type": "I32",
      "min": 40,
      "max": 220,
      "default": 90,
      "description": "BPM tempo sync rate"
    },
    {
      "name": "degreesPerBeat",
      "type": "I32",
      "min": 15,
      "max": 360,
      "default": 90,
      "description": "Angular rotation degrees advanced per beat"
    }
  ],
  "output": {
    "type": "ANY",
    "description": "Immutable runtime motion and rotation descriptor"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "CONSTANT",
    "multiplier": 1,
    "fixed": 10
  },
  "order": 110,
  "relevance": {
    "pipelines": [
      "runtime"
    ],
    "conditions": [
      {
        "field": "tags",
        "op": "includes",
        "value": "gear"
      }
    ]
  },
  "checksum": "ea7ac201b94a7f48f78b061cc2e197343c8a613259ca9770c5e2adf5d22d6ebe"
});

export const GEOMETRY_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.geometry",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "SHAPE_POST",
  "scope": [
    "SHAPE",
    "LAYER"
  ],
  "inputs": [
    {
      "name": "geometry",
      "type": "SHAPE",
      "required": true,
      "description": "Input shape geometry to classify and structure"
    }
  ],
  "parameters": [
    {
      "name": "classifyRoles",
      "type": "BOOL",
      "default": true,
      "description": "Whether to classify semantic roles"
    }
  ],
  "output": {
    "type": "SHAPE",
    "description": "Geometry annotated with role classifications and bounding masks"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 2,
    "fixed": 0
  },
  "order": 30,
  "relevance": {
    "pipelines": [
      "item",
      "render-fidelity"
    ],
    "conditions": []
  },
  "checksum": "c004b839cca309fe3e775276413964f75d05f0695ff5635386a7ab72034cdce9"
});

export const GRASS_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.grass",
  "version": "1.0.0",
  "execution": "DESCRIPTOR",
  "stage": "WORLD_DESCRIPTOR",
  "scope": [
    "ASSET"
  ],
  "inputs": [
    {
      "name": "targetId",
      "type": "ANY",
      "required": false,
      "description": "Surface terrain identifier"
    }
  ],
  "parameters": [
    {
      "name": "bladeDensity",
      "type": "FIXED",
      "min": 0,
      "max": 1,
      "default": 0.6,
      "description": "Grass blade ground cover density"
    }
  ],
  "output": {
    "type": "ANY",
    "description": "Immutable procedural grass surface descriptor"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "CONSTANT",
    "multiplier": 1,
    "fixed": 10
  },
  "order": 105,
  "relevance": {
    "pipelines": [
      "world-voxel"
    ],
    "conditions": []
  },
  "checksum": "6f3201b16e8fee3685d6d5add5c19da1fd170b1b7c4986c10af183d1da56fbf0"
});

export const GRAVITY_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.gravity",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "SHAPE_POST",
  "scope": [
    "SHAPE"
  ],
  "inputs": [
    {
      "name": "geometry",
      "type": "SHAPE",
      "required": true,
      "description": "Shape geometry receiving directional gravity"
    }
  ],
  "parameters": [
    {
      "name": "steps",
      "type": "I32",
      "min": 1,
      "max": 32,
      "default": 6,
      "description": "Gravitational descent gradient steps"
    },
    {
      "name": "energyType",
      "type": "ANY",
      "default": "STRUCTURAL",
      "description": "Structural energy classification"
    }
  ],
  "output": {
    "type": "SHAPE",
    "description": "Shape geometry with gravitational weight bias and energy vectors"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 2,
    "fixed": 0
  },
  "order": 38,
  "relevance": {
    "pipelines": [
      "character"
    ],
    "conditions": []
  },
  "checksum": "056df6e0fe68c16e0f821c636e50c9c7cf12c149f8235e0c8d81f6537a5e4870"
});

export const HAIR_FLOW_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.hair-flow",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "SHAPE_POST",
  "scope": [
    "SHAPE"
  ],
  "inputs": [
    {
      "name": "geometry",
      "type": "SHAPE",
      "required": true,
      "description": "Base head or crown geometry"
    }
  ],
  "parameters": [
    {
      "name": "direction",
      "type": "ANGLE",
      "default": 90,
      "description": "Dominant hair flow angle in degrees"
    },
    {
      "name": "strands",
      "type": "I32",
      "min": 1,
      "max": 32,
      "default": 8,
      "description": "Count of procedural hair strands"
    }
  ],
  "output": {
    "type": "SHAPE",
    "description": "Geometry with flowing hair clumps and strand vectors"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 3,
    "fixed": 0
  },
  "order": 36,
  "relevance": {
    "pipelines": [
      "character"
    ],
    "conditions": []
  },
  "checksum": "3ab5d38db2d336e56533a4edab78b265099bf102518ac72f489a97122db4aee0"
});

export const HEIGHTMAP_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.heightmap",
  "version": "1.0.0",
  "execution": "DESCRIPTOR",
  "stage": "WORLD_DESCRIPTOR",
  "scope": [
    "ASSET"
  ],
  "inputs": [
    {
      "name": "targetId",
      "type": "ANY",
      "required": false,
      "description": "Heightmap grid identifier"
    }
  ],
  "parameters": [
    {
      "name": "maxElevation",
      "type": "I32",
      "min": 1,
      "max": 64,
      "default": 16,
      "description": "Maximum surface height elevation in cells"
    }
  ],
  "output": {
    "type": "ANY",
    "description": "Immutable 2D grid heightmap terrain elevation descriptor"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "CONSTANT",
    "multiplier": 1,
    "fixed": 10
  },
  "order": 111,
  "relevance": {
    "pipelines": [
      "world-voxel"
    ],
    "conditions": []
  },
  "checksum": "24834ecf94ff2a89f46eaffa817e8af394f5b970accc50c460adeb0b23efbc83"
});

export const HERALDRY_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.heraldry",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "SHAPE_POST",
  "scope": [
    "SHAPE"
  ],
  "inputs": [
    {
      "name": "geometry",
      "type": "SHAPE",
      "required": true,
      "description": "Escutcheon or emblem field geometry"
    }
  ],
  "parameters": [
    {
      "name": "charge",
      "type": "ANY",
      "default": "lion",
      "description": "Heraldic charge emblem"
    },
    {
      "name": "division",
      "type": "ANY",
      "default": "pale",
      "description": "Heraldic field partition division"
    }
  ],
  "output": {
    "type": "SHAPE",
    "description": "Structured shield face geometry with partitioned heraldic charge"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 2,
    "fixed": 0
  },
  "order": 48,
  "relevance": {
    "pipelines": [
      "item"
    ],
    "conditions": [
      {
        "field": "tags",
        "op": "includes",
        "value": "heraldry"
      }
    ]
  },
  "checksum": "2ba45bc830c713ca22e77c2e8bc71d50217b28927de9ce5e4744a5242d8bd558"
});

export const HOLLOWNESS_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.hollowness",
  "version": "1.0.0",
  "execution": "DESCRIPTOR",
  "stage": "WORLD_DESCRIPTOR",
  "scope": [
    "ASSET"
  ],
  "inputs": [
    {
      "name": "targetId",
      "type": "ANY",
      "required": false,
      "description": "Target volume identifier"
    }
  ],
  "parameters": [
    {
      "name": "innerRadius",
      "type": "I32",
      "min": 1,
      "max": 16,
      "default": 3,
      "description": "Inner cavity hollow radius in voxels"
    }
  ],
  "output": {
    "type": "ANY",
    "description": "Immutable hollow cavity descriptor"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "CONSTANT",
    "multiplier": 1,
    "fixed": 10
  },
  "order": 102,
  "relevance": {
    "pipelines": [
      "world-voxel"
    ],
    "conditions": []
  },
  "checksum": "cbdc949fcef0a6c0be91d28a8a7a5e9783e999abb6933b7bf959a13de93b400d"
});

export const HOLYFIRE_MOTIF_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.holyfire-motif",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "PAINT",
  "scope": [
    "LAYER",
    "SHAPE"
  ],
  "inputs": [
    {
      "name": "target",
      "type": "LAYER",
      "required": true,
      "description": "Motif layer receiving holyfire illumination"
    }
  ],
  "parameters": [
    {
      "name": "radiance",
      "type": "FIXED",
      "min": 0,
      "max": 1,
      "default": 0.9,
      "description": "Holyfire radiance aura strength"
    }
  ],
  "output": {
    "type": "LAYER",
    "description": "Layer with radiant holyfire halo and chromatic glow coordinates"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 3,
    "fixed": 0
  },
  "order": 54,
  "relevance": {
    "pipelines": [
      "item"
    ],
    "conditions": [
      {
        "field": "materials",
        "op": "includes",
        "value": "holy"
      }
    ]
  },
  "checksum": "5b4653e72048f8530e93c6484f89d1b694be56b598e394101e1067fea82ccac1"
});

export const IMAGE_SEGMENTATION_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.image-segmentation",
  "version": "1.0.0",
  "execution": "ANALYZE",
  "stage": "SOURCE_ANALYSIS",
  "scope": [
    "PROGRAM",
    "ASSET"
  ],
  "inputs": [
    {
      "name": "target",
      "type": "LAYER",
      "required": true,
      "description": "Source layer to analyze into connected-component regions"
    }
  ],
  "parameters": [
    {
      "name": "minRegionSize",
      "type": "I32",
      "min": 1,
      "max": 100,
      "default": 5,
      "description": "Minimum cell count to form an independent slab"
    }
  ],
  "output": {
    "type": "LAYER",
    "description": "Analyzed layer with segmented region tags"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 3,
    "fixed": 0
  },
  "order": 10,
  "relevance": {
    "pipelines": [
      "image-lattice"
    ],
    "conditions": []
  },
  "checksum": "aa840a748b9aae2ab6cfecab4f2817626f5bccdcbf4d472cc6e3af289bf49122"
});

export const ISO_TILE_GEOMETRY_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.iso-tile-geometry",
  "version": "1.0.0",
  "execution": "DESCRIPTOR",
  "stage": "WORLD_DESCRIPTOR",
  "scope": [
    "ASSET"
  ],
  "inputs": [
    {
      "name": "targetId",
      "type": "ANY",
      "required": false,
      "description": "Tile mesh identifier"
    }
  ],
  "parameters": [
    {
      "name": "tileWidth",
      "type": "I32",
      "min": 8,
      "max": 128,
      "default": 32,
      "description": "Isometric tile diamond width"
    },
    {
      "name": "tileHeight",
      "type": "I32",
      "min": 4,
      "max": 64,
      "default": 16,
      "description": "Isometric tile diamond height"
    }
  ],
  "output": {
    "type": "ANY",
    "description": "Immutable isometric tile geometry descriptor"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "CONSTANT",
    "multiplier": 1,
    "fixed": 10
  },
  "order": 108,
  "relevance": {
    "pipelines": [
      "world-voxel"
    ],
    "conditions": []
  },
  "checksum": "713e8acfbc003ffd156a1a87be71de57cbb4c102238dd3d32772149365d9650d"
});

export const JEWELRY_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.jewelry",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "SHAPE_POST",
  "scope": [
    "SHAPE"
  ],
  "inputs": [
    {
      "name": "geometry",
      "type": "SHAPE",
      "required": true,
      "description": "Gemstone or bezel geometry"
    }
  ],
  "parameters": [
    {
      "name": "cut",
      "type": "ANY",
      "default": "brilliant",
      "description": "Gemstone cut style"
    },
    {
      "name": "gemType",
      "type": "MATERIAL",
      "default": "ruby",
      "description": "Gem mineral material type"
    }
  ],
  "output": {
    "type": "SHAPE",
    "description": "Faceted jewel geometry with pavilion and bezel rim structure"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 3,
    "fixed": 0
  },
  "order": 47,
  "relevance": {
    "pipelines": [
      "item"
    ],
    "conditions": [
      {
        "field": "tags",
        "op": "includes",
        "value": "jewelry"
      }
    ]
  },
  "checksum": "45cd3b2ded27ae2bc12a67ab8affd29e025569c100ad2a856c4a72d127f32609"
});

export const MATERIAL_RESOLVER_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.material-resolver",
  "version": "1.0.0",
  "execution": "DESCRIPTOR",
  "stage": "WORLD_DESCRIPTOR",
  "scope": [
    "ASSET"
  ],
  "inputs": [
    {
      "name": "targetId",
      "type": "ANY",
      "required": false,
      "description": "Target material identifier"
    }
  ],
  "parameters": [
    {
      "name": "fallback",
      "type": "MATERIAL",
      "default": "void",
      "description": "Fallback material palette identifier"
    }
  ],
  "output": {
    "type": "ANY",
    "description": "Immutable material resolution table descriptor"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "CONSTANT",
    "multiplier": 1,
    "fixed": 5
  },
  "order": 107,
  "relevance": {
    "pipelines": [
      "world-voxel"
    ],
    "conditions": []
  },
  "checksum": "8b861486e8cb38a4a1c5023585f32f79512bdc266ea18577cb62fc4f3e8f2ebd"
});

export const NEIGHBOR_EXTRAPOLATION_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.neighbor-extrapolation",
  "version": "1.0.0",
  "execution": "ANALYZE",
  "stage": "SOURCE_ANALYSIS",
  "scope": [
    "LAYER",
    "PROGRAM"
  ],
  "inputs": [
    {
      "name": "target",
      "type": "LAYER",
      "required": true,
      "description": "Source layer to analyze and smooth neighbor transitions"
    }
  ],
  "parameters": [
    {
      "name": "iterations",
      "type": "I32",
      "min": 1,
      "max": 10,
      "default": 1,
      "description": "Smoothing iteration passes"
    }
  ],
  "output": {
    "type": "LAYER",
    "description": "Analyzed layer with smoothed neighbor cell transitions"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 3,
    "fixed": 0
  },
  "order": 12,
  "relevance": {
    "pipelines": [
      "image-lattice"
    ],
    "conditions": []
  },
  "checksum": "f03f4f3c6fa75d78846b7abc22f3707831d72d88e6a06777e3e0b859f6fc3609"
});

export const NOISE_FILL_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.noise-fill",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "PAINT",
  "scope": [
    "LAYER",
    "SHAPE"
  ],
  "inputs": [
    {
      "name": "target",
      "type": "LAYER",
      "required": true,
      "description": "Layer or paint cells whose intensities are modulated with deterministic noise"
    }
  ],
  "parameters": [
    {
      "name": "seed",
      "type": "I32",
      "min": 0,
      "max": 2147483647,
      "default": 1337,
      "description": "Deterministic PRNG seed"
    },
    {
      "name": "frequency",
      "type": "FIXED",
      "min": 0,
      "max": 1,
      "default": 0.1,
      "description": "Noise spatial frequency"
    }
  ],
  "output": {
    "type": "LAYER",
    "description": "Layer with modulated cell intensity metadata"
  },
  "determinism": {
    "class": "SEEDED",
    "seedRequired": true
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 3,
    "fixed": 0
  },
  "order": 60,
  "relevance": {
    "pipelines": [
      "item",
      "render-fidelity"
    ],
    "conditions": [
      {
        "field": "materials",
        "op": "includes",
        "value": "noise"
      }
    ]
  },
  "checksum": "7e638f20f68d68093f1266246edadc27f1d00f9f59a0fb2d32c6400d548d52e0"
});

export const NOISE_MASK_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.noise-mask",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "MASK",
  "scope": [
    "MASK"
  ],
  "inputs": [
    {
      "name": "mask",
      "type": "MASK",
      "required": true,
      "description": "Input mask to modulate with procedural noise"
    }
  ],
  "parameters": [
    {
      "name": "cutoff",
      "type": "FIXED",
      "min": 0,
      "max": 1,
      "default": 0.5,
      "description": "Threshold cutoff for mask cell inclusion"
    }
  ],
  "output": {
    "type": "MASK",
    "description": "Procedurally noisy raster mask"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 2,
    "fixed": 0
  },
  "order": 48,
  "relevance": {
    "pipelines": [
      "world-voxel"
    ],
    "conditions": []
  },
  "checksum": "651ac144851612d27c60848ffef50b701e8afdae8ac9920daf23655773c60d00"
});

export const PALETTE_QUANTIZATION_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.palette-quantization",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "LAYER_POST",
  "scope": [
    "LAYER"
  ],
  "inputs": [
    {
      "name": "layer",
      "type": "LAYER",
      "required": true,
      "description": "Rendered layer whose colors are quantized"
    }
  ],
  "parameters": [
    {
      "name": "colors",
      "type": "I32",
      "min": 2,
      "max": 256,
      "default": 16,
      "description": "Maximum distinct color budget"
    },
    {
      "name": "dither",
      "type": "BOOL",
      "default": false,
      "description": "Whether to apply error diffusion dithering"
    }
  ],
  "output": {
    "type": "LAYER",
    "description": "Layer quantized strictly to palette slot budget"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 4,
    "fixed": 0
  },
  "order": 80,
  "relevance": {
    "pipelines": [
      "render-fidelity"
    ],
    "conditions": []
  },
  "checksum": "8432982ffab3a2031c1d62f81ce92d43705b71b1fe544d649af35407d8dfab0b"
});

export const PERLIN_FIELD_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.perlin-field",
  "version": "1.0.0",
  "execution": "DESCRIPTOR",
  "stage": "RUNTIME_DESCRIPTOR",
  "scope": [
    "ASSET",
    "TIMELINE"
  ],
  "inputs": [
    {
      "name": "targetId",
      "type": "ANY",
      "required": false,
      "description": "Noise field origin identifier"
    }
  ],
  "parameters": [
    {
      "name": "scale",
      "type": "FIXED",
      "min": 0.01,
      "max": 10,
      "default": 0.1,
      "description": "Perlin noise coordinate frequency"
    },
    {
      "name": "octaves",
      "type": "I32",
      "min": 1,
      "max": 8,
      "default": 3,
      "description": "Perlin octave fractal depth"
    }
  ],
  "output": {
    "type": "ANY",
    "description": "Immutable coherent Perlin noise field descriptor"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "CONSTANT",
    "multiplier": 1,
    "fixed": 10
  },
  "order": 114,
  "relevance": {
    "pipelines": [
      "world-voxel"
    ],
    "conditions": []
  },
  "checksum": "9b260b09643438d313f6ccccaf0a9d1ecadd4baebf06aea1922531f7f9e840b9"
});

export const PIXEL_AA_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.pixel-aa",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "LAYER_POST",
  "scope": [
    "LAYER"
  ],
  "inputs": [
    {
      "name": "layer",
      "type": "LAYER",
      "required": true,
      "description": "Layer whose raster paint cells receive anti-aliasing"
    }
  ],
  "parameters": [
    {
      "name": "strength",
      "type": "FIXED",
      "min": 0,
      "max": 1,
      "default": 1,
      "description": "Anti-aliasing corner softening factor"
    }
  ],
  "output": {
    "type": "LAYER",
    "description": "Layer with anti-aliased perimeter cells"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 2,
    "fixed": 0
  },
  "order": 70,
  "relevance": {
    "pipelines": [
      "render-fidelity"
    ],
    "conditions": []
  },
  "checksum": "7ae8d3114ba8d547dc1b7b36c08a83f703e0213f1a3f3ad2017ac5acd3789b0e"
});

export const PIXEL_SCALE_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.pixel-scale",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "RENDER",
  "scope": [
    "LAYER",
    "ASSET"
  ],
  "inputs": [
    {
      "name": "layer",
      "type": "LAYER",
      "required": true,
      "description": "Rendered layer receiving pixel-art upscaling"
    }
  ],
  "parameters": [
    {
      "name": "scale",
      "type": "I32",
      "min": 1,
      "max": 8,
      "default": 2,
      "description": "Upscaling factor multiplier"
    },
    {
      "name": "mode",
      "type": "ANY",
      "default": "xbr",
      "description": "Upscaling algorithm mode"
    }
  ],
  "output": {
    "type": "LAYER",
    "description": "High-resolution upscaled pixel art layer"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 4,
    "fixed": 0
  },
  "order": 85,
  "relevance": {
    "pipelines": [
      "image-lattice"
    ],
    "conditions": []
  },
  "checksum": "0f1f30c8aaf655825aeb41a2dbf6643e7cbf9e75234d48806797ddaf2bcb0937"
});

export const REGION_FILL_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.region-fill",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "PAINT",
  "scope": [
    "LAYER",
    "SHAPE"
  ],
  "inputs": [
    {
      "name": "target",
      "type": "LAYER",
      "required": true,
      "description": "Target layer whose regions receive material palette fill"
    }
  ],
  "parameters": [
    {
      "name": "material",
      "type": "MATERIAL",
      "default": "void",
      "description": "Material palette identifier"
    },
    {
      "name": "anchor",
      "type": "ANY",
      "default": "body",
      "description": "Palette anchor slot"
    }
  ],
  "output": {
    "type": "LAYER",
    "description": "Layer with region-filled color coordinates"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 3,
    "fixed": 0
  },
  "order": 50,
  "relevance": {
    "pipelines": [
      "item",
      "render-fidelity"
    ],
    "conditions": []
  },
  "checksum": "93dc839c8bb71dab12f331e6218f2b4e0f9a9464c81fb512faa4450c054e40cf"
});

export const SCHOLOMANCE_CHARACTER_MOTIF_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.scholomance-character-motif",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "PAINT",
  "scope": [
    "LAYER",
    "SHAPE"
  ],
  "inputs": [
    {
      "name": "target",
      "type": "LAYER",
      "required": true,
      "description": "Character layer receiving arcane school motifs"
    }
  ],
  "parameters": [
    {
      "name": "school",
      "type": "MATERIAL",
      "default": "void",
      "description": "Arcane school identifier"
    },
    {
      "name": "intensity",
      "type": "FIXED",
      "min": 0,
      "max": 1,
      "default": 0.7,
      "description": "Motif rune glow intensity"
    }
  ],
  "output": {
    "type": "LAYER",
    "description": "Character layer injected with school-specific rune and sigil accents"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 2,
    "fixed": 0
  },
  "order": 56,
  "relevance": {
    "pipelines": [
      "character"
    ],
    "conditions": []
  },
  "checksum": "70332984f2261bda08374fa6bfa4f52c82a8f3ab8ab0c20fb9bc4acb03b207c2"
});

export const SCHOOL_TAG_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.school-tag",
  "version": "1.0.0",
  "execution": "DESCRIPTOR",
  "stage": "WORLD_DESCRIPTOR",
  "scope": [
    "ASSET"
  ],
  "inputs": [
    {
      "name": "targetId",
      "type": "ANY",
      "required": false,
      "description": "Asset identifier"
    }
  ],
  "parameters": [
    {
      "name": "school",
      "type": "MATERIAL",
      "default": "void",
      "description": "Arcane school classification"
    }
  ],
  "output": {
    "type": "ANY",
    "description": "Immutable world school affiliation descriptor"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "CONSTANT",
    "multiplier": 1,
    "fixed": 5
  },
  "order": 104,
  "relevance": {
    "pipelines": [
      "world-voxel"
    ],
    "conditions": []
  },
  "checksum": "7ac0805fcdf61490c2f788c28d4e544692f8e226debeb317552ad2ae591ee278"
});

export const SDF_SHAPE_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.sdf-shape",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "SHAPE_POST",
  "scope": [
    "SHAPE"
  ],
  "inputs": [
    {
      "name": "geometry",
      "type": "SHAPE",
      "required": true,
      "description": "Input shape or SDF primitive descriptor"
    }
  ],
  "parameters": [
    {
      "name": "threshold",
      "type": "FIXED",
      "min": -1,
      "max": 1,
      "default": 0,
      "description": "SDF boundary isovalue threshold"
    }
  ],
  "output": {
    "type": "SHAPE",
    "description": "Quantized shape geometry sampled from signed distance field"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 4,
    "fixed": 0
  },
  "order": 35,
  "relevance": {
    "pipelines": [
      "item"
    ],
    "conditions": []
  },
  "checksum": "1ab69f52d1f868434814df90bc21e135698d183b1f6c0b4bf0b28a9bbf510ff2"
});

export const SELOUT_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.selout",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "LAYER_POST",
  "scope": [
    "LAYER"
  ],
  "inputs": [
    {
      "name": "layer",
      "type": "LAYER",
      "required": true,
      "description": "Layer whose perimeter outline is modulated"
    }
  ],
  "parameters": [
    {
      "name": "lightAngle",
      "type": "ANGLE",
      "default": 225,
      "description": "Directional light angle in degrees"
    },
    {
      "name": "threshold",
      "type": "FIXED",
      "min": 0,
      "max": 1,
      "default": 0.3,
      "description": "Dot-product lighting threshold"
    }
  ],
  "output": {
    "type": "LAYER",
    "description": "Layer with selective directional outline modulation"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 2,
    "fixed": 0
  },
  "order": 75,
  "relevance": {
    "pipelines": [
      "item",
      "render-fidelity"
    ],
    "conditions": []
  },
  "checksum": "255845876ae139c5c2ad4ef8965d807adc040daeb68cf6f33bee50ee8d64d6f6"
});

export const SHADOW_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.shadow",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "LAYER_POST",
  "scope": [
    "LAYER"
  ],
  "inputs": [
    {
      "name": "layer",
      "type": "LAYER",
      "required": true,
      "description": "Layer receiving cast occlusion shadows"
    }
  ],
  "parameters": [
    {
      "name": "elevation",
      "type": "I32",
      "min": 0,
      "max": 10,
      "default": 1,
      "description": "Layer height elevation offset"
    },
    {
      "name": "angle",
      "type": "ANGLE",
      "default": 225,
      "description": "Cast shadow angle in degrees"
    },
    {
      "name": "opacity",
      "type": "FIXED",
      "min": 0,
      "max": 1,
      "default": 0.5,
      "description": "Shadow opacity factor"
    }
  ],
  "output": {
    "type": "LAYER",
    "description": "Layer with synthesized contact and drop shadows"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 2,
    "fixed": 0
  },
  "order": 72,
  "relevance": {
    "pipelines": [
      "render-fidelity"
    ],
    "conditions": []
  },
  "checksum": "db7de2995ba81eeaf0d40375296587e42ab90c592255d766321c267a5eb85869"
});

export const SHIELD_RIM_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.shield-rim",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "SHAPE_POST",
  "scope": [
    "SHAPE"
  ],
  "inputs": [
    {
      "name": "geometry",
      "type": "SHAPE",
      "required": true,
      "description": "Base shield geometry"
    }
  ],
  "parameters": [
    {
      "name": "thickness",
      "type": "I32",
      "min": 1,
      "max": 8,
      "default": 2,
      "description": "Outer rim border thickness in cells"
    }
  ],
  "output": {
    "type": "SHAPE",
    "description": "Shield geometry with programmatic outer border and rim frame"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 2,
    "fixed": 0
  },
  "order": 42,
  "relevance": {
    "pipelines": [
      "item"
    ],
    "conditions": [
      {
        "field": "archetype",
        "op": "includes",
        "value": "shield"
      }
    ]
  },
  "checksum": "23a79b855af3da463d113db199482688b9d0682c133925b8f67a36e84c78d3a0"
});

export const SHIELD_VOLUME_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.shield-volume",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "SHAPE_POST",
  "scope": [
    "SHAPE"
  ],
  "inputs": [
    {
      "name": "geometry",
      "type": "SHAPE",
      "required": true,
      "description": "Shield face geometry"
    }
  ],
  "parameters": [
    {
      "name": "curvature",
      "type": "FIXED",
      "min": 0,
      "max": 1,
      "default": 0.5,
      "description": "Curved face shading gradient factor"
    }
  ],
  "output": {
    "type": "SHAPE",
    "description": "Shield geometry with volumetric face shading and rim cast shadows"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 3,
    "fixed": 0
  },
  "order": 43,
  "relevance": {
    "pipelines": [
      "item"
    ],
    "conditions": [
      {
        "field": "archetype",
        "op": "includes",
        "value": "shield"
      }
    ]
  },
  "checksum": "1bb5a8e36421018fc99c44187a57b7fc753d85bce42bbbba16208b940c57cb0f"
});

export const SKETCH_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.sketch",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "CONSTRUCTION",
  "scope": [
    "SHAPE",
    "ASSET"
  ],
  "inputs": [
    {
      "name": "geometry",
      "type": "SHAPE",
      "required": true,
      "description": "Raw silhouette or construction geometry"
    }
  ],
  "parameters": [
    {
      "name": "bands",
      "type": "I32",
      "min": 2,
      "max": 8,
      "default": 4,
      "description": "Number of auto-shaded contour bands"
    }
  ],
  "output": {
    "type": "SHAPE",
    "description": "Auto-shaded template shape with construction guidelines"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 3,
    "fixed": 0
  },
  "order": 20,
  "relevance": {
    "pipelines": [
      "item"
    ],
    "conditions": []
  },
  "checksum": "30fd0fcb9bb9324f83a5d0895d6537ceb7edb0bd620f2f3badbb36f53835190b"
});

export const SQUARE_SHARPNESS_CONTRAST_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.square-sharpness-contrast",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "LAYER_POST",
  "scope": [
    "LAYER"
  ],
  "inputs": [
    {
      "name": "layer",
      "type": "LAYER",
      "required": true,
      "description": "Layer receiving pixel contrast sharpening"
    }
  ],
  "parameters": [
    {
      "name": "sharpness",
      "type": "FIXED",
      "min": 0,
      "max": 1,
      "default": 0.5,
      "description": "Lattice edge sharpening intensity"
    }
  ],
  "output": {
    "type": "LAYER",
    "description": "Layer with crisped pixel boundaries and local contrast enhancement"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 2,
    "fixed": 0
  },
  "order": 74,
  "relevance": {
    "pipelines": [
      "render-fidelity"
    ],
    "conditions": []
  },
  "checksum": "a7c5b4e5ef60161155d3c3045def2d7e29084d51621ef48438aa6917a30680e4"
});

export const SYMMETRY_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.symmetry",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "SHAPE_POST",
  "scope": [
    "SHAPE",
    "LAYER"
  ],
  "inputs": [
    {
      "name": "geometry",
      "type": "SHAPE",
      "required": true,
      "description": "Input shape to mirror across a symmetry plane"
    }
  ],
  "parameters": [
    {
      "name": "axis",
      "type": "ANY",
      "default": "VERTICAL",
      "description": "Symmetry axis (VERTICAL or HORIZONTAL)"
    }
  ],
  "output": {
    "type": "SHAPE",
    "description": "Symmetrically mirrored shape geometry"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 2,
    "fixed": 0
  },
  "order": 45,
  "relevance": {
    "pipelines": [
      "item"
    ],
    "conditions": []
  },
  "checksum": "775e87eeaba30273d779eaaf807594bb44126213f3dbd3bcaab905b6d59b2531"
});

export const TILE_SOCKET_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.tile-socket",
  "version": "1.0.0",
  "execution": "DESCRIPTOR",
  "stage": "WORLD_DESCRIPTOR",
  "scope": [
    "ASSET"
  ],
  "inputs": [
    {
      "name": "targetId",
      "type": "ANY",
      "required": false,
      "description": "Tile socket identifier"
    }
  ],
  "parameters": [
    {
      "name": "socketMask",
      "type": "I32",
      "min": 0,
      "max": 255,
      "default": 15,
      "description": "Edge connection bitmask"
    }
  ],
  "output": {
    "type": "ANY",
    "description": "Immutable Wang tile socket adjacency descriptor"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "CONSTANT",
    "multiplier": 1,
    "fixed": 5
  },
  "order": 109,
  "relevance": {
    "pipelines": [
      "world-voxel"
    ],
    "conditions": []
  },
  "checksum": "c9afee74d86b6b0e90455be058fdeb962ced236550c37ef08896885c199ef126"
});

export const TONATION_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.tonation",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "LAYER_POST",
  "scope": [
    "LAYER"
  ],
  "inputs": [
    {
      "name": "layer",
      "type": "LAYER",
      "required": true,
      "description": "Layer receiving material color tone balancing"
    }
  ],
  "parameters": [
    {
      "name": "warmth",
      "type": "FIXED",
      "min": 0,
      "max": 1,
      "default": 0.5,
      "description": "Color temperature warmth bias"
    },
    {
      "name": "contrast",
      "type": "FIXED",
      "min": 0,
      "max": 1,
      "default": 0.5,
      "description": "Midtone tonal contrast"
    }
  ],
  "output": {
    "type": "LAYER",
    "description": "Layer with balanced material-specific color tonation"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 2,
    "fixed": 0
  },
  "order": 76,
  "relevance": {
    "pipelines": [
      "render-fidelity"
    ],
    "conditions": []
  },
  "checksum": "c63f97240d479e6a60621d02adc16a4a17ff5b2e6a7ad080cc6e57d3073fdc01"
});

export const VECTOR_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.vector",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "SHAPE_POST",
  "scope": [
    "SHAPE"
  ],
  "inputs": [
    {
      "name": "geometry",
      "type": "SHAPE",
      "required": true,
      "description": "Vector path or polygon geometry"
    }
  ],
  "parameters": [
    {
      "name": "subdivide",
      "type": "I32",
      "min": 1,
      "max": 4,
      "default": 1,
      "description": "Subdivision refinement passes"
    }
  ],
  "output": {
    "type": "SHAPE",
    "description": "Subdivided high-fidelity vector shape geometry"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 3,
    "fixed": 0
  },
  "order": 49,
  "relevance": {
    "pipelines": [
      "render-fidelity",
      "item"
    ],
    "conditions": []
  },
  "checksum": "b6954d4bc71332ed9c15a96dfd99f313d87187aa9d055d3543b88601568da5e3"
});

export const VOLUME_LIFT_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.volume-lift",
  "version": "1.0.0",
  "execution": "DESCRIPTOR",
  "stage": "WORLD_DESCRIPTOR",
  "scope": [
    "ASSET"
  ],
  "inputs": [
    {
      "name": "targetId",
      "type": "ANY",
      "required": false,
      "description": "Target asset identifier"
    }
  ],
  "parameters": [
    {
      "name": "liftHeight",
      "type": "I32",
      "min": 1,
      "max": 32,
      "default": 4,
      "description": "Voxel elevation lift height in units"
    }
  ],
  "output": {
    "type": "ANY",
    "description": "Immutable volume lift world descriptor"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "CONSTANT",
    "multiplier": 1,
    "fixed": 10
  },
  "order": 101,
  "relevance": {
    "pipelines": [
      "world-voxel"
    ],
    "conditions": []
  },
  "checksum": "a143ca343bb69a53efb817e2200c5acd54e184ff4f391f7b8ac3267ba2f1fb73"
});

export const VOLUME_PROCESSOR_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.volume-processor",
  "version": "1.0.0",
  "execution": "DESCRIPTOR",
  "stage": "WORLD_DESCRIPTOR",
  "scope": [
    "ASSET"
  ],
  "inputs": [
    {
      "name": "targetId",
      "type": "ANY",
      "required": false,
      "description": "Volume grid identifier"
    }
  ],
  "parameters": [
    {
      "name": "subsample",
      "type": "I32",
      "min": 1,
      "max": 8,
      "default": 1,
      "description": "Voxel volume subsampling rate"
    }
  ],
  "output": {
    "type": "ANY",
    "description": "Immutable processed voxel volume grid descriptor"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "CONSTANT",
    "multiplier": 1,
    "fixed": 10
  },
  "order": 110,
  "relevance": {
    "pipelines": [
      "world-voxel"
    ],
    "conditions": []
  },
  "checksum": "9c089bb8d7bb6c8b434e09e985f97630b600453f777998535b66a2125947ae7c"
});

export const VOLUME_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.volume",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "SHAPE_POST",
  "scope": [
    "SHAPE"
  ],
  "inputs": [
    {
      "name": "geometry",
      "type": "SHAPE",
      "required": true,
      "description": "Shape geometry receiving volumetric depth"
    }
  ],
  "parameters": [
    {
      "name": "depth",
      "type": "I32",
      "min": 1,
      "max": 16,
      "default": 3,
      "description": "Extrusion depth in cells"
    },
    {
      "name": "lightZ",
      "type": "FIXED",
      "min": 0,
      "max": 1,
      "default": 0.7,
      "description": "Z-axis light height elevation"
    }
  ],
  "output": {
    "type": "SHAPE",
    "description": "Shape geometry with synthesized volumetric depth normals and shading"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "LINEAR_IN_CELLS",
    "multiplier": 3,
    "fixed": 0
  },
  "order": 50,
  "relevance": {
    "pipelines": [
      "render-fidelity"
    ],
    "conditions": []
  },
  "checksum": "16fba8824485df41c8a0291aa70c256d258da34eb0970557fe938b0e49511312"
});

export const SOIL_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.soil",
  "version": "1.0.0",
  "execution": "DESCRIPTOR",
  "stage": "WORLD_DESCRIPTOR",
  "scope": [
    "ASSET"
  ],
  "inputs": [
    {
      "name": "targetId",
      "type": "ANY",
      "required": false,
      "description": "Subterranean ground base identifier"
    }
  ],
  "parameters": [
    {
      "name": "depth",
      "type": "I32",
      "min": 0,
      "max": 64,
      "default": 16,
      "description": "Vertical depth of the soil / ground base in pixels"
    },
    {
      "name": "soilType",
      "type": "ANY",
      "default": "loam",
      "description": "Soil material family (loam, peat, clay, obsidian_humus, subterranean_silt)"
    },
    {
      "name": "stratification",
      "type": "ANY",
      "default": "organic_loam",
      "description": "Stratification profile"
    },
    {
      "name": "pebbleDensity",
      "type": "FIXED",
      "min": 0,
      "max": 1,
      "default": 0.3,
      "description": "Mineral pebble inclusion density"
    },
    {
      "name": "rootDensity",
      "type": "FIXED",
      "min": 0,
      "max": 1,
      "default": 0.25,
      "description": "Organic root filament density"
    },
    {
      "name": "moisture",
      "type": "FIXED",
      "min": 0,
      "max": 1,
      "default": 0.5,
      "description": "Moisture level of soil"
    },
    {
      "name": "hasBedrock",
      "type": "BOOL",
      "default": true,
      "description": "Whether bedrock floor is present"
    }
  ],
  "output": {
    "type": "ANY",
    "description": "Immutable procedural subterranean soil base descriptor"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "CONSTANT",
    "multiplier": 1,
    "fixed": 12
  },
  "order": 106,
  "relevance": {
    "pipelines": [
      "world-voxel",
      "tile-forge"
    ],
    "conditions": []
  },
  "checksum": "62a621fc95813363c690a57d09276a0e8e3e3ce47b092d3df65188c690c50170"
});

export const DIRT_MANIFEST = Object.freeze({
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.dirt",
  "version": "1.0.0",
  "execution": "DESCRIPTOR",
  "stage": "WORLD_DESCRIPTOR",
  "scope": [
    "ASSET"
  ],
  "inputs": [
    {
      "name": "targetId",
      "type": "ANY",
      "required": false,
      "description": "Subterranean ground base identifier"
    }
  ],
  "parameters": [
    {
      "name": "depth",
      "type": "I32",
      "min": 0,
      "max": 64,
      "default": 16,
      "description": "Vertical depth of the soil / dirt base in pixels"
    },
    {
      "name": "soilType",
      "type": "ANY",
      "default": "loam",
      "description": "Dirt material family"
    },
    {
      "name": "stratification",
      "type": "ANY",
      "default": "organic_loam",
      "description": "Stratification profile"
    },
    {
      "name": "pebbleDensity",
      "type": "FIXED",
      "min": 0,
      "max": 1,
      "default": 0.3,
      "description": "Mineral pebble inclusion density"
    },
    {
      "name": "rootDensity",
      "type": "FIXED",
      "min": 0,
      "max": 1,
      "default": 0.25,
      "description": "Organic root filament density"
    },
    {
      "name": "moisture",
      "type": "FIXED",
      "min": 0,
      "max": 1,
      "default": 0.5,
      "description": "Moisture level of dirt"
    },
    {
      "name": "hasBedrock",
      "type": "BOOL",
      "default": true,
      "description": "Whether bedrock floor is present"
    }
  ],
  "output": {
    "type": "ANY",
    "description": "Immutable procedural dirt ground base descriptor"
  },
  "determinism": {
    "class": "PURE",
    "seedRequired": false
  },
  "cost": {
    "model": "CONSTANT",
    "multiplier": 1,
    "fixed": 12
  },
  "order": 107,
  "relevance": {
    "pipelines": [
      "world-voxel",
      "tile-forge"
    ],
    "conditions": []
  },
  "checksum": "39ee48025e1e4e28c0d3e90df9cf785fd4501db1ebc29564c5a544b6af7687e8"
});

export const ANCHOR_MANIFESTS = Object.freeze([
  BIOME_COHERENCE_MANIFEST,
  BIOME_MATERIAL_MANIFEST,
  CHESTPLATE_BEVEL_MANIFEST,
  CHESTPLATE_SURFACE_TEXTURE_MANIFEST,
  CHESTPLATE_MANIFEST,
  CHUNKS_SEAM_MANIFEST,
  CRYSTAL_CORE_MANIFEST,
  DIRT_MANIFEST,
  FACET_MANIFEST,
  FIBONACCI_FIELD_MANIFEST,
  FIBONACCI_SEED_FIELD_MANIFEST,
  FLAME_TIP_MANIFEST,
  GEAR_GLIDE_MANIFEST,
  GEOMETRY_MANIFEST,
  GRASS_MANIFEST,
  GRAVITY_MANIFEST,
  HAIR_FLOW_MANIFEST,
  HEIGHTMAP_MANIFEST,
  HERALDRY_MANIFEST,
  HOLLOWNESS_MANIFEST,
  HOLYFIRE_MOTIF_MANIFEST,
  IMAGE_SEGMENTATION_MANIFEST,
  ISO_TILE_GEOMETRY_MANIFEST,
  JEWELRY_MANIFEST,
  MATERIAL_RESOLVER_MANIFEST,
  NEIGHBOR_EXTRAPOLATION_MANIFEST,
  NOISE_FILL_MANIFEST,
  NOISE_MASK_MANIFEST,
  PALETTE_QUANTIZATION_MANIFEST,
  PERLIN_FIELD_MANIFEST,
  PIXEL_AA_MANIFEST,
  PIXEL_SCALE_MANIFEST,
  REGION_FILL_MANIFEST,
  SCHOLOMANCE_CHARACTER_MOTIF_MANIFEST,
  SCHOOL_TAG_MANIFEST,
  SDF_SHAPE_MANIFEST,
  SELOUT_MANIFEST,
  SHADOW_MANIFEST,
  SHIELD_RIM_MANIFEST,
  SHIELD_VOLUME_MANIFEST,
  SKETCH_MANIFEST,
  SOIL_MANIFEST,
  SQUARE_SHARPNESS_CONTRAST_MANIFEST,
  SYMMETRY_MANIFEST,
  TILE_SOCKET_MANIFEST,
  TONATION_MANIFEST,
  VECTOR_MANIFEST,
  VOLUME_LIFT_MANIFEST,
  VOLUME_PROCESSOR_MANIFEST,
  VOLUME_MANIFEST,
]);
