/**
 * Lineage integrity — dependency-free.
 *
 * The lineage contract vocabulary and its document-level verifier live here, in
 * a module with ZERO imports, on purpose: the asset pipeline needs them at the
 * composition boundary, and Layer-1 innate immunity needs them at scan time,
 * and the innate layer must stay light enough to run on every commit. Both
 * consume this one source; neither re-implements it. A verifier duplicated in
 * two layers is a verifier that drifts — and a drifted integrity check is worse
 * than none, because it still looks like a guard.
 *
 * @bytecode PB-ASSET-LINEAGE-v1
 */

export const LINEAGE_CONTRACT = 'PB-ASSET-LINEAGE-v1';

/** Known construction-link values (mirrors CONSTRUCTION_LINK in asset-pipeline). */
export const LINEAGE_LINKS = Object.freeze({
  GATE: 'gate',
  DERIVED: 'derived',
});

/**
 * Verify the INTERNAL consistency of a lineage chain alone — no artifacts needed.
 *
 * The full byte-level re-derivation (packet/scene/raster) lives in
 * asset-pipeline.js `verifyLineage()`, which needs the live compile result in
 * hand. An exported lineage (a `-lineage.json` sidecar, a record handed to the
 * immune system) travels WITHOUT its pixels, so this checks what a lineage must
 * satisfy to be self-consistent as a document:
 *
 *   - the contract is exactly PB-ASSET-LINEAGE-v1
 *   - every stage that is present is well-formed (ids are strings, digests are
 *     8-hex FNV-1a or sha256-prefixed, the construction link is a known value)
 *   - the per-frame rows AGREE with the top-level shorthand for frame 0, and
 *     each frame row is internally complete
 *
 * A lineage that fails its own internal consistency is broken regardless of
 * what pixels it once described.
 *
 * @param {object} lineage - a PB-ASSET-LINEAGE-v1 lineage object
 * @returns {{ ok: boolean, mismatches: Array<{stage: string, expected: string, actual: string}> }}
 */
export function verifyLineageChain(lineage) {
  const mismatches = [];
  const push = (stage, expected, actual) => mismatches.push({ stage, expected, actual });

  if (!lineage || typeof lineage !== 'object') {
    return { ok: false, mismatches: [{ stage: 'lineage', expected: 'object', actual: String(lineage) }] };
  }

  if (lineage.contract !== LINEAGE_CONTRACT) {
    push('contract', LINEAGE_CONTRACT, String(lineage.contract ?? 'missing'));
  }

  const isDigest = (v) => typeof v === 'string' && (/^[0-9a-f]{8}$/.test(v) || /^sha256-/.test(v));

  if (lineage.packet) {
    if (typeof lineage.packet.id !== 'string') push('packet.id', 'string', typeof lineage.packet.id);
  } else {
    push('packet', 'present', 'missing');
  }

  if (lineage.construction) {
    const c = lineage.construction;
    if (c.link !== LINEAGE_LINKS.GATE && c.link !== LINEAGE_LINKS.DERIVED) {
      push('construction.link', 'gate|derived', String(c.link));
    }
    // A derived link promises a parts checksum; its absence is a broken promise.
    if (c.link === LINEAGE_LINKS.DERIVED && typeof c.partsChecksum !== 'string') {
      push('construction.partsChecksum', 'string (link is derived)', String(c.partsChecksum));
    }
    if (typeof c.checksum !== 'string') push('construction.checksum', 'string', typeof c.checksum);
  }

  if (lineage.vriScene) {
    if (typeof lineage.vriScene.checksum !== 'string') push('vriScene.checksum', 'string', typeof lineage.vriScene.checksum);
  }

  if (lineage.raster) {
    if (!isDigest(lineage.raster.digest)) push('raster.digest', 'hex digest', String(lineage.raster.digest));
    if (!Number.isInteger(lineage.raster.width) || !Number.isInteger(lineage.raster.height)) {
      push('raster.dimensions', 'integers', `${lineage.raster.width}x${lineage.raster.height}`);
    }
  }

  if (!Array.isArray(lineage.frames) || lineage.frames.length === 0) {
    push('frames', 'non-empty array', Array.isArray(lineage.frames) ? 'empty' : typeof lineage.frames);
  } else {
    // Frame rows are first-class: each must carry a packet id, and any raster it
    // records must carry a real digest. Frame 0 must agree with the shorthand.
    lineage.frames.forEach((row, i) => {
      if (!Number.isInteger(row.index)) push(`frames[${i}].index`, 'integer', String(row.index));
      if (!row.packet || typeof row.packet.id !== 'string') push(`frames[${i}].packet.id`, 'string', 'missing');
      if (row.raster && !isDigest(row.raster.digest)) push(`frames[${i}].raster.digest`, 'hex digest', String(row.raster?.digest));
    });
    const first = lineage.frames.find(f => f.index === 0) ?? lineage.frames[0];
    if (lineage.packet && first?.packet && lineage.packet.id !== first.packet.id) {
      push('frames[0].packet', lineage.packet.id, first.packet.id);
    }
    if (lineage.vriScene && first?.vriScene && lineage.vriScene.checksum !== first.vriScene.checksum) {
      push('frames[0].vriScene', lineage.vriScene.checksum, first.vriScene.checksum);
    }
    if (lineage.raster && first?.raster && lineage.raster.digest !== first.raster.digest) {
      push('frames[0].raster', lineage.raster.digest, first.raster.digest);
    }
  }

  return { ok: mismatches.length === 0, mismatches };
}
