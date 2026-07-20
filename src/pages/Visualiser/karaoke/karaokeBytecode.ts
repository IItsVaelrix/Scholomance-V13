/**
 * Karaoke mathematical bytecode — BPM + seed → deterministic lyric motion IR.
 * No Math.random / Date.now. VAELRIX determinism contract.
 */

export const KARAOKE_SCHEMA = 'scholomance.karaoke.v1' as const;

export type KaraokeOp =
  | { op: 'LINE_PULSE'; rate: number; pulse: number; phase0: number }
  | { op: 'WORD_PULSE'; rate: number; pulse: number; phase0: number }
  | { op: 'WORD_GLOW'; rate: number; pulse: number; phase0: number };

export type KaraokeProgram = {
  schemaVersion: typeof KARAOKE_SCHEMA;
  seed: number;
  bpm: number;
  ops: KaraokeOp[];
};

export type KaraokePose = {
  linePulse: number;
  wordScale: number;
  wordGlow: number;
};

const TWO_PI = Math.PI * 2;

/** Stable u01 in [0,1) from seed+salt — no Math.random. */
function u01(seed: number, salt: number): number {
  let h = (seed >>> 0) ^ Math.imul(salt >>> 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

export function compileKaraokeProgram(seed: number, bpm: number): KaraokeProgram {
  const safeBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 90;
  const s = (seed >>> 0) || 1;

  return {
    schemaVersion: KARAOKE_SCHEMA,
    seed: s,
    bpm: safeBpm,
    ops: [
      {
        op: 'LINE_PULSE',
        rate: 0.5 + u01(s, 1) * 0.5,
        pulse: 0.04 + u01(s, 2) * 0.06,
        phase0: u01(s, 3) * TWO_PI,
      },
      {
        op: 'WORD_PULSE',
        rate: 1 + u01(s, 10) * 0.5,
        pulse: 0.03 + u01(s, 11) * 0.05,
        phase0: u01(s, 12) * TWO_PI,
      },
      {
        op: 'WORD_GLOW',
        rate: 0.75 + u01(s, 20) * 0.5,
        pulse: 0.2 + u01(s, 21) * 0.25,
        phase0: u01(s, 22) * TWO_PI,
      },
    ],
  };
}

export function omega(bpm: number): number {
  return TWO_PI * (bpm / 60);
}

export function evalKaraoke(program: KaraokeProgram, tSeconds: number): KaraokePose {
  const w = omega(program.bpm);
  const t = Number.isFinite(tSeconds) ? tSeconds : 0;
  let linePulse = 1;
  let wordScale = 1;
  let wordGlow = 0.5;

  for (const op of program.ops) {
    if (op.op === 'LINE_PULSE') {
      linePulse = 1 + op.pulse * Math.sin(w * t * op.rate + op.phase0);
    } else if (op.op === 'WORD_PULSE') {
      wordScale = 1 + op.pulse * Math.sin(w * t * op.rate + op.phase0);
    } else if (op.op === 'WORD_GLOW') {
      const raw = 0.5 + 0.5 * Math.sin(w * t * op.rate + op.phase0);
      wordGlow = Math.min(1, Math.max(0, raw * (0.55 + op.pulse * 0.45)));
    }
  }

  return { linePulse, wordScale, wordGlow };
}
