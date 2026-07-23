import { resolveQueryIdentity } from '../../core/constellation/queryIdentity.js';
import { computePageBytecode } from '../../core/constellation/pageBytecode.js';
import { analyzeLeximancy, LEXIMANCY_ADAPTER_VERSION } from './constellation/leximancy.adapter.js';
import { analyzeRhyme, RHYME_ADAPTER_VERSION } from './constellation/rhymeAstrology.adapter.js';
import { analyzeGenome, GENOME_ADAPTER_VERSION } from './constellation/genome.adapter.js';

const CONSTELLATION_OS_VERSION = 'phase1-live-1';

function emptyLeximancy() {
  return { status: 'unsupported', selectedInterpretationId: null, interpretations: [], nearKin: [], counterfield: [], warnings: [], anchor: null };
}

/**
 * @param {string} rawQuery
 * @param {{ lexiconAdapter, rhymeQueryEngine, rhymeLexiconRepo }} deps
 * @returns {Promise<import('../../../src/pages/Constellation/types.js').ConstellationPhase1Packet>}
 */
export async function buildConstellationPage(rawQuery, deps) {
  const identity = resolveQueryIdentity(rawQuery);
  const degradedChannels = [];
  const warnings = [];

  let leximancy = emptyLeximancy();
  try {
    leximancy = analyzeLeximancy(deps.lexiconAdapter, identity.primaryContentToken);
  } catch (err) {
    degradedChannels.push('leximancy');
    warnings.push(`leximancy channel failed: ${err.message}`);
  }

  let rhyme = null;
  try {
    rhyme = await analyzeRhyme(deps.rhymeQueryEngine, deps.rhymeLexiconRepo, identity);
  } catch (err) {
    degradedChannels.push('rhymeAstrology');
    warnings.push(`rhymeAstrology channel failed: ${err.message}`);
  }

  let genome = { syllables: 0, devicesHint: [], schoolHint: null };
  try {
    genome = analyzeGenome(rhyme, identity);
  } catch (err) {
    degradedChannels.push('phraseGenome');
    warnings.push(`phraseGenome channel failed: ${err.message}`);
  }

  const engineVersions = {
    constellationOS: CONSTELLATION_OS_VERSION,
    leximancy: LEXIMANCY_ADAPTER_VERSION,
    rhymeAstrology: RHYME_ADAPTER_VERSION,
    phraseGenome: GENOME_ADAPTER_VERSION,
  };

  const pageBytecode = computePageBytecode({
    normalized: identity.normalized,
    kind: identity.kind,
    engineVersions,
  });

  return {
    version: 1,
    schema_id: 'scholomance/constellation-os-page-phase1',
    pageBytecode,
    query: {
      raw: identity.raw,
      normalized: identity.normalized,
      kind: identity.kind,
      tokenCount: identity.tokenCount,
      graphemeCount: identity.graphemeCount,
    },
    leximancy: {
      status: leximancy.status,
      selectedInterpretationId: leximancy.selectedInterpretationId,
      interpretations: leximancy.interpretations,
      warnings: leximancy.warnings,
      nearKin: leximancy.nearKin,
      counterfield: leximancy.counterfield,
    },
    rhymeAstrology: rhyme
      ? {
          phonemes: rhyme.phonemes,
          stress: rhyme.stress,
          cadenceFamily: rhyme.cadenceFamily,
          exactRhymes: rhyme.exactRhymes,
          slantRhymes: rhyme.slantRhymes,
        }
      : null,
    phraseGenome: {
      syllables: genome.syllables,
      devicesHint: genome.devicesHint,
      schoolHint: genome.schoolHint,
    },
    diagnostics: { degradedChannels, warnings },
    provenance: { engineVersions },
  };
}
