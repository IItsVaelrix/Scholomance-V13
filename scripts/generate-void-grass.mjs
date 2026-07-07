/**
 * generate-void-grass.mjs
 *
 * Generates isometric void grass tiles from scratch.
 * 80×48px — full iso tile (80 wide, 40 top face + 8px depth sides)
 *
 * Frames:
 *   1 — Void Grass Base         (corrupted purple-black ground)
 *   2 — Void Grass Dense        (heavy void tendrils, dark canopy)
 *   3 — Glowing Void            (bioluminescent cyan-purple edges)
 *   4 — Void Ash                (grey-white necrotic dead variant)
 *
 * Output: docs/references/Void Grass Isometric.aseprite
 *         docs/references/Void Grass *.png
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { deflateSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

import { perlinNoiseGrid } from '../codex/core/pixelbrain/procedural-noise.js';
import { transmuteMaterialColor } from '../codex/core/pixelbrain/material-registry.js';

// ── Canvas — matches game iso tile exactly ────────────────────────────────────
const W = 80, H = 48;
const CX = 40, CY = 20; // iso diamond center

// ── Void palette — 8 stops ────────────────────────────────────────────────────
const P = {
  // Ground surface
  g0: '#000004',  // absolute void black
  g1: '#07021A',  // deep void
  g2: '#130840',  // dark indigo
  g3: '#200A5C',  // mid void
  g4: '#32106D',  // void body
  g5: '#4E1E8A',  // lit surface
  g6: '#7040B8',  // highlight
  g7: '#A070E0',  // edge shimmer
  // Grass blades — corrupted
  b0: '#0A0520',
  b1: '#1A0A40',
  b2: '#2E1060',
  b3: '#5020A0',
  b4: '#8040D0',
  b5: '#B060F0',  // blade tip glow
  // Tendrils / corruption cracks
  c0: '#030010',
  c1: '#150535',
  c2: '#3A0F7A',
  // Side faces of the iso tile
  sl: '#04010E',  // left face (darkest)
  sr: '#0F0535',  // right face
  // Glow variant extras
  glow0: '#00FFD0',
  glow1: '#40E8FF',
  glow2: '#8040FF',
  // Ash variant
  ash0: '#1A1A22',
  ash1: '#2E2E3A',
  ash2: '#484858',
  ash3: '#7070 86',
  ash4: '#A0A0B4',
};

// ── Seeded deterministic RNG ──────────────────────────────────────────────────
function seededRng(seed) {
  let s = (seed ^ 0xDEADC0DE) >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), s | 1)) >>> 0;
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Noise grids ───────────────────────────────────────────────────────────────
const nCoarse = perlinNoiseGrid(W, H, { seed: 'void-grass-coarse', scale: 0.12, octaves: 3, persistence: 0.55, lacunarity: 2.1 });
const nFine   = perlinNoiseGrid(W, H, { seed: 'void-grass-fine',   scale: 0.30, octaves: 2, persistence: 0.60, lacunarity: 2.2 });
const nCrack  = perlinNoiseGrid(W, H, { seed: 'void-crack',        scale: 0.50, octaves: 2, persistence: 0.45, lacunarity: 2.5 });

function nc(x,y) { return nCoarse.values[clamp(y,0,H-1)*W+clamp(x,0,W-1)] ?? 0.5; }
function nf(x,y) { return nFine.values  [clamp(y,0,H-1)*W+clamp(x,0,W-1)] ?? 0.5; }
function nk(x,y) { return nCrack.values [clamp(y,0,H-1)*W+clamp(x,0,W-1)] ?? 0.5; }

// ── Helpers ───────────────────────────────────────────────────────────────────
function clamp(v,lo,hi) { return Math.max(lo,Math.min(hi,Math.round(v))); }
function clampF(v,lo,hi){ return Math.max(lo,Math.min(hi,v)); }
function hexToRgb(hex) {
  const raw=String(hex).replace('#','').replace(/\s/g,'').padEnd(6,'0');
  return { r:parseInt(raw.slice(0,2),16), g:parseInt(raw.slice(2,4),16), b:parseInt(raw.slice(4,6),16) };
}
function rgbToHex(r,g,b) {
  return '#'+[r,g,b].map(v=>clamp(v,0,255).toString(16).padStart(2,'0')).join('').toUpperCase();
}
function blankCanvas(){ return new Uint8Array(W*H*4); }
function setPixel(cv,x,y,r,g,b,a=255){
  if(x<0||y<0||x>=W||y>=H) return;
  const i=(y*W+x)*4, sa=a/255, da=cv[i+3]/255, oa=sa+da*(1-sa);
  if(oa===0) return;
  cv[i]  =clamp((r*sa+cv[i]  *da*(1-sa))/oa,0,255);
  cv[i+1]=clamp((g*sa+cv[i+1]*da*(1-sa))/oa,0,255);
  cv[i+2]=clamp((b*sa+cv[i+2]*da*(1-sa))/oa,0,255);
  cv[i+3]=clamp(oa*255,0,255);
}
function sh(cv,x,y,hex,a=255){ if(!hex||hex.length<7) return; const{r,g,b}=hexToRgb(hex); setPixel(cv,x,y,r,g,b,a); }
function hspan(cv,y,x0,x1,hex,a=255){ for(let x=x0;x<=x1;x++) sh(cv,x,y,hex,a); }

// ── Iso diamond helpers ───────────────────────────────────────────────────────
// Returns true if screen pixel (x,y) is inside the iso top-face diamond
// Diamond: center (CX, CY), half-width=40, half-height=20
function inDiamond(x, y) {
  const dx = Math.abs(x - CX) / 40;
  const dy = Math.abs(y - CY) / 20;
  return dx + dy <= 1.0;
}

// Returns true if pixel is in left side face (below-left of diamond)
function inLeftFace(x, y) {
  if (y < CY) return false;
  const dx = x - CX;
  const dy = y - CY;
  return dx + dy * 2 <= 0 && y <= H - 2;
}

// Returns true if pixel is in right side face (below-right of diamond)
function inRightFace(x, y) {
  if (y < CY) return false;
  const dx = x - CX;
  const dy = y - CY;
  return dx + dy * 2 >= 0 && y <= H - 2;
}

// Ground shading: 6-stop based on iso lighting (top-right lit)
function groundColor(x, y) {
  const horiz = (x - CX) / 40;   // -1 left, +1 right
  const vert  = (y - CY) / 20;   // -1 top, +1 bottom
  const light = clampF(
    0.5
    + horiz * 0.25   // right side brighter
    - vert  * 0.15   // top slightly brighter
    + (nc(x,y)-0.5)*0.30
    + (nf(x,y)-0.5)*0.12,
    0, 1
  );
  if (light > 0.82) return P.g6;
  if (light > 0.66) return P.g5;
  if (light > 0.50) return P.g4;
  if (light > 0.35) return P.g3;
  if (light > 0.18) return P.g2;
  if (light > 0.07) return P.g1;
  return P.g0;
}

// ── Draw tile top face ────────────────────────────────────────────────────────
function drawTopFace(cv) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inDiamond(x, y)) continue;
      sh(cv, x, y, groundColor(x, y));
    }
  }
}

// ── Draw iso side faces ───────────────────────────────────────────────────────
function drawSideFaces(cv) {
  // Left face: darker, shadowed
  for (let y = CY; y < H-1; y++) {
    for (let x = 0; x < CX; x++) {
      if (!inLeftFace(x, y)) continue;
      const t = (y - CY) / (H - 2 - CY);
      const depth = clampF(t, 0, 1);
      const n = nc(x,y);
      const col = depth > 0.6 ? P.g0 : n > 0.5 ? P.g1 : P.c0;
      sh(cv, x, y, col, Math.round(255*(1-depth*0.3)));
    }
  }
  // Right face: slightly lighter
  for (let y = CY; y < H-1; y++) {
    for (let x = CX; x < W; x++) {
      if (!inRightFace(x, y)) continue;
      const t = (y - CY) / (H - 2 - CY);
      const n = nc(x,y);
      const col = n > 0.55 ? P.sr : P.g1;
      sh(cv, x, y, col);
    }
  }
  // Bottom edge line
  for (let x = 0; x < W; x++) {
    const y = H - 2;
    if (x < CX && inLeftFace(x, y))  sh(cv, x, y, P.g0, 200);
    if (x >= CX && inRightFace(x, y)) sh(cv, x, y, P.g1, 200);
  }
}

// ── Corruption crack network ──────────────────────────────────────────────────
// Draws dark tendril-like cracks across the surface driven by crack noise
function drawCorruptionCracks(cv) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inDiamond(x, y)) continue;
      const k = nk(x,y);
      const f = nf(x,y);
      // Crack condition: noise near threshold creates thin vein network
      if (Math.abs(k - 0.50) < 0.025) {
        sh(cv, x, y, P.c0, 220);
      } else if (Math.abs(k - 0.50) < 0.045) {
        sh(cv, x, y, P.c1, 140);
      } else if (Math.abs(k - 0.62) < 0.02) {
        sh(cv, x, y, P.c2, 110);
      }
    }
  }
}

// ── Void grass blades ─────────────────────────────────────────────────────────
// Scattered thin blade strokes standing up from the surface
function drawGrassBlades(cv, rng, density=0.18) {
  for (let y = 4; y < CY + 8; y++) {
    for (let x = 4; x < W-4; x++) {
      if (!inDiamond(x, y)) continue;
      const r = rng();
      if (r > density) continue;

      const height = 3 + Math.round(rng() * 6); // 3-9px tall
      const lean   = (rng()-0.5)*3;              // leans left or right
      const n = nc(x,y);

      for (let k = 0; k < height; k++) {
        const t  = k / height;
        const bx = Math.round(x + lean * t);
        const by = y - k;
        // Color: dark at base, bright at tip
        let col;
        if      (t > 0.80) col = P.b5;
        else if (t > 0.60) col = P.b4;
        else if (t > 0.40) col = P.b3;
        else if (t > 0.20) col = P.b2;
        else                col = P.b0;
        const alpha = Math.round(200 + 55*t);
        sh(cv, bx, by, col, alpha);
      }
    }
  }
}

// ── Void tendrils (dense version) ─────────────────────────────────────────────
// Longer, more numerous, creeping tendrils for the Dense frame
function drawTendrils(cv, rng) {
  for (let y = 2; y < CY + 10; y++) {
    for (let x = 2; x < W-2; x++) {
      if (!inDiamond(x, y)) continue;
      if (rng() > 0.10) continue;

      const len   = 4 + Math.round(rng()*10);
      const lean  = (rng()-0.5)*5;
      const curve = (rng()-0.5)*0.8;

      for (let k=0; k<len; k++) {
        const t  = k/len;
        const bx = Math.round(x + lean*t + curve*k*k*0.15);
        const by = y - k;
        const col = t > 0.7 ? P.b4 : t > 0.4 ? P.b2 : P.b1;
        sh(cv, bx, by, col, Math.round(220*(1-t*0.3)));
      }
    }
  }
}

// ── Glow edge shimmer ─────────────────────────────────────────────────────────
function drawGlowEdges(cv) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inDiamond(x, y)) continue;
      // Check if near diamond edge
      const dx = Math.abs(x-CX)/40, dy = Math.abs(y-CY)/20;
      const dist = Math.abs(dx+dy-1.0);
      if (dist < 0.04) {
        const n = nf(x,y);
        const col = n > 0.6 ? P.glow0 : n > 0.4 ? P.glow1 : P.glow2;
        sh(cv, x, y, col, Math.round(180*(1-dist/0.04)));
      }
      // Scattered glow dots on blade tips
      const k = nk(x,y);
      if (Math.abs(k-0.38) < 0.015 && nc(x,y) > 0.55) {
        sh(cv, x, y, P.glow0, 160);
      }
    }
  }
}

// ── Ash overlay (necrotic dead variant) ──────────────────────────────────────
function applyAshOverlay(cv) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y*W+x)*4;
      if (cv[i+3] === 0) continue;
      const r=cv[i], g=cv[i+1], b=cv[i+2];
      // Desaturate + shift to grey-white
      const luma = Math.round(0.2126*r + 0.7152*g + 0.0722*b);
      const lr = Math.round(luma*0.6 + 40);
      const lg = Math.round(luma*0.6 + 38);
      const lb = Math.round(luma*0.7 + 50);
      cv[i]  =clamp(lr,0,255);
      cv[i+1]=clamp(lg,0,255);
      cv[i+2]=clamp(lb,0,255);
    }
  }
  // Scatter white ash flecks
  const rng = seededRng(0xA5DEAD);
  for (let y=2; y<CY+6; y++) {
    for (let x=4; x<W-4; x++) {
      if (!inDiamond(x,y)) continue;
      if (rng() > 0.04) continue;
      sh(cv, x, y, P.ash4, Math.round(120+rng()*80));
    }
  }
}

// ── Frame builders ────────────────────────────────────────────────────────────
function buildBase(rng) {
  const cv = blankCanvas();
  drawTopFace(cv);
  drawSideFaces(cv);
  drawCorruptionCracks(cv);
  drawGrassBlades(cv, rng, 0.14);
  return cv;
}

function buildDense(rng) {
  const cv = blankCanvas();
  drawTopFace(cv);
  drawSideFaces(cv);
  drawCorruptionCracks(cv);
  drawTendrils(cv, rng);
  drawGrassBlades(cv, rng, 0.22);
  return cv;
}

function buildGlowing(rng) {
  const cv = blankCanvas();
  drawTopFace(cv);
  drawSideFaces(cv);
  drawCorruptionCracks(cv);
  drawGrassBlades(cv, rng, 0.16);
  drawGlowEdges(cv);
  return cv;
}

function buildAsh(rng) {
  const cv = buildBase(rng);
  applyAshOverlay(cv);
  return cv;
}

// ── Aseprite + PNG encoding (shared helpers) ──────────────────────────────────
function wi16(b,o,v){ b[o]=v&0xFF; b[o+1]=(v>>8)&0xFF; }
function wi32(b,o,v){ b[o]=v&0xFF; b[o+1]=(v>>8)&0xFF; b[o+2]=(v>>16)&0xFF; b[o+3]=(v>>24)&0xFF; }

function celChunk(rgba){
  const comp=deflateSync(Buffer.from(rgba),{level:6});
  const c=Buffer.alloc(26+comp.length);
  wi32(c,0,c.length); wi16(c,4,0x2005);
  wi16(c,6,0); wi16(c,8,0); wi16(c,10,0); c[12]=255; wi16(c,13,2); wi16(c,15,0);
  wi16(c,22,W); wi16(c,24,H); comp.copy(c,26); return c;
}
function layerChunk(name){
  const nb=Buffer.from(name,'utf8'), c=Buffer.alloc(6+16+2+nb.length);
  wi32(c,0,c.length); wi16(c,4,0x2004); wi16(c,6,3); c[18]=255;
  wi16(c,22,nb.length); nb.copy(c,24); return c;
}
function frameChunk(rgba,name,isFirst,ms=120){
  const chunks=[]; if(isFirst) chunks.push(layerChunk(name));
  chunks.push(celChunk(rgba));
  const body=Buffer.concat(chunks), f=Buffer.alloc(16+body.length);
  wi32(f,0,f.length); wi16(f,4,0xF1FA); wi16(f,6,chunks.length); wi16(f,8,ms);
  body.copy(f,16); return f;
}
function asepriteFile(frames){
  const h=Buffer.alloc(128); wi16(h,4,0xA5E0); wi16(h,6,frames.length);
  wi16(h,8,W); wi16(h,10,H); wi16(h,12,32); wi32(h,14,1); h[122]=1; h[123]=1;
  const body=Buffer.concat(frames), file=Buffer.concat([h,body]);
  wi32(file,0,file.length); return file;
}
function encodePNG(rgba){
  function crc32(b){let c=0xFFFFFFFF;for(const x of b){c^=x;for(let i=0;i<8;i++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);}return(c^0xFFFFFFFF)>>>0;}
  function u32(v){return Buffer.from([v>>>24,(v>>16)&255,(v>>8)&255,v&255]);}
  function ch(t,d){const tb=Buffer.from(t),cb=Buffer.concat([tb,d]);return Buffer.concat([u32(d.length),cb,u32(crc32(cb))]);}
  function adler(b){let s1=1,s2=0;for(const x of b){s1=(s1+x)%65521;s2=(s2+s1)%65521;}return(s2<<16)|s1;}
  function zs(d){const a=adler(d),t=Buffer.from([0,d.length&255,(d.length>>8)&255,(~d.length)&255,(~(d.length>>8))&255]);return Buffer.concat([Buffer.from([0x78,0x01]),t,d,Buffer.from([(a>>24)&255,(a>>16)&255,(a>>8)&255,a&255])]);}
  const raw=Buffer.alloc((1+W*4)*H);
  for(let y=0;y<H;y++){raw[y*(1+W*4)]=0;for(let x=0;x<W;x++){const si=(y*W+x)*4,di=y*(1+W*4)+1+x*4;raw[di]=rgba[si];raw[di+1]=rgba[si+1];raw[di+2]=rgba[si+2];raw[di+3]=rgba[si+3];}}
  const sig=Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr=Buffer.concat([u32(W),u32(H),Buffer.from([8,6,0,0,0])]);
  return Buffer.concat([sig,ch('IHDR',ihdr),ch('IDAT',zs(raw)),ch('IEND',Buffer.alloc(0))]);
}

// ── Main ──────────────────────────────────────────────────────────────────────
const rng = seededRng(0xB00B5);

console.log('Generating void grass tiles…');

const frames = [
  { name:'Void Grass Base',    rgba: buildBase(seededRng(0x1001)) },
  { name:'Void Grass Dense',   rgba: buildDense(seededRng(0x2002)) },
  { name:'Void Grass Glowing', rgba: buildGlowing(seededRng(0x3003)) },
  { name:'Void Grass Ash',     rgba: buildAsh(seededRng(0x4004)) },
];

frames.forEach(f => console.log(`  ✓ ${f.name}`));

const ASE = resolve(ROOT,'docs/references/Void Grass Isometric.aseprite');
writeFileSync(ASE, asepriteFile(frames.map((f,i)=>frameChunk(f.rgba,f.name,i===0,120))));
console.log(`\n✓ ${ASE}`);

frames.forEach(f => {
  const path = resolve(ROOT,`docs/references/${f.name}.png`);
  writeFileSync(path, encodePNG(f.rgba));
  console.log(`✓ ${f.name}.png`);
});
console.log(`\nCanvas: ${W}×${H}px  Frames: ${frames.length}`);
