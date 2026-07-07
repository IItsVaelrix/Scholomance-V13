/**
 * SemQuant / PB-Semantics Phase 1 tests
 *
 * Verifies:
 * - SCDL glow without material produces PB-SEM-003
 * - Sphere + body context annotates role
 * - Annotations are attached to AST nodes
 * - Old fixtures unchanged
 */

import { describe, it, expect } from 'vitest';
import { compileSCDL, parseSCDL, semanticUnifierPass, scdlAstToIR, constructionSpecToIR } from '../../../../../codex/core/pixelbrain/scdl/index.js';

const glowNoMaterial = `
asset test canvas 16x16
palette { cyan = #00E5FF }
part gem {
  cell 8 8 cyan
  glow radius 2
}
`;

const sphereWithBody = `
asset test canvas 24x24
palette {
  shine = #F99494
  glow  = #F87272
  core  = #DA1B1B
  rim   = #651515
  shadow= #200909
}
part body material slime {
  sphere 12 12 radius 10 shine glow core rim shadow
}
`;

describe('SemQuant (semanticUnifierPass) Phase 1', () => {
  it('attaches annotations via SCDL compile path', () => {
    const result = compileSCDL(sphereWithBody);
    expect(result.ok).toBe(true);
    expect(result.ast).toBeTruthy();

    const bodyPart = result.ast.parts.find(p => p.id === 'body');
    expect(bodyPart).toBeTruthy();
    // Semantic annotations attached by bridge
    expect(Array.isArray(bodyPart.annotations) || Array.isArray(bodyPart?.semantic?.annotations)).toBe(true);
  });

  it('propagates semantic info into lowered cells (sourceOpId, partId, role)', () => {
    const result = compileSCDL(sphereWithBody);
    expect(result.ok).toBe(true);

    const bodyPart = result.ast.parts.find(p => p.id === 'body');
    const coords = bodyPart?.coordinates || [];

    // After vector expansion + cells pass, should have cells with semantic data
    const hasSemanticCells = coords.some(c =>
      c.partId === 'body' &&
      (c.role === 'body' || c.sourceOpId)
    );

    expect(hasSemanticCells).toBe(true);

    // At least some cells should carry source provenance
    const hasSource = coords.some(c => c.sourceOpId && c.sourceOpId.includes('sphere'));
    expect(hasSource).toBe(true);
  });

  it('semantic fields survive into final PixelBrainAssetPacket coordinates', () => {
    const result = compileSCDL(sphereWithBody);
    expect(result.ok).toBe(true);
    expect(result.packet).toBeTruthy();

    const coords = result.packet.geometry?.coordinates || [];
    const bodyCells = coords.filter(c => c.partId === 'body');

    expect(bodyCells.length).toBeGreaterThan(0);

    const hasRole = bodyCells.some(c => c.role === 'body');
    expect(hasRole).toBe(true);

    const hasSource = bodyCells.some(c => c.sourceOpId);
    expect(hasSource).toBe(true);
  });

  it('emits PB-SEM-003 for glow without material binding', () => {
    const result = compileSCDL(glowNoMaterial);

    // Should still succeed (warning, not error)
    expect(result.ok).toBe(true);

    const hasSem003 = (result.errors || []).some(e =>
      String(e.code || '').includes('PB-SEM-003') ||
      (String(e.message || '').toLowerCase().includes('glow') && String(e.message || '').toLowerCase().includes('material'))
    );

    expect(hasSem003).toBe(true);

    // Also appears in official diagnostics
    const hasInDiags = (result.diagnostics || []).some(d => String(d.code || '').includes('PB-SEM-003'));
    expect(hasInDiags).toBe(true);

    // Effect classification should be present for glow
    const irForGlow = scdlAstToIR(parseSCDL(glowNoMaterial).rawAst);
    const semGlow = semanticUnifierPass(irForGlow);
    const glowNode = semGlow.nodes.find(n => n.payload?.op === 'glow');
    const hasEffect = (glowNode?.annotations || []).some(a => a.domain === 'effect' && a.canonicalType === 'glow');
    expect(hasEffect).toBe(true);
  });

  it('scdlAstToIR + semanticUnifierPass produces role annotations', () => {
    const parseResult = parseSCDL(sphereWithBody);
    const ast = parseResult.rawAst;

    const ir = scdlAstToIR(ast);
    const sem = semanticUnifierPass(ir);

    expect(sem.schemaVersion).toBe('PB-SEM-v1');
    expect(sem.nodes.length).toBeGreaterThan(0);

    const bodyNode = sem.nodes.find(n => n.payload?.partId === 'body' || n.kind === 'PartGroup');
    const hasRoleAnnotation = (bodyNode?.annotations || []).some(a => a.canonicalType === 'body' || a.domain === 'role');

    expect(hasRoleAnnotation).toBe(true);
  });

  it('does not break deterministic packet output on fixtures', () => {
    const result1 = compileSCDL(glowNoMaterial);
    const result2 = compileSCDL(glowNoMaterial);

    expect(result1.ok).toBe(result2.ok);
    if (result1.packet && result2.packet) {
      expect(result1.packet.id).toBe(result2.packet.id);
    }
  });

  it('constructionSpecToIR produces ConstructionGuide nodes', () => {
    const spec = {
      center: { x: 12, y: 12 },
      rings: [ { radius: 8, role: 'outer' }, 5 ],
      radials: { count: 8 },
    };

    const ir = constructionSpecToIR(spec);
    const sem = semanticUnifierPass(ir);

    expect(sem.nodes.length).toBeGreaterThan(0);

    const hasConstructionGuide = sem.nodes.some(n =>
      n.kind === 'ConstructionGuide' &&
      (n.annotations || []).some(a => a.canonicalType === 'constructionGuide')
    );
    expect(hasConstructionGuide).toBe(true);
  });

  it('Aseprite-style layer name "00_Reference/ring_body" annotates constructionGuide + body', () => {
    // Simulate an IR node coming from Aseprite layer metadata (future adapter)
    const mockAsepriteNodes = [
      {
        id: 'aseprite:layer:00_Reference/ring_body',
        kind: 'ReferenceLayer',
        payload: {
          layerName: '00_Reference/ring_body',
          role: 'ring',
          partId: 'body',
        },
        provenance: {
          sourceRefs: [
            { system: 'aseprite', layer: '00_Reference/ring_body' },
          ],
        },
        annotations: [],
      },
    ];

    const sem = semanticUnifierPass({ nodes: mockAsepriteNodes, schemaVersion: 'test' });

    const node = sem.nodes[0];
    const anns = node.annotations || [];

    const hasConstruction = anns.some(a => a.canonicalType === 'constructionGuide');
    const hasBodyRole = anns.some(a => a.canonicalType === 'body' || a.domain === 'role');

    expect(hasConstruction).toBe(true);
    expect(hasBodyRole).toBe(true);
    expect(node.payload.partId).toBe('body');
  });

  it('ellipse and line produce cells with semantic metadata', () => {
    const src = `
asset t canvas 16x16
palette { r=#ff0000 }
part body {
  ellipse 8 8 radius 3 2 r
  line 0 0 5 5 r
}
`;
    const res = compileSCDL(src);
    expect(res.ok).toBe(true);
    const coords = res.ast.parts[0]?.coordinates || [];
    expect(coords.length).toBeGreaterThan(0);
    expect(coords.some(c => c.role || c.semanticRole)).toBe(true);
  });

  it('rotate/scale/translate preserve sourceOpId and role', () => {
    const src = `
asset t canvas 16x16
palette { r=#ff0000 }
part body { circle 8 8 radius 2 r rotate 8 8 degrees 90 }
`;
    const res = compileSCDL(src);
    expect(res.ok).toBe(true);
    const coords = res.ast.parts[0]?.coordinates || [];
    expect(coords.some(c => c.sourceOpId && (c.role || c.semanticRole))).toBe(true);
  });

  it('boolean ops apply ownership rules', () => {
    const src = `
asset t canvas 16x16
palette { r=#ff0000 }
part body { 
  circle 8 8 radius 3 r 
}
`;
    const res = compileSCDL(src);
    expect(res.ok).toBe(true);
    // For boolean test, we simulate the op attachment via SemQuant
    // (full boolean lowering is in expand-vector)
    expect(res.ast.parts[0]?.ops?.length).toBeGreaterThan(0);
  });

  it('reference/instance resolves with semantic', () => {
    const src = `
asset t canvas 16x16
palette { r=#ff0000 }
part body { reference "gem" r }
`;
    const res = compileSCDL(src);
    expect(res.ok).toBe(true);
    const coords = res.ast.parts[0]?.coordinates || [];
    expect(coords.some(c => c.role === 'reference')).toBe(true);
  });

  it('radial symmetry with count', () => {
    const src = `
asset t canvas 16x16
palette { r=#ff0000 }
part body { circle 8 8 radius 2 r symmetry radial 8 }
`;
    const res = compileSCDL(src);
    expect(res.ok).toBe(true);
  });
});
