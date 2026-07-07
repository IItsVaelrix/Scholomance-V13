/**
 * NATURAL-LANGUAGE → PIXELBRAIN COMPILER (Path 1: pure lexicographer)
 *
 * A deterministic compile() spine that turns a prompt into a canonical
 * PixelBrainAssetPacket + checksum, using ONLY constructive semantic-math —
 * no learned model, no corpus, no network (unless a dictionary adapter is
 * explicitly supplied for OOV subject resolution). Same prompt → byte-identical
 * geometry and checksum (Axioms 5 & 6).
 *
 * Pipeline (all stages pre-existing except the symmetry re-projection seam):
 *   1. lower      parseNaturalLanguagePrompt → nluToPixelBrainParams           (decreed meaning)
 *   2. verse→IR   compileVerseToIR(prompt) → phonetic tokens                   (backend phoneme truth)
 *   3. synthesize buildPixelBrainTokenBytecode + mapToCoordinates              (Route B engine)
 *   4. re-project coordsToLattice → applySymmetryToLattice(decreed) → coords   (THE seam)
 *   5. palette    vowel-family/school palette is AUTHORITATIVE; mood only tints (COLOR_DRAGON)
 *   6. emit       createPixelBrainAssetPacket
 *   7. checksum   FNV-1a over a canonical integer-only geometry digest         (Python-parity safe)
 *
 * The single seam reserved for a future pinned-oracle (Path 2) is step 1's
 * entity→constraint lookup; everything downstream is constructive math.
 */

import { parseNaturalLanguagePrompt } from '../verseir-amplifier/plugins/naturalLanguageAmp.js';
import { nluToPixelBrainParams } from '../semantic/semantic-math-bridge.js';
import { compileVerseToIR } from '../shared/truesight/compiler/compileVerseToIR.js';
import { buildPixelBrainTokenBytecode } from './token-to-bytecode.js';
import { mapToCoordinates } from './coordinate-mapping.js';
import { applySymmetryToLattice } from './symmetry-amp.js';
import { coordsToLattice, latticeToCoords } from './lattice-coordinate-adapter.js';
import { bytecodeToPalette } from './color-byte-mapping.js';
import { fnv1a32Hex } from './shared.js';
import { forgePacket } from './semantic-bridge.js';

// applySymmetryToLattice only mirrors these; 'none' (and anything else) is a pass-through.
const APPLICABLE_SYMMETRY = new Set(['vertical', 'horizontal', 'radial', 'diagonal']);

// ── Deterministic checksum primitives (white paper §4.1 / §5.1) ──────────────
function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
}

// FNV-1a-32 upper-8-hex — shared canonical implementation (byte-identical
// to the local copy this replaced).
const fnv1a8Hex = fnv1a32Hex;

// ── Deterministic HSL → #RRGGBB (the decreed mood tint) ──────────────────────
function hslToHex(hueDeg, saturation, lightness) {
  const h = ((Number(hueDeg) % 360) + 360) % 360 / 360;
  const s = Math.max(0, Math.min(1, Number(saturation) || 0));
  const l = Math.max(0, Math.min(1, Number(lightness) || 0));
  const hue2rgb = (p, q, t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  let r;
  let g;
  let b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (v) => Math.round(v * 255).toString(16).toUpperCase().padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Authoritative palette: the vowel-family/school colors derived by the phoneme
 * engine (bytecodeToPalette). The decreed mood color is returned SEPARATELY as
 * a semantic tint — never folded into the authoritative source palette. This is
 * the structural guard against COLOR_DRAGON (a fallback color masking the
 * backend's vowel-family truth).
 */
function buildPalettes(hints, colorConstraint) {
  const seen = new Set();
  const sourceColors = [];
  for (const hint of hints) {
    if (!hint?.bytecode) continue;
    const palette = bytecodeToPalette(hint.bytecode, { colorFeatures: hint.colorFeatures });
    for (const color of (Array.isArray(palette?.colors) ? palette.colors : [])) {
      const hex = String(color || '').trim().toUpperCase();
      if (!/^#[0-9A-F]{6}$/.test(hex) || seen.has(hex)) continue;
      seen.add(hex);
      sourceColors.push(hex);
    }
  }
  sourceColors.sort();

  const moodHex = hslToHex(
    colorConstraint?.primaryHue ?? 0,
    colorConstraint?.saturation ?? 0.5,
    colorConstraint?.brightness ?? 0.5,
  );

  return {
    sourcePalette: sourceColors,        // authoritative (backend phoneme truth)
    semanticPalette: [moodHex],         // decreed tint, explicitly secondary
  };
}

/**
 * Canonical, integer-only geometry digest. Coordinates are integers (Axiom 2),
 * so this serializes identically under JS canonicalize and Python
 * json.dumps(separators=(',',':')) — no 64.0→64 float divergence.
 */
function canonicalGeometry(packet, params, palettes) {
  const coordinates = (Array.isArray(packet?.geometry?.coordinates) ? packet.geometry.coordinates : [])
    .map((c) => ({
      x: Math.round(Number(c?.x) || 0),
      y: Math.round(Number(c?.y) || 0),
      color: String(c?.color || ''),
      partId: String(c?.partId || ''),
    }))
    .sort((a, b) => (a.y - b.y) || (a.x - b.x)
      || (a.partId < b.partId ? -1 : a.partId > b.partId ? 1 : 0)
      || (a.color < b.color ? -1 : a.color > b.color ? 1 : 0));

  return {
    canvas: {
      width: Math.round(Number(packet?.canvas?.width) || 0),
      height: Math.round(Number(packet?.canvas?.height) || 0),
      gridSize: Math.round(Number(packet?.canvas?.gridSize) || 1),
    },
    material: String(packet?.material?.id || ''),
    symmetry: String(params?.form?.symmetry || 'none'),
    sourcePalette: palettes.sourcePalette,
    semanticPalette: palettes.semanticPalette,
    coordinates,
  };
}

/**
 * Compile a natural-language prompt into a canonical PixelBrainAssetPacket.
 *
 * @param {string} prompt
 * @param {{ mode?: string, dictionaryAdapter?: object }} [options]
 * @returns {Promise<{ prompt, intent, params, packet, checksum, digest }>}
 */
export async function compilePromptToAsset(prompt, options = {}) {
  const text = String(prompt || '');

  // 1. Lower the prompt to decreed constraints (constructive meaning).
  const parsed = await parseNaturalLanguagePrompt(text, {
    dictionaryAdapter: options.dictionaryAdapter,
  });
  const params = nluToPixelBrainParams(parsed.entities);

  // 2. Compile the prompt's own words into phonetic tokens (authoritative engine).
  const verseIR = compileVerseToIR(text, { mode: options.mode || 'balanced' });
  const tokens = Array.isArray(verseIR?.tokens) ? verseIR.tokens : [];
  const hints = tokens
    .map((token) => buildPixelBrainTokenBytecode(token, verseIR))
    .filter(Boolean);

  // 3. Synthesize the base lattice (Route B).
  const canvas = {
    width: Math.round(Number(params?.canvas?.width) || 64),
    height: Math.round(Number(params?.canvas?.height) || 64),
    gridSize: Math.round(Number(params?.canvas?.gridSize) || 1) || 1,
  };
  const grid = mapToCoordinates(hints, verseIR, canvas);

  // 4. Re-project onto the DECREED symmetry (constructive over detected).
  let coordinates = Array.isArray(grid?.coordinates) ? grid.coordinates : [];
  const decreedSymmetry = String(params?.form?.symmetry || 'none');
  if (APPLICABLE_SYMMETRY.has(decreedSymmetry) && coordinates.length > 0) {
    const lattice = coordsToLattice(coordinates, grid.canvas);
    const mirrored = applySymmetryToLattice(lattice, { type: decreedSymmetry, significant: true });
    coordinates = latticeToCoords(mirrored);
  }

  // 5. Palette: authoritative school colors + decreed mood tint (kept separate).
  const palettes = buildPalettes(hints, params.color);

  // 6. Emit the canonical packet.
  const packet = forgePacket({
    source: 'nl-compile',
    canvas: grid.canvas,
    coordinates,
    palette: {
      sourcePalette: palettes.sourcePalette,
      semanticPalette: palettes.semanticPalette,
    },
    material: params?.surface?.material || 'stone',
  }, {
    parts: [{ id: 'body', material: params?.surface?.material || 'stone' }],
  }, { sourceKind: 'nl-compile' });

  // 7. Checksum the canonical integer-only geometry digest.
  const digest = canonicalGeometry(packet, params, palettes);
  const checksum = fnv1a8Hex(canonicalize(digest));

  return Object.freeze({
    prompt: text,
    intent: parsed.intent,
    params,
    packet,
    digest: Object.freeze(digest),
    checksum,
  });
}

export const __test__ = { canonicalize, fnv1a8Hex, hslToHex, buildPalettes, canonicalGeometry };
