import { describe, it, expect } from 'vitest';
import { parseSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.parser.js';
import { analyzeSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.analyzer.js';
import { formatSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.formatter.js';
import { compileSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.compiler.js';
import { registerAmpManifest, registerAmpAdapter } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.amp-catalog.js';

describe('SCDL v2 AMP Invocation IR and Compiler Integration', () => {
  const facetSrc = `SCDL 2
ASSET faceted_gem
CANVAS WIDTH 32 HEIGHT 32

SHAPE $raw (CIRCLE CENTER (VEC2 (PX 16) (PX 16)) RADIUS (PX 8))

APPLY_AMP $gem SHAPE {
  AMP pixelbrain.facet
  VERSION 1.0.0
  STAGE SHAPE_POST
  INPUT geometry $raw
  PARAM facetCount 8
}

LAYER main ORDER 10 {
  PAINT $gem FILL #00ffff RASTER CENTER
}
`;

  it('parses and formats APPLY_AMP statements losslessly', () => {
    const parsed = parseSCDLV2(facetSrc);
    expect(parsed.ok).toBe(true);

    const applyNode = parsed.ast.declarations.find((d) => d.kind === 'ApplyAmpStatement');
    expect(applyNode).toBeDefined();
    expect(applyNode.targetSymbol).toBe('$gem');
    expect(applyNode.targetType).toBe('SHAPE');
    expect(applyNode.ampId).toBe('pixelbrain.facet');
    expect(applyNode.version).toBe('1.0.0');
    expect(applyNode.stage).toBe('SHAPE_POST');
    expect(applyNode.inputs.geometry.name).toBe('$raw');
    expect(applyNode.params.facetCount.value).toBe(8);

    const formatted = formatSCDLV2(facetSrc);
    expect(formatted.ok).toBe(true);
    const parsedAgain = parseSCDLV2(formatted.output);
    expect(parsedAgain.ok).toBe(true);
    const applyAgain = parsedAgain.ast.declarations.find((d) => d.kind === 'ApplyAmpStatement');
    expect(applyAgain.ampId).toBe(applyNode.ampId);
    expect(applyAgain.targetSymbol).toBe(applyNode.targetSymbol);
  });

  it('analyzes APPLY_AMP and validates against registered manifest', () => {
    const parsed = parseSCDLV2(facetSrc);
    const analyzed = analyzeSCDLV2(parsed.ast);
    expect(analyzed.ok).toBe(true);
    expect(analyzed.ir.explicitAmps).toHaveLength(1);
    expect(analyzed.ir.explicitAmps[0].ampId).toBe('pixelbrain.facet');
  });

  it('fails analysis closed with SCDL-AMP-001 for unknown AMP', () => {
    const unknownSrc = `SCDL 2
ASSET test
CANVAS WIDTH 16 HEIGHT 16
SHAPE $base (PIXEL AT (VEC2 (PX 0) (PX 0)))
APPLY_AMP $out SHAPE {
  AMP pixelbrain.non_existent_amp
  VERSION 1.0.0
  STAGE SHAPE_POST
  INPUT geometry $base
}
LAYER l ORDER 1 { PAINT $out FILL #ffffff }
`;
    const parsed = parseSCDLV2(unknownSrc);
    const analyzed = analyzeSCDLV2(parsed.ast);
    expect(analyzed.ok).toBe(false);
    expect(analyzed.diagnostics.some((d) => d.code === 'SCDL-AMP-001')).toBe(true);
  });

  it('fails analysis closed with SCDL-AMP-002 for stage mismatch', () => {
    const badStageSrc = `SCDL 2
ASSET test
CANVAS WIDTH 16 HEIGHT 16
SHAPE $base (PIXEL AT (VEC2 (PX 0) (PX 0)))
APPLY_AMP $out SHAPE {
  AMP pixelbrain.facet
  VERSION 1.0.0
  STAGE LAYER_POST
  INPUT geometry $base
}
LAYER l ORDER 1 { PAINT $out FILL #ffffff }
`;
    const parsed = parseSCDLV2(badStageSrc);
    const analyzed = analyzeSCDLV2(parsed.ast);
    expect(analyzed.ok).toBe(false);
    expect(analyzed.diagnostics.some((d) => d.code === 'SCDL-AMP-002')).toBe(true);
  });

  it('fails analysis closed with SCDL-AMP-003 for missing required inputs', () => {
    const missingInputSrc = `SCDL 2
ASSET test
CANVAS WIDTH 16 HEIGHT 16
APPLY_AMP $out SHAPE {
  AMP pixelbrain.facet
  VERSION 1.0.0
  STAGE SHAPE_POST
}
LAYER l ORDER 1 { PAINT $out FILL #ffffff }
`;
    const parsed = parseSCDLV2(missingInputSrc);
    const analyzed = analyzeSCDLV2(parsed.ast);
    expect(analyzed.ok).toBe(false);
    expect(analyzed.diagnostics.some((d) => d.code === 'SCDL-AMP-003')).toBe(true);
  });

  it('fails analysis closed with SCDL-AMP-004 for parameter out of bounds', () => {
    const oobParamSrc = `SCDL 2
ASSET test
CANVAS WIDTH 16 HEIGHT 16
SHAPE $base (PIXEL AT (VEC2 (PX 0) (PX 0)))
APPLY_AMP $out SHAPE {
  AMP pixelbrain.facet
  VERSION 1.0.0
  STAGE SHAPE_POST
  INPUT geometry $base
  PARAM facetCount 100
}
LAYER l ORDER 1 { PAINT $out FILL #ffffff }
`;
    const parsed = parseSCDLV2(oobParamSrc);
    const analyzed = analyzeSCDLV2(parsed.ast);
    expect(analyzed.ok).toBe(false);
    expect(analyzed.diagnostics.some((d) => d.code === 'SCDL-AMP-004')).toBe(true);
  });

  it('compiles APPLY_AMP program end-to-end with bytecode and packet output', () => {
    const result = compileSCDLV2(facetSrc);
    expect(result.ok).toBe(true);
    expect(result.bytecode).toBeDefined();
    expect(result.bytecode.capabilities).toContain('MATERIAL.PIXELBRAIN@2.0');
    expect(result.bytecode.text).toContain('BC.AMP.APPLY');
    const active = result.package.ampPlan.filter((p) => p.source !== 'DORMANT');
    expect(active).toHaveLength(1);
    expect(result.package.framePackets).toHaveLength(1);
  });

  it('compiles DESCRIPTOR AMP and collects immutable runtime descriptor', () => {
    const descSrc = `SCDL 2
ASSET clockwork_gear
CANVAS WIDTH 32 HEIGHT 32

APPLY_AMP $motion ANY {
  AMP pixelbrain.gear-glide
  VERSION 1.0.0
  STAGE RUNTIME_DESCRIPTOR
  PARAM bpm 120
  PARAM degreesPerBeat 45
}

LAYER base ORDER 10 {
  PAINT (PIXEL AT (VEC2 (PX 16) (PX 16))) FILL #ffff00 RASTER CENTER
}
`;
    const res = compileSCDLV2(descSrc);
    expect(res.ok).toBe(true);
    expect(res.ampDescriptors).toHaveLength(1);
    expect(res.package.ampDescriptors).toHaveLength(1);
    expect(res.package.ampDescriptors[0].contract).toBe('PB-RUNTIME-DESCRIPTOR-v1');
    expect(res.package.ampDescriptors[0].kind).toBe('GEAR_GLIDE');
    expect(res.ampDescriptors[0].contract).toBe('PB-RUNTIME-DESCRIPTOR-v1');
    expect(res.ampDescriptors[0].kind).toBe('GEAR_GLIDE');
    expect(res.ampDescriptors[0].bpm).toBe(120);
    expect(res.ampDescriptors[0].degreesPerBeat).toBe(45);
  });

  it('executes SELECT_AMPS with deterministic relevance selection', () => {
    const selectSrc = `SCDL 2
ASSET auto_selected
CANVAS WIDTH 32 HEIGHT 32

SELECT_AMPS PIPELINE render-fidelity

LAYER main ORDER 10 {
  PAINT (CIRCLE CENTER (VEC2 (PX 16) (PX 16)) RADIUS (PX 8)) FILL #00ff00 RASTER CENTER
}
`;
    const res = compileSCDLV2(selectSrc);
    expect(res.ok).toBe(true);
    expect(res.ampPlan.length).toBeGreaterThanOrEqual(1);
    const active = res.ampPlan.filter((p) => p.source !== 'DORMANT');
    expect(active.some((a) => a.ampId === 'pixelbrain.pixel-aa')).toBe(true);
  });

  it('fails analysis with SCDL-AMP-004 when an unknown parameter is declared', () => {
    const unknownParamSrc = `SCDL 2
ASSET test_unknown_param
CANVAS WIDTH 16 HEIGHT 16
SHAPE $base (PIXEL AT (VEC2 (PX 0) (PX 0)))
APPLY_AMP $out SHAPE {
  AMP pixelbrain.facet
  VERSION 1.0.0
  STAGE SHAPE_POST
  INPUT geometry $base
  PARAM nonExistentParam 42
}
LAYER l ORDER 1 { PAINT $out FILL #ffffff }
`;
    const parsed = parseSCDLV2(unknownParamSrc);
    const analyzed = analyzeSCDLV2(parsed.ast);
    expect(analyzed.ok).toBe(false);
    expect(analyzed.diagnostics.some((d) => d.code === 'SCDL-AMP-004' && d.message.includes('unknown parameter'))).toBe(true);
  });

  it('fails analysis with SCDL-AMP-005 when a parameter type mismatches', () => {
    const typeMismatchParamSrc = `SCDL 2
ASSET test_type_mismatch
CANVAS WIDTH 16 HEIGHT 16
SHAPE $base (PIXEL AT (VEC2 (PX 0) (PX 0)))
APPLY_AMP $out SHAPE {
  AMP pixelbrain.facet
  VERSION 1.0.0
  STAGE SHAPE_POST
  INPUT geometry $base
  PARAM facetCount #ff0000
}
LAYER l ORDER 1 { PAINT $out FILL #ffffff }
`;
    const parsed = parseSCDLV2(typeMismatchParamSrc);
    const analyzed = analyzeSCDLV2(parsed.ast);
    expect(analyzed.ok).toBe(false);
    expect(analyzed.diagnostics.some((d) => d.code === 'SCDL-AMP-005' && d.message.includes('expected type I32'))).toBe(true);
  });

  it('does not execute adapters during semantic analysis', () => {
    const facetSrc = `SCDL 2
ASSET facet_analysis_purity
CANVAS WIDTH 32 HEIGHT 32
SHAPE $raw (CIRCLE CENTER (VEC2 (PX 16) (PX 16)) RADIUS (PX 8))
APPLY_AMP $gem SHAPE {
  AMP pixelbrain.facet
  VERSION 1.0.0
  STAGE SHAPE_POST
  INPUT geometry $raw
  PARAM facetCount 8
}
LAYER main ORDER 10 { PAINT $gem FILL #00ffff }
`;
    const parsed = parseSCDLV2(facetSrc);
    const analyzed = analyzeSCDLV2(parsed.ast);
    expect(analyzed.ok).toBe(true);
    // Target symbol must be bound to a pure AMP_RESULT representation, not executed geometry
    const gemShape = analyzed.ir.shapes.find((s) => s.symbol === '$gem');
    expect(gemShape).toBeDefined();
    expect(gemShape.value.kind).toBe('AMP_RESULT');
    expect(gemShape.value.ampId).toBe('pixelbrain.facet');
    expect(gemShape.value.facetPlanes).toBeUndefined(); // Adapter has NOT executed yet
  });

  it('fails analysis with SCDL-AMP-011 when an unknown input is declared in APPLY_AMP', () => {
    const unknownInputSrc = `SCDL 2
ASSET test_unknown_input
CANVAS WIDTH 16 HEIGHT 16
SHAPE $base (PIXEL AT (VEC2 (PX 0) (PX 0)))
APPLY_AMP $out SHAPE {
  AMP pixelbrain.facet
  VERSION 1.0.0
  STAGE SHAPE_POST
  INPUT nonexistentInput $base
  PARAM facetCount 6
}
LAYER l ORDER 1 { PAINT $out FILL #ffffff }
`;
    const parsed = parseSCDLV2(unknownInputSrc);
    const analyzed = analyzeSCDLV2(parsed.ast);
    expect(analyzed.ok).toBe(false);
    expect(analyzed.diagnostics.some((d) => d.code === 'SCDL-AMP-011' && d.message.includes('unknown input') && d.message.includes('nonexistentInput'))).toBe(true);
  });

  it('executes explicit AMP exactly once across compilation (no duplicate execution via conveyor)', () => {
    let callCount = 0;
    registerAmpManifest({
      contract: 'PB-AMP-ABI-v1',
      ampId: 'test.counting-shape-post',
      version: '1.0.0',
      execution: 'COMPILE',
      stage: 'SHAPE_POST',
      scope: ['SHAPE'],
      inputs: [{ name: 'geometry', type: 'SHAPE', required: true }],
      parameters: [],
      output: { type: 'SHAPE' },
      determinism: { class: 'PURE', seedRequired: false },
      cost: { model: 'CONSTANT', multiplier: 1, fixed: 0 },
      order: 10,
    });
    registerAmpAdapter('test.counting-shape-post', {
      execute(inputs) {
        callCount++;
        return { ...(inputs.geometry || {}), faceted: true };
      },
    });

    const src = `SCDL 2
ASSET count_test
CANVAS WIDTH 16 HEIGHT 16
SHAPE $base (PIXEL AT (VEC2 (PX 0) (PX 0)))
APPLY_AMP $out SHAPE {
  AMP test.counting-shape-post
  VERSION 1.0.0
  STAGE SHAPE_POST
  INPUT geometry $base
}
LAYER l ORDER 1 { PAINT $out FILL #ffffff }
`;
    const res = compileSCDLV2(src);
    expect(res.ok).toBe(true);
    expect(callCount).toBe(1);
  });

  it('executes explicit APPLY_AMP at PAINT stage (not skipped)', () => {
    let paintCallCount = 0;
    registerAmpManifest({
      contract: 'PB-AMP-ABI-v1',
      ampId: 'test.paint-modifier',
      version: '1.0.0',
      execution: 'COMPILE',
      stage: 'PAINT',
      scope: ['PROGRAM'],
      inputs: [],
      parameters: [],
      output: { type: 'ANY' },
      determinism: { class: 'PURE', seedRequired: false },
      cost: { model: 'CONSTANT', multiplier: 1, fixed: 0 },
      order: 10,
    });
    registerAmpAdapter('test.paint-modifier', {
      execute(inputs) {
        paintCallCount++;
        return inputs;
      },
    });

    const src = `SCDL 2
ASSET paint_test
CANVAS WIDTH 16 HEIGHT 16
APPLY_AMP $p ANY {
  AMP test.paint-modifier
  VERSION 1.0.0
  STAGE PAINT
}
LAYER l ORDER 1 { PAINT (PIXEL AT (VEC2 (PX 0) (PX 0))) FILL #ffffff }
`;
    const res = compileSCDLV2(src);
    expect(res.ok).toBe(true);
    expect(paintCallCount).toBe(1);
  });

  it('halts and returns structured failV2 without packet emission when explicit shape AMP throws', () => {
    registerAmpManifest({
      contract: 'PB-AMP-ABI-v1',
      ampId: 'test.throwing-shape-amp',
      version: '1.0.0',
      execution: 'COMPILE',
      stage: 'SHAPE_POST',
      scope: ['SHAPE'],
      inputs: [{ name: 'geometry', type: 'SHAPE', required: true }],
      parameters: [],
      output: { type: 'SHAPE' },
      determinism: { class: 'PURE', seedRequired: false },
      cost: { model: 'CONSTANT', multiplier: 1, fixed: 0 },
      order: 10,
    });
    registerAmpAdapter('test.throwing-shape-amp', {
      execute() {
        throw new Error('Deliberate explicit shape failure');
      },
    });

    const src = `SCDL 2
ASSET throw_shape_test
CANVAS WIDTH 16 HEIGHT 16
SHAPE $base (PIXEL AT (VEC2 (PX 0) (PX 0)))
APPLY_AMP $out SHAPE {
  AMP test.throwing-shape-amp
  VERSION 1.0.0
  STAGE SHAPE_POST
  INPUT geometry $base
}
LAYER l ORDER 1 { PAINT $out FILL #ffffff }
`;
    const res = compileSCDLV2(src);
    expect(res.ok).toBe(false);
    expect(res.packet).toBeNull();
    expect(res.package).toBeNull();
    expect(res.diagnostics.some((d) => d.code === 'SCDL-AMP-007' && d.message.includes('Deliberate explicit shape failure'))).toBe(true);
  });
});
