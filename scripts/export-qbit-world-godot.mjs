#!/usr/bin/env node
/* global process */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  QBIT_WORLD_PRESETS,
} from '../codex/core/pixelbrain/qbit-world-game-loop.js';
import { buildQbitWorldGodotExport } from '../src/lib/godot-export/qbitWorldGodotExport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const godotProjectDir = path.join(repoRoot, 'godot_project');
const godotAssetsDir = path.join(godotProjectDir, 'assets');
const addonPluginPath = path.join(godotProjectDir, 'addons', 'scholomance_godot_bridge', 'plugin.cfg');
const projectConfigPath = path.join(godotProjectDir, 'project.godot');

function hasArg(name) {
  return process.argv.includes(name);
}

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function assertGodotBridgeReady() {
  if (!existsSync(godotProjectDir)) {
    throw new Error(`Missing Godot project directory: ${godotProjectDir}`);
  }
  if (!existsSync(addonPluginPath)) {
    throw new Error(`Missing Scholomance Godot bridge addon: ${addonPluginPath}`);
  }
  if (!existsSync(projectConfigPath)) {
    throw new Error(`Missing Godot project config: ${projectConfigPath}`);
  }

  const projectConfig = readFileSync(projectConfigPath, 'utf8');
  if (!projectConfig.includes('res://addons/scholomance_godot_bridge/plugin.cfg')) {
    throw new Error('Scholomance Godot bridge addon is not enabled in godot_project/project.godot');
  }
}

function exportPreset(presetId, options, outputName = null) {
  const schoolWeights = QBIT_WORLD_PRESETS[presetId];
  if (!schoolWeights) {
    const choices = Object.keys(QBIT_WORLD_PRESETS).join(', ');
    throw new Error(`Unknown QBIT preset "${presetId}". Valid presets: ${choices}`);
  }

  const filename = outputName ?? `qbit-world-${presetId.toLowerCase()}.qworld`;
  const targetPath = path.join(godotAssetsDir, filename);
  const artifact = buildQbitWorldGodotExport({ schoolWeights, options });
  writeFileSync(targetPath, artifact);
  return targetPath;
}

function main() {
  assertGodotBridgeReady();
  mkdirSync(godotAssetsDir, { recursive: true });

  const size = Number(argValue('--size', 16));
  const maxRadius = Number(argValue('--max-radius', Math.floor(size * 0.75)));
  const options = {
    size,
    maxRadius,
  };

  const presets = hasArg('--all')
    ? Object.keys(QBIT_WORLD_PRESETS)
    : [String(argValue('--preset', 'QBIT')).toUpperCase()];

  const outputName = argValue('--output', null);
  if (outputName && presets.length !== 1) {
    throw new Error('--output can only be used with a single QBIT preset export.');
  }

  const outputs = presets.map((presetId) => exportPreset(presetId, options, outputName));

  console.log('QBIT Godot export complete.');
  for (const output of outputs) {
    console.log(`  ${path.relative(repoRoot, output)}`);
  }
  console.log('');
  console.log('Open Godot project: godot_project');
  console.log('Look under: res://assets/');
  console.log('If the .qworld scene does not appear immediately, restart Godot or reimport the file.');
}

main();
