/**
 * @typedef {'word'|'phrase'|'line'|'multiline'|'discovery'|'comparison'|'transformation'} ConstellationQueryKind
 */

/**
 * @typedef {object} ConstellationPhase1Packet
 * @property {1} version
 * @property {'scholomance/constellation-os-page-phase1'} schema_id
 * @property {string} pageBytecode
 * @property {{ raw: string, normalized: string, kind: ConstellationQueryKind, tokenCount: number, graphemeCount: number }} query
 * @property {{ status: 'resolved'|'ambiguous'|'unsupported', selectedInterpretationId: string|null, interpretations: Array<{ id: string, gloss: string, confidence: number, pos?: string, examples?: string[] }>, warnings: string[], nearKin?: string[], counterfield?: string[], etymology?: string|null, rarity?: { band: number, max: number, label: string }|null, relations?: { broader: string[], narrower: string[], akin: string[] } }} leximancy
 * @property {{ phonemes: string[], stress: string, cadenceFamily: string, exactRhymes: string[], slantRhymes: string[], dominantVowelFamily?: string|null, ipa?: string|null } | null} rhymeAstrology
 * @property {{ syllables: number, devicesHint: string[], schoolHint: string|null }} phraseGenome
 * @property {object|null} [discovery] Discovery channel payload (meta-query only); null for literary/craft/comparison
 * @property {{ degradedChannels: string[], warnings: string[], discovery?: { stage: string, message: string|null } }} diagnostics
 * @property {{ engineVersions: Record<string, string> }} provenance
 */
export {};
