/**
 * ELECTROMAGNETISM — voltage is charge. The field organizes.
 *
 * Each uniquely won array cell is a charge packet. Rivals at one span
 * carry like charge and repel. After the field settles, an emitter is
 * owned by at most one atom (the strongest claim). Complementary owners
 * attract: their epistemic supports do not overlap.
 *
 * Zero charge is neutral, not inert. A neutral node exerts no Coulomb
 * force but still sits in the circuit and can carry induced potential.
 * The feed of a derivation is a current source. A sink seated as the
 * feed is a load. POSS and P raise impedance; they are not clause rails.
 *
 * LAW: the field ranks. It never removes a bond or an atom.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/electromagnetism
 */

/**
 * One owner per source span. Closest strongest claim keeps that field
 * line. Same-span ties keep the cell (they will repel). Multiple auras
 * from one span collapse to the strongest cell — one token is one line.
 */
function settle(claims) {
  const byFrom = new Map();
  for (const claim of claims) {
    if (!(claim.cell.voltage > 0)) continue;
    const rows = byFrom.get(claim.cell.from) || [];
    rows.push(claim);
    byFrom.set(claim.cell.from, rows);
  }
  const kept = new Map();
  for (const { atom } of claims) {
    if (!kept.has(atom)) kept.set(atom, []);
  }
  for (const rows of byFrom.values()) {
    let best = 0;
    for (const row of rows) {
      if (row.cell.voltage > best) best = row.cell.voltage;
    }
    let winners = rows.filter((row) => row.cell.voltage === best);
    let nearest = Infinity;
    for (const row of winners) {
      const dist = Math.abs((row.atom.from ?? 0) - (row.cell.from ?? 0));
      if (dist < nearest) nearest = dist;
    }
    winners = winners.filter((row) => (
      Math.abs((row.atom.from ?? 0) - (row.cell.from ?? 0)) === nearest
    ));
    for (const { atom, cell } of winners) {
      const list = kept.get(atom) || [];
      const prior = list.findIndex((existing) => existing.from === cell.from);
      if (prior < 0) list.push(cell);
      else if (cell.voltage > list[prior].voltage) list[prior] = cell;
      kept.set(atom, list);
    }
  }
  return kept;
}

export function stampCharges(field) {
  const claims = [];
  for (const slot of field || []) {
    for (const atom of slot.atoms || []) {
      for (const cell of atom.chloroplast?.cells || []) {
        claims.push({ atom, cell });
      }
    }
  }
  const kept = settle(claims);
  for (const slot of field || []) {
    for (const atom of slot.atoms || []) {
      const cells = kept.get(atom) || [];
      atom.wonCells = Object.freeze(cells.slice());
      atom.charge = cells.reduce((sum, cell) => sum + (cell.voltage || 0), 0);
      atom.polarity = polarity(atom);
    }
  }
  for (const slot of field || []) {
    for (const atom of slot.atoms || []) {
      atom.potential = (Number(atom.charge) || 0) + inducedPotential(atom, field);
    }
  }
  return field;
}

export function polarity(atom) {
  const charge = Number(atom?.charge) || 0;
  if (charge > 0) return 'positive';
  if (charge < 0) return 'negative';
  return 'neutral';
}

/**
 * A charged neighbor induces potential on every node, including neutrals.
 * Neutrals do not source a field.
 */
export function inducedPotential(atom, field) {
  if (!atom || !field) return 0;
  let potential = 0;
  for (const slot of field) {
    for (const other of slot.atoms || []) {
      if (other === atom) continue;
      const charge = Number(other.charge) || 0;
      if (charge === 0) continue;
      const radius = Math.max(1, Math.abs((other.from ?? 0) - (atom.from ?? 0)));
      potential += charge / radius;
    }
  }
  return potential;
}

export function sourcedCurrent(atom) {
  if (!atom || !Number.isInteger(atom.from)) return 0;
  return (atom.wonCells || [])
    .filter((cell) => cell.from > atom.from)
    .reduce((sum, cell) => sum + (cell.voltage || 0), 0);
}

export function sunkCurrent(atom) {
  if (!atom || !Number.isInteger(atom.from)) return 0;
  return (atom.wonCells || [])
    .filter((cell) => cell.from < atom.from)
    .reduce((sum, cell) => sum + (cell.voltage || 0), 0);
}

function dominantAtom(field, index) {
  const atoms = field?.[index]?.atoms || [];
  let best = null;
  for (const atom of atoms) {
    if (!best || (atom.charge || 0) > (best.charge || 0)) best = atom;
  }
  return best;
}

const VERBAL_SEAT = new Set(['V', 'VP']);

/**
 * The predicate is a load when it sources nothing downstream and it
 * sits on a prior verb's sourced current. Neutral (q=0, no cells) is
 * not a load — it is an uncharged node.
 */
export function isLoad(atom, field) {
  if (!atom || !field) return false;
  if (sourcedCurrent(atom) > 0) return false;
  if (!(sunkCurrent(atom) > 0)) return false;
  for (const cell of atom.wonCells || []) {
    if (!(cell.from < atom.from)) continue;
    const prior = dominantAtom(field, cell.from);
    if (prior && VERBAL_SEAT.has(prior.type)) return true;
    const priorVerb = (field[cell.from]?.atoms || []).find((other) => VERBAL_SEAT.has(other.type));
    if (priorVerb && (priorVerb.wonCells || []).some((won) => won.from === atom.from)) {
      const seat = dominantAtom(field, cell.from);
      if (seat && VERBAL_SEAT.has(seat.type)) return true;
      if (seat && (seat.charge || 0) === (priorVerb.charge || 0) && VERBAL_SEAT.has(priorVerb.type)) {
        return true;
      }
    }
  }
  return false;
}

const SERIES_Z = new Set(['P', 'POSS', 'PRT']);

/** Impedance of the path between two seats. Adjacent is 1. */
export function pathImpedance(from, to, field) {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  let resistance = 1;
  for (let i = lo + 1; i < hi; i += 1) {
    const types = field?.[i]?.types || [];
    if (types.includes('POSS')) resistance += 3;
    else if (types.some((type) => SERIES_Z.has(type))) resistance += 2;
  }
  return resistance;
}

function wonAuras(atom) {
  return new Set((atom?.wonCells || []).map((cell) => cell.aura));
}

/**
 * Epistemic correlation as Coulomb polarity.
 * Same seat → like charges, repel.
 * High overlap of won emitters → competing explanations, repel.
 * Disjoint supports → complementary, attract.
 */
export function coulomb(left, right) {
  if (!left || !right) return 0;
  const q1 = Number(left.charge) || 0;
  const q2 = Number(right.charge) || 0;
  if (!(q1 > 0 && q2 > 0)) return 0;
  const span = Math.abs((left.from ?? 0) - (right.from ?? 0));
  const radius = Math.max(1, span);
  const magnitude = (q1 * q2) / (radius * radius);
  if (span === 0) return -magnitude;
  const a = wonAuras(left);
  const b = wonAuras(right);
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 0;
  let inter = 0;
  for (const aura of a) {
    if (b.has(aura)) inter += 1;
  }
  const overlap = inter / union.size;
  return (1 - 2 * overlap) * magnitude;
}

/**
 * Circuit energy. Charge still attracts. Neutral nodes add induced
 * potential — they are not dropped. A predicate that is a load is a
 * high-impedance feed. POSS/P on the path divide the energy.
 */
export function organizeDerivation(atoms, field = null, options = {}) {
  const live = (atoms || []).filter(Boolean);
  const predicate = options.predicate || null;
  let energy = 0;
  const explained = new Set();
  for (const atom of live) {
    const charge = Number(atom.charge) || 0;
    const induced = field ? inducedPotential(atom, field) : 0;
    energy += charge + induced;
    for (const cell of atom.wonCells || []) explained.add(cell.from);
  }
  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      energy += coulomb(live[i], live[j]);
    }
  }
  energy += explained.size;
  if (predicate && field && isLoad(predicate, field)) energy *= 0.2;
  if (live.length >= 2 && field && Number.isInteger(live[0].from) && Number.isInteger(live[live.length - 1].from)) {
    energy /= pathImpedance(live[0].from, live[live.length - 1].from, field);
  }
  return energy;
}
