/**
 * PHENOTYPE HARNESS — dev-only controlled-mutation target.
 *
 * The orthogonality matrix (spec §3.4) needs to move exactly one physical
 * property at a time. Real app pages cannot do that: changing a button's size
 * also changes its text wrapping, its ink, and its neighbours. This harness
 * exposes each physical input as its own query parameter so a single mutation
 * really is single.
 *
 * This is NOT circular. The harness controls PHYSICAL properties (px, colours,
 * z-index, ink fraction); the quantizers derive TERMS from the rendered result.
 * If density's denominator were the bounding box, mutating `radius` alone would
 * still flip the density block — and the matrix would catch it.
 *
 * The ink is painted as a FRACTION OF THE CLIPPED REGION so that resizing the
 * target does not change its ink ratio. A size mutation that also changed
 * density would be the harness's fault, not the quantizer's.
 */

import React from 'react';
import { useSearchParams } from 'react-router-dom';

const NOTCH_CLIP = 'polygon(0 0, 100% 0, 100% 80%, 0 100%)';

export default function PhenotypeHarness() {
  const [params] = useSearchParams();

  const bg = params.get('bg') ?? '#000000';
  const fg = params.get('fg') ?? '#ff0000';
  const width = Number(params.get('w') ?? 200);
  const height = Number(params.get('h') ?? 100);
  const radius = Number(params.get('radius') ?? 0);
  const z = Number(params.get('z') ?? 0);
  const ink = Math.min(Math.max(Number(params.get('ink') ?? 0.2), 0), 1);
  const clip = params.get('clip') ?? 'none';

  // Ink is drawn as a centred bar covering `ink` of the target's area, so the
  // painted FRACTION is invariant under width/height changes.
  const inkHeight = height * ink;

  return (
    <div
      id="phenotype-stage"
      style={{
        position: 'fixed',
        inset: 0,
        margin: 0,
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        id="phenotype-target"
        style={{
          position: 'relative',
          width: `${width}px`,
          height: `${height}px`,
          borderRadius: `${radius}px`,
          zIndex: z,
          background: bg,
          color: fg,
          clipPath: clip === 'notch' ? NOTCH_CLIP : 'none',
          overflow: 'hidden',
        }}
      >
        <div
          id="phenotype-ink"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${(height - inkHeight) / 2}px`,
            height: `${inkHeight}px`,
            background: fg,
          }}
        />
      </div>
    </div>
  );
}
