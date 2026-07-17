import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serializeStable } from '../../src/lib/godot-export/stableSerialize.js';

const FIXTURES = join(process.cwd(), 'tests/fixtures/godot-export');
const ADDON_ROOT = join(process.cwd(), 'addons/scholomance_godot_bridge');

function readAddonFile(path) {
  return readFileSync(join(ADDON_ROOT, path), 'utf8');
}

describe('Godot PixelBrain shadow edit contract', () => {
  it('save_to_path defaults to shadow mode — strict is an optional boolean parameter', () => {
    const dock = readAddonFile('editor/pixelbrain_paint_dock.gd');
    expect(dock).toMatch(/func save_to_path\(path: String, strict: bool = false\)/);
  });

  it('artifact_loader recognizes bytecodeStatus as a supported field', () => {
    const loader = readAddonFile('runtime/artifact_loader.gd');
    expect(loader).toContain('"bytecodeStatus"');
  });

  it('stable serializer preserves unknown fields through round-trip', () => {
    const artifact = {
      kind: 'scholomance.pixelbrain.godot.v1',
      version: 1,
      canvas: { width: 2, height: 2, gridSize: 1 },
      palettes: [],
      coordinates: [],
      formula: null,
      bytecode: '',
      _unknownMetadata: 'preserved',
    };
    const output = serializeStable(artifact);
    expect(output).toContain('"_unknownMetadata"');
    expect(output).toContain('"preserved"');
  });

  it('stable serializer preserves bytecodeStatus when artifact was painted', () => {
    const painted = JSON.parse(
      readFileSync(join(FIXTURES, 'pixelbrain-painted-basic.pbrain'), 'utf8'),
    );
    expect(painted.bytecodeStatus).toBe('stale-godot-edit');
    const output = serializeStable(painted);
    expect(output).toContain('"bytecodeStatus"');
    expect(output).toContain('"stale-godot-edit"');
  });

  it('load_from_path always returns OK — invalid artifacts load in shadow mode', () => {
    const dock = readAddonFile('editor/pixelbrain_paint_dock.gd');
    expect(dock).toContain('func load_from_path');
    const loadBlock = dock.slice(dock.indexOf('func load_from_path'));
    const nextFunc = loadBlock.indexOf('\nfunc ', 5);
    const body = nextFunc === -1 ? loadBlock : loadBlock.slice(0, nextFunc);
    expect(body).toContain('return OK');
    expect(body).not.toContain('return ERR_');
  });

  it('load_from_path warns on invalid artifact but does not block', () => {
    const dock = readAddonFile('editor/pixelbrain_paint_dock.gd');
    expect(dock).toContain('validate_pixelbrain_artifact(loaded, false)');
    expect(dock).toContain('push_warning');
  });

  it('save_to_path in shadow mode preserves the full artifact dictionary', () => {
    const dock = readAddonFile('editor/pixelbrain_paint_dock.gd');
    expect(dock).toContain('StableJson.stringify(artifact)');
  });
});
