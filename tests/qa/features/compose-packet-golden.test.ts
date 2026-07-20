/**
 * PDR Phase 1 exit: PB packet emit + toolbar golden
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  canonicalizePacket,
  emitPbUiScene,
  emitPbLayout,
  emitPbUiEvent,
  createScrollEditorToolbarScene,
  assertNoRuntimeLibraryObjects,
  validateComposeScene,
} from '../../../src/core/compose/packets';
import { contractRegistry, PB_UI_SCENE_V1, PB_LAYOUT_V1, PB_UI_EVENT_V1 } from '../../../src/core/compose/schema/contracts';

const FIXTURE_DIR = join(process.cwd(), 'tests/qa/features/fixtures');

describe('PB packet emit (Phase 1)', () => {
  beforeEach(() => {
    contractRegistry.clear();
    contractRegistry.register(PB_UI_SCENE_V1);
    contractRegistry.register(PB_LAYOUT_V1);
    contractRegistry.register(PB_UI_EVENT_V1);
  });

  it('emits a deterministic PB-UI-SCENE-v1 for ScrollEditorToolbar', () => {
    const scene = createScrollEditorToolbarScene();
    expect(scene.contract).toBe('PB-UI-SCENE-v1');
    expect(scene.root.kind).toBe('toolbar');
    expect(scene.sourceChecksum).toMatch(/^scd64:[a-f0-9]{16,}$/);

    const a = canonicalizePacket(scene);
    const b = canonicalizePacket(emitPbUiScene(scene));
    expect(a).toBe(b);

    assertNoRuntimeLibraryObjects(scene);
  });

  it('matches golden fixture byte-for-byte after canonicalize', () => {
    const scene = createScrollEditorToolbarScene();
    // Strip assembled timestamps if any — golden is identity-stable fields only
    const goldenPath = join(FIXTURE_DIR, 'scroll-editor-toolbar.pb-ui-scene.v1.json');
    const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
    // Recompute checksum against golden structure by re-emitting from factory
    const emitted = createScrollEditorToolbarScene();
    expect(canonicalizePacket(emitted)).toBe(canonicalizePacket(golden));
  });

  it('emits PB-LAYOUT-v1 flow intent for toolbar', () => {
    const layout = emitPbLayout({
      mode: 'flow',
      flow: {
        direction: 'row',
        gapPx: 8,
        wrap: false,
        align: 'center',
        justify: 'start',
      },
    });
    expect(layout.contract).toBe('PB-LAYOUT-v1');
    expect(layout.mode).toBe('flow');
    assertNoRuntimeLibraryObjects(layout);
  });

  it('emits PB-UI-EVENT-v1 TOOLBAR.FOCUS_NEXT with sequence', () => {
    const ev = emitPbUiEvent({
      type: 'TOOLBAR.FOCUS_NEXT',
      sourceId: 'scroll-editor-toolbar',
      sequence: 1,
    });
    expect(ev.contract).toBe('PB-UI-EVENT-v1');
    expect(ev.type).toBe('TOOLBAR.FOCUS_NEXT');
    assertNoRuntimeLibraryObjects(ev);
  });

  it('rejects unknown kind with PB-UI-001', () => {
    const result = validateComposeScene({
      contract: 'PB-UI-SCENE-v1',
      version: '1.0.0',
      id: 'bad',
      root: { id: 'r', kind: 'not-a-real-kind' },
      definitions: {},
      layouts: {},
      visuals: {},
      sourceChecksum: 'scd64:deadbeef',
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'PB-UI-001')).toBe(true);
  });

  it('WAND ornament can be removed without changing root semantics', () => {
    const withOrnament = createScrollEditorToolbarScene({ includeWandOrnament: true });
    const without = createScrollEditorToolbarScene({ includeWandOrnament: false });
    expect(withOrnament.root.kind).toBe(without.root.kind);
    expect(withOrnament.root.id).toBe(without.root.id);
    expect(Object.keys(withOrnament.visuals).length).toBeGreaterThan(0);
    expect(Object.keys(without.visuals).length).toBe(0);
    expect(withOrnament.definitions[withOrnament.root.kind]?.anatomy.rootRole)
      .toBe(without.definitions[without.root.kind]?.anatomy.rootRole);
  });
});
