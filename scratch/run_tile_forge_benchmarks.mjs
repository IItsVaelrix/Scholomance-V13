import fs from 'fs';
import path from 'path';
import { runTileForgeBenchmarks } from '../codex/core/pixelbrain/tile-forge/tile-forge.benchmark.js';
import { encodePng } from '../codex/core/pixelbrain/scdl/scdl.exporters.js';

const ARTIFACT_DIR = '/home/deck/.gemini/antigravity-ide/brain/2d997ff7-470b-4154-8bf0-043db49fc909';

console.log('--- Running Tile Forge Professional Fidelity Benchmark Suite ---');
const results = runTileForgeBenchmarks(4242);

for (const res of results) {
  console.log(`- [${res.id}] "${res.name}": Score ${res.evaluation.score}/100 (Grade ${res.evaluation.grade}) | ${res.width}x${res.height}px | ${res.activeCellCount} cells`);
  if (res.evaluation.issues.length > 0) {
    console.log(`  Issues: ${res.evaluation.issues.join(', ')}`);
  }

  // Export individual PNG
  const pngBytes = encodePng(res.width, res.height, res.asset.data);
  const outPath = path.join(ARTIFACT_DIR, `tile_forge_${res.id}.png`);
  fs.writeFileSync(outPath, pngBytes);
}

// Build 4x3 composite montage
// Layout: 4 columns x 3 rows. Cell slot: 200w x 220h. Total canvas: 800w x 660h.
const slotW = 200;
const slotH = 220;
const cols = 4;
const rows = 3;
const montageW = slotW * cols;
const montageH = slotH * rows;
const montageBuf = new Uint8ClampedArray(montageW * montageH * 4);

// Fill with warm dark obsidian background (#111827)
for (let i = 0; i < montageBuf.length; i += 4) {
  montageBuf[i] = 17;
  montageBuf[i + 1] = 24;
  montageBuf[i + 2] = 39;
  montageBuf[i + 3] = 255;
}

// Draw subtle grid cell borders
for (let r = 0; r < rows; r += 1) {
  for (let c = 0; c < cols; c += 1) {
    const startX = c * slotW;
    const startY = r * slotH;
    for (let x = 0; x < slotW; x += 1) {
      const topIdx = (startY * montageW + (startX + x)) * 4;
      montageBuf[topIdx] = 31;
      montageBuf[topIdx + 1] = 41;
      montageBuf[topIdx + 2] = 55;
    }
    for (let y = 0; y < slotH; y += 1) {
      const leftIdx = ((startY + y) * montageW + startX) * 4;
      montageBuf[leftIdx] = 31;
      montageBuf[leftIdx + 1] = 41;
      montageBuf[leftIdx + 2] = 55;
    }
  }
}

// Blit each asset centered in its slot
results.forEach((res, idx) => {
  const col = idx % cols;
  const row = Math.floor(idx / cols);
  const slotStartX = col * slotW;
  const slotStartY = row * slotH;

  // Center asset horizontally and position vertically (with ground at ~175 in slot)
  const offsetX = slotStartX + Math.floor((slotW - res.width) / 2);
  const offsetY = slotStartY + Math.floor((slotH - res.height) / 2);

  const srcData = res.asset.data;
  const srcW = res.width;
  const srcH = res.height;

  for (let y = 0; y < srcH; y += 1) {
    for (let x = 0; x < srcW; x += 1) {
      const dstX = offsetX + x;
      const dstY = offsetY + y;
      if (dstX >= 0 && dstX < montageW && dstY >= 0 && dstY < montageH) {
        const srcIdx = (y * srcW + x) * 4;
        const dstIdx = (dstY * montageW + dstX) * 4;
        const alpha = srcData[srcIdx + 3];
        if (alpha > 0) {
          const a = alpha / 255;
          const invA = 1 - a;
          montageBuf[dstIdx] = Math.round(srcData[srcIdx] * a + montageBuf[dstIdx] * invA);
          montageBuf[dstIdx + 1] = Math.round(srcData[srcIdx + 1] * a + montageBuf[dstIdx + 1] * invA);
          montageBuf[dstIdx + 2] = Math.round(srcData[srcIdx + 2] * a + montageBuf[dstIdx + 2] * invA);
          montageBuf[dstIdx + 3] = 255;
        }
      }
    }
  }
});

const montageBytes = encodePng(montageW, montageH, montageBuf);
const montagePath = path.join(ARTIFACT_DIR, 'tile_forge_benchmark_montage.png');
fs.writeFileSync(montagePath, montageBytes);

console.log(`\nSuccessfully exported 12 individual benchmark PNGs and composite montage: ${montagePath}`);
