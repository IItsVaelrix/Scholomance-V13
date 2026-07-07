import fs from 'fs';
import { generateHairFlowCells } from './hair-flow-amp.js';

const config = {
  partId: "rear_plume",
  material: "hair_red",
  canvas: { w: 96, h: 96 },
  origin: { x: 45, y: 18 },
  flow: { dx: 1.0, dy: -0.18 },
  gravity: { dx: 0.10, dy: 0.08 },
  length: 46,
  width: 28,
  clumpCount: 18, // We now rely on thick groups instead of 1px strands!
  strandCount: 0, 
  taper: 0.86,
  curl: 0.22,
  chaos: 0.03,
  noise: {
    scale: 0.08,
    strength: 0.45,
    octaves: 3
  },
  scattering: {
    light: { x: -0.45, y: -0.9 },
    strength: 0.55,
    rim: 0.35
  },
  paletteRoles: {
    shadow: "plume0",
    body: "plume1",
    bright: "plume2",
    hot: "plumehi"
  },
  seed: "infernal_plumed_helm_plume_v3"
};

const cells = generateHairFlowCells(config);
let cellLines = cells.map(c => `  cell ${Math.round(c.x)} ${Math.round(c.y)} ${c.colorAlias}`).join('\n');

const scdlPath = 'docs/references/infernal_plumed_helm.scdl';
let scdl = fs.readFileSync(scdlPath, 'utf8');

const start = '# BEGIN GENERATED HairFlowAMP rear_plume';
const end = '# END GENERATED HairFlowAMP rear_plume';

const generatedBlock = `${start}
part rear_plume material hair_red {
${cellLines}
}
${end}

`;

const generatedRegex = new RegExp(`${start}[\\s\\S]*?${end}\\n\\n`);

if (generatedRegex.test(scdl)) {
  scdl = scdl.replace(generatedRegex, generatedBlock);
} else {
  scdl = scdl.replace('export json png aseprite', generatedBlock + 'export json png aseprite');
}

fs.writeFileSync(scdlPath, scdl);
console.log('Injected HairGroupAMP (v5) cells idempotently into SCDL!');
