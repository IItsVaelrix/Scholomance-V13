export const SCDL_V2_DIAGNOSTICS_CONTRACT = 'SCDL-DIAGNOSTICS-v2';

export const DIAGNOSTIC_PHASES = Object.freeze({
  LEX: 'LEX',
  PARSE: 'PARSE',
  ANALYZE: 'ANALYZE',
  BUDGET: 'BUDGET',
  LOWER: 'LOWER',
  EVALUATE: 'EVALUATE',
  RASTER: 'RASTER',
  AMP: 'AMP',
  EMIT: 'EMIT',
  EXPORT: 'EXPORT',
});

export function span(start, end = start) {
  const point = (value) => Object.freeze({
    line: Number(value.line),
    column: Number(value.column),
    offset: Number(value.offset),
  });
  return Object.freeze({ start: point(start), end: point(end) });
}

export function toEditorRange(sp) {
  if (!sp || !sp.start) return Object.freeze({ start: { line: 0, character: 0 }, end: { line: 0, character: 0 } });
  const startLine = Math.max(0, (Number(sp.start.line) || 1) - 1);
  const startCol = Math.max(0, (Number(sp.start.column) || 1) - 1);
  const endLine = Math.max(0, (Number(sp.end?.line ?? sp.start.line) || 1) - 1);
  const endCol = Math.max(0, (Number(sp.end?.column ?? sp.start.column) || 1) - 1);
  return Object.freeze({
    start: Object.freeze({ line: startLine, character: startCol }),
    end: Object.freeze({ line: endLine, character: endCol }),
  });
}

export class SCDLV2Diagnostic {
  constructor({
    code,
    severity = 'ERROR',
    phase,
    message,
    span: diagnosticSpan,
    instructionPath = [],
    expected = [],
    received = [],
    relatedSymbols = [],
    fixes = [],
  }) {
    this.code = String(code);
    this.label = this.code;
    this.severity = severity;
    this.phase = phase || 'ANALYZE';
    this.message = String(message);
    const startLine = diagnosticSpan?.start?.line ?? diagnosticSpan?.line ?? 1;
    const startCol = diagnosticSpan?.start?.column ?? diagnosticSpan?.column ?? diagnosticSpan?.col ?? 1;
    this.span = diagnosticSpan?.start ? diagnosticSpan : span({ line: startLine, column: startCol, offset: 0 });
    this.loc = { line: startLine, col: startCol };
    this.editorRange = toEditorRange(diagnosticSpan);
    this.instructionPath = Object.freeze([...instructionPath]);
    this.expected = Object.freeze([...expected]);
    this.received = Object.freeze([...received]);
    this.relatedSymbols = Object.freeze([...relatedSymbols]);
    this.fixes = Object.freeze(fixes.map((fix) => Object.freeze({
      ...fix,
      preconditions: Object.freeze([...(fix.preconditions || [])]),
    })));
    this.bytecodeString = null;
    Object.freeze(this);
  }

  isError() { return this.severity === 'ERROR'; }
  isWarn() { return this.severity === 'WARN'; }
  isInfo() { return this.severity === 'INFO'; }

  toJSON() {
    return {
      code: this.code,
      severity: this.severity,
      phase: this.phase,
      message: this.message,
      span: this.span,
      editorRange: this.editorRange,
      instructionPath: this.instructionPath,
      expected: this.expected,
      received: this.received,
      relatedSymbols: this.relatedSymbols,
      fixes: this.fixes,
    };
  }
}

export function v2Diagnostic(fields) {
  return new SCDLV2Diagnostic(fields);
}

export function normalizeDiagnostic(item) {
  if (!item) return null;
  if (item instanceof SCDLV2Diagnostic) return item;
  if (typeof item.isError === 'function') return item;
  return new SCDLV2Diagnostic({
    code: item.code || 'SCDL-ERR-000',
    severity: item.severity || 'ERROR',
    phase: item.phase || 'ANALYZE',
    message: item.message || String(item),
    span: item.span || span({ line: item.line || item.loc?.line || 1, column: item.col || item.loc?.col || 1, offset: 0 }),
    expected: item.expected || [],
    received: item.received || [],
    relatedSymbols: item.relatedSymbols || [],
    fixes: item.fixes || [],
  });
}

export function diagnosticEnvelope(diagnostics) {
  const norm = diagnostics.map(normalizeDiagnostic).filter(Boolean);
  return Object.freeze({
    contract: SCDL_V2_DIAGNOSTICS_CONTRACT,
    ok: !norm.some((item) => item.isError()),
    languageVersion: 2,
    compilerVersion: '2.0.0',
    diagnostics: Object.freeze(norm.map((item) => Object.freeze(item.toJSON()))),
  });
}

export function createDiagnosticEnvelope(options = {}) {
  const diag = normalizeDiagnostic(options);
  const json = diag.toJSON();
  return Object.freeze({
    ...json,
    line: options.line || options.span?.line || diag.span?.start?.line || 1,
    column: options.column || options.col || options.span?.column || diag.span?.start?.column || 1,
  });
}
