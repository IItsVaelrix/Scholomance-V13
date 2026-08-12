/**
 * QUARK CHAMBER — Layer 1: the slingshot generator.
 *
 * A quark is a DERIVED bridge rule, manufactured by gravity assist over the
 * licensed graph rather than authored by a human. Atom A offers port `o`;
 * waypoint C seeks `s1` and offers `o2`; atom B seeks `s2`. If A—C and C—B are
 * both licensed, A has borrowed C's connectivity to reach B. The candidate
 * quark asks whether that borrowing GENERALISES: does `o -> s2` license
 * directly, without C?
 *
 * CONFINEMENT IS A CANDIDACY LAW, NOT A PRESSURE VALUE. A rule witnessed by a
 * single waypoint is an anecdote; >=2 independent waypoints are required to
 * EMIT. Because PDR F10 forbids the proposer from scoring its own output,
 * nothing in this module returns a score, a rank, or a strength for a
 * candidate. Ranking happens in Layer 2, from producers named elsewhere.
 *
 * Everything here is pure and structural: no vectors, no corpus, no I/O.
 *
 * Spec: docs/superpowers/specs/2026-08-12-quark-chamber-design.md
 */

export const QUARK_CHAMBER_CONTRACT = 'PB-QUARK-CHAMBER-v1';

export function buildBridgeMap(bridges) {
  if (!Array.isArray(bridges)) throw new TypeError('buildBridgeMap(bridges) requires an array');
  return new Map(bridges.map((rule) => [`${rule.from}|${rule.to}`, rule]));
}

/** Exact match is `satisfies` at full strength; otherwise an authored bridge, or nothing. */
export function licenseFor(offer, seek, bridgeMap) {
  if (offer === seek) return { relation: 'satisfies', strength: 1 };
  const bridge = bridgeMap.get(`${offer}|${seek}`);
  if (!bridge) return null;
  return { relation: bridge.relation, strength: bridge.strength };
}

/** Mirrors semantic-valence-cyclotron.js:connectionBetween — inhibition is by domain. */
function inhibited(from, to) {
  return (from.inhibits ?? []).includes(to.domain) || (to.inhibits ?? []).includes(from.domain);
}

export function licensedPortEdges(blueprints, bridges) {
  if (!Array.isArray(blueprints)) throw new TypeError('licensedPortEdges(blueprints, bridges) requires arrays');
  const bridgeMap = buildBridgeMap(bridges);
  const edges = [];
  for (const from of blueprints) {
    for (const to of blueprints) {
      if (from.id === to.id) continue;
      if (inhibited(from, to)) continue;
      for (const offer of from.offers ?? []) {
        for (const seek of to.seeks ?? []) {
          const license = licenseFor(offer, seek, bridgeMap);
          if (!license) continue;
          edges.push(Object.freeze({
            fromAtomId: from.id,
            toAtomId: to.id,
            offer,
            seek,
            relation: license.relation,
            strength: license.strength,
          }));
        }
      }
    }
  }
  edges.sort((a, b) => (
    `${a.fromAtomId}|${a.toAtomId}|${a.offer}|${a.seek}`
      .localeCompare(`${b.fromAtomId}|${b.toAtomId}|${b.offer}|${b.seek}`)
  ));
  return Object.freeze(edges);
}

export function generateQuarkCandidates(blueprints, bridges, { depth = 1, confinementMin = 2 } = {}) {
  if (depth !== 1) {
    throw new RangeError(
      `quark chamber v1 supports depth 1 only (received ${depth}). Depth > 1 requires its own `
      + 'configuration null before its counts mean anything — see the design, section 9.',
    );
  }
  if (!Number.isInteger(confinementMin) || confinementMin < 1) {
    throw new RangeError('confinementMin must be an integer >= 1');
  }

  const bridgeMap = buildBridgeMap(bridges);
  const edges = licensedPortEdges(blueprints, bridges);

  const incoming = new Map();
  const outgoing = new Map();
  for (const edge of edges) {
    if (!outgoing.has(edge.fromAtomId)) outgoing.set(edge.fromAtomId, []);
    outgoing.get(edge.fromAtomId).push(edge);
    if (!incoming.has(edge.toAtomId)) incoming.set(edge.toAtomId, []);
    incoming.get(edge.toAtomId).push(edge);
  }

  const candidates = new Map();
  for (const waypoint of blueprints) {
    const arrivals = incoming.get(waypoint.id) ?? [];
    const departures = outgoing.get(waypoint.id) ?? [];
    for (const arrival of arrivals) {
      for (const departure of departures) {
        if (arrival.fromAtomId === departure.toAtomId) continue; // A must differ from B
        const from = arrival.offer;
        const to = departure.seek;
        if (licenseFor(from, to, bridgeMap)) continue; // already licensed — not new
        const key = `${from}|${to}`;
        if (!candidates.has(key)) {
          candidates.set(key, { from, to, witnesses: new Set(), compositions: new Set() });
        }
        const candidate = candidates.get(key);
        // Independence is per WAYPOINT ATOM: one atom offering several routes is
        // one witness. Counting routes instead would let a single hub corroborate
        // itself, which is exactly what the confinement law exists to prevent.
        candidate.witnesses.add(waypoint.id);
        candidate.compositions.add(`${arrival.relation}|${departure.relation}`);
      }
    }
  }

  const confined = [];
  for (const candidate of candidates.values()) {
    if (candidate.witnesses.size < confinementMin) continue;
    confined.push(Object.freeze({
      from: candidate.from,
      to: candidate.to,
      witnesses: Object.freeze([...candidate.witnesses].sort()),
      compositions: Object.freeze([...candidate.compositions].sort()),
    }));
  }
  confined.sort((a, b) => `${a.from}|${a.to}`.localeCompare(`${b.from}|${b.to}`));
  return Object.freeze(confined);
}
