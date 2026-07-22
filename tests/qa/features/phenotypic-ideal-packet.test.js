import { describe, it, expect } from 'vitest';
import {
  CONTRACT,
  validatePhenotypicIdealPacket,
  assemblePhenotypicIdealPacket,
} from '../../../scripts/lib/phenotypic-ideal-packet.mjs';

const fixtureCapability = {
  domain: 'phonology',
  version: '1.0.0',
  surfaces: ['scripts/align_lyrics.py', 'codex/core/phonology/**'],
  capabilities: [
    {
      need: 'word duration',
      canonical: 'CmuPhonemeEngine',
      path: 'node_modules/cmudict/lib/cmu/cmudict.0.7a',
      forbidden: ['hand-rolled vowel-group counters'],
    },
  ],
};

describe('PHENOTYPIC-IDEAL-v1', () => {
  it('rejects a seed without evidenceRefs', () => {
    const packet = assemblePhenotypicIdealPacket({
      query: 'phoneme duration',
      hits: [{ path: 'scripts/align_lyrics.py', score: 0.9, preview: 'align' }],
      capabilities: [fixtureCapability],
      genes: [],
    });
    packet.boonSeeds = [
      {
        titleHint: 'orphan',
        classification: 'structural',
        suggestedBridge: 'adapter',
        confidence: 0.5,
        evidenceRefs: [],
      },
    ];
    const errors = validatePhenotypicIdealPacket(packet);
    expect(errors.some((e) => e.includes('evidenceRefs'))).toBe(true);
  });

  it('assembles a valid packet from hits + capability evidence', () => {
    const packet = assemblePhenotypicIdealPacket({
      query: 'phoneme duration',
      hits: [
        { path: 'scripts/align_lyrics.py', score: 0.91, preview: 'align lyrics', chunkIndex: 0 },
        { path: 'scripts/align-track.mts', score: 0.85, preview: 'whisperx', chunkIndex: 0 },
      ],
      capabilities: [fixtureCapability],
      genes: ['SCDNA:phoneme:example'],
      engine: 'float32-cosine-v1',
    });

    expect(packet.contract).toBe(CONTRACT);
    const errors = validatePhenotypicIdealPacket(packet);
    expect(errors).toEqual([]);
    expect(packet.boonSeeds.length).toBeGreaterThan(0);
    expect(packet.evidence.capabilities[0].domain).toBe('phonology');
    expect(packet.phenotype.gap).toBeTruthy();
  });

  it('allows empty capabilities with hit-only seeds', () => {
    const packet = assemblePhenotypicIdealPacket({
      query: 'turboquant substrate',
      hits: [
        { path: 'codex/core/quantization/turboquant.js', score: 0.8 },
        { path: 'steamdeck_brain/substrate_engine.py', score: 0.7 },
      ],
      capabilities: [],
      genes: [],
    });
    expect(validatePhenotypicIdealPacket(packet)).toEqual([]);
    expect(packet.boonSeeds.every((s) => s.evidenceRefs.length > 0)).toBe(true);
  });

  it('scope=divtube prefers divtube_downloader hits when present', () => {
    const packet = assemblePhenotypicIdealPacket({
      query: 'cockpit',
      scope: 'divtube',
      hits: [
        { path: 'src/pages/Watch/WatchPage.jsx', score: 0.9 },
        { path: 'divtube_downloader/tui/ui/app.py', score: 0.8 },
      ],
    });
    expect(packet.scope).toBe('divtube');
    expect(packet.search.hits.every((h) => h.path.startsWith('divtube_downloader/'))).toBe(true);
    expect(validatePhenotypicIdealPacket(packet)).toEqual([]);
  });
});
