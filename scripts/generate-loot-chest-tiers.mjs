import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LOOT_CHEST_OPEN_FRAME_COUNT,
  LOOT_CHEST_PNG_SCALE,
  LOOT_CHEST_TIERS,
  getLootChestGeneratedAssetFilename,
  getLootChestGeneratedAssetPath,
  transmuteLootChestPacket,
} from '../codex/core/pixelbrain/loot-chest-shared.js';
import {
  LOOT_CHEST_SCDL_FIXTURE,
  compileLootChestSource,
  renderLootChestTierFramePng,
} from '../codex/core/pixelbrain/loot-chest-forge.js';
import { exportSCDL } from '../codex/core/pixelbrain/scdl/scdl.exporters.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(ROOT, 'output', 'foundry', 'loot-chest');
const GENERATED_DIR = resolve(ROOT, 'generated-assets', 'LootChest');

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(GENERATED_DIR, { recursive: true });

const source = readFileSync(LOOT_CHEST_SCDL_FIXTURE, 'utf8');
const compiled = compileLootChestSource(source);

writeFileSync(resolve(OUT_DIR, 'loot_chest.source.json'), JSON.stringify(compiled.packet, null, 2));
if (compiled.frameLoop) {
  writeFileSync(resolve(GENERATED_DIR, 'loot_chest-frameloop.json'), JSON.stringify(compiled.frameLoop, null, 2));
}
copyFileSync(LOOT_CHEST_SCDL_FIXTURE, resolve(GENERATED_DIR, 'loot_chest.scdl'));

for (const tier of Object.values(LOOT_CHEST_TIERS)) {
  for (let frameIndex = 0; frameIndex < LOOT_CHEST_OPEN_FRAME_COUNT; frameIndex += 1) {
    const png1x = renderLootChestTierFramePng(compiled, tier, frameIndex, {
      ast: compiled.ast,
      scale: LOOT_CHEST_PNG_SCALE,
    });
    const generatedPath = resolve(
      GENERATED_DIR,
      getLootChestGeneratedAssetFilename(tier, frameIndex, LOOT_CHEST_PNG_SCALE),
    );

    writeFileSync(resolve(OUT_DIR, `${tier}.f${frameIndex}.1x.png`), png1x);
    writeFileSync(generatedPath, png1x);

    const tierPacket = transmuteLootChestPacket(compiled.framePackets[frameIndex], tier);
    const tierExports = exportSCDL(tierPacket, ['json'], compiled.ast);
    writeFileSync(
      resolve(GENERATED_DIR, `LootChest-${tier}-f${frameIndex}-json.json`),
      tierExports.json.output,
    );
  }

  console.log(`forged ${tier} → ${getLootChestGeneratedAssetPath(tier, 0, LOOT_CHEST_PNG_SCALE)} (+${LOOT_CHEST_OPEN_FRAME_COUNT - 1} open frames)`);
}

console.log(`source packet: ${compiled.packet.id}`);
console.log(`open frames: ${compiled.framePackets?.length || 1}`);
console.log(`generated assets: ${GENERATED_DIR}`);
console.log('Loot chest tiers complete.');