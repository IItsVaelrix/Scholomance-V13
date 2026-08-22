export const SCD64_SLOT_NAMES = [
  "BUGCLASS",
  "COORDSYS",
  "INVARIANT",
  "MAGNITUDE",
  "MASKING",
  "GATE",
  "PROPAGATE",
  "VERDICT"
] as const;

export const SCD64_REGEX = /^[0-9A-F]{64}$/;

// ─── ART Domain (§ PDR Phase 3) ─────────────────────────────────────────────
// The physical eight-slot wire contract is PRESERVED. ART families reuse the
// same eight slots with domain-aware aliases for art-direction interpretation.

export const ART_SLOT_ALIASES = Object.freeze({
  BUGCLASS:  "ART_CLASS",
  COORDSYS:  "CANVAS_SYS",
  INVARIANT: "DOCTRINE",
  MAGNITUDE: "VALUE_RAMP",
  MASKING:   "OCCLUSION",
  GATE:      "APPROVAL_GATE",
  PROPAGATE: "PROJECTION_PATH",
  VERDICT:   "CURATOR_VERDICT",
} as const);

export type ArtSlotAlias = typeof ART_SLOT_ALIASES[keyof typeof ART_SLOT_ALIASES];

// ─── MEMORY Domain (MemoryIR / Mnemosyne) ───────────────────────────────────
// The third domain on the eight-slot wire, after bug families and ART. The
// physical contract is PRESERVED — a memory record is one SCD64, and each slot
// carries one facet of the claim it encodes.
//
// The mapping is not arbitrary; each alias inherits its slot's structural role:
//   BUGCLASS  names WHAT KIND of thing this is        -> CLAIM_KIND
//   COORDSYS  names the frame it was measured in      -> SCOPE
//   INVARIANT names what must hold                    -> MODALITY
//   MAGNITUDE names how much                          -> EVIDENCE
//   MASKING   names what is excluded / hidden         -> EXCEPTION
//   GATE      names the admission decision            -> ADMISSION
//   PROPAGATE names how it reaches other things       -> TARGETS
//   VERDICT   names the call, and what would undo it  -> UNBINDS_IF

export const MEMORY_SLOT_ALIASES = Object.freeze({
  BUGCLASS:  "CLAIM_KIND",
  COORDSYS:  "SCOPE",
  INVARIANT: "MODALITY",
  MAGNITUDE: "EVIDENCE",
  MASKING:   "EXCEPTION",
  GATE:      "ADMISSION",
  PROPAGATE: "TARGETS",
  VERDICT:   "UNBINDS_IF",
} as const);

export type MemorySlotAlias = typeof MEMORY_SLOT_ALIASES[keyof typeof MEMORY_SLOT_ALIASES];
