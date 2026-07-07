/**
 * generate-pine-tree.mjs
 * Detailed isometric pine tree — organic jagged edges, 6-depth shading,
 * needle clusters, branch droop, bark texture, root flare, ground AO.
 *
 * Canvas: 80×120px   Frames: 4 variants
 * Output: docs/references/Pine Tree Isometric.aseprite
 *         docs/references/Pine Tree *.png
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { deflateSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

import { perlinNoiseGrid } from '../codex/core/pixelbrain/procedural-noise.js';
import { transmuteMaterialColor } from '../codex/core/pixelbrain/material-registry.js';

const W = 80, H = 120;
const CX = 40;

// ── 7-stop foliage palette ────────────────────────────────────────────────────
const P = {
  // Foliage — light source is top-right (iso convention)
  f0: '#060F09',  // deep inner shadow / AO pocket
  f1: '#0A1F14',  // shadow
  f2: '#122B1D',  // dark
  f3: '#1E4430',  // mid-shadow
  f4: '#2E5C3F',  // base body
  f5: '#4A7A55',  // lit mid
  f6: '#6BA870',  // highlight / sun tip
  f7: '#8FD490',  // specular pop on very tip
  // Trunk
  t0: '#1A0A04',  // trunk deep shadow
  t1: '#2A1A0C',  // trunk shadow
  t2: '#3D2513',  // trunk mid
  t3: '#5C3A1F',  // trunk lit face
  t4: '#7A5234',  // trunk highlight
  // Bark detail
  b0: '#1F1008',  // bark crack dark
  b1: '#4A2E16',  // bark crack light
  // Roots
  r0: '#150A02',
  r1: '#2E1A08',
  r2: '#4A2E14',
  // Ground AO
  ao: '#000000',
};

// ── Seeded deterministic random (no Math.random) ──────────────────────────────
function seededRng(seed) {
  let s = (seed ^ 0xDEADBEEF) >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), s | 1)) >>> 0;
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Multiple noise grids for layered detail ───────────────────────────────────
const noiseCoarse = perlinNoiseGrid(W, H, { seed: 'pine-coarse-v2', scale: 0.14, octaves: 3, persistence: 0.55, lacunarity: 2.1 });
const noiseFine   = perlinNoiseGrid(W, H, { seed: 'pine-fine-v2',   scale: 0.32, octaves: 2, persistence: 0.6,  lacunarity: 2.2 });
const noiseEdge   = perlinNoiseGrid(W, H, { seed: 'pine-edge-v2',   scale: 0.45, octaves: 2, persistence: 0.5,  lacunarity: 2.0 });

function nc(x, y) { return noiseCoarse.values[clamp(y,0,H-1)*W + clamp(x,0,W-1)] ?? 0.5; }
function nf(x, y) { return noiseFine.values  [clamp(y,0,H-1)*W + clamp(x,0,W-1)] ?? 0.5; }
function ne(x, y) { return noiseEdge.values  [clamp(y,0,H-1)*W + clamp(x,0,W-1)] ?? 0.5; }

// ── Helpers ───────────────────────────────────────────────────────────────────
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(v))); }
function clampF(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function hexToRgb(hex) {
  const raw = String(hex).replace('#','').padEnd(6,'0');
  return { r: parseInt(raw.slice(0,2),16), g: parseInt(raw.slice(2,4),16), b: parseInt(raw.slice(4,6),16) };
}
function rgbToHex(r,g,b) {
  return '#'+[r,g,b].map(v=>clamp(v,0,255).toString(16).padStart(2,'0')).join('').toUpperCase();
}

function blankCanvas() { return new Uint8Array(W*H*4); }

function setPixel(cv, x, y, r, g, b, a=255) {
  if (x<0||y<0||x>=W||y>=H) return;
  const i=(y*W+x)*4;
  const sa=a/255, da=cv[i+3]/255;
  const oa=sa+da*(1-sa);
  if (oa===0) return;
  cv[i]  =clamp((r*sa+cv[i]  *da*(1-sa))/oa,0,255);
  cv[i+1]=clamp((g*sa+cv[i+1]*da*(1-sa))/oa,0,255);
  cv[i+2]=clamp((b*sa+cv[i+2]*da*(1-sa))/oa,0,255);
  cv[i+3]=clamp(oa*255,0,255);
}
function sh(cv,x,y,hex,a=255){ const {r,g,b}=hexToRgb(hex); setPixel(cv,x,y,r,g,b,a); }
function hspan(cv,y,x0,x1,hex,a=255){ for(let x=x0;x<=x1;x++) sh(cv,x,y,hex,a); }
function getPixel(cv,x,y){ if(x<0||y<0||x>=W||y>=H) return null; const i=(y*W+x)*4; return {r:cv[i],g:cv[i+1],b:cv[i+2],a:cv[i+3]}; }

// ── Foliage shading: pick color from 7-stop palette ───────────────────────────
// Light comes from top-right. Left side = shadow, right side = lit.
// Depth within tier (t=0 apex, t=1 base) drives AO.
function foliageColor(pal, x, hw, t, coarseN, fineN) {
  if (hw === 0) return pal.f7; // very tip

  // Horizontal position: -1 = far left, +1 = far right
  const horiz = hw > 0 ? (x - CX) / hw : 0;

  // Vertical depth within tier (0=top bright, 1=bottom shadowed by tier above)
  const depthAO = t * 0.4;

  // Combined lighting value: right side lit, left side shadowed
  // Noise breaks up the banding
  const light = clampF(
    0.5
    + horiz * 0.35          // iso light direction
    - depthAO               // AO from tier overlap
    + (coarseN - 0.5)*0.28  // large variation
    + (fineN   - 0.5)*0.14, // fine needle texture
    0, 1
  );

  if (light > 0.82) return pal.f7;
  if (light > 0.68) return pal.f6;
  if (light > 0.54) return pal.f5;
  if (light > 0.40) return pal.f4;
  if (light > 0.26) return pal.f3;
  if (light > 0.13) return pal.f2;
  if (light > 0.05) return pal.f1;
  return pal.f0;
}

// ── Jagged silhouette: noise-driven edge irregularity ─────────────────────────
// Returns the actual half-width at row y for a tier, with organic jag
function jaggedHW(baseHW, y, apexY, baseY, rng) {
  const t = (y - apexY) / Math.max(1, baseY - apexY);
  const smooth = Math.round(t * baseHW);
  if (smooth <= 0) return 0;
  // Edge jag: noise-driven +/- 1-3px on each side independently
  const edgeN = ne(CX - smooth, y);
  const jag = Math.round((edgeN - 0.5) * 4); // ±2px
  return Math.max(0, smooth + jag);
}

// ── Needle clusters: small spiky protrusions off the silhouette ───────────────
function drawNeedleCluster(cv, pal, x, y, side, rng) {
  // side: -1 = left, +1 = right
  const len = 2 + Math.round(rng() * 3); // 2-5px
  const droopY = Math.round(rng() * 2);  // droop down 0-2px
  for (let k = 1; k <= len; k++) {
    const nx = x + side * k;
    const ny = y + Math.round(droopY * (k / len));
    const fade = 1 - k / (len + 1);
    const col = fade > 0.5 ? pal.f5 : pal.f3;
    sh(cv, nx, ny, col, Math.round(200 * fade));
  }
}

// ── Draw one foliage tier ─────────────────────────────────────────────────────
function drawTier(cv, pal, tier, rng) {
  const { apexY, baseY, baseHW } = tier;
  const span = baseY - apexY;

  // Pre-compute per-row jag so left/right are consistent
  const rowHW = [];
  for (let y = apexY; y <= baseY; y++) {
    rowHW[y] = jaggedHW(baseHW, y, apexY, baseY, rng);
  }

  for (let y = apexY; y <= baseY; y++) {
    const hw = rowHW[y];
    const t  = (y - apexY) / Math.max(1, span);

    for (let x = CX - hw; x <= CX + hw; x++) {
      const col = foliageColor(pal, x, hw, t, nc(x,y), nf(x,y));
      sh(cv, x, y, col);
    }

    // AO pocket: 2px dark band on left side (shadowed face)
    if (hw > 2) {
      sh(cv, CX - hw,     y, pal.f0);
      sh(cv, CX - hw + 1, y, pal.f1, 180);
    }
    // Rim highlight: 1px bright on right edge
    if (hw > 0) sh(cv, CX + hw, y, pal.f6);

    // Needle clusters: scattered along both edges every ~3 rows
    const edgeN = ne(CX - hw, y);
    if (hw > 4 && edgeN > 0.55) {
      drawNeedleCluster(cv, pal, CX - hw, y, -1, rng);
    }
    const edgeNr = ne(CX + hw, y);
    if (hw > 4 && edgeNr > 0.52) {
      drawNeedleCluster(cv, pal, CX + hw, y, +1, rng);
    }
  }

  // Tip highlight
  sh(cv, CX, apexY,     pal.f7);
  sh(cv, CX, apexY + 1, pal.f6);
}

// ── Branch droop lines ────────────────────────────────────────────────────────
// Draws thin drooping branch hints visible at tier base edges
function drawBranchHints(cv, pal, tier, rng) {
  const { baseY, baseHW } = tier;
  const numBranches = 3 + Math.round(rng() * 3);
  for (let b = 0; b < numBranches; b++) {
    const t = (b + 0.5) / numBranches;
    const bx = Math.round(CX - baseHW * 0.6 + t * baseHW * 1.2);
    const len = 3 + Math.round(rng() * 4);
    const side = bx < CX ? -1 : 1;
    for (let k = 0; k < len; k++) {
      const px = bx + side * k;
      const py = baseY + k;
      const fade = 1 - k / len;
      sh(cv, px, py, pal.f2, Math.round(160 * fade));
    }
  }
}

// ── Bark-textured trunk ───────────────────────────────────────────────────────
function drawTrunk(cv, pal, rng) {
  const TOP = 82, BOT = H - 5;
  for (let y = TOP; y <= BOT; y++) {
    const t = (y - TOP) / Math.max(1, BOT - TOP);
    // Trunk widens slightly at base (root flare)
    const hw = 2 + (t > 0.75 ? Math.round((t - 0.75) * 8) : 0);

    hspan(cv, y, CX - hw, CX + hw, pal.t2);
    // Left face (shadow)
    sh(cv, CX - hw, y, pal.t0);
    sh(cv, CX - hw + 1, y, pal.t1);
    // Right face (lit)
    sh(cv, CX + hw, y, pal.t4);
    sh(cv, CX + hw - 1, y, pal.t3);

    // Bark cracks: vertical lines driven by fine noise
    for (let x = CX - hw + 2; x <= CX + hw - 2; x++) {
      const bn = nf(x, y);
      if (bn < 0.18) sh(cv, x, y, pal.b0, 180);
      else if (bn < 0.25) sh(cv, x, y, pal.b1, 120);
    }
  }
}

// ── Surface roots ─────────────────────────────────────────────────────────────
function drawRoots(cv, pal, rng) {
  const baseY = H - 5;
  const rootDefs = [
    { dx: -1, spread: -6, len: 8 },
    { dx:  1, spread:  7, len: 7 },
    { dx: -1, spread: -3, len: 5 },
    { dx:  1, spread:  4, len: 5 },
  ];
  for (const { dx, spread, len } of rootDefs) {
    for (let k = 0; k < len; k++) {
      const t = k / len;
      const x = Math.round(CX + spread * t);
      const y = baseY + k;
      sh(cv, x, y, t < 0.3 ? pal.r0 : t < 0.6 ? pal.r1 : pal.r2, Math.round(255*(1-t*0.5)));
    }
  }
}

// ── Isometric ground AO ellipse ───────────────────────────────────────────────
function drawGroundAO(cv) {
  const sy = H - 4;
  for (let dx = -14; dx <= 14; dx++) {
    const fade = 1 - (dx*dx)/(14*14);
    setPixel(cv, CX+dx, sy,   0,0,0, Math.round(100*fade));
    setPixel(cv, CX+dx, sy+1, 0,0,0, Math.round(55*fade));
    if (Math.abs(dx)<8)
      setPixel(cv, CX+dx, sy+2, 0,0,0, Math.round(25*fade));
  }
}

// ── Snow cap ─────────────────────────────────────────────────────────────────
function applySnow(cv, tiers) {
  for (const { apexY, baseY, baseHW } of tiers) {
    const snowRows = Math.round((baseY-apexY)*0.32);
    for (let y = apexY; y <= apexY + snowRows; y++) {
      const t = (y - apexY) / Math.max(1, snowRows);
      const hw = Math.round(t * baseHW * 0.45);
      for (let x = CX - hw; x <= CX + hw; x++) {
        const n = nf(x,y);
        if (x===CX-hw||x===CX+hw) {
          if (n > 0.48) sh(cv, x, y, '#C7D8EA', 190);
        } else {
          sh(cv, x, y, n > 0.52 ? '#FFFFFF' : '#E3EEF8');
        }
      }
    }
  }
}

// ── Build one full frame ───────────────────────────────────────────────────────
function buildFrame(pal, tiers, rng, postProcess=null) {
  const cv = blankCanvas();
  drawGroundAO(cv);
  drawRoots(cv, pal, rng);
  // Tiers back to front (bottom tier first so upper tiers overlap)
  for (const tier of [...tiers].reverse()) {
    drawBranchHints(cv, pal, tier, rng);
    drawTier(cv, pal, tier, rng);
  }
  drawTrunk(cv, pal, rng);
  if (postProcess) postProcess(cv, tiers);
  return cv;
}

// ── Material transmutation pass ───────────────────────────────────────────────
function transmuteFull(cv, material) {
  const out = new Uint8Array(cv.length);
  for (let i = 0; i < W*H; i++) {
    const a = cv[i*4+3];
    if (!a) { out.set([0,0,0,0], i*4); continue; }
    const hex = rgbToHex(cv[i*4], cv[i*4+1], cv[i*4+2]);
    const o = hexToRgb(transmuteMaterialColor(hex, material));
    out[i*4]=o.r; out[i*4+1]=o.g; out[i*4+2]=o.b; out[i*4+3]=a;
  }
  return out;
}

// ── Aseprite + PNG encoding ───────────────────────────────────────────────────
function wi16(b,o,v){ b[o]=v&0xFF; b[o+1]=(v>>8)&0xFF; }
function wi32(b,o,v){ b[o]=v&0xFF; b[o+1]=(v>>8)&0xFF; b[o+2]=(v>>16)&0xFF; b[o+3]=(v>>24)&0xFF; }

function celChunk(rgba) {
  const comp = deflateSync(Buffer.from(rgba),{level:6});
  const c = Buffer.alloc(26+comp.length);
  wi32(c,0,c.length); wi16(c,4,0x2005);
  wi16(c,6,0); wi16(c,8,0); wi16(c,10,0); c[12]=255; wi16(c,13,2); wi16(c,15,0);
  wi16(c,22,W); wi16(c,24,H); comp.copy(c,26); return c;
}
function layerChunk(name) {
  const nb=Buffer.from(name,'utf8'), c=Buffer.alloc(6+16+2+nb.length);
  wi32(c,0,c.length); wi16(c,4,0x2004); wi16(c,6,3); c[18]=255;
  wi16(c,22,nb.length); nb.copy(c,24); return c;
}
function frameChunk(rgba, name, isFirst, ms=120) {
  const chunks=[]; if(isFirst) chunks.push(layerChunk(name));
  chunks.push(celChunk(rgba));
  const body=Buffer.concat(chunks), f=Buffer.alloc(16+body.length);
  wi32(f,0,f.length); wi16(f,4,0xF1FA); wi16(f,6,chunks.length); wi16(f,8,ms);
  body.copy(f,16); return f;
}
function asepriteFile(frames) {
  const h=Buffer.alloc(128); wi16(h,4,0xA5E0); wi16(h,6,frames.length);
  wi16(h,8,W); wi16(h,10,H); wi16(h,12,32); wi32(h,14,1); h[122]=1; h[123]=1;
  const body=Buffer.concat(frames), file=Buffer.concat([h,body]);
  wi32(file,0,file.length); return file;
}

function encodePNG(rgba) {
  function crc32(b){let c=0xFFFFFFFF;for(const x of b){c^=x;for(let i=0;i<8;i++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);}return(c^0xFFFFFFFF)>>>0;}
  function u32(v){return Buffer.from([v>>>24,(v>>16)&255,(v>>8)&255,v&255]);}
  function ch(t,d){const tb=Buffer.from(t),cb=Buffer.concat([tb,d]);return Buffer.concat([u32(d.length),cb,u32(crc32(cb))]);}
  function adler(b){let s1=1,s2=0;for(const x of b){s1=(s1+x)%65521;s2=(s2+s1)%65521;}return(s2<<16)|s1;}
  function zstore(d){const a=adler(d),t=Buffer.from([0,d.length&255,(d.length>>8)&255,(~d.length)&255,(~(d.length>>8))&255]);return Buffer.concat([Buffer.from([0x78,0x01]),t,d,Buffer.from([(a>>24)&255,(a>>16)&255,(a>>8)&255,a&255])]);}
  const raw=Buffer.alloc((1+W*4)*H);
  for(let y=0;y<H;y++){raw[y*(1+W*4)]=0;for(let x=0;x<W;x++){const si=(y*W+x)*4,di=y*(1+W*4)+1+x*4;raw[di]=rgba[si];raw[di+1]=rgba[si+1];raw[di+2]=rgba[si+2];raw[di+3]=rgba[si+3];}}
  const sig=Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr=Buffer.concat([u32(W),u32(H),Buffer.from([8,6,0,0,0])]);
  return Buffer.concat([sig,ch('IHDR',ihdr),ch('IDAT',zstore(raw)),ch('IEND',Buffer.alloc(0))]);
}

// ── Main ──────────────────────────────────────────────────────────────────────
const rng = seededRng(0xC0FFEE42);

// 5 tiers for a fuller, denser pine
const TIERS = [
  { apexY:  8, baseY: 28, baseHW: 10 },  // very tip
  { apexY: 22, baseY: 46, baseHW: 18 },  // upper
  { apexY: 36, baseY: 62, baseHW: 26 },  // mid-upper
  { apexY: 50, baseY: 74, baseHW: 33 },  // mid-lower
  { apexY: 62, baseY: 84, baseHW: 38 },  // base skirt
];

const BASE_PAL = {
  f0:P.f0,f1:P.f1,f2:P.f2,f3:P.f3,f4:P.f4,f5:P.f5,f6:P.f6,f7:P.f7,
  t0:P.t0,t1:P.t1,t2:P.t2,t3:P.t3,t4:P.t4,
  b0:P.b0,b1:P.b1,r0:P.r0,r1:P.r1,r2:P.r2,
};

console.log('Generating detailed pine tree…');

const base = buildFrame(BASE_PAL, TIERS, rng);
const snow = (() => { const c=new Uint8Array(base); applySnow(c, TIERS); return c; })();

const frames = [
  { name:'Base Pine',      rgba: base },
  { name:'Snow Cap',       rgba: snow },
  { name:'Void Corrupted', rgba: transmuteFull(base,'void_ice') },
  { name:'Ember Autumn',   rgba: transmuteFull(base,'holy_fire') },
];

frames.forEach(f => console.log(`  ✓ ${f.name}`));

// Write .aseprite
const ASE_OUT = resolve(ROOT,'docs/references/Pine Tree Isometric.aseprite');
writeFileSync(ASE_OUT, asepriteFile(frames.map((f,i)=>frameChunk(f.rgba,f.name,i===0,120))));
console.log(`\n✓ ${ASE_OUT}`);

// Write individual PNGs
frames.forEach(f => {
  const path = resolve(ROOT,`docs/references/Pine Tree ${f.name}.png`);
  writeFileSync(path, encodePNG(f.rgba));
  console.log(`✓ Pine Tree ${f.name}.png`);
});
console.log(`\nCanvas: ${W}×${H}px  Frames: ${frames.length}  Tiers: ${TIERS.length}`);
