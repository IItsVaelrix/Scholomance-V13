/**
 * Width-profile-ribbon constructor — ribbon along a spine with variable width profile.
 * PDR §3: { kind:'width-profile-ribbon', spine: AnchorRef[], profile: number[] }
 */

import { buildSolvedPart, normalize, perp, lerp } from '../geometry-utils.js';

/**
 * Solve a width-profile-ribbon primitive.
 * The spine is a polyline through anchor points. The profile array gives
 * half-widths at evenly-spaced stations along the spine.
 */
export function solveWidthProfileRibbon(spec, ctx) {
  const spineAnchors = spec.spine;
  const profile = spec.profile;

  if (!Array.isArray(spineAnchors) || spineAnchors.length < 2) {
    throw new Error('WidthProfileRibbon: spine must have ≥2 anchor refs');
  }
  if (!Array.isArray(profile) || profile.length < 2) {
    throw new Error('WidthProfileRibbon: profile must have ≥2 values');
  }

  // Resolve spine points
  const spinePts = spineAnchors.map(ref => {
    const pt = ctx.anchors[ref.anchor];
    if (!pt) throw new Error(`WidthProfileRibbon: unknown anchor "${ref.anchor}"`);
    return [pt[0] + (ref.offset?.[0] ?? 0), pt[1] + (ref.offset?.[1] ?? 0)];
  });

  // Resample spine to match profile length
  const stations = profile.length;
  const resampled = [];
  for (let i = 0; i < stations; i++) {
    const t = i / (stations - 1);
    const segFloat = t * (spinePts.length - 1);
    const segIdx = Math.min(Math.floor(segFloat), spinePts.length - 2);
    const segT = segFloat - segIdx;
    resampled.push(lerp(spinePts[segIdx], spinePts[segIdx + 1], segT));
  }

  const leftBank = [];
  const rightBank = [];

  for (let i = 0; i < stations; i++) {
    const prev = resampled[Math.max(0, i - 1)];
    const next = resampled[Math.min(stations - 1, i + 1)];
    const dir = normalize([next[0] - prev[0], next[1] - prev[1]]);
    const nrm = perp(dir);
    const hw = profile[i] / 2;

    leftBank.push([resampled[i][0] + nrm[0] * hw, resampled[i][1] + nrm[1] * hw]);
    rightBank.push([resampled[i][0] - nrm[0] * hw, resampled[i][1] - nrm[1] * hw]);
  }

  const namedPoints = {
    start: resampled[0],
    end: resampled[stations - 1],
    center: resampled[Math.floor(stations / 2)],
    startLeft: leftBank[0],
    startRight: rightBank[0],
    endLeft: leftBank[stations - 1],
    endRight: rightBank[stations - 1],
  };

  return buildSolvedPart(spec._partId || 'width-profile-ribbon', 'width-profile-ribbon', {
    spine: resampled,
    leftBank,
    rightBank,
    namedPoints,
    closed: false,
  });
}
