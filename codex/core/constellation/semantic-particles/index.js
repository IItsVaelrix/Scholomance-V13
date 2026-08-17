/**
 * Semantic particle program — public surface.
 *
 * One-way dependency: parser core exposes an immutable chart; this package
 * observes and scores. There is no ADMIT_BOND permission.
 *
 * @module codex/core/constellation/semantic-particles
 */

export {
  CREATED_BY,
  FORBIDDEN_PERMISSIONS,
  PARTICLE_PERMISSIONS,
  PARTICLE_POLARITIES,
  PARTICLE_SCOPES,
  SEMANTIC_PARTICLE_CONTRACT,
  SEMANTIC_PARTICLE_SCHEMA_VERSION,
  canonicalSerialize,
  internParticle,
  mintParticle,
  particleSchemaChecksum,
  quantizeScore,
  sha256Hex,
  validateParticle,
} from './schema.js';

export {
  DEFAULT_FEATURE_PROVIDER,
  FEATURE_DIMENSIONS,
  FEATURE_INHERITANCE,
  FEATURE_SCHEMA_VERSION,
  MICROFEATURE_SMOKE_SEED,
  UNKNOWN,
  compatibility,
  createFeatureProvider,
  derangeFeatureValues,
  featuresFor,
} from './feature-provider.js';

export {
  EXPERIMENTAL_FEATURE_DIMENSIONS,
  EXPERIMENTAL_FEATURE_PROVIDER,
  EXPERIMENTAL_FEATURE_SCHEMA_VERSION,
  classifyLemma,
  knownFeatureCount,
} from './experimental-inventory.js';

export {
  COMPLEMENT_ONTOLOGY_VERSION,
  COMPLEMENT_SLOTS,
  COMPLEMENT_TYPES,
  classifyComplement,
  projectComplementRelation,
} from './complement-ontology.js';

export {
  COMPLEMENT_CLASSES,
  COMPLEMENT_COMPAT,
  COMPLEMENT_COMPAT_RELATIONS,
  COMPLEMENT_COMPAT_VERSION,
  complementClass,
  diagnoseComplementMapping,
  governorClasses,
  isComplementRelation,
  lookupComplementCompat,
  scoreComplementCompat,
} from './complement-compat.js';

export {
  FEATURE_COMPAT,
  edgeCompatibility,
  pickScoredReading,
  projectRelation,
  scoreLexicalReading,
} from './feature-score.js';

export {
  EXACT_SIGN_TEST,
  exactTwoSidedSignP,
  formatPValue,
} from './stats.js';

export {
  censusUnknownMass,
  paretoCuts,
} from './coverage-census.js';

export {
  UNKNOWN_BUCKETS,
  classifyUnknownKey,
  noveltyKind,
  otherKnownTypes,
  summarizeUnknownBuckets,
} from './unknown-remainder.js';

export {
  EXPOSURE_THRESHOLDS,
  efficacyVerdict,
  evaluateExposure,
} from './exposure-gate.js';

export {
  SELECTIONAL_ROLES,
  freezeSelectionalIndex,
  roleProjection,
  selectionalCharge,
} from './selectional-index.js';

export {
  CAPABILITY_KEYS,
  capabilitiesAgreeWithProvenance,
  capabilityParticle,
  censusPrivilegeCycles,
  classifyRule,
  transferCapabilities,
} from './capability-transfer.js';

export {
  collapseReport,
  descendExact,
  identityKey,
  joinRefusals,
  perRootReachability,
  shuffleLitMarks,
} from './root-reachability.js';

export {
  bindingSignature,
  enumerateBounded,
  extractBindings,
  inferForest,
  localFactors,
  nodeId,
} from './forest-inference.js';

export {
  PROBE_REGISTRY,
  applyProbe,
  responseVector,
  selectivity,
} from './contrastive-probes.js';

export {
  censusParticles,
  selectBottleneck,
} from './evidence-ledger.js';

export {
  GAP_HYPOTHESES,
  backtestCatalyst,
  expectedInformationGain,
  rankExperiments,
} from './experimental-design.js';

export {
  dppShortlist,
  qualityScore,
  similarityKernel,
} from './diverse-shortlist.js';

export {
  annotateSemanticParticles,
  forestFingerprint,
} from './annotate.js';

export {
  DEFAULT_LEXICAL_LEXICON,
  LEXICAL_SEMANTICS_VERSION,
  areSynonyms,
  createLexicalLexicon,
  polysemyCount,
  roleFrame,
  sensesFor,
  synsetMembers,
} from './lexical-semantics.js';

export {
  COMPOSITIONAL_SEMANTICS_VERSION,
  composeMeanings,
  leafMeaning,
  meaningOf,
} from './compositional-semantics.js';

export {
  diagnoseT1Edge,
  observeAtomCoverage,
  observeDerivationCoverage,
  rolesComplete,
  summarizeObserveCoverage,
} from './observe-coverage.js';

export {
  bondFamily,
  derivationSignature,
  isGlueBond,
  observeCompetitiveCell,
  summarizeDecisionBearing,
} from './decision-bearing.js';
