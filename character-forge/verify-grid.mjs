import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const DIR = 'generated-assets/battle-poet';
const OUT = '/tmp/claude-1000/-home-deck-Downloads-Scholomance-V12-main/90eb51aa-ed2e-4955-abf8-402825447b36/scratchpad';
// walk step-frame (f1) per facing; mirrors flip an east-side source
const cells = [
  ['NW','northeast',true],['N','north',false],['NE','northeast',false],
  ['W','east',true],     [null,null,false],   ['E','east',false],
  ['SW','southeast',true],['S','south',false],['SE','southeast',false],
];
const img = (src,flip)=>`<img src="data:image/png;base64,${readFileSync(`${DIR}/battle-poet-${src}-walk-f1-png.png`).toString('base64')}" style="width:150px;image-rendering:pixelated;${flip?'transform:scaleX(-1)':''}">`;
const html = cells.map(([lbl,src,flip])=>`<div style="display:flex;flex-direction:column;align-items:center;color:#8a7fd6;font:12px monospace">${lbl||'&middot;'}<div style="height:230px;display:flex;align-items:flex-end">${src?img(src,flip):''}</div></div>`).join('');
const b=await chromium.launch({headless:true,args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:3*160+30,height:3*250+20}});
await p.setContent(`<body style="margin:0;background:#0b0a12"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:12px">${html}</div></body>`);
await p.waitForTimeout(200); await p.screenshot({path:`${OUT}/verify-grid.png`}); await b.close(); console.log('ok');
