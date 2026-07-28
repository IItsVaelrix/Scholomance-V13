#!/usr/bin/env node
/**
 * Sword — Full Pipeline: SCDL + Art Genes + Vixel Rasterizer + Shader Packet
 *
 * Pipeline:
 *   embryonic SCDL (geometry)
 *     → compileSCDL (with art genes)
 *     → vixel rasterizer (SDF sub-cell AA + tangent-aligned material grain)
 *     → PB-SHADER-v1 packet (GLSL fragment: specular + diffuse + rim light)
 *     → .gdshader export (Godot runtime)
 *     → pixel/vixel ablation PNGs at 4× and 8×
 *
 * Usage: node scripts/regen-sword.mjs
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
const { computePreviewChecksums } = await import(resolve(repoRoot, 'codex/core/pixelbrain/scdna-art-gene-compiler.js'));
const { createShaderPacket, validateShaderPacket, hashShaderPacket } = await import(resolve(repoRoot, 'codex/core/pixelbrain/shader-packet.js'));
const { exportToGodotShader } = await import(resolve(repoRoot, 'src/lib/exporters/pixelbrainGodotShaderExport.js'));

// ─── Material Grain Table ────────────────────────────────────────────────────
const MATERIAL_GRAIN = {
  steel:   { direction: 0,         frequency: 0.22, crossFrequency: 0.10, amplitude: 0.45 },
  iron:    { direction: 0,         frequency: 0.28, crossFrequency: 0.14, amplitude: 0.35 },
  leather: { direction: Math.PI/6, frequency: 0.35, crossFrequency: 0.08, amplitude: 0.25 },
  gold:    { direction: Math.PI/4, frequency: 0.18, crossFrequency: 0.12, amplitude: 0.50 },
  source:  { direction: 0,         frequency: 0,    crossFrequency: 0,    amplitude: 0 },
};

// ─── Vixel Renderer (SDF AA + tangent-aligned grain) ────────────────────────
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
function clamp255(v) { return Math.max(0, Math.min(255, Math.round(v))); }
function hexToRGBA(hex) {
  const h = (hex || '').replace('#', '');
  if (h.length < 6) return [0, 0, 0, 0];
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16), h.length>=8?parseInt(h.slice(6,8),16):255];
}

function renderVixel(cells, width, height, scale, nullVector = false) {
  const W = width * scale, H = height * scale;
  const buf = new Uint8Array(W * H * 4);
  for (const cell of cells) {
    const cx = cell.snappedX ?? cell.x, cy = cell.snappedY ?? cell.y;
    if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;
    const baseColor = hexToRGBA(cell.color);
    const sd = nullVector ? null : cell.signedDistance;
    const tangent = nullVector ? null : cell.tangent;
    const normal = nullVector ? null : cell.normal;
    const grain = MATERIAL_GRAIN[cell.material] || null;
    for (let sy = 0; sy < scale; sy++) {
      for (let sx = 0; sx < scale; sx++) {
        const idx = ((cy * scale + sy) * W + (cx * scale + sx)) * 4;
        const u = (sx + 0.5) / scale, v = (sy + 0.5) / scale;
        let coverage = 1.0, grainMod = 0;
        if (!nullVector && sd !== null && sd !== undefined) {
          const localSD = sd + ((u - 0.5) * (normal ? normal[0] : 0) + (v - 0.5) * (normal ? normal[1] : 0));
          const edge = 0.5 / scale;
          const hw = cell.strokeHalfWidth;
          if (hw != null) {
            coverage = smoothstep(edge, -edge, Math.abs(localSD) - hw);
          } else {
            coverage = smoothstep(-edge, edge, -localSD);
          }
          if (grain && grain.amplitude > 0 && tangent) {
            const tx = tangent[0], ty = tangent[1];
            const nx = normal ? normal[0] : -ty, ny = normal ? normal[1] : tx;
            const du = u - 0.5, dv = v - 0.5;
            const dAlong = du * tx + dv * ty, dAcross = du * nx + dv * ny;
            const arcLen = cell.arcLength || 1;
            const s = (cell.t || 0) * arcLen + dAlong;
            const d = (sd || 0) + dAcross;
            const freqEff = Math.max(1, Math.round(arcLen * grain.frequency)) / arcLen;
            const crossFreqEff = Math.max(1, Math.round(arcLen * grain.crossFrequency)) / arcLen;
            grainMod = grain.amplitude * Math.sin(s * freqEff * Math.PI * 2 + d * crossFreqEff * Math.PI * 2 + grain.direction);
          }
        } else {
          if (grain && grain.amplitude > 0) {
            grainMod = grain.amplitude * Math.sin((cx + u) * grain.frequency * Math.PI * 2 + grain.direction);
          }
        }
        buf[idx]     = clamp255(baseColor[0] + grainMod * 40);
        buf[idx + 1] = clamp255(baseColor[1] + grainMod * 35);
        buf[idx + 2] = clamp255(baseColor[2] + grainMod * 30);
        buf[idx + 3] = Math.round(baseColor[3] * coverage);
      }
    }
  }
  return { width: W, height: H, data: buf };
}

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

console.log('═══ SWORD FULL PIPELINE ═══');
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

// ─── Preview ─────────────────────────────────────────────────────────────────
const preview = computePreviewChecksums({ canvas, cells: projection.cells, paletteRoleMappingVersion: 'sword-palette-v1' });
writeFileSync(resolve(outDir, 'sword-gene-preview.svg'), preview.svgSource, 'utf8');

// ─── Compile ─────────────────────────────────────────────────────────────────
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
writeFileSync(resolve(scdlDir, 'sword-json.json'), JSON.stringify(packet, null, 2), 'utf8');

// ─── Shader Packet (PB-SHADER-v1) ───────────────────────────────────────────
const SWORD_FRAGMENT = `// Sword — specular blade highlight + diffuse body + rim light.
// Deterministic: all lighting derives from fixed light direction + u_time shimmer.
const vec3 LIGHT_DIR = normalize(vec3(-0.6, -0.7, 0.4)); // upper-left key light
const vec3 SPEC_COLOR = vec3(0.95, 0.97, 1.0);           // cool white specular
const vec3 RIM_COLOR = vec3(0.55, 0.65, 0.85);           // steel-blue rim
const float SPEC_POWER = 32.0;
const float RIM_POWER = 3.0;

// Blade region in UV: x in [0.33, 0.67], y in [0.0, 0.625] (rows 0-19 of 32)
float bladeMask(vec2 uv) {
  float bx = smoothstep(0.30, 0.36, uv.x) * (1.0 - smoothstep(0.64, 0.70, uv.x));
  float by = 1.0 - smoothstep(0.58, 0.65, uv.y);
  return bx * by;
}

// Fuller groove: narrow dark channel down the blade center
float fullerMask(vec2 uv) {
  float fx = smoothstep(0.40, 0.43, uv.x) * (1.0 - smoothstep(0.57, 0.60, uv.x));
  float fy = smoothstep(0.08, 0.12, uv.y) * (1.0 - smoothstep(0.55, 0.60, uv.y));
  return fx * fy;
}

vec4 pbMain(vec2 uv, float time, float resonance) {
  // Surface normal approximation: blade faces viewer, slight bevel at edges
  float blade = bladeMask(uv);
  float fuller = fullerMask(uv);

  // Bevel normal: edges tilt outward
  float bevelX = (uv.x - 0.5) * 4.0;
  vec3 N = normalize(vec3(bevelX * blade * 0.3, 0.0, 1.0));

  // Diffuse
  float diff = max(dot(N, LIGHT_DIR), 0.0) * 0.6 + 0.4;

  // Specular (Blinn-Phong)
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(LIGHT_DIR + V);
  float spec = pow(max(dot(N, H), 0.0), SPEC_POWER) * blade;

  // Animated shimmer along blade length (subtle, resonance-driven)
  float shimmer = sin(uv.y * 40.0 - time * 2.0) * 0.5 + 0.5;
  spec *= (0.7 + 0.3 * shimmer * resonance);

  // Rim light (Fresnel approximation)
  float rim = pow(1.0 - max(dot(N, V), 0.0), RIM_POWER) * blade;

  // Fuller darkening
  float groove = 1.0 - fuller * 0.4;

  vec3 color = vec3(diff * groove);
  color += SPEC_COLOR * spec * 0.8;
  color += RIM_COLOR * rim * 0.3;

  float alpha = max(spec * 0.9, max(rim * 0.4, 0.0));
  return vec4(color, clamp(alpha, 0.0, 1.0));
}`;

const shaderPacket = createShaderPacket({
  id: 'sword-blade-lighting',
  label: 'Sword Blade Lighting — Specular + Diffuse + Rim',
  fragmentSource: SWORD_FRAGMENT,
  uniforms: {
    u_spec_power: { type: 'float', source: 'material.specPower', default: 32.0 },
    u_rim_color: { type: 'vec3', source: 'material.rimColor', default: [0.55, 0.65, 0.85] },
  },
  canvas: { width: canvas.width, height: canvas.height },
  deterministicSeed: 42,
});
validateShaderPacket(shaderPacket);
const shaderHash = hashShaderPacket(shaderPacket);
console.log(`\nShader: ${shaderPacket.id}`);
console.log(`Shader hash: ${shaderHash}`);

// ─── Godot .gdshader Export ─────────────────────────────────────────────────
const godotShader = exportToGodotShader(shaderPacket);
writeFileSync(resolve(outDir, 'sword.gdshader'), godotShader, 'utf8');
console.log(`Godot shader: PolarisOS/evidence/sword.gdshader (${godotShader.length} bytes)`);

// ─── Render PNGs (vixel + pixel ablation) ───────────────────────────────────
const cw = packet.canvas.width, ch = packet.canvas.height;
console.log(`\nCanvas: ${cw}×${ch}, rendering at 4× and 8×...`);

for (const scale of [4, 8]) {
  const vixel = renderVixel(coords, cw, ch, scale, false);
  const pixel = renderVixel(coords, cw, ch, scale, true);
  const diff = pixelDiff(vixel, pixel);

  const vixelPng = encodePng(vixel.width, vixel.height, vixel.data);
  const pixelPng = encodePng(pixel.width, pixel.height, pixel.data);

  writeFileSync(resolve(outDir, `vixel-sword-${scale}x.png`), vixelPng);
  writeFileSync(resolve(outDir, `pixel-sword-${scale}x.png`), pixelPng);

  // Count unique colors
  const vColors = new Set();
  for (let i = 0; i < vixel.data.length; i += 4) {
    if (vixel.data[i+3] > 0) vColors.add(`${vixel.data[i]},${vixel.data[i+1]},${vixel.data[i+2]}`);
  }

  console.log(`  ${scale}×: vixel ${vixel.width}×${vixel.height} (${vixelPng.length} B, ${vColors.size} colors) | pixel ${pixelPng.length} B | diff ${(diff.ratio*100).toFixed(1)}% avgΔ=${diff.avgDelta.toFixed(0)}`);
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
const v1 = renderVixel(coords, cw, ch, 8, false);
const v2 = renderVixel(coords, cw, ch, 8, false);
const deterministic = Buffer.from(v1.data).equals(Buffer.from(v2.data));
console.log(`Deterministic: ${deterministic ? '✓ PASS' : '✗ FAIL'}`);

console.log('\n═══ SWORD COMPLETE ═══');
