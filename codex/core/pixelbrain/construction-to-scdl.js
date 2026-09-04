/**
 * constructionToSCDLParts — the derivation path between solved geometry and SCDL.
 *
 * A solved PB-GEOMETRY-CONSTRUCTION-v1 result carries polylines and contours
 * per part (spine, leftBank/rightBank, closedContour, namedPoints). Until this
 * module existed, a construction could only GATE an asset in compileAsset() —
 * its solved geometry never flowed into the SCDL AST (CONSTRUCTION_LINK.GATE
 * vs DERIVED, asset-pipeline.js). This is the language bridge: solved contours
 * become real `part` blocks of SCDL source text, which the ordinary grammar
 * then parses. No AST surgery, no parallel lowering path — the generated text
 * is inspected, diffable, and refuses through the same SCDL diagnostics every
 * authored part refuses through.
 *
 * Mapping rules (v1, frozen):
 *   closedContour (>= 3 distinct points)      -> polygon op
 *   leftBank + rightBank (a ribbon)           -> polygon: leftBank ++ reversed(rightBank)
 *   spine-only parts                          -> SKIPPED, recorded: a spine has no
 *                                                fill surface and v1 does not fake one
 *   part with no colour assigned by the caller-> SKIPPED, recorded: derivation is
 *                                                geometry only; colour remains art direction
 *
 * Determinism: parts are visited in sorted id order, points are rounded to
 * integers, consecutive duplicates collapse, and the output carries a checksum
 * of the canonical generated text. Same solved result + same options -> same
 * bytes, every time.
 *
 * @bytecode PB-CONSTRUCTION-SCDL-v1
 */

export const CONSTRUCTION_SCDL_CONTRACT = 'PB-CONSTRUCTION-SCDL-v1';

function roundPoint([x, y]) {
  return [Math.round(x), Math.round(y)];
}

function collapseConsecutiveDuplicates(points) {
  const out = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (prev && prev[0] === p[0] && prev[1] === p[1]) continue;
    out.push(p);
  }
  // A polygon whose last point repeats its first contributes no edge.
  if (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) {
    out.pop();
  }
  return out;
}

/** Twice the signed area of a lattice polygon (shoelace). 0 => degenerate. */
function doubledArea(points) {
  let a = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    a += x1 * y2 - x2 * y1;
  }
  return a;
}

function polygonOp(points, colorRef) {
  const flat = points.map(([x, y]) => `${x} ${y}`).join(' ');
  return `polygon ${flat} ${colorRef}`;
}

function partBlock(scdlPartId, material, ops) {
  const body = ops.map(op => `  ${op}`).join('\n');
  return `part ${scdlPartId} material ${material} {\n${body}\n}`;
}

/** FNV-1a over the canonical generated text — a content-sensitive identity. */
function partsChecksum(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Turn a solved construction result into SCDL `part` blocks.
 *
 * @param {object} solvedResult - SolverResult from solve()/trySolve(): `{ parts, ... }`
 *   where each part may carry `closedContour`, `leftBank`, `rightBank`, `spine`.
 * @param {object} options
 * @param {Object<string,string>} options.colorByPart - partId -> colour. Either a
 *   `#RRGGBB` literal or a palette alias defined in the caller's source. A part
 *   with no entry is skipped (recorded), never defaulted: colour is art direction.
 * @param {Object<string,string>} [options.materialByPart] - partId -> material id.
 *   Defaults to 'source' per part.
 * @param {string} [options.partPrefix='cg_'] - prefix for generated SCDL part ids,
 *   keeping them collision-free against authored parts.
 * @returns {{
 *   contract: string,
 *   source: string,
 *   parts: Array<{ partId: string, scdlPartId: string, material: string, color: string, op: string, points: number[][] }>,
 *   skipped: Array<{ partId: string, reason: string }>,
 *   partsChecksum: string,
 * }}
 */
export function constructionToSCDLParts(solvedResult, options = {}) {
  const {
    colorByPart = {},
    materialByPart = {},
    partPrefix = 'cg_',
  } = options;

  if (!solvedResult || typeof solvedResult.parts !== 'object' || solvedResult.parts === null) {
    throw new Error(
      'PB-CONSTRUCTION-SCDL: constructionToSCDLParts() requires a solved result '
      + 'with a `parts` map (the output of solve()/trySolve()).',
    );
  }

  const parts = [];
  const skipped = [];

  for (const partId of Object.keys(solvedResult.parts).sort()) {
    const part = solvedResult.parts[partId];
    const color = colorByPart[partId];
    if (!color) {
      skipped.push({ partId, reason: 'no colour assigned in colorByPart' });
      continue;
    }
    const material = materialByPart[partId] || 'source';
    const scdlPartId = `${partPrefix}${partId}`;

    // Rule 1: an explicit closed contour is the part's fill surface.
    const contour = part.closedContour;
    if (Array.isArray(contour) && contour.length >= 3) {
      const points = collapseConsecutiveDuplicates(contour.map(roundPoint));
      if (points.length < 3 || doubledArea(points) === 0) {
        skipped.push({ partId, reason: 'closed contour is degenerate after rounding' });
        continue;
      }
      parts.push({
        partId, scdlPartId, material, color, op: 'polygon', points,
      });
      continue;
    }

    // Rule 2: a ribbon — close the band between its two banks.
    const left = part.leftBank;
    const right = part.rightBank;
    if (Array.isArray(left) && Array.isArray(right) && left.length >= 2 && right.length >= 2) {
      const ring = [...left, ...[...right].reverse()];
      const points = collapseConsecutiveDuplicates(ring.map(roundPoint));
      if (points.length < 3 || doubledArea(points) === 0) {
        skipped.push({ partId, reason: 'ribbon banks collapse to a degenerate polygon after rounding' });
        continue;
      }
      parts.push({
        partId, scdlPartId, material, color, op: 'polygon', points,
      });
      continue;
    }

    // Rule 3: a spine alone has no fill surface. v1 records the skip rather
    // than inventing width the construction never solved for.
    if (Array.isArray(part.spine) && part.spine.length > 0) {
      skipped.push({ partId, reason: 'spine-only parts have no fill surface in v1' });
      continue;
    }

    skipped.push({ partId, reason: 'no closed contour, ribbon banks, or spine in solved geometry' });
  }

  const blocks = parts.map(p => partBlock(p.scdlPartId, p.material, [polygonOp(p.points, p.color)]));
  const header = `# construction-derived parts (${CONSTRUCTION_SCDL_CONTRACT})`;
  const source = blocks.length > 0 ? `${header}\n${blocks.join('\n\n')}\n` : '';

  return Object.freeze({
    contract: CONSTRUCTION_SCDL_CONTRACT,
    source,
    parts: Object.freeze(parts),
    skipped: Object.freeze(skipped),
    partsChecksum: partsChecksum(source),
  });
}
