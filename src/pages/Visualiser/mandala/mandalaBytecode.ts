/**
 * Mandala mathematical bytecode — BPM + seed → deterministic motion IR.
 * No Math.random / Date.now. No FFT. VAELRIX determinism contract.
 */

export const MANDALA_SCHEMA = 'scholomance.mandala.v1' as const;

export type MandalaOp =
  | { op: 'RING'; k: number; rate: number; pulse: number; phase0: number }
  | { op: 'POLY'; sides: number; rate: number; phase: number; scale: number; pulse: number }
  | { op: 'CORE'; pulse: number; phase0: number };

export type MandalaProgram = {
  schemaVersion: typeof MANDALA_SCHEMA;
  seed: number;
  bpm: number;
  ops: MandalaOp[];
};

export type MandalaPose = {
  rings: { rotDeg: number; scale: number }[];
  polys: { rotDeg: number; scale: number; sides: number }[];
  coreScale: number;
};

const TWO_PI = Math.PI * 2;

/** Stable u01 in [0,1) from seed+salt — no Math.random. */
function u01(seed: number, salt: number): number {
  let h = (seed >>> 0) ^ Math.imul(salt >>> 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

export function compileMandalaProgram(seed: number, bpm: number): MandalaProgram {
  const safeBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 90;
  const s = (seed >>> 0) || 1;
  const ops: MandalaOp[] = [];

  for (let k = 1; k <= 3; k += 1) {
    ops.push({
      op: 'RING',
      k,
      rate: 0.04 + u01(s, k) * 0.08,
      pulse: 0.02 + u01(s, k + 10) * 0.04,
      phase0: u01(s, k + 20) * TWO_PI,
    });
  }

  ops.push({
    op: 'POLY',
    sides: 3,
    rate: 0.1 + u01(s, 40) * 0.06,
    phase: u01(s, 41) * TWO_PI,
    scale: 0.42,
    pulse: 0.04 + u01(s, 42) * 0.03,
  });
  ops.push({
    op: 'POLY',
    sides: 3,
    rate: -(0.1 + u01(s, 43) * 0.06),
    phase: u01(s, 44) * TWO_PI + Math.PI,
    scale: 0.42,
    pulse: 0.04 + u01(s, 45) * 0.03,
  });
  ops.push({
    op: 'CORE',
    pulse: 0.06 + u01(s, 50) * 0.05,
    phase0: u01(s, 51) * TWO_PI,
  });

  return {
    schemaVersion: MANDALA_SCHEMA,
    seed: s,
    bpm: safeBpm,
    ops,
  };
}

export function omega(bpm: number): number {
  return TWO_PI * (bpm / 60);
}

export function evalMandala(program: MandalaProgram, tSeconds: number): MandalaPose {
  const w = omega(program.bpm);
  const t = Number.isFinite(tSeconds) ? tSeconds : 0;
  const rings: MandalaPose['rings'] = [];
  const polys: MandalaPose['polys'] = [];
  let coreScale = 1;

  for (const op of program.ops) {
    if (op.op === 'RING') {
      const rot = op.phase0 + w * t * op.rate;
      const scale = 1 + op.pulse * Math.sin(w * t + op.phase0);
      rings.push({ rotDeg: (rot * 180) / Math.PI, scale });
    } else if (op.op === 'POLY') {
      const rot = op.phase + w * t * op.rate;
      const scale = op.scale * (1 + op.pulse * Math.sin(w * t + op.phase));
      polys.push({ rotDeg: (rot * 180) / Math.PI, scale, sides: op.sides });
    } else if (op.op === 'CORE') {
      coreScale = 1 + op.pulse * Math.sin(w * t + op.phase0);
    }
  }

  return { rings, polys, coreScale };
}
