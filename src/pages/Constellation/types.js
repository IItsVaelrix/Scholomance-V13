/**
 * @typedef {'word'|'phrase'|'line'|'multiline'|'discovery'|'comparison'|'transformation'} ConstellationQueryKind
 */

/**
 * @typedef {object} ConstellationPhase1Packet
 * @property {1} version
 * @property {'scholomance/constellation-os-page-phase1'} schema_id
 * @property {string} pageBytecode
 * @property {{ raw: string, normalized: string, kind: ConstellationQueryKind, tokenCount: number, graphemeCount: number }} query
 * @property {{ status: 'resolved'|'ambiguous'|'unsupported', selectedInterpretationId: string|null, interpretations: Array<{ id: string, gloss: string, confidence: number, pos?: string }>, warnings: string[], nearKin?: string[], counterfield?: string[] }} leximancy
 * @property {{ phonemes: string[], stress: string, cadenceFamily: string, exactRhymes: string[], slantRhymes: string[] } | null} rhymeAstrology
 * @property {{ syllables: number, devicesHint: string[], schoolHint: string|null }} phraseGenome
 * @property {{ degradedChannels: string[], warnings: string[] }} diagnostics
 * @property {{ engineVersions: Record<string, string> }} provenance
 */
export {};
