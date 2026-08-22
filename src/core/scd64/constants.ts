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

/**
 * The value a model returns when it cannot map a slot.
 *
 * SEMANTIC_KIND_THEORY_UNBOUND: an unbound term must NOT be resolved to a
 * plausible default. A model that guesses "probably mandatory" and is right by
 * luck is indistinguishable from one that understood — so guessing is removed
 * as an option and abstention is scored separately from error.
 */
export const MEMORY_UNBOUND = "UNBOUND";

/**
 * MEMORY_SLOT_VOCAB — the closed value set per slot.
 *
 * WHY CLOSED. A slot's hex is sha256 of its canonical string, so a round-trip
 * scores IDENTICAL only when the second reader reproduces that string EXACTLY.
 * Free-form values make that unreachable and the transport test unpassable.
 * The vocabulary is the contract two models agree on; it is also the thing a
 * reader must carry, so it is deliberately small — see the budget assertion in
 * memory-l2-transport.test.ts.
 */
export const MEMORY_SLOT_VOCAB: Record<string, readonly string[]> = Object.freeze({
  // What kind of claim. MEASURED_WITH vs CAUSES is a real recorded drift.
  BUGCLASS:  Object.freeze(["RULE", "PREF", "REFUTED", "MEASURED_WITH", "CAUSES", MEMORY_UNBOUND]),
  COORDSYS:  Object.freeze(["repo-global", "module", "file", "corpus", "held-out-split", "session", MEMORY_UNBOUND]),
  // mandatory vs preferred is the other recorded drift.
  INVARIANT: Object.freeze(["mandatory", "preferred", "forbidden", MEMORY_UNBOUND]),
  MAGNITUDE: Object.freeze(["none", "weak", "tentative", "strong", "contradicted", MEMORY_UNBOUND]),
  MASKING:   Object.freeze(["none-declared", "user-override", "harmful-structure", "context-differs", MEMORY_UNBOUND]),
  GATE:      Object.freeze(["experimental", "stable", "retired", MEMORY_UNBOUND]),
  PROPAGATE: Object.freeze(["source-episodes", "semantic-pattern", "procedure", "superseding-pattern", MEMORY_UNBOUND]),
  VERDICT:   Object.freeze(["counterexample-observed", "matched-control-clears-chance", "interceptions-zero", "never-stated", MEMORY_UNBOUND]),
});

/**
 * The version byte is a function of CLAIM_KIND, not of an arbitrary family id —
 * slot 0 IS the claim kind, so the byte that prefixes it should say the same
 * thing. This is what lets a record be rebuilt from its values alone.
 */
export const CLAIM_KIND_VERSION_BYTE: Record<string, string> = Object.freeze({
  RULE: "B1",
  PREF: "B2",
  REFUTED: "B3",
  MEASURED_WITH: "B4",
  CAUSES: "B5",
  [MEMORY_UNBOUND]: "B0",
});
