#!/usr/bin/env node
// mud-install-vaelrix.mjs
// Install the Vaelrix Mudlet module into any GMCP-capable Mudlet profile.
//
// "This setup" = what is already working on the "Alter Aeon" profile:
//   1. vaelrix.mpackage built from mudlet/vaelrix/ source
//   2. package contents extracted into profiles/<profile>/vaelrix/
//   3. profile's saved XML patched:
//        - <string>vaelrix</string> added to <mInstalledPackages>
//        - an <mInstalledModules> block pointing at the repo .mpackage
//        - mEnableGMCP="yes" set on the <Host> element
//
// Vaelrix only initializes when the MUD speaks GMCP, so enabling GMCP on every
// targeted profile is what makes this work for "any mud that accepts it" — it
// stays dormant on a MUD that never sends GMCP.
//
// Usage:
//   npm run mud:vaelrix                       # all existing profiles
//   npm run mud:vaelrix -- Elysium Mudren     # named profiles only
//   npm run mud:vaelrix -- --new --name "MyMud" --host mud.example.com --port 4000
//   npm run mud:vaelrix -- --dry-run          # show actions, touch nothing
//
// Flags:
//   --dry-run        Print planned actions without writing anything.
//   --allow-running  Patch even if Mudlet appears to be running (unsafe: Mudlet
//                    overwrites profile XML on exit, discarding the edit).
//   --new            Provision a brand-new profile (requires --name/--host/--port).
//   --name/--host/--port   New-profile connection details.
//   --template NAME  Donor profile to clone Host settings from for --new.
//   --profiles-dir P Override the Mudlet profiles directory.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const SRC_DIR = path.join(REPO_ROOT, 'mudlet', 'vaelrix');
const MPACKAGE = path.join(REPO_ROOT, 'mudlet', 'vaelrix.mpackage');
const BUILD_SCRIPT = path.join(SRC_DIR, 'build-mpackage.sh');

// ---------------------------------------------------------------------------
// Tiny arg parser
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = {
    positionals: [],
    dryRun: false,
    allowRunning: false,
    new: false,
    name: null,
    host: null,
    port: null,
    template: null,
    profilesDir: path.join(os.homedir(), '.config', 'mudlet', 'profiles'),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--dry-run': opts.dryRun = true; break;
      case '--allow-running': opts.allowRunning = true; break;
      case '--new': opts.new = true; break;
      case '--name': opts.name = argv[++i]; break;
      case '--host': opts.host = argv[++i]; break;
      case '--port': opts.port = argv[++i]; break;
      case '--template': opts.template = argv[++i]; break;
      case '--profiles-dir': opts.profilesDir = argv[++i]; break;
      default:
        if (a.startsWith('--')) fail(`Unknown flag: ${a}`);
        opts.positionals.push(a);
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const C = { dim: (s) => `\x1b[2m${s}\x1b[0m`, ok: (s) => `\x1b[32m${s}\x1b[0m`, warn: (s) => `\x1b[33m${s}\x1b[0m`, err: (s) => `\x1b[31m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m` };
function fail(msg) { console.error(C.err(`✗ ${msg}`)); process.exit(1); }
function info(msg) { console.log(msg); }

function mudletRunning() {
  // Match the process NAME exactly (-x), case-insensitive (-i). Using -f would
  // match any command line merely containing "mudlet" — e.g. an editor with a
  // file under mudlet/ open, or a shell sitting in that dir — a false positive.
  const r = spawnSync('pgrep', ['-xi', 'mudlet'], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim().length > 0;
}

function newestCurrentXml(profileDir) {
  const dir = path.join(profileDir, 'current');
  if (!fs.existsSync(dir)) return null;
  const xmls = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.xml'))
    .map((f) => ({ f: path.join(dir, f), m: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  return xmls.length ? xmls[0].f : null;
}

// Copy the package source into the profile dir, mirroring build-mpackage.sh
// excludes (*.sh and dotfiles). rm-then-copy keeps it idempotent / stale-free.
function extractIntoProfile(profileDir, dryRun) {
  const dest = path.join(profileDir, 'vaelrix');
  if (dryRun) { info(C.dim(`    would refresh ${dest}`)); return; }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(SRC_DIR)) {
    if (entry.startsWith('.') || entry.endsWith('.sh')) continue;
    fs.cpSync(path.join(SRC_DIR, entry), path.join(dest, entry), { recursive: true });
  }
}

// Idempotent, targeted XML edits. Returns { xml, changed:[...] }.
function patchProfileXml(xml) {
  const changed = [];

  // 1. Enable GMCP on the <Host ...> element.
  if (/mEnableGMCP="no"/.test(xml)) {
    xml = xml.replace('mEnableGMCP="no"', 'mEnableGMCP="yes"');
    changed.push('GMCP enabled');
  } else if (!/mEnableGMCP="/.test(xml)) {
    xml = xml.replace('<Host ', '<Host mEnableGMCP="yes" ');
    changed.push('GMCP attribute added');
  }

  // 2. Add <string>vaelrix</string> to <mInstalledPackages>.
  const pkgBlock = xml.match(/<mInstalledPackages>([\s\S]*?)<\/mInstalledPackages>/);
  if (pkgBlock && !/<string>vaelrix<\/string>/.test(pkgBlock[1])) {
    const closeMatch = xml.match(/([ \t]*)<\/mInstalledPackages>/);
    const indent = closeMatch ? closeMatch[1] : '\t\t\t';
    xml = xml.replace(
      /([ \t]*)<\/mInstalledPackages>/,
      `${indent}\t<string>vaelrix</string>\n$1</mInstalledPackages>`,
    );
    changed.push('package registered');
  } else if (!pkgBlock) {
    // No installed-packages list at all (very bare profile) — inject one.
    xml = xml.replace(
      /([ \t]*)<\/name>/,
      `$1</name>\n$1<mInstalledPackages>\n$1\t<string>vaelrix</string>\n$1</mInstalledPackages>`,
    );
    changed.push('package list created');
  }

  // 3. Add the module block (skip if a vaelrix module key already exists).
  if (!/<key>vaelrix<\/key>/.test(xml)) {
    const closeMatch = xml.match(/([ \t]*)<\/mInstalledPackages>/);
    const indent = closeMatch ? closeMatch[1] : '\t\t\t';
    const block =
      `\n${indent}<mInstalledModules>` +
      `\n${indent}\t<key>vaelrix</key>` +
      `\n${indent}\t<filepath>${MPACKAGE}</filepath>` +
      `\n${indent}\t<zipSync>0</zipSync>` +
      `\n${indent}\t<globalSave>0</globalSave>` +
      `\n${indent}\t<priority>0</priority>` +
      `\n${indent}</mInstalledModules>`;
    xml = xml.replace(/([ \t]*<\/mInstalledPackages>)/, `$1${block}`);
    changed.push('module registered');
  }

  return { xml, changed };
}

function installIntoProfile(profileDir, opts) {
  const name = path.basename(profileDir);
  const xmlPath = newestCurrentXml(profileDir);
  if (!xmlPath) {
    info(C.warn(`  ~ ${name}: no saved profile state (open it in Mudlet once) — skipped`));
    return false;
  }

  const original = fs.readFileSync(xmlPath, 'utf8');
  const { xml, changed } = patchProfileXml(original);
  const xmlChanged = xml !== original;

  if (opts.dryRun) {
    info(C.bold(`  • ${name}`));
    info(C.dim(`    xml: ${path.relative(profileDir, xmlPath)}`));
    info(C.dim(`    would: ${changed.length ? changed.join(', ') : 'no XML change'} + refresh vaelrix/`));
    return true;
  }

  if (xmlChanged) {
    fs.copyFileSync(xmlPath, `${xmlPath}.vaelrix-bak`);
    fs.writeFileSync(xmlPath, xml);
  }
  extractIntoProfile(profileDir, false);
  info(C.ok(`  ✓ ${name}: ${changed.length ? changed.join(', ') : 'already registered'}; vaelrix/ refreshed`));
  return true;
}

// Clone an existing profile's Host *settings* (colors/fonts/flags valid for the
// installed Mudlet version), strip its content & packages, substitute identity.
function provisionNewProfile(opts) {
  if (!opts.name || !opts.host || !opts.port) {
    fail('--new requires --name, --host and --port');
  }
  const profileDir = path.join(opts.profilesDir, opts.name);
  if (fs.existsSync(profileDir) && newestCurrentXml(profileDir)) {
    fail(`Profile "${opts.name}" already exists — run without --new to add Vaelrix to it.`);
  }

  // Pick a donor to clone the Host settings from.
  let donorXml = null;
  const donorName = opts.template;
  const donorDir = donorName ? path.join(opts.profilesDir, donorName) : null;
  if (donorDir) {
    donorXml = newestCurrentXml(donorDir);
    if (!donorXml) fail(`Template profile "${donorName}" has no saved state.`);
  } else if (fs.existsSync(opts.profilesDir)) {
    for (const p of fs.readdirSync(opts.profilesDir)) {
      const x = newestCurrentXml(path.join(opts.profilesDir, p));
      if (x) { donorXml = x; break; }
    }
  }
  if (!donorXml) {
    fail('No existing profile to clone Host settings from. Create one MUD profile in Mudlet first, then re-run --new.');
  }

  let xml = fs.readFileSync(donorXml, 'utf8');
  // Identity
  xml = xml.replace(/<name>[\s\S]*?<\/name>/, `<name>${opts.name}</name>`);
  xml = xml.replace(/<url>[\s\S]*?<\/url>/, `<url>${opts.host}</url>`);
  xml = xml.replace(/<port>[\s\S]*?<\/port>/, `<port>${opts.port}</port>`);
  // Strip donor content so the new profile starts clean.
  for (const tag of ['TriggerPackage', 'AliasPackage', 'ActionPackage', 'ScriptPackage', 'KeyPackage', 'HelpPackage']) {
    xml = xml.replace(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'g'), `<${tag} />`);
  }
  xml = xml.replace(/<VariablePackage>[\s\S]*?<\/VariablePackage>/, '<VariablePackage>\n\t\t<HiddenVariables />\n\t</VariablePackage>');
  // Reset packages/modules to Mudlet defaults + vaelrix; drop donor extras.
  xml = xml.replace(
    /<mInstalledPackages>[\s\S]*?<\/mInstalledPackages>/,
    '<mInstalledPackages>\n\t\t\t\t<string>vaelrix</string>\n\t\t\t</mInstalledPackages>',
  );
  xml = xml.replace(/[ \t]*<mInstalledModules>[\s\S]*?<\/mInstalledModules>\n?/g, '');
  // Re-add via the normal patcher (module block + GMCP guarantee).
  ({ xml } = patchProfileXml(xml));

  if (opts.dryRun) {
    info(C.bold(`  • ${opts.name} (NEW)`));
    info(C.dim(`    cloned Host settings from: ${path.relative(opts.profilesDir, donorXml)}`));
    info(C.dim(`    would write ${path.join(profileDir, 'url')} / port + seed current/ + vaelrix/`));
    return profileDir;
  }

  fs.mkdirSync(path.join(profileDir, 'current'), { recursive: true });
  fs.writeFileSync(path.join(profileDir, 'url'), opts.host);
  fs.writeFileSync(path.join(profileDir, 'port'), String(opts.port));
  const ts = new Date().toISOString().slice(0, 19).replace('T', '#').replace(/:/g, '-');
  fs.writeFileSync(path.join(profileDir, 'current', `${ts}.xml`), xml);
  extractIntoProfile(profileDir, false);
  info(C.ok(`  ✓ ${opts.name}: new profile provisioned (${opts.host}:${opts.port}), Vaelrix installed`));
  return profileDir;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function buildMpackage(dryRun) {
  if (!fs.existsSync(BUILD_SCRIPT)) fail(`Build script missing: ${BUILD_SCRIPT}`);
  if (dryRun) { info(C.dim(`would build ${MPACKAGE} via build-mpackage.sh`)); return; }
  const r = spawnSync('bash', [BUILD_SCRIPT], { cwd: SRC_DIR, stdio: 'inherit' });
  if (r.status !== 0) fail('build-mpackage.sh failed (is `zip` installed?)');
  if (!fs.existsSync(MPACKAGE)) fail(`Build reported success but ${MPACKAGE} is missing.`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(SRC_DIR)) fail(`Vaelrix source not found at ${SRC_DIR}`);

  if (!opts.dryRun && !opts.allowRunning && mudletRunning()) {
    fail('Mudlet appears to be running. Close it first (it overwrites profile XML on exit), or pass --allow-running.');
  }

  info(C.bold('Building vaelrix.mpackage…'));
  buildMpackage(opts.dryRun);

  if (opts.new) {
    info(C.bold('\nProvisioning new profile…'));
    const dir = provisionNewProfile(opts);
    if (!opts.dryRun) info(C.dim(`\nOpen Mudlet → connect to "${opts.name}". Mudlet finalizes the profile on first save.`));
    // Already fully installed by provisionNewProfile; named-target patch not needed.
    void dir;
    return;
  }

  // Determine targets: named positionals, else every profile dir.
  if (!fs.existsSync(opts.profilesDir)) fail(`Profiles dir not found: ${opts.profilesDir}`);
  let targets;
  if (opts.positionals.length) {
    targets = opts.positionals.map((n) => path.join(opts.profilesDir, n));
    for (const t of targets) if (!fs.existsSync(t)) fail(`Profile not found: ${t}`);
  } else {
    targets = fs.readdirSync(opts.profilesDir)
      .map((n) => path.join(opts.profilesDir, n))
      .filter((p) => fs.statSync(p).isDirectory());
  }

  info(C.bold(`\nInstalling into ${targets.length} profile(s)${opts.dryRun ? ' (dry run)' : ''}:`));
  let done = 0;
  for (const t of targets) if (installIntoProfile(t, opts)) done++;

  info('');
  info(opts.dryRun
    ? C.dim('Dry run complete — nothing written.')
    : C.ok(`Done. ${done}/${targets.length} profile(s) ready. Reconnect in Mudlet to load Vaelrix.`));
}

main();
