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
