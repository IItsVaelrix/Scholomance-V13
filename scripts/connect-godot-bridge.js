import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const BRIDGE_PLUGIN_PATH = "res://addons/scholomance_godot_bridge/plugin.cfg";
const REPO_ROOT = resolve(new URL("..", import.meta.url).pathname);
const SOURCE_ADDON = join(REPO_ROOT, "addons", "scholomance_godot_bridge");

function isWindowsPath(input) {
  return /^[a-zA-Z]:[\\/]/.test(input);
}

function windowsPathSuffix(input) {
  return input.replace(/^[a-zA-Z]:[\\/]/, "").replaceAll("\\", "/");
}

function compatRoots() {
  const steamCompatRoot = "/home/deck/.local/share/Steam/steamapps/compatdata";

  if (!existsSync(steamCompatRoot)) {
    return [];
  }

  return readdirSync(steamCompatRoot)
    .map((entry) => join(steamCompatRoot, entry, "pfx", "drive_c"))
    .filter((candidate) => existsSync(candidate));
}

function resolveProjectPath(rawPath) {
  const candidates = [];

  if (isWindowsPath(rawPath)) {
    const suffix = windowsPathSuffix(rawPath);
    candidates.push(...compatRoots().map((root) => join(root, suffix)));
  } else {
    candidates.push(resolve(rawPath));
  }

  const directProject = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  if (directProject && directProject.endsWith("project.godot")) {
    return directProject;
  }

  const projectFromDirectory = candidates
    .map((candidate) => join(candidate, "project.godot"))
    .find((candidate) => existsSync(candidate));

  if (projectFromDirectory) {
    return projectFromDirectory;
  }

  throw new Error(
    [
      `Could not find project.godot for: ${rawPath}`,
      "Checked:",
      ...candidates.map((candidate) => `- ${candidate}`),
    ].join("\n")
  );
}

function ensurePluginEnabled(projectText) {
  const pluginLine = `enabled=PackedStringArray("${BRIDGE_PLUGIN_PATH}")`;

  if (projectText.includes(BRIDGE_PLUGIN_PATH)) {
    return projectText;
  }

  if (!projectText.includes("[editor_plugins]")) {
    return `${projectText.trimEnd()}\n\n[editor_plugins]\n\n${pluginLine}\n`;
  }

  return projectText.replace(/\[editor_plugins\]\n([\s\S]*?)(?=\n\[|$)/, (section) => {
    const enabledMatch = section.match(/enabled=PackedStringArray\(([^)]*)\)/);

    if (!enabledMatch) {
      return `${section.trimEnd()}\n${pluginLine}\n`;
    }

    const current = enabledMatch[1].trim();
    const next = current ? `${current}, "${BRIDGE_PLUGIN_PATH}"` : `"${BRIDGE_PLUGIN_PATH}"`;

    return section.replace(/enabled=PackedStringArray\([^)]*\)/, `enabled=PackedStringArray(${next})`);
  });
}

function connectBridge(rawPath) {
  if (!existsSync(SOURCE_ADDON)) {
    throw new Error(`Bridge addon source is missing: ${SOURCE_ADDON}`);
  }

  const projectFile = resolveProjectPath(rawPath);
  const projectRoot = resolve(projectFile, "..");
  const targetAddonRoot = join(projectRoot, "addons", "scholomance_godot_bridge");

  mkdirSync(join(projectRoot, "addons"), { recursive: true });
  cpSync(SOURCE_ADDON, targetAddonRoot, {
    recursive: true,
    force: true,
    errorOnExist: false,
  });

  const projectText = readFileSync(projectFile, "utf8");
  const nextProjectText = ensurePluginEnabled(projectText);

  if (nextProjectText !== projectText) {
    writeFileSync(projectFile, nextProjectText);
  }

  return {
    projectFile,
    targetAddonRoot,
    pluginPath: BRIDGE_PLUGIN_PATH,
    projectUpdated: nextProjectText !== projectText,
  };
}

const rawPath = process.argv[2];

if (!rawPath) {
  console.error("Usage: node scripts/connect-godot-bridge.js <project.godot | Godot project directory>");
  process.exit(1);
}

try {
  const result = connectBridge(rawPath);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
