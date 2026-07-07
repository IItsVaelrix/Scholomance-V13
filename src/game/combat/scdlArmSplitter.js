/**
 * scdlArmSplitter.js — derive the armless body + 6 arm-segment SCDL assets
 * from a single IdealHuman.scdl source. Pure text transformation.
 *
 * Segments bucket a part's primitive lines by their first Y coordinate
 * (token index 2: `<op> <x> <y> ...`): upper y<46, fore 46..58, hand y>=59.
 */

const BANDS = [
  { name: 'upper', test: (y) => y < 46 },
  { name: 'fore', test: (y) => y >= 46 && y < 59 },
  { name: 'hand', test: (y) => y >= 59 },
];

// Extract the header (everything up to the first top-level `part`) which holds
// `asset ...` and the `palette { ... }` block.
function extractHeader(text) {
  const idx = text.indexOf('\npart ');
  return (idx < 0 ? text : text.slice(0, idx)).trim();
}

function extractPaletteBlock(text) {
  const start = text.indexOf('palette');
  if (start < 0) return 'palette {\n}';
  let i = text.indexOf('{', start);
  let depth = 0;
  for (let j = i; j < text.length; j += 1) {
    if (text[j] === '{') depth += 1;
    else if (text[j] === '}') { depth -= 1; if (depth === 0) return text.slice(start, j + 1); }
  }
  return text.slice(start);
}

// Find each top-level `part <name> ... { ... }` block; returns {name, start, end, body}.
function findParts(text) {
  const parts = [];
  const re = /part\s+(\w+)[^\{]*\{/g;
  let m;
  while ((m = re.exec(text))) {
    const braceStart = text.indexOf('{', m.index);
    let depth = 0;
    let end = braceStart;
    for (let j = braceStart; j < text.length; j += 1) {
      if (text[j] === '{') depth += 1;
      else if (text[j] === '}') { depth -= 1; if (depth === 0) { end = j; break; } }
    }
    parts.push({ name: m[1], start: m.index, end: end + 1, body: text.slice(braceStart + 1, end) });
    re.lastIndex = end + 1;
  }
  return parts;
}

function stripArmParts(text) {
  // Remove every `part armL|armR { ... }` block anywhere (base + inside frames).
  const parts = findParts(text);
  let out = text;
  for (const p of parts.filter((x) => x.name === 'armL' || x.name === 'armR').sort((a, b) => b.start - a.start)) {
    out = out.slice(0, p.start) + out.slice(p.end);
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

function firstY(line) {
  const toks = line.trim().split(/\s+/);
  return Number.parseInt(toks[2], 10);
}

function bandOf(line) {
  const y = firstY(line);
  if (!Number.isFinite(y)) return null;
  return (BANDS.find((b) => b.test(y)) || {}).name || null;
}

export function splitArms(scdlText) {
  const header = extractHeader(scdlText);
  const palette = extractPaletteBlock(scdlText);
  const assetLine = (header.match(/^asset\s+\w+\s+canvas\s+\S+/m) || ['asset IdealHuman canvas 64x128'])[0];

  const bodyNoArms = stripArmParts(scdlText);

  const parts = findParts(scdlText);
  const segments = {};
  for (const arm of ['armR', 'armL']) {
    // The BASE part is the first occurrence (frame overrides come later).
    const base = parts.find((p) => p.name === arm);
    if (!base) continue;
    const buckets = { upper: [], fore: [], hand: [] };
    for (const raw of base.body.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const band = bandOf(line);
      if (band) buckets[band].push('  ' + line);
    }
    for (const band of ['upper', 'fore', 'hand']) {
      const name = `${arm}-${band}`;
      const asset = assetLine.replace(/asset\s+\w+/, `asset ${arm[0].toUpperCase()}${arm.slice(1)}${band[0].toUpperCase()}${band.slice(1)}`);
      segments[name] = `${asset}\n${palette}\npart ${arm} material skin_light {\n${buckets[band].join('\n')}\n}\n`;
    }
  }
  return { bodyNoArms, segments };
}
