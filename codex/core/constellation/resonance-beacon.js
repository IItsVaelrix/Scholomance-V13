/**
 * RESONANCE BEACONS — atom state, broadcast, not locked.
 *
 * The nucleus is the sealed self. The aura is a contact barrier on silicone
 * bonds. Neither one tells a neighbor *which reading to prefer*. That is
 * ambiguity, and it lives in co-resident types at the same span.
 *
 * A beacon encodes the atom's state — type, nucleus, aura, every co-resident
 * reading — so any other atom can perceive it without waiting to be adjacent
 * in the CKY agenda. The field is the set of beacons for the whole input.
 * Perception is instantaneous because the field is complete before ranking.
 *
 * LAW (already in compose.js): bonds create, the field only ranks.
 * A beacon that could REMOVE a reading would be the aura wearing a new name.
 * Resonance scores a pair. It never vetoes. Silence (no licensed bond) is
 * score 0 for that pair of types, not deletion of the atom.
 *
 * Light is meaning-agnostic: aura, span, energy. No type, no lemma.
 *
 * Color operators that tried to name, lock-replace, or predict a construction
 * from that energy are dead. See `spectral-rejections.js`. The reaction is
 * still legal to look at. It is not a rule, a barcode, or a forecast.
 *
 * THREE ORGANS, THREE JOBS. Each answers one question and none answers
 * another's, which is what makes any of them testable alone:
 *
 *   CHLOROPLAST INGESTS   `chloroplastIngest` — what arrived. Geometry only:
 *                         self-light is not incoming, irradiance is the flux
 *                         that reached the panel. Consults no type, because
 *                         the photon carries none.
 *
 *   AURA REGULATES        `auraRegulate` — who sent it and whether this
 *                         receiver may react to that sender. The aura is the
 *                         sealed identity, so admission is its seat. Carries
 *                         `damping`, the dial for how much of an absorbed
 *                         photon becomes voltage.
 *
 *   CHLOROPHYLL ABSORBS   `chlorophyllAbsorb` — what the pigment makes of it.
 *                         Receiver-local and type-aware. Type enters the light
 *                         path here and nowhere upstream.
 *
 * `photosynthesize` is their composition and holds no logic of its own. The
 * consumer compares cells. The reaction — not the photon — is the informative
 * state.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/resonance-beacon
 */

import { atomsFor, BONDS, LIFTS } from './compose.js';
import { BOND_REACTION, classifyBond } from './bond-kind.js';
import { ATOM_VALENCE } from './atom-valence.js';
import { readNucleus } from './atom-nucleus.js';
import { isLoad, organizeDerivation, stampCharges } from './electromagnetism.js';

/**
 * A photon. Geometry, identity, energy. Nothing that names a category.
 * Two readings of the same token at the same span emit the same energy
 * from the same place; only their auras differ.
 */
export function emitLight(atom) {
  const nucleus = readNucleus(atom);
  const from = Number.isInteger(atom.from) ? atom.from : nucleus.from;
  const to = Number.isInteger(atom.to) ? atom.to : (nucleus.to ?? from);
  const width = Math.max(0, (to ?? from) - (from ?? 0));
  return Object.freeze({
    aura: nucleus.aura,
    from,
    to,
    energy: 1 / (1 + width),
  });
}

/**
 * Receiver-local pigment. Type lives here, on the atom that will react,
 * never on the light it absorbs.
 */
export function chlorophyll(atom) {
  const nucleus = readNucleus(atom);
  return Object.freeze({
    aura: nucleus.aura,
    type: atom.type,
    from: atom.from,
    to: atom.to ?? atom.from,
  });
}

/**
 * INGESTION — the chloroplast takes light IN.
 *
 * Geometry only. A photon emitted from this atom's own span is not incoming,
 * and irradiance is the flux that reaches the panel. No type is consulted here
 * and none can be: the photon does not carry one. Ingestion decides WHAT
 * ARRIVED, never what it means.
 *
 * `distance` is carried on the arrival because attenuation is a property of
 * the journey, not of the pigment that will later react to it.
 */
export function chloroplastIngest(atom, lights = []) {
  const arrivals = [];
  let irradiance = 0;
  for (const light of lights || []) {
    if (light.from === atom.from) continue;
    const flux = Number(light.energy) || 0;
    irradiance += flux;
    arrivals.push(Object.freeze({
      aura: light.aura,
      from: light.from,
      to: light.to ?? light.from,
      irradiance: flux,
      distance: Math.abs((atom.from ?? 0) - (light.from ?? 0)),
    }));
  }
  return Object.freeze({ arrivals: Object.freeze(arrivals), irradiance });
}

/**
 * REGULATION — the aura governs what may be reacted to.
 *
 * The aura is the sealed identity fingerprint, so it is the seat of admission:
 * it resolves WHO emitted an arriving photon and whether this receiver is
 * permitted to react to that sender at all. An unregistered aura is an unknown
 * sender and nothing is absorbed from it.
 *
 * `damping` is the regulator's dial — the fraction of an absorbed photon that
 * becomes voltage. It is 1 today, which is deliberate: the seat exists and is
 * inert, so turning regulation on later is a measurable one-line change rather
 * than a new mechanism smuggled into the absorption maths.
 */
export function auraRegulate(atom, arrival, emittersByAura) {
  const emitter = emittersByAura && emittersByAura.get(arrival.aura);
  if (!emitter) {
    return Object.freeze({
      permitted: false, reason: 'unregistered-aura', emitter: null, damping: 0,
    });
  }
  return Object.freeze({ permitted: true, reason: null, emitter, damping: 1 });
}

/**
 * ABSORPTION — the chlorophyll reacts.
 *
 * Receiver-local and type-aware: the pigment decides whether an arriving photon
 * is absorbed and at what voltage. Type enters the light path HERE and nowhere
 * upstream. Geometry (which side the emitter occupies) selects the bond
 * direction, so reverse-order bonds do not fire.
 */
export function chlorophyllAbsorb(pigment, arrival, emitter, bonds = BONDS, damping = 1) {
  const leftFirst = arrival.from < (pigment.from ?? 0);
  const order = leftFirst ? 'emitter-left' : 'emitter-right';
  const coupling = leftFirst
    ? directedCoupling(emitter.type, pigment.type, bonds)
    : directedCoupling(pigment.type, emitter.type, bonds);
  if (!(coupling > 0)) {
    return Object.freeze({ absorbed: false, voltage: 0, coupling: 0, order });
  }
  const voltage = (arrival.irradiance * coupling * damping) / (1 + arrival.distance);
  return Object.freeze({ absorbed: true, voltage, coupling, order });
}

/**
 * Solar-panel array. One cell per ingested arrival; voltage is what the
 * chlorophyll made of it. The array itself has no type — type lives on the
 * pigment.
 */
export function chloroplast(atom, lights = []) {
  const pigment = atom.chlorophyll || chlorophyll(atom);
  const ingested = atom.ingested || { energy: 0, reactions: Object.freeze([]) };
  const byAura = new Map((ingested.reactions || []).map((row) => [row.aura, row]));
  const arrivals = (lights && lights.length)
    ? chloroplastIngest(atom, lights).arrivals
    : (ingested.reactions || []).map((row) => Object.freeze({
      aura: row.aura,
      from: row.from,
      to: row.from,
      irradiance: Number(row.energy) || 0,
      distance: Math.abs((atom.from ?? 0) - (row.from ?? 0)),
    }));
  const cells = [];
  let irradiance = 0;
  for (const arrival of arrivals) {
    irradiance += arrival.irradiance;
    const reaction = byAura.get(arrival.aura);
    cells.push(Object.freeze({
      aura: arrival.aura,
      from: arrival.from,
      to: arrival.to ?? arrival.from,
      irradiance: arrival.irradiance,
      voltage: Number(reaction?.energy) || 0,
    }));
  }
  return Object.freeze({
    pigment,
    cells: Object.freeze(cells),
    irradiance,
    voltage: Number(ingested.energy) || 0,
  });
}

export function panelVoltage(atom) {
  if (!atom) return 0;
  if (atom.chloroplast && Number.isFinite(atom.chloroplast.voltage)) {
    return atom.chloroplast.voltage;
  }
  return Number(atom.ingested?.energy) || 0;
}

/**
 * Photosynthesis is the COMPOSITION of the three organs, in order:
 *
 *     chloroplastIngest   what arrived        geometry, no type
 *     auraRegulate        who sent it, may I  identity, admission
 *     chlorophyllAbsorb   what I make of it   type, voltage
 *
 * Each organ answers one question and can be tested alone. The product
 * (`reactions`, `energy`) is the informative state; the photon still has no
 * type, and reverse-order bonds still do not fire.
 */
export function photosynthesize(atom, lights, emittersByAura, bonds = BONDS, sink = null) {
  const pigment = chlorophyll(atom);
  const { arrivals } = chloroplastIngest(atom, lights);
  const reactions = [];
  let energy = 0;
  for (const arrival of arrivals) {
    const gate = auraRegulate(atom, arrival, emittersByAura);
    if (!gate.permitted) continue;
    const emitter = gate.emitter;
    const absorption = chlorophyllAbsorb(pigment, arrival, emitter, bonds, gate.damping);
    if (!absorption.absorbed) {
      // NON-COUPLING LEDGER. Same blind spot the refusal ledger closed one
      // layer down: this case is computed, then dropped, so a photon that
      // reached a receiver and bonded with nothing leaves no trace. Without
      // it "which token couples to nothing here" is not answerable after the
      // fact. Opt-in; silence is the common case and would dwarf `reactions`.
      if (sink) {
        sink.push({
          emitterFrom: emitter.from,
          emitterType: emitter.type,
          receiverFrom: atom.from,
          receiverType: pigment.type,
          order: absorption.order,
        });
      }
      continue;
    }
    reactions.push(Object.freeze({
      aura: arrival.aura,
      from: arrival.from,
      energy: absorption.voltage,
    }));
    energy += absorption.voltage;
  }
  return Object.freeze({ energy, reactions: Object.freeze(reactions) });
}

export function illuminateField(field, bonds = BONDS, sink = null) {
  const emittersByAura = new Map();
  const lights = [];
  for (const slot of field || []) {
    for (const atom of slot.atoms || []) {
      atom.chlorophyll = chlorophyll(atom);
      atom.light = emitLight(atom);
      emittersByAura.set(atom.light.aura, atom);
      lights.push(atom.light);
    }
  }
  for (const slot of field || []) {
    for (const atom of slot.atoms || []) {
      atom.ingested = photosynthesize(atom, lights, emittersByAura, bonds, sink);
      atom.chloroplast = chloroplast(atom, lights);
    }
  }
  return stampCharges(field);
}

/**
 * DESCENDING LIGHT — emitted from the spanning roots, downward.
 *
 * Every other light in this module travels sideways: an atom emits, its
 * neighbours react, and the field is assembled out of what the atoms already
 * knew. It can rank them; it cannot tell any of them something new.
 *
 * This one comes from above. After the agenda drains and the chart is frozen,
 * light descends from every spanning root through its derivations. A cell the
 * light reaches is LIT. An atom learns what it is by being reached, not by
 * being told.
 *
 * IT CANNOT LOSE A PARSE. "Lit" is *defined* as reachable from a spanning root,
 * so a reading that participates in any complete parse is lit by construction.
 * That is not a hope about this implementation — it is what the operation
 * means, and the report checks coverage comes back byte-identical anyway.
 *
 * Reachability is over NODE IDENTITY. The aura is the transport encoding only,
 * so an aura collision can garble the broadcast but never the result.
 */
export function descendFromRoots(chart) {
  const lit = new Set();
  const stack = [...(chart?.stable || [])];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || lit.has(node)) continue;
    lit.add(node);
    for (const derivation of node.derivations || []) {
      if (derivation.child) stack.push(derivation.child);
      if (derivation.left) stack.push(derivation.left);
      if (derivation.right) stack.push(derivation.right);
    }
  }
  return lit;
}

/**
 * The broadcast. Payload is the set of auras of lit cells; a receiver's key is
 * its own aura. `lit` travels alongside as the exact identity set, so a caller
 * can measure where the encoding and the truth disagree instead of assuming
 * they never do.
 */
export function emitDescendingLight(chart) {
  const lit = descendFromRoots(chart);
  const auras = new Set();
  for (const node of lit) {
    const nucleus = readNucleus(node);
    if (nucleus?.aura) auras.add(nucleus.aura);
  }
  return Object.freeze({ lit, auras, litCells: lit.size });
}

/** Decryption: the receiver unlocks the broadcast with its own aura. */
export function decrypt(atom, payload) {
  if (!atom || !payload?.auras) return false;
  const nucleus = readNucleus(atom);
  return Boolean(nucleus?.aura) && payload.auras.has(nucleus.aura);
}

/** The exact answer, over node identity. Divergence from `decrypt` is collision. */
export function isLit(node, payload) {
  return Boolean(payload?.lit?.has(node));
}

export function encodeBeacon(atom, coresident = []) {
  const nucleus = readNucleus(atom);
  return Object.freeze({
    type: atom.type,
    from: atom.from,
    to: atom.to,
    token: atom.token ?? null,
    lemmas: nucleus.lemmas,
    headLemmas: nucleus.headLemmas,
    aura: nucleus.aura,
    adjunctEligible: atom.adjunctEligible !== false,
    coresident: Object.freeze([...(coresident || [])]),
  });
}

/**
 * One slot per token. Every reading `atomsFor` emitted is on the slot.
 * That is the transmitter: the whole state, not the winning type.
 */
export function buildBeaconField(tokens, posMap, options = {}) {
  const atoms = [];
  for (let i = 0; i < (tokens || []).length; i += 1) {
    for (const atom of atomsFor(tokens[i], i, posMap, options)) atoms.push(atom);
  }
  return fieldFromAtoms(atoms, tokens, options.bonds || BONDS);
}

function closure(type) {
  const out = new Set([type]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [src, dst] of LIFTS) {
      if (out.has(src) && !out.has(dst)) {
        out.add(dst);
        grew = true;
      }
    }
  }
  return out;
}

function bondBetween(leftType, rightType, bonds) {
  return (bonds || []).find((b) => b[0] === leftType && b[1] === rightType) || null;
}

/**
 * How loudly two types hear each other. Constructive (carbon) channels
 * ring at 1. Preservative silicone is quieter. No licensed bond is silence,
 * not a veto — the atoms still exist.
 */
export function channelResonance(leftType, rightType, bonds = BONDS) {
  const bond = bondBetween(leftType, rightType, bonds);
  if (!bond) return 0;
  const kind = classifyBond(bond);
  if (kind === BOND_REACTION.CONSTRUCTIVE) return 1;
  if (kind === BOND_REACTION.RECURSIVE_PRESERVATIVE) return 0.4;
  return 0.7;
}

function directedCoupling(leftType, rightType, bonds) {
  let best = 0;
  for (const left of closure(leftType)) {
    for (const right of closure(rightType)) {
      const score = channelResonance(left, right, bonds);
      if (score > best) best = score;
    }
  }
  return best;
}

function bestToward(neighborTypes, type, side, bonds) {
  const self = closure(type);
  let best = 0;
  for (const other of neighborTypes) {
    const others = closure(other);
    for (const own of self) {
      for (const neighbor of others) {
        const score = side === 'left'
          ? channelResonance(neighbor, own, bonds)
          : channelResonance(own, neighbor, bonds);
        if (score > best) best = score;
      }
    }
  }
  return best;
}

function channelReadingScores(field, bonds = BONDS) {
  return (field || []).map((slot, index) => {
    const left = index > 0 ? field[index - 1].types : null;
    const right = index + 1 < field.length ? field[index + 1].types : null;
    const rows = slot.types.map((type) => {
      const parts = [];
      if (left) parts.push(bestToward(left, type, 'left', bonds));
      if (right) parts.push(bestToward(right, type, 'right', bonds));
      // A silent direction abstains. Multiplying by 0 would let one mute
      // neighbor veto a live channel on the other side.
      const live = parts.filter((part) => part > 0);
      let score = parts.length === 0 ? 1 : live.length === 0 ? 0 : live.reduce((a, b) => a * b, 1);
      // A neighbor that can found a carbon bond with exactly this reading
      // — and not with its rivals — is a unique lock. That is the beacon
      // solving ambiguity: the field hears one type ring and the others stay quiet.
      const sides = [];
      if (left) sides.push(left);
      if (right) sides.push(right);
      for (const neighbor of sides) {
        const mine = bestToward(neighbor, type, neighbor === left ? 'left' : 'right', bonds);
        if (mine < 1) continue;
        const rival = Math.max(0, ...slot.types
          .filter((other) => other !== type)
          .map((other) => bestToward(neighbor, other, neighbor === left ? 'left' : 'right', bonds)));
        if (rival < 1) score *= 1.25;
      }
      return { type, score };
    });
    rows.sort((a, b) => b.score - a.score || a.type.localeCompare(b.type));
    return rows;
  });
}

/**
 * Winner-take-all across the array at one span. A cell is awarded only
 * when exactly one pigment converted it. Summed wattage is not a reading.
 */
export function consumeArray(slot) {
  const atoms = slot.atoms || [];
  const byCell = new Map();
  for (const atom of atoms) {
    for (const cell of atom.chloroplast?.cells || []) {
      const key = `${cell.from}:${cell.aura}`;
      const rows = byCell.get(key) || [];
      rows.push({ type: atom.type, voltage: cell.voltage || 0 });
      byCell.set(key, rows);
    }
  }
  const awarded = new Map((slot.types || []).map((type) => [type, 0]));
  for (const rows of byCell.values()) {
    let best = 0;
    for (const row of rows) {
      if (row.voltage > best) best = row.voltage;
    }
    if (!(best > 0)) continue;
    const winners = rows.filter((row) => row.voltage === best);
    if (winners.length !== 1) continue;
    const type = winners[0].type;
    awarded.set(type, (awarded.get(type) || 0) + best);
  }
  const list = (slot.types || []).map((type) => ({ type, score: awarded.get(type) || 0 }));
  list.sort((a, b) => b.score - a.score || a.type.localeCompare(b.type));
  return list;
}

/**
 * Per-token scores for every reading. The consumer reads the chloroplast
 * array when the panels have reported. Neighbor type-tables are the
 * dark-field fallback — they never override a live sensor.
 */
export function readingScores(field, bonds = BONDS) {
  const channel = channelReadingScores(field, bonds);
  return (field || []).map((slot, index) => {
    const atoms = slot.atoms || [];
    if (atoms.some((atom) => atom.chloroplast?.cells)) {
      return consumeArray(slot);
    }
    return channel[index];
  });
}

function leafTypesClassic(molecule, out = []) {
  if (!molecule) return out;
  if (!molecule.parts || molecule.parts.length === 0) {
    out.push({ index: molecule.from, type: molecule.type });
    return out;
  }
  for (const part of molecule.parts) leafTypesClassic(part, out);
  return out;
}

function leafTypesPacked(node, out = [], seen = new Set()) {
  if (!node || seen.has(node)) return out;
  seen.add(node);
  const derivations = node.derivations;
  if (!derivations || derivations.length === 0) {
    if (Number.isInteger(node.from) && node.from === node.to) {
      out.push({ index: node.from, type: node.type });
    }
    return out;
  }
  const d = derivations[0];
  if (d.lift) return leafTypesPacked(d.child, out, seen);
  if (d.left) {
    leafTypesPacked(d.left, out, seen);
    leafTypesPacked(d.right, out, seen);
  }
  return out;
}

export function leafTypesInOrder(molecule) {
  if (molecule && Array.isArray(molecule.derivations)) return leafTypesPacked(molecule);
  return leafTypesClassic(molecule);
}

/**
 * Build the field from atoms the chart already minted. Does not call
 * `atomsFor` again — the transmitters are those atoms, stamped with beacons.
 */
export function fieldFromAtoms(atoms, tokens, bonds = BONDS, sink = null) {
  const n = (tokens || []).length;
  const slots = Array.from({ length: n }, () => []);
  for (const atom of atoms || []) {
    if (Number.isInteger(atom.from) && atom.from === atom.to) slots[atom.from].push(atom);
  }
  const field = slots.map((slotAtoms, index) => {
    const types = [...new Set(slotAtoms.map((a) => a.type))];
    for (const atom of slotAtoms) {
      atom.beacon = encodeBeacon(atom, types);
    }
    return Object.freeze({
      token: tokens[index],
      lemma: String(tokens[index] ?? '').toLowerCase(),
      index,
      types: Object.freeze(types),
      beacons: Object.freeze(slotAtoms.map((atom) => atom.beacon)),
      atoms: slotAtoms,
    });
  });
  return illuminateField(field, bonds, sink);
}

/**
 * Rank finished molecules by how well their chosen readings match the field.
 * Every input molecule comes back. Coverage cannot move.
 */
export function rankByResonance(molecules, field, bonds = BONDS) {
  const scores = readingScores(field, bonds);
  const preference = scores.map((rows) => {
    const map = new Map(rows.map((r) => [r.type, r.score]));
    return map;
  });
  const ranked = (molecules || []).map((molecule, index) => {
    const leaves = leafTypesInOrder(molecule);
    let logSum = 0;
    let counted = 0;
    for (const leaf of leaves) {
      const table = preference[leaf.index];
      if (!table || !table.has(leaf.type)) continue;
      const value = table.get(leaf.type);
      if (!(value > 0)) {
        logSum += Math.log(0.05);
        counted += 1;
        continue;
      }
      logSum += Math.log(value);
      counted += 1;
    }
    const score = counted === 0 ? 1 : Math.exp(logSum / counted);
    return { molecule, score, index };
  });
  ranked.sort((a, b) => (b.score - a.score) || (a.index - b.index));
  return ranked.map(({ molecule, score }) => ({ molecule, score }));
}

const NOMINAL = new Set(['N', 'NC', 'NP', 'PRON', 'PROPN']);
const VERBAL = new Set(['V', 'VP']);

/**
 * Score a projected {subject, verb} against the field. Used when a packed
 * node stands for many answers and we must pick one without unpacking.
 */
export function scoreAnswer(answer, field, bonds = BONDS) {
  if (!answer || !field) return 0;
  const scores = readingScores(field, bonds);
  const want = [
    [answer.subject, NOMINAL],
    [answer.verb, VERBAL],
  ];
  let logSum = 0;
  let counted = 0;
  for (const [token, allow] of want) {
    if (token == null) continue;
    const idx = field.findIndex((slot) => slot.lemma === String(token).toLowerCase());
    if (idx < 0) continue;
    const best = Math.max(0, ...(scores[idx] || [])
      .filter((row) => allow.has(row.type))
      .map((row) => row.score));
    logSum += Math.log(Math.max(best, 0.05));
    counted += 1;
  }
  return counted === 0 ? 0 : Math.exp(logSum / counted);
}

export function pickResonantAnswer(answers, field, bonds = BONDS) {
  const list = answers || [];
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  let best = list[0];
  let bestScore = scoreAnswer(best, field, bonds);
  for (let i = 1; i < list.length; i += 1) {
    const score = scoreAnswer(list[i], field, bonds);
    if (score > bestScore) {
      best = list[i];
      bestScore = score;
    }
  }
  return best;
}

/**
 * Heads of a packed or classic node, with span still attached.
 * `headsOf` returns tokens. Clause ranking needs the index those tokens occupy.
 */
export function headedAtoms(node, memo = new Map()) {
  if (!node) return [];
  if (memo.has(node)) return memo.get(node);
  memo.set(node, []);
  const out = [];
  const seen = new Set();
  const push = (h) => {
    const key = `${h.from}:${h.to}:${h.type}:${h.token}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(h);
  };
  if (Array.isArray(node.derivations)) {
    if (node.derivations.length === 0) {
      if (node.token != null) {
        push({
          token: node.token, from: node.from, to: node.to, type: node.type,
        });
      }
    } else {
      for (const d of node.derivations) {
        if (d.lift) {
          for (const h of headedAtoms(d.child, memo)) push(h);
          continue;
        }
        const source = d.bond && d.bond[3] === 1 ? d.right : d.left;
        for (const h of headedAtoms(source, memo)) push(h);
      }
    }
  } else if (!node.parts || node.parts.length === 0) {
    if (node.token != null) {
      push({
        token: node.token, from: node.from, to: node.to, type: node.type,
      });
    }
  } else if (node.parts.length === 1) {
    for (const h of headedAtoms(node.parts[0], memo)) push(h);
  } else {
    // Classic trees do not carry the bond on the molecule. Prefer the right
    // child for verbal heads and the left for nominals — the caller chooses
    // which node to ask. Here we return both children's heads.
    for (const part of node.parts) {
      for (const h of headedAtoms(part, memo)) push(h);
    }
  }
  memo.set(node, out);
  return out;
}

/**
 * Heads of `node` that could lawfully BE a subject.
 *
 * `ATOM_VALENCE.V.subject.accept` has said `['NP', 'N', 'PRON']` since the typed
 * valence table was written, and nothing ever read it. Unfiltered,
 * `headedAtoms` happily offered a verb as the subject of another verb —
 * `{subject: have, verb: contact}` for `If you have any questions , please
 * contact us` — and an auxiliary as the subject of its own participle.
 *
 * PROPN, NC and GEN are admitted alongside the declared three: they are nominal
 * heads the table predates rather than nominal heads it excludes.
 *
 * Returns [] rather than a wrong answer when nothing nominal is available; the
 * caller then emits `subject: null`, which is a reading the projection already
 * has a shape for.
 */
const SUBJECT_TYPES = new Set([
  ...(ATOM_VALENCE.V?.subject?.accept || ['NP', 'N', 'PRON']),
  'PROPN', 'NC', 'GEN', 'PRONACC',
]);

function subjectCandidates(node, memo) {
  return headedAtoms(node, memo).filter((h) => SUBJECT_TYPES.has(h.type));
}

/**
 * One candidate per derivation path that can project an answer, with the
 * subject/verb *heads* still carrying from/to/type. PUNCT absorb and
 * matrix-preserving adjunction recurse, matching projectAnswers.
 */
/**
 * Node types this module can rank.
 *
 * `derivationCandidates` builds `{subject, verb}` candidates, and only a clause
 * has that shape — an `NP` utterance has a head and no predicate. So the ranker
 * abstains on everything else.
 *
 * EXPORTED BECAUSE THE ABSTENTION USED TO BE INVISIBLE. `pickResonantDerivation`
 * returns `null` both when it examined the candidates and found none, and when it
 * was never able to look at all, and callers wrote `Boolean(picked && ...)` —
 * which scores an abstention as a WRONG ANSWER. On 2026-08-20 that turned a root
 * doorway widening into +61 parses and exactly 0 correct answers, and the number
 * looked like the doorway had failed rather than like the ranker had never run.
 *
 * Ask this before interpreting a `null`.
 */
export const RANKABLE_TYPES = Object.freeze(['S']);

/**
 * Whether `pickResonantDerivation` is able to express an opinion about `node`.
 * A `false` here means a following `null` is an ABSTENTION, not a rejection.
 *
 * @param {object} node
 * @returns {boolean}
 */
export function canRankDerivations(node) {
  return Boolean(node) && RANKABLE_TYPES.includes(node.type);
}

export function derivationCandidates(node, visiting = new Set(), memo = new Map()) {
  if (!canRankDerivations(node) || visiting.has(node)) return [];
  visiting.add(node);
  const out = [];
  const derivations = Array.isArray(node.derivations)
    ? node.derivations
    : node.parts && node.parts.length === 2
      ? [{ bond: null, left: node.parts[0], right: node.parts[1] }]
      : node.parts && node.parts.length === 1
        ? [{ lift: true, child: node.parts[0] }]
        : [];
  for (const d of derivations) {
    if (d.lift) {
      for (const verb of headedAtoms(d.child, memo)) {
        out.push({
          answer: { subject: null, verb: verb.token },
          subjectHead: null,
          verbHead: verb,
          verbSpan: { from: d.child.from, to: d.child.to },
          subjectSpan: null,
          bond: null,
          lift: true,
        });
      }
      continue;
    }
    if (!d.left || !d.right) continue;
    if (d.right.type === 'PUNCT') {
      out.push(...derivationCandidates(d.left, visiting, memo));
      continue;
    }
    const headIdx = Array.isArray(d.bond) ? d.bond[3] : null;
    if (headIdx === 1 && d.right.type === 'S') {
      out.push(...derivationCandidates(d.right, visiting, memo));
      continue;
    }
    if (headIdx === 0 && (d.left.type === 'S' || d.left.type === 'SCOMMA')) {
      /**
       * SCOMMA IS A CLAUSE WEARING A COMMA. `S+COMMA -> SCOMMA` then
       * `SCOMMA+S -> S` head 0 means the FIRST clause heads the sentence (the
       * Grimoire's UD ruling for `he ran , she fell`). Without this branch the
       * pair fell through to the positional reading below and answered
       * {subject: <first clause's VERB>, verb: <second clause's verb>} —
       * `{received, notify}` for `If you have received it in error , please
       * notify the sender`. `projectAnswers` already recurses on COMMA; this is
       * the same law, restored to the ranking path so the two agree.
       */
      out.push(...derivationCandidates(d.left, visiting, memo));
      continue;
    }
    const subjects = subjectCandidates(d.left, memo);
    const verbs = headedAtoms(d.right, memo);
    const verbSpan = { from: d.right.from, to: d.right.to };
    const subjectSpan = { from: d.left.from, to: d.left.to };
    if (subjects.length === 0) {
      for (const verb of verbs) {
        out.push({
          answer: { subject: null, verb: verb.token },
          subjectHead: null,
          verbHead: verb,
          verbSpan,
          subjectSpan,
          bond: d.bond || null,
          lift: false,
        });
      }
      continue;
    }
    for (const subject of subjects) {
      for (const verb of verbs) {
        out.push({
          answer: { subject: subject.token, verb: verb.token },
          subjectHead: subject,
          verbHead: verb,
          verbSpan,
          subjectSpan,
          bond: d.bond || null,
          lift: false,
        });
      }
    }
  }
  visiting.delete(node);
  return out;
}

function atomAt(field, head) {
  if (!head || !field) return null;
  const slot = field[head.from];
  return (slot?.atoms || []).find((atom) => atom.type === head.type) || null;
}

function roleScoreAt(head, allow, scores) {
  if (!head || !scores || !scores[head.from]) return 0.05;
  const best = Math.max(0, ...(scores[head.from] || [])
    .filter((row) => allow.has(row.type))
    .map((row) => row.score));
  return Math.max(best, 0.05);
}

function conjBetween(field, from, to) {
  for (let i = from + 1; i < to; i += 1) {
    if (field[i]?.types?.includes('CONJ')) return true;
  }
  return false;
}

/**
 * A later verb head inside this predicate, with no coordinator between,
 * is the real predicate. "Please" taking "forward a copy…" as an NP is
 * this shape. Coordinated "notify and delete" is not — CONJ sits between.
 */
function usurpedByLaterVerb(candidate, peers, field) {
  if (!candidate?.verbHead || !field) return false;
  const spanTo = candidate.verbSpan?.to ?? candidate.verbHead.to;
  return (peers || []).some((other) => {
    if (other === candidate || !other.verbHead) return false;
    if (!(other.verbHead.from > candidate.verbHead.from)) return false;
    if (!(other.verbHead.from <= spanTo)) return false;
    if (conjBetween(field, candidate.verbHead.from, other.verbHead.from)) return false;
    const later = atomAt(field, other.verbHead);
    if (later && isLoad(later, field)) return false;
    return true;
  });
}

/**
 * Score one derivation-backed candidate. Null subject is a licensed
 * imperative, not missing evidence. Predicate span prefers a VP that
 * covers the sentence over a one-token lift. A later uncoordinated verb
 * head inside that span means this candidate swallowed someone else's
 * predicate.
 */
function isParallelBranch(candidate, peers, field) {
  if (!candidate?.verbHead || !field) return false;
  return (peers || []).some((other) => (
    other !== candidate
    && other.verbHead
    && other.verbHead.from < candidate.verbHead.from
    && conjBetween(field, other.verbHead.from, candidate.verbHead.from)
  ));
}

/**
 * `options.disableElectromagnetism` forces the scalar arm — the `fallback`
 * branch below, already written for the no-verb-atom case. It is an ABLATION
 * SWITCH, not a product mode: the electromagnetic path is what consumes
 * `wonCells`/`explained`, so turning it off is how you measure whether the
 * solar array earns the derivation ranking. Default off, matching
 * `disableAura` / `disableMacrophage`.
 */
export function scoreDerivationCandidate(candidate, field, bonds = BONDS, peers = [], options = {}) {
  if (!candidate?.verbHead) return 0;
  const scores = readingScores(field, bonds);
  const verbAtom = atomAt(field, candidate.verbHead);
  const subjectAtom = atomAt(field, candidate.subjectHead);
  const heads = candidate.subjectHead ? [subjectAtom, verbAtom] : [verbAtom];
  const organized = organizeDerivation(heads, field, { predicate: verbAtom });
  const verb = roleScoreAt(candidate.verbHead, VERBAL, scores);
  const subject = candidate.subjectHead
    ? roleScoreAt(candidate.subjectHead, NOMINAL, scores)
    : 0.7;
  let bondW = 0.85;
  if (candidate.lift) bondW = 0.85;
  else if (candidate.bond) {
    const kind = classifyBond(candidate.bond);
    if (kind === BOND_REACTION.CONSTRUCTIVE) bondW = 1.25;
    else if (kind === BOND_REACTION.RECURSIVE_PRESERVATIVE) bondW = 0.5;
    else bondW = 0.7;
  }
  const n = (field || []).length || 1;
  const span = candidate.verbSpan || candidate.verbHead;
  const predSpan = Math.max(1, (span.to ?? span.from) - span.from + 1);
  const coverage = 0.5 + 0.5 * (predSpan / n);
  const fallback = Math.sqrt(subject * verb) * bondW * coverage;
  // Neutral (organized ≈ induced, maybe small) is still a circuit.
  // Only a missing verb atom falls back to the type table.
  let score = (verbAtom && !options.disableElectromagnetism)
    ? Math.max(organized, 0) * bondW * coverage
    : fallback;
  if (usurpedByLaterVerb(candidate, peers, field)) score *= 0.4;
  if (isParallelBranch(candidate, peers, field)) score *= 0.55;
  return score;
}

/**
 * Pick among a packed (or classic) S node's derivations. Returns the
 * candidate — answer plus the heads that justified it — or null.
 */
/**
 * LEXICAL POSITION — the derivation score that survived measurement.
 *
 * Half predicate-span coverage, half verb earliness. That is the whole thing.
 *
 * WHY THIS REPLACED THE FIELD SCORE. Measured 2026-08-20 on decidable cases —
 * an `S` root whose candidates disagree about the ANSWER (deduped by
 * {subject, verb}) with gold reachable among them. Fitted on the treebank-gate
 * slice, held out on the rest of UD EWT dev and on all of EWT test:
 *
 *     chance                        43.4%    45.8%
 *     scoreDerivationCandidate      41.3%    41.7%   <- at or below chance
 *     this function                 65.2%    70.8%
 *
 * A four-tier score was built and rejected in the same run. Lexicalised valence
 * frames counted off EWT train (851 lemmas, 34,144 verb tokens) scored BELOW
 * chance alone on all three splits — 21.7 / 37.0 / 22.9 — and a weight sweep set
 * their coefficient to zero, after which a shuffled-frames control scored
 * byte-identical to the real frames. The mechanism: candidates inside one `S`
 * differ by WHICH WORD IS THE VERB, and a lemma's argument profile describes how
 * it behaves once it is the head, not whether it is one.
 *
 * SCOPE, HONESTLY. Only 48 of 2077 EWT test sentences are decidable at all; the
 * rest offer one answer or no reachable truth. This is worth under 1pp end to
 * end. It is here because it is six lines and beats chance, not because ranking
 * is where the parser is losing.
 *
 * NOT THE DEFAULT. Selected by `options.positionRanking === true`; see the note
 * on `pickResonantDerivation` for the three results that sent it behind a flag.
 *
 * @param {object} candidate from `derivationCandidates`
 * @param {Array} field the beacon field; `field.length` is the token count
 * @returns {number}
 */
export function scoreDerivationPosition(candidate, field) {
  if (!candidate?.verbHead) return 0;
  const n = Math.max((field || []).length, 1);
  const span = candidate.verbSpan || candidate.verbHead;
  const width = Math.max(1, (span.to ?? span.from) - (span.from ?? 0) + 1);
  const coverage = width / n;
  const earliness = 1 - ((candidate.verbHead.from ?? 0) / n);
  return Math.max(0, Math.min(1, 0.5 * coverage + 0.5 * earliness));
}

export function pickResonantDerivation(node, field, bonds = BONDS, options = {}) {
  const candidates = derivationCandidates(node);
  if (candidates.length === 0) return null;
  /**
   * DEFAULT REVERTED TO THE FIELD SCORE, 2026-08-20, SAME DAY IT WAS CHANGED.
   *
   * `scoreDerivationPosition` won on held-out contested cases (70.8% vs 41.7%)
   * under the frozen gate lexicon, which is what put it here. Under the PRODUCT
   * lexicon it is worth +6 on test and -5 on dev, and two further signals landed
   * against it:
   *
   *   1. On roots built by left-adjunction onto a clause it scores 26% against
   *      the field score's 30%, choosing a verb EARLIER than gold 8 times to 3.
   *   2. `tests/core/constellation/resonance-derivation.test.js` — which predates
   *      this change and encodes a plain fact about English — asserts the verb of
   *      `Please forward a copy` is `forward` and that `verbHead.from > 0`. The
   *      earliness term is `1 - from/n`, so it structurally prefers position 0
   *      and answers `please`. That is not a tuning miss; it is the wrong shape
   *      for fronted material and imperatives.
   *
   * So it goes behind a flag, like every other unearned change today, and the
   * incumbent keeps the default until position ranking is measured on
   * construction families rather than on an aggregate.
   */
  const score1 = (c) => (options.positionRanking === true
    ? scoreDerivationPosition(c, field)
    : scoreDerivationCandidate(c, field, bonds, candidates, options));
  let best = candidates[0];
  let bestScore = score1(best);
  for (let i = 1; i < candidates.length; i += 1) {
    const score = score1(candidates[i]);
    const earlier = (candidates[i].verbHead?.from ?? 99) < (best.verbHead?.from ?? 99);
    if (score > bestScore || (score === bestScore && earlier)) {
      best = candidates[i];
      bestScore = score;
    }
  }
  return best;
}
