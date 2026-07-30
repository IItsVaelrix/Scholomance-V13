/**
 * palette-e2e — School palette E2E orchestrator.
 *
 * Orchestrates the full palette pipeline:
 * 1. Serializes the school palette to wire format (palette-wire.js)
 * 2. Validates the palette wire (no nulls, all int32)
 * 3. Takes a claim from Blender (with palette node group applied)
 * 4. Hashes the pixel dump JS-side
 * 5. Mints a receipt
 *
 * The consumer (Blender) creates the palette node group, applies it to a
 * material, renders, dumps pixels, and emits a raw claim. All hashing is
 * JS-side.
 *
 * Under EXACT policy the authored hex must survive byte-exact. The transfer
 * function (sRGB → linear) is recorded in COLOR_LAW, not assumed.
 */

import { readFileSync, existsSync } from 'node:fs';
import { hashPixelDump, hashPixelBuffer, mintReceipt } from './receipt.js';
import { paletteToWire, allPalettesToWire, validatePaletteWire, SCHOOL_NAMES } from './palette-wire.js';

export class PaletteE2EError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PaletteE2EError';
  }
}

/**
 * Prepare the full palette wire payload for all schools.
 * Validates every palette before returning.
 *
 * @param {object} [options]
 * @param {string} [options.colorPolicy='EXACT']
 * @returns {Readonly<{palettes: object, validation: object[]}>}
 */
export function preparePalettePayload(options = {}) {
  const { colorPolicy = 'EXACT' } = options;
  const palettes = allPalettesToWire({ colorPolicy });

  const validation = SCHOOL_NAMES.map((school) => {
    const result = validatePaletteWire(palettes[school]);
    return Object.freeze({ school, ...result });
  });

  const allValid = validation.every((v) => v.valid);
  if (!allValid) {
    const failures = validation.filter((v) => !v.valid);
    throw new PaletteE2EError(
      `palette validation failed: ${failures.map((f) => `${f.school}: ${f.reason}`).join('; ')}`,
    );
  }

  return Object.freeze({ palettes, validation: Object.freeze(validation) });
}

/**
 * Run the palette E2E: validate palette, hash pixels, mint receipt.
 *
 * @param {object} claim - the Blender addon's emit_claim output (with palette applied)
 * @param {object} options
 * @param {string} [options.dumpPath] - path to .f32 pixel dump file
 * @param {Buffer} [options.dumpBuffer] - raw pixel dump buffer (alternative to path)
 * @param {string} [options.school='default'] - school name for validation
 * @param {string} [options.colorPolicy='EXACT'] - colour policy
 * @returns {Readonly<object>} full E2E result
 */
export function runPaletteE2E(claim, options = {}) {
  const { dumpPath, dumpBuffer, school = 'default', colorPolicy = 'EXACT' } = options;

  if (!claim || typeof claim !== 'object') {
    throw new PaletteE2EError('claim must be a non-null object');
  }

  // Validate the palette wire
  const paletteWire = paletteToWire(school, { colorPolicy });
  const validation = validatePaletteWire(paletteWire);
  if (!validation.valid) {
    throw new PaletteE2EError(`palette validation failed for ${school}: ${validation.reason}`);
  }

  // Hash pixel dump
  let pixelHash;
  if (dumpBuffer) {
    pixelHash = hashPixelBuffer(dumpBuffer);
  } else if (dumpPath) {
    if (!existsSync(dumpPath)) {
      throw new PaletteE2EError(`pixel dump not found: ${dumpPath}`);
    }
    pixelHash = hashPixelDump(dumpPath);
  } else {
    throw new PaletteE2EError('either dumpPath or dumpBuffer must be provided');
  }

  // Mint receipt
  const receipt = mintReceipt(claim, pixelHash);

  return Object.freeze({
    school,
    colorPolicy,
    paletteWire,
    validation,
    pixelHash,
    receipt,
    claim: Object.freeze({ ...claim }),
  });
}

/**
 * Compare two palette renders (e.g. same palette, different engines).
 *
 * @param {object} resultA - from runPaletteE2E
 * @param {object} resultB - from runPaletteE2E
 * @returns {Readonly<object>}
 */
export function comparePaletteRenders(resultA, resultB) {
  const { compareReceipts } = require('./receipt.js');
  const divergence = compareReceipts(resultA.receipt, resultB.receipt);

  return Object.freeze({
    ...divergence,
    schoolA: resultA.school,
    schoolB: resultB.school,
    paletteMatch: resultA.school === resultB.school,
    pixelMatch: resultA.pixelHash === resultB.pixelHash,
  });
}
