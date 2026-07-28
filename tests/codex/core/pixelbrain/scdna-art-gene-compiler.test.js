/**
 * Tests: SCDNA Art-Gene Compiler — Approval Authority and Checksum Binding
 * PDR §17.1: Approval authority and checksum binding
 * PDR §17.3: Authority refusal, preview mismatch tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  commitGene,
  validateApprovalAuthority,
  computePreviewChecksums,
  renderDeterministicArtPreviewSVG,
  evaluateArtProjection,
  PREVIEW_RENDERER_VERSION,
} from '../../../../codex/core/pixelbrain/scdna-art-gene-compiler.js';
import { createArtGenePacket } from '../../../../codex/core/pixelbrain/scdna-art-gene.js';
import { projectGenes } from '../../../../codex/core/pixelbrain/scdl/passes/project-genes.pass.js';
import { setArtMemoryLedgerPath, queryArtMemoryLedger } from '../../../../codex/core/pixelbrain/scdna-art-gene-store.js';

// ─── Test Setup ──────────────────────────────────────────────────────────────

let tmpDir;
let ledgerPath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'art-compiler-test-'));
  ledgerPath = path.join(tmpDir, 'test-ledger.jsonl');
  setArtMemoryLedgerPath(ledgerPath);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

const context = {
  canvas: { width: 24, height: 20 },
  compilerVersion: '1.0.0',
  projectionAlgoVersion: 1,
  conflictPolicyVersion: 1,
  paletteRoleMappingVersion: '1.0.0',
  sdfByPart: {},
};

const gene = createArtGenePacket({
  assetId: 'shrine-brazier',
  geneId: 'brazier-rim-light',
  projectionMode: 'explicit',
  priority: 100,
  canvas: { width: 24, height: 20 },
  role: 'rim-highlight',
  materialHint: 'obsidian',
  paletteRoles: ['rim', 'core'],
  coordinates: [
    { x: 5, y: 6, role: 'rim', partId: 'brazier-body' },
    { x: 6, y: 5, role: 'rim', partId: 'brazier-body' },
  ],
  geometryHints: { lightDir: 'upper-left' },
});

const projection = projectGenes([gene], context);

const preview = computePreviewChecksums({
  canvas: context.canvas,
  cells: projection.cells,
  paletteRoleMappingVersion: context.paletteRoleMappingVersion,
});

function makeValidApproval(overrides = {}) {
  return {
    contract: 'PB-ART-APPROVAL-v1',
    assetId: gene.assetId,
    geneId: gene.geneId,
    geneChecksum: gene.checksum,
    projectionChecksum: projection.projectionChecksum,
    previewModelChecksum: preview.modelChecksum,
    previewDocumentChecksum: preview.documentChecksum,
    previewRendererVersion: PREVIEW_RENDERER_VERSION,
    authority: {
      kind: 'human',
      source: 'interactive-human-gate',
      actorId: 'angel',
    },
    approvedAt: '2026-07-28T12:00:00Z',
    projectionMode: 'explicit',
    projectionAlgoVersion: 1,
    compilerVersion: '1.0.0',
    conflictPolicyVersion: 1,
    ...overrides,
  };
}

// ─── Authority Validation (§6.1) ────────────────────────────────────────────

describe('validateApprovalAuthority', () => {
  it('accepts a valid interactive human authority', () => {
    expect(() => validateApprovalAuthority({
      authority: { kind: 'human', source: 'interactive-human-gate', actorId: 'angel' },
    })).not.toThrow();
  });

  it('refuses an agent-asserted approval string', () => {
    expect(() => validateApprovalAuthority({
      approvedBy: 'human-trust-me',
    })).toThrow('ART_GENE_REQUIRES_HUMAN_APPROVAL');
  });

  it('refuses missing authority', () => {
    expect(() => validateApprovalAuthority({})).toThrow('ART_GENE_REQUIRES_HUMAN_APPROVAL');
  });

  it('refuses non-human authority kind', () => {
    expect(() => validateApprovalAuthority({
      authority: { kind: 'agent', source: 'interactive-human-gate', actorId: 'bot' },
    })).toThrow('ART_GENE_REQUIRES_HUMAN_APPROVAL');
  });

  it('refuses wrong authority source', () => {
    expect(() => validateApprovalAuthority({
      authority: { kind: 'human', source: 'api-call', actorId: 'angel' },
    })).toThrow('ART_GENE_REQUIRES_HUMAN_APPROVAL');
  });

  it('refuses missing actorId', () => {
    expect(() => validateApprovalAuthority({
      authority: { kind: 'human', source: 'interactive-human-gate' },
    })).toThrow('ART_GENE_REQUIRES_HUMAN_APPROVAL');
  });
});

// ─── Commit Flow (§10.4) ────────────────────────────────────────────────────

describe('commitGene', () => {
  it('commits a valid gene and persists to the ledger', () => {
    const approval = makeValidApproval();
    const record = commitGene({
      gene,
      projection,
      preview,
      approval,
      compilerVersion: '1.0.0',
    });

    expect(record.contract).toBe('PB-ART-MEMORY-v1');
    expect(record.eventType).toBe('curation');
    expect(record.code).toBe('PB-OK-v1-ART-GENE-CURATED');
    expect(record.assetId).toBe('shrine-brazier');
    expect(record.geneId).toBe('brazier-rim-light');

    // Verify ledger persistence
    const matches = queryArtMemoryLedger({ assetId: 'shrine-brazier' });
    expect(matches.length).toBe(1);
  });

  it('refuses commit without valid authority', () => {
    expect(() => commitGene({
      gene,
      projection,
      preview,
      approval: { approvedBy: 'human-trust-me' },
      compilerVersion: '1.0.0',
    })).toThrow('ART_GENE_REQUIRES_HUMAN_APPROVAL');
  });

  it('refuses commit when gene checksum mismatches', () => {
    const approval = makeValidApproval({ geneChecksum: 'scd64:wrong' });
    expect(() => commitGene({ gene, projection, preview, approval, compilerVersion: '1.0.0' }))
      .toThrow('ART_APPROVAL_GENE_CHECKSUM_MISMATCH');
  });

  it('refuses commit when projection checksum mismatches', () => {
    const approval = makeValidApproval({ projectionChecksum: 'scd64:wrong' });
    expect(() => commitGene({ gene, projection, preview, approval, compilerVersion: '1.0.0' }))
      .toThrow('ART_APPROVAL_PROJECTION_CHECKSUM_MISMATCH');
  });

  it('refuses commit when preview model checksum mismatches', () => {
    const approval = makeValidApproval({ previewModelChecksum: 'scd64:wrong' });
    expect(() => commitGene({ gene, projection, preview, approval, compilerVersion: '1.0.0' }))
      .toThrow('ART_APPROVAL_PREVIEW_MODEL_MISMATCH');
  });

  it('refuses commit when preview document checksum mismatches', () => {
    const approval = makeValidApproval({ previewDocumentChecksum: 'scd64:wrong' });
    expect(() => commitGene({ gene, projection, preview, approval, compilerVersion: '1.0.0' }))
      .toThrow('ART_APPROVAL_PREVIEW_DOCUMENT_MISMATCH');
  });
});

// ─── Preview Checksums (§10.6) ──────────────────────────────────────────────

describe('computePreviewChecksums', () => {
  it('produces deterministic model and document checksums', () => {
    const p1 = computePreviewChecksums({ canvas: context.canvas, cells: projection.cells, paletteRoleMappingVersion: '1.0.0' });
    const p2 = computePreviewChecksums({ canvas: context.canvas, cells: projection.cells, paletteRoleMappingVersion: '1.0.0' });

    expect(p1.modelChecksum).toBe(p2.modelChecksum);
    expect(p1.documentChecksum).toBe(p2.documentChecksum);
    expect(p1.svgSource).toBe(p2.svgSource);
  });

  it('changes model checksum when cells change', () => {
    const p1 = computePreviewChecksums({ canvas: context.canvas, cells: projection.cells, paletteRoleMappingVersion: '1.0.0' });
    const p2 = computePreviewChecksums({ canvas: context.canvas, cells: [], paletteRoleMappingVersion: '1.0.0' });

    expect(p1.modelChecksum).not.toBe(p2.modelChecksum);
  });
});

// ─── Deterministic SVG ───────────────────────────────────────────────────────

describe('renderDeterministicArtPreviewSVG', () => {
  it('produces valid SVG with accessibility attributes', () => {
    const svg = renderDeterministicArtPreviewSVG({
      canvas: { width: 4, height: 4 },
      cells: [{ x: 1, y: 1, color: '#ff0000', role: 'rim' }],
      rendererVersion: '1.0.0',
    });

    expect(svg).toContain('<svg');
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label=');
    expect(svg).toContain('<title>');
    expect(svg).toContain('<desc>');
    expect(svg).toContain('data-role="rim"');
    expect(svg).toContain('fill="#ff0000"');
  });
});

// ─── Feel Gate (§10.7) ──────────────────────────────────────────────────────

describe('evaluateArtProjection', () => {
  it('returns score and null event when above threshold', () => {
    const result = evaluateArtProjection({
      projection,
      assetId: 'shrine-brazier',
      threshold: 0.01,
    });

    expect(result.score).toBeDefined();
    expect(result.score.spatialAwareness).toBeGreaterThan(0);
    expect(result.event).toBeNull();
  });

  it('emits warning event when below threshold without mutating cells', () => {
    const cellsBefore = JSON.stringify(projection.cells);

    const result = evaluateArtProjection({
      projection,
      assetId: 'shrine-brazier',
      threshold: 999,
    });

    expect(result.event).not.toBeNull();
    expect(result.event.code).toBe('PB-WARN-v1-ART-FEEL-BELOW-THRESHOLD');
    expect(result.event.payload.aestheticApproval).toBe('REQUIRES_HUMAN');

    // Cells must not be mutated
    expect(JSON.stringify(projection.cells)).toBe(cellsBefore);
  });
});
