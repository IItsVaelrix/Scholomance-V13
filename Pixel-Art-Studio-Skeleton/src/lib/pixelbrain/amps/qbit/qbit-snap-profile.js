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

export const BIOME_COMPATIBILITY = {
  void_ice: ["void_ice", "obsidian", "frost_ruin", "blackglass", "void_forest"],
  void_forest: ["void_forest", "void_ice", "cave", "obsidian"],
  grass: ["grass", "dirt", "forest", "stone_path"],
  cave: ["cave", "stone", "obsidian", "frost_ruin", "void_forest"],
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
