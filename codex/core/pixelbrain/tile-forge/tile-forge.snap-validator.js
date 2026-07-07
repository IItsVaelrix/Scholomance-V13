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

export function areSnapProfilesCompatible(a, b, rules) {
  if (!a || !b) return false;
  
  const biomeOk =
    a.biomeId === b.biomeId ||
    (rules.biomeCompatibility[a.biomeId] && rules.biomeCompatibility[a.biomeId].includes(b.biomeId));

  const socketOk =
    a.socketType === b.socketType ||
    (rules.socketCompatibility[a.socketType] && rules.socketCompatibility[a.socketType].includes(b.socketType));

  const elevationOk = a.elevationClass === b.elevationClass;
  const walkableOk = a.walkable === b.walkable;

  return biomeOk && socketOk && elevationOk && walkableOk;
}

export function canSnapEdges(edgeA, edgeB, rules) {
  if (!edgeA || !edgeB) return false;
  if (edgeA.length !== edgeB.length) {
    return false;
  }

  return edgeA.every((cellA, index) => {
    const cellB = edgeB[index];
    if (!cellA.snapProfile || !cellB.snapProfile) return false;

    return areSnapProfilesCompatible(
      cellA.snapProfile,
      cellB.snapProfile,
      rules
    );
  });
}

export class TileForgeSnapValidator {
  constructor(customRules = null) {
    this.rules = customRules || {
      biomeCompatibility: BIOME_COMPATIBILITY,
      socketCompatibility: SOCKET_COMPATIBILITY
    };
  }

  validate(candidate) {
    const errors = [];
    const warnings = [];
    let ok = true;
    const metrics = {
      validatedProfiles: 0
    };

    if (!candidate) {
      return { ok: false, errors: ["Candidate is null"], warnings, metrics };
    }

    if (!candidate.snapProfiles || !Array.isArray(candidate.snapProfiles)) {
      errors.push("Candidate missing snapProfiles array");
      return { ok: false, errors, warnings, metrics };
    }

    for (const profile of candidate.snapProfiles) {
      if (!profile.biomeId) {
        errors.push("Snap profile missing biomeId");
        ok = false;
      }
      if (!profile.socketType) {
        errors.push("Snap profile missing socketType");
        ok = false;
      }
      if (!profile.elevationClass) {
        errors.push("Snap profile missing elevationClass");
        ok = false;
      }
      metrics.validatedProfiles++;
    }

    return { ok, errors, warnings, metrics };
  }
}
