/**
 * UNKNOWN CAPABILITY MARKERS
 *
 * Known atoms already call. Silent and atomless atoms already hear
 * (irradiance, induced potential) and cannot answer: chlorophyll only
 * absorbs through the bond table.
 *
 * This module gives the unknown an identifiable epitope — a capability
 * marker — from table-blind evidence:
 *
 *   - did a call arrive,
 *   - from which side,
 *   - does the KNOWN caller (or a silent typed unknown) seek in that direction.
 *
 * SEEKING is valence on the known side, not a pair table. There is no
 * Grimoire lookup here. A marker is not a bond. Annotate-only.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/unknown-capability-marker
 */

import { sealNucleus } from './atom-nucleus.js';
import { chloroplastIngest, emitLight } from './resonance-beacon.js';

export const UNKNOWN_CAPABILITY_CONTRACT = 'PB-UNKNOWN-CAPABILITY-MARKER-v1';

/**
 * Known-side vacancies. Direction the type looks for a partner.
 * Not a construction. Not a result type.
 */
export const SEEKING = Object.freeze({
  DET: 'right',
  P: 'right',
  TO: 'right',
  AUX: 'right',
  MODAL: 'right',
  COP: 'right',
  SUB: 'right',
  POSS: 'right',
  V: 'right',
});

function fnv1aHex(text) {
  let hash = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function isLoud(atom) {
  return (atom?.ingested?.reactions?.length || 0) > 0;
}

function seekingOf(type) {
  return SEEKING[type] || null;
}

function faces(seekerFrom, direction, targetFrom) {
  if (direction === 'right') return seekerFrom < targetFrom;
  if (direction === 'left') return seekerFrom > targetFrom;
  return false;
}

function indexEmitters(field) {
  const byAura = new Map();
  for (const slot of field || []) {
    for (const atom of slot.atoms || []) {
      const aura = atom.light?.aura || atom.nucleus?.aura;
      if (aura) byAura.set(aura, atom);
    }
  }
  return byAura;
}

function lightsOf(field) {
  const lights = [];
  for (const slot of field || []) {
    for (const atom of slot.atoms || []) {
      const light = atom.light || (atom.nucleus?.aura ? emitLight(atom) : null);
      if (light) lights.push(light);
    }
  }
  return lights;
}

function arrivalsOf(atom) {
  const cells = atom?.chloroplast?.cells || [];
  if (cells.length) {
    return cells.map((cell) => ({
      aura: cell.aura,
      from: cell.from,
      to: cell.to ?? cell.from,
      irradiance: Number(cell.irradiance ?? cell.voltage ?? 0),
    }));
  }
  return [];
}

/**
 * A typeless body so an empty slot can ingest a call.
 * No POS. No bond privilege.
 */
export function seedUnknownReceiver(token, index) {
  const lemma = String(token ?? '').toLowerCase();
  const nucleus = sealNucleus({
    kind: 'unknown',
    type: null,
    from: index,
    to: index,
    lemmas: lemma ? [lemma] : [],
    headLemmas: lemma ? [lemma] : [],
  });
  return {
    type: null,
    unknown: true,
    from: index,
    to: index,
    token,
    nucleus,
    ingested: { energy: 0, reactions: Object.freeze([]) },
    chloroplast: { irradiance: 0, voltage: 0, cells: Object.freeze([]) },
  };
}

function epitopeId(tags) {
  return `cap1:${fnv1aHex([...tags].sort().join('|'))}`;
}

/**
 * Paint capability markers on one unknown (silent typed, or typeless seed).
 * Never consults the bond table.
 */
export function markUnknownReceiver(atom, field) {
  const from = atom?.from ?? 0;
  const arrivals = arrivalsOf(atom);
  const irradiance = Number(atom?.chloroplast?.irradiance
    ?? arrivals.reduce((s, a) => s + (a.irradiance || 0), 0));
  const emitters = indexEmitters(field);
  const tags = [];
  const callers = [];

  if (!(irradiance > 0) && arrivals.every((a) => !(a.irradiance > 0))) {
    const tagsDeaf = Object.freeze(['deaf']);
    return Object.freeze({
      id: epitopeId(tagsDeaf),
      tags: tagsDeaf,
      callers: Object.freeze([]),
      capable: false,
      capability: 0,
      reason: 'deaf',
    });
  }

  tags.push('hears');
  let heardSeeking = false;

  for (const arrival of arrivals) {
    if (!((arrival.irradiance || 0) > 0)) continue;
    const emitter = emitters.get(arrival.aura);
    const dist = Math.abs(from - (arrival.from ?? from));
    if (dist === 1 && arrival.from < from) tags.push('left-socket');
    if (dist === 1 && arrival.from > from) tags.push('right-socket');
    if (!emitter) continue;
    const seek = seekingOf(emitter.type);
    const knownFaces = seek && dist === 1 && faces(emitter.from, seek, from);
    const selfSeek = seekingOf(atom.type);
    const unknownFaces = selfSeek && dist === 1 && faces(from, selfSeek, emitter.from);
    if (knownFaces) {
      const tag = `answer:${emitter.type}:${seek}`;
      tags.push(tag);
      heardSeeking = true;
      callers.push(Object.freeze({
        aura: arrival.aura,
        from: arrival.from,
        type: emitter.type,
        seeking: seek,
        role: 'known-seeks',
      }));
    } else if (unknownFaces) {
      const tag = `answer:${atom.type}:${selfSeek}`;
      tags.push(tag);
      heardSeeking = true;
      callers.push(Object.freeze({
        aura: arrival.aura,
        from: arrival.from,
        type: emitter.type,
        seeking: selfSeek,
        role: 'unknown-seeks',
      }));
    }
  }

  const unique = [...new Set(tags)];
  return Object.freeze({
    id: epitopeId(unique),
    tags: Object.freeze(unique),
    callers: Object.freeze(callers),
    capable: heardSeeking,
    capability: heardSeeking ? 1 : 0,
    reason: heardSeeking ? 'heard-seeking-call' : 'no-seeking-neighbor',
  });
}

function ingestSeed(seed, field) {
  const ingested = chloroplastIngest(seed, lightsOf(field));
  seed.chloroplast = {
    irradiance: ingested.irradiance,
    voltage: 0,
    cells: ingested.arrivals.map((row) => Object.freeze({
      aura: row.aura,
      from: row.from,
      to: row.to,
      irradiance: row.irradiance,
      voltage: 0,
    })),
  };
  return seed;
}

/**
 * Annotate a finished chart. Seeds atomless slots, marks silent atoms.
 * Does not admit a pair and does not add molecules.
 */
export function annotateUnknownCapabilities(chart) {
  const source = chart?.field || [];
  let seeded = 0;
  let silent = 0;
  let capable = 0;
  const unknowns = [];
  const field = source.map((slot) => {
    const atoms = slot.atoms || [];
    const next = {
      token: slot.token,
      index: slot.index,
      types: slot.types,
      atoms,
      unknownReceiver: null,
    };
    if (atoms.length === 0) {
      const seed = ingestSeed(seedUnknownReceiver(slot.token, slot.index), source);
      seed.capability = markUnknownReceiver(seed, source);
      next.unknownReceiver = seed;
      seeded += 1;
      if (seed.capability.capable) capable += 1;
      unknowns.push(seed);
      return next;
    }
    for (const atom of atoms) {
      if (isLoud(atom)) continue;
      atom.capability = markUnknownReceiver(atom, source);
      silent += 1;
      if (atom.capability.capable) capable += 1;
      unknowns.push(atom);
    }
    return next;
  });

  return Object.freeze({
    contract: UNKNOWN_CAPABILITY_CONTRACT,
    field: Object.freeze(field),
    unknowns: Object.freeze(unknowns),
    seeded,
    silent,
    capable,
  });
}
