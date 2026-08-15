// @vitest-environment node
/**
 * THE THREE ORGANS OF THE LIGHT PATH.
 *
 *   chloroplast INGESTS   — what arrived. Geometry only.
 *   aura        REGULATES — who sent it, and may I react to them.
 *   chlorophyll ABSORBS   — what the pigment makes of it. Type lives here.
 *
 * The split is only worth having if each organ can be convicted alone, so
 * every test below exercises exactly one of them. The composition test proves
 * `photosynthesize` adds no logic of its own.
 */
import { describe, expect, it } from 'vitest';
import {
  emitLight,
  chlorophyll,
  chloroplastIngest,
  auraRegulate,
  chlorophyllAbsorb,
  photosynthesize,
} from '../../../codex/core/constellation/resonance-beacon.js';
import { leafNucleus } from '../../../codex/core/constellation/atom-nucleus.js';

const atom = (type, index, token = 'x') => ({
  type, from: index, to: index, token, nucleus: leafNucleus(token, type, index),
});

const fieldOf = (...atoms) => {
  const lights = atoms.map(emitLight);
  const emittersByAura = new Map(atoms.map((a, i) => [lights[i].aura, a]));
  return { lights, emittersByAura };
};

describe('CHLOROPLAST INGESTS — what arrived', () => {
  it('refuses light emitted from its own span', () => {
    const receiver = atom('N', 1);
    const { lights } = fieldOf(atom('DET', 0), receiver, atom('V', 2));
    const ingested = chloroplastIngest(receiver, lights);

    expect(ingested.arrivals).toHaveLength(2);
    expect(ingested.arrivals.map((a) => a.from)).toEqual([0, 2]);
    expect(ingested.arrivals.some((a) => a.from === receiver.from)).toBe(false);
  });

  it('carries distance on the arrival, because attenuation belongs to the journey', () => {
    const receiver = atom('N', 3);
    const { lights } = fieldOf(atom('DET', 0), receiver);
    const [arrival] = chloroplastIngest(receiver, lights).arrivals;

    expect(arrival.distance).toBe(3);
    expect(arrival.irradiance).toBe(lights[0].energy);
  });

  it('sums irradiance over everything that reached the panel', () => {
    const receiver = atom('N', 1);
    const { lights } = fieldOf(atom('DET', 0), receiver, atom('V', 2), atom('ADJ', 3));
    const ingested = chloroplastIngest(receiver, lights);

    const expected = lights
      .filter((l) => l.from !== receiver.from)
      .reduce((sum, l) => sum + l.energy, 0);
    expect(ingested.irradiance).toBeCloseTo(expected, 12);
  });

  it('CONSULTS NO TYPE — the law. Changing the receiver type changes nothing ingested', () => {
    // Ingestion is geometry. If a type can move it, the photon is carrying
    // meaning and the whole meaning-agnostic-light law is broken.
    const { lights } = fieldOf(atom('DET', 0), atom('N', 1), atom('V', 2));
    const asNoun = chloroplastIngest(atom('N', 1), lights);
    const asVerb = chloroplastIngest(atom('V', 1), lights);
    const asNonsense = chloroplastIngest(atom('ZZZ_NOT_A_CATEGORY', 1), lights);

    expect(asVerb).toEqual(asNoun);
    expect(asNonsense).toEqual(asNoun);
  });
});

describe('AURA REGULATES — who sent it, and may I react', () => {
  it('permits a registered sender and resolves it', () => {
    const emitter = atom('DET', 0);
    const receiver = atom('N', 1);
    const { lights, emittersByAura } = fieldOf(emitter, receiver);
    const [arrival] = chloroplastIngest(receiver, lights).arrivals;

    const gate = auraRegulate(receiver, arrival, emittersByAura);
    expect(gate.permitted).toBe(true);
    expect(gate.emitter).toBe(emitter);
    expect(gate.reason).toBeNull();
  });

  it('refuses an unregistered aura and names the reason', () => {
    const receiver = atom('N', 1);
    const { lights } = fieldOf(atom('DET', 0), receiver);
    const [arrival] = chloroplastIngest(receiver, lights).arrivals;

    const gate = auraRegulate(receiver, arrival, new Map());
    expect(gate.permitted).toBe(false);
    expect(gate.reason).toBe('unregistered-aura');
    expect(gate.emitter).toBeNull();
    expect(gate.damping).toBe(0);
  });

  it('exposes damping as an inert dial at 1, so turning regulation on is measurable', () => {
    // The seat exists and does nothing today. That is deliberate: a later
    // change to damping is a one-line, one-variable experiment rather than a
    // new mechanism appearing inside the absorption maths.
    const emitter = atom('DET', 0);
    const receiver = atom('N', 1);
    const { lights, emittersByAura } = fieldOf(emitter, receiver);
    const [arrival] = chloroplastIngest(receiver, lights).arrivals;

    expect(auraRegulate(receiver, arrival, emittersByAura).damping).toBe(1);
  });
});

describe('CHLOROPHYLL ABSORBS — what the pigment makes of it', () => {
  it('absorbs when the pigment couples with the sender', () => {
    const emitter = atom('DET', 0);
    const receiver = atom('N', 1);
    const { lights, emittersByAura } = fieldOf(emitter, receiver);
    const [arrival] = chloroplastIngest(receiver, lights).arrivals;
    const gate = auraRegulate(receiver, arrival, emittersByAura);

    const absorption = chlorophyllAbsorb(chlorophyll(receiver), arrival, gate.emitter, undefined, gate.damping);
    expect(absorption.absorbed).toBe(true);
    expect(absorption.coupling).toBeGreaterThan(0);
    expect(absorption.voltage).toBeGreaterThan(0);
    expect(absorption.order).toBe('emitter-left');
  });

  it('TYPE LIVES HERE — same arrival, different pigment, different answer', () => {
    // The one place a type may change the outcome. If this test can be made to
    // pass with the type removed, absorption has stopped doing its job.
    const emitter = atom('DET', 0);
    const { lights, emittersByAura } = fieldOf(emitter, atom('N', 1));
    const [arrival] = chloroplastIngest(atom('N', 1), lights).arrivals;
    const gate = auraRegulate(atom('N', 1), arrival, emittersByAura);

    const asNoun = chlorophyllAbsorb(chlorophyll(atom('N', 1)), arrival, gate.emitter, undefined, 1);
    const asNonsense = chlorophyllAbsorb(chlorophyll(atom('ZZZ_NOT_A_CATEGORY', 1)), arrival, gate.emitter, undefined, 1);

    expect(asNoun.absorbed).toBe(true);
    expect(asNonsense.absorbed).toBe(false);
    expect(asNonsense.voltage).toBe(0);
  });

  it('does not fire a reverse-order bond', () => {
    // DET+N->NP is licensed; N+DET is not. Put the determiner on the RIGHT and
    // the same two types must not absorb.
    const det = atom('DET', 2);
    const receiver = atom('N', 1);
    const { lights, emittersByAura } = fieldOf(receiver, det);
    const arrival = chloroplastIngest(receiver, lights).arrivals.find((a) => a.from === 2);
    const gate = auraRegulate(receiver, arrival, emittersByAura);

    const absorption = chlorophyllAbsorb(chlorophyll(receiver), arrival, gate.emitter, undefined, gate.damping);
    expect(absorption.order).toBe('emitter-right');
    expect(absorption.absorbed).toBe(false);
  });

  it('scales voltage with the regulator damping', () => {
    const emitter = atom('DET', 0);
    const receiver = atom('N', 1);
    const { lights, emittersByAura } = fieldOf(emitter, receiver);
    const [arrival] = chloroplastIngest(receiver, lights).arrivals;
    const gate = auraRegulate(receiver, arrival, emittersByAura);
    const pigment = chlorophyll(receiver);

    const full = chlorophyllAbsorb(pigment, arrival, gate.emitter, undefined, 1);
    const half = chlorophyllAbsorb(pigment, arrival, gate.emitter, undefined, 0.5);
    expect(half.voltage).toBeCloseTo(full.voltage / 2, 12);
  });
});

describe('photosynthesize is the composition and holds no logic of its own', () => {
  it('equals ingest -> regulate -> absorb, run by hand', () => {
    const atoms = [atom('DET', 0), atom('N', 1), atom('V', 2), atom('ADJ', 3)];
    const receiver = atoms[1];
    const { lights, emittersByAura } = fieldOf(...atoms);

    const byHand = [];
    let energy = 0;
    for (const arrival of chloroplastIngest(receiver, lights).arrivals) {
      const gate = auraRegulate(receiver, arrival, emittersByAura);
      if (!gate.permitted) continue;
      const absorption = chlorophyllAbsorb(chlorophyll(receiver), arrival, gate.emitter, undefined, gate.damping);
      if (!absorption.absorbed) continue;
      byHand.push({ aura: arrival.aura, from: arrival.from, energy: absorption.voltage });
      energy += absorption.voltage;
    }

    const produced = photosynthesize(receiver, lights, emittersByAura);
    expect(produced.energy).toBe(energy);
    expect(produced.reactions.map((r) => ({ aura: r.aura, from: r.from, energy: r.energy })))
      .toEqual(byHand);
  });

  it('records a non-coupling in the sink with the order that refused it', () => {
    const atoms = [atom('N', 0), atom('DET', 1)];
    const receiver = atoms[0];
    const { lights, emittersByAura } = fieldOf(...atoms);
    const sink = [];

    photosynthesize(receiver, lights, emittersByAura, undefined, sink);
    expect(sink.length).toBeGreaterThan(0);
    expect(sink[0]).toMatchObject({ receiverType: 'N', emitterType: 'DET', order: 'emitter-right' });
  });
});
