import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createSignalChamberScene,
  SIGNAL_CHAMBER_DEFINITIONS,
  canonicalStringify,
} from '../../../src/core/compose/kits/signalChamber.compose.js';

const FIXTURE_PATH = join(
  process.cwd(),
  'tests/qa/features/fixtures/signal-chamber-ui-kit.golden.json',
);

describe('Signal Chamber UI Kit Canonical Scene', () => {
  it('exports component definitions and valid PB-UI-SCENE-v1 packet', () => {
    expect(Object.keys(SIGNAL_CHAMBER_DEFINITIONS).length).toBeGreaterThanOrEqual(14);
    expect(Object.keys(SIGNAL_CHAMBER_DEFINITIONS)).toHaveLength(15);
    const scene = createSignalChamberScene();
    expect(scene.contract).toBe('PB-UI-SCENE-v1');
    expect(scene.id).toBe('listen-signal-chamber-ui-kit');
  });

  it('matches golden fixture canonical JSON', () => {
    const golden = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
    const scene = createSignalChamberScene();
    expect(canonicalStringify(scene)).toBe(canonicalStringify(golden));
  });
});
