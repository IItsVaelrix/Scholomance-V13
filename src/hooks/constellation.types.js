/**
 * ConstellationOS Page packet contract — CANONICAL SCHEMA HOME.
 *
 * LAW-LAYER-002 repair (2026-08-17): this packet is a server->UI contract.
 * SCHEMA_CONTRACT assigns packet schemas to Codex. src/hooks/ is Codex-owned
 * jurisdiction (CLAUDE.md ownership table) AND is legally consumable by the UI
 * layer, so it is the one home both producer (codex/server) and consumer (UI)
 * may reference without crossing a prohibited layer boundary.
 *
 * CONTRACT SOVEREIGNTY repair (2026-08-19, feedback report P0-1): the producer
 * (codex/server/services/constellationPage.service.js) has emitted a Phase-2
 * packet since the phrase-analysis/scale-field/discovery work landed, while
 * this file still declared the Phase-1 shape. That drift ended here: this file
 * now freezes the ACTUAL emitted packet. The normative publication lives in
 * docs/scholomance-encyclopedia/Scholomance LAW/SCHEMA_CONTRACT.md under
 * "SCHOL-COS-PAGE-v2". Any future field addition is a SCHEMA CHANGE NOTICE,
 * not a silent edit.
 *
 * VERSION VOCABULARY (one coherent set, per feedback report §11 step 2):
 *   - contractVersion  'cos-page-v2'      — the packet contract itself (this file)
 *   - schema_id        'scholomance/constellation-os-page-phase2'
 *   - version          2                  — integer packet generation
 *   - engineVersions   per-channel adapter/engine versions (provenance)
 *   - corpusChecksum   — when corpus evidence participates (bytecode basis)
 *
 * Type-only: JSDoc typedefs, zero runtime logic, erased at build. Do NOT add
 * executable code here — that would turn a contract into a layer violation.
 */

/**
 * @typedef {'word'|'phrase'|'line'|'multiline'|'discovery'|'comparison'|'transformation'} ConstellationQueryKind
 */

/**
 * @typedef {'literary'|'meta-query'|'craft-instruction'|'comparison'} ConstellationIntent
 */

/**
 * @typedef {object} ConstellationPagePacket
 * @property {2} version Packet generation. Phase-2 since phrase analysis landed.
 * @property {'scholomance/constellation-os-page-phase2'} schema_id
 * @property {string} pageBytecode `COS-PAGE-v1-{hex}` — identity over the lawful
 *   analysis inputs only (PDR §16); excludes request time, cache, user identity.
 * @property {{ raw: string, normalized: string, kind: ConstellationQueryKind, tokenCount: number, graphemeCount: number, intent: ConstellationIntent|null }} query
 * @property {{ intent: ConstellationIntent|null, headToken: string|null,
 *   headDecidedBy: 'rarity'|'last-content'|null,
 *   headPool: string[],
 *   headDemoted: Array<{ token: string, reason: string }>,
 *   compounds: string[],
 *   tokenRoles: Array<{ token: string, role: 'head'|'modifier'|'connector'|'specifier' }>,
 *   devices: string[] }} phraseStructure The structure channel: how the anchor was
 *   chosen and which cue vetoed each rejected candidate, so a surprising anchor
 *   can be traced rather than argued with.
 * @property {{ status: 'resolved'|'ambiguous'|'unsupported',
 *   selectedInterpretationId: string|null,
 *   selectedBy: 'probe'|'frame'|'rank'|null,
 *   interpretations: Array<{ id: string, gloss: string, confidence: number, pos?: string, examples?: string[] }>,
 *   warnings: string[], nearKin?: string[], counterfield?: string[],
 *   etymology?: string|null,
 *   rarity?: { band: number, max: number, label: string }|null,
 *   relations?: { broader: string[], narrower: string[], akin: string[] },
 *   anchor?: string|null, lookupToken?: string|null, compoundUsed?: string|null }} leximancy
 * @property {{ phonemes: string[], stress: string, cadenceFamily: string, exactRhymes: string[], slantRhymes: string[], dominantVowelFamily?: string|null, ipa?: string|null } | null} rhymeAstrology
 * @property {{ syllables: number, devicesHint: string[], schoolHint: string|null }} phraseGenome
 * @property {{ status: string, bound: boolean, probeId: string|null,
 *   hypotheses: object[], selection: object|null, evidence: object[],
 *   isHeteronym: boolean, distinctPronunciations: number|null,
 *   headToken: string|null, framePos: string|null, frameCue: string|null,
 *   viableWordCount: number|null, lexicalEntries: object[] } | null} semanticInquiry
 *   The probe's verdict travels WITH the page — a reader can see not just which
 *   sense was chosen but whether the choice was evidenced.
 * @property {{ status: string, anchor: string|null,
 *   scale: { id: string, dimension: string|null, kind: string, memberCount: number,
 *     span: number|null, ladder: Array<{ word: string, rank: number, relative: number, isAnchor: boolean }> }|null,
 *   neighbours: Array<{ word: string, similarity: number, source: string, method: string|null, localSimilarity: number|null, soundSimilarity: number|null }>,
 *   opposites: string[], warnings: string[] } | null} scaleField `null` means
 *   "not measured", never "no field exists".
 * @property {{ contested: boolean,
 *   primary: { anchor: string, role: string, proposedBy: string, rationale: string, candidate: boolean }|null,
 *   readings: Array<{ anchor: string, role: string, proposedBy: string, rationale: string, candidate: boolean }>,
 *   silent: string[] }} readings Competing analyses left standing; `contested`
 *   is a first-class result, not a failure.
 * @property {Array<{ adjective: string, governor: string|null, relation: 'attributive'|'predicative'|null, distance: number, cue?: string }>} governed
 *   Adjective -> the noun it modifies. First channel answering about a phrase's
 *   INTERNAL structure rather than one lifted token.
 * @property {object|null} [discovery] Discovery channel payload (meta-query only);
 *   null for literary/craft/comparison.
 * @property {{ degradedChannels: string[], warnings: string[], discovery?: { stage: string, message: string|null } }} diagnostics
 * @property {{ engineVersions: Record<string, string> }} provenance
 */

/**
 * @deprecated Legacy alias retained so existing consumers keep compiling while
 * they migrate. New code must reference {@link ConstellationPagePacket}. The
 * Phase-1 shape (version 1, schema_id ...-phase1) no longer exists anywhere in
 * the live system — this alias now points at the Phase-2 contract.
 * @typedef {ConstellationPagePacket} ConstellationPhase1Packet
 */
export {};
