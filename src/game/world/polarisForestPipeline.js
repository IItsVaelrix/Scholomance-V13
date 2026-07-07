/**
 * Hierarchical procedural pipeline for the Polaris Sonic Thaumaturgist Forest.
 * Terrain (fBm + hydraulic/thermal erosion) → ecosystem (Poisson-disk + masks + survival)
 * → flora specs (L-system parameters per tree).
 */

import {
  generatePermutationTable,
  perlin2D,
} from '../../../codex/core/pixelbrain/procedural-noise.js';
export const POLARIS_FOREST_SEED = 'polaris-sonic-forest';

const GEologic_OP = Object.freeze({
  UPLIFT: 'UPLIFT',
  ERODE: 'ERODE',
  SMOOTH: 'SMOOTH',
  FLATTEN: 'FLATTEN',
});

const DEFAULT_FBM = Object.freeze({
  octaves: 5,
  persistence: 0.52,
  lacunarity: 2.1,
  scale: 0.038,
});

/**
 * @param {string|number} seed
 */
export function createForestRng(seed) {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let output = state;
    output = Math.imul(output ^ (output >>> 15), output | 1);
    output ^= output + Math.imul(output ^ (output >>> 7), output | 61);
    return ((output ^ (output >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed) {
  const text = String(seed);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Fractional Brownian Motion via stacked Perlin octaves.
 *
 * @param {number} x
 * @param {number} y
 * @param {Uint16Array} permutation
 * @param {{ octaves?: number, persistence?: number, lacunarity?: number, scale?: number, offsetX?: number, offsetY?: number }} [options]
 */
export function fbm2D(x, y, permutation, options = {}) {
  const octaves = options.octaves ?? DEFAULT_FBM.octaves;
  const persistence = options.persistence ?? DEFAULT_FBM.persistence;
  const lacunarity = options.lacunarity ?? DEFAULT_FBM.lacunarity;
  const scale = options.scale ?? DEFAULT_FBM.scale;
  const offsetX = options.offsetX ?? 0;
  const offsetY = options.offsetY ?? 0;

  let amplitude = 1;
  let frequency = 1;
  let value = 0;
  let amplitudeSum = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    value += perlin2D(
      (x + offsetX) * scale * frequency,
      (y + offsetY) * scale * frequency,
      permutation,
    ) * amplitude;
    amplitudeSum += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  const normalized = amplitudeSum > 0 ? value / amplitudeSum : value;
  return (normalized + 1) / 2;
}

/**
 * Midpoint-displacement ridge pass for secondary uplift.
 *
 * @param {number[][]} map
 * @param {number} size
 * @param {Uint16Array} permutation
 */
function applyMidpointDisplacement(map, size, permutation) {
  const scratch = map.map((row) => [...row]);
  for (let x = 1; x < size - 1; x += 1) {
    for (let y = 1; y < size - 1; y += 1) {
      if (map[x][y] <= 0) continue;
      const cornerAvg = (
        map[x - 1][y - 1] + map[x + 1][y - 1]
        + map[x - 1][y + 1] + map[x + 1][y + 1]
      ) / 4;
      const displacement = (fbm2D(x * 0.17, y * 0.17, permutation) - 0.5) * 2.2;
      scratch[x][y] = cornerAvg + displacement;
    }
  }
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) {
      if (map[x][y] > 0) map[x][y] = scratch[x][y];
    }
  }
}

/**
 * Hydraulic erosion: rainfall, flow to steepest descent, sediment transport.
 *
 * @param {number[][]} map
 * @param {number} size
 * @param {{ passes?: number, rainAmount?: number, erosionRate?: number, depositRate?: number, capacity?: number, seed?: string|number }} [options]
 */
export function applyHydraulicErosion(map, size, options = {}) {
  const passes = options.passes ?? 24;
  const rainAmount = options.rainAmount ?? 0.014;
  const erosionRate = options.erosionRate ?? 0.32;
  const depositRate = options.depositRate ?? 0.28;
  const capacity = options.capacity ?? 4.2;
  const rng = createForestRng(options.seed ?? 'hydraulic');

  const water = Array.from({ length: size }, () => Array(size).fill(0));
  const sediment = Array.from({ length: size }, () => Array(size).fill(0));

  const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  for (let pass = 0; pass < passes; pass += 1) {
    for (let x = 0; x < size; x += 1) {
      for (let y = 0; y < size; y += 1) {
        if (map[x][y] <= 0) continue;
        water[x][y] += rainAmount * (0.85 + rng() * 0.3);
      }
    }

    const order = [];
    for (let x = 0; x < size; x += 1) {
      for (let y = 0; y < size; y += 1) {
        if (map[x][y] > 0) order.push({ x, y, h: map[x][y] });
      }
    }
    order.sort((a, b) => b.h - a.h);

    for (const cell of order) {
      const { x, y } = cell;
      if (water[x][y] <= 0.001) continue;

      let lowest = map[x][y];
      let targetX = x;
      let targetY = y;

      for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        if (map[nx][ny] <= 0) continue;
        if (map[nx][ny] < lowest) {
          lowest = map[nx][ny];
          targetX = nx;
          targetY = ny;
        }
      }

      if (targetX === x && targetY === y) {
        sediment[x][y] += water[x][y] * depositRate * 0.02;
        water[x][y] *= 0.3;
        continue;
      }

      const heightDiff = Math.max(0.01, map[x][y] - lowest);
      const waterMove = Math.min(water[x][y], water[x][y] * 0.45);
      const sedimentCapacity = heightDiff * water[x][y] * capacity;
      const sedimentDiff = sedimentCapacity - sediment[x][y];

      if (sedimentDiff > 0) {
        const erode = Math.min(sedimentDiff, heightDiff * erosionRate * waterMove);
        map[x][y] -= erode;
        sediment[x][y] += erode;
      } else {
        const deposit = Math.min(-sedimentDiff, depositRate * waterMove);
        map[x][y] += deposit;
        sediment[x][y] -= deposit;
      }

      water[x][y] -= waterMove;
      water[targetX][targetY] += waterMove;
      sediment[targetX][targetY] += sediment[x][y] * (waterMove / (water[x][y] + waterMove + 0.001)) * 0.15;
    }
  }
}

/**
 * Thermal erosion: talus angle shedding on steep faces.
 *
 * @param {number[][]} map
 * @param {number} size
 * @param {{ passes?: number, talusRatio?: number }} [options]
 */
export function applyThermalErosion(map, size, options = {}) {
  const passes = options.passes ?? 10;
  const talusRatio = options.talusRatio ?? 0.42;
  const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  for (let pass = 0; pass < passes; pass += 1) {
    const nextMap = map.map((row) => [...row]);
    for (let x = 1; x < size - 1; x += 1) {
      for (let y = 1; y < size - 1; y += 1) {
        if (map[x][y] <= 0) continue;
        for (const [dx, dy] of neighbors) {
          const nx = x + dx;
          const ny = y + dy;
          if (map[nx][ny] <= 0) continue;
          const diff = map[x][y] - map[nx][ny];
          if (diff > talusRatio) {
            const shed = (diff - talusRatio) * 0.35;
            nextMap[x][y] -= shed;
            nextMap[nx][ny] += shed;
          }
        }
      }
    }
    for (let x = 0; x < size; x += 1) {
      for (let y = 0; y < size; y += 1) {
        map[x][y] = nextMap[x][y];
      }
    }
  }
}

/**
 * @param {number[][]} map
 * @param {number} size
 * @param {number} radius
 * @param {(x: number, y: number) => number} smoothNoise2D
 * @param {{ tx: number, ty: number }} spawnTile
 */
function applyGeologicProgram(map, size, radius, smoothNoise2D, spawnTile) {
  const program = [
    { op: GEologic_OP.UPLIFT, amount: 1.4, freq: 0.09 },
    { op: GEologic_OP.ERODE, passes: 4, capacity: 0.9 },
    { op: GEologic_OP.SMOOTH, passes: 5 },
    { op: GEologic_OP.FLATTEN, centerX: spawnTile.tx, centerY: spawnTile.ty, radius: 3.8, targetZ: 12, blend: 2.2 },
  ];

  for (const inst of program) {
    switch (inst.op) {
      case GEologic_OP.UPLIFT:
        for (let x = 0; x < size; x += 1) {
          for (let y = 0; y < size; y += 1) {
            if (map[x][y] > 0) {
              const upliftNoise = smoothNoise2D(x * inst.freq + 3100, y * inst.freq + 3100);
              if (upliftNoise > 0.5) map[x][y] += inst.amount * upliftNoise;
            }
          }
        }
        break;

      case GEologic_OP.ERODE: {
        for (let pass = 0; pass < inst.passes; pass += 1) {
          const nextMap = map.map((row) => [...row]);
          for (let x = 1; x < size - 1; x += 1) {
            for (let y = 1; y < size - 1; y += 1) {
              if (map[x][y] <= 0) continue;
              let lowest = map[x][y];
              let targetX = x;
              let targetY = y;
              for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                if (map[x + dx][y + dy] < lowest) {
                  lowest = map[x + dx][y + dy];
                  targetX = x + dx;
                  targetY = y + dy;
                }
              }
              const diff = map[x][y] - lowest;
              if (diff > inst.capacity) {
                const sediment = diff * 0.28;
                nextMap[x][y] -= sediment;
                nextMap[targetX][targetY] += sediment;
              }
            }
          }
          for (let x = 0; x < size; x += 1) {
            for (let y = 0; y < size; y += 1) {
              map[x][y] = nextMap[x][y];
            }
          }
        }
        break;
      }

      case GEologic_OP.SMOOTH: {
        for (let pass = 0; pass < inst.passes; pass += 1) {
          const nextMap = map.map((row) => [...row]);
          for (let x = 1; x < size - 1; x += 1) {
            for (let y = 1; y < size - 1; y += 1) {
              if (map[x][y] <= 0) continue;
              const sum = map[x][y]
                + map[x - 1][y] + map[x + 1][y]
                + map[x][y - 1] + map[x][y + 1];
              nextMap[x][y] = sum / 5;
            }
          }
          for (let x = 0; x < size; x += 1) {
            for (let y = 0; y < size; y += 1) {
              map[x][y] = nextMap[x][y];
            }
          }
        }
        break;
      }

      case GEologic_OP.FLATTEN: {
        const centerX = inst.centerX ?? radius;
        const centerY = inst.centerY ?? radius;
        for (let x = 0; x < size; x += 1) {
          for (let y = 0; y < size; y += 1) {
            const dx = x - centerX;
            const dy = y - centerY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= inst.radius) {
              map[x][y] = inst.targetZ;
            } else if (dist <= inst.radius + inst.blend) {
              const t = (dist - inst.radius) / inst.blend;
              map[x][y] = inst.targetZ * (1 - t) + map[x][y] * t;
            }
          }
        }
        break;
      }
      default:
        break;
    }
  }
}

/**
 * @param {{ size: number, radius: number, seed?: string|number }} options
 * @returns {number[][]}
 */
export function buildPolarisTerrainHeightmap(options) {
  const {
    size,
    radius,
    seed = POLARIS_FOREST_SEED,
    spawnTile = { tx: 4, ty: 7 },
  } = options;
  const permutation = generatePermutationTable(hashSeed(seed));
  const map = Array.from({ length: size }, () => Array(size).fill(0));
  const noiseOffset = 2400;

  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) {
      const dx = x - radius;
      const dy = y - radius;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) continue;

      const ridge = fbm2D(x, y, permutation, { offsetX: noiseOffset, offsetY: noiseOffset });
      const detail = fbm2D(x, y, permutation, {
        octaves: 3,
        scale: 0.11,
        persistence: 0.45,
        offsetX: noiseOffset + 900,
        offsetY: noiseOffset + 900,
      }) * 0.22;
      const dome = Math.max(0, 1 - Math.pow(dist / radius, 1.35));
      map[x][y] = (ridge + detail) * dome * 14;
    }
  }

  applyMidpointDisplacement(map, size, permutation);
  applyHydraulicErosion(map, size, { passes: 28, seed: `${seed}:hydraulic` });
  applyThermalErosion(map, size, { passes: 8, talusRatio: 0.38 });

  const smoothNoise2D = (nx, ny) => fbm2D(nx, ny, permutation);
  applyGeologicProgram(map, size, radius, smoothNoise2D, spawnTile);

  return map;
}

/**
 * @param {number[][]} heightmap
 * @param {number} x
 * @param {number} y
 * @param {number} size
 */
export function computeSlopeAt(heightmap, x, y, size) {
  let maxDiff = 0;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
    if (heightmap[nx][ny] <= 0 || heightmap[x][y] <= 0) continue;
    maxDiff = Math.max(maxDiff, Math.abs(heightmap[x][y] - heightmap[nx][ny]));
  }
  return maxDiff;
}

/**
 * Moisture accumulates in low basins (river valleys).
 *
 * @param {number[][]} heightmap
 * @param {number} size
 * @param {number} radius
 */
export function computeMoistureField(heightmap, size, radius) {
  const moisture = Array.from({ length: size }, () => Array(size).fill(0));
  let minH = Infinity;
  let maxH = -Infinity;

  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) {
      const h = heightmap[x][y];
      if (h <= 0) continue;
      minH = Math.min(minH, h);
      maxH = Math.max(maxH, h);
    }
  }

  const range = Math.max(0.01, maxH - minH);
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) {
      const h = heightmap[x][y];
      if (h <= 0) continue;
      const basin = 1 - (h - minH) / range;
      const dx = x - radius;
      const dy = y - radius;
      const edgeBias = Math.min(1, Math.hypot(dx, dy) / radius);
      moisture[x][y] = basin * 0.7 + edgeBias * 0.15;
    }
  }
  return moisture;
}

/**
 * Bridson-style Poisson-disk sampling on a continuous plane.
 *
 * @param {{ width: number, height: number, minDist: number, seed?: string|number, maxAttempts?: number, isValid?: (x: number, y: number) => boolean }} options
 * @returns {Array<{ x: number, y: number }>}
 */
export function poissonDiskSample(options) {
  const {
    width,
    height,
    minDist,
    seed = 0,
    maxAttempts = 24,
    isValid = () => true,
  } = options;

  const rng = createForestRng(seed);
  const cellSize = minDist / Math.SQRT2;
  const gridCols = Math.ceil(width / cellSize);
  const gridRows = Math.ceil(height / cellSize);
  const grid = Array(gridCols * gridRows).fill(null);
  const points = [];
  const active = [];

  const gridIndex = (x, y) => {
    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);
    return row * gridCols + col;
  };

  const fits = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    if (!isValid(x, y)) return false;
    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const nc = col + dx;
        const nr = row + dy;
        if (nc < 0 || nr < 0 || nc >= gridCols || nr >= gridRows) continue;
        const other = grid[nr * gridCols + nc];
        if (!other) continue;
        const dist = Math.hypot(other.x - x, other.y - y);
        if (dist < minDist) return false;
      }
    }
    return true;
  };

  let seeded = false;
  for (let attempt = 0; attempt < 48 && !seeded; attempt += 1) {
    const seedX = rng() * width;
    const seedY = rng() * height;
    if (!fits(seedX, seedY)) continue;
    const p = { x: seedX, y: seedY };
    points.push(p);
    active.push(p);
    grid[gridIndex(seedX, seedY)] = p;
    seeded = true;
  }

  while (active.length > 0) {
    const idx = Math.floor(rng() * active.length);
    const center = active[idx];
    let found = false;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const angle = rng() * Math.PI * 2;
      const dist = minDist + rng() * minDist;
      const x = center.x + Math.cos(angle) * dist;
      const y = center.y + Math.sin(angle) * dist;
      if (!fits(x, y)) continue;
      const p = { x, y };
      points.push(p);
      active.push(p);
      grid[gridIndex(x, y)] = p;
      found = true;
      break;
    }

    if (!found) active.splice(idx, 1);
  }

  return points;
}

/**
 * Space-colonization light bias: branches lean toward open sky above clearings.
 *
 * @param {{ tx: number, ty: number }} spawnTile
 * @param {number} radius
 */
function buildLightAttractors(spawnTile, radius) {
  return [
    { x: spawnTile.tx, y: spawnTile.ty - 1.5, weight: 1.2 },
    { x: radius, y: radius - 2, weight: 0.8 },
    { x: radius + 2, y: radius, weight: 0.7 },
    { x: radius - 2, y: radius, weight: 0.7 },
  ];
}

/**
 * Resource-constraint survival: shade tolerance vs moisture competition.
 *
 * @param {Array<{ tx: number, ty: number, fitness: number }>} candidates
 * @param {number} maxTrees
 * @param {() => number} rng
 */
function selectSurvivors(candidates, maxTrees, rng, minCount = 8) {
  const sorted = [...candidates].sort((a, b) => b.fitness - a.fitness);
  const survivors = [];

  for (const candidate of sorted) {
    if (survivors.length >= maxTrees) break;
    const shadeTolerance = 0.55 + rng() * 0.45;
    const waterStress = rng() * 0.12;
    const score = candidate.fitness * shadeTolerance - waterStress;
    if (score < 0.18) continue;
    survivors.push({ ...candidate, fitness: score });
  }

  if (survivors.length < minCount) {
    return sorted.slice(0, Math.min(maxTrees, Math.max(minCount, sorted.length)));
  }

  return survivors;
}

/**
 * @param {Array<{ tx: number, ty: number }>} trees
 */
export function computeMinTreeDistance(trees) {
  if (trees.length < 2) return Infinity;
  let min = Infinity;
  for (let i = 0; i < trees.length; i += 1) {
    for (let j = i + 1; j < trees.length; j += 1) {
      min = Math.min(min, Math.hypot(trees[i].tx - trees[j].tx, trees[i].ty - trees[j].ty));
    }
  }
  return min;
}

/**
 * @param {{ heightmap: number[][], size: number, radius: number, seed?: string|number, spawnTile: { tx: number, ty: number } }} options
 * @returns {Array<{ tx: number, ty: number, scale: number, phase: number, lSystemSeed: number, leanX: number, leanY: number }>}
 */
export function generateTreePlacements(options) {
  const {
    heightmap,
    size,
    radius,
    seed = POLARIS_FOREST_SEED,
    spawnTile,
  } = options;

  const rng = createForestRng(`${seed}:trees`);
  const moisture = computeMoistureField(heightmap, size, radius);
  const lightSources = buildLightAttractors(spawnTile, radius);
  const minDist = 2.4;
  const spawnClearRadius = 2.5;
  const maxSlope = 2.8;
  const minMoisture = 0.08;

  const isValid = (x, y) => {
    const tx = Math.round(x);
    const ty = Math.round(y);
    if (tx < 0 || ty < 0 || tx >= size || ty >= size) return false;
    if (heightmap[tx][ty] <= 0) return false;
    if (Math.hypot(tx - spawnTile.tx, ty - spawnTile.ty) < spawnClearRadius) return false;
    if (computeSlopeAt(heightmap, tx, ty, size) > maxSlope) return false;
    if (moisture[tx][ty] < minMoisture) return false;
    return true;
  };

  const diskPoints = poissonDiskSample({
    width: size,
    height: size,
    minDist,
    seed: `${seed}:poisson`,
    maxAttempts: 30,
    isValid,
  });

  const candidates = diskPoints.map((point) => {
    const tx = Math.round(point.x);
    const ty = Math.round(point.y);
    const slope = computeSlopeAt(heightmap, tx, ty, size);
    const wet = moisture[tx][ty];
    const dx = tx - radius;
    const dy = ty - radius;
    const edgeRing = Math.abs(Math.hypot(dx, dy) - radius * 0.78) < 1.8 ? 0.25 : 0;
    const fitness = wet * 0.55 + (1 - slope / 5) * 0.35 + edgeRing;

    let leanX = 0;
    let leanY = -0.15;
    for (const light of lightSources) {
      const lx = light.x - tx;
      const ly = light.y - ty;
      const dist = Math.hypot(lx, ly) + 0.01;
      leanX += (lx / dist) * light.weight * 0.08;
      leanY += (ly / dist) * light.weight * 0.08;
    }

    return { tx, ty, fitness, leanX, leanY };
  });

  const survivors = selectSurvivors(candidates, 16, rng);

  return survivors.map((tree, index) => ({
    tx: tree.tx,
    ty: tree.ty,
    scale: 0.85 + rng() * 0.3,
    phase: rng() * 1.8,
    lSystemSeed: hashSeed(`${seed}:ls:${tree.tx},${tree.ty}`),
    leanX: tree.leanX,
    leanY: tree.leanY,
    depthBias: index % 3,
  }));
}

/**
 * @param {{ size: number, radius: number, seed?: string|number, spawnTile?: { tx: number, ty: number } }} options
 */
export function generatePolarisForestState(options) {
  const {
    size,
    radius,
    seed = POLARIS_FOREST_SEED,
    spawnTile = { tx: 4, ty: 7 },
  } = options;

  const heightmap = buildPolarisTerrainHeightmap({ size, radius, seed, spawnTile });
  const trees = generateTreePlacements({
    heightmap,
    size,
    radius,
    seed,
    spawnTile,
  });

  const understory = trees
    .filter((_, i) => i % 4 === 0)
    .map((tree) => ({
      tx: tree.tx + (tree.leanX > 0 ? -1 : 1),
      ty: tree.ty + 1,
      scale: tree.scale * 0.45,
    }));

  return Object.freeze({
    seed,
    size,
    radius,
    heightmap,
    trees: Object.freeze(trees.map((t) => Object.freeze(t))),
    understory: Object.freeze(understory.map((u) => Object.freeze(u))),
  });
}

/**
 * Flat forest field — constant elevation, no island mask.
 *
 * @param {number} gridSize
 * @param {number} [pad]
 */
export function buildFlatForestHeightmap(gridSize, pad = 14) {
  const size = gridSize + pad * 2;
  const map = Array.from({ length: size }, () => Array(size).fill(12));
  return { heightmap: map, size, pad, radius: Math.floor(size / 2) };
}

/**
 * Poisson tree scatter across an extended flat field (grid coords may be negative).
 *
 * @param {{ gridSize: number, seed?: string|number, spawnTile: { tx: number, ty: number } }} options
 */
export function generateFlatForestTreePlacements(options) {
  const {
    gridSize,
    seed = POLARIS_FOREST_SEED,
    spawnTile,
  } = options;

  const rng = createForestRng(`${seed}:flat-trees`);
  const minDist = 2.2;
  const spawnClearRadius = 2.8;
  const fieldPad = 10;
  const fieldW = gridSize + fieldPad * 2;
  const fieldH = gridSize + fieldPad * 2;

  const isValid = (x, y) => {
    const tx = Math.round(x) - fieldPad;
    const ty = Math.round(y) - fieldPad;
    if (Math.hypot(tx - spawnTile.tx, ty - spawnTile.ty) < spawnClearRadius) return false;
    return true;
  };

  const diskPoints = poissonDiskSample({
    width: fieldW,
    height: fieldH,
    minDist,
    seed: `${seed}:flat-poisson`,
    maxAttempts: 32,
    isValid,
  });

  const lightSources = [
    { x: spawnTile.tx, y: spawnTile.ty - 1.5, weight: 1.2 },
    { x: Math.floor(gridSize / 2), y: 0, weight: 0.6 },
    { x: gridSize, y: Math.floor(gridSize / 2), weight: 0.5 },
    { x: 0, y: Math.floor(gridSize / 2), weight: 0.5 },
  ];

  const candidates = diskPoints.map((point) => {
    const tx = Math.round(point.x) - fieldPad;
    const ty = Math.round(point.y) - fieldPad;
    const distCenter = Math.hypot(tx - gridSize / 2, ty - gridSize / 2);
    const edgeRing = Math.abs(distCenter - gridSize * 0.42) < 2 ? 0.3 : 0;
    const fitness = 0.45 + edgeRing + (distCenter > gridSize * 0.55 ? 0.2 : 0);

    let leanX = 0;
    let leanY = -0.15;
    for (const light of lightSources) {
      const lx = light.x - tx;
      const ly = light.y - ty;
      const dist = Math.hypot(lx, ly) + 0.01;
      leanX += (lx / dist) * light.weight * 0.08;
      leanY += (ly / dist) * light.weight * 0.08;
    }

    return { tx, ty, fitness, leanX, leanY };
  });

  const survivors = selectSurvivors(candidates, 28, rng, 12);

  return survivors.map((tree, index) => {
    const distCenter = Math.hypot(tree.tx - gridSize / 2, tree.ty - gridSize / 2);
    const layer = distCenter > gridSize * 0.38 ? 'backdrop' : 'combat';
    return {
      tx: tree.tx,
      ty: tree.ty,
      scale: layer === 'backdrop' ? 1.1 + rng() * 0.5 : 0.85 + rng() * 0.3,
      phase: rng() * 1.8,
      lSystemSeed: hashSeed(`${seed}:ls:${tree.tx},${tree.ty}`),
      leanX: tree.leanX,
      leanY: tree.leanY,
      depthBias: index % 3,
      layer,
    };
  });
}

/**
 * @param {{ gridSize?: number, seed?: string|number, spawnTile?: { tx: number, ty: number } }} [options]
 */
export function generatePolarisFlatForestState(options = {}) {
  const {
    gridSize = 13,
    seed = POLARIS_FOREST_SEED,
    spawnTile = { tx: 6, ty: 10 },
  } = options;

  const { heightmap, size, pad, radius } = buildFlatForestHeightmap(gridSize);
  const trees = generateFlatForestTreePlacements({ gridSize, seed, spawnTile });

  return Object.freeze({
    seed,
    gridSize,
    size,
    pad,
    radius,
    heightmap,
    spawnTile: Object.freeze({ ...spawnTile }),
    trees: Object.freeze(trees.map((t) => Object.freeze(t))),
  });
}