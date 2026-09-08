/**
 * Scholomium Ink — SCD128 Packet Builders, Verifiers, and Wire Encoders
 *
 * Implements:
 * - SCD128SlotRecordV1
 * - SCD128BankPacketV1 (FORM64 and REALIZATION64)
 * - SCD128ArtPacketV1 (assembled exclusively by the Lawyer)
 * - Wire parsing and validation
 */

import {
  FORM64_SLOT_NAMES,
  REALIZATION64_SLOT_NAMES,
  FORM64_VERSION_PREFIX,
  REALIZATION64_VERSION_PREFIX,
  SCD128_WIRE_LENGTH,
  BANK_WIRE_LENGTH,
  BLOCK_HEX_LENGTH,
  BLOCKS_PER_BANK,
  CONFIDENCE_LEVELS,
  SCD128_REGEX,
  FORM64_REGEX,
  REALIZATION64_REGEX,
  BLOCK_HEX_REGEX,
  DIGEST256_REGEX,
  SCD128_ERROR_CODES,
} from './scd128.constants.js';

import {
  isExactValue,
  computeCanonicalDigest256,
  deriveSlotBlockHex,
  assertNoBlockCollisions,
} from './scd128.canonical.js';

/**
 * Creates and freezes a validated SCD128SlotRecordV1.
 */
export function createSlotRecord({
  slot,
  position,
  canonicalCategory,
  parameters = {},
  evidenceRefs = [],
  confidence = 'measured',
  canonicalDerivation = '',
  bank,
}) {
  if (typeof slot !== 'string' || !slot) {
    throw new TypeError(`Invalid slot name: ${slot}`);
  }
  if (!Number.isInteger(position) || position < 0 || position > 7) {
    throw new RangeError(`Slot position must be 0..7, got ${position}`);
  }
  if (typeof canonicalCategory !== 'string' || !canonicalCategory) {
    throw new TypeError(`Invalid canonicalCategory: ${canonicalCategory}`);
  }
  if (!CONFIDENCE_LEVELS.includes(confidence)) {
    throw new TypeError(`Invalid confidence level '${confidence}'`);
  }
  if (!Array.isArray(evidenceRefs)) {
    throw new TypeError('evidenceRefs must be an array');
  }

  // Validate all parameters are ExactValues
  const sanitizedParams = {};
  for (const [key, val] of Object.entries(parameters)) {
    if (!isExactValue(val)) {
      throw new TypeError(`Parameter '${key}' is not an ExactValue: ${JSON.stringify(val)}`);
    }
    sanitizedParams[key] = val;
  }

  const sortedEvidenceRefs = Object.freeze([...evidenceRefs].sort());

  // Compute canonical hash of the slot definition without digest256 or blockHex
  const slotPreimage = {
    slot,
    position,
    canonicalCategory,
    parameters: sanitizedParams,
    evidenceRefs: sortedEvidenceRefs,
    confidence,
    canonicalDerivation: String(canonicalDerivation),
  };

  const digest256 = computeCanonicalDigest256(slotPreimage);
  const blockHex = deriveSlotBlockHex(digest256, position, bank);

  return Object.freeze({
    ...slotPreimage,
    digest256,
    blockHex,
  });
}

/**
 * Creates and freezes a validated SCD128BankPacketV1.
 */
export function createBankPacket({
  bank, // 'form' | 'realization'
  adapterFamily = 'tree',
  slots,
  evidenceDigest = '',
}) {
  if (bank !== 'form' && bank !== 'realization') {
    throw new TypeError(`Unknown bank: ${bank}`);
  }

  const expectedSlots = bank === 'form' ? FORM64_SLOT_NAMES : REALIZATION64_SLOT_NAMES;
  const contract = bank === 'form' ? 'SCD128-FORM64-v1' : 'SCD128-REALIZATION64-v1';

  if (!Array.isArray(slots) || slots.length !== BLOCKS_PER_BANK) {
    throw new RangeError(`Bank packet must contain exactly 8 slots, got ${slots?.length}`);
  }

  // Verify order and slot names
  for (let i = 0; i < BLOCKS_PER_BANK; i++) {
    const slot = slots[i];
    if (slot.slot !== expectedSlots[i] || slot.position !== i) {
      throw new Error(
        `Slot ${i} mismatch: expected ${expectedSlots[i]} at position ${i}, got ${slot?.slot} at ${slot?.position}`
      );
    }
    if (!BLOCK_HEX_REGEX.test(slot.blockHex)) {
      throw new Error(`Invalid blockHex in slot ${i}: ${slot.blockHex}`);
    }
    if (!DIGEST256_REGEX.test(slot.digest256)) {
      throw new Error(`Invalid digest256 in slot ${i}: ${slot.digest256}`);
    }
  }

  // Ensure no truncated-block collisions within the bank
  assertNoBlockCollisions(slots);

  // Checksum64 is the concatenation of the 8 blocks
  const checksum64 = slots.map((s) => s.blockHex).join('');
  if (checksum64.length !== BANK_WIRE_LENGTH) {
    throw new Error(`checksum64 length must be 64, got ${checksum64.length}`);
  }

  if (bank === 'form' && !FORM64_REGEX.test(checksum64)) {
    throw new Error(`FORM64 checksum64 must begin with '81', got: ${checksum64.slice(0, 4)}`);
  }
  if (bank === 'realization' && !REALIZATION64_REGEX.test(checksum64)) {
    throw new Error(`REALIZATION64 checksum64 must begin with '91', got: ${checksum64.slice(0, 4)}`);
  }

  const frozenSlots = Object.freeze([...slots]);

  const bankPreimage = {
    contract,
    schemaVersion: 1,
    adapterFamily,
    checksum64,
    slots: frozenSlots.map((s) => ({
      slot: s.slot,
      position: s.position,
      canonicalCategory: s.canonicalCategory,
      parameters: s.parameters,
      evidenceRefs: s.evidenceRefs,
      confidence: s.confidence,
      canonicalDerivation: s.canonicalDerivation,
      digest256: s.digest256,
      blockHex: s.blockHex,
    })),
    evidenceDigest: String(evidenceDigest),
  };

  const digest256 = computeCanonicalDigest256(bankPreimage);

  return Object.freeze({
    contract,
    schemaVersion: 1,
    adapterFamily,
    checksum64,
    digest256,
    slots: frozenSlots,
    evidenceDigest: String(evidenceDigest),
  });
}

/**
 * Validates an existing bank packet's internal digests, structure, and wire format.
 */
export function verifyBankPacket(packet) {
  if (!packet || typeof packet !== 'object') {
    return { ok: false, reason: 'Packet is not an object' };
  }
  if (packet.schemaVersion !== 1) {
    return { ok: false, reason: `Invalid schemaVersion: ${packet.schemaVersion}` };
  }
  const isForm = packet.contract === 'SCD128-FORM64-v1';
  const isRealization = packet.contract === 'SCD128-REALIZATION64-v1';
  if (!isForm && !isRealization) {
    return { ok: false, reason: `Unknown contract: ${packet.contract}` };
  }

  if (isForm && !FORM64_REGEX.test(packet.checksum64)) {
    return { ok: false, reason: `FORM64 checksum64 does not match expected wire pattern: ${packet.checksum64}` };
  }
  if (isRealization && !REALIZATION64_REGEX.test(packet.checksum64)) {
    return { ok: false, reason: `REALIZATION64 checksum64 does not match expected wire pattern: ${packet.checksum64}` };
  }

  if (!Array.isArray(packet.slots) || packet.slots.length !== BLOCKS_PER_BANK) {
    return { ok: false, reason: `Packet must have 8 slots, got ${packet.slots?.length}` };
  }

  const expectedSlots = isForm ? FORM64_SLOT_NAMES : REALIZATION64_SLOT_NAMES;
  for (let i = 0; i < BLOCKS_PER_BANK; i++) {
    const s = packet.slots[i];
    if (s.slot !== expectedSlots[i] || s.position !== i) {
      return { ok: false, reason: `Slot ${i} name mismatch: expected ${expectedSlots[i]}, got ${s.slot}` };
    }
  }

  try {
    assertNoBlockCollisions(packet.slots);
  } catch (err) {
    return { ok: false, reason: err.message };
  }

  const reconstructedChecksum = packet.slots.map((s) => s.blockHex).join('');
  if (reconstructedChecksum !== packet.checksum64) {
    return {
      ok: false,
      reason: `checksum64 mismatch: expected ${packet.checksum64}, calculated ${reconstructedChecksum}`,
    };
  }

  return { ok: true };
}

/**
 * Parses a 128-character SCD128 wire string into 16 ordered blocks and 2 bank checksums.
 */
export function parseSCD128Wire(wire) {
  if (typeof wire !== 'string' || !SCD128_REGEX.test(wire)) {
    throw new TypeError(
      `SCD128 wire must be 128 uppercase hex characters, got: '${String(wire).slice(0, 16)}...' (length ${wire?.length})`
    );
  }

  const formChecksum64 = wire.slice(0, 64);
  const realizationChecksum64 = wire.slice(64, 128);

  if (!FORM64_REGEX.test(formChecksum64)) {
    throw new Error(`FORM64 bank must begin with '${FORM64_VERSION_PREFIX}', got '${formChecksum64.slice(0, 2)}'`);
  }
  if (!REALIZATION64_REGEX.test(realizationChecksum64)) {
    throw new Error(
      `REALIZATION64 bank must begin with '${REALIZATION64_VERSION_PREFIX}', got '${realizationChecksum64.slice(0, 2)}'`
    );
  }

  const blocks = [];
  for (let i = 0; i < wire.length; i += BLOCK_HEX_LENGTH) {
    blocks.push(wire.slice(i, i + BLOCK_HEX_LENGTH));
  }

  return Object.freeze({
    wire,
    formChecksum64,
    realizationChecksum64,
    blocks: Object.freeze(blocks),
  });
}

/**
 * Constructs an SCD128ArtPacketV1.
 * IMPORTANT: Per PDR § 6.3, this can only be constructed by the Lawyer after independent validation.
 */
export function assembleArtPacket({ form, realization, sourceProvenance = {} }) {
  const formCheck = verifyBankPacket(form);
  if (!formCheck.ok) throw new Error(`Cannot assemble art packet: ${formCheck.reason}`);
  const realCheck = verifyBankPacket(realization);
  if (!realCheck.ok) throw new Error(`Cannot assemble art packet: ${realCheck.reason}`);

  const checksum128 = form.checksum64 + realization.checksum64;
  if (!SCD128_REGEX.test(checksum128)) {
    throw new Error(`Assembled checksum128 is invalid: ${checksum128}`);
  }

  return Object.freeze({
    contract: 'SCD128-ART-v1',
    schemaVersion: 1,
    checksum128,
    form,
    realization,
    sourceProvenance: Object.freeze({ ...sourceProvenance }),
  });
}
