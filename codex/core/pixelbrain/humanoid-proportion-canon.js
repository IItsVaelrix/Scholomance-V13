/**
 * humanoid-proportion-canon.js — figure-construction landmarks for segmented
 * character models.
 *
 * Every landmark below is a FRACTION OF TOTAL FIGURE HEIGHT, not a pixel
 * constant, so one canon drives any canvas size. The fractions are the standard
 * artistic figure canon (Loomis/Bridgman landmark ratios), adjusted for a
 * stylized game sprite whose head is proportionally larger than life:
 *
 *   - crotch sits at half the figure's height (the load-bearing rule; if this
 *     is wrong the character reads as stumpy or stilted no matter what else is)
 *   - elbow sits at the waist, wrist sits at the crotch
 *   - femur and tibia are near-equal, femur very slightly longer
 *   - knee sits at three quarters of the figure's height
 *
 * `headCount` is derived, not dialled in: it falls out of the chin fraction.
 * A realistic adult is ~7.5 heads; this canon's 4.4 is a deliberate stylized
 * ratio matched to Void1 (32x48), the repo's existing rigged reference.
 */

/** Landmark fractions of total figure height, measured from the crown. */
export const HUMANOID_CANON = Object.freeze({
  crown: 0.00,
  chin: 0.23,
  shoulder: 0.28,
  chest: 0.36,
  waist: 0.42,
  crotch: 0.52,
  knee: 0.75,
  ankle: 0.95,
  sole: 1.00,
  // arm chain, same fractional space
  elbow: 0.42, // canon: elbow meets the waist
  wrist: 0.55, // canon: wrist meets the crotch
  fingertip: 0.64,
});

/** Widths as a fraction of total figure height (keeps mass consistent). */
export const HUMANOID_WIDTHS = Object.freeze({
  head: 0.18,
  shoulders: 0.32,
  waist: 0.23,
  hips: 0.27,
  // Limbs carry a rim outline AND an interior; below ~4px a limb is all rim
  // and shades to mud (see the "muddy small detail" guard in
  // character-foundry.js). These widths keep at least one interior column.
  upperArm: 0.10,
  foreArm: 0.09,
  hand: 0.10,
  thigh: 0.12,
  shin: 0.10,
  foot: 0.13,
});

/**
 * Resolve the canon to integer pixel landmarks for a given figure box.
 * @param {{top:number, height:number, centerX:number}} box
 */
export function resolveCanon(box) {
  const { top, height, centerX } = box;
  const at = (f) => Math.round(top + f * height);
  const w = (f) => Math.max(1, Math.round(f * height));

  const y = {};
  for (const [k, f] of Object.entries(HUMANOID_CANON)) y[k] = at(f);

  const width = {};
  for (const [k, f] of Object.entries(HUMANOID_WIDTHS)) width[k] = w(f);

  // Hips root each leg chain; shoulders root each arm chain.
  // The shoulder joint sits at the OUTER EDGE of the shoulder mass, so the arm
  // hangs clear of the torso. Insetting it by half an arm-width instead buries
  // the whole arm inside the torso silhouette and only the hand shows.
  const hipDx = Math.round(width.hips / 4);
  const shoulderDx = Math.round(width.shoulders / 2);

  return {
    y,
    width,
    centerX,
    headCount: +(1 / HUMANOID_CANON.chin).toFixed(2),
    joints: {
      neck: { x: centerX, y: y.chin },
      shoulderL: { x: centerX - shoulderDx, y: y.shoulder },
      shoulderR: { x: centerX + shoulderDx, y: y.shoulder },
      elbowL: { x: centerX - shoulderDx, y: y.elbow },
      elbowR: { x: centerX + shoulderDx, y: y.elbow },
      wristL: { x: centerX - shoulderDx, y: y.wrist },
      wristR: { x: centerX + shoulderDx, y: y.wrist },
      hipL: { x: centerX - hipDx, y: y.crotch },
      hipR: { x: centerX + hipDx, y: y.crotch },
      kneeL: { x: centerX - hipDx, y: y.knee },
      kneeR: { x: centerX + hipDx, y: y.knee },
      ankleL: { x: centerX - hipDx, y: y.ankle },
      ankleR: { x: centerX + hipDx, y: y.ankle },
    },
  };
}

/**
 * Joint capsule overlap, in pixels. Every segment is drawn this far PAST its
 * own joint at both ends, so when the child rotates there is no gap at the
 * pivot — the standard cut-out-animation joint allowance. Without it a rigged
 * limb tears open at every bend.
 */
export const JOINT_OVERLAP = 1;
