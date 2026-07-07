import { FORMULA_TYPES, COLOR_FORMULA_TYPES } from './image-to-bytecode-formula.js';

/**
 * Converts a mathematical bytecode formula into pure SCDL text.
 */
export function compileBytecodeToSCDL(formula, assetName = 'generated_asset') {
  const { coordinateFormula, colorFormula, template } = formula;

  // Determine canvas size from template or default to 32x32
  let canvasWidth = 32;
  let canvasHeight = 32;

  let scdl = `asset ${assetName} canvas ${canvasWidth}x${canvasHeight}\n\n`;

  // Default palette if not provided by color formula
  scdl += `palette {\n`;
  scdl += `  c_main = #ffffff\n`;
  scdl += `  c_dark = #888888\n`;
  scdl += `}\n\n`;

  scdl += `part body material source {\n`;

  // Translate coordinate formulas to SCDL ops
  if (coordinateFormula.type === FORMULA_TYPES.PARAMETRIC_CURVE) {
    const { cx, cy, a } = coordinateFormula.parameters;
    
    // Convert 1024-space coordinates into 32x32 canvas space
    // Formula typically comes from 160x144 or full image space
    // Let's assume template holds the original gridWidth/Height
    const scaleX = canvasWidth / (template?.gridWidth || 160);
    const scaleY = canvasHeight / (template?.gridHeight || 144);

    const mappedCx = cx * scaleX;
    const mappedCy = cy * scaleY;
    const mappedR = a * scaleX;

    scdl += `  circle ${mappedCx.toFixed(1)} ${mappedCy.toFixed(1)} radius ${mappedR.toFixed(1)} c_main\n`;
  } 
  else if (coordinateFormula.type === FORMULA_TYPES.EDGE_TRACE) {
    const scaleX = canvasWidth / (template?.gridWidth || 1024);
    const scaleY = canvasHeight / (template?.gridHeight || 1024);

    if (coordinateFormula.tracePath && coordinateFormula.tracePath.length >= 3) {
      scdl += `  polygon `;
      for (const p of coordinateFormula.tracePath) {
        scdl += `${(p.x * scaleX).toFixed(1)} ${(p.y * scaleY).toFixed(1)} `;
      }
      scdl += `c_main\n`;
    }
  }
  else if (coordinateFormula.type === FORMULA_TYPES.GRID_PROJECTION) {
    const { cellSize, gridWidth, gridHeight } = coordinateFormula;
    
    const scaleX = canvasWidth / gridWidth;
    const scaleY = canvasHeight / gridHeight;
    const mappedCellSize = Math.max(1, cellSize * scaleX);

    // Render a simplified checkerboard or grid pattern
    for (let y = 0; y < canvasHeight; y += mappedCellSize * 2) {
      for (let x = 0; x < canvasWidth; x += mappedCellSize * 2) {
        scdl += `  rect ${x.toFixed(1)} ${y.toFixed(1)} ${mappedCellSize.toFixed(1)} ${mappedCellSize.toFixed(1)} c_main\n`;
      }
    }
  }
  else {
    // Fallback simple square
    scdl += `  rect 8 8 16 16 c_main\n`;
  }

  scdl += `}\n\n`;
  scdl += `export json png aseprite\n`;

  return scdl;
}
