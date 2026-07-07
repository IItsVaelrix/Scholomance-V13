import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ADDON_ROOT = join(process.cwd(), 'addons/scholomance_godot_bridge');

function readAddonFile(path) {
  return readFileSync(join(ADDON_ROOT, path), 'utf8');
}

describe('Godot PixelBrain reimport workflow', () => {
  it('save_and_reimport chains save_to_path then filesystem scan', () => {
    const dock = readAddonFile('editor/pixelbrain_paint_dock.gd');
    const block = dock.slice(dock.indexOf('func save_and_reimport'));
    expect(block).toContain('save_to_path(path, use_strict_validation)');
    expect(block).toContain('EditorInterface.get_resource_filesystem().scan()');
  });

  it('filesystem scan is gated behind Engine.is_editor_hint — no scan at runtime', () => {
    const dock = readAddonFile('editor/pixelbrain_paint_dock.gd');
    const block = dock.slice(dock.indexOf('func save_and_reimport'));
    expect(block).toContain('Engine.is_editor_hint()');
    const scanIdx = block.indexOf('.scan()');
    const hintIdx = block.indexOf('Engine.is_editor_hint()');
    expect(hintIdx).toBeLessThan(scanIdx);
  });

  it('save_and_reimport returns ERR if save fails — scan is not called on bad artifact', () => {
    const dock = readAddonFile('editor/pixelbrain_paint_dock.gd');
    const block = dock.slice(dock.indexOf('func save_and_reimport'));
    expect(block).toContain('if result != OK');
    expect(block).toContain('return result');
    const returnIdx = block.indexOf('return result');
    const scanIdx = block.indexOf('.scan()');
    expect(returnIdx).toBeLessThan(scanIdx);
  });

  it('_show_save_dialog calls save_and_reimport — not raw save_to_path', () => {
    const dock = readAddonFile('editor/pixelbrain_paint_dock.gd');
    const block = dock.slice(dock.indexOf('func _show_save_dialog'));
    expect(block).toContain('save_and_reimport');
    expect(block).not.toContain('save_to_path');
  });

  it('importer regenerates scene from saved .pbrain via resource filesystem scan', () => {
    const importer = readAddonFile('importers/pixelbrain_importer.gd');
    expect(importer).toContain('PackedStringArray(["pbrain"])');
    expect(importer).toContain('ArtifactLoader.PIXELBRAIN_KIND');
  });
});
