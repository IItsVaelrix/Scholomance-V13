/**
 * color-law — the sRGB transfer function, owned in exactly one place.
 *
 * Both consumers apply the SAME declared linear values: Blender through a
 * FLOAT_COLOR attribute, the Remotion canvas through its pixel buffer. That is
 * what allows the COLOR_LAW receipt slot to agree across engines honestly.
 *
 * The addon must never compute this. palette.py's hex_to_linear violated the
 * bridge's founding rule -- the consumer applies values and reports what it
 * applied -- and is deleted as part of this phase.
 *
 * samples = 1 is part of the EXACT contract, not a render preference. Measured
 * on Blender 5.2.0: 6/6 specimens round-trip byte-exactly at 1 sample, 1/6 at
 * 16, 0/6 at 64 with a Gaussian filter. With one sample per pixel there is
 * nothing to average, so the pixel filter only chooses where that sample lands
 * and sample 0 of a symmetric filter lands at the centre.
 */

export const COLOR_LAW_TRANSFER = 'sRGB-IEC-61966-2-1';

/** IEC 61966-2-1 knee points. Named so the branch is not a magic number. */
const SRGB_KNEE = 0.04045;
const LINEAR_KNEE = 0.0031308;
const SLOPE = 12.92;

export function srgbToLinear(c) {
  return c <= SRGB_KNEE ? c / SLOPE : ((c + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(c) {
  if (c <= 0) return 0;
  return c <= LINEAR_KNEE ? c * SLOPE : 1.055 * c ** (1 / 2.4) - 0.055;
}

export function hexIntToLinearTriple(hexInt) {
  return [
    srgbToLinear(((hexInt >> 16) & 0xFF) / 255),
    srgbToLinear(((hexInt >> 8) & 0xFF) / 255),
    srgbToLinear((hexInt & 0xFF) / 255),
  ];
}

export function linearTripleToHexInt([r, g, b]) {
  const q = (c) => Math.min(255, Math.max(0, Math.round(linearToSrgb(c) * 255)));
  return (q(r) << 16) | (q(g) << 8) | q(b);
}

/**
 * The EXACT policy contract. Every field is a precondition of the byte-exact
 * round-trip falsifier; changing any of them invalidates it.
 */
export const COLOR_LAW_EXACT = Object.freeze({
  policy: 'EXACT',
  transfer: COLOR_LAW_TRANSFER,
  viewTransform: 'Standard',
  look: 'None',
  samples: 1,
});
