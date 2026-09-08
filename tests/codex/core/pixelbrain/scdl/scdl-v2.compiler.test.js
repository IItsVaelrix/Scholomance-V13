import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.compiler.js';
import {
  registerAmpManifest,
  registerAmpAdapter,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.amp-catalog.js';

const SOURCE = readFileSync(resolve('codex/core/pixelbrain/scdl/fixtures/v2/exact-orb.scdl'), 'utf8');

describe('SCDL v2 compiler vertical slice', () => {
  it('emits canonical bytecode, immutable IR, and a real asset packet', () => {
    const result = compileSCDLV2(SOURCE);
    expect(result.ok).toBe(true);
    expect(result.contract).toBe('SCDL-COMPILE-RESULT-v2');
    expect(result.bytecode.contract).toBe('SCDL-BC-v2');
    expect(result.package.contract).toBe('SCDL-PACKAGE-v2');
    expect(result.packet.kind).toBe('pixelbrain.asset.v1');
    expect(result.packet.id).toBe(`pbasset_${result.bytecode.programId.slice('scdlbc_'.length)}`);
    expect(result.packet.geometry.coordinates).toContainEqual(expect.objectContaining({ x: 1, y: 1, color: '#ffffff' }));
    expect(Object.isFrozen(result.package)).toBe(true);
  });

  it('is deterministic across repeated compilation', () => {
    const a = compileSCDLV2(SOURCE);
    const b = compileSCDLV2(SOURCE);
    expect(b.bytecode.text).toBe(a.bytecode.text);
    expect(b.bytecode.programId).toBe(a.bytecode.programId);
    expect(b.packet).toEqual(a.packet);
  });

  it.each(['', null, 'SCDL 2\n', 'SCDL 2\nASSET x\nCANVAS WIDTH 1 HEIGHT 1\nSHAPE $x (CIRCLE CENTER (VEC2 (PX 0) (PX 0)))', 'SCDL 2\n@'])('never throws and never emits partial output for %j', (source) => {
    expect(() => compileSCDLV2(source)).not.toThrow();
    const result = compileSCDLV2(source);
    expect(result.ok).toBe(false);
    expect(result.analysis).toBeNull();
    expect(result.bytecode).toBeNull();
    expect(result.package).toBeNull();
    expect(result.packet).toBeNull();
    expect(result.framePackets).toEqual([]);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.errors.every((item) => typeof item.isError === 'function' && item.isError())).toBe(true);
    expect(result.diagnostics).toEqual(result.diagnosticReport.diagnostics);
  });

  it('compiles a leading-BOM minimal v2 program', () => {
    const source = '\uFEFFSCDL 2\nASSET x\nCANVAS WIDTH 1 HEIGHT 1\nSHAPE $p (PIXEL AT (VEC2 (PX 0) (PX 0)))\nLAYER ink ORDER 0 { PAINT $p FILL #FFFFFF RASTER CENTER }\n';
    const result = compileSCDLV2(source);
    expect(result.ok).toBe(true);
    expect(result.languageVersion).toBe(2);
  });

  it('publishes resolved IR as analysis and records options.strict without warn-as-error', () => {
    const result = compileSCDLV2(SOURCE, { strict: true });
    expect(result.ok).toBe(true);
    expect(result.analysis).toEqual(expect.objectContaining({
      assetId: 'exact_orb',
      canvas: { width: 9, height: 9 },
    }));
    expect(result.analysis).not.toHaveProperty('symbols');
    expect(result.regressionSeed.options).toEqual({ strict: true });
    expect(result.regressionSeed.checksum).toBe(result.bytecode.programId);
    expect(result.packet.palette.sourcePalette[0].colors).toEqual([
      ...new Set(result.packet.geometry.coordinates.map((cell) => cell.color)),
    ]);
  });

  it('compiles the Phase 3 golden fixture fibonacci-bloom.scdl end-to-end', () => {
    const fixtureSource = readFileSync(resolve('codex/core/pixelbrain/scdl/fixtures/v2/fibonacci-bloom.scdl'), 'utf8');
    const result = compileSCDLV2(fixtureSource);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
    // Under CMP-01 and CMP-05, full 6-component TRANSFORM_MATRIX and radial displacement are preserved:
    expect(result.bytecode.programId).toBe('scdlbc_9a275a77');
    expect(result.packet.geometry.coordinates.length).toBeGreaterThan(0);
    expect(result.package.verifiedBudget.limits.recursionDepth).toBe(16);
  });

  it('dispatches across multi-stage conveyor belt without throwing', () => {
    const src = `SCDL 2
ASSET conveyor_test
CANVAS WIDTH 16 HEIGHT 16
SELECT_AMPS PIPELINE render-fidelity
LAYER ink ORDER 10 {
  PAINT (PIXEL AT (VEC2 (PX 8) (PX 8))) FILL #55ccff RASTER CENTER
}
`;
    const res = compileSCDLV2(src);
    expect(res.ok).toBe(true);
    expect(res.packet).toBeDefined();
    expect(res.package.ampPlan.length).toBeGreaterThan(0);
  });

  it('strictly enforces 12-stage conveyor order: PACKET_POST -> RENDER -> RUNTIME_DESCRIPTOR', () => {
    const executionOrder = [];

    registerAmpManifest({
      contract: 'PB-AMP-ABI-v1',
      ampId: 'test.probe-packet-post',
      version: '1.0.0',
      execution: 'COMPILE',
      stage: 'PACKET_POST',
      scope: ['PROGRAM'],
      inputs: [],
      parameters: [],
      output: { type: 'PACKET' },
      determinism: { class: 'PURE', seedRequired: false },
      cost: { model: 'CONSTANT', multiplier: 1, fixed: 0 },
      order: 10,
      relevance: { pipelines: ['test-conveyor-order'], conditions: [] },
    });
    registerAmpAdapter('test.probe-packet-post', {
      execute() {
        executionOrder.push('PACKET_POST');
      },
    });

    registerAmpManifest({
      contract: 'PB-AMP-ABI-v1',
      ampId: 'test.probe-render',
      version: '1.0.0',
      execution: 'COMPILE',
      stage: 'RENDER',
      scope: ['PROGRAM'],
      inputs: [],
      parameters: [],
      output: { type: 'ANY' },
      determinism: { class: 'PURE', seedRequired: false },
      cost: { model: 'CONSTANT', multiplier: 1, fixed: 0 },
      order: 10,
      relevance: { pipelines: ['test-conveyor-order'], conditions: [] },
    });
    registerAmpAdapter('test.probe-render', {
      execute() {
        executionOrder.push('RENDER');
      },
    });

    registerAmpManifest({
      contract: 'PB-AMP-ABI-v1',
      ampId: 'test.probe-runtime-desc',
      version: '1.0.0',
      execution: 'DESCRIPTOR',
      stage: 'RUNTIME_DESCRIPTOR',
      scope: ['PROGRAM'],
      inputs: [],
      parameters: [],
      output: { type: 'ANY' },
      determinism: { class: 'PURE', seedRequired: false },
      cost: { model: 'CONSTANT', multiplier: 1, fixed: 0 },
      order: 10,
      relevance: { pipelines: ['test-conveyor-order'], conditions: [] },
    });
    registerAmpAdapter('test.probe-runtime-desc', {
      execute() {
        executionOrder.push('RUNTIME_DESCRIPTOR');
        return { probe: 'runtime_desc' };
      },
    });

    const src = `SCDL 2
ASSET order_probe
CANVAS WIDTH 16 HEIGHT 16
SELECT_AMPS PIPELINE test-conveyor-order
LAYER ink ORDER 10 {
  PAINT (PIXEL AT (VEC2 (PX 8) (PX 8))) FILL #55ccff RASTER CENTER
}
`;
    const res = compileSCDLV2(src);
    expect(res.ok).toBe(true);
    expect(executionOrder).toEqual(['PACKET_POST', 'RENDER', 'RUNTIME_DESCRIPTOR']);
  });

  it('propagates modified packet from PACKET_POST to final compile output', () => {
    registerAmpManifest({
      contract: 'PB-AMP-ABI-v1',
      ampId: 'test.packet-modifier',
      version: '1.0.0',
      execution: 'COMPILE',
      stage: 'PACKET_POST',
      scope: ['PROGRAM'],
      inputs: [],
      parameters: [],
      output: { type: 'PACKET' },
      determinism: { class: 'PURE', seedRequired: false },
      cost: { model: 'CONSTANT', multiplier: 1, fixed: 0 },
      order: 20,
      relevance: { pipelines: ['test-packet-mod'], conditions: [] },
    });
    registerAmpAdapter('test.packet-modifier', {
      execute({ packet }) {
        return {
          packet: {
            ...packet,
            id: 'modified_packet_id',
            customSeamTag: 'PACKET_POST_ACTIVE',
          },
        };
      },
    });

    const src = `SCDL 2
ASSET mod_probe
CANVAS WIDTH 16 HEIGHT 16
SELECT_AMPS PIPELINE test-packet-mod
LAYER ink ORDER 10 {
  PAINT (PIXEL AT (VEC2 (PX 8) (PX 8))) FILL #55ccff RASTER CENTER
}
`;
    const res = compileSCDLV2(src);
    expect(res.ok).toBe(true);
    expect(res.packet.id).toBe('modified_packet_id');
    expect(res.packet.customSeamTag).toBe('PACKET_POST_ACTIVE');
  });

  it('halts and returns structured failV2 without packet emission when adapter throws', () => {
    registerAmpManifest({
      contract: 'PB-AMP-ABI-v1',
      ampId: 'test.deliberate-thrower',
      version: '1.0.0',
      execution: 'COMPILE',
      stage: 'RENDER',
      scope: ['PROGRAM'],
      inputs: [],
      parameters: [],
      output: { type: 'ANY' },
      determinism: { class: 'PURE', seedRequired: false },
      cost: { model: 'CONSTANT', multiplier: 1, fixed: 0 },
      order: 50,
      relevance: { pipelines: ['test-thrower'], conditions: [] },
    });
    registerAmpAdapter('test.deliberate-thrower', {
      execute() {
        throw new Error('Deliberate RENDER failure for testing');
      },
    });

    const src = `SCDL 2
ASSET throw_probe
CANVAS WIDTH 16 HEIGHT 16
SELECT_AMPS PIPELINE test-thrower
LAYER ink ORDER 10 {
  PAINT (PIXEL AT (VEC2 (PX 8) (PX 8))) FILL #55ccff RASTER CENTER
}
`;
    const res = compileSCDLV2(src);
    expect(res.ok).toBe(false);
    expect(res.packet).toBeNull();
    expect(res.package).toBeNull();
    expect(res.diagnostics.some((d) => d.code === 'SCDL-AMP-007' && d.message.includes('Deliberate RENDER failure'))).toBe(true);
  });

  it('propagates modified analysis from SOURCE_ANALYSIS stage seam to final compile output', () => {
    registerAmpManifest({
      contract: 'PB-AMP-ABI-v1',
      ampId: 'test.source-analysis-modifier',
      version: '1.0.0',
      execution: 'COMPILE',
      stage: 'SOURCE_ANALYSIS',
      scope: ['PROGRAM'],
      inputs: [],
      parameters: [],
      output: { type: 'ANY' },
      determinism: { class: 'PURE', seedRequired: false },
      cost: { model: 'CONSTANT', multiplier: 1, fixed: 0 },
      order: 5,
      relevance: { pipelines: ['test-src-analysis'], conditions: [] },
    });
    registerAmpAdapter('test.source-analysis-modifier', {
      execute({ analysis }) {
        return {
          analysis: {
            ...analysis,
            customAnalysisMeta: 'SOURCE_ANALYSIS_MODIFIED',
          },
        };
      },
    });

    const src = `SCDL 2
ASSET sa_probe
CANVAS WIDTH 16 HEIGHT 16
SELECT_AMPS PIPELINE test-src-analysis
LAYER ink ORDER 10 {
  PAINT (PIXEL AT (VEC2 (PX 8) (PX 8))) FILL #55ccff RASTER CENTER
}
`;
    const res = compileSCDLV2(src);
    expect(res.ok).toBe(true);
    expect(res.analysis.customAnalysisMeta).toBe('SOURCE_ANALYSIS_MODIFIED');
  });

  it('propagates modified animation and frames from TIMELINE stage seam to final compile output', () => {
    registerAmpManifest({
      contract: 'PB-AMP-ABI-v1',
      ampId: 'test.timeline-modifier',
      version: '1.0.0',
      execution: 'COMPILE',
      stage: 'TIMELINE',
      scope: ['PROGRAM'],
      inputs: [],
      parameters: [],
      output: { type: 'ANY' },
      determinism: { class: 'PURE', seedRequired: false },
      cost: { model: 'CONSTANT', multiplier: 1, fixed: 0 },
      order: 15,
      relevance: { pipelines: ['test-timeline-mod'], conditions: [] },
    });
    registerAmpAdapter('test.timeline-modifier', {
      execute() {
        return {
          animation: { fps: 60, totalFrames: 12, loop: true },
          framePackets: [{ frameIndex: 0, customTimelineTag: 'TIMELINE_SEAM_ACTIVE' }],
        };
      },
    });

    const src = `SCDL 2
ASSET tl_probe
CANVAS WIDTH 16 HEIGHT 16
SELECT_AMPS PIPELINE test-timeline-mod
LAYER ink ORDER 10 {
  PAINT (PIXEL AT (VEC2 (PX 8) (PX 8))) FILL #55ccff RASTER CENTER
}
`;
    const res = compileSCDLV2(src);
    expect(res.ok).toBe(true);
    expect(res.package.animation).toEqual({ fps: 60, totalFrames: 12, loop: true });
    expect(res.package.framePackets[0].customTimelineTag).toBe('TIMELINE_SEAM_ACTIVE');
  });
});
