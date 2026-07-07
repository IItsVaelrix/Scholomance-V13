import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ADDON_ROOT = join(process.cwd(), 'addons/scholomance_godot_bridge');

function readAddonFile(path) {
  return readFileSync(join(ADDON_ROOT, path), 'utf8');
}

describe('Godot PixelBrain paint dock static contract', () => {
  it('registers the dock behind an editor setting', () => {
    const plugin = readAddonFile('scholomance_godot_bridge_plugin.gd');
    expect(plugin).toContain('scholomance/pixelbrain/enable_paint_dock');
    expect(plugin).toContain('add_control_to_dock');
    expect(plugin).toContain('_is_paint_dock_enabled');
  });

  it('dock registration is gated — dock is not always added', () => {
    const plugin = readAddonFile('scholomance_godot_bridge_plugin.gd');
    expect(plugin).toContain('if _is_paint_dock_enabled()');
  });

  it('keeps save behavior explicit — no _process autosave', () => {
    const dock = readAddonFile('editor/pixelbrain_paint_dock.gd');
    expect(dock).toContain('save_to_path');
    expect(dock).not.toMatch(/func\s+_process\s*\(/);
    expect(dock).not.toMatch(/func\s+_physics_process\s*\(/);
  });

  it('dock exposes load_from_path', () => {
    const dock = readAddonFile('editor/pixelbrain_paint_dock.gd');
    expect(dock).toContain('func load_from_path');
  });

  it('dock exposes save_and_reimport', () => {
    const dock = readAddonFile('editor/pixelbrain_paint_dock.gd');
    expect(dock).toContain('func save_and_reimport');
    expect(dock).toContain('EditorInterface.get_resource_filesystem().scan()');
  });

  it('artifact editor uses correct PixelBrain kind constant', () => {
    const editor = readAddonFile('editor/pixelbrain_artifact_editor.gd');
    expect(editor).toContain('scholomance.pixelbrain.godot.v1');
  });

  it('artifact editor marks bytecode stale after paint and erase', () => {
    const editor = readAddonFile('editor/pixelbrain_artifact_editor.gd');
    expect(editor).toContain('stale-godot-edit');
  });

  it('stable JSON serializer sorts keys', () => {
    const stable = readAddonFile('editor/pixelbrain_stable_json.gd');
    expect(stable).toContain('keys.sort()');
    expect(stable).toContain('static func stringify');
  });

  it('canvas view emits semantic signals not file writes', () => {
    const canvas = readAddonFile('editor/pixelbrain_canvas_view.gd');
    expect(canvas).toContain('signal paint_requested');
    expect(canvas).toContain('signal erase_requested');
    expect(canvas).not.toContain('FileAccess');
  });

  it('importers are extracted to helpers keeping _enter_tree clean', () => {
    const plugin = readAddonFile('scholomance_godot_bridge_plugin.gd');
    expect(plugin).toContain('func _register_importers');
    expect(plugin).toContain('func _unregister_importers');
  });
});
