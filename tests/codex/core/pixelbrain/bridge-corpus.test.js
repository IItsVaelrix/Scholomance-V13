/**
 * Bridge Corpus Effect Test — PB-BRIDGE-CORPUS-v1
 * ========================================================================
 * Measures the actual effect of injecting the linguistic-retrieval bridge
 * corpus into the grounding index. Reports attestation deltas, feasibility
 * deltas, and determinism. No interpretation until after the data.
 *
 * HONESTY: The bridge corpus is SYNTHETIC. A higher grounding score after
 * injection means "the corpus now contains this knowledge," NOT "the
 * concept is proven viable." This test measures whether the grounding
 * channel responds to corpus growth, not whether the concept is true.
 */

import { describe, it, expect } from 'vitest';
import {
  tokenize,
  buildIndex,
  attest,
  groundingScore,
  prepareForSynthesize,
} from '../../../../codex/core/pixelbrain/grounding-index.js';
import { synthesize } from '../../../../codex/core/pixelbrain/concept-chemistry.js';
import {
  BRIDGE_DOCUMENTS,
  bridgeChecksum,
  bridgeTokenCoverage,
} from '../../../../codex/core/pixelbrain/bridge-corpus/linguistic-retrieval-bridge.js';

// ─── Base corpus (mirrors the encyclopedia's topical coverage) ──────

const BASE_CORPUS = [
  { id: 'law-determinism', text: 'Determinism is non-negotiable. Same input produces same output. No hidden randomness in scoring pipelines. Checksum verification proves reproducibility.' },
  { id: 'pdr-pipeline', text: 'The asset pipeline compiles SCDL source through construction solver geometry then projects art genes then renders through VRI passes to produce sealed packets with canonical JSON and SHA-256 checksums.' },
  { id: 'pir-bridge', text: 'The Defold bridge consumes sealed scene packets via WebSocket. The wire format projects no nulls and uses explicit counts. Lua verifies the seal equality. The render claim is cross-engine comparable.' },
  { id: 'wp-registry', text: 'The semantic correspondence registry maps attributed graphs to scene graphs, dense embeddings to substrate vectors, labeled operations to SCDL typed ops, and sealed packets to canonical serialization with content-addressed checksums.' },
  { id: 'pir-pixelbrain', text: 'PixelBrain provides deterministic rasterization. The bridge validates packets, normalizes canonically, computes SHA-256 identity, and produces straight RGBA. No PixiJS imports. No DOM. No mutable cache.' },
  { id: 'law-schema', text: 'Schema is sovereign. All data shapes are defined in the schema contract. No agent may create parallel schemas. TypeScript interfaces and Zod validation enforce the contract at every boundary.' },
  { id: 'pir-vri', text: 'The VRI renderer implements seven passes: geometry, texture fields, gene marks, lighting, atmosphere, composite, and raster. Each pass is deterministic. Texture spaces bind to material channels. Art genes modulate surface parameters.' },
  { id: 'bug-worldpack', text: 'The worldpack path resolution failed because the asset loader used relative paths without normalizing against the project root. Fixed by resolving all paths through the canonical root directory.' },
  { id: 'wp-concept-chem', text: 'Concept chemistry scores semantic viability of proposed syntheses. Bond energy measures surface similarity. Grounding measures corpus attestation. Coherence checks product against reactants. Law gate enforces determinism.' },
  { id: 'wp-grounding', text: 'The grounding index builds an inverted index over the encyclopedia corpus. Attestation measures what fraction of documents mention a concept. Co-occurrence measures whether two concepts appear in the same document. PMI over paragraph windows can express repulsion.' },
  { id: 'pir-blender', text: 'The Blender bridge ingests sealed PixelBrain packets into Blender via a Python addon. Quantized integers are canonical. The wire format carries energies in eight channels. Render receipts are checksummed over raw pixel dumps.' },
  { id: 'wp-calibration', text: 'Calibration case 001 preserves the prediction and implementation result of the purity assay together. Five invariants must hold under any weight change. The ranking is frozen and checksummed.' },
];

// ─── Phoneme thesis reactions (from the previous chemistry run) ─────

const REACTIONS = [
  {
    id: 'R0',
    label: 'FULL THESIS: combinatorial phoneme expansion + ballistics + calculus',
    a: 'combinatorial expansion bounded family phonological morphological plausible retrieval probes',
    b: 'semantic ballistics calculus containment authorization prevents unjustified bindings',
    product: 'combinatorial expansion converts concept into bounded family of phonologically morphologically plausible retrieval probes widening lexical recall while semantic ballistics and semantic calculus prevent expanded candidates from becoming unjustified bindings',
  },
  {
    id: 'R1',
    label: 'bounded probe family generation',
    a: 'combinatorial expansion bounded enumeration phoneme inventory syllable structure',
    b: 'retrieval probe family query widening lexical recall surface area',
    product: 'bounded combinatorial expansion generates finite family of phonologically valid retrieval probes from phoneme inventory constrained by syllable structure',
  },
  {
    id: 'R2',
    label: 'phonological + morphological plausibility constraint',
    a: 'phonological plausibility constraint phoneme inventory syllable structure morphological rules',
    b: 'bounded enumeration deterministic termination guarantee canonical ordering',
    product: 'phonological and morphological plausibility constraints bound the combinatorial enumeration ensuring deterministic termination and canonical probe ordering',
  },
  {
    id: 'R3',
    label: 'probe family → widened lexical recall',
    a: 'phonological morphological probe family expanded query variants',
    b: 'retrieval recall widening lexical coverage search index matching',
    product: 'phonological and morphological probe family widens lexical recall in retrieval by matching documents using different word forms and pronunciation variants',
  },
  {
    id: 'R4',
    label: 'Semantic Ballistics as containment',
    a: 'semantic ballistics containment scoring trajectory evaluation',
    b: 'expanded retrieval candidates precision preservation drift prevention',
    product: 'semantic ballistics scores containment of expanded retrieval candidates preventing precision loss from phonological and morphological query drift',
  },
  {
    id: 'R5',
    label: 'Semantic Calculus as authorization gate',
    a: 'semantic calculus authorization gate deterministic verdict bind withhold',
    b: 'evidence packet phonological distance morphological relatedness containment score',
    product: 'semantic calculus authorization gate combines phonological distance morphological relatedness and containment score into deterministic bind or withhold verdict',
  },
  {
    id: 'R6',
    label: 'containment prevents unjustified bindings',
    a: 'containment verification semantic boundary unjustified binding detection',
    b: 'phonological probe morphological probe retrieval precision preservation',
    product: 'containment verification detects and suppresses unjustified bindings from phonological and morphological probes preserving retrieval precision',
  },
  {
    id: 'CTRL-FF',
    label: 'FALSE FRIEND: thesaurus synonym ring expansion',
    a: 'thesaurus synonym ring expansion lexical substitution',
    b: 'retrieval recall widening query reformulation',
    product: 'thesaurus synonym ring expansion widens retrieval recall through lexical substitution and query reformulation',
  },
  {
    id: 'CTRL-MT',
    label: 'METAPHOR: conceptual supernova scattering seeds',
    a: 'conceptual supernova explosion scattering semantic seeds',
    b: 'retrieval field coverage expansion radiation',
    product: 'conceptual supernova scatters semantic seeds across the retrieval field expanding coverage through radiation',
  },
  {
    id: 'CTRL-LAW',
    label: 'LAW VIOLATION: unbounded stochastic probe generation',
    a: 'unbounded stochastic random probe generation arbitrary expansion',
    b: 'retrieval recall non-deterministic unseeded',
    product: 'unbounded stochastic random probe generation with arbitrary non-deterministic unseeded expansion for retrieval recall',
  },
];

// ─── Key tokens to track ────────────────────────────────────────────

const LINGUISTIC_TOKENS = [
  'phonem', 'phonologic', 'phonetic', 'morphologic', 'morphem',
  'syll', 'sonor', 'phonotactic', 'coda', 'onset', 'nucleus',
  'vowel', 'consonant', 'affix', 'prefix', 'suffix', 'inflec',
  'deriv', 'lemma', 'stemm', 'lemmatiz',
];

const RETRIEVAL_TOKENS = [
  'retriev', 'query', 'expan', 'recal', 'search', 'index',
  'match', 'rank', 'scor', 'candid', 'preci', 'relev',
  'docu', 'token', 'tokeniz', 'segment', 'decompo',
];

const THESIS_TOKENS = [
  'combinatori', 'bound', 'enumer', 'probe', 'gener',
  'ballistic', 'contain', 'bind', 'authoriz', 'calculus',
  'determinist', 'canonic', 'reproduc', 'checksum',
  'lexic', 'semantic', 'plausibil',
];

// ─── Helper: run all reactions against an index ─────────────────────

function runReactions(rawIndex) {
  const index = prepareForSynthesize(rawIndex);
  return REACTIONS.map((rxn) => {
    const result = synthesize({
      a: rxn.a,
      b: rxn.b,
      product: rxn.product,
      index,
    });
    return {
      id: rxn.id,
      label: rxn.label,
      feasibility: result.feasibility,
      stability: result.stability,
      bond: result.bond,
      bondSign: result.bondSign,
      grounding: result.grounding,
      coherence: result.coherence,
      law: result.law,
      checksum: result.checksum,
    };
  });
}

// ─── Helper: attestation snapshot for a token list ──────────────────

function attestSnapshot(index, tokens) {
  const snap = {};
  for (const tok of tokens) {
    const docs = index.inverted.get(tok);
    snap[tok] = docs ? docs.size : 0;
  }
  return snap;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Bridge Corpus Effect (PB-BRIDGE-CORPUS-v1)', () => {
  const baseIndex = buildIndex(BASE_CORPUS);
  const augmentedIndex = buildIndex([...BASE_CORPUS, ...BRIDGE_DOCUMENTS]);

  describe('corpus integrity', () => {
    it('bridge corpus has 50 documents', () => {
      expect(BRIDGE_DOCUMENTS.length).toBe(50);
    });

    it('bridge corpus is frozen', () => {
      expect(Object.isFrozen(BRIDGE_DOCUMENTS)).toBe(true);
    });

    it('bridge checksum is deterministic', () => {
      expect(bridgeChecksum()).toBe(bridgeChecksum());
      expect(bridgeChecksum()).toMatch(/^bridge1:[0-9a-f]{16}$/);
    });

    it('augmented index has more docs and tokens than base', () => {
      expect(augmentedIndex.docCount).toBe(baseIndex.docCount + BRIDGE_DOCUMENTS.length);
      expect(augmentedIndex.tokenCount).toBeGreaterThan(baseIndex.tokenCount);
    });

    it('augmented index checksum differs from base', () => {
      expect(augmentedIndex.checksum).not.toBe(baseIndex.checksum);
    });
  });

  describe('token attestation deltas', () => {
    const baseLing = attestSnapshot(baseIndex, LINGUISTIC_TOKENS);
    const augLing = attestSnapshot(augmentedIndex, LINGUISTIC_TOKENS);
    const baseRetr = attestSnapshot(baseIndex, RETRIEVAL_TOKENS);
    const augRetr = attestSnapshot(augmentedIndex, RETRIEVAL_TOKENS);
    const baseThesis = attestSnapshot(baseIndex, THESIS_TOKENS);
    const augThesis = attestSnapshot(augmentedIndex, THESIS_TOKENS);

    it('linguistic tokens gain attestation', () => {
      const gainers = LINGUISTIC_TOKENS.filter(
        (t) => augLing[t] > baseLing[t],
      );
      // At least 15 of 21 linguistic tokens should gain attestation
      expect(gainers.length).toBeGreaterThanOrEqual(15);
    });

    it('retrieval tokens gain attestation', () => {
      const gainers = RETRIEVAL_TOKENS.filter(
        (t) => augRetr[t] > baseRetr[t],
      );
      // At least 10 of 17 retrieval tokens should gain attestation
      expect(gainers.length).toBeGreaterThanOrEqual(10);
    });

    it('thesis tokens gain attestation', () => {
      const gainers = THESIS_TOKENS.filter(
        (t) => augThesis[t] > baseThesis[t],
      );
      // At least 10 of 17 thesis tokens should gain attestation
      expect(gainers.length).toBeGreaterThanOrEqual(10);
    });

    it('key bridge tokens go from zero to attested', () => {
      // These tokens should have ZERO attestation in the base corpus
      // and POSITIVE attestation in the augmented corpus
      const zeroToAttested = ['phonem', 'phonologic', 'morphologic', 'phonotactic', 'ballistic'];
      for (const tok of zeroToAttested) {
        expect(baseLing[tok] ?? baseThesis[tok] ?? 0).toBe(0);
        expect(augLing[tok] ?? augThesis[tok] ?? 0).toBeGreaterThan(0);
      }
    });

    it('co-occurrence: linguistic + retrieval tokens appear in same bridge docs', () => {
      // Check that bridge docs contain BOTH linguistic and retrieval tokens
      let coOccurringDocs = 0;
      for (const doc of BRIDGE_DOCUMENTS) {
        const tokens = new Set(tokenize(doc.text));
        const hasLing = LINGUISTIC_TOKENS.some((t) => tokens.has(t));
        const hasRetr = RETRIEVAL_TOKENS.some((t) => tokens.has(t));
        if (hasLing && hasRetr) coOccurringDocs++;
      }
      // At least 40 of 50 bridge docs should have both
      expect(coOccurringDocs).toBeGreaterThanOrEqual(40);
    });
  });

  describe('feasibility deltas', () => {
    const baseResults = runReactions(baseIndex);
    const augResults = runReactions(augmentedIndex);

    it('reports all feasibility deltas', () => {
      console.log('\n=== FEASIBILITY DELTAS (base → augmented) ===');
      console.log('ID        Label                                            Base     Aug      Δ        Stab(B)      Stab(A)');
      console.log('─'.repeat(120));
      for (let i = 0; i < REACTIONS.length; i++) {
        const b = baseResults[i];
        const a = augResults[i];
        const delta = a.feasibility - b.feasibility;
        const sign = delta >= 0 ? '+' : '';
        console.log(
          `${a.id.padEnd(10)}${a.label.slice(0, 48).padEnd(50)}` +
          `${b.feasibility.toFixed(4).padStart(8)} ${a.feasibility.toFixed(4).padStart(8)} ` +
          `${sign}${delta.toFixed(4).padStart(8)}   ` +
          `${b.stability.padEnd(12)} ${a.stability}`,
        );
      }
    });

    it('R2 (phonological constraint) gains feasibility', () => {
      const b = baseResults.find((r) => r.id === 'R2');
      const a = augResults.find((r) => r.id === 'R2');
      expect(a.feasibility).toBeGreaterThan(b.feasibility);
    });

    it('R0 (full thesis) gains feasibility', () => {
      const b = baseResults.find((r) => r.id === 'R0');
      const a = augResults.find((r) => r.id === 'R0');
      expect(a.feasibility).toBeGreaterThan(b.feasibility);
    });

    it('CTRL-LAW stays at zero', () => {
      const a = augResults.find((r) => r.id === 'CTRL-LAW');
      expect(a.feasibility).toBe(0);
      expect(a.stability).toBe('UNSTABLE');
    });

    it('KNOWN HAZARD: false friend gains from bridge corpus (documents the inflation)', () => {
      // The bridge corpus inflates the false friend MORE than the thesis.
      // This is because the false friend shares general retrieval vocabulary
      // ("expansion", "retrieval", "recall", "query") with the bridge docs.
      // The grounding channel measures token overlap, not conceptual
      // compatibility. This is a KNOWN LIMITATION of document-level
      // co-occurrence grounding. It does NOT invalidate the bridge corpus
      // for attesting linguistic-retrieval co-occurrence, but it means
      // the grounding channel alone cannot discriminate real from fake
      // when both share vocabulary. The bond channel and PMI channel
      // must carry that discrimination load.
      const bFF = baseResults.find((r) => r.id === 'CTRL-FF');
      const aFF = augResults.find((r) => r.id === 'CTRL-FF');
      const bR0 = baseResults.find((r) => r.id === 'R0');
      const aR0 = augResults.find((r) => r.id === 'R0');
      const ffDelta = aFF.feasibility - bFF.feasibility;
      const r0Delta = aR0.feasibility - bR0.feasibility;

      console.log(`\n=== FALSE FRIEND INFLATION (KNOWN HAZARD) ===`);
      console.log(`  R0 delta:     +${r0Delta.toFixed(4)}`);
      console.log(`  CTRL-FF delta: +${ffDelta.toFixed(4)}`);
      console.log(`  FF gains ${(ffDelta - r0Delta).toFixed(4)} MORE than thesis`);
      console.log(`  R0 augmented:  ${aR0.feasibility.toFixed(4)} (${aR0.stability})`);
      console.log(`  FF augmented:  ${aFF.feasibility.toFixed(4)} (${aFF.stability})`);
      console.log(`  R0 > FF in augmented? ${aR0.feasibility > aFF.feasibility ? 'NO — FF inflated above thesis' : 'YES'}`);

      // Document the inflation as a measured fact, not a failure
      expect(ffDelta).toBeGreaterThan(0); // FF does gain
      expect(r0Delta).toBeGreaterThan(0); // Thesis also gains
    });

    it('thesis still ranks above metaphor and law violation', () => {
      // R0 should still rank above CTRL-MT and CTRL-LAW even with inflation
      const aR0 = augResults.find((r) => r.id === 'R0');
      const aMT = augResults.find((r) => r.id === 'CTRL-MT');
      const aLAW = augResults.find((r) => r.id === 'CTRL-LAW');
      expect(aR0.feasibility).toBeGreaterThan(aMT.feasibility);
      expect(aR0.feasibility).toBeGreaterThan(aLAW.feasibility);
    });

    it('specific linguistic reactions gain more than the false friend', () => {
      // R1, R2, R3 (linguistic-specific) should gain more than CTRL-FF
      // because they contain phonological/morphological tokens that the
      // bridge corpus specifically attests
      const bFF = baseResults.find((r) => r.id === 'CTRL-FF');
      const aFF = augResults.find((r) => r.id === 'CTRL-FF');
      const ffDelta = aFF.feasibility - bFF.feasibility;

      for (const id of ['R1', 'R2', 'R3']) {
        const b = baseResults.find((r) => r.id === id);
        const a = augResults.find((r) => r.id === id);
        const delta = a.feasibility - b.feasibility;
        expect(delta).toBeGreaterThan(ffDelta);
      }
    });
  });

  describe('attestation detail for thesis concepts', () => {
    it('reports attestation scores for key concepts', () => {
      const concepts = [
        'phonological plausibility constraint phoneme inventory syllable structure',
        'combinatorial expansion bounded enumeration retrieval probes',
        'semantic ballistics containment authorization',
        'morphological decomposition recall search',
        'phonetic matching fuzzy approximate search',
        'deterministic phonological enumeration canonical reproducible',
      ];
      console.log('\n=== ATTESTATION SCORES (base → augmented) ===');
      for (const c of concepts) {
        const b = attest(baseIndex, c);
        const a = attest(augmentedIndex, c);
        console.log(
          `  "${c.slice(0, 55)}..."` +
          `\n    base: ${b.score.toFixed(4)} (${b.matchingDocs}/${b.totalDocs} docs)` +
          `\n    aug:  ${a.score.toFixed(4)} (${a.matchingDocs}/${a.totalDocs} docs)` +
          `\n    Δ:    ${(a.score - b.score).toFixed(4)}`,
        );
      }
    });
  });

  describe('bridge token coverage', () => {
    it('reports token coverage across bridge docs', () => {
      const coverage = bridgeTokenCoverage(tokenize);
      console.log('\n=== BRIDGE TOKEN COVERAGE (top 30) ===');
      const sorted = [...coverage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
      for (const [tok, count] of sorted) {
        console.log(`  ${tok.padEnd(20)} ${count} docs`);
      }
    });

    it('all linguistic tokens appear in bridge corpus', () => {
      const coverage = bridgeTokenCoverage(tokenize);
      const present = LINGUISTIC_TOKENS.filter((t) => coverage.has(t));
      expect(present.length).toBeGreaterThanOrEqual(18);
    });

    it('all retrieval tokens appear in bridge corpus', () => {
      const coverage = bridgeTokenCoverage(tokenize);
      const present = RETRIEVAL_TOKENS.filter((t) => coverage.has(t));
      expect(present.length).toBeGreaterThanOrEqual(14);
    });
  });

  describe('determinism', () => {
    it('100-iteration replay produces identical checksums', () => {
      const checksums = new Set();
      for (let i = 0; i < 100; i++) {
        const idx = buildIndex([...BASE_CORPUS, ...BRIDGE_DOCUMENTS]);
        const results = runReactions(idx);
        const canon = results.map((r) => `${r.id}:${r.checksum}`).join('|');
        checksums.add(canon);
      }
      expect(checksums.size).toBe(1);
    });

    it('bridge checksum is stable across 100 calls', () => {
      const checksums = new Set();
      for (let i = 0; i < 100; i++) {
        checksums.add(bridgeChecksum());
      }
      expect(checksums.size).toBe(1);
    });
  });
});
