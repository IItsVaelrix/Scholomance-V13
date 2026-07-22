/**
 * PHENOTYPE — isolation contracts (spec §3.3).
 *
 * Orthogonality is not a property the axes have; it is a property the
 * decompiler CONSTRUCTS by defining each axis from a deliberately isolated
 * source with a deliberately chosen normalization. An axis without a declared
 * contract cannot be sealed into a profile.
 */

export type PhenotypeAxis =
  | 'luminance'
  | 'stacking'
  | 'size'
  | 'chromaticity'
  | 'shape'
  | 'density';

/** Slot order. Slot 0 is the profile discriminator; slot 7 is motion (not live in v1). */
export const AXIS_SLOTS: Readonly<Record<PhenotypeAxis, number>> = Object.freeze({
  luminance: 1,
  stacking: 2,
  size: 3,
  chromaticity: 4,
  shape: 5,
  density: 6,
});

export const LIVE_AXES: readonly PhenotypeAxis[] = Object.freeze([
  'luminance',
  'stacking',
  'size',
  'chromaticity',
  'shape',
  'density',
]);

export type IsolationContract = {
  source: string;
  normalization: string;
  pausedState: string;
};

export const ISOLATION: Readonly<Record<PhenotypeAxis, IsolationContract>> = Object.freeze({
  luminance: {
    source: 'computed foreground/background colour pair',
    normalization: 'WCAG contrast ratio',
    pausedState: 'n/a — static property',
  },
  stacking: {
    source: 'computed z-index',
    normalization: 'floor to nearest Law 10 tier',
    pausedState: 'n/a — static property',
  },
  size: {
    source: 'getBoundingClientRect area',
    normalization: 'area / viewport area (ratio, never absolute px)',
    pausedState: 'n/a — static property',
  },
  chromaticity: {
    source: 'computed colour, LCh hue angle only',
    normalization: 'nearest palette role within hue tolerance, chroma floor to neutral',
    pausedState: 'n/a — static property',
  },
  shape: {
    source: 'border-radius, width/height, clip-path — geometry only',
    normalization: 'radius / min(width, height)',
    pausedState: 'n/a — static property',
  },
  density: {
    source: 'rasterized element pixels vs resolved background',
    normalization: 'ink / area inside the clipped region',
    pausedState: 'animations paused, single settled frame',
  },
});
