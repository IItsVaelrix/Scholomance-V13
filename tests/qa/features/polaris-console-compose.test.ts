/**
 * PolarisOS Stateful Lattice Console — canonical Compose shell (Task 2).
 *
 * Asserts the stable root anatomy of the generated PB-UI-SCENE-v1, its
 * validation, golden parity, and byte-identical regeneration of the DOM plan
 * and token CSS outputs.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createPolarisConsoleScene,
} from '../../../src/core/compose/kits/polaris-console';
import { validateComposeScene } from '../../../src/core/compose/validate/scene';
import { canonicalizePacket } from '../../../src/core/compose/schema/canonicalize';
import type { UiSceneNode } from '../../../src/core/compose/schema/packets';
import { buildPolarisConsoleUi } from '../../../scripts/build-polaris-console-ui';

const GOLDEN_PATH = join(
  process.cwd(),
  'tests',
  'qa',
  'features',
  'fixtures',
  'polaris-console.pb-ui-scene.v1.json',
);

function findIds(node: UiSceneNode): string[] {
  const ids: string[] = [node.id];
  for (const child of node.children ?? []) ids.push(...findIds(child));
  for (const slotNodes of Object.values(node.slots ?? {})) {
    for (const child of slotNodes) ids.push(...findIds(child));
  }
  return ids;
}

describe('Polaris console canonical scene', () => {
  const scene = createPolarisConsoleScene();

  it('has the stable root anatomy', () => {
    expect(scene.root.id).toBe('polaris-console');
    expect((scene.root.children ?? []).map(({ id }) => id)).toEqual([
      'polaris-system-header',
      'polaris-workspace',
    ]);
    expect(findIds(scene.root)).toEqual(
      expect.arrayContaining([
        'polaris-bearing-rail',
        'polaris-scene-altar',
        'polaris-chronicle',
        'polaris-command-conduit',
        'polaris-telemetry-rail',
      ]),
    );
  });

  it('uses the approved three-column workspace grid', () => {
    const layout = scene.layouts['polaris-workspace-grid'];
    expect(layout?.mode).toBe('grid');
    expect(layout?.grid?.columns).toBe(
      'minmax(220px, 0.8fr) minmax(640px, 2.4fr) minmax(260px, 1fr)',
    );
  });

  it('marks the Chronicle as a polite log and the command conduit as a form', () => {
    const ids = findIds(scene.root);
    expect(ids).toContain('polaris-chronicle-log');
    expect(ids).toContain('polaris-command-input');
    expect(ids).toContain('polaris-command-submit');
  });

  it('validates cleanly', () => {
    const result = validateComposeScene(scene);
    expect(result.diagnostics.filter((d) => d.severity === 'ERROR')).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('matches the committed golden packet byte-for-byte', () => {
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
    expect(canonicalizePacket(scene)).toBe(canonicalizePacket(golden));
  });

  it('exposes a deterministic source checksum (no timestamp)', () => {
    const a = createPolarisConsoleScene();
    const b = createPolarisConsoleScene();
    expect(a.sourceChecksum).toBe(b.sourceChecksum);
    expect(a.sourceChecksum).toMatch(/^scd64:/);
  });

  it('regenerates byte-identical DOM plan and token CSS', async () => {
    const dirA = mkdtempSync(join(tmpdir(), 'polaris-ui-a-'));
    const dirB = mkdtempSync(join(tmpdir(), 'polaris-ui-b-'));
    try {
      const resA = await buildPolarisConsoleUi({
        domPlanFile: join(dirA, 'plan.ts'),
        tokenCssFile: join(dirA, 'tokens.css'),
      });
      const resB = await buildPolarisConsoleUi({
        domPlanFile: join(dirB, 'plan.ts'),
        tokenCssFile: join(dirB, 'tokens.css'),
      });
      expect(resA.sceneChecksum).toBe(resB.sceneChecksum);
      expect(readFileSync(join(dirA, 'plan.ts'), 'utf8')).toBe(
        readFileSync(join(dirB, 'plan.ts'), 'utf8'),
      );
      expect(readFileSync(join(dirA, 'tokens.css'), 'utf8')).toBe(
        readFileSync(join(dirB, 'tokens.css'), 'utf8'),
      );
    } finally {
      rmSync(dirA, { recursive: true, force: true });
      rmSync(dirB, { recursive: true, force: true });
    }
  });
});
