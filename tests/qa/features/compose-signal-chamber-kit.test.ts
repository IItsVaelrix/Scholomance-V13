import { describe, it, test, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { render } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createSignalChamberScene,
  SIGNAL_CHAMBER_DEFINITIONS,
  canonicalStringify,
} from '../../../src/core/compose/kits/signalChamber.compose.js';
import ComposeSignalChamberAdapter from '../../../src/pages/Listen/ComposeSignalChamberAdapter';
import ListenPage from '../../../src/pages/Listen/ListenPage';

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

describe('Compose Signal Chamber Adapter', () => {
  it('renders Signal Chamber HUD shell with runtime attributes', () => {
    const html = renderToStaticMarkup(
      React.createElement(ComposeSignalChamberAdapter, {
        currentSchoolId: 'SONIC',
        isPlaying: false,
        isTuning: false,
        signalLevel: 0.5,
        volume: 0.8,
        entropyLevel: 20,
        outputDevices: [],
        sinkId: '',
        onTogglePlayPause: () => {},
        onTuneToSchool: () => {},
        onSetVolume: () => {},
        onSetOutputDevice: () => {},
        onOrbClick: () => {},
      })
    );
    expect(html).toContain('data-compose-kind="signal-chamber-shell"');
    expect(html).toContain('data-compose-school="SONIC"');
  });

  test('renders Phoneme Dynamics Compressor UI with gain reduction and transfer curve', () => {
    const { container, rerender } = render(
      React.createElement(ComposeSignalChamberAdapter, {
        currentSchoolId: 'SONIC',
        isPlaying: true,
        signalLevel: 0.4,
      })
    );

    const compressorUnit = container.querySelector('[data-compose-kind="phoneme-compressor-unit"]');
    expect(compressorUnit).not.toBeNull();
    expect(compressorUnit?.getAttribute('data-compose-status')).toBe('NORMAL');

    const transferCurve = container.querySelector('[data-compose-part="transferCurve"]');
    expect(transferCurve).not.toBeNull();

    const ratioBadge = container.querySelector('.compressor-ratio-badge');
    expect(ratioBadge?.textContent).toContain('1:1 LINEAR');

    // Test attenuation state (> 0.75 signal level)
    rerender(
      React.createElement(ComposeSignalChamberAdapter, {
        currentSchoolId: 'SONIC',
        isPlaying: true,
        signalLevel: 0.85,
      })
    );

    expect(compressorUnit?.getAttribute('data-compose-status')).toBe('LIMITING');
    expect(container.querySelector('.compressor-ratio-badge')?.textContent).toContain('∞:1 HARD LIMIT');

    const grReadout = container.querySelector('.gr-meter-val');
    expect(grReadout?.textContent).toMatch(/-4\.\d dB/);
  });
});

describe('ListenPage UI Kit Integration', () => {
  it('renders ComposeSignalChamberAdapter inside ListenPage', () => {
    const html = renderToStaticMarkup(React.createElement(ListenPage));
    expect(html).toContain('data-compose-kind="signal-chamber-shell"');
  });
});


