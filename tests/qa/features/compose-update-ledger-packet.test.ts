// tests/qa/features/compose-update-ledger-packet.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  canonicalizePacket,
  createUpdateLedgerScene,
  assertNoRuntimeLibraryObjects,
  validateComposeScene,
} from '../../../src/core/compose/packets';
import { contractRegistry, PB_UI_SCENE_V1, PB_LAYOUT_V1 } from '../../../src/core/compose/schema/contracts';

const FIXTURE = join(process.cwd(), 'tests/qa/features/fixtures/update-ledger-window.pb-ui-scene.v1.json');

describe('Update Ledger PB scene (compose pilot)', () => {
  beforeEach(() => {
    contractRegistry.clear();
    contractRegistry.register(PB_UI_SCENE_V1);
    contractRegistry.register(PB_LAYOUT_V1);
  });

  it('emits PB-UI-SCENE-v1 with header/boot/scroll children', () => {
    const scene = createUpdateLedgerScene({ entryCount: 3 });
    expect(scene.contract).toBe('PB-UI-SCENE-v1');
    expect(scene.root.kind).toBe('update-ledger-window');
    const ids = (scene.root.children ?? []).map((c) => c.id);
    expect(ids).toEqual([
      'update-ledger-window.header',
      'update-ledger-window.boot',
      'update-ledger-window.scroll',
    ]);
    expect(validateComposeScene(scene).ok).toBe(true);
    assertNoRuntimeLibraryObjects(scene);
  });

  it('matches golden after canonicalize', () => {
    const golden = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    const emitted = createUpdateLedgerScene({ entryCount: 0, includeWandOrnament: false });
    expect(canonicalizePacket(emitted)).toBe(canonicalizePacket(golden));
  });
});
