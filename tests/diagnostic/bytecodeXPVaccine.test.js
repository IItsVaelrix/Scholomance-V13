import { describe, expect, it } from 'vitest';
import { BytecodeError, ERROR_CODES } from '../../codex/core/pixelbrain/bytecode-error.js';
import { encodeBytecodeHealth } from '../../codex/core/diagnostic/BytecodeHealth.js';
import {
  BytecodeXPVaccine,
  encodeBytecodeXPVaccineFromCccb,
  encodeBytecodeXPVaccineFromError,
  encodeBytecodeXPVaccineFromHealth,
  encodeBytecodeXPVaccineFromToolCall,
  parseBytecodeXPVaccineBytecode,
} from '../../codex/core/diagnostic/BytecodeXPVaccine.js';

const CCCB_ID = 'SCHOL-CCCB-v1-PDR-01-00-FNDTNDT-2405625c';

describe('BytecodeXPVaccine', () => {
  it('encodes deterministic vaccines from BytecodeError', () => {
    const error = new BytecodeError('VALUE', 'WARN', 'IMMUNE', ERROR_CODES.TEST_MISSING, {
      layer: 'coverage',
      sourceFile: 'codex/core/example.js',
      ruleId: 'TEST_MISSING',
    });

    const a = encodeBytecodeXPVaccineFromError(error);
    const b = encodeBytecodeXPVaccineFromError(error);

    expect(a.toJSON()).toEqual(b.toJSON());
    expect(a.bytecode).toMatch(/^PB-XP-v1-ERR-[A-Z0-9]{4,8}-[0-9a-f]{12}-[0-9a-f]{12}$/);
    expect(a.sourceKind).toBe('error');
    expect(a.sourceBytecode).toBe(error.bytecode);
    expect(a.recoveryKey).toBe('TEST_MISSING');
    expect(a.stableContext).toMatchObject({
      layer: 'coverage',
      sourceFile: 'codex/core/example.js',
      severity: 'WARN',
    });
  });

  it('changes checksum when stable diagnostic identity changes', () => {
    const a = encodeBytecodeXPVaccineFromError(new BytecodeError('VALUE', 'WARN', 'IMMUNE', ERROR_CODES.TEST_MISSING, {
      layer: 'coverage',
      sourceFile: 'codex/core/a.js',
    }));
    const b = encodeBytecodeXPVaccineFromError(new BytecodeError('VALUE', 'WARN', 'IMMUNE', ERROR_CODES.TEST_MISSING, {
      layer: 'coverage',
      sourceFile: 'codex/core/b.js',
    }));

    expect(a.checksum).not.toBe(b.checksum);
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it('encodes deterministic vaccines from BytecodeHealth', () => {
    const health = encodeBytecodeHealth('FIXTURE_SHAPE', 'fixture-clean', {
      moduleId: 'tests/example.test.js',
    });

    const vaccine = encodeBytecodeXPVaccineFromHealth(health);

    expect(vaccine.bytecode).toMatch(/^PB-XP-v1-HLTH-[A-Z0-9]{4,8}-[0-9a-f]{12}-[0-9a-f]{12}$/);
    expect(vaccine.sourceKind).toBe('health');
    expect(vaccine.recoveryKey).toBe('fixture-clean');
    expect(vaccine.stableContext).toMatchObject({
      cellId: 'FIXTURE_SHAPE',
      checkId: 'fixture-clean',
      contextModuleId: 'tests/example.test.js',
    });
  });

  it('encodes vaccines from CCCB block IDs', () => {
    const vaccine = encodeBytecodeXPVaccineFromCccb({
      ID: CCCB_ID,
      TITLE: 'Inventory all existing motion bytecode and animation interfaces',
      NEXT: 'TERMINAL',
    });

    expect(vaccine.bytecode).toMatch(/^PB-XP-v1-CCCB-FNDTNDT-[0-9a-f]{12}-[0-9a-f]{12}$/);
    expect(vaccine.semanticSlug).toBe('FNDTNDT');
    expect(vaccine.recoveryKey).toBe('PDR_CCCB_PDR_01_00');
    expect(vaccine.stableContext).toMatchObject({
      domain: 'PDR',
      phaseId: '01',
      stepNum: '00',
      id: CCCB_ID,
    });
  });

  it('parses PB-XP-v1 bytecode headers', () => {
    const vaccine = encodeBytecodeXPVaccineFromCccb(CCCB_ID);
    const parsed = parseBytecodeXPVaccineBytecode(vaccine.bytecode);

    expect(parsed).toMatchObject({
      valid: true,
      sourceKind: 'cccb',
      semanticSlug: 'FNDTNDT',
      fingerprint: vaccine.fingerprint,
      checksum: vaccine.checksum,
      vaccineId: vaccine.vaccineId,
    });
  });

  it('returns invalid parse result for malformed bytecode', () => {
    expect(parseBytecodeXPVaccineBytecode('not-bytecode')).toMatchObject({
      valid: false,
      error: 'MALFORMED_PB_XP',
    });
  });

  it('does not mutate source diagnostic objects or vaccine context', () => {
    const context = { layer: 'coverage', sourceFile: 'codex/core/example.js' };
    const error = new BytecodeError('VALUE', 'WARN', 'IMMUNE', ERROR_CODES.TEST_MISSING, context);
    const vaccine = encodeBytecodeXPVaccineFromError(error);

    expect(error.context).toBe(context);
    expect(() => { vaccine.stableContext.layer = 'mutated'; }).toThrow();
    expect(vaccine.stableContext.layer).toBe('coverage');
  });

  it('rejects CCCB ids whose trailing checksum has drifted', () => {
    const drifted = 'SCHOL-CCCB-v1-PDR-01-00-FNDTNDT-deadbeef';
    expect(() => encodeBytecodeXPVaccineFromCccb(drifted)).toThrow(/drifted checksum/);
  });

  it('falls back to a deterministic slug when the title collapses below 4 chars', () => {
    // Title strips to fewer than 4 alnum chars after vowel removal; the encoder
    // must not throw but produce a valid, deterministic [A-Z0-9]{4,8} slug.
    const error = new BytecodeError('VALUE', 'WARN', 'IMMUNE', ERROR_CODES.TEST_MISSING, {});
    const a = encodeBytecodeXPVaccineFromError(error, { title: 'a e i' });
    const b = encodeBytecodeXPVaccineFromError(error, { title: 'a e i' });

    expect(a.semanticSlug).toMatch(/^[A-Z0-9]{4,8}$/);
    expect(a.semanticSlug).toBe(b.semanticSlug);
    expect(a.bytecode).toMatch(/^PB-XP-v1-ERR-[A-Z0-9]{4,8}-[0-9a-f]{12}-[0-9a-f]{12}$/);
  });

  it('encodes deterministic vaccines from a tool-call episode', () => {
    const episode = {
      toolName: 'Read',
      targetPath: 'codex/core/example.js',
      targetSymbol: 'exampleFn',
      argsHash: 'abc123',
      whyFamily: 'NAV',
      whyHex: '0x1A',
      stalenessKind: 'fresh',
      stalenessKey: 'k1',
    };

    const a = encodeBytecodeXPVaccineFromToolCall(episode);
    const b = encodeBytecodeXPVaccineFromToolCall(episode);

    expect(a.toJSON()).toEqual(b.toJSON());
    expect(a.bytecode).toMatch(/^PB-XP-v1-TCL-[A-Z0-9]{4,8}-[0-9a-f]{12}-[0-9a-f]{12}$/);
    expect(a.sourceKind).toBe('toolcall');
    expect(a.sourceBytecode).toBeNull();
    expect(a.recoveryKey).toBe('NAV');
    expect(a.stableContext).toMatchObject({
      toolName: 'Read',
      targetPath: 'codex/core/example.js',
      targetSymbol: 'exampleFn',
      argsHash: 'abc123',
      whyFamily: 'NAV',
      whyHex: '0x1A',
      stalenessKind: 'fresh',
      stalenessKey: 'k1',
    });
  });

  it('produces a different fingerprint when tool-call identity changes', () => {
    const a = encodeBytecodeXPVaccineFromToolCall({
      toolName: 'Read',
      targetPath: 'codex/core/a.js',
      whyFamily: 'NAV',
    });
    const b = encodeBytecodeXPVaccineFromToolCall({
      toolName: 'Read',
      targetPath: 'codex/core/b.js',
      whyFamily: 'NAV',
    });

    expect(a.checksum).not.toBe(b.checksum);
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it('produces an identical bytecode regardless of createdAt (timestamp-independent repeat detection)', () => {
    const base = {
      toolName: 'Grep',
      targetPath: 'codex/core/example.js',
      targetSymbol: 'exampleFn',
      whyFamily: 'NAV',
    };

    const first = encodeBytecodeXPVaccineFromToolCall({ ...base, createdAt: '2026-01-01T00:00:00.000Z' });
    const second = encodeBytecodeXPVaccineFromToolCall({ ...base, createdAt: '2099-12-31T23:59:59.999Z' });

    expect(first.bytecode).toBe(second.bytecode);
    expect(first.stableContext).not.toHaveProperty('createdAt');
    expect(second.stableContext).not.toHaveProperty('createdAt');
  });

  it('parses TOOLCALL bytecode headers', () => {
    const vaccine = encodeBytecodeXPVaccineFromToolCall({
      toolName: 'Read',
      targetPath: 'codex/core/example.js',
      whyFamily: 'NAV',
    });
    const parsed = parseBytecodeXPVaccineBytecode(vaccine.bytecode);

    expect(parsed).toMatchObject({
      valid: true,
      sourceKind: 'toolcall',
      semanticSlug: vaccine.semanticSlug,
      fingerprint: vaccine.fingerprint,
      checksum: vaccine.checksum,
      vaccineId: vaccine.vaccineId,
    });
  });

  it('adding TOOLCALL does not move any existing bytecode', () => {
    const v = encodeBytecodeXPVaccineFromHealth(
      { cellId: 'c1', checkId: 'k1', code: 'X', moduleId: 'm', context: {} });
    expect(v.bytecode).toMatch(/^PB-XP-v1-HLTH-/);
    expect(parseBytecodeXPVaccineBytecode(v.bytecode).valid).toBe(true);
    // Golden value pinned pre-TOOLCALL: catches drift the prefix regex alone
    // would miss (e.g. a stray key rename inside BYTECODE_SOURCE_SEGMENTS).
    expect(v.bytecode).toBe('PB-XP-v1-HLTH-C1K1XM-9f935081eb5b-ae57da87f5cf');
  });

  it('supports direct construction with explicit fingerprint', () => {
    const vaccine = new BytecodeXPVaccine({
      sourceKind: 'health',
      semanticSlug: 'HLTHCHK',
      fingerprint: '123456789abc',
      stableContext: { checkId: 'x' },
    });

    expect(vaccine.vaccineId).toBe('PB-XP-v1-HLTH-HLTHCHK-123456789abc');
    expect(vaccine.bytecode).toContain(vaccine.vaccineId);
  });
});
