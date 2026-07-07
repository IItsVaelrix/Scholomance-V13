export class MaterialResolver {
  constructor() {
    this.materialCache = new Map();
  }

  resolveBiomeMaterials(biomeId) {
    // Provide defaults for known biomes as defined in PDR
    const defaultMaterials = {
      void_ice: {
        topPlane: "void_ice_top",
        sidePlane: "obsidian_side",
        rim: "cyan_frost_rim",
        cracks: "deep_void_purple",
        underside: "blackglass_cavity",
        palette: { primary: "#4a90e2", secondary: "#1c1c28" }
      },
      void_forest: {
        topPlane: "purple_void_grass",
        sidePlane: "obsidian_dirt_side",
        rim: "glowing_purple_root_rim",
        cracks: "void_spores",
        underside: "void_liquid",
        palette: { primary: "#8b5cf6", secondary: "#0f172a" }, // Hologram-ish purple and deep obsidian
        ambient: "holographic_sky"
      },
      grass: {
        topPlane: "grass_top",
        sidePlane: "dirt_side",
        rim: "green_rim",
        cracks: "dirt_crack",
        underside: "stone_cavity",
        palette: { primary: "#4caf50", secondary: "#795548" }
      }
    };

    return defaultMaterials[biomeId] || {
      topPlane: `${biomeId}_top`,
      sidePlane: `${biomeId}_side`,
      rim: `${biomeId}_rim`,
      cracks: `${biomeId}_cracks`,
      underside: `${biomeId}_underside`,
      palette: { primary: "#cccccc", secondary: "#333333" }
    };
  }

  getTransitionMaterial(fromBiomeId, toBiomeId) {
    return `${fromBiomeId}_to_${toBiomeId}_blend`;
  }
}
