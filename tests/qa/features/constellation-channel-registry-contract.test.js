/**
 * The channel is the system's central noun. Server degrade() names and the
 * UI registry must name the same things — set equality, not order — so a
 * new channel cannot land in only one vocabulary.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  CONSTELLATION_CHANNEL_REGISTRY,
  CONSTELLATION_CHANNELS,
  LIVE_ENGINE_DEGRADE,
} from '../../../src/pages/Constellation/constellationChannelRegistry.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function serviceDegradeNames() {
  const src = readFileSync(join(ROOT, 'codex/server/services/constellationPage.service.js'), 'utf8');
  const names = [
    ...src.matchAll(/degrade\(\s*'([^']+)'/g),
    ...src.matchAll(/degradedChannels\.push\(\s*'([^']+)'/g),
  ].map((match) => match[1]);
  return new Set(names);
}

function registryDegradeNames() {
  return new Set(
    Object.values(CONSTELLATION_CHANNEL_REGISTRY).flatMap((entry) => entry.degrade ?? []),
  );
}

describe('constellation channel registry contract', () => {
  it('is frozen at the table and at every entry', () => {
    expect(Object.isFrozen(CONSTELLATION_CHANNEL_REGISTRY)).toBe(true);
    for (const entry of Object.values(CONSTELLATION_CHANNEL_REGISTRY)) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.degrade)).toBe(true);
      expect(Object.isFrozen(entry.pos)).toBe(true);
    }
  });

  it('derives CONSTELLATION_CHANNELS from the registry without renaming anchors', () => {
    const ids = CONSTELLATION_CHANNELS.map((channel) => channel.id);
    expect(ids).toEqual(Object.keys(CONSTELLATION_CHANNEL_REGISTRY));
    for (const channel of CONSTELLATION_CHANNELS) {
      const entry = CONSTELLATION_CHANNEL_REGISTRY[channel.id];
      expect(channel.label).toBe(entry.label);
      expect(channel.targetId).toBe(entry.targetId);
      expect(channel.tone).toBe(entry.tone);
    }
    expect(CONSTELLATION_CHANNEL_REGISTRY.meaning.targetId).toBe('cos-leximancy');
    expect(CONSTELLATION_CHANNEL_REGISTRY.sound.targetId).toBe('cos-rhyme');
    expect(CONSTELLATION_CHANNEL_REGISTRY.genome.targetId).toBe('cos-genome');
    expect(CONSTELLATION_CHANNEL_REGISTRY.readings.targetId).toBe('cos-readings');
    expect(CONSTELLATION_CHANNEL_REGISTRY.scale.targetId).toBe('cos-scale');
    expect(CONSTELLATION_CHANNEL_REGISTRY.discovery.targetId).toBe('cos-discovery');
    expect(CONSTELLATION_CHANNEL_REGISTRY.provenance.targetId).toBe('cos-provenance');
    expect(CONSTELLATION_CHANNEL_REGISTRY.identity.targetId).toBe('cos-masthead-query');
  });

  it('covers every degrade() name the page service emits, and no extras', () => {
    expect([...registryDegradeNames()].sort()).toEqual([...serviceDegradeNames()].sort());
  });

  it('keeps the live-engine whole-sky name out of per-channel degrade lists', () => {
    expect(LIVE_ENGINE_DEGRADE).toBe('live engine');
    expect(registryDegradeNames().has(LIVE_ENGINE_DEGRADE)).toBe(false);
  });

  it('keeps presentation coordinates on the UI registry, not in the packet', () => {
    for (const [id, entry] of Object.entries(CONSTELLATION_CHANNEL_REGISTRY)) {
      expect(Array.isArray(entry.pos)).toBe(true);
      expect(entry.pos).toHaveLength(3);
      if (id !== 'identity') {
        expect(entry.pos.some((value) => value !== 0)).toBe(true);
      }
    }
  });
});
