import { imageToCellGrid } from './image-to-cell-grid.js';
import { quantizeToRoles } from './palette-role-quantizer.js';
import { segmentImage } from './image-segmentation-amp.js';
import { extrapolateNeighbors } from './neighbor-extrapolation-amp.js';
import { ReverseScdlCompiler } from './reverse-scdl-compiler.js';
import { buildGeometryAmpPayload } from './geometry-amp.js';

export class ImageLatticeCompiler {
  constructor(spec = {}) {
    this.spec = spec;
  }

  async compile(imageData, options = {}) {
    // 1. Image Data to Cell Grid
    let fills = imageToCellGrid(imageData, {
      width: options.width,
      height: options.height,
      targetWidth: options.targetWidth,
      targetHeight: options.targetHeight,
      transparentAlpha: options.transparentAlpha,
      partId: options.partId,
      material: options.material
    });

    // 2. Quantize Palette
    const quantized = quantizeToRoles(fills.coordinates, options.quantizeSpec);
    fills = { ...fills, coordinates: quantized.coordinates };
    const palette = quantized.palette;

    // 3. Segment (Optional/V1 Stub)
    fills = segmentImage(fills, options.segmentationSpec);

    // 4. Extrapolate Neighbors (Optional)
    if (options.enableExtrapolation) {
      fills = extrapolateNeighbors(fills, options.extrapolateSpec);
    }

    // 5. Mark rim/core/motif (Skipped for now, handled by other PB passes if needed)

    // 6. Anti-Aliasing (Optional)

    // 7. QBIT Phosphorylation would happen here or downstream during PB compilation
    // to determine structural confidence of cells

    // 8. Geometry AMP
    const silhouette = { partOf: new Map() };
    for (const cell of fills.coordinates) {
      silhouette.partOf.set(`${cell.x},${cell.y}`, cell.partId || 'body');
    }
    const parts = Array.from(new Set(fills.coordinates.map(c => c.partId || 'body'))).map(id => ({ id }));
    const geometrySpec = { parts, canvas: { width: options.targetWidth || fills.width, height: options.targetHeight || fills.height }, id: options.canvasName || 'lattice' };
    const geometry = buildGeometryAmpPayload({ spec: geometrySpec, silhouette });

    // 9. SCDL Emission via Reverse Compiler (Greedy Meshing into translatable rect shapes)
    const scdl = ReverseScdlCompiler.compileToScdl(fills, palette, {
      canvasName: options.canvasName,
      width: fills.width,
      height: fills.height
    });

    return {
      fills,
      palette,
      scdl,
      geometry
    };
  }
}
