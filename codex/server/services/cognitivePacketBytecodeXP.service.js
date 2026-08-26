import { spawn } from 'node:child_process';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  encodeBytecodeXPVaccineFromError,
  encodeBytecodeXPVaccineFromHealth,
} from '../../core/diagnostic/BytecodeXPVaccine.js';
import {
  buildBytecodeXPMemoryEnvelope,
  persistBytecodeXPMemoryEnvelope,
} from '../../core/diagnostic/QbitMemoryPersistence.js';
import { digestReport, verifyReport } from '../../core/diagnostic/DiagnosticReport.js';

const VALIDATOR_RELATIVE_PATH = 'docs/scholomance-encyclopedia/Scholomance LAW/cognitive-bus/scripts/cognitive_packet.py';
const MAX_PACKET_BYTES = 256 * 1024;
const COGNITIVE_PACKET_VALIDATOR = (() => {
  const fromModule = new URL(
    '../../../docs/scholomance-encyclopedia/Scholomance LAW/cognitive-bus/scripts/cognitive_packet.py',
    import.meta.url,
  );
  return fromModule.protocol === 'file:'
    ? fileURLToPath(fromModule)
    : resolve(process.cwd(), VALIDATOR_RELATIVE_PATH);
})();

/**
 * The persistence seam owns admission. Callers supply a packet, never a verdict
 * function or a per-packet key. The canonical Python validator reads its key
 * from deployment configuration and emits the machine-readable receipt.
 */
export async function buildBytecodeXPFromCognitivePacket({ packet, diagnostic }) {
  const snapshot = snapshotJsonObject(packet, 'Cognitive packet', MAX_PACKET_BYTES);
  const admission = await admitCognitivePacket(
    snapshot.serialized,
    snapshot.value.packet_id,
    snapshot.value.integrity?.content_sha256,
  );
  const normalized = normalizePacket(snapshot.value);
  const outcome = normalizeDiagnostic(diagnostic);
  const stablePacketContext = {
    packetId: normalized.packetId,
    taskId: normalized.taskId,
    intent: normalized.intent,
    status: normalized.status,
    declaredBasis: normalized.basis,
    claimedEvidenceIds: admission.claimedEvidenceIds,
    claimedEvidenceLineages: admission.claimedEvidenceLineages,
    decisiveEvidenceIds: admission.decisiveEvidenceIds,
    decisiveEvidenceLineages: admission.decisiveEvidenceLineages,
    decisiveLineageCount: admission.decisiveLineageCount,
  };

  const vaccineOptions = {
    stableContext: stablePacketContext,
    recoveryKey: `CBUS_${normalized.intent}_${normalized.status}`,
    title: `${normalized.intent} ${normalized.status} ${normalized.proposition}`,
  };
  const vaccine = outcome.kind === 'health'
    ? encodeBytecodeXPVaccineFromHealth(outcome.value, vaccineOptions)
    : encodeBytecodeXPVaccineFromError(outcome.value, vaccineOptions);

  const provenance = {
    source: 'cognitive-packet',
    packetId: normalized.packetId,
    taskId: normalized.taskId,
    intent: normalized.intent,
    status: normalized.status,
    declaredBasis: normalized.basis,
    claimedEvidenceIds: admission.claimedEvidenceIds,
    claimedEvidenceLineages: admission.claimedEvidenceLineages,
    decisiveEvidenceIds: admission.decisiveEvidenceIds,
    decisiveEvidenceLineages: admission.decisiveEvidenceLineages,
    decisiveLineageCount: admission.decisiveLineageCount,
    reportBytecode: outcome.reportBytecode,
    reportChecksum: outcome.reportChecksum,
    reportDigest: outcome.reportDigest,
    verifierId: outcome.verifierId,
    signatureVerified: admission.signatureVerified,
    signatureKeyId: admission.signatureKeyId,
  };
  const envelope = buildBytecodeXPMemoryEnvelope({
    vaccine,
    labels: ['cognitive-packet', outcome.kind, normalized.intent.toLowerCase(), normalized.status.toLowerCase()],
    enrichment: {
      hypothesis: normalized.proposition,
      metadata: {
        source: 'cognitive-packet',
        reportBytecode: outcome.reportBytecode,
        reportChecksum: outcome.reportChecksum,
        reportDigest: outcome.reportDigest,
        status: normalized.status,
      },
    },
    provenance,
  });

  return { admission, vaccine, envelope };
}

export async function persistCognitivePacketBytecodeXP(memoryClient, input, options = {}) {
  const { envelope } = await buildBytecodeXPFromCognitivePacket(input);
  return persistBytecodeXPMemoryEnvelope(memoryClient, envelope, options);
}

function admitCognitivePacket(serializedPacket, packetId, contentSha256) {
  return new Promise((resolveAdmission, rejectAdmission) => {
    const child = spawn('python3', [COGNITIVE_PACKET_VALIDATOR, 'admit'], {
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let settled = false;
    const finish = callback => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const collect = target => chunk => {
      outputBytes += chunk.length;
      if (outputBytes > 1024 * 1024) {
        child.kill('SIGKILL');
        finish(() => rejectAdmission(new Error('Cognitive packet admission exceeded its output limit')));
        return;
      }
      target.push(chunk);
    };
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      finish(() => rejectAdmission(new Error('Cognitive packet admission timed out')));
    }, 10_000);

    child.stdout.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));
    child.on('error', error => {
      finish(() => rejectAdmission(new Error(`Cognitive packet admission could not execute: ${error.message}`)));
    });
    child.on('close', status => {
      finish(() => {
        const stdoutText = Buffer.concat(stdout).toString('utf8');
        const stderrText = Buffer.concat(stderr).toString('utf8');
        let receipt;
        try {
          receipt = JSON.parse(stdoutText);
        } catch {
          const detail = stderrText.trim() || stdoutText.trim() || `exit ${status}`;
          rejectAdmission(new Error(`Cognitive packet admission returned no valid receipt: ${detail}`));
          return;
        }

        if (receipt.admitted !== true || receipt.signatureVerified !== true || status !== 0) {
          const errors = Array.isArray(receipt.errors) && receipt.errors.length > 0
            ? receipt.errors.join('; ')
            : `validator exit ${status}`;
          rejectAdmission(new Error(`Cognitive packet rejected: ${errors}`));
          return;
        }
        if (receipt.packetId !== packetId) {
          rejectAdmission(new Error('Cognitive packet admission receipt does not identify the submitted packet'));
          return;
        }
        if (receipt.contentSha256 !== contentSha256) {
          rejectAdmission(new Error('Cognitive packet admission receipt does not identify the submitted content'));
          return;
        }
        let evidenceSummary;
        try {
          evidenceSummary = normalizeAdmissionEvidenceSummary(receipt);
        } catch (error) {
          rejectAdmission(error);
          return;
        }

        resolveAdmission(Object.freeze({
          admitted: true,
          signatureVerified: true,
          packetId: receipt.packetId,
          contentSha256: receipt.contentSha256,
          signatureKeyId: receipt.signatureKeyId,
          ...evidenceSummary,
        }));
      });
    });
    child.stdin.on('error', error => {
      finish(() => rejectAdmission(new Error(`Cognitive packet admission input failed: ${error.message}`)));
    });
    child.stdin.end(serializedPacket);
  });
}

function normalizePacket(packet) {
  const epistemic = packet.epistemic;
  const proposition = packet.proposition;
  const evidence = packet.evidence;
  const required = [
    ['packet_id', packet.packet_id],
    ['task_id', packet.task_id],
    ['intent', packet.intent],
    ['epistemic.status', epistemic?.status],
    ['epistemic.basis', epistemic?.basis],
    ['proposition.statement', proposition?.statement],
  ];
  for (const [name, value] of required) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`Cognitive packet missing ${name}`);
    }
  }
  if (!Array.isArray(evidence)) throw new Error('Cognitive packet evidence must be an array');

  return {
    packetId: packet.packet_id,
    taskId: packet.task_id,
    intent: packet.intent,
    status: epistemic.status,
    basis: epistemic.basis,
    proposition: proposition.statement,
  };
}

export function normalizeAdmissionEvidenceSummary(receipt) {
  if (typeof receipt.signatureKeyId !== 'string' || receipt.signatureKeyId.trim() === '') {
    throw new Error('Cognitive packet admission receipt has an invalid signatureKeyId');
  }
  const summary = { signatureKeyId: receipt.signatureKeyId };
  const arrayFields = [
    'claimedEvidenceIds',
    'claimedEvidenceLineages',
    'decisiveEvidenceIds',
    'decisiveEvidenceLineages',
  ];
  for (const field of arrayFields) {
    const value = receipt[field];
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.trim() === '')) {
      throw new Error(`Cognitive packet admission receipt has invalid ${field}`);
    }
    const canonical = [...new Set(value)].sort((a, b) => a.localeCompare(b));
    if (canonical.length !== value.length || canonical.some((item, index) => item !== value[index])) {
      throw new Error(`Cognitive packet admission receipt has noncanonical ${field}`);
    }
    summary[field] = Object.freeze([...value]);
  }
  for (const item of summary.decisiveEvidenceIds) {
    if (!summary.claimedEvidenceIds.includes(item)) {
      throw new Error('Cognitive packet admission receipt has decisive evidence outside the claimed evidence set');
    }
  }
  for (const item of summary.decisiveEvidenceLineages) {
    if (!summary.claimedEvidenceLineages.includes(item)) {
      throw new Error('Cognitive packet admission receipt has decisive lineages outside the claimed lineage set');
    }
  }
  if (
    !Number.isInteger(receipt.decisiveLineageCount)
    || receipt.decisiveLineageCount !== summary.decisiveEvidenceLineages.length
  ) {
    throw new Error('Cognitive packet admission receipt has an invalid decisiveLineageCount');
  }
  summary.decisiveLineageCount = receipt.decisiveLineageCount;
  return Object.freeze(summary);
}

function normalizeDiagnostic(diagnostic) {
  if (!diagnostic?.report || !diagnostic?.outcome || !diagnostic?.attestation) {
    throw new Error('Cognitive packet XP ingestion requires a canonical diagnostic report, attestation, and outcome selector');
  }
  const snapshot = snapshotJsonObject(diagnostic.report, 'Diagnostic report', 1024 * 1024);
  let verification;
  try {
    verification = verifyReport(snapshot.value);
  } catch (error) {
    throw new Error(`Cognitive packet XP ingestion received a malformed diagnostic report: ${error.message}`);
  }
  if (verification.valid !== true) {
    throw new Error('Cognitive packet XP ingestion rejected a tampered diagnostic report');
  }
  const reportDigest = digestReport(snapshot.value);
  verifyDiagnosticAttestation(reportDigest, diagnostic.attestation);

  const kind = diagnostic.outcome.kind;
  const index = diagnostic.outcome.index;
  if (!['health', 'error'].includes(kind) || !Number.isInteger(index) || index < 0) {
    throw new Error('Diagnostic report outcome selector must name a health or error index');
  }
  const collection = kind === 'health' ? snapshot.value.passing : snapshot.value.violations;
  const selected = Array.isArray(collection) ? collection[index] : null;
  if (!selected || typeof selected !== 'object') {
    throw new Error(`Diagnostic report has no ${kind} outcome at index ${index}`);
  }

  // Use only fields covered by DiagnosticReport.checksumReport. Fields such as
  // timestamps, reportId, and health context are metadata and cannot influence XP.
  const value = kind === 'health'
    ? {
      code: selected.code,
      cellId: selected.cellId,
      checkId: selected.checkId,
    }
    : {
      code: selected.code,
      category: selected.category,
      severity: selected.severity,
      context: selected.context,
    };

  return Object.freeze({
    kind,
    value,
    reportChecksum: snapshot.value.checksum,
    reportDigest,
    reportBytecode: `PB-DIAG-v1:${reportDigest}`,
    verifierId: 'DiagnosticReport.verifyReport+hmac-sha256',
  });
}

function verifyDiagnosticAttestation(reportDigest, attestation) {
  const key = process.env.BYTECODE_DIAGNOSTIC_KEY;
  if (!key) {
    throw new Error('Cognitive packet XP ingestion requires the deployment diagnostic attestation key');
  }
  if (
    attestation?.algorithm !== 'hmac-sha256'
    || typeof attestation.keyId !== 'string'
    || attestation.keyId.trim() === ''
    || !/^[0-9a-f]{64}$/.test(attestation.mac)
  ) {
    throw new Error('Cognitive packet XP ingestion received a malformed diagnostic attestation');
  }
  const expected = createHmac('sha256', key).update(reportDigest).digest();
  const supplied = Buffer.from(attestation.mac, 'hex');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error('Cognitive packet XP ingestion rejected an unverifiable diagnostic attestation');
  }
}

function snapshotJsonObject(input, label, maxBytes) {
  let serialized;
  try {
    serialized = JSON.stringify(input);
  } catch (error) {
    throw new Error(`${label} could not be serialized: ${error.message}`);
  }
  if (typeof serialized !== 'string') throw new Error(`${label} must be an object`);
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
    throw new Error(`${label} exceeds the ${maxBytes}-byte admission limit`);
  }
  let value;
  try {
    value = JSON.parse(serialized);
  } catch (error) {
    throw new Error(`${label} could not be snapshotted: ${error.message}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return Object.freeze({ serialized, value });
}
