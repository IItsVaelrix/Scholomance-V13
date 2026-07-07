import { describe, it, expect } from 'vitest';
import {
  runPixelBrainPipelineCorpus,
  runPipelineCorpusCase,
  PIPELINE_CORPUS_CASE_IDS,
  PIPELINE_CORPUS_CONTRACT,
} from '../../../../codex/core/pixelbrain/pipeline-golden-corpus.js';

/**
 * The golden corpus existed with a script runner but no test consumer, so
 * deterministic-pipeline regressions never failed CI. This wires it in.
 */

describe(`pipeline golden corpus (${PIPELINE_CORPUS_CONTRACT})`, () => {
  it.each(PIPELINE_CORPUS_CASE_IDS)('%s passes', (caseId) => {
    const result = runPipelineCorpusCase(caseId);
    expect(result.status, JSON.stringify(result.observed ?? {})).toBe('pass');
  });

  it('full corpus run reports pass with zero failed cases', () => {
    const report = runPixelBrainPipelineCorpus();
    expect(report.status).toBe('pass');
    expect(report.summary.failed).toBe(0);
    expect(report.summary.cases).toBe(PIPELINE_CORPUS_CASE_IDS.length);
  });
});
