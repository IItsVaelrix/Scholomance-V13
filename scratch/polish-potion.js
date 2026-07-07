import fs from 'fs';

const scdl = fs.readFileSync('docs/references/SCDL/potion_forged.scdl', 'utf8');
const lines = scdl.split('\n');

const palette = {};
const reversePalette = {};
let inPalette = false;
let inPart = false;
let cells = [];

for (const line of lines) {
  const t = line.trim();
  if (t.startsWith('palette {')) { inPalette = true; continue; }
  if (inPalette && t === '}') { inPalette = false; continue; }
  if (inPalette && t.includes('=')) {
    const [name, hex] = t.split('=').map(s => s.trim());
    palette[name] = hex;
    reversePalette[hex] = name;
  }

  if (t.startsWith('part ')) { inPart = true; continue; }
  if (inPart && t === '}') { inPart = false; continue; }
  if (inPart && t.startsWith('cell ')) {
    const parts = t.split(' ');
    cells.push({ x: parseInt(parts[1]), y: parseInt(parts[2]), colorName: parts[3], hex: palette[parts[3]] });
  }
}

// 2D grid
const width = 88;
const height = 48;
const grid = Array(height).fill(null).map(() => Array(width).fill(null));
for (const c of cells) {
  grid[c.y][c.x] = c.hex;
}

// Helper functions
function getHex(x, y) {
  if (y >= 0 && y < height && x >= 0 && x < width) return grid[y][x];
  return null;
}
function setHex(x, y, hex) {
  if (y >= 0 && y < height && x >= 0 && x < width) grid[y][x] = hex;
}

// --- HEURISTIC EDITS ---

// 1. Identify bounds
let minX=width, maxX=0, minY=height, maxY=0;
for(let y=0; y<height; y++){
  for(let x=0; x<width; x++){
    if(grid[y][x]) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
}

const cx = Math.floor((minX + maxX) / 2);

// 2. Clean outer silhouette (Stair-steps)
// We'll run a pass to remove any pixels that protrude incorrectly or have only 1 neighbor
for(let pass=0; pass<2; pass++){
  const toRemove = [];
  for(let y=0; y<height; y++){
    for(let x=0; x<width; x++){
      if(grid[y][x]) {
        let n = 0;
        if(getHex(x-1,y)) n++;
        if(getHex(x+1,y)) n++;
        if(getHex(x,y-1)) n++;
        if(getHex(x,y+1)) n++;
        if(n <= 1) toRemove.push({x,y});
      }
    }
  }
  toRemove.forEach(p => grid[p.y][p.x] = null);
}

// 3. Give stopper a clearer center highlight and darker side plane.
// Stopper is the topmost part (y from minY to about minY+5)
const stopperHighlight = '#FFFFFF';
const stopperDark = '#11348C';
for(let y=minY; y<minY+6; y++) {
  let rowCells = [];
  for(let x=0; x<width; x++){
    if(grid[y][x]) rowCells.push(x);
  }
  if(rowCells.length > 0) {
    let lx = rowCells[0];
    let rx = rowCells[rowCells.length-1];
    // Dark edges
    setHex(lx, y, stopperDark);
    setHex(rx, y, stopperDark);
    // Center highlight
    setHex(cx, y, stopperHighlight);
    setHex(cx-1, y, stopperHighlight);
  }
}

// 4. Reduce random mid-tone pixels (smoothing inside bottle, preserving cyan core)
for(let y=minY+6; y<=maxY; y++){
  for(let x=minX; x<=maxX; x++){
    const hex = grid[y][x];
    if(hex) {
      // If it's a bright cyan (core), keep it
      // cyan core hexes: #53EDF9, #D2FAFE, #ABE4F1
      if(['#53EDF9', '#D2FAFE', '#ABE4F1', '#2DB9EF'].includes(hex)) {
        continue;
      }
      
      // If it's a dark color, push it to main dark
      if(['#0E1130', '#11348C', '#1652B2'].includes(hex)) {
         grid[y][x] = '#0E1130';
      }
      
      // If it's a midtone blue, unify to a single midtone blue
      if(['#386694', '#344765', '#4D8DC2', '#BFD1DC'].includes(hex)) {
         grid[y][x] = '#386694';
      }
    }
  }
}

// 5. Add 2-3 deliberate glass shine shapes.
// A vertical streak on the left curve, and a smaller one on the right curve.
for(let y=minY+10; y<maxY-5; y++) {
  // Find leftmost boundary of bottle at this y
  let lx = -1;
  for(let x=0; x<width; x++){ if(grid[y][x]) { lx = x; break; } }
  
  if(lx !== -1) {
    // Add shine 2 pixels inset from the left
    setHex(lx+2, y, '#FFFFFF');
    // Maybe right side too
    let rx = -1;
    for(let x=width-1; x>=0; x--){ if(grid[y][x]) { rx = x; break; } }
    if(rx !== -1) {
      if(y % 3 === 0) setHex(rx-2, y, '#FFFFFF'); // broken shine on right
    }
  }
}

// Rebuild SCDL
// Make sure new colors exist in palette
const finalPalette = {...palette};
if(!Object.values(finalPalette).includes('#FFFFFF')) finalPalette['color_shine'] = '#FFFFFF';

let outScdl = `asset potion_forged_polished canvas 88x48\n\n`;
outScdl += `palette {\n`;
for(const [k, v] of Object.entries(finalPalette)) {
  outScdl += `  ${k} = ${v}\n`;
}
outScdl += `}\n\n`;

outScdl += `part flask material void_ice {\n  symmetry x\n`;
for(let y=0; y<height; y++){
  for(let x=0; x<width; x++){
    const hex = grid[y][x];
    if(hex) {
      let cName = Object.keys(finalPalette).find(k => finalPalette[k] === hex);
      outScdl += `  cell ${x} ${y} ${cName}\n`;
    }
  }
}
outScdl += `}\n`;

fs.writeFileSync('docs/references/SCDL/potion_forged_polished.scdl', outScdl);
console.log('Polished SCDL saved to docs/references/SCDL/potion_forged_polished.scdl');
