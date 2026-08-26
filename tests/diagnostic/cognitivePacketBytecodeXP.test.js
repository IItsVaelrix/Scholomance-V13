import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { resolve } from 'node:path';
import { encodeBytecodeHealth } from '../../codex/core/diagnostic/BytecodeHealth.js';
import { checksumReport, digestReport, generateDiagnosticReport } from '../../codex/core/diagnostic/DiagnosticReport.js';
import { BytecodeError, ERROR_CODES } from '../../codex/core/pixelbrain/bytecode-error.js';
import {
  buildBytecodeXPFromCognitivePacket,
  normalizeAdmissionEvidenceSummary,
  persistCognitivePacketBytecodeXP,
} from '../../codex/server/services/cognitivePacketBytecodeXP.service.js';
import { verifyBytecodeXPMemoryEnvelope } from '../../codex/core/diagnostic/QbitMemoryPersistence.js';

const validatorPath = resolve(
  'docs/scholomance-encyclopedia/Scholomance LAW/cognitive-bus/scripts/cognitive_packet.py',
);
const packetPath = resolve(
  'docs/scholomance-encyclopedia/Scholomance LAW/cognitive-bus/references/fixtures/seed-packet.json',
);
const SEED_PACKET = JSON.parse(readFileSync(packetPath, 'utf8'));
const PACKET_KEY = 'integration-participant-key';
const DIAGNOSTIC_KEY = 'integration-diagnostic-key';
const ORIGINAL_PACKET_KEY = process.env.CBUS_PACKET_KEY;
const ORIGINAL_DIAGNOSTIC_KEY = process.env.BYTECODE_DIAGNOSTIC_KEY;

beforeAll(() => {
  process.env.CBUS_PACKET_KEY = PACKET_KEY;
  process.env.BYTECODE_DIAGNOSTIC_KEY = DIAGNOSTIC_KEY;
});

afterAll(() => {
  if (ORIGINAL_PACKET_KEY === undefined) delete process.env.CBUS_PACKET_KEY;
  else process.env.CBUS_PACKET_KEY = ORIGINAL_PACKET_KEY;
  if (ORIGINAL_DIAGNOSTIC_KEY === undefined) delete process.env.BYTECODE_DIAGNOSTIC_KEY;
  else process.env.BYTECODE_DIAGNOSTIC_KEY = ORIGINAL_DIAGNOSTIC_KEY;
});

function participantSeal(packet) {
  const program = [
    'import importlib.util, json, sys',
    'spec = importlib.util.spec_from_file_location("cognitive_packet", sys.argv[1])',
    'module = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(module)',
    'packet = json.load(sys.stdin)',
    'json.dump(module.seal(packet, key=sys.argv[2].encode(), key_id="integration-participant"), sys.stdout)',
  ].join('\n');
  const result = spawnSync('python3', ['-c', program, validatorPath, PACKET_KEY], {
    input: JSON.stringify(packet),
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`participant signing failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

const PACKET = participantSeal(SEED_PACKET);

function diagnostic() {
  const health = encodeBytecodeHealth('FIXTURE_SHAPE', 'packet-clean', { moduleId: 'cognitive-bus' });
  const report = generateDiagnosticReport({
    commitHash: 'integration-test',
    trigger: 'test',
    cellResults: [{ cellId: 'FIXTURE_SHAPE', errors: [], health: [health], skipped: [] }],
  });
  return {
    report,
    outcome: { kind: 'health', index: 0 },
    attestation: attestReport(report),
  };
}

function errorDiagnostic() {
  const error = new BytecodeError('VALUE', 'WARN', 'IMMUNE', ERROR_CODES.TEST_MISSING, {
    sourceFile: 'cognitive-bus',
    ruleId: 'PACKET_LESSON',
  });
  const report = generateDiagnosticReport({
    commitHash: 'integration-test',
    trigger: 'test',
    cellResults: [{ cellId: 'IMMUNITY_SCAN', errors: [error], health: [], skipped: [] }],
  });
  return {
    report,
    outcome: { kind: 'error', index: 0 },
    attestation: attestReport(report),
  };
}

function attestReport(report) {
  return {
    algorithm: 'hmac-sha256',
    keyId: 'integration-diagnostic',
    mac: createHmac('sha256', DIAGNOSTIC_KEY).update(digestReport(report)).digest('hex'),
  };
}

describe('Cognitive packet to Bytecode XP admission service', () => {
  it('rejects noncanonical or contradictory admission evidence summaries', () => {
    const valid = {
      signatureKeyId: 'participant-a',
      claimedEvidenceIds: ['a', 'b'],
      claimedEvidenceLineages: ['lineage-a', 'lineage-b'],
      decisiveEvidenceIds: ['a'],
      decisiveEvidenceLineages: ['lineage-a'],
      decisiveLineageCount: 1,
    };
    expect(normalizeAdmissionEvidenceSummary(valid)).toMatchObject(valid);

    for (const malformed of [
      { ...valid, claimedEvidenceIds: ['b', 'a'] },
      { ...valid, claimedEvidenceIds: ['a', 'a'] },
      { ...valid, decisiveEvidenceIds: ['outside'] },
      { ...valid, decisiveEvidenceLineages: ['outside'] },
      { ...valid, decisiveLineageCount: 2 },
      { ...valid, signatureKeyId: '' },
    ]) {
      expect(() => normalizeAdmissionEvidenceSummary(malformed)).toThrow(/admission receipt/i);
    }
  });

  it('creates deterministic XP only after the Python validator verifies the signature', async () => {
    const a = await buildBytecodeXPFromCognitivePacket({ packet: PACKET, diagnostic: diagnostic() });
    const b = await buildBytecodeXPFromCognitivePacket({
      packet: structuredClone(PACKET),
      diagnostic: diagnostic(),
    });

    expect(a).toEqual(b);
    expect(a.admission).toMatchObject({ admitted: true, signatureVerified: true });
    expect(a.vaccine.sourceKind).toBe('health');
    expect(a.vaccine.stableContext).toMatchObject({
      packetId: PACKET.packet_id,
      taskId: PACKET.task_id,
      status: 'SUPPORTED',
      declaredBasis: 'DIRECT',
      decisiveEvidenceIds: ['artifact-001'],
      decisiveEvidenceLineages: ['artifact-001-bytes'],
      decisiveLineageCount: 1,
    });
    expect(a.envelope.provenance).toMatchObject({
      source: 'cognitive-packet',
      packetId: PACKET.packet_id,
      taskId: PACKET.task_id,
      reportChecksum: diagnostic().report.checksum,
      signatureVerified: true,
      declaredBasis: 'DIRECT',
      decisiveEvidenceIds: ['artifact-001'],
      decisiveEvidenceLineages: ['artifact-001-bytes'],
      decisiveLineageCount: 1,
    });
    expect(verifyBytecodeXPMemoryEnvelope(a.envelope)).toBe(true);
  });

  it('persists Python-computed decisiveness separately from claimed lineages', async () => {
    const modelEvidence = [0, 1, 2].map(index => ({
      ...SEED_PACKET.evidence[0],
      evidence_id: `model-${index}`,
      independence_key: `fabricated-lineage-${index}`,
      kind: 'MODEL_OUTPUT',
    }));
    const packet = participantSeal({
      ...SEED_PACKET,
      evidence: modelEvidence,
      epistemic: {
        ...SEED_PACKET.epistemic,
        status: 'UNVERIFIED',
        basis: 'MODEL_ONLY',
      },
    });

    const result = await buildBytecodeXPFromCognitivePacket({ packet, diagnostic: diagnostic() });
    expect(result.envelope.provenance).toMatchObject({
      declaredBasis: 'MODEL_ONLY',
      claimedEvidenceLineages: [
        'fabricated-lineage-0',
        'fabricated-lineage-1',
        'fabricated-lineage-2',
      ],
      decisiveEvidenceIds: [],
      decisiveEvidenceLineages: [],
      decisiveLineageCount: 0,
    });
  });

  it('refuses a participant-signed authority bypass before persistent XP is created', async () => {
    const forged = participantSeal({
      ...SEED_PACKET,
      authority: { mutation_requested: true, risk: 'READ_ONLY', authorization_ref: null },
    });
    const memoryClient = { set: vi.fn() };

    await expect(persistCognitivePacketBytecodeXP(memoryClient, {
      packet: forged,
      diagnostic: diagnostic(),
    })).rejects.toThrow(/authority\.risk.*mutation/i);
    expect(memoryClient.set).not.toHaveBeenCalled();
  });

  it('refuses a signed packet when no verification key is available', async () => {
    delete process.env.CBUS_PACKET_KEY;
    try {
      await expect(buildBytecodeXPFromCognitivePacket({
        packet: PACKET,
        diagnostic: diagnostic(),
      })).rejects.toThrow(/verification key/i);
    } finally {
      process.env.CBUS_PACKET_KEY = PACKET_KEY;
    }
  });

  it('supports a verified BytecodeError outcome as a lesson', async () => {
    const result = await buildBytecodeXPFromCognitivePacket({
      packet: PACKET,
      diagnostic: errorDiagnostic(),
    });

    expect(result.vaccine.sourceKind).toBe('error');
    expect(result.vaccine.stableContext.packetId).toBe(PACKET.packet_id);
    expect(verifyBytecodeXPMemoryEnvelope(result.envelope)).toBe(true);
  });

  it('rejects a tampered diagnostic report after packet admission', async () => {
    const tampered = diagnostic();
    tampered.report.passing[0].code = 'FABRICATED_HEALTH';
    await expect(buildBytecodeXPFromCognitivePacket({
      packet: PACKET,
      diagnostic: tampered,
    })).rejects.toThrow(/diagnostic report/i);
  });

  it('rejects the former detached self-attested diagnostic shape', async () => {
    await expect(buildBytecodeXPFromCognitivePacket({
      packet: PACKET,
      diagnostic: {
        kind: 'health',
        value: { code: 'FABRICATED_HEALTH' },
        verified: true,
        reportId: 'not-a-report',
        reportBytecode: 'not-bytecode',
        verifierId: 'self-asserted',
      },
    })).rejects.toThrow(/diagnostic report/i);
  });

  it('rejects a fabricated report even when the caller recomputes its public checksum', async () => {
    const fabricated = diagnostic();
    fabricated.report.passing[0].code = 'FABRICATED_HEALTH';
    fabricated.report.checksum = checksumReport(fabricated.report);

    await expect(buildBytecodeXPFromCognitivePacket({
      packet: PACKET,
      diagnostic: fabricated,
    })).rejects.toThrow(/diagnostic attestation/i);
  });

  it('refuses an attested diagnostic when the deployment verification key is unavailable', async () => {
    delete process.env.BYTECODE_DIAGNOSTIC_KEY;
    try {
      await expect(buildBytecodeXPFromCognitivePacket({
        packet: PACKET,
        diagnostic: diagnostic(),
      })).rejects.toThrow(/deployment diagnostic attestation key/i);
    } finally {
      process.env.BYTECODE_DIAGNOSTIC_KEY = DIAGNOSTIC_KEY;
    }
  });

  it('derives XP from the exact packet snapshot admitted by Python', async () => {
    const deceptive = structuredClone(PACKET);
    deceptive.intent = 'UNVALIDATED_INTENT';
    deceptive.epistemic.status = 'UNVALIDATED_STATUS';
    deceptive.toJSON = () => PACKET;

    const result = await buildBytecodeXPFromCognitivePacket({ packet: deceptive, diagnostic: diagnostic() });
    expect(result.vaccine.stableContext).toMatchObject({
      intent: PACKET.intent,
      status: PACKET.epistemic.status,
    });
  });

  it('persists only the validator-admitted packet-derived envelope', async () => {
    const memoryClient = { set: vi.fn(async payload => ({ stored: payload.key })) };
    const result = await persistCognitivePacketBytecodeXP(memoryClient, {
      packet: PACKET,
      diagnostic: diagnostic(),
    }, { agentId: 'codex' });

    expect(memoryClient.set).toHaveBeenCalledTimes(1);
    expect(result.payload.value.provenance).toMatchObject({
      packetId: PACKET.packet_id,
      signatureVerified: true,
    });
    expect(result.result).toEqual({ stored: result.payload.key });
  });
});
