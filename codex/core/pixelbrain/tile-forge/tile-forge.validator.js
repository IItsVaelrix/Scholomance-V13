export function validateTileForgeCandidate(candidate) {
  const errors = [];
  const warnings = [];
  let ok = true;
  
  const metrics = {
    layerCount: 0,
    totalCells: 0
  };

  if (!candidate) {
    return { ok: false, errors: ["Candidate is null or undefined"], warnings, metrics };
  }

  if (!candidate.id) {
    errors.push("Candidate missing id");
    ok = false;
  }
  
  if (candidate.type !== "isometric_tile_chunk") {
    warnings.push(`Unexpected candidate type: ${candidate.type}`);
  }

  if (!candidate.layers) {
    errors.push("Candidate missing layers");
    ok = false;
  } else {
    metrics.layerCount = Object.keys(candidate.layers).length;
    if (metrics.layerCount === 0) {
      errors.push("Candidate has no processed layers");
      ok = false;
    }
  }

  if (!candidate.processorVersionMap) {
    warnings.push("Candidate missing processorVersionMap");
  }

  if (!candidate.qbit || !Array.isArray(candidate.qbit)) {
    warnings.push("Candidate missing qbit cells array");
  } else {
    metrics.totalCells = candidate.qbit.length;
  }

  return {
    ok,
    errors,
    warnings,
    metrics
  };
}

export class TileForgeValidator {
  validate(candidate) {
    return validateTileForgeCandidate(candidate);
  }
}
