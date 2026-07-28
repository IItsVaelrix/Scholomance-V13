#!/usr/bin/env node
/**
 * Brazier Embryonic Regeneration — Ontological Art-Direction Pipeline Test
 *
 * Deletes nothing. Regenerates the brazier from an embryonic SCDL skeleton
 * plus curated art-direction genes, exercising the full new pipeline:
 *
 *   embryonic SCDL (geometry only)
 *     ↓ compileSCDL(source, { artGenes, artProjectionContext })
 *   project-genes.pass.js (deterministic projection)
 *     ↓
 *   PixelBrainAssetPacket with per-cell causal provenance (_gene block)
 *     ↓ vixel-rasterize
 *   pixel-brazier-{4,8}x.png + vixel-brazier-{4,8}x.png
 *
 * Usage: node scripts/regen-brazier-embryonic.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const scdlDir  = resolve(repoRoot, 'PolarisOS/worldpacks/shrine-demo/scdl');
const outDir   = resolve(repoRoot, 'PolarisOS/evidence');

// ─── Pipeline imports ────────────────────────────────────────────────────────
const { compileSCDL } = await import(
  resolve(repoRoot, 'codex/core/pixelbrain/scdl/scdl.compiler.js')
);
const { createArtGenePacket, PROJECTION_ALGO_VERSION, CONFLICT_POLICY_VERSION } = await import(
  resolve(repoRoot, 'codex/core/pixelbrain/scdna-art-gene.js')
);
const { projectGenes } = await import(
  resolve(repoRoot, 'codex/core/pixelbrain/scdl/passes/project-genes.pass.js')
);
const { computePreviewChecksums } = await import(
  resolve(repoRoot, 'codex/core/pixelbrain/scdna-art-gene-compiler.js')
);

// ─── Step 1: Load embryonic SCDL ─────────────────────────────────────────────
const scdlSource = readFileSync(resolve(scdlDir, 'brazier.scdl'), 'utf8');
console.log('═══ BRAZIER EMBRYONIC REGENERATION ═══');
console.log('SCDL source: embryonic geometry skeleton (zero hand-placed cells)');

// ─── Step 2: Load and instantiate art-direction genes ───────────────────────
const genesRaw = JSON.parse(readFileSync(resolve(scdlDir, 'brazier.art-genes.json'), 'utf8'));
const canvas   = genesRaw.canvas;

const genes = genesRaw.genes.map((g) =>
  createArtGenePacket({
    assetId:        genesRaw.assetId,
    geneId:         g.geneId,
    geneType:       'art-direction',
    priority:       g.priority,
    projectionMode: g.projectionMode,
    canvas,
    coordinates:    g.coordinates,
    geometryHints:  g.geometryHints,
    role:           g.role,
    curator:        g.curator,
    rationale:      g.rationale,
  })
);

console.log(`Art genes loaded: ${genes.length}`);
for (const g of genes) {
  console.log(`  [${g.geneId}] priority=${g.priority} mode=${g.projectionMode} coords=${g.coordinates.length} checksum=${g.checksum.slice(0, 24)}…`);
}

// ─── Step 3: Build projection context ───────────────────────────────────────
const projectionContext = {
  canvas,
  compilerVersion:            'scdl-compiler-1.0.0',
  projectionAlgoVersion:      PROJECTION_ALGO_VERSION,
  conflictPolicyVersion:      CONFLICT_POLICY_VERSION,
  paletteRoleMappingVersion:  'brazier-palette-v1',
  sdfByPart:                  {},   // explicit-mode genes — no SDF needed
};

// ─── Step 4: Project genes (pure, deterministic) ────────────────────────────
const projection = projectGenes(genes, projectionContext);
console.log(`\nProjection: ${projection.cells.length} cells, ${projection.conflicts.length} conflicts`);
console.log(`Projection checksum: ${projection.projectionChecksum.slice(0, 32)}…`);
console.log(`Gene order: ${projection.orderedGeneIds.join(' → ')}`);

// ─── Step 5: Compute preview checksums (§10.6) ─────────────────────────────
const preview = computePreviewChecksums({
  canvas,
  cells: projection.cells,
  paletteRoleMappingVersion: 'brazier-palette-v1',
});
console.log(`\nPreview model checksum:    ${preview.modelChecksum.slice(0, 32)}…`);
console.log(`Preview document checksum: ${preview.documentChecksum.slice(0, 32)}…`);

// Write deterministic SVG preview
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'brazier-gene-preview.svg'), preview.svgSource, 'utf8');
console.log('SVG preview written: PolarisOS/evidence/brazier-gene-preview.svg');

// ─── Step 6: Compile SCDL with art genes ───────────────────────────────────
const result = compileSCDL(scdlSource, {
  artGenes:             genes,
  artProjectionContext: projectionContext,
});

if (!result.ok) {
  console.error('\n✗ SCDL compilation failed:');
  for (const e of result.errors) console.error(`  [${e.severity}] ${e.message}`);
  process.exit(1);
}

const packet = result.packet;
console.log(`\nSCDL compiled OK: ${packet.id}`);
console.log(`Total coordinates: ${packet.geometry.coordinates.length}`);

// Count gene-projected cells
const geneCells = packet.geometry.coordinates.filter((c) => c._gene);
console.log(`Gene-projected cells: ${geneCells.length}`);
for (const c of geneCells.slice(0, 5)) {
  console.log(`  (${c.x},${c.y}) ${c.color} gene=${c._gene.geneId} role=${c.role}`);
}
if (geneCells.length > 5) console.log(`  … and ${geneCells.length - 5} more`);

// ─── Step 7: Write compiled packet ─────────────────────────────────────────
const packetPath = resolve(scdlDir, 'brazier-json.json');
writeFileSync(packetPath, JSON.stringify(packet, null, 2), 'utf8');
console.log(`\nPacket written: ${packetPath}`);

// ─── Step 8: Render PNGs via vixel rasterizer ──────────────────────────────
const { renderVixel, encodePng } = await import(
  resolve(repoRoot, 'PolarisOS/scripts/vixel-rasterize.mjs')
).then((m) => m).catch(() => null) ?? {};

// Inline PNG renderer (same algorithm as vixel-rasterize.mjs)
function hexToRGBA(hex) {
  const h = (hex || '').replace('#', '');
  if (h.length < 6) return [0, 0, 0, 0];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
    h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255,
  ];
}

function clamp255(v) { return Math.max(0, Math.min(255, Math.round(v))); }

function renderFlat(cells, width, height, scale) {
  const W = width * scale, H = height * scale;
  const buf = new Uint8Array(W * H * 4);
  for (const cell of cells) {
    const cx = cell.snappedX ?? cell.x;
    const cy = cell.snappedY ?? cell.y;
    if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;
    const [r, g, b, a] = hexToRGBA(cell.color);
    for (let sy = 0; sy < scale; sy++) {
      for (let sx = 0; sx < scale; sx++) {
        const idx = ((cy * scale + sy) * W + (cx * scale + sx)) * 4;
        buf[idx] = r; buf[idx+1] = g; buf[idx+2] = b; buf[idx+3] = a;
      }
    }
  }
  return { width: W, height: H, data: buf };
}

function writeU32BE(buf, off, v) { buf[off]=v>>>24; buf[off+1]=(v>>>16)&0xff; buf[off+2]=(v>>>8)&0xff; buf[off+3]=v&0xff; }
function writeU16LE(buf, off, v) { buf[off]=v&0xff; buf[off+1]=(v>>>8)&0xff; }
function concatBytes(arrs) { const t=arrs.reduce((s,a)=>s+a.length,0); const o=new Uint8Array(t); let p=0; for(const a of arrs){o.set(a,p);p+=a.length;} return o; }
function adler32(d){let a=1,b=0;for(let i=0;i<d.length;i++){a=(a+d[i])%65521;b=(b+a)%65521;}return((b<<16)|a)>>>0;}
function crc32(d){let c=0xffffffff;for(let i=0;i<d.length;i++){c^=d[i];for(let j=0;j<8;j++)c=(c>>>1)^(c&1?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function pngChunk(type,data){const t=new Uint8Array(type.length);for(let i=0;i<type.length;i++)t[i]=type.charCodeAt(i);const l=new Uint8Array(4);writeU32BE(l,0,data.length);const cr=new Uint8Array(4);writeU32BE(cr,0,crc32(concatBytes([t,data])));return concatBytes([l,t,data,cr]);}
function zlibStore(data){const blocks=[];for(let off=0;off<data.length;off+=65535){const ch=data.subarray(off,Math.min(off+65535,data.length));const bl=new Uint8Array(5+ch.length);bl[0]=off+ch.length>=data.length?1:0;writeU16LE(bl,1,ch.length);writeU16LE(bl,3,(~ch.length)&0xffff);bl.set(ch,5);blocks.push(bl);}const cs=new Uint8Array(4);writeU32BE(cs,0,adler32(data));return concatBytes([new Uint8Array([0x78,0x01]),...blocks,cs]);}
function encodePngLocal(width,height,rgba){const ihdr=new Uint8Array(13);writeU32BE(ihdr,0,width);writeU32BE(ihdr,4,height);ihdr[8]=8;ihdr[9]=6;const stride=width*4;const filtered=new Uint8Array((stride+1)*height);for(let y=0;y<height;y++){filtered[y*(stride+1)]=0;filtered.set(rgba.subarray(y*stride,y*stride+stride),y*(stride+1)+1);}return concatBytes([new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),pngChunk('IHDR',ihdr),pngChunk('IDAT',zlibStore(filtered)),pngChunk('IEND',new Uint8Array(0))]);}

const coords = packet.geometry.coordinates;
const cw = packet.canvas.width, ch = packet.canvas.height;

for (const scale of [4, 8]) {
  const img = renderFlat(coords, cw, ch, scale);
  const png = encodePngLocal(img.width, img.height, img.data);
  const name = `pixel-brazier-${scale}x.png`;
  writeFileSync(resolve(outDir, name), png);
  console.log(`Rendered: PolarisOS/evidence/${name} (${img.width}×${img.height}, ${png.length} bytes)`);
}

// ─── Step 9: Verify — no enclosed holes ────────────────────────────────────
const grid = Array.from({ length: ch }, () => Array(cw).fill(false));
for (const c of coords) {
  const x = c.snappedX ?? c.x, y = c.snappedY ?? c.y;
  if (x >= 0 && x < cw && y >= 0 && y < ch) grid[y][x] = true;
}

// Flood fill from border to find exterior
const ext = Array.from({ length: ch }, () => Array(cw).fill(false));
const queue = [];
for (let x = 0; x < cw; x++) { if (!grid[0][x]) { ext[0][x]=true; queue.push([x,0]); } if (!grid[ch-1][x]) { ext[ch-1][x]=true; queue.push([x,ch-1]); } }
for (let y = 0; y < ch; y++) { if (!grid[y][0]) { ext[y][0]=true; queue.push([0,y]); } if (!grid[y][cw-1]) { ext[y][cw-1]=true; queue.push([cw-1,y]); } }
while (queue.length) {
  const [x,y] = queue.pop();
  for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const nx=x+dx, ny=y+dy;
    if (nx>=0&&nx<cw&&ny>=0&&ny<ch&&!grid[ny][nx]&&!ext[ny][nx]) { ext[ny][nx]=true; queue.push([nx,ny]); }
  }
}
let holes = 0;
for (let y=0;y<ch;y++) for(let x=0;x<cw;x++) if(!grid[y][x]&&!ext[y][x]) holes++;
console.log(`\nEnclosed holes: ${holes} ${holes===0?'✓':'✗'}`);

// ─── Step 10: Print silhouette ─────────────────────────────────────────────
console.log('\nSilhouette:');
const roleChar = { 'rim-highlight':'H', 'rim-band-fill':'R', 'coal-bed-fill':'C', 'base-highlight':'B' };
for (let y = 0; y < ch; y++) {
  let row = String(y).padStart(2) + ' ';
  for (let x = 0; x < cw; x++) {
    const c = coords.find((c) => (c.snappedX??c.x)===x && (c.snappedY??c.y)===y);
    if (!c) { row += ext[y]?.[x] ? ' ' : '·'; }
    else if (c._gene) { row += roleChar[c.role] ?? 'G'; }
    else { row += '█'; }
  }
  console.log(row);
}
console.log('\nLegend: █=geometry  H=rim-highlight(gene)  R=rim-band-fill(gene)  C=coal-bed-fill(gene)  B=base-highlight(gene)  ·=enclosed hole');
console.log('\n═══ REGENERATION COMPLETE ═══');
