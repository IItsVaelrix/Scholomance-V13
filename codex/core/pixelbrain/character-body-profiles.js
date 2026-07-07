import { registerPartProfile } from './part-profile-library.js';

const CW = 32;
const CH = 48;

function roundInt(v) {
  return Math.round(Number(v) || 0);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, Number(v) || 0));
}

function buildSkeleton(headTop, headCenter, headChin, eyeL, eyeR, nose, mouth, earL, earR, shoulderL, shoulderR, hipL, hipR, kneeL, kneeR, ankleL, ankleR) {
  return {
    head: { top: headTop, center: headCenter, chin: headChin },
    face: { eyeLeft: eyeL, eyeRight: eyeR, nose, mouth, earLeft: earL, earRight: earR },
    torso: { shoulderL, shoulderR, hipL, hipR },
    legs: { kneeL, kneeR, ankleL, ankleR },
  };
}

const STARBOUND_CHIBI_MASKS = Object.freeze({
  // Cheek peak at rows 7-8 (apple-cheek chibi shape), smooth chin taper
  headSouth: Object.freeze([3, 5, 7, 8, 8, 8, 8, 9, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]),
  headProfile: Object.freeze([2, 4, 5, 6, 7, 7, 7, 7, 6, 6, 5, 5, 4, 3, 2, 1, 1, 0]),
  // Narrower torso so head dominates; curved not trapezoid
  torsoSouth: Object.freeze([3, 4, 5, 5, 5, 4, 4, 3, 2]),
  torsoProfile: Object.freeze([2, 3, 4, 4, 4, 3, 3, 2, 2]),
  arm: Object.freeze([2, 2, 2, 2, 2, 1, 1, 1]),
  leg: Object.freeze([2, 2, 2, 2, 1, 1, 1, 1, 1, 1]),
  // Rounded boot nub — narrower than before
  foot: Object.freeze([1, 2, 2, 2, 1]),
});

// Structural guards for the Starbound Esper chibi (and chibi-style bodies).
// These hard caps + ratios ensure the *base silhouette* (the cells + skeleton anchors
// exposed to hair, clothing, accessories, details) stays narrow and head-dominant.
// This prevents every future robe, armor, jacket, pauldron, or accessory from
// inheriting an overly wide torso/shoulder that turns the chibi into a rectangle or linebacker.
const CHIBI_SILHOUETTE_GUARDS = Object.freeze({
  maxShoulderWidthRatio: 0.72,
  maxArmOutsetPx: 2,
  maxHandOutsetPx: 1,
  minHeadDominanceRatio: 0.42,
  maxLegColumnHeightPx: 7,
  footSpacingPx: 1,
});

function pushHalfWidthRows(cells, cx, topY, halfWidths, options = {}) {
  const shiftX = roundInt(options.shiftX ?? 0);
  const clipLeft = Number.isFinite(options.clipLeft) ? options.clipLeft : -Infinity;
  const clipRight = Number.isFinite(options.clipRight) ? options.clipRight : Infinity;

  for (let row = 0; row < halfWidths.length; row += 1) {
    const halfW = Math.max(0, roundInt(halfWidths[row]));
    const y = topY + row;
    for (let dx = -halfW; dx <= halfW; dx += 1) {
      if (dx < clipLeft || dx > clipRight) continue;
      cells.push({ x: cx + shiftX + dx, y });
    }
  }
}

function bodyCells_south(params) {
  const { heightScale = 1, widthScale = 1 } = params;
  const cells = [];
  const hs = clamp(heightScale, 0.85, 1.15);
  const ws = clamp(widthScale, 0.85, 1.3);

  // Read height offsets from params or compute from scale
  const headTopY = roundInt(2 * hs);
  const headBotY = roundInt(16 * hs);
  const headMidY = roundInt((headTopY + headBotY) / 2);
  const headCx = roundInt(CW / 2);
  const headHalfW = roundInt(7 * ws);

  // Head (oval)
  for (let y = headTopY; y <= headBotY; y += 1) {
    const t = (y - headTopY) / Math.max(1, headBotY - headTopY);
    const halfW = Math.max(2, roundInt(headHalfW * Math.sin(Math.PI * (t + 0.08))));
    for (let dx = -halfW; dx <= halfW; dx += 1) {
      cells.push({ x: headCx + dx, y });
    }
  }

  // Neck
  const neckTop = headBotY;
  const neckBot = roundInt(18 * hs);
  const neckHalfW = Math.max(1, roundInt(2 * ws));
  for (let y = neckTop; y <= neckBot; y += 1) {
    for (let dx = -neckHalfW; dx <= neckHalfW; dx += 1) {
      cells.push({ x: headCx + dx, y });
    }
  }

  // Torso (shoulders → waist)
  const shoulderY = neckBot;
  const waistY = roundInt(28 * hs);
  const shoulderHalfW = Math.max(3, roundInt(7 * ws));
  const waistHalfW = Math.max(2, roundInt(4 * ws));
  for (let y = shoulderY; y <= waistY; y += 1) {
    const t = (y - shoulderY) / Math.max(1, waistY - shoulderY);
    const bulge = roundInt(1.5 * Math.sin(t * Math.PI));
    const halfW = Math.round(shoulderHalfW + (waistHalfW - shoulderHalfW) * t) + bulge;
    for (let dx = -halfW; dx <= halfW; dx += 1) {
      cells.push({ x: headCx + dx, y });
    }
  }

  // Arms
  const armTop = shoulderY + 1;
  const armBot = roundInt(31 * hs);
  const armHalfW = Math.max(1, roundInt(2 * ws));
  for (const side of [-1, 1]) {
    const ax = headCx + side * shoulderHalfW - side * armHalfW;
    for (let y = armTop; y <= armBot; y += 1) {
      const t = (y - armTop) / Math.max(1, armBot - armTop);
      const sway = roundInt(2 * ws * Math.sin(t * Math.PI * 0.5));
      const bulge = roundInt(1 * Math.sin(t * Math.PI));
      const hw = armHalfW + bulge;
      for (let dx = -hw; dx <= hw; dx += 1) {
        cells.push({ x: ax + sway + dx, y });
      }
    }
  }

  // Legs
  const legTop = waistY;
  const legBot = roundInt(40 * hs);
  const legHalfW = Math.max(1, roundInt(2.5 * ws));
  const legGap = roundInt(2 * ws);
  for (const side of [-1, 1]) {
    const lx = headCx + side * legGap + side * legHalfW;
    for (let y = legTop; y <= legBot; y += 1) {
      const t = (y - legTop) / Math.max(1, legBot - legTop);
      const bulge = roundInt(1 * Math.sin(t * Math.PI));
      const hw = legHalfW + bulge;
      for (let dx = -hw; dx <= hw; dx += 1) {
        cells.push({ x: lx + dx, y });
      }
    }
  }

  // Feet
  const footTop = legBot;
  const footBot = roundInt(44 * hs);
  const footHalfW = Math.max(2, roundInt(3 * ws));
  for (const side of [-1, 1]) {
    const fx = headCx + side * legGap;
    for (let y = footTop; y <= footBot; y += 1) {
      const t = (y - footTop) / Math.max(1, footBot - footTop);
      const bulge = roundInt(1 * Math.sin(t * Math.PI));
      const hw = footHalfW + bulge;
      for (let dx = -hw; dx <= hw; dx += 1) {
        cells.push({ x: fx + dx, y });
      }
    }
  }

  return {
    cells,
    headCx,
    headMidY,
    headTopY,
    headBotY,
    shoulderY,
    shoulderHalfW,
    waistY,
    waistHalfW,
    legTop,
    legBot,
    legGap,
    legHalfW,
    footBot,
    armBot,
  };
}

function bodyCells_east(params) {
  const { heightScale = 1, widthScale = 1 } = params;
  const cells = [];
  const hs = clamp(heightScale, 0.85, 1.15);
  const ws = clamp(widthScale, 0.85, 1.3);

  const headTopY = roundInt(2 * hs);
  const headBotY = roundInt(16 * hs);
  const headCx = roundInt(CW * 0.55);
  const headHalfW = roundInt(6 * ws);

  // Head (profile - narrower)
  for (let y = headTopY; y <= headBotY; y += 1) {
    const t = (y - headTopY) / Math.max(1, headBotY - headTopY);
    const halfW = Math.max(2, roundInt(headHalfW * Math.sin(Math.PI * (t + 0.08))));
    for (let dx = -halfW; dx <= halfW; dx += 1) {
      cells.push({ x: headCx + dx, y });
    }
  }

  // Neck
  const neckBot = roundInt(18 * hs);
  for (let y = headBotY; y <= neckBot; y += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      cells.push({ x: headCx + dx, y });
    }
  }

  // Torso
  const shoulderY = neckBot;
  const waistY = roundInt(28 * hs);
  const shoulderHalfW = Math.max(3, roundInt(5 * ws));
  const waistHalfW = Math.max(2, roundInt(4 * ws));
  const torsoCx = headCx;
  for (let y = shoulderY; y <= waistY; y += 1) {
    const t = (y - shoulderY) / Math.max(1, waistY - shoulderY);
    const bulge = roundInt(1.5 * Math.sin(t * Math.PI));
    const halfW = Math.round(shoulderHalfW + (waistHalfW - shoulderHalfW) * t) + bulge;
    for (let dx = 0; dx <= halfW; dx += 1) {
      cells.push({ x: torsoCx + dx, y });
    }
  }

  // Arm (right side, visible in profile)
  const armTop = shoulderY + 1;
  const armBot = roundInt(31 * hs);
  for (let y = armTop; y <= armBot; y += 1) {
    const t = (y - armTop) / Math.max(1, armBot - armTop);
    const bulge = roundInt(1 * Math.sin(t * Math.PI));
    for (let dx = -1 - bulge; dx <= 1 + bulge; dx += 1) {
      cells.push({ x: torsoCx + shoulderHalfW + dx, y });
    }
  }

  // Legs
  const legTop = waistY;
  const legBot = roundInt(40 * hs);
  const legCx = torsoCx;
  for (let y = legTop; y <= legBot; y += 1) {
    const t = (y - legTop) / Math.max(1, legBot - legTop);
    const bulge = roundInt(1 * Math.sin(t * Math.PI));
    const hw = roundInt(2 * ws) + bulge;
    for (let dx = -hw; dx <= hw; dx += 1) {
      cells.push({ x: legCx + dx, y });
    }
  }

  const footBot = roundInt(44 * hs);
  const footTop = legBot;
  for (let y = footTop; y <= footBot; y += 1) {
    const t = (y - footTop) / Math.max(1, footBot - footTop);
    const bulge = roundInt(1 * Math.sin(t * Math.PI));
    const hw = roundInt(3 * ws) + bulge;
    for (let dx = -hw; dx <= hw; dx += 1) {
      cells.push({ x: legCx + dx, y });
    }
  }

  return { cells, headCx, headMidY: roundInt((headTopY + headBotY) / 2), headTopY, headBotY, shoulderY, shoulderHalfW, waistY, legTop, legBot, torsoCx };
}

function bodyCells_north(params) {
  // North = back view, similar to south but without face features
  const { heightScale = 1, widthScale = 1 } = params;
  const cells = [];
  const hs = clamp(heightScale, 0.85, 1.15);
  const ws = clamp(widthScale, 0.85, 1.3);

  const headTopY = roundInt(2 * hs);
  const headBotY = roundInt(16 * hs);
  const headCx = roundInt(CW / 2);
  const headHalfW = roundInt(7 * ws);

  for (let y = headTopY; y <= headBotY; y += 1) {
    const t = (y - headTopY) / Math.max(1, headBotY - headTopY);
    const halfW = Math.max(2, roundInt(headHalfW * Math.sin(Math.PI * (t + 0.08))));
    for (let dx = -halfW; dx <= halfW; dx += 1) {
      cells.push({ x: headCx + dx, y });
    }
  }

  const neckBot = roundInt(18 * hs);
  for (let y = headBotY; y <= neckBot; y += 1) {
    for (let dx = -roundInt(2 * ws); dx <= roundInt(2 * ws); dx += 1) {
      cells.push({ x: headCx + dx, y });
    }
  }

  const shoulderY = neckBot;
  const waistY = roundInt(28 * hs);
  const shoulderHalfW = Math.max(3, roundInt(7 * ws));
  const waistHalfW = Math.max(2, roundInt(4 * ws));
  for (let y = shoulderY; y <= waistY; y += 1) {
    const t = (y - shoulderY) / Math.max(1, waistY - shoulderY);
    const bulge = roundInt(1.5 * Math.sin(t * Math.PI));
    const halfW = Math.round(shoulderHalfW + (waistHalfW - shoulderHalfW) * t) + bulge;
    for (let dx = -halfW; dx <= halfW; dx += 1) {
      cells.push({ x: headCx + dx, y });
    }
  }

  const armBot = roundInt(31 * hs);
  for (const side of [-1, 1]) {
    for (let y = shoulderY + 1; y <= armBot; y += 1) {
      const t = (y - (shoulderY + 1)) / Math.max(1, armBot - (shoulderY + 1));
      const bulge = roundInt(1 * Math.sin(t * Math.PI));
      for (let dx = -1 - bulge; dx <= 1 + bulge; dx += 1) {
        cells.push({ x: headCx + side * shoulderHalfW + dx, y });
      }
    }
  }

  const legTop = waistY;
  const legBot = roundInt(40 * hs);
  const legHalfW = Math.max(1, roundInt(2.5 * ws));
  const legGap = roundInt(2 * ws);
  for (const side of [-1, 1]) {
    const lx = headCx + side * legGap + side * legHalfW;
    for (let y = legTop; y <= legBot; y += 1) {
      const t = (y - legTop) / Math.max(1, legBot - legTop);
      const bulge = roundInt(1 * Math.sin(t * Math.PI));
      const hw = legHalfW + bulge;
      for (let dx = -hw; dx <= hw; dx += 1) {
        cells.push({ x: lx + dx, y });
      }
    }
  }

  const footBot = roundInt(44 * hs);
  for (const side of [-1, 1]) {
    const fx = headCx + side * legGap;
    for (let y = legBot; y <= footBot; y += 1) {
      const t = (y - legBot) / Math.max(1, footBot - legBot);
      const bulge = roundInt(1 * Math.sin(t * Math.PI));
      const hw = roundInt(3 * ws) + bulge;
      for (let dx = -hw; dx <= hw; dx += 1) {
        cells.push({ x: fx + dx, y });
      }
    }
  }

  return { cells, headCx, headMidY: roundInt((headTopY + headBotY) / 2), headTopY, headBotY, shoulderY, shoulderHalfW, waistY, legTop, legBot };
}

function makeBodyProfile(type) {
  return (params = {}, options = {}) => {
    const direction = String(options.direction || 'south');
    const heightClass = String(params.heightClass || 'average');
    const buildClass = String(params.buildClass || 'average');

    const heightScale = heightClass === 'short' ? 0.9 : heightClass === 'tall' ? 1.1 : 1;
    const widthScale = buildClass === 'slender' ? 0.85 : buildClass === 'stocky' ? 1.2 : 1;

    const typeScale = type === 'masculine' ? 1.05 : type === 'androgynous' ? 1 : 1;

    const effectiveWS = widthScale * typeScale;
    const effectiveHS = heightScale;

    const bodyParams = { heightScale: effectiveHS, widthScale: effectiveWS };

    let result;
    if (direction === 'east' || direction === 'west') {
      result = bodyCells_east(bodyParams);
    } else if (direction === 'north') {
      result = bodyCells_north(bodyParams);
    } else {
      result = bodyCells_south(bodyParams);
    }

    const cells = result.cells;
    const hc = result.headCx !== undefined ? result.headCx : roundInt(CW / 2);
    const hm = result.headMidY !== undefined ? result.headMidY : roundInt(6 * effectiveHS);
    const ht = result.headTopY !== undefined ? result.headTopY : roundInt(2 * effectiveHS);
    const hb = result.headBotY !== undefined ? result.headBotY : roundInt(10 * effectiveHS);
    const sy = result.shoulderY !== undefined ? result.shoulderY : roundInt(12 * effectiveHS);
    const sw = result.shoulderHalfW !== undefined ? result.shoulderHalfW : roundInt(7 * effectiveWS);
    const wy = result.waistY !== undefined ? result.waistY : roundInt(24 * effectiveHS);
    const lt = result.legTop !== undefined ? result.legTop : roundInt(24 * effectiveHS);
    const lb = result.legBot !== undefined ? result.legBot : roundInt(40 * effectiveHS);
    const lg = result.legGap !== undefined ? result.legGap : roundInt(2 * effectiveWS);
    const lhw = result.legHalfW !== undefined ? result.legHalfW : roundInt(2 * effectiveWS);
    const fb = result.footBot !== undefined ? result.footBot : roundInt(44 * effectiveHS);

    let eyeL, eyeR, nose, mouth, earL, earR;
    if (direction !== 'north') {
      if (direction === 'east' || direction === 'west') {
        const eo = direction === 'west' ? -1 : 1;
        eyeL = { x: hc + eo, y: hm };
        eyeR = null;
        nose = { x: hc + eo * 2, y: hm + 2 };
        mouth = { x: hc + eo, y: hm + 3 };
        earL = { x: hc - 2, y: hm };
        earR = null;
      } else {
        eyeL = { x: hc - 2, y: hm };
        eyeR = { x: hc + 2, y: hm };
        nose = { x: hc, y: hm + 2 };
        mouth = { x: hc, y: hm + 3 };
        earL = { x: hc - 4, y: hm + 1 };
        earR = { x: hc + 4, y: hm + 1 };
      }
    } else {
      eyeL = null; eyeR = null; nose = null; mouth = null; earL = null; earR = null;
    }

    const skeleton = buildSkeleton(
      { x: hc, y: ht },
      { x: hc, y: hm },
      { x: hc, y: hb },
      eyeL, eyeR, nose, mouth, earL, earR,
      { x: hc - sw, y: sy },
      { x: hc + sw, y: sy },
      { x: hc - lg - lhw, y: wy },
      { x: hc + lg + lhw, y: wy },
      { x: hc - lg - lhw, y: roundInt((wy + lb) / 2) },
      { x: hc + lg + lhw, y: roundInt((wy + lb) / 2) },
      { x: hc - lg - lhw, y: fb - 2 },
      { x: hc + lg + lhw, y: fb - 2 },
    );

    return {
      cells,
      anchors: {
        base: { x: hc, y: fb },
        tip: { x: hc, y: ht },
        center: { x: hc, y: roundInt(CH / 2) },
        headTop: skeleton.head.top,
        headCenter: skeleton.head.center,
        headChin: skeleton.head.chin,
        ...Object.fromEntries(
          Object.entries(skeleton.face).filter(([_, v]) => v !== null).map(([k, v]) => [k, v])
        ),
        ...Object.fromEntries(
          Object.entries(skeleton.torso).map(([k, v]) => [k, v])
        ),
        ...Object.fromEntries(
          Object.entries(skeleton.legs).map(([k, v]) => [k, v])
        ),
      },
      skeleton,
    };
  };
}

function makeStarboundEsperChibiBody() {
  return (params = {}, options = {}) => {
    const direction = String(options.direction || 'south');
    const cells = [];
    const cx = roundInt(params.cx ?? 16);

    // Respect caller-requested compact (from ActorForge etc) but *never exceed* the structural guard.
    // This is the key to the "structural visual tuning": the base chibi silhouette (torso cells + the
    // shoulder/hip anchors that all clothing, armor, robes and accessories read via the silhouette composer)
    // is now capped so nothing layered on top can bloat the character into a wide rectangle.
    const requestedCompact = params.compact ?? 0.85;
    const compact = clamp(Math.min(requestedCompact, CHIBI_SILHOUETTE_GUARDS.maxShoulderWidthRatio), 0.55, 1.0);

    const headTopY = 2;
    const isProfile = direction === 'east' || direction === 'west';
    const facingSign = direction === 'west' ? -1 : 1;
    const headRows = isProfile ? STARBOUND_CHIBI_MASKS.headProfile : STARBOUND_CHIBI_MASKS.headSouth;
    const profileShift = direction === 'east' ? 1 : direction === 'west' ? -1 : 0;
    const headBotY = headTopY + headRows.length - 1;
    const headMidY = headTopY + 8;

    pushHalfWidthRows(cells, cx, headTopY, headRows, {
      shiftX: profileShift,
      clipLeft: direction === 'east' ? -4 : undefined,
      clipRight: direction === 'west' ? 4 : undefined,
    });

    const neckBot = 21;
    for (let y = headBotY; y <= neckBot; y += 1) {
      for (let dx = -2; dx <= 2; dx += 1) cells.push({ x: cx + dx, y });
    }

    const shoulderY = 21;

    // Derive torso rows from the ideal chibi mask, then scale by the guarded compact.
    // This keeps the cute curved taper while enforcing the max width ratio.
    const baseTorsoRows = isProfile ? STARBOUND_CHIBI_MASKS.torsoProfile : STARBOUND_CHIBI_MASKS.torsoSouth;
    const torsoRows = baseTorsoRows.map((w) => Math.max(0, roundInt(w * compact)));

    const waistY = shoulderY + torsoRows.length - 1;

    // shoulderHalfW is taken from the (now compacted) top row of the torso + explicit guard cap.
    let shoulderHalfW = torsoRows[0] || (isProfile ? 2 : 4);
    const headMaxHalf = Math.max(...headRows);
    const maxShoulderByRatio = Math.max(2, roundInt(headMaxHalf * CHIBI_SILHOUETTE_GUARDS.maxShoulderWidthRatio));
    shoulderHalfW = Math.min(shoulderHalfW, maxShoulderByRatio);

    // Enforce head dominance (head remains the primary visual mass).
    const dominance = headMaxHalf / Math.max(1, shoulderHalfW);
    if (dominance < CHIBI_SILHOUETTE_GUARDS.minHeadDominanceRatio) {
      shoulderHalfW = Math.max(2, roundInt(headMaxHalf / CHIBI_SILHOUETTE_GUARDS.minHeadDominanceRatio));
    }

    // Arm outset is deliberately tiny on a chibi so sleeves/jackets don't balloon the silhouette.
    const armOutset = Math.min(CHIBI_SILHOUETTE_GUARDS.maxArmOutsetPx, 1);
    const legGap = isProfile ? 0 : CHIBI_SILHOUETTE_GUARDS.footSpacingPx;
    const legHalfW = 2;

    pushHalfWidthRows(cells, cx, shoulderY, torsoRows, {
      shiftX: profileShift,
      clipLeft: direction === 'east' ? -1 : undefined,
      clipRight: direction === 'west' ? 1 : undefined,
    });

    // Arms — also compacted + guarded outset
    const baseArm = STARBOUND_CHIBI_MASKS.arm;
    const armRows = baseArm.map((w) => Math.max(0, roundInt(w * compact)));
    const armTop = shoulderY + 1;
    const armBot = armTop + armRows.length - 1;
    for (const side of [-1, 1]) {
      if ((direction === 'east' && side < 0) || (direction === 'west' && side > 0)) continue;
      const ax = cx + side * (shoulderHalfW + armOutset);
      for (let row = 0; row < armRows.length; row += 1) {
        let halfW = armRows[row];
        if (isProfile) {
          halfW = row < 4 ? Math.min(2, halfW) : (row < 6 ? 1 : 0);
        }
        if (halfW < 0) continue;
        const y = armTop + row;
        for (let dx = -halfW; dx <= halfW; dx += 1) {
          cells.push({ x: ax + dx, y });
        }
      }
    }

    // Legs — column height is hard-capped by the guard so long robes/armor don't create tall rectangular lower body.
    const baseLeg = STARBOUND_CHIBI_MASKS.leg;
    let legRows = baseLeg.map((w) => Math.max(0, roundInt(w * compact)));
    legRows = legRows.slice(0, CHIBI_SILHOUETTE_GUARDS.maxLegColumnHeightPx);

    const legTop = waistY;
    const legBot = legTop + legRows.length - 1;

    if (isProfile) {
      pushHalfWidthRows(cells, cx, legTop, legRows, { shiftX: profileShift });
    } else {
      for (const side of [-1, 1]) {
        const lx = cx + side * (legGap + 1);
        pushHalfWidthRows(cells, lx, legTop, legRows);
      }
    }

    // Feet: enforce footSpacingPx gap at the body center column.
    // Foot center sits at cx ± (legGap+1). Without clipping, the widest mask row
    // (halfW=2) reaches cx, shared by both feet. footInnerDxCap is the maximum
    // inward dx before a cell would cross into the declared gap zone.
    const footTop = legBot - 1;
    const footBot = footTop + STARBOUND_CHIBI_MASKS.foot.length - 1;
    const footInnerDxCap = legGap + 1 - CHIBI_SILHOUETTE_GUARDS.footSpacingPx;
    for (const side of isProfile ? [0] : [-1, 1]) {
      const fx = cx + side * legGap;
      const toeShift = isProfile ? facingSign : side;
      pushHalfWidthRows(cells, fx, footTop, STARBOUND_CHIBI_MASKS.foot, {
        shiftX: toeShift,
        clipRight: side < 0 ? footInnerDxCap : undefined,
        clipLeft: side > 0 ? -footInnerDxCap : undefined,
      });
    }

    let eyeL = null;
    let eyeR = null;
    let nose = null;
    let mouth = null;
    let earL = null;
    let earR = null;
    if (direction !== 'north') {
      if (direction === 'east' || direction === 'west') {
        const eo = direction === 'west' ? -1 : 1;
        eyeL = { x: cx + eo * 2, y: headMidY };
        nose = { x: cx + eo * 4, y: headMidY + 2 };
        mouth = { x: cx + eo * 2, y: headMidY + 5 };
        earL = { x: cx - eo * 6, y: headMidY + 1 };
      } else {
        eyeL = { x: cx - 3, y: headMidY };
        eyeR = { x: cx + 3, y: headMidY };
        nose = { x: cx, y: headMidY + 3 };
        mouth = { x: cx, y: headMidY + 6 };
        earL = { x: cx - 7, y: headMidY + 1 };
        earR = { x: cx + 7, y: headMidY + 1 };
      }
    }

    const skeleton = buildSkeleton(
      { x: cx, y: headTopY },
      { x: cx, y: headMidY },
      { x: cx, y: headBotY },
      eyeL, eyeR, nose, mouth, earL, earR,
      { x: cx - shoulderHalfW, y: shoulderY },
      { x: cx + shoulderHalfW, y: shoulderY },
      { x: cx - legGap - legHalfW, y: waistY },
      { x: cx + legGap + legHalfW, y: waistY },
      { x: cx - legGap - legHalfW, y: roundInt((waistY + legBot) / 2) },
      { x: cx + legGap + legHalfW, y: roundInt((waistY + legBot) / 2) },
      { x: cx - legGap - legHalfW, y: footBot - 1 },
      { x: cx + legGap + legHalfW, y: footBot - 1 },
    );

    return {
      cells,
      anchors: {
        base: { x: cx, y: footBot },
        tip: { x: cx, y: headTopY },
        center: { x: cx, y: roundInt(CH / 2) },
        headTop: skeleton.head.top,
        headCenter: skeleton.head.center,
        headChin: skeleton.head.chin,
        ...Object.fromEntries(Object.entries(skeleton.face).filter(([, v]) => v !== null)),
        ...skeleton.torso,
        ...skeleton.legs,
      },
      skeleton,
    };
  };
}

registerPartProfile('character.body.human.feminine', makeBodyProfile('feminine'));
registerPartProfile('character.body.human.masculine', makeBodyProfile('masculine'));
registerPartProfile('character.body.human.androgynous', makeBodyProfile('androgynous'));
registerPartProfile('character.body.chibi.starboundEsper', makeStarboundEsperChibiBody());
