/**
 * @typedef {'word'|'phrase'|'line'|'multiline'|'discovery'|'comparison'|'transformation'} ConstellationQueryKind
 */

/**
 * @typedef {object} ConstellationPhase1Packet
 * @property {1} version
 * @property {'scholomance/constellation-os-page-phase1'} schema_id
 * @property {string} pageBytecode
 * @property {{ raw: string, normalized: string, kind: ConstellationQueryKind, tokenCount: number, graphemeCount: number }} query
 * @property {{ status: 'resolved'|'ambiguous'|'unsupported', selectedInterpretationId: string|null, selectedBy?: 'probe'|'frame'|'rank'|null, interpretations: Array<{ id: string, gloss: string, confidence: number, pos?: string, examples?: string[] }>, warnings: string[], nearKin?: string[], counterfield?: string[], etymology?: string|null, rarity?: { band: number, max: number, label: string }|null, relations?: { broader: string[], narrower: string[], akin: string[] } }} leximancy
 * @property {{ phonemes: string[], stress: string, cadenceFamily: string, exactRhymes: string[], slantRhymes: string[], dominantVowelFamily?: string|null, ipa?: string|null } | null} rhymeAstrology
 * @property {{ syllables: number, devicesHint: string[], schoolHint: string|null }} phraseGenome
 * @property {{ status: string, anchor: string|null,
 *   scale: { id: string, dimension: string|null, kind: string, memberCount: number,
 *     span: number|null, ladder: Array<{ word: string, rank: number, relative: number, isAnchor: boolean }> }|null,
 *   neighbours: Array<{ word: string, similarity: number, source: string, method: string|null, localSimilarity: number|null, soundSimilarity: number|null }>,
 *   opposites: string[], warnings: string[] } | null} scaleField
 * @property {{ contested: boolean,
 *   primary: { anchor: string, role: string, proposedBy: string, rationale: string, candidate: boolean }|null,
 *   readings: Array<{ anchor: string, role: string, proposedBy: string, rationale: string, candidate: boolean }>,
 *   silent: string[] }} readings
 * @property {object|null} [discovery] Discovery channel payload (meta-query only); null for literary/craft/comparison
 * @property {{ degradedChannels: string[], warnings: string[], discovery?: { stage: string, message: string|null } }} diagnostics
 * @property {{ engineVersions: Record<string, string> }} provenance
 */
export {};
