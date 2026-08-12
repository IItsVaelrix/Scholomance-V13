/**
 * QUARK CHAMBER — the degree-matched configuration null.
 *
 * `codebase-nuclei-bank.js:shuffleOffersSeeks` moves each atom's (offers, seeks)
 * bundle as a UNIT. Licensing depends only on port names, so the port-level
 * graph is untouched and the atom-level graph is merely relabelled: an
 * isomorphism, under which every structural statistic is invariant BY
 * CONSTRUCTION. That is not a defect — for the nuclei ablation, where label,
 * domain, evidence and grounding stay put, it is a valid control. It is simply
 * inert for topology, and topology is what quarks are made of.
 *
 * This shuffle randomises the atom-port incidence while holding BOTH marginals
 * exactly: per-atom offer/seek counts and per-port global frequencies. It is a
 * bipartite double-edge swap — pick two incidences (a1,p1) and (a2,p2), and
 * exchange their ports when neither atom already holds the other's port. Degree
 * on both sides is preserved by the swap itself, so no rejection sampling over
 * degree sequences is needed.
 *
 * Spec: docs/superpowers/specs/2026-08-12-quark-chamber-design.md section 4.1
 */

import { mulberry32 } from '../codebase-nuclei-bank.js';

function swapField(blueprints, field, random, swapFactor) {
  const incidences = [];
  const held = blueprints.map((atom) => new Set(atom[field] ?? []));
  blueprints.forEach((atom, atomIndex) => {
    for (const port of atom[field] ?? []) incidences.push({ atomIndex, port });
  });
  if (incidences.length < 2) return held.map((set) => [...set].sort());

  const attempts = swapFactor * incidences.length;
  for (let i = 0; i < attempts; i += 1) {
    const left = incidences[Math.floor(random() * incidences.length)];
    const right = incidences[Math.floor(random() * incidences.length)];
    if (left.atomIndex === right.atomIndex) continue;
    if (left.port === right.port) continue;
    if (held[left.atomIndex].has(right.port)) continue;  // would duplicate
    if (held[right.atomIndex].has(left.port)) continue;  // would duplicate

    held[left.atomIndex].delete(left.port);
    held[right.atomIndex].delete(right.port);
    held[left.atomIndex].add(right.port);
    held[right.atomIndex].add(left.port);
    const carried = left.port;
    left.port = right.port;
    right.port = carried;
  }
  return held.map((set) => [...set].sort());
}

export function degreeMatchedShuffle(blueprints, seed, { swapFactor = 10 } = {}) {
  if (!Array.isArray(blueprints)) throw new TypeError('degreeMatchedShuffle(blueprints, seed) requires an array');
  if (!Number.isFinite(seed)) throw new TypeError('degreeMatchedShuffle requires a finite seed');
  if (!Number.isInteger(swapFactor) || swapFactor < 1) throw new RangeError('swapFactor must be an integer >= 1');

  const random = mulberry32(seed);
  const offers = swapField(blueprints, 'offers', random, swapFactor);
  const seeks = swapField(blueprints, 'seeks', random, swapFactor);
  return blueprints.map((atom, index) => ({ ...atom, offers: offers[index], seeks: seeks[index] }));
}
