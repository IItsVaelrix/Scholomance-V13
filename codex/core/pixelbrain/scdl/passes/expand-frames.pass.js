/**
 * SCDL Pass — Expand Frames (SCDL v1.1)
 *
 * Materializes one virtual part list per animation frame from the base parts
 * plus each frame block's overrides (replace / add-after / omit). Frame 0 is
 * always the base asset itself: its part list is the untouched base array, so
 * a source with frame blocks compiles frame 0 identically to the same source
 * without them (base identity invariant).
 *
 * Enforces:
 *  - Frame Index Law (SCDL-013): indices dense and declaration-ordered
 *    (1, 2, ... N); sparse, duplicate, out-of-order, or explicit 0 rejected —
 *    never normalized.
 *  - Replacement Ordering Law (SCDL-014): a replacement keeps the base part's
 *    painter-order slot and must not carry an 'after' anchor; an added part
 *    must carry a known 'after' anchor.
 *  - SCDL-012: omit of an unknown part id.
 *  - SCDL-015 (WARN): frame identical to base after expansion (dead frame).
 *
 * Pure function: never mutates the base AST parts; every non-zero frame gets
 * deep copies so downstream passes cannot cross-contaminate frames.
 */

import { scdlError, scdlWarn, SCDL_ERROR_CODES } from '../scdl.errors.js';

/**
 * @param {object} ast - Validated SCDL AST (may carry .loop / .frames)
 * @param {import('../scdl.errors.js').SCDLError[]} errors
 * @returns {{
 *   hasFrames: boolean,
 *   loop: { name: string, defaultDurationMs: number },
 *   frameSpecs: Array<{ index: number, label: string, durationMs: number, parts: object[] }>,
 * }}
 */
export function expandFramesPass(ast, errors) {
  const frames = Array.isArray(ast.frames) ? ast.frames : [];
  const loop = {
    name:              ast.loop?.name || 'loop',
    defaultDurationMs: ast.loop?.defaultDurationMs ?? 400,
  };

  const frameSpecs = [{
    index:      0,
    label:      'rest',
    durationMs: loop.defaultDurationMs,
    parts:      ast.parts,
  }];

  if (frames.length === 0) {
    return { hasFrames: false, loop, frameSpecs };
  }

  // ── Frame Index Law (SCDL-013) ──
  frames.forEach((frame, i) => {
    if (frame.index !== i + 1) {
      const why = frame.index === 0
        ? `frame 0 is implicitly the base asset and must not be declared`
        : `expected frame ${i + 1}, got frame ${frame.index}`;
      errors.push(scdlError(
        `Frame Index Law violation: ${why} (indices must be dense and declaration-ordered)`,
        SCDL_ERROR_CODES.FRAME_INDEX_LAW,
        frame.loc,
        { frameIndex: frame.index }
      ));
    }
  });

  const baseIds = new Set(ast.parts.map(p => p.id));
  const baseSnapshot = JSON.stringify(ast.parts);

  for (const frame of frames) {
    const parts = ast.parts.map(p => structuredClone(p));

    for (const override of (frame.overrides || [])) {
      if (override.mode === 'omit') {
        const idx = parts.findIndex(p => p.id === override.partId);
        if (idx === -1) {
          errors.push(scdlError(
            `Frame ${frame.index} omits unknown part '${override.partId}'`,
            SCDL_ERROR_CODES.FRAME_UNKNOWN_PART,
            override.loc,
            { frameIndex: frame.index, partId: override.partId }
          ));
          continue;
        }
        parts.splice(idx, 1);
        continue;
      }

      const partId = override.part.id;
      if (baseIds.has(partId)) {
        // ── replacement: keeps the base part's painter-order slot ──
        override.mode = 'replace';
        if (override.after) {
          errors.push(scdlError(
            `Frame ${frame.index}: 'after' anchor on replacement of part '${partId}' — a replacement keeps the base painter-order slot (Replacement Ordering Law)`,
            SCDL_ERROR_CODES.FRAME_BAD_ANCHOR,
            override.loc,
            { frameIndex: frame.index, partId }
          ));
          continue;
        }
        const idx = parts.findIndex(p => p.id === partId);
        if (idx === -1) {
          errors.push(scdlError(
            `Frame ${frame.index}: part '${partId}' was omitted earlier in this frame and cannot be replaced`,
            SCDL_ERROR_CODES.FRAME_UNKNOWN_PART,
            override.loc,
            { frameIndex: frame.index, partId }
          ));
          continue;
        }
        parts[idx] = structuredClone(override.part);
      } else {
        // ── addition: requires a known 'after' anchor ──
        override.mode = 'add';
        if (!override.after) {
          errors.push(scdlError(
            `Frame ${frame.index}: added part '${partId}' requires an 'after' anchor to fix its painter-order slot`,
            SCDL_ERROR_CODES.FRAME_BAD_ANCHOR,
            override.loc,
            { frameIndex: frame.index, partId }
          ));
          continue;
        }
        const anchorIdx = parts.findIndex(p => p.id === override.after);
        if (anchorIdx === -1) {
          errors.push(scdlError(
            `Frame ${frame.index}: unknown 'after' anchor '${override.after}' for added part '${partId}'`,
            SCDL_ERROR_CODES.FRAME_BAD_ANCHOR,
            override.loc,
            { frameIndex: frame.index, partId, after: override.after }
          ));
          continue;
        }
        parts.splice(anchorIdx + 1, 0, structuredClone(override.part));
      }
    }

    // ── dead frame (SCDL-015) ──
    if (JSON.stringify(parts) === baseSnapshot) {
      errors.push(scdlWarn(
        `Frame ${frame.index} is identical to the base after expansion (dead frame)`,
        SCDL_ERROR_CODES.DEAD_FRAME,
        frame.loc,
        { frameIndex: frame.index }
      ));
    }

    frameSpecs.push({
      index:      frame.index,
      label:      frame.label || `f${frame.index}`,
      durationMs: frame.durationMs ?? loop.defaultDurationMs,
      parts,
    });
  }

  return { hasFrames: true, loop, frameSpecs };
}
