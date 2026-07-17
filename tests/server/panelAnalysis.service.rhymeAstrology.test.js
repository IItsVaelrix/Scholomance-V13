import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPanelAnalysisService } from '../../codex/server/services/panelAnalysis.service.js';
import { PhonemeEngine } from '../../codex/core/phonology/phoneme.engine.js';
import { ScholomanceDictionaryAPI } from '../../codex/core/shared/scholomanceDictionary.api.js';

describe('[Server] panelAnalysis.service rhyme astrology', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    PhonemeEngine.clearCache();
    PhonemeEngine.authorityFailure = null;
  });

  it('hydrates PhonemeEngine from the in-process dictionary provider before compiling panels', async () => {
    const globalLookup = vi.spyOn(ScholomanceDictionaryAPI, 'lookupBatch')
      .mockRejectedValue(new Error('global HTTP dictionary client should not be called'));
    const dictionaryAPI = {
      lookupBatch: vi.fn(async () => ({
        families: {
          SIGHT: { family: 'AY', phonemes: ['S', 'AY1', 'T'] },
          LIGHT: { family: 'AY', phonemes: ['L', 'AY1', 'T'] },
        },
      })),
    };

    const service = await createPanelAnalysisService({
      enableRhymeAstrology: false,
      gutenbergEmotionPriors: {
        version: 1,
        generatedAt: '2026-03-28T00:00:00.000Z',
        emotions: {},
      },
      log: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const result = await service.analyzePanels('sight\nlight', {
      analysisProfile: 'editor',
      scholomanceDictionaryAPI: dictionaryAPI,
    });

    const sight = result.analysis.wordAnalyses.find(word => word.word === 'sight');
    const light = result.analysis.wordAnalyses.find(word => word.word === 'light');

    expect(globalLookup).not.toHaveBeenCalled();
    expect(dictionaryAPI.lookupBatch).toHaveBeenCalled();
    expect(PhonemeEngine.AUTHORITY_CACHE.get('SIGHT')).toMatchObject({ family: 'AY', phonemes: ['S', 'AY1', 'T'] });
    expect(sight.rhymeKey).toBe('AY-T');
    expect(light.rhymeKey).toBe('AY-T');

    service.close();
  });

  it('builds compiler-native anchors, windows, and spans for panel payloads', async () => {
    const queryEngine = {
      query: vi.fn(async (input) => ({
        query: {
          rawText: String(input.text || ''),
          tokens: [String(input.text || '').toLowerCase()],
          resolvedNodes: [
            {
              endingSignature: 'EY1-M',
            },
          ],
          compiler: {
            activeWindowIds: Array.isArray(input.anchorWindowIds) ? input.anchorWindowIds : [],
          },
        },
        topMatches: [
          {
            nodeId: 'w_frame',
            token: 'frame',
            overallScore: 0.91,
            reasons: ['matching ending signature EY1-M'],
          },
        ],
        constellations: [
          {
            id: `cluster-${Number(input.anchorTokenId) || 0}`,
            anchorId: 'w_frame',
            label: 'Burning Choir',
            dominantVowelFamily: ['EY'],
            dominantStressPattern: '1',
            members: ['w_frame', 'w_name'],
            densityScore: 0.64,
            cohesionScore: 0.72,
          },
        ],
        diagnostics: {
          queryTimeMs: 1.4,
          cacheHit: false,
          candidateCount: 6,
        },
      })),
      close: vi.fn(),
      __unsafe: {
        lexiconRepo: {
          lookupNodeById: vi.fn(() => ({
            frequencyScore: 0.4,
          })),
        },
      },
    };

    const service = await createPanelAnalysisService({
      enableRhymeAstrology: true,
      rhymeAstrologyQueryEngine: queryEngine,
      gutenbergEmotionPriors: {
        version: 1,
        generatedAt: '2026-03-28T00:00:00.000Z',
        emotions: {},
      },
      log: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const result = await service.analyzePanels([
      'Flame remembers name',
      'Same remembers flame',
    ].join('\n'));

    expect(result.rhymeAstrology?.enabled).toBe(true);
    expect(queryEngine.query).toHaveBeenCalled();
    expect(queryEngine.query.mock.calls[0][0].verseIR).toBeTruthy();
    expect(Number.isInteger(queryEngine.query.mock.calls[0][0].anchorTokenId)).toBe(true);
    expect(Array.isArray(queryEngine.query.mock.calls[0][0].anchorWindowIds)).toBe(true);

    expect(result.rhymeAstrology?.inspector?.anchors?.length).toBeGreaterThan(0);
    expect(Number.isInteger(result.rhymeAstrology?.inspector?.anchors?.[0]?.compilerRef?.tokenId)).toBe(true);
    expect(Array.isArray(result.rhymeAstrology?.inspector?.anchors?.[0]?.activeWindowIds)).toBe(true);

    expect(result.rhymeAstrology?.inspector?.windows?.length).toBeGreaterThan(0);
    expect(result.rhymeAstrology?.inspector?.windows?.[0]?.tokenIds?.length).toBeGreaterThan(0);

    const spanKinds = result.rhymeAstrology?.inspector?.spans?.map((span) => span.kind) || [];
    expect(spanKinds).toContain('anchor_token');
    expect(spanKinds).toContain('syllable_window');

    service.close();
  });
});
