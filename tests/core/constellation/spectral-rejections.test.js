import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CYCLOTRON_LAWS } from '../../../codex/core/constellation/bond-admission.js';
import { emitChloroplastLocalMeasurement } from '../../../codex/core/constellation/chloroplast-cyclotron-wire.js';
import {
  SPECTRAL_PROMOTIONS,
  SPECTRAL_REJECTION_CONTRACT,
  SPECTRAL_REJECTION_REASON,
  SPECTRAL_REJECTIONS,
  admitSpectralResponse,
  isRejectedSpectralPromotion,
  refuseSpectralPromotion,
  spectralRejection,
} from '../../../codex/core/constellation/spectral-rejections.js';

const ROOT = path.resolve('.');

describe('spectral rejection ledger', () => {
  it('names exactly the three dead color promotions', () => {
    expect(SPECTRAL_REJECTION_CONTRACT).toBe('PB-SPECTRAL-REJECTION-LEDGER-v1');
    expect(SPECTRAL_REJECTIONS.map((row) => row.promotion)).toEqual([
      SPECTRAL_PROMOTIONS.PAINT,
      SPECTRAL_PROMOTIONS.LOCK_SPLIT,
      SPECTRAL_PROMOTIONS.PREDICT,
    ]);
    expect(new Set(SPECTRAL_REJECTIONS.map((row) => row.id)).size).toBe(3);
  });

  it('binds each death to a cyclotron law and a sealed evidence checksum', () => {
    for (const row of SPECTRAL_REJECTIONS) {
      expect(CYCLOTRON_LAWS[row.law]).toEqual(expect.any(String));
      expect(row.checksum).toMatch(/^[a-z0-9-]+:[a-f0-9]{64}$/);
      expect(row.fired.length).toBeGreaterThan(0);
      expect(['FAILS', 'DEAD']).toContain(row.verdict);
      const evidence = JSON.parse(readFileSync(path.join(ROOT, row.evidence), 'utf8'));
      expect(evidence.checksum).toBe(row.checksum);
      expect(evidence.verdict.startsWith(row.verdict)).toBe(true);
      for (const flag of row.fired) {
        expect(evidence.falsifiers[flag], flag).toBe(true);
      }
      for (const flag of row.survived) {
        expect(evidence.falsifiers[flag], flag).toBe(false);
      }
    }
  });

  it('refuses known promotions and abstains on unlabeled inspect', () => {
    expect(refuseSpectralPromotion(null).ok).toBe(true);
    expect(refuseSpectralPromotion('paint')).toMatchObject({
      ok: false,
      reason: SPECTRAL_REJECTION_REASON,
      rejection: 'spectral-paint',
      law: CYCLOTRON_LAWS.COLOR_IS_NOT_A_RULE,
    });
    expect(refuseSpectralPromotion('lock-split').ok).toBe(false);
    expect(refuseSpectralPromotion('predict').ok).toBe(false);
    expect(refuseSpectralPromotion('some-future-probe').ok).toBe(true);
    expect(isRejectedSpectralPromotion('paint')).toBe(true);
    expect(isRejectedSpectralPromotion('infrared-mask')).toBe(false);
    expect(spectralRejection('paint').epitaph).toMatch(/gold\/blue/);
  });

  it('drops a tagged paint vector from chloroplast telemetry and keeps an unlabeled one', () => {
    expect(admitSpectralResponse({ promotion: 'paint', carbon: 1 })).toBeNull();
    expect(admitSpectralResponse({ kind: 'predict', bins: [1, 0] })).toBeNull();
    const unlabeled = { rootReachability: 1, headDivergence: 0 };
    expect(admitSpectralResponse(unlabeled)).toBe(unlabeled);

    const painted = emitChloroplastLocalMeasurement({
      from: 0,
      to: 0,
      nucleus: { aura: 'aura-test' },
      chloroplast: { irradiance: 1, voltage: 1, cells: [] },
      spectralVector: { promotion: 'lock-split', omega: 1.2 },
    });
    expect(painted.spectral_response).toBeNull();

    const probe = emitChloroplastLocalMeasurement({
      from: 0,
      to: 0,
      nucleus: { aura: 'aura-test' },
      chloroplast: { irradiance: 1, voltage: 1, cells: [] },
      spectralVector: unlabeled,
    });
    expect(probe.spectral_response).toEqual(unlabeled);
  });
});
