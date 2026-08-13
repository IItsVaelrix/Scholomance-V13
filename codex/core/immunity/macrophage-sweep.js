/**
 * FINDING ANCHORS — turn cleri-probe findings into a spatial topology the
 * SpatialImmuneOrchestrator can patrol.
 *
 * This module deliberately does NOT propagate energy, walk gradients, or
 * localise regions. `SpatialImmuneOrchestrator` already does all of that, with
 * `propagateWithOctree` + INVERSE_SQUARE attenuation and immune agents doing
 * chemotaxis at EPSILON 1e-9. A first version of this file hand-rolled its own
 * field on top of `propagate` + GAUSSIAN and produced nothing but geometry:
 * `propagate` is the VOXEL TERRAIN generator — its energies map to
 * earth/stone/granite/crystal and it clamps to [0,1] BEFORE the smoothing
 * passes, so 203 seeds saturate the whole volume and the diffusion averages a
 * constant. That clamp is correct for terrain and fatal for diagnostics.
 *
 * What was missing is supplied here instead: the orchestrator anchors modules
 * with `registerNode(id, x, y, z)`, and without that call `injectPrionResonance`
 * falls back to `_hashToCoord` — random placement, so agents patrol noise. These
 * are the coordinates worth anchoring, plus the triage that decides how loudly
 * each file should call for help.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

/** A swallow that RETURNS a plausible value is the class that hides for months. */
export const DISTRESS_WEIGHTS = Object.freeze({
  SILENT_FALLBACK: 1.0,
  LOGS_ONLY: 0.35,
  SKIP_ONLY: 0.15,
});

const IMPORT_RE = /(?:import[\s\S]*?from\s*|import\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;
const FALLBACK_RETURN = /\breturn\s*(\[\s*\]|\{\s*\}|null|false|0|''|""|`\s*`)\s*;/;
const FLAG_ASSIGN = /\b(_?available|_?ready|_?loaded|enabled)\s*=\s*(false|null)/i;

/**
 * Classify one finding by reading the catch and the tail of its function.
 * Density is not wrongness: collab.routes.js carries 40 findings that are all
 * `catch (error) { return sendServiceError(reply, error); }` — correct error
 * handling. Weighting by class is what stops the loudest file being the most
 * correct one.
 */
export function classifyFinding(sourceLines, startLine, window = 14) {
  if (!sourceLines) return 'SKIP_ONLY';
  const from = Math.max(0, (startLine ?? 1) - 1);
  const text = sourceLines.slice(from, from + window).join('\n');
  if (FALLBACK_RETURN.test(text) || FLAG_ASSIGN.test(text)) return 'SILENT_FALLBACK';
  if (/console\.(log|warn|error)|logger\./.test(text)) return 'LOGS_ONLY';
  return 'SKIP_ONLY';
}

/** Resonance per file in [0,1], summed over its findings and weighted by danger. */
export function resonanceByFile(findings, classOf) {
  const raw = new Map();
  for (const finding of findings) {
    if (!finding.path) continue;
    const weight = DISTRESS_WEIGHTS[classOf(finding)] ?? DISTRESS_WEIGHTS.SKIP_ONLY;
    raw.set(finding.path, (raw.get(finding.path) ?? 0) + weight);
  }
  const peak = Math.max(1, ...raw.values());
  return new Map([...raw].map(([path, energy]) => [path, energy / peak]));
}

/** Who imports whom, restricted to `paths` — the coupling anchoring must encode. */
export function buildImportGraph(paths, readFile) {
  const known = new Set(paths);
  const graph = new Map(paths.map((p) => [p, new Set()]));
  for (const path of paths) {
    const source = readFile(path);
    if (!source) continue;
    IMPORT_RE.lastIndex = 0;
    let match;
    while ((match = IMPORT_RE.exec(source)) !== null) {
      const spec = match[1];
      if (!spec.startsWith('.')) continue; // package imports are not internal coupling
      const base = normalize(join(dirname(path), spec)).replace(/\\/g, '/');
      for (const candidate of [base, `${base}.js`, `${base}.mjs`, `${base}.jsx`, `${base}.ts`, `${base}/index.js`]) {
        if (known.has(candidate) && candidate !== path) {
          graph.get(path).add(candidate);
          graph.get(candidate).add(path);
          break;
        }
      }
    }
  }
  return graph;
}

/**
 * Breadth-first over the coupling graph, then SPREAD across the volume.
 *
 * The spacing is load-bearing. Packed into a contiguous block, 203 files form a
 * solid slab of energy with no gaps for structure to live in, and every seed
 * flows to the same handful of basins regardless of what is coupled to what —
 * measured: shuffling the placement gave a byte-identical partition. Leaving
 * room between anchors is what lets a cluster be a cluster.
 */
export function anchorByCoupling(paths, graph, { stride = 3, perRow = 10, origin = 1 } = {}) {
  const degree = (p) => graph.get(p)?.size ?? 0;
  const remaining = new Set(paths);
  const order = [];
  while (remaining.size > 0) {
    let seed = null;
    for (const p of remaining) if (seed === null || degree(p) > degree(seed)) seed = p;
    const queue = [seed];
    remaining.delete(seed);
    while (queue.length > 0) {
      const current = queue.shift();
      order.push(current);
      for (const neighbour of [...(graph.get(current) ?? [])].sort()) {
        if (remaining.has(neighbour)) { remaining.delete(neighbour); queue.push(neighbour); }
      }
    }
  }

  return new Map(order.map((path, index) => [path, {
    x: (index % perRow) * stride + origin,
    y: (Math.floor(index / perRow) % perRow) * stride + origin,
    z: (Math.floor(index / (perRow * perRow)) % perRow) * stride + origin,
  }]));
}

/**
 * Does adjacency actually mean coupling? Fraction of nearby anchored pairs that
 * are import-coupled, against the same fraction over all pairs. A lift near 1
 * means the anchoring carries no information and the agents patrol noise.
 */
export function couplingLocality(anchors, graph, { stride = 3 } = {}) {
  const byCell = new Map();
  for (const [path, c] of anchors) byCell.set(`${c.x},${c.y},${c.z}`, path);

  let pairs = 0;
  let coupled = 0;
  for (const [path, c] of anchors) {
    for (const [dx, dy] of [[stride, 0], [0, stride]]) {
      const neighbour = byCell.get(`${c.x + dx},${c.y + dy},${c.z}`);
      if (!neighbour) continue;
      pairs += 1;
      if (graph.get(path)?.has(neighbour)) coupled += 1;
    }
  }

  const all = [...anchors.keys()];
  const edges = [...graph.values()].reduce((n, s) => n + s.size, 0) / 2;
  const possible = (all.length * (all.length - 1)) / 2;
  const chance = possible === 0 ? 0 : edges / possible;
  const observed = pairs === 0 ? 0 : coupled / pairs;
  return { observed, chance, lift: chance === 0 ? 0 : observed / chance, pairs };
}

export function readSource(root) {
  const cache = new Map();
  return (path) => {
    if (!cache.has(path)) {
      try { cache.set(path, readFileSync(join(root, path), 'utf8')); } catch { cache.set(path, null); }
    }
    return cache.get(path);
  };
}
