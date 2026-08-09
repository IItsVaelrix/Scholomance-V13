#!/usr/bin/env node
/**
 * test-dictionary-grounding.mjs
 *
 * TEST: Does adding the Scholomance phoneme engine's linguistic vocabulary
 * to the grounding corpus change R2 (phonological/morphological plausibility)?
 *
 * Method:
 * 1. Build grounding index from encyclopedia docs ONLY (baseline)
 * 2. Build grounding index from encyclopedia docs + phoneme engine vocabulary (augmented)
 * 3. Run identical reactions through both
 * 4. Compare R2 feasibility, grounding, and stability
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, extname } from 'path';
import {
  buildIndex,
  prepareForSynthesize,
  loadEncyclopediaIndex,
  attest,
} from '../codex/core/pixelbrain/grounding-index.js';
import { synthesize } from '../codex/core/pixelbrain/concept-chemistry.js';

// ─── Extract linguistic vocabulary from actual source files ───

function extractLinguisticDocs() {
  const docs = [];

  docs.push({
    id: 'phoneme-constants',
    text: `ARPAbet phoneme feature matrix. Vowel features: height, contour, place, length,
voicing, nasality, manner, affrication, sibilance. Consonant features: nasality, manner,
voicing, affrication, sibilance, place. Phonemes: AA AE AH AO AW AY EH ER EY IH IY OW OY
UH UW AX UR B CH D DH F G HH JH K L M N NG P R S SH T TH V W Y Z ZH. Sonority hierarchy
for syllabification. Vowel to base family mapping for allophone normalization.`,
  });

  docs.push({
    id: 'syllabifier',
    text: `Syllabification engine implementing Maximal Onset Principle and Sonority Sequencing
Principle. Intervocalic consonants assigned to onsets and codas. Onsets must rise in
sonority, codas must fall. Phonotactic validation: onset and coda must be legal English
consonant sequences. Syllable analysis: vowel, onset, coda, stress level, onset phonemes,
coda phonemes. Morphological boundary detection via stress pattern analysis.`,
  });

  docs.push({
    id: 'phonological-processes',
    text: `Deterministic ordered phonological rewrite rules for post-processing. Rules operate
over ARPAbet phone arrays. Canonical form comparison for pronunciation normalization.
Allophone projection: schwa is unstressed allophone of AH nucleus. Stress is contrastive
for heteronyms: REcord vs reCORD share every phone, differ only in placement. Secondary
stress collapses into unstressed; primary does not. Irregular varietal forms treated as
distinct, never merged through canonical normalization.`,
  });

  const dictJson = JSON.parse(readFileSync('public/phoneme_dictionary_v2.json', 'utf8'));
  const vowelFamilies = dictJson.vowel_families.map(f =>
    `${f.id} (${f.aliases.join(', ')}): ${f.examples.join(', ')}`
  ).join('. ');
  const codaGroups = Object.entries(dictJson.consonant_groups.coda_groups).map(
    ([k, v]) => `${k}: ${v.join(', ')}`
  ).join('. ');
  const onsetGroups = Object.entries(dictJson.consonant_groups.onset_groups).map(
    ([k, v]) => `${k}: ${v.join(', ')}`
  ).join('. ');
  docs.push({
    id: 'phoneme-dictionary-v2',
    text: `Sonic Thaumaturgy Extended Phoneme Dictionary. Family-based approximate phonology
for high-recall rhyme matching. Vowel families: ${vowelFamilies}. Coda groups: ${codaGroups}.
Onset groups: ${onsetGroups}. Fusion rules: window ${dictJson.fusion_rules.window_syllables}
syllables, min ${dictJson.fusion_rules.min_vowel_hits} vowel hits, carry-over bonus
${dictJson.fusion_rules.carry_over_bonus}. Stress types: hard attack, medium, ghost.
Stressed alignment bonus ${dictJson.stress.stressed_alignment_bonus}.`,
  });

  docs.push({
    id: 'phoneme-engine',
    text: `Phoneme analysis engine. Deep word analysis: full phoneme array, per-syllable breakdown,
syllable count, primary rhyme key, extended multi-syllable rhyme keys, binary stress pattern.
Phonetic similarity scoring. Rhyme domain construction. Vowel family normalization.
G2P jury adapter for grapheme-to-phoneme conversion. Authority priming from Scholomance
Dictionary API. Coda slant matching: nasal substitution, nasal+stop dropping, fricative+stop
dropping. Morphological plausibility via phonotactic constraint satisfaction.`,
  });

  docs.push({
    id: 'pls-dictionary-integration',
    text: `Poetic Language Server dictionary integration. 123k words with pre-computed ARPAbet
phonemes, rhyme families, codas, rhyme keys. 31k WordNet definitions, 185k lemma-to-synset
mappings, 234k semantic relations: synonyms, hypernyms, antonyms. Rhyme index from full
English lexicon. Spelling validation against dictionary. Synonym suggestions with
definition-aware ranking. Morphological analysis via lemma decomposition. Phonological
plausibility checking via phonotactic constraints and sonority sequencing.`,
  });

  docs.push({
    id: 'phonotactics',
    text: `English phonotactic constraints. Legal onset clusters: PL PR TR DR KR GR KL GL FL FR
BL BR SL SR SP ST SK SM SN SW TW TH SH CH. Legal coda clusters: ND NK NT NS NF MP MK FT SK
SP ST KS PS PT CT LK LF LP LT LB LD LG LTH RD RF RP RT RB RTH RSH RK RM RN NG NK. Maximum
onset length three consonants. Maximum coda length four consonants. Sonority distance
constraints between adjacent consonants. Morpheme boundary detection via illegal cluster
identification.`,
  });

  return docs;
}

// ─── Reactions (identical to previous test) ───

const REACTIONS = [
  {
    id: 'R0',
    label: 'FULL THESIS: combinatorial expansion + ballistics + calculus',
    a: 'combinatorial expansion converts concept into bounded family of phonologically morphologically plausible retrieval probes widening lexical recall',
    b: 'semantic ballistics and semantic calculus prevent expanded candidates from becoming unjustified bindings authorization gate',
    product: 'combinatorial phoneme probe expansion with ballistics containment and calculus authorization for retrieval recall widening without unjustified bindings',
  },
  {
    id: 'R1',
    label: 'combinatorial expansion → bounded probe family',
    a: 'combinatorial expansion generates bounded family of retrieval probes from concept decomposition',
    b: 'bounded enumeration with deterministic termination guarantees and finite probe count',
    product: 'bounded combinatorial probe family with deterministic enumeration and finite termination',
  },
  {
    id: 'R2',
    label: 'phonological + morphological plausibility as constraint',
    a: 'phonological plausibility constraint using phoneme inventory syllable structure morphological rules',
    b: 'morphological decomposition lemma derivation affix stripping phonotactic validation sonority sequencing',
    product: 'phonologically morphologically plausible probe generation with phonotactic constraints and syllable templates',
  },
  {
    id: 'R3',
    label: 'probe family → widened lexical recall',
    a: 'expanded probe family increases lexical recall surface area for retrieval matching',
    b: 'retrieval system matches probes against indexed documents returning ranked candidates',
    product: 'widened lexical recall through combinatorial probe expansion against document index',
  },
  {
    id: 'R4',
    label: 'Semantic Ballistics as containment',
    a: 'semantic ballistics scores trajectory of candidate binding measuring justification strength',
    b: 'containment filter rejects candidates below justification threshold preventing unjustified bindings',
    product: 'ballistics containment filter scoring candidate justification and rejecting unjustified bindings',
  },
  {
    id: 'R5',
    label: 'Semantic Calculus as authorization gate',
    a: 'semantic calculus maps intent to authorized action candidates with law compliance checking',
    b: 'authorization gate permits or denies action based on calculus verdict and evidence coverage',
    product: 'calculus authorization gate permitting actions with sufficient evidence and law compliance',
  },
  {
    id: 'R6',
    label: 'containment prevents unjustified bindings',
    a: 'unjustified binding occurs when candidate lacks sufficient evidence or violates law',
    b: 'containment mechanism detects and blocks unjustified bindings before they propagate',
    product: 'binding containment preventing unjustified candidates from propagating through system',
  },
  {
    id: 'CTRL-FF',
    label: 'FALSE FRIEND: thesaurus synonym ring expansion',
    a: 'thesaurus lookup expands concept into synonym ring for broader matching',
    b: 'synonym ring retrieval returns all words in equivalence class without phonological constraint',
    product: 'thesaurus synonym ring expansion for retrieval without phonological or morphological filtering',
  },
  {
    id: 'CTRL-MT',
    label: 'METAPHOR: conceptual supernova scattering seeds',
    a: 'concept explodes like supernova scattering semantic seeds across retrieval space',
    b: 'seeds land in fertile document soil and grow into candidate bindings',
    product: 'conceptual supernova scattering semantic seeds that grow into candidate bindings',
  },
  {
    id: 'CTRL-LAW',
    label: 'LAW VIOLATION: unbounded stochastic probe generation',
    a: 'unbounded stochastic probe generation with random phoneme mutation and no termination',
    b: 'random expansion without deterministic seed produces non-reproducible probe families',
    product: 'unbounded stochastic random probe generation without deterministic termination or seed',
  },
];

// ─── Run test ───

function run() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  DICTIONARY GROUNDING TEST');
  console.log('  Does phoneme engine vocabulary fix R2?');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Build baseline index (encyclopedia only)
  const baseRaw = loadEncyclopediaIndex();
  const baselineIndex = prepareForSynthesize(baseRaw);
  console.log(`Baseline index: ${baseRaw.tokenCount} tokens, ${baseRaw.docCount} docs\n`);

  // Build augmented index (encyclopedia + linguistic docs)
  const lingDocs = extractLinguisticDocs();
  console.log(`Linguistic docs added: ${lingDocs.length}`);
  for (const d of lingDocs) {
    console.log(`  - ${d.id}: ${d.text.length} chars`);
  }

  // Merge: load encyclopedia docs again as {id, text} + linguistic docs
  // loadEncyclopediaIndex returns a built index, so we rebuild from scratch
  const augRaw = buildIndex([...getEncyclopediaDocs(), ...lingDocs]);
  const augmentedIndex = prepareForSynthesize(augRaw);
  console.log(`Augmented index: ${augRaw.tokenCount} tokens, ${augRaw.docCount} docs\n`);

  // Run reactions through both
  console.log('───────────────────────────────────────────────────────────────');
  console.log('  REACTION COMPARISON: baseline vs augmented');
  console.log('───────────────────────────────────────────────────────────────\n');

  const header = [
    'ID'.padEnd(10),
    'Label'.padEnd(55),
    'Feas(B)'.padStart(8),
    'Feas(A)'.padStart(8),
    'Δ'.padStart(8),
    'Grnd(B)'.padStart(8),
    'Grnd(A)'.padStart(8),
    'ΔGrnd'.padStart(8),
    'Stab(B)'.padStart(12),
    'Stab(A)'.padStart(12),
  ].join(' ');
  console.log(header);
  console.log('─'.repeat(header.length));

  const results = [];

  for (const rxn of REACTIONS) {
    const baseResult = synthesize({ a: rxn.a, b: rxn.b, product: rxn.product, index: baselineIndex });
    const augResult = synthesize({ a: rxn.a, b: rxn.b, product: rxn.product, index: augmentedIndex });

    const feasDelta = augResult.feasibility - baseResult.feasibility;
    const grndDelta = augResult.grounding - baseResult.grounding;

    const row = [
      rxn.id.padEnd(10),
      rxn.label.slice(0, 54).padEnd(55),
      baseResult.feasibility.toFixed(4).padStart(8),
      augResult.feasibility.toFixed(4).padStart(8),
      (feasDelta >= 0 ? '+' : '') + feasDelta.toFixed(4).padStart(7),
      baseResult.grounding.toFixed(4).padStart(8),
      augResult.grounding.toFixed(4).padStart(8),
      (grndDelta >= 0 ? '+' : '') + grndDelta.toFixed(4).padStart(7),
      baseResult.stability.padStart(12),
      augResult.stability.padStart(12),
    ].join(' ');
    console.log(row);

    results.push({
      id: rxn.id,
      label: rxn.label,
      feasBase: baseResult.feasibility,
      feasAug: augResult.feasibility,
      feasDelta,
      grndBase: baseResult.grounding,
      grndAug: augResult.grounding,
      grndDelta,
      stabBase: baseResult.stability,
      stabAug: augResult.stability,
      bondBase: baseResult.bond,
      bondAug: augResult.bond,
      pmiBase: baseResult.corpusPMI?.meanPMI ?? null,
      pmiAug: augResult.corpusPMI?.meanPMI ?? null,
    });
  }

  // ─── R2 deep dive ───
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  R2 DEEP DIVE: phonological + morphological plausibility');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const r2 = results.find(r => r.id === 'R2');
  console.log(`  Feasibility:  ${r2.feasBase.toFixed(4)} → ${r2.feasAug.toFixed(4)}  (Δ ${r2.feasDelta >= 0 ? '+' : ''}${r2.feasDelta.toFixed(4)})`);
  console.log(`  Grounding:    ${r2.grndBase.toFixed(4)} → ${r2.grndAug.toFixed(4)}  (Δ ${r2.grndDelta >= 0 ? '+' : ''}${r2.grndDelta.toFixed(4)})`);
  console.log(`  Stability:    ${r2.stabBase} → ${r2.stabAug}`);
  console.log(`  Bond:         ${r2.bondBase.toFixed(4)} → ${r2.bondAug.toFixed(4)}`);
  console.log(`  PMI:          ${r2.pmiBase?.toFixed(4) ?? 'n/a'} → ${r2.pmiAug?.toFixed(4) ?? 'n/a'}`);

  // Check attestation for key linguistic tokens
  console.log('\n  Token attestation in augmented corpus:');
  const lingTokens = ['phoneme', 'syllable', 'morphological', 'phonotactic', 'sonority',
    'arpabet', 'vowel', 'consonant', 'onset', 'coda', 'lemma', 'affix',
    'allophone', 'heteronym', 'rhyme', 'stress'];
  for (const token of lingTokens) {
    const baseAtt = attest(baseRaw, token).score;
    const augAtt = attest(augRaw, token).score;
    console.log(`    ${token.padEnd(16)} baseline: ${baseAtt.toFixed(4)}  augmented: ${augAtt.toFixed(4)}  Δ ${(augAtt - baseAtt) >= 0 ? '+' : ''}${(augAtt - baseAtt).toFixed(4)}`);
  }

  // ─── Full thesis comparison ───
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  FULL THESIS (R0) COMPARISON');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const r0 = results.find(r => r.id === 'R0');
  console.log(`  Feasibility:  ${r0.feasBase.toFixed(4)} → ${r0.feasAug.toFixed(4)}  (Δ ${r0.feasDelta >= 0 ? '+' : ''}${r0.feasDelta.toFixed(4)})`);
  console.log(`  Grounding:    ${r0.grndBase.toFixed(4)} → ${r0.grndAug.toFixed(4)}  (Δ ${r0.grndDelta >= 0 ? '+' : ''}${r0.grndDelta.toFixed(4)})`);
  console.log(`  Stability:    ${r0.stabBase} → ${r0.stabAug}`);

  // ─── False friend separation ───
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  FALSE FRIEND SEPARATION');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const ff = results.find(r => r.id === 'CTRL-FF');
  console.log(`  R0 feasibility:      ${r0.feasAug.toFixed(4)}`);
  console.log(`  CTRL-FF feasibility: ${ff.feasAug.toFixed(4)}`);
  console.log(`  Separation:          ${(r0.feasAug - ff.feasAug).toFixed(4)}`);
  console.log(`  (Baseline separation was ${(r0.feasBase - ff.feasBase).toFixed(4)})`);

  // ─── Verdict ───
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  VERDICT');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const r2Crossed = r2.stabBase !== r2.stabAug;
  const r0Crossed = r0.stabBase !== r0.stabAug;
  const separationImproved = (r0.feasAug - ff.feasAug) > (r0.feasBase - ff.feasBase);

  console.log(`  R2 stability changed:     ${r2Crossed ? `YES (${r2.stabBase} → ${r2.stabAug})` : 'NO'}`);
  console.log(`  R0 stability changed:     ${r0Crossed ? `YES (${r0.stabBase} → ${r0.stabAug})` : 'NO'}`);
  console.log(`  FF separation improved:   ${separationImproved ? 'YES' : 'NO'}`);
  console.log(`  R2 grounding delta:       ${r2.grndDelta >= 0 ? '+' : ''}${r2.grndDelta.toFixed(4)}`);
  console.log(`  R0 grounding delta:       ${r0.grndDelta >= 0 ? '+' : ''}${r0.grndDelta.toFixed(4)}`);

  if (r2Crossed && r2.stabAug === 'METASTABLE') {
    console.log('\n  ✓ HYPOTHESIS CONFIRMED: Dictionary vocabulary fixed R2.');
  } else if (r2.grndDelta > 0.05) {
    console.log('\n  ~ HYPOTHESIS PARTIALLY CONFIRMED: Grounding improved but stability unchanged.');
  } else {
    console.log('\n  ✗ HYPOTHESIS FALSIFIED: Dictionary vocabulary did not fix R2.');
  }
}

// Helper: replicate loadEncyclopediaIndex's exact doc collection, then return
// the raw {id, text} array so we can append linguistic docs and rebuild.
function getEncyclopediaDocs() {
  const corpusDirs = [
    join('PolarisOS', 'Polaris-OS-Encyclopedia'),
    join('docs', 'scholomance-encyclopedia', 'Scholomance LAW'),
  ];
  const rootFiles = ['VAELRIX_LAW.md', 'CODEX.md', 'CLAUDE.md', 'GEMINI.md'];
  const documents = [];

  for (const dir of corpusDirs) {
    let entries;
    try { entries = readdirSync(dir, { recursive: true }); } catch { continue; }
    for (const entry of entries) {
      const full = join(dir, String(entry));
      let st;
      try { st = statSync(full); } catch { continue; }
      if (!st.isFile()) continue;
      if (!String(entry).endsWith('.md')) continue;
      if (st.size > 500_000) continue;
      try {
        const text = readFileSync(full, 'utf8');
        documents.push({ id: full, text });
      } catch { /* skip */ }
    }
  }

  for (const file of rootFiles) {
    if (existsSync(file)) {
      try {
        const text = readFileSync(file, 'utf8');
        documents.push({ id: file, text });
      } catch { /* skip */ }
    }
  }

  return documents;
}

run();
