import { forgePacket } from './semantic-bridge.js';
import { extractConstructionFromReference } from './construction-line-microprocessor.js';

export class ReverseScdlCompiler {
  /**
   * Reverse compiles a raw lattice (grid of cells) into optimized SCDL
   * using vector tracing and greedy meshing.
   * 
   * @param {Object} fills - Output from imageToCellGrid
   * @param {Object} palette - Quantized palette
   * @param {Object} spec - Compilation options
   * @returns {string} - Optimized SCDL string
   */
  static compileToScdl(fills, palette, spec = {}) {
    const {
      canvasName = 'imported_sprite',
      width = fills.width,
      height = fills.height
    } = spec;

    let scdl = `asset ${canvasName} canvas ${width}x${height}\n\n`;

    scdl += `palette {\n`;
    for (const [role, color] of Object.entries(palette)) {
      scdl += `  ${role} = ${color}\n`;
    }
    scdl += `}\n\n`;

    // 1. Vector Tracing Pass
    const { vectorOps, usedKeys } = this.traceVectors(fills.coordinates, width, height);

    // Group all operations (vector + remaining cells) by partId and material
    const groups = new Map();
    const addOpToGroup = (partId, mat, opStr) => {
      const key = `${partId} material ${mat}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(opStr);
    };

    // Add Vector Ops
    for (const op of vectorOps) {
      addOpToGroup(op.partId, op.material, `  ring ${op.cx} ${op.cy} ${op.radius} ${op.width} ${op.color}`);
    }

    // Add Meshed Rect Ops
    const remainingCells = fills.coordinates.filter(cell => !usedKeys.has(`${cell.x},${cell.y}`));
    
    // Pre-group remaining cells by part
    const cellGroups = new Map();
    for (const cell of remainingCells) {
      const partId = cell.partId || 'body';
      const mat = cell.material || 'source';
      const key = `${partId} material ${mat}`;
      if (!cellGroups.has(key)) cellGroups.set(key, []);
      cellGroups.get(key).push(cell);
    }

    // Mesh each group independently and append ops
    for (const [groupKey, cells] of cellGroups.entries()) {
      const [partId, _, mat] = groupKey.split(' ');
      const rects = this.meshCellsToRects(cells, width, height);
      for (const rect of rects) {
        if (rect.w === 1 && rect.h === 1) {
          addOpToGroup(partId, mat, `  cell ${rect.x} ${rect.y} ${rect.color}`);
        } else {
          addOpToGroup(partId, mat, `  rect ${rect.x} ${rect.y} ${rect.w} ${rect.h} ${rect.color}`);
        }
      }
    }

    for (const [groupKey, ops] of groups.entries()) {
      scdl += `part ${groupKey} {\n`;
      scdl += ops.join('\n') + '\n';
      scdl += `}\n\n`;
    }

    scdl += `export json png aseprite\n`;
    return scdl;
  }

  static traceVectors(cells, width, height) {
    const construction = extractConstructionFromReference(cells);
    const vectorOps = [];
    const usedKeys = new Set();

    if (construction && construction.spec && construction.spec.rings) {
      const cx = construction.spec.center.x;
      const cy = construction.spec.center.y;

      for (const ring of construction.spec.rings) {
        const r = ring.radius;
        const inner = Math.max(0, r - 0.5);
        const outer = r + 0.5;
        const inner2 = inner * inner;
        const outer2 = outer * outer;
        
        const cellCounts = new Map();
        for (const cell of cells) {
          const dx = cell.x - cx;
          const dy = cell.y - cy;
          const d2 = dx*dx + dy*dy;
          if (d2 >= inner2 && d2 <= outer2) {
            const colorRef = cell.roleName || cell.color;
            const partId = cell.partId || 'body';
            const material = cell.material || 'source';
            const key = `${colorRef}|${partId}|${material}`;
            cellCounts.set(key, (cellCounts.get(key) || 0) + 1);
          }
        }

        if (cellCounts.size > 0) {
          let bestKey = null;
          let bestCount = -1;
          for (const [key, count] of cellCounts.entries()) {
            if (count > bestCount) {
              bestCount = count;
              bestKey = key;
            }
          }

          const [bestColor, bestPartId, bestMaterial] = bestKey.split('|');

          vectorOps.push({ 
            op: 'ring', cx, cy, radius: r, width: 1, 
            color: bestColor, partId: bestPartId, material: bestMaterial 
          });
          
          for (const cell of cells) {
            const dx = cell.x - cx;
            const dy = cell.y - cy;
            const d2 = dx*dx + dy*dy;
            if (d2 >= inner2 && d2 <= outer2) {
               const colorRef = cell.roleName || cell.color;
               const partId = cell.partId || 'body';
               const material = cell.material || 'source';
               if (colorRef === bestColor && partId === bestPartId && material === bestMaterial) {
                 usedKeys.add(`${cell.x},${cell.y}`);
               }
            }
          }
        }
      }
    }
    
    return { vectorOps, usedKeys };
  }

  /**
   * Greedy meshing algorithm to group adjacent cells of the same color into rectangles
   */
  static meshCellsToRects(cells, width, height) {
    const grid = new Map();
    for (const cell of cells) {
      const colorRef = cell.roleName || cell.color;
      grid.set(`${cell.x},${cell.y}`, colorRef);
    }

    const rects = [];
    const visited = new Set();

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const key = `${x},${y}`;
        if (visited.has(key)) continue;
        if (!grid.has(key)) continue;

        const color = grid.get(key);
        
        // Find max width
        let w = 1;
        while (x + w < width && !visited.has(`${x + w},${y}`) && grid.get(`${x + w},${y}`) === color) {
          w++;
        }

        // Find max height
        let h = 1;
        let canExpandHeight = true;
        while (y + h < height && canExpandHeight) {
          for (let ix = 0; ix < w; ix++) {
            if (visited.has(`${x + ix},${y + h}`) || grid.get(`${x + ix},${y + h}`) !== color) {
              canExpandHeight = false;
              break;
            }
          }
          if (canExpandHeight) h++;
        }

        // Mark as visited
        for (let iy = 0; iy < h; iy++) {
          for (let ix = 0; ix < w; ix++) {
            visited.add(`${x + ix},${y + iy}`);
          }
        }

        rects.push({ x, y, w, h, color });
      }
    }

    return rects;
  }
}
