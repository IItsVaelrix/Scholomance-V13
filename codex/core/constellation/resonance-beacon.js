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
 * Chlorophyll is receiver-local and reactive. The chloroplast is a
 * solar-panel array: one cell per incoming light. Irradiance is flux.
 * Voltage is the reaction. The consumer compares cells. The reaction —
 * not the photon — is the informative state.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/resonance-beacon
 */

import { atomsFor, BONDS, LIFTS } from './compose.js';
import { BOND_REACTION, classifyBond } from './bond-kind.js';
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
 * Solar-panel array. One cell per incoming light. Every pigment at a
 * span sees the same irradiance on that cell; voltage is the reaction.
 * The array itself has no type — type lives on the pigment.
 */
export function chloroplast(atom, lights = []) {
  const pigment = atom.chlorophyll || chlorophyll(atom);
  const ingested = atom.ingested || { energy: 0, reactions: Object.freeze([]) };
  const byAura = new Map((ingested.reactions || []).map((row) => [row.aura, row]));
  const cells = [];
  let irradiance = 0;
  const incoming = (lights && lights.length)
    ? lights.filter((light) => light.from !== atom.from)
    : (ingested.reactions || []).map((row) => ({
      aura: row.aura,
      from: row.from,
      to: row.from,
      energy: row.energy,
    }));
  for (const light of incoming) {
    const flux = Number(light.energy) || 0;
    irradiance += flux;
    const reaction = byAura.get(light.aura);
    cells.push(Object.freeze({
      aura: light.aura,
      from: light.from,
      to: light.to ?? light.from,
      irradiance: flux,
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
 * Photosynthesis: chlorophyll reacts to meaning-agnostic light.
 * The photon has no type. Geometry (which side the emitter occupies)
 * plus the looked-up emitter are the data. Reverse-order bonds do not fire.
 * The product (`reactions`, `energy`) is the informative state.
 */
export function photosynthesize(atom, lights, emittersByAura, bonds = BONDS) {
  const pigment = chlorophyll(atom);
  const reactions = [];
  let energy = 0;
  for (const light of lights || []) {
    if (light.from === atom.from) continue;
    const emitter = emittersByAura && emittersByAura.get(light.aura);
    if (!emitter) continue;
    const coupling = light.from < (atom.from ?? 0)
      ? directedCoupling(emitter.type, pigment.type, bonds)
      : directedCoupling(pigment.type, emitter.type, bonds);
    if (!(coupling > 0)) continue;
    const distance = Math.abs((atom.from ?? 0) - (light.from ?? 0));
    const gained = light.energy * coupling / (1 + distance);
    reactions.push(Object.freeze({
      aura: light.aura,
      from: light.from,
      energy: gained,
    }));
    energy += gained;
  }
  return Object.freeze({ energy, reactions: Object.freeze(reactions) });
}

export function illuminateField(field, bonds = BONDS) {
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
      atom.ingested = photosynthesize(atom, lights, emittersByAura, bonds);
      atom.chloroplast = chloroplast(atom, lights);
    }
  }
  return stampCharges(field);
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
export function fieldFromAtoms(atoms, tokens, bonds = BONDS) {
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
  return illuminateField(field, bonds);
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
 * One candidate per derivation path that can project an answer, with the
 * subject/verb *heads* still carrying from/to/type. PUNCT absorb and
 * matrix-preserving adjunction recurse, matching projectAnswers.
 */
export function derivationCandidates(node, visiting = new Set(), memo = new Map()) {
  if (!node || node.type !== 'S' || visiting.has(node)) return [];
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
    if (headIdx === 0 && d.left.type === 'S') {
      out.push(...derivationCandidates(d.left, visiting, memo));
      continue;
    }
    const subjects = headedAtoms(d.left, memo);
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

export function scoreDerivationCandidate(candidate, field, bonds = BONDS, peers = []) {
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
  let score = verbAtom
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
export function pickResonantDerivation(node, field, bonds = BONDS) {
  const candidates = derivationCandidates(node);
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestScore = scoreDerivationCandidate(best, field, bonds, candidates);
  for (let i = 1; i < candidates.length; i += 1) {
    const score = scoreDerivationCandidate(candidates[i], field, bonds, candidates);
    const earlier = (candidates[i].verbHead?.from ?? 99) < (best.verbHead?.from ?? 99);
    if (score > bestScore || (score === bestScore && earlier)) {
      best = candidates[i];
      bestScore = score;
    }
  }
  return best;
}
