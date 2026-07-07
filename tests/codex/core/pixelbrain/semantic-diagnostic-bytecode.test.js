import { describe, it, expect } from 'vitest';
import {
  semanticDiagnosticToBytecode,
  createSemanticDiagnostic,
  SEMANTIC_DIAGNOSTIC_BYTECODES,
  SemanticDiagnosticCodes,
} from '../../../../codex/core/pixelbrain/semantic-registry.js';
import { decodeBytecodeError } from '../../../../codex/core/pixelbrain/bytecode-error.js';
import { compileSCDL } from '../../../../codex/core/pixelbrain/scdl/index.js';

describe('PB-SEM → PB-ERR-v1 bytecode adapter', () => {
  it('every registered PB-SEM code has a bytecode in the ARTIFACT 0x1080 block', () => {
    for (const code of Object.values(SemanticDiagnosticCodes)) {
      const byte = SEMANTIC_DIAGNOSTIC_BYTECODES[code];
      expect(byte, code).toBeGreaterThanOrEqual(0x1080);
      expect(byte, code).toBeLessThanOrEqual(0x108f);
    }
  });

  it('encodes a diagnostic that the shared decoder can round-trip', () => {
    const bytecode = semanticDiagnosticToBytecode({
      code: 'PB-SEM-003',
      severity: 'warn',
      message: 'Glow intent has no material binding.',
      nodeId: 'scdl:gem:1:glow',
    });
    const decoded = decodeBytecodeError(bytecode);
    expect(decoded).not.toBeNull();
    expect(decoded.moduleId).toBe('ARTIFA');
    expect(decoded.errorCode).toBe(0x1083);
    expect(decoded.context.pbSemCode).toBe('PB-SEM-003');
    expect(decoded.context.nodeId).toBe('scdl:gem:1:glow');
  });

  it('maps unknown codes to the PB-SEM-000 fallback slot', () => {
    const decoded = decodeBytecodeError(
      semanticDiagnosticToBytecode({ code: 'PB-SEM-999', severity: 'info', message: 'x' })
    );
    expect(decoded.errorCode).toBe(SEMANTIC_DIAGNOSTIC_BYTECODES['PB-SEM-000']);
  });

  it('createSemanticDiagnostic satisfies the compiler error-list contract', () => {
    const diag = createSemanticDiagnostic({ code: 'PB-SEM-003', severity: 'warn', message: 'm' });
    expect(diag.isError()).toBe(false);
    expect(diag.isWarn()).toBe(true);
    expect(diag.bytecodeString).toMatch(/^PB-ERR-v1-/);
    expect(diag.toJSON().bytecodeString).toBe(diag.bytecodeString);
  });

  it('SCDL compiles emitting PB-SEM diagnostics as decodable bytecode', () => {
    const source = `
      asset gemtest canvas 16x16
      palette { cyan = #00E5FF }
      part gem {
        cell 8 8 cyan
        glow radius 2
      }
    `;
    const result = compileSCDL(source);
    expect(result.ok).toBe(true);
    const semDiags = result.errors.filter((e) => e.semantic);
    expect(semDiags.length).toBeGreaterThan(0);
    for (const diag of semDiags) {
      const decoded = decodeBytecodeError(diag.bytecodeString);
      expect(decoded, diag.code).not.toBeNull();
      expect(decoded.context.pbSemCode).toBe(diag.code);
    }
  });
});
