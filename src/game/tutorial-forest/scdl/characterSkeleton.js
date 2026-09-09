/** Adult rig in head units. Clothes and all poses attach to this one skeleton. */
export const CHARACTER_CANVAS = Object.freeze({ width: 64, height: 112 });
export const CHARACTER_ANATOMY = Object.freeze({ headsTall: 7.5, headHeight: 13, crown: 7, centerX: 30, shoulderWidthHeads: 1.85, thighLength: 24, shinLength: 24, upperArmLength: 18, forearmLength: 16 });
export const CHARACTER_DIRECTIONS = Object.freeze(['south', 'southeast', 'east', 'northeast', 'north', 'northwest', 'west', 'southwest']);
const JOINTS = Object.freeze({
  'head.top': [0, 0], 'head.center': [0, .5], 'head.chin': [0, 1],
  'face.eyeLeft': [-.22, .48], 'face.eyeRight': [.22, .48], 'face.nose': [.04, .68], 'face.mouth': [.02, .85],
  'neck.base': [0, 1.3], 'torso.sternum': [0, 2.05], 'torso.waist': [0, 2.9], 'torso.pelvis': [0, 3.65],
  'torso.shoulderL': [-.925, 1.55], 'torso.shoulderR': [.925, 1.55],
  'torso.hipL': [-.48, 3.65], 'torso.hipR': [.48, 3.65],
  'arms.elbowL': [-1.1, 2.93], 'arms.elbowR': [1.24, 2.84],
  'arms.wristL': [-1.04, 4.14], 'arms.wristR': [1.48, 3.9],
  'hands.palmL': [-1.04, 4.43], 'hands.palmR': [1.48, 4.12],
  'legs.kneeL': [-.48, 5.49], 'legs.kneeR': [.48, 5.49],
  'legs.ankleL': [-.48, 7.32], 'legs.ankleR': [.48, 7.32],
  'feet.toeL': [-.58, 7.5], 'feet.toeR': [.68, 7.5],
});
/**
 * Closed-form 2-Bone Analytic Inverse Kinematics (Law of Cosines).
 * Given hip H and ankle target A with thigh L1 and shin L2, determines
 * the exact anatomical knee coordinates K such that ||K - H|| = L1 and ||A - K|| = L2.
 */
function solveTwoBoneIK(hip, ankle, L1, L2, bendSign = 1) {
  const dx = ankle.x - hip.x;
  const dy = ankle.y - hip.y;
  const dist = Math.hypot(dx, dy);

  // Guard against triangle inequality violation (hyperextension / total collapse)
  const maxReach = (L1 + L2) * 0.998;
  const minReach = Math.max(0.1, Math.abs(L1 - L2) * 1.05);
  const d = Math.max(minReach, Math.min(maxReach, dist));

  const baseAngle = Math.atan2(dy, dx);
  const cosAlpha = Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
  const alpha = Math.acos(cosAlpha);

  const kneeAngle = baseAngle + bendSign * alpha;
  return {
    x: hip.x + Math.cos(kneeAngle) * L1,
    y: hip.y + Math.sin(kneeAngle) * L1,
  };
}

export function sampleCharacterSkeleton({ phase = 0, motion = 'idle', direction = 'south', anatomy = CHARACTER_ANATOMY } = {}) {
  const h = anatomy.headHeight;
  const walking = motion === 'walk';
  const cycle = phase * Math.PI * 2;

  // 1. Pelvic Kinematics:
  // Human walking exhibits two vertical peaks per stride (vaulting at mid-stance)
  // and two dips (cushioning at loading response/contact).
  const pelvicBob = walking
    ? -Math.cos(cycle * 2) * 1.5
    : -Math.sin(cycle) * 0.45;

  // Lateral weight transfer: center of mass migrates over the supporting stance foot
  const pelvisShift = walking ? Math.sin(cycle) * 1.4 : 0;

  // Coronal pelvic list: unsupported swing hip dips subtly
  const hipTiltY = walking ? Math.sin(cycle) * 0.7 : 0;

  // 2. Vestibular Head and Torso Stabilization:
  // Dampen vertical bob up the spinal chain so the gaze remains steady
  const bobFactor = (name) => {
    if (name.startsWith('feet.') || name.startsWith('legs.ankle')) return 0;
    if (name.startsWith('head.') || name.startsWith('face.')) return 0.20; // 20% gaze stabilization
    if (name.startsWith('neck.')) return 0.35;                             // 35% cervical dampening
    if (name.startsWith('torso.sternum') || name.startsWith('torso.shoulder')) return 0.65; // 65% sternum/shoulders
    if (name.startsWith('torso.waist')) return 0.82;                       // 82% lumbar
    if (name.startsWith('torso.pelvis') || name.startsWith('torso.hip')) return 1.0; // 100% pelvic COM
    return 0.50; // arms default
  };

  const angle = CHARACTER_DIRECTIONS.indexOf(direction) * Math.PI / 4;
  const sinAngle = Math.sin(angle);
  const cosAngle = Math.cos(angle);
  const chartWidth = Math.max(.35, Math.abs(Math.cos(angle)));
  const back = ['north', 'northeast', 'northwest'].includes(direction);
  const sign = ['west', 'northwest', 'southwest'].includes(direction) ? -1 : 1;
  const isProfile = Math.abs(sinAngle) > 0.7;

  // Base unposed joint coordinates with stabilized bob and sway
  const joints = Object.fromEntries(
    Object.entries(JOINTS).map(([name, [x, y]]) => {
      const factor = bobFactor(name);
      const jointBob = pelvicBob * factor;
      const jointSwayX = name.startsWith('feet.') ? 0 : pelvisShift * factor;
      return [
        name,
        {
          x: anatomy.centerX + x * h + jointSwayX,
          y: anatomy.crown + y * h + jointBob,
          z: 0,
        },
      ];
    })
  );

  if (walking) {
    joints['torso.hipL'].y -= hipTiltY;
    joints['torso.hipR'].y += hipTiltY;

    // Shoulder counter-rotation (transverse plane: 0.25 rad)
    const shoulderYaw = -Math.sin(cycle) * 0.25;
    joints['torso.shoulderL'].z = -shoulderYaw * 10;
    joints['torso.shoulderR'].z = shoulderYaw * 10;
    joints['torso.shoulderL'].x += shoulderYaw * 0.6;
    joints['torso.shoulderR'].x -= shoulderYaw * 0.6;

    // 3. Biomechanical Stance/Swing Gait State Machine:
    // Stride parameters
    const S0 = 8.5;       // Half-stride amplitude (pixels)
    const Hlift = 4.0;    // Vertical ground clearance during mid-swing
    const groundAnkleY = 100; // World ground contact baseline
    const L1 = anatomy.thighLength;
    const L2 = anatomy.shinLength;

    for (const [side, offset] of [['L', 0], ['R', 0.5]]) {
      const legPhase = (phase + offset) % 1.0;
      let stride, lift, isStance;

      if (legPhase <= 0.625) {
        // --- STANCE PHASE (62.5% of gait cycle) ---
        // Pinned to ground; moves linearly backward relative to pelvis:
        // Initial Contact -> Loading Response -> Mid-Stance -> Terminal Stance -> Pre-Swing
        isStance = true;
        const p = legPhase / 0.625;
        stride = S0 * (1 - 2 * p);
        lift = 0; // Firmly planted on the ground plane
      } else {
        // --- SWING PHASE (37.5% of gait cycle) ---
        // Toe-off -> Mid-Swing (knee flexion, floor clearance) -> Terminal Swing (extension to heel strike)
        isStance = false;
        const tau = (legPhase - 0.625) / 0.375;
        // Smoothstep acceleration/deceleration
        const smooth = 3 * tau * tau - 2 * tau * tau * tau;
        stride = -S0 + 2 * S0 * smooth;
        // Parabolic floor clearance
        lift = Math.sin(Math.PI * tau) * Hlift;
      }

      const hip = joints[`torso.hip${side}`];
      const knee = joints[`legs.knee${side}`];
      const ankle = joints[`legs.ankle${side}`];
      const toe = joints[`feet.toe${side}`];

      let ankleX, ankleY;
      if (isProfile) {
        // Profile view: stride along screen X (horizontal scissor)
        ankleX = anatomy.centerX + stride * 1.15 * sign;
        ankleY = groundAnkleY - lift;
      } else {
        // Coronal/depth view: stride along ground depth (screen Y in 2.5D perspective)
        const deltaY = stride * cosAngle * 0.52;
        ankleX = hip.x + (side === 'L' ? -0.5 : 0.5);
        ankleY = groundAnkleY + deltaY - lift;
      }

      ankle.x = ankleX;
      ankle.y = ankleY;
      ankle.z = stride;

      toe.x = ankle.x + (isProfile ? sign * 3.0 : (side === 'L' ? -1.0 : 1.0));
      toe.y = ankle.y + (isProfile ? 2.0 : (cosAngle < -0.5 ? -1.5 : 3.0)) - (isStance ? 0 : lift * 0.4);
      toe.z = ankle.z + 1.0;

      // Closed-form 2-bone IK solution for knee
      if (isProfile) {
        // In profile, knees bend forward toward facing direction
        const bendSign = sign > 0 ? -1 : 1;
        const solvedKnee = solveTwoBoneIK(hip, ankle, L1, L2, bendSign);
        knee.x = solvedKnee.x;
        knee.y = solvedKnee.y;
      } else {
        // In coronal view, knee projects down/forward; flexes sharply during swing
        const kneeFlex = isStance ? 1.0 : (3.5 + lift * 0.6);
        knee.x = (hip.x + ankle.x) * 0.5 + (side === 'L' ? -0.5 : 0.5);
        knee.y = (hip.y + ankle.y) * 0.5 - kneeFlex + cosAngle * 0.8;
      }
      knee.z = (hip.z + ankle.z) * 0.5 + (isStance ? 1.0 : 3.0);
    }

    // 4. Arms & Equipment-Aware Gait:
    // Left Arm (Free hand): natural reciprocal counter-swing (0.65 amplitude)
    const leftArmWave = -Math.sin(cycle);
    const shoulderL = joints['torso.shoulderL'];
    const elbowL = joints['arms.elbowL'];
    const wristL = joints['arms.wristL'];
    const palmL = joints['hands.palmL'];

    elbowL.z = leftArmWave * 4.0;
    elbowL.x += leftArmWave * (isProfile ? 4.0 : 1.0);
    elbowL.y = shoulderL.y + 18 - Math.max(0, leftArmWave) * 1.5;

    wristL.z = leftArmWave * 7.0;
    wristL.x += leftArmWave * (isProfile ? 6.5 : 2.0);
    wristL.y = elbowL.y + 15 - Math.max(0, leftArmWave) * 2.0;

    palmL.z = wristL.z;
    palmL.x = wristL.x;
    palmL.y = wristL.y + 3;

    // Right Arm (Staff-bearing hand):
    // Steady walking-staff posture, pitching gently with gait cadence
    const shoulderR = joints['torso.shoulderR'];
    const elbowR = joints['arms.elbowR'];
    const wristR = joints['arms.wristR'];
    const palmR = joints['hands.palmR'];

    const staffCadence = Math.sin(cycle * 2) * 0.6;
    const staffSway = -leftArmWave * 0.20;

    elbowR.z = staffSway * 2.0;
    elbowR.x += staffSway * (isProfile ? 2.5 : 0.6);
    elbowR.y = shoulderR.y + 17 + staffCadence;

    wristR.z = staffSway * 3.5;
    wristR.x += staffSway * (isProfile ? 3.5 : 0.8);
    wristR.y = elbowR.y + 14 + staffCadence;

    palmR.z = wristR.z;
    palmR.x = wristR.x;
    palmR.y = wristR.y + 3;
  }

  // 2.5D RPG Perspective Projection:
  // Leg joints are solved directly in screen space during walk to enforce foot locking;
  // upper body joints receive standard coronal and depth parallax.
  const projected = Object.fromEntries(
    Object.entries(joints).map(([name, point]) => {
      const isLeg = name.startsWith('feet.') || name.startsWith('legs.');
      if (isLeg && walking) {
        return [name, { x: Math.round(point.x), y: Math.round(point.y) }];
      }
      const face = name.startsWith('face.');
      const depthY = Math.round(point.z * 0.2);
      return [
        name,
        {
          x: Math.round(anatomy.centerX + (point.x - anatomy.centerX) * chartWidth * sign + point.z * Math.sin(angle) + (face ? Math.sin(angle) * 2 : 0)),
          y: Math.round(point.y + depthY),
        },
      ];
    })
  );

  return { joints: projected, rawJoints: joints, direction, back, profile: direction === 'east' || direction === 'west', sign, headHeight: h, phase, motion };
}
