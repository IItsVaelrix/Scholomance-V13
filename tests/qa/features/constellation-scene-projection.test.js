/**
 * Degradation bridge + channel registry — the runtime's diagnostics must
 * reach the sky. A present-but-empty field is not the same as a failed
 * channel, and a failed channel must not vanish.
 */
import { describe, it, expect } from 'vitest';
import {
  projectConstellationPacket,
  channelAvailable,
  channelDegraded,
  channelState,
} from '../../../src/pages/Constellation/constellationSceneProjection.js';

function packet(overrides = {}) {
  return {
    pageBytecode: 'COS-PAGE-v1-TISSUE-001',
    query: {
      raw: 'the bright wound',
      normalized: 'the bright wound',
      kind: 'phrase',
      tokenCount: 3,
      graphemeCount: 16,
      intent: 'literary',
    },
    leximancy: {
      status: 'unsupported',
      selectedInterpretationId: null,
      interpretations: [],
      nearKin: [],
      counterfield: [],
      warnings: [],
      anchor: null,
    },
    rhymeAstrology: {
      phonemes: ['W', 'UW1', 'N', 'D'],
      stress: '/',
      cadenceFamily: 'mono',
      exactRhymes: [],
      slantRhymes: [],
    },
    phraseGenome: { syllables: 1, devicesHint: [], schoolHint: null },
    readings: {
      contested: false,
      primary: null,
      readings: [{
        anchor: 'wound',
        role: 'head',
        proposedBy: 'rarity',
        rationale: 'rare',
        candidate: true,
      }],
      silent: [],
    },
    scaleField: {
      status: 'ok',
      anchor: 'wound',
      scale: {
        id: 's',
        dimension: null,
        kind: 'intensity',
        memberCount: 1,
        span: 0,
        ladder: [{ word: 'wound', rank: 1, relative: 1, isAnchor: true }],
      },
      neighbours: [],
      opposites: [],
      warnings: [],
    },
    discovery: null,
    diagnostics: { degradedChannels: [], warnings: [] },
    provenance: { engineVersions: { constellationOS: 'test' } },
    ...overrides,
  };
}

function channelOf(model, id) {
  return model.channels.find((channel) => channel.id === id);
}

function anchorOf(model, id) {
  return model.nodes.find((node) => node.id === `channel-${id}`);
}

describe('constellation scene projection — degradation bridge', () => {
  it('keeps channelAvailable true for a present-but-degraded empty leximancy', () => {
    const degraded = packet({
      diagnostics: { degradedChannels: ['leximancy'], warnings: [] },
    });
    expect(channelAvailable(degraded, 'meaning')).toBe(true);
    expect(channelDegraded(degraded, 'meaning')).toBe(true);
  });

  it('treats empty interpretations + degrade flag as degraded, not measured', () => {
    const degraded = packet({
      diagnostics: { degradedChannels: ['leximancy'], warnings: [] },
    });
    expect(channelState(degraded, 'meaning')).toBe('degraded');
  });

  it('treats empty interpretations + no degrade flag as nothing found', () => {
    const empty = packet();
    expect(channelDegraded(empty, 'meaning')).toBe(false);
    expect(channelState(empty, 'meaning')).toBe('empty');
  });

  it('dims a degraded meaning channel and labels it, without dropping it from the sky', () => {
    const healthy = projectConstellationPacket(packet({
      leximancy: {
        status: 'resolved',
        selectedInterpretationId: 'wound.injury',
        interpretations: [{ id: 'wound.injury', gloss: 'injury', confidence: 0.8 }],
        nearKin: [],
        counterfield: [],
        warnings: [],
        anchor: 'wound',
      },
    }));
    const degraded = projectConstellationPacket(packet({
      diagnostics: { degradedChannels: ['leximancy'], warnings: [] },
    }));

    expect(channelOf(degraded, 'meaning')).toBeTruthy();
    expect(channelOf(degraded, 'meaning').degraded).toBe(true);
    expect(channelOf(degraded, 'meaning').state).toBe('degraded');
    expect(anchorOf(degraded, 'meaning').degraded).toBe(true);
    expect(anchorOf(degraded, 'meaning').ariaLabel).toMatch(/degraded/i);
    expect(anchorOf(degraded, 'meaning').magnitude).toBeLessThan(anchorOf(healthy, 'meaning').magnitude);

    const healthyChannelIds = healthy.channels.map((channel) => channel.id).sort();
    const degradedChannelIds = degraded.channels.map((channel) => channel.id).sort();
    expect(degradedChannelIds).toEqual(healthyChannelIds);
  });

  it('keeps a null rhyme channel visible and degraded when diagnostics name it', () => {
    const vanishedToday = packet({
      rhymeAstrology: null,
      diagnostics: { degradedChannels: [], warnings: [] },
    });
    const failed = packet({
      rhymeAstrology: null,
      diagnostics: { degradedChannels: ['rhymeAstrology'], warnings: [] },
    });

    expect(channelAvailable(vanishedToday, 'sound')).toBe(false);
    expect(channelOf(projectConstellationPacket(vanishedToday), 'sound')).toBeUndefined();

    const model = projectConstellationPacket(failed);
    expect(channelOf(model, 'sound')).toBeTruthy();
    expect(channelOf(model, 'sound').degraded).toBe(true);
    expect(anchorOf(model, 'sound').ariaLabel).toMatch(/degraded/i);
  });

  it('does not promote a literary null discovery into the sky', () => {
    const literary = packet({ discovery: null, diagnostics: { degradedChannels: [], warnings: [] } });
    expect(channelOf(projectConstellationPacket(literary), 'discovery')).toBeUndefined();
  });

  it('shows a failed discovery channel as degraded rather than absent', () => {
    const failed = packet({
      discovery: null,
      diagnostics: { degradedChannels: ['discovery'], warnings: [] },
    });
    const model = projectConstellationPacket(failed);
    expect(channelOf(model, 'discovery')?.degraded).toBe(true);
    expect(anchorOf(model, 'discovery')?.ariaLabel).toMatch(/degraded/i);
  });

  it('excludes degraded stars from the measured count without deleting them', () => {
    const healthy = projectConstellationPacket(packet({
      leximancy: {
        status: 'resolved',
        selectedInterpretationId: 'wound.injury',
        interpretations: [{ id: 'wound.injury', gloss: 'injury', confidence: 0.8 }],
        nearKin: [],
        counterfield: [],
        warnings: [],
        anchor: 'wound',
      },
    }));
    const degraded = projectConstellationPacket(packet({
      diagnostics: { degradedChannels: ['leximancy'], warnings: [] },
    }));

    expect(degraded.nodes.length).toBeGreaterThan(0);
    expect(degraded.measuredNodeCount).toBe(degraded.nodes.filter((node) => !node.degraded).length);
    expect(degraded.measuredNodeCount).toBeLessThan(degraded.nodes.length);
    expect(degraded.measuredNodeCount).toBeLessThan(healthy.measuredNodeCount);
    expect(healthy.measuredNodeCount).toBe(healthy.nodes.length);
  });

  it('leaves provenance unmarked when another channel degrades', () => {
    const model = projectConstellationPacket(packet({
      diagnostics: { degradedChannels: ['leximancy', 'rhymeAstrology', 'scaleField'], warnings: [] },
    }));
    expect(channelOf(model, 'provenance').degraded).toBe(false);
    expect(channelOf(model, 'provenance').state).toBe('measured');
    expect(anchorOf(model, 'provenance').degraded).toBe(false);
  });

  it('folds semanticInquiry degradation into the meaning channel', () => {
    expect(channelDegraded(packet({
      diagnostics: { degradedChannels: ['semanticInquiry.phonology'], warnings: [] },
    }), 'meaning')).toBe(true);
    expect(channelDegraded(packet({
      diagnostics: { degradedChannels: ['leximancy.relations'], warnings: [] },
    }), 'meaning')).toBe(true);
  });

  it('treats a live-engine failure as degraded for every engine channel, not provenance', () => {
    const unreachable = packet({
      rhymeAstrology: null,
      scaleField: null,
      discovery: null,
      diagnostics: { degradedChannels: ['live engine'], warnings: [] },
    });
    expect(channelDegraded(unreachable, 'meaning')).toBe(true);
    expect(channelDegraded(unreachable, 'sound')).toBe(true);
    expect(channelDegraded(unreachable, 'genome')).toBe(true);
    expect(channelDegraded(unreachable, 'scale')).toBe(true);
    expect(channelDegraded(unreachable, 'discovery')).toBe(true);
    expect(channelDegraded(unreachable, 'identity')).toBe(false);
    expect(channelDegraded(unreachable, 'readings')).toBe(false);
    expect(channelDegraded(unreachable, 'provenance')).toBe(false);
  });
});
