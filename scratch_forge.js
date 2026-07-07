import fs from 'fs';
import { forgeItemAsset } from './codex/core/pixelbrain/item-foundry.js';

const specRaw = fs.readFileSync('specs/claymore-holy-fire.json', 'utf8');
const spec = JSON.parse(specRaw);

const bundle = forgeItemAsset(spec, { includePng: false, includeShader: false, includeVolume: false });

console.log("Bundle keys:", Object.keys(bundle));
console.log("Asset packet:", bundle.assetPacket.source);
console.log("Num coords:", bundle.assetPacket.geometry.coordinates.length);

const outputStr = bundle.godotArtifact;
fs.writeFileSync('/home/deck/Downloads/holy_fire_claymore.pbrain', outputStr);
console.log("Wrote artifact to /home/deck/Downloads/holy_fire_claymore.pbrain");
