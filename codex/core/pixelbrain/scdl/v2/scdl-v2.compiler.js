// Never-throw SCDL v2 pass orchestration. Every public result is built by
// successV2 or failV2; a false `ok` always nulls analysis/bytecode/package/
// packet and freezes framePackets empty. lowerSCDLV2Bytecode's programId:null
// fallback is an emit failure, not a successful empty program.

import { parseSCDLV2 } from './scdl-v2.parser.js';
import { analyzeSCDLV2 } from './scdl-v2.analyzer.js';
import { verifySCDLV2Budget } from './scdl-v2.budget.js';
import { lowerSCDLV2Bytecode } from './scdl-v2.bytecode.js';
import { evaluateSCDLV2 } from './scdl-v2.evaluator.js';
import { rasterizeSCDLV2 } from './scdl-v2.raster.js';
import { emitSCDLV2Package } from './scdl-v2.emit.js';
import { diagnosticEnvelope, span, v2Diagnostic } from './scdl-v2.diagnostics.js';

const ZERO_SPAN = span({ line: 1, column: 1, offset: 0 });

function internalDiagnostic(error) {
  const name = error && typeof error === 'object' && error.name ? String(error.name) : 'Error';
  return v2Diagnostic({
    code: 'SCDL-EMIT-999',
    phase: 'emit',
    message: 'Internal emit failure.',
    span: ZERO_SPAN,
    received: [name],
  });
}

function baseResult({ source, options, cst, ast, errors }) {
  const frozenErrors = Object.freeze([...errors]);
  const diagnosticReport = diagnosticEnvelope(frozenErrors);
  return {
    contract: 'SCDL-COMPILE-RESULT-v2',
    languageVersion: 2,
    compilerVersion: '2.0.0',
    cst,
    ast,
    errors: frozenErrors,
    diagnostics: diagnosticReport.diagnostics,
    diagnosticReport,
    frameLoop: null,
    regressionSeed: Object.freeze({ source, options, checksum: null }),
  };
}

function failV2({ source, options, cst, ast, diagnostics }) {
  return Object.freeze({
    ...baseResult({ source, options, cst, ast, errors: diagnostics }),
    ok: false,
    analysis: null,
    bytecode: null,
    package: null,
    packet: null,
    framePackets: Object.freeze([]),
  });
}

function successV2({ source, options, cst, ast, analysis, bytecode, package: packageValue, packet }) {
  return Object.freeze({
    ...baseResult({ source, options, cst, ast, errors: [] }),
    ok: true,
    analysis,
    bytecode,
    package: packageValue,
    packet,
    framePackets: Object.freeze([packet]),
    regressionSeed: Object.freeze({ source, options, checksum: bytecode.programId }),
  });
}

export function compileSCDLV2(source, options = {}) {
  const safeSource = typeof source === 'string' ? source : '';
  const safeOptions = options && typeof options === 'object' ? options : {};
  try {
    const parsed = parseSCDLV2(safeSource);
    if (!parsed.ok) return failV2({ source: safeSource, options: safeOptions, cst: parsed.cst, ast: null, diagnostics: parsed.diagnostics });
    const analyzed = analyzeSCDLV2(parsed.ast);
    if (!analyzed.ok) return failV2({ source: safeSource, options: safeOptions, cst: parsed.cst, ast: parsed.ast, diagnostics: analyzed.diagnostics });
    const budget = verifySCDLV2Budget(analyzed.ir, safeOptions);
    if (!budget.ok) return failV2({ source: safeSource, options: safeOptions, cst: parsed.cst, ast: parsed.ast, diagnostics: budget.diagnostics });
    const bytecode = lowerSCDLV2Bytecode(analyzed.ir, budget.verified);
    if (!bytecode || typeof bytecode.programId !== 'string') {
      return failV2({
        source: safeSource,
        options: safeOptions,
        cst: parsed.cst,
        ast: parsed.ast,
        diagnostics: [internalDiagnostic({ name: 'Error' })],
      });
    }
    const evaluated = evaluateSCDLV2(bytecode);
    if (!evaluated.ok) return failV2({ source: safeSource, options: safeOptions, cst: parsed.cst, ast: parsed.ast, diagnostics: evaluated.diagnostics });
    const raster = rasterizeSCDLV2(evaluated.construction, analyzed.ir.canvas, budget.verified);
    if (!raster.ok) return failV2({ source: safeSource, options: safeOptions, cst: parsed.cst, ast: parsed.ast, diagnostics: raster.diagnostics });
    const emitted = emitSCDLV2Package({ analysis: analyzed.ir, bytecode, construction: evaluated.construction, raster });
    return successV2({ source: safeSource, options: safeOptions, cst: parsed.cst, ast: parsed.ast, analysis: analyzed.ir, bytecode, ...emitted });
  } catch (error) {
    return failV2({ source: safeSource, options: safeOptions, cst: null, ast: null, diagnostics: [internalDiagnostic(error)] });
  }
}
