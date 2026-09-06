export const SCDL_V2_DIAGNOSTICS_CONTRACT = 'SCDL-DIAGNOSTICS-v2';

export function span(start, end = start) {
  const point = (value) => Object.freeze({
    line: Number(value.line),
    column: Number(value.column),
    offset: Number(value.offset),
  });
  return Object.freeze({ start: point(start), end: point(end) });
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
    this.phase = phase;
    this.message = String(message);
    this.span = diagnosticSpan;
    this.loc = { line: diagnosticSpan.start.line, col: diagnosticSpan.start.column };
    this.instructionPath = Object.freeze([...instructionPath]);
    this.expected = Object.freeze([...expected]);
    this.received = Object.freeze([...received]);
    this.relatedSymbols = Object.freeze([...relatedSymbols]);
    this.fixes = Object.freeze(fixes.map((fix) => Object.freeze({ ...fix })));
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

export function diagnosticEnvelope(diagnostics) {
  return Object.freeze({
    contract: SCDL_V2_DIAGNOSTICS_CONTRACT,
    ok: !diagnostics.some((item) => item.isError()),
    languageVersion: 2,
    compilerVersion: '2.0.0',
    diagnostics: Object.freeze(diagnostics.map((item) => Object.freeze(item.toJSON()))),
  });
}
