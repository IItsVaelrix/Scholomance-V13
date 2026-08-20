/**
 * FOUR-TIER CHART MATTER (§12)
 *
 * A dark sentence is not the same as a dark atom. Tiers:
 *   invalid     — no lawful body
 *   unreachable — in no complete parse
 *   dark        — structure exists, invisible to the root aperture
 *   latent      — silent/unlit but already hears a field or a probe
 *
 * Do not conflate them. This is a label, not a prune.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/atom-matter
 */

export const ATOM_MATTER_CONTRACT = 'PB-ATOM-MATTER-v1';
export const MATTER_TIERS = Object.freeze(['invalid', 'unreachable', 'dark', 'latent', 'lit']);

export function classifyAtomMatter({
  inStable = false,
  inSpanning = false,
  hears = false,
  probed = false,
  invalid = false,
} = {}) {
  if (invalid) return 'invalid';
  if (inStable) return 'lit';
  if (inSpanning) return 'dark';
  if (hears || probed) return 'latent';
  return 'unreachable';
}

function walk(node, seen) {
  if (!node || seen.has(node)) return;
  seen.add(node);
  const d = (node.derivations && node.derivations[0]) || null;
  if (!d) return;
  if (d.lift && d.child) walk(d.child, seen);
  if (d.left) walk(d.left, seen);
  if (d.right) walk(d.right, seen);
}

function collect(nodes) {
  const seen = new Set();
  for (const node of nodes || []) walk(node, seen);
  return seen;
}

/**
 * Label every packed molecule. Leaves inherit the mark onto chart.atoms
 * when they are the same object.
 */
export function annotateChartMatter(chart) {
  const stable = collect(chart?.stable);
  const spanning = collect(chart?.spanning);
  const molecules = chart?.molecules || [];
  for (const node of molecules) {
    const hears = Number(node.chloroplast?.irradiance || node.ingested?.energy || 0) > 0;
    const invalid = !node.type || !node.nucleus;
    node.matter = classifyAtomMatter({
      inStable: stable.has(node),
      inSpanning: spanning.has(node),
      hears,
      probed: Boolean(node.probed),
      invalid,
    });
  }
  for (const atom of chart?.atoms || []) {
    if (atom.matter) continue;
    const hears = Number(atom.chloroplast?.irradiance || atom.ingested?.energy || 0) > 0;
    atom.matter = classifyAtomMatter({
      inStable: stable.has(atom),
      inSpanning: spanning.has(atom),
      hears,
      probed: Boolean(atom.probed),
      invalid: !atom.type || !atom.nucleus,
    });
  }
  return chart;
}
