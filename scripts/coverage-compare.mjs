import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as coverageCell from '../codex/core/diagnostic/cells/test-coverage.cell.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGIC_EXT = /\.(m?[jt]sx?|cjs)$/;
const SKIP = new Set(['node_modules','.git','venv','.venv','.worktrees','dist','build','.next','coverage']);
function walk(d,o){let e;try{e=fs.readdirSync(d,{withFileTypes:true});}catch{return;}for(const x of e){if(SKIP.has(x.name))continue;const f=path.join(d,x.name);if(x.isDirectory())walk(f,o);else if(x.isFile()&&LOGIC_EXT.test(x.name))o.push(f);}}
const abs=[];walk(ROOT,abs);
const files=abs.map(a=>({path:path.relative(ROOT,a).replace(/\\/g,'/'),content:(()=>{try{return fs.readFileSync(a,'utf8');}catch{return'';}})()}));
const res=await coverageCell.scan({files},files);
const baseViolations=new Set((res.errors||[]).map(e=>e.context.sourceFile));
// consumer ledger
const ledger=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/superpowers/evidence/consumer-coverage-ledger.json'),'utf8')).ledger;
const byMod=new Map(ledger.map(r=>[r.module,r]));
// same denominator = ledger modules
let baseFlagged=0, exercised=0, pinned=0, trans=0, expUndecl=0, stranded=0, wip=0;
const falsePosExamples=[];
for(const r of ledger){
  if(baseViolations.has(r.module)){
    baseFlagged++;
    if(r.state==='DIRECTLY_PINNED'){pinned++;exercised++;if(falsePosExamples.length<12)falsePosExamples.push(r.module);}
    else if(r.state==='TRANSITIVELY_EXERCISED'){trans++;exercised++;}
    else if(r.state==='EXPERIMENTAL_UNDECLARED'){expUndecl++;}
    else if(r.state==='STRANDED'){stranded++;}
    else if(r.state==='WIP'){wip++;}
  }
}
console.log(JSON.stringify({
  denominator:ledger.length,
  baselineFlaggedInDenominator:baseFlagged,
  ofThose_actuallyExercised:exercised,
  _breakdown:{DIRECTLY_PINNED:pinned,TRANSITIVELY_EXERCISED:trans,EXPERIMENTAL_UNDECLARED:expUndecl,STRANDED:stranded,WIP:wip},
  baselineFalsePositiveRate:(exercised/Math.max(baseFlagged,1)).toFixed(3),
  falsePositiveExamples_directlyPinned:falsePosExamples,
},null,2));
