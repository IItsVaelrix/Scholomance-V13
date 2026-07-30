#!/usr/bin/env node
/**
 * Sword — VRI Pipeline: SCDL → VRI → Deterministic Multi-Pass Render
 *
 * Architecture (the membrane the forest identified):
 *   SCDL scene semantics (geometry, parts, materials)
 *     → compileSCDL (with art genes)
 *     → compileVRI (lower into Vixel Render IR)
 *     → renderVRI (geometry → texture → marks → lighting → atmosphere → raster)
 *     → pixel/vixel ablation PNGs at 4× and 8×
 *
 * This replaces the inline vixel renderer with the proper VRI layer.
 * The VRI is the "expressive render IR" that SCDL lowers into.
 *
 * Usage: node scripts/regen-sword-vri.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const scdlDir  = resolve(repoRoot, 'PolarisOS/worldpacks/shrine-demo/scdl');
const outDir   = resolve(repoRoot, 'PolarisOS/evidence');
mkdirSync(outDir, { recursive: true });

// ─── Pipeline imports ────────────────────────────────────────────────────────
const { compileSCDL } = await import(resolve(repoRoot, 'codex/core/pixelbrain/scdl/scdl.compiler.js'));
const { createArtGenePacket, PROJECTION_ALGO_VERSION, CONFLICT_POLICY_VERSION } = await import(resolve(repoRoot, 'codex/core/pixelbrain/scdna-art-gene.js'));
const { projectGenes } = await import(resolve(repoRoot, 'codex/core/pixelbrain/scdl/passes/project-genes.pass.js'));
const { compileVRI } = await import(resolve(repoRoot, 'codex/core/pixelbrain/vixel/vri-compiler.js'));
const { renderVRI } = await import(resolve(repoRoot, 'codex/core/pixelbrain/vixel/vri-renderer.js'));

// ─── PNG Encoder ─────────────────────────────────────────────────────────────
function writeU32BE(b,o,v){b[o]=v>>>24;b[o+1]=(v>>>16)&0xff;b[o+2]=(v>>>8)&0xff;b[o+3]=v&0xff;}
function writeU16LE(b,o,v){b[o]=v&0xff;b[o+1]=(v>>>8)&0xff;}
function concatBytes(a){const t=a.reduce((s,x)=>s+x.length,0);const o=new Uint8Array(t);let p=0;for(const x of a){o.set(x,p);p+=x.length;}return o;}
function adler32(d){let a=1,b=0;for(let i=0;i<d.length;i++){a=(a+d[i])%65521;b=(b+a)%65521;}return((b<<16)|a)>>>0;}
function crc32(d){let c=0xffffffff;for(let i=0;i<d.length;i++){c^=d[i];for(let j=0;j<8;j++)c=(c>>>1)^(c&1?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function pngChunk(t,d){const tt=new Uint8Array(t.length);for(let i=0;i<t.length;i++)tt[i]=t.charCodeAt(i);const l=new Uint8Array(4);writeU32BE(l,0,d.length);const cr=new Uint8Array(4);writeU32BE(cr,0,crc32(concatBytes([tt,d])));return concatBytes([l,tt,d,cr]);}
function zlibStore(d){const bl=[];for(let o=0;o<d.length;o+=65535){const c=d.subarray(o,Math.min(o+65535,d.length));const b=new Uint8Array(5+c.length);b[0]=o+c.length>=d.length?1:0;writeU16LE(b,1,c.length);writeU16LE(b,3,(~c.length)&0xffff);b.set(c,5);bl.push(b);}const cs=new Uint8Array(4);writeU32BE(cs,0,adler32(d));return concatBytes([new Uint8Array([0x78,0x01]),...bl,cs]);}
function encodePng(w,h,rgba){const ihdr=new Uint8Array(13);writeU32BE(ihdr,0,w);writeU32BE(ihdr,4,h);ihdr[8]=8;ihdr[9]=6;const s=w*4;const f=new Uint8Array((s+1)*h);for(let y=0;y<h;y++){f[y*(s+1)]=0;f.set(rgba.subarray(y*s,y*s+s),y*(s+1)+1);}return concatBytes([new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),pngChunk('IHDR',ihdr),pngChunk('IDAT',zlibStore(f)),pngChunk('IEND',new Uint8Array(0))]);}

// ─── Pixel Diff ──────────────────────────────────────────────────────────────
function pixelDiff(a, b) {
  let diffPixels = 0, maxDelta = 0, sumDelta = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.abs(a.data[i]-b.data[i]) + Math.abs(a.data[i+1]-b.data[i+1]) +
              Math.abs(a.data[i+2]-b.data[i+2]) + Math.abs(a.data[i+3]-b.data[i+3]);
    if (d > 0) { diffPixels++; sumDelta += d; maxDelta = Math.max(maxDelta, d); }
  }
  return { total: a.data.length / 4, diffPixels, ratio: diffPixels / (a.data.length / 4), avgDelta: diffPixels ? sumDelta / diffPixels : 0, maxDelta };
}

// ─── Load SCDL + Genes ───────────────────────────────────────────────────────
const scdlSource = readFileSync(resolve(scdlDir, 'sword.scdl'), 'utf8');
const genesRaw = JSON.parse(readFileSync(resolve(scdlDir, 'sword.art-genes.json'), 'utf8'));
const canvas = genesRaw.canvas;

const genes = genesRaw.genes.map((g) => createArtGenePacket({
  assetId: genesRaw.assetId, geneId: g.geneId, geneType: 'art-direction',
  priority: g.priority, projectionMode: g.projectionMode, canvas,
  coordinates: g.coordinates, geometryHints: g.geometryHints,
  role: g.role, curator: g.curator, rationale: g.rationale,
}));

console.log('═══ SWORD VRI PIPELINE ═══');
console.log(`Genes: ${genes.length}`);

// ─── Project ─────────────────────────────────────────────────────────────────
const projectionContext = {
  canvas, compilerVersion: 'scdl-compiler-1.0.0',
  projectionAlgoVersion: PROJECTION_ALGO_VERSION,
  conflictPolicyVersion: CONFLICT_POLICY_VERSION,
  paletteRoleMappingVersion: 'sword-palette-v1',
  sdfByPart: {},
};
const projection = projectGenes(genes, projectionContext);
console.log(`Projected: ${projection.cells.length} cells, ${projection.conflicts.length} conflicts`);

// ─── Compile SCDL ────────────────────────────────────────────────────────────
const result = compileSCDL(scdlSource, { artGenes: genes, artProjectionContext: projectionContext });
if (!result.ok) {
  console.error('✗ Compilation failed:');
  for (const e of result.errors) console.error(`  ${e.message}`);
  process.exit(1);
}
const packet = result.packet;
const coords = packet.geometry.coordinates;
const geneCells = coords.filter((c) => c._gene);
console.log(`Compiled: ${coords.length} coords (${geneCells.length} gene-projected)`);

// ─── Lower into VRI ──────────────────────────────────────────────────────────
// This is the architectural correction: SCDL → VRI → render passes → raster.
// The VRI carries layered texture fields, lighting, marks, and atmosphere
// that SCDL cannot express directly.
const vriScene = compileVRI(packet, {
  artGenes: genes,
  lighting: {
    key: {
      position: [canvas.width * 0.2, canvas.height * 0.05],
      direction: [-0.6, -0.7],
      color: '#FFFFFF',
      intensity: 0.75,
    },
    rim: {
      position: [canvas.width * 0.8, canvas.height * 0.1],
      direction: [0.5, -0.3],
      color: '#8AB4F8',
      intensity: 0.35,
    },
    ambient: {
      color: '#0A0A1E',
      intensity: 0.12,
    },
    points: [
      // Gold pommel catch-light
      { id: 'pommel-glint', position: [canvas.width * 0.5, canvas.height * 0.88], color: '#FFE88A', radius: 3, intensity: 0.6, affects: ['gold'] },
    ],
  },
  atmosphere: {
    fog: null,
    bloom: null,
    grading: { contrast: 1.08, saturation: 1.05 },
  },
});

console.log(`\nVRI Scene: ${vriScene.id}`);
console.log(`  Layers: ${vriScene.layers.length} (geo: 1, texture: ${vriScene.layers.filter(l=>l.type==='texture').length}, mark: ${vriScene.layers.filter(l=>l.type==='mark').length})`);
console.log(`  Lights: ${vriScene.lights.length} (${vriScene.lights.map(l=>l.kind).join(', ')})`);
console.log(`  Checksum: ${vriScene.checksum}`);

// ─── Render via VRI (multi-pass) ────────────────────────────────────────────
const cw = packet.canvas.width, ch = packet.canvas.height;
console.log(`\nCanvas: ${cw}×${ch}, rendering via VRI at 4× and 8×...`);

for (const scale of [4, 8]) {
  const vri = renderVRI(vriScene, scale);

  // Ablation: render with no texture/light (geometry-only baseline)
  const bareScene = compileVRI(packet, { lighting: null, atmosphere: null });
  // Strip texture and mark layers for bare baseline
  const bareGeo = { ...bareScene, layers: bareScene.layers.filter(l => l.type === 'geometry'), lights: [] };
  const bare = renderVRI(Object.freeze(bareGeo), scale);

  const diff = pixelDiff(vri, bare);

  const vriPng = encodePng(vri.width, vri.height, vri.data);
  const barePng = encodePng(bare.width, bare.height, bare.data);

  writeFileSync(resolve(outDir, `vixel-sword-${scale}x.png`), vriPng);
  writeFileSync(resolve(outDir, `pixel-sword-${scale}x.png`), barePng);

  // Count unique colors
  const vColors = new Set();
  for (let i = 0; i < vri.data.length; i += 4) {
    if (vri.data[i+3] > 0) vColors.add(`${vri.data[i]},${vri.data[i+1]},${vri.data[i+2]}`);
  }
  const bColors = new Set();
  for (let i = 0; i < bare.data.length; i += 4) {
    if (bare.data[i+3] > 0) bColors.add(`${bare.data[i]},${bare.data[i+1]},${bare.data[i+2]}`);
  }

  console.log(`  ${scale}×: VRI ${vri.width}×${vri.height} (${vriPng.length} B, ${vColors.size} colors) | bare ${bColors.size} colors | diff ${(diff.ratio*100).toFixed(1)}% avgΔ=${diff.avgDelta.toFixed(0)} maxΔ=${diff.maxDelta}`);
}

// ─── Verify ──────────────────────────────────────────────────────────────────
const grid = Array.from({length:ch},()=>Array(cw).fill(false));
for (const c of coords) { const x=c.snappedX??c.x, y=c.snappedY??c.y; if(x>=0&&x<cw&&y>=0&&y<ch) grid[y][x]=true; }
const ext = Array.from({length:ch},()=>Array(cw).fill(false));
const q=[];
for(let x=0;x<cw;x++){if(!grid[0][x]){ext[0][x]=true;q.push([x,0]);}if(!grid[ch-1][x]){ext[ch-1][x]=true;q.push([x,ch-1]);}}
for(let y=0;y<ch;y++){if(!grid[y][0]){ext[y][0]=true;q.push([0,y]);}if(!grid[y][cw-1]){ext[y][cw-1]=true;q.push([cw-1,y]);}}
while(q.length){const[x,y]=q.pop();for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx>=0&&nx<cw&&ny>=0&&ny<ch&&!grid[ny][nx]&&!ext[ny][nx]){ext[ny][nx]=true;q.push([nx,ny]);}}}
let holes=0;for(let y=0;y<ch;y++)for(let x=0;x<cw;x++)if(!grid[y][x]&&!ext[y][x])holes++;
console.log(`\nEnclosed holes: ${holes} ${holes===0?'✓':'✗'}`);

// ─── Determinism ─────────────────────────────────────────────────────────────
const v1 = renderVRI(vriScene, 8);
const v2 = renderVRI(vriScene, 8);
const deterministic = Buffer.from(v1.data).equals(Buffer.from(v2.data));
console.log(`Deterministic: ${deterministic ? '✓ PASS' : '✗ FAIL'}`);

// ─── VRI vs old inline renderer comparison ───────────────────────────────────
console.log(`\n── Architecture ──`);
console.log(`  OLD: SCDL → inline renderVixel() (monolithic, no layers)`);
console.log(`  NEW: SCDL → compileVRI() → renderVRI() (layered, lit, textured, graded)`);
console.log(`  VRI layers: ${vriScene.layers.map(l => `${l.type}(${l.id})`).join(' → ')}`);
console.log(`  VRI lights: ${vriScene.lights.map(l => `${l.kind}:${l.id}`).join(', ')}`);

console.log('\n═══ SWORD VRI COMPLETE ═══');
