import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { forgeItemAsset } from '../codex/core/pixelbrain/item-foundry.js';
import { compileSCDL, exportSCDL } from '../codex/core/pixelbrain/scdl/index.js';
import { buildPolishedIceSlimeStaffScdl } from './build-polished-ice-slime-staff-scdl.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SPEC_PATH = resolve(ROOT, 'specs/ice-slime-staff.v1.json');
const FIXTURE_DIR = resolve(ROOT, 'codex/core/pixelbrain/scdl/fixtures/ice_slime_staff');
const GENERATED_DIR = resolve(ROOT, 'generated-assets/IceSlimeStaff');
const PUBLIC_DIR = resolve(ROOT, 'public/assets/items');
const ASSET_ID = 'IceSlimeStaff';

mkdirSync(FIXTURE_DIR, { recursive: true });
mkdirSync(GENERATED_DIR, { recursive: true });
mkdirSync(PUBLIC_DIR, { recursive: true });

const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8'));
const bundle = forgeItemAsset(spec, { includeShader: false, includePng: false });

if (!bundle.routeDiagnostics?.ok) {
  throw new Error(`Ice Slime Staff forge failed:\n${JSON.stringify(bundle.routeDiagnostics?.failures, null, 2)}`);
}

const { source: scdlSource, rigFit } = buildPolishedIceSlimeStaffScdl(bundle, { assetName: ASSET_ID });
console.log(`[ice-slime-staff] rig fit scale ${rigFit.scale.toFixed(4)} → ${rigFit.canvas.width}x${rigFit.canvas.height}`);
const scdlPath = resolve(FIXTURE_DIR, 'ice_slime_staff.scdl');
const generatedScdlPath = resolve(GENERATED_DIR, `${ASSET_ID}.scdl`);

writeFileSync(scdlPath, scdlSource, 'utf8');
writeFileSync(generatedScdlPath, scdlSource, 'utf8');
copyFileSync(SPEC_PATH, resolve(GENERATED_DIR, 'ice-slime-staff.v1.json'));

console.log(`[ice-slime-staff] SCDL authored: ${scdlPath}`);

const compiled = compileSCDL(scdlSource);
if (!compiled.ok) {
  const messages = compiled.errors
    .filter((entry) => entry.isError?.())
    .map((entry) => entry.message)
    .join('\n');
  throw new Error(`SCDL compile failed:\n${messages}`);
}

for (const warn of compiled.errors.filter((entry) => entry.isWarn?.())) {
  console.warn(`  WARN: ${warn.message}`);
}

const targets = ['json', 'svg', 'phaser', 'png'];
const multiFrame = Boolean(compiled.frameLoop) && compiled.framePackets.length > 1;

function targetExt(target) {
  if (target === 'png') return 'png';
  if (target === 'json') return 'json';
  if (target === 'svg') return 'svg';
  if (target === 'phaser') return 'json';
  return target;
}

function writeExport(relativeName, bytes) {
  const dest = resolve(GENERATED_DIR, relativeName);
  writeFileSync(dest, bytes);
  return dest;
}

if (multiFrame) {
  compiled.framePackets.forEach((framePacket, frameIndex) => {
    for (const target of targets) {
      const out = exportSCDL(framePacket, [target], compiled.ast)[target];
      if (!out?.ok) {
        console.warn(`  [WARN] export ${target} f${frameIndex} failed: ${out?.output}`);
        continue;
      }
      const bytes = ArrayBuffer.isView(out.output) ? out.output : Buffer.from(String(out.output), 'utf8');
      writeExport(`${ASSET_ID}-f${frameIndex}-${target}.${targetExt(target)}`, bytes);
    }
  });
  writeFileSync(
    resolve(GENERATED_DIR, `${ASSET_ID}-frameloop.json`),
    JSON.stringify(compiled.frameLoop, null, 2),
  );
} else {
  for (const target of targets) {
    const out = exportSCDL(compiled.packet, [target], compiled.ast)[target];
    if (!out?.ok) throw new Error(`export ${target} failed: ${out?.output}`);
    const bytes = ArrayBuffer.isView(out.output) ? out.output : Buffer.from(String(out.output), 'utf8');
    writeExport(`${ASSET_ID}-f0-${target}.${targetExt(target)}`, bytes);
  }
}

const iconSrc = resolve(GENERATED_DIR, `${ASSET_ID}-f0-png.png`);
copyFileSync(iconSrc, resolve(PUBLIC_DIR, `${ASSET_ID}-f0-png.png`));
copyFileSync(iconSrc, resolve(PUBLIC_DIR, `${ASSET_ID}-icon.png`));

for (let frameIndex = 0; frameIndex <= 8; frameIndex += 1) {
  const framePath = resolve(GENERATED_DIR, `${ASSET_ID}-f${frameIndex}-png.png`);
  try {
    copyFileSync(framePath, resolve(PUBLIC_DIR, `${ASSET_ID}-f${frameIndex}-png.png`));
  } catch {
    if (frameIndex === 0) throw new Error('Missing f0 PNG export');
  }
}

console.log('[ice-slime-staff] SCDL compile complete');
console.log(`  packet: ${compiled.packet.id}`);
console.log(`  frames: ${compiled.framePackets?.length || 1}`);
console.log(`  generated: ${GENERATED_DIR}`);
console.log(`  public: ${PUBLIC_DIR}`);