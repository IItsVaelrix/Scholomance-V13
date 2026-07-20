// JSDoc mirror of SCHEMA_CONTRACT.md multi-candidate Analyze contracts.

/**
 * @typedef {'word'|'selection'|'line'|'local'|'document'} AnalysisScope
 * @typedef {{scope:'word', surface:string}
 *   | {scope:'selection', surface:string, selection:string}
 *   | {scope:'line', surface:string, containingLine:string}
 *   | {scope:'local', surface:string, containingLine:string, neighboringLines:string[]}
 *   | {scope:'document', surface:string, documentContext:string}} AnalysisContextInput
 * @typedef {{version:'ANALYSIS_CONTEXT_v1', scope:AnalysisScope, contextHash:string}} AnalysisContextIdentity
 * @typedef {AnalysisContextInput & AnalysisContextIdentity} AnalysisContext
 * @typedef {{version:string, status:'complete'|'partial'|'unavailable', sourceDigest:string, expectedLemmaCount:number, indexedLemmaCount:number}} MorphologyIndexState
 * @typedef {{surface:string, lemma:string, pos:string, transformId:string, source:string, irregular:boolean, morphologicalConfidence:number}} LemmaForm
 * @typedef {{channel:'morphology'|'semantics'|'pos'|'corpus', score:number, available:boolean, source:string, reason:string, contextSegments?:string[]}} CandidateEvidence
 * @typedef {{synsetId:string, definition:string, semanticScore?:number, bucketIds?:string[], embeddingKind?:string, embeddingVersion?:string, embeddingDimensions?:number}} SenseCandidate
 * @typedef {{id:string, lemma:string, pos:string, rank:number, score:number, evidence:CandidateEvidence[], senses:SenseCandidate[]}} LemmaCandidate
 * @typedef {'clear'|'ambiguous'|'unbound'} LemmaResolutionStatus
 * @typedef {{surface:string, status:LemmaResolutionStatus, margin:number, threshold:number, formulaVersion:string, morphologyIndex:MorphologyIndexState, candidates:LemmaCandidate[]}} LemmaResolution
 * @typedef {{code:string, channel:'morphology'|'semantics'|'pos'|'corpus'|'retrieval', reason:string}} AnalysisDegradation
 * @typedef {{key:string, label:string, items:object[], emptyReason?:string}} AnalyzeGroup
 * @typedef {{candidateId:string, groups:AnalyzeGroup[]}} CandidateAnalyzeResult
 * @typedef {{context:AnalysisContextIdentity, resolution:LemmaResolution, sharedGroups:AnalyzeGroup[], candidateResults:CandidateAnalyzeResult[], degradation:AnalysisDegradation[]}} AnalyzeResult
 */

export {};
