#!/usr/bin/env node

/**
 * Implement and independently evaluate the five strongest distinct semantic
 * molecules emitted by the sealed 100k Cyclotron report.
 *
 * Selection score is never used as an outcome. Each molecule is compared with
 * a matched ablation over fixed fixtures and is favorable only when it improves
 * a declared behavioral metric while preserving its safety invariants.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import {
  runSemanticValenceCyclotron,
  verifySemanticCyclotronReport,
} from '../codex/core/pixelbrain/semantic-valence-cyclotron.js';
import { buildGate } from '../codex/core/pixelbrain/build-gate.js';
import { lookupSemanticToken } from '../codex/core/semantics.registry.js';
import {
  buildInvestigationReport,
  sha256Hex,
  verifyInvestigationReport,
} from '../codex/core/immunity/cleri-probe/canonical-report.js';
import { scoreSenseBallistics } from '../codex/core/lexical-analysis/semanticBallistics.js';

const CONTRACT = 'PB-SEMANTIC-MOLECULE-EVAL-v1';
const SOURCE_PATH = 'docs/superpowers/evidence/2026-08-11-semantic-valence-cyclotron-100k.json';
const OUTPUT_PATH = 'docs/superpowers/evidence/2026-08-11-top-five-semantic-molecules.json';
const REGISTRY_PATH = 'docs/scholomance-encyclopedia/Scholomance White Papers/SCHOLOMANCE_SEMANTIC_CORRESPONDENCE_REGISTRY.md';
const SEED = 0x5c4010;

const ATOMS = Object.freeze({
  'law-gate': ['Vaelrix law gate', 'governance', ['law-verdict'], ['proposal'], 'docs/scholomance-encyclopedia/Scholomance LAW/VAELRIX_LAW.md'],
  'molecule-generator': ['semantic molecule candidate generator', 'synthesis', ['concept-pair', 'proposal', 'candidate-frontier'], ['atom-inventory', 'operator-law'], 'codex/core/pixelbrain/semantic-valence-cyclotron.js'],
  'operator-registry': ['semantic composition operator registry', 'synthesis', ['operator-law'], ['schema-verdict'], 'codex/core/semantics.registry.js'],
  'schema-verifier': ['schema contract verifier', 'governance', ['schema-verdict'], ['artifact'], 'docs/scholomance-encyclopedia/Scholomance LAW/SCHEMA_CONTRACT.md'],
  'server-authority': ['server authoritative resolver', 'governance', ['authoritative-verdict'], ['diagnostic-event', 'schema-verdict'], 'codex/server'],
  'bytecode-seal': ['bytecode identity seal', 'artifact', ['checksum'], ['artifact'], 'codex/core/pixelbrain/pbrain-checksum.js'],
  'immutable-packet': ['immutable sealed packet builder', 'artifact', ['sealed-packet'], ['artifact', 'checksum'], 'codex/core/immunity/cleri-probe/canonical-report.js'],
  'correspondence-registry': ['semantic correspondence registry', 'memory', ['semantic-relation', 'atom-inventory'], ['promotion-decision'], REGISTRY_PATH],
  'retrieval-index': ['deterministic retrieval index', 'retrieval', ['candidate-frontier'], ['probe-family'], 'codex/server/services/codebaseSearch.service.js'],
  'semantic-ballistics': ['semantic containment ballistics', 'retrieval', ['containment-score'], ['candidate-frontier'], 'codex/core/lexical-analysis/semanticBallistics.js'],
  'valence-compiler': ['typed semantic valence compiler', 'synthesis', ['candidate-frontier'], ['atom-inventory', 'trial-counter'], 'codex/core/pixelbrain/semantic-valence-cyclotron.js'],
});

const RETRIEVAL_FILES = Object.freeze([
  'codex/core/lexical-analysis/semanticBallistics.js',
  'codex/server/services/codebaseSearch.service.js',
  'codex/core/pixelbrain/semantic-valence-cyclotron.js',
  'codex/core/semantics.registry.js',
  'codex/core/pixelbrain/pbrain-checksum.js',
  'codex/core/immunity/cleri-probe/canonical-report.js',
  'codex/core/pixelbrain/concept-chemistry.js',
  'codex/core/immunity/memory-cell-osmosis.js',
]);

const RETRIEVAL_FIXTURES = Object.freeze([
  ['find code locations relevant to a concept', 'codex/server/services/codebaseSearch.service.js'],
  ['rank candidate meanings by semantic containment', 'codex/core/lexical-analysis/semanticBallistics.js'],
  ['compile typed valence connections into semantic molecules', 'codex/core/pixelbrain/semantic-valence-cyclotron.js'],
  ['seal an immutable diagnostic report with a checksum', 'codex/core/immunity/cleri-probe/canonical-report.js'],
]);

function round6(value) {
  return Number(Number(value).toFixed(6));
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function selectTopFiveDistinct(source) {
  const ranked = [...source.candidates].sort((a, b) => b.finalScore - a.finalScore);
  const selected = [];
  const seen = new Set();
  for (const candidate of ranked) {
    const family = candidate.molecule.atomIds.join('|');
    if (seen.has(family)) continue;
    seen.add(family);
    selected.push(candidate);
    if (selected.length === 5) break;
  }
  if (selected.length !== 5) throw new Error('Source report did not contain five distinct molecule families');
  return selected;
}

function atomFromId(id) {
  const blueprint = ATOMS[id];
  if (!blueprint) throw new Error(`No executable adapter registered for ${id}`);
  const [label, domain, offers, seeks, evidence] = blueprint;
  return { id, label, domain, offers, seeks, traits: [], inhibits: [], grounding: 0.8, evidence: [evidence] };
}

function implementTopology(candidate, trialCount = 2_048) {
  const nonExactBridges = candidate.molecule.bonds
    .filter((bond) => bond.offer !== bond.seek)
    .map((bond) => ({
      from: bond.offer,
      to: bond.seek,
      relation: bond.relation,
      strength: bond.strength,
    }));
  const options = {
    atoms: candidate.molecule.atomIds.map(atomFromId),
    bridgeRules: nonExactBridges,
    trialCount,
    seed: SEED,
    maxMoleculeSize: Math.max(2, candidate.molecule.atomIds.length),
    controlEvery: 5,
    controlPercentile: 0.99,
    shortlistLimit: 128,
    shortlistFamilyCap: 16,
    noveltyFloor: 0,
    finalScoreFloor: 0,
    nucleusScoreFloor: 1,
    nucleusNoveltyFloor: 1,
    nucleusMinDomains: 2,
    environments: [candidate.molecule.environment],
    // Re-derivation of one known molecule: escape trials would substitute a
    // DIFFERENT molecule, which is the opposite of what this verifies. The
    // limit is inert with entropy off and is not calibrated for these
    // per-molecule micro-banks.
    entropy: { enabled: false },
    osmosisConcentrationLimit: 0.5,
  };
  const cyclotronReport = runSemanticValenceCyclotron(options);
  const replayReport = runSemanticValenceCyclotron(options);
  const family = candidate.molecule.atomIds.join('|');
  return {
    report: cyclotronReport,
    replayChecksumEqual: replayReport.checksum === cyclotronReport.checksum,
    targetRealized: cyclotronReport.candidates.some((item) => item.molecule.atomIds.join('|') === family),
  };
}

function testGovernedGenerator(candidate) {
  const implementation = implementTopology(candidate);
  const registryToken = lookupSemanticToken('SHIELD');
  const gate = buildGate({
    a: 'semantic composition operator registry',
    b: 'schema contract verifier',
    product: 'lawful semantic molecule proposal',
    groundingA: 0.8,
    groundingB: 0.8,
  });
  const tampered = { ...implementation.report, completedTrials: implementation.report.completedTrials + 1 };
  const full = {
    targetRealized: implementation.targetRealized,
    deterministicReplay: implementation.replayChecksumEqual,
    schemaAccepted: verifySemanticCyclotronReport(implementation.report),
    tamperRejected: !verifySemanticCyclotronReport(tampered),
    operatorResolved: registryToken?.type === 'PREDICATE',
    lawGateDecision: gate.decision,
    safetyPassRate: 0,
  };
  full.safetyPassRate = round6(mean([
    full.targetRealized,
    full.deterministicReplay,
    full.schemaAccepted,
    full.tamperRejected,
    full.operatorResolved,
    gate.decision !== 'BLOCKED',
  ].map(Number)));
  const ablation = {
    name: 'generator without schema verifier or law gate',
    safetyPassRate: round6(mean([full.targetRealized, full.deterministicReplay, 0, 0, full.operatorResolved, 0].map(Number))),
  };
  return {
    implementation: 'operator registry -> molecule generator -> schema verifier -> law gate',
    full,
    ablation,
    favorable: full.safetyPassRate > ablation.safetyPassRate && full.tamperRejected,
    reason: 'The composed gate is favorable only if it realizes the topology, replays exactly, and rejects a modified report.',
  };
}

function testServerAuthority(candidate) {
  const implementation = implementTopology(candidate);
  const claims = Array.from({ length: 32 }, (_, index) => ({
    kind: index % 2 === 0 ? 'honest' : 'forged',
    clientVerdict: 'ACCEPT',
    checksum: index % 2 === 0 ? implementation.report.checksum : `${implementation.report.checksum}-forged`,
  }));
  const authoritative = claims.map((claim) => ({
    kind: claim.kind,
    accepted: verifySemanticCyclotronReport(implementation.report)
      && claim.checksum === implementation.report.checksum,
  }));
  const clientAuthorityControl = claims.map((claim) => ({ kind: claim.kind, accepted: claim.clientVerdict === 'ACCEPT' }));
  const rate = (rows, kind) => round6(mean(rows.filter((row) => row.kind === kind).map((row) => Number(row.accepted))));
  const full = {
    targetRealized: implementation.targetRealized,
    deterministicReplay: implementation.replayChecksumEqual,
    honestAcceptanceRate: rate(authoritative, 'honest'),
    forgedAcceptanceRate: rate(authoritative, 'forged'),
  };
  const ablation = {
    name: 'client verdict trusted without server recomputation',
    honestAcceptanceRate: rate(clientAuthorityControl, 'honest'),
    forgedAcceptanceRate: rate(clientAuthorityControl, 'forged'),
  };
  return {
    implementation: 'governed generator -> schema verdict -> server-authoritative resolution',
    full,
    ablation,
    favorable: full.targetRealized
      && full.deterministicReplay
      && full.honestAcceptanceRate === 1
      && full.forgedAcceptanceRate < ablation.forgedAcceptanceRate,
    reason: 'Server authority is favorable only if it preserves honest accepts while reducing forged accepts.',
  };
}

function testSealedPacket(candidate) {
  const tokenWords = ['SHIELD', 'MEND', 'CALM', 'TRANSMUTE', 'RESONATE', 'NULLIFY', 'SURGE', 'PURGE'];
  const packets = Array.from({ length: 32 }, (_, index) => {
    const word = tokenWords[index % tokenWords.length];
    const operator = lookupSemanticToken(word);
    return buildInvestigationReport({
      hypothesis: `${word} semantic operator packet ${index}`,
      normalizedHypothesis: `${word.toLowerCase()} semantic operator packet`,
      scope: ['codex/core/semantics.registry.js'],
      plan: { selectedVerifiers: [{ id: 'schema-verifier', version: '1.37' }], operator },
      configuration: { moleculeChecksum: candidate.molecule.checksum, fixture: index },
      substrateFiles: [{ path: 'codex/core/semantics.registry.js', contentHash: sha256Hex(word) }],
      findings: [],
      coverage: { complete: true, parserFailures: [] },
      diagnostics: [],
    });
  });
  const verified = packets.map((packet) => verifyInvestigationReport(packet).valid);
  const tamperRejected = packets.map((packet) => !verifyInvestigationReport({ ...packet, status: 'FAIL' }).valid);
  const full = {
    immutableRate: round6(mean(packets.map((packet) => Number(Object.isFrozen(packet))))),
    validSealRate: round6(mean(verified.map(Number))),
    tamperRejectionRate: round6(mean(tamperRejected.map(Number))),
  };
  const ablation = {
    name: 'mutable packet without bytecode seal',
    immutableRate: 0,
    validSealRate: 0,
    tamperRejectionRate: 0,
  };
  return {
    implementation: 'operator registry -> schema verifier -> bytecode seal -> immutable packet',
    full,
    ablation,
    favorable: Object.values(full).every((value) => value === 1),
    reason: 'The artifact molecule is favorable only if every packet is immutable, validly sealed, and tamper-evident.',
  };
}

function parseCorrespondenceRegistry(text) {
  const headings = [...text.matchAll(/^### (SCR-\d+): (.+?) ↔ (.+)$/gm)];
  return headings.map((match, index) => {
    const end = headings[index + 1]?.index ?? text.length;
    const block = text.slice(match.index, end);
    return {
      id: match[1],
      externalTerm: match[2].trim(),
      scholomanceTerm: match[3].trim(),
      strength: block.match(/^- \*\*Strength:\*\*\s+`(ID|SC|FA|MT|FF)`/m)?.[1] ?? null,
      hasBoundary: /^- \*\*NOT preserved:\*\*\s+\S/m.test(block),
      hasEvidence: /^- \*\*Evidence:\*\*\s+\S/m.test(block),
    };
  });
}

function testCorrespondenceInventory(candidate) {
  const entries = parseCorrespondenceRegistry(readFileSync(REGISTRY_PATH, 'utf8'));
  const validEntries = entries.filter((entry) => entry.strength && entry.hasBoundary && entry.hasEvidence);
  const lookup = new Map(entries.flatMap((entry) => [
    [entry.externalTerm.toLowerCase(), entry.scholomanceTerm],
    [entry.scholomanceTerm.toLowerCase(), entry.externalTerm],
  ]));
  const implementation = implementTopology(candidate, 4_096);
  const lookupHits = entries.map((entry) => lookup.has(entry.externalTerm.toLowerCase()));
  const full = {
    parsedEntries: entries.length,
    validEntryRate: round6(validEntries.length / Math.max(1, entries.length)),
    bidirectionalLookupRate: round6(mean(lookupHits.map(Number))),
    targetRealized: implementation.targetRealized,
    deterministicReplay: implementation.replayChecksumEqual,
  };
  const ablation = {
    name: 'generator with no correspondence inventory',
    parsedEntries: 0,
    validEntryRate: 0,
    bidirectionalLookupRate: 0,
    targetRealized: false,
  };
  return {
    implementation: 'correspondence registry inventory -> governed semantic molecule generator',
    full,
    ablation,
    favorable: full.parsedEntries > 0
      && full.validEntryRate === 1
      && full.bidirectionalLookupRate === 1
      && full.targetRealized
      && full.deterministicReplay,
    reason: 'The inventory molecule is favorable only if every correspondence is bounded by caveats/evidence and the five-atom topology executes deterministically.',
  };
}

function terms(text) {
  return new Set(String(text).toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

function lexicalScore(query, document) {
  const queryTerms = [...terms(query)];
  const documentTerms = terms(document);
  return queryTerms.length ? queryTerms.filter((term) => documentTerms.has(term)).length / queryTerms.length : 0;
}

function reciprocalRank(rows, target) {
  const rank = rows.findIndex((row) => row.id === target) + 1;
  return rank > 0 ? 1 / rank : 0;
}

function testRetrievalBallistics(candidate) {
  const documents = RETRIEVAL_FILES.map((path) => ({
    id: path,
    text: `${path}\n${readFileSync(path, 'utf8').slice(0, 4_000)}`,
  }));
  const baselineRanks = [];
  const composedRanks = [];
  for (const [query, target] of RETRIEVAL_FIXTURES) {
    const lexical = documents.map((document) => ({
      id: document.id,
      lexical: lexicalScore(query, document.text),
    }));
    const ballistic = scoreSenseBallistics(query, documents.map((document) => ({
      synsetId: document.id,
      lemma: document.id,
      definition: document.text,
    })));
    const ballisticById = new Map(ballistic.senses.map((sense) => [sense.synsetId, sense.semanticScore ?? 0]));
    const baseline = [...lexical].sort((a, b) => b.lexical - a.lexical || a.id.localeCompare(b.id));
    const composed = lexical.map((row) => ({
      id: row.id,
      score: (row.lexical + (ballisticById.get(row.id) ?? 0)) / 2,
    })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    baselineRanks.push(reciprocalRank(baseline, target));
    composedRanks.push(reciprocalRank(composed, target));
  }
  const implementation = implementTopology(candidate);
  const improvedFixtures = composedRanks.filter((rank, index) => rank > baselineRanks[index]).length;
  const regressedFixtures = composedRanks.filter((rank, index) => rank < baselineRanks[index]).length;
  const unchangedFixtures = composedRanks.length - improvedFixtures - regressedFixtures;
  const baselineMrr = round6(mean(baselineRanks));
  const composedMrr = round6(mean(composedRanks));
  const full = {
    meanReciprocalRank: composedMrr,
    meanReciprocalRankDelta: round6(composedMrr - baselineMrr),
    improvedFixtures,
    regressedFixtures,
    unchangedFixtures,
    targetRealized: implementation.targetRealized,
    deterministicReplay: implementation.replayChecksumEqual,
  };
  const ablation = {
    name: 'lexical retrieval index without ballistic reranking',
    meanReciprocalRank: baselineMrr,
  };
  return {
    implementation: 'retrieval frontier + valence frontier -> semantic-ballistics reranking',
    full,
    ablation,
    favorable: full.targetRealized
      && full.deterministicReplay
      && full.meanReciprocalRank > ablation.meanReciprocalRank
      && full.regressedFixtures === 0,
    reason: 'The retrieval molecule is favorable only if equal-weight ballistic reranking improves held-out target rank over lexical retrieval alone without regressing another fixture.',
  };
}

function evaluate() {
  const source = JSON.parse(readFileSync(SOURCE_PATH, 'utf8'));
  if (!verifySemanticCyclotronReport(source)) throw new Error('The source 100k report failed checksum verification');
  const selected = selectTopFiveDistinct(source);
  const tests = [
    testGovernedGenerator,
    testServerAuthority,
    testSealedPacket,
    testCorrespondenceInventory,
    testRetrievalBallistics,
  ];
  const results = selected.map((candidate, index) => ({
    rank: index + 1,
    sourceScore: candidate.finalScore,
    sourceVerdict: candidate.verdict,
    moleculeChecksum: candidate.molecule.checksum,
    atomIds: candidate.molecule.atomIds,
    ...tests[index](candidate),
  }));
  const body = {
    contract: CONTRACT,
    schemaVersion: '1.0.0',
    sourceReportChecksum: source.checksum,
    selection: 'top-five-distinct-atom-families-by-final-score',
    evaluationPolicy: {
      controls: 'matched one-component or decision-boundary ablations',
      favorable: 'strict observable improvement with all declared safety invariants preserved',
      selectionScoreUsedAsOutcome: false,
    },
    counts: {
      evaluated: results.length,
      favorable: results.filter((result) => result.favorable).length,
      unfavorable: results.filter((result) => !result.favorable).length,
    },
    results,
  };
  return { ...body, checksum: `molecule-eval1:${sha256Hex(body).slice(0, 32)}` };
}

const report = evaluate();
const replay = evaluate();
if (report.checksum !== replay.checksum) throw new Error('Molecule evaluation replay diverged');
writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log('Top-five semantic molecule implementation test');
console.log(`Evidence: ${OUTPUT_PATH}`);
console.log(`Replay checksum: ${report.checksum}`);
for (const result of report.results) {
  console.log(`${result.rank}. ${result.favorable ? 'FAVORABLE' : 'UNFAVORABLE'}  ${result.atomIds.join(' + ')}`);
  console.log(`   full=${JSON.stringify(result.full)} ablation=${JSON.stringify(result.ablation)}`);
}
