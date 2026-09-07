import { describe, it, expect } from 'vitest';
import {
  evaluateAmpRelevance,
  resolveAmpPlan,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.amp-relevance.js';

describe('SCDL v2 Deterministic Relevance Evaluator', () => {
  const facetManifest = Object.freeze({
    contract: 'PB-AMP-ABI-v1',
    ampId: 'pixelbrain.facet',
    version: '1.0.0',
    execution: 'COMPILE',
    stage: 'SHAPE_POST',
    order: 40,
    relevance: {
      pipelines: ['item', 'render-fidelity'],
      conditions: [{ field: 'materials', op: 'includes', value: 'gem' }],
    },
  });

  const aaManifest = Object.freeze({
    contract: 'PB-AMP-ABI-v1',
    ampId: 'pixelbrain.pixel-aa',
    version: '1.0.0',
    execution: 'COMPILE',
    stage: 'LAYER_POST',
    order: 70,
    relevance: {
      pipelines: ['render-fidelity'],
      conditions: [],
    },
  });

  const runtimeManifest = Object.freeze({
    contract: 'PB-AMP-ABI-v1',
    ampId: 'pixelbrain.gear-glide',
    version: '1.0.0',
    execution: 'DESCRIPTOR',
    stage: 'RUNTIME_DESCRIPTOR',
    order: 110,
    relevance: {
      pipelines: ['runtime'],
      conditions: [{ field: 'tags', op: 'includes', value: 'clockwork' }],
    },
  });

  it('selects AMP when pipeline and material conditions match', () => {
    const context = {
      pipeline: 'render-fidelity',
      materials: ['metal', 'gem'],
      tags: [],
    };
    const res = evaluateAmpRelevance(facetManifest, context);
    expect(res.relevant).toBe(true);
    expect(res.reason).toMatch(/satisfied/);
  });

  it('marks AMP dormant with explicit skip reason when material condition fails', () => {
    const context = {
      pipeline: 'render-fidelity',
      materials: ['wood'],
      tags: [],
    };
    const res = evaluateAmpRelevance(facetManifest, context);
    expect(res.relevant).toBe(false);
    expect(res.reason).toContain("field 'materials' does not include 'gem'");
  });

  it('marks AMP dormant with pipeline mismatch reason', () => {
    const context = {
      pipeline: 'gameplay',
      materials: ['gem'],
      tags: [],
    };
    const res = evaluateAmpRelevance(facetManifest, context);
    expect(res.relevant).toBe(false);
    expect(res.reason).toContain("Pipeline mismatch: asset pipeline 'gameplay'");
  });

  it('evaluates compound conditions (allOf, anyOf, noneOf)', () => {
    const compoundManifest = {
      contract: 'PB-AMP-ABI-v1',
      ampId: 'test.compound',
      version: '1.0.0',
      execution: 'COMPILE',
      stage: 'PAINT',
      order: 50,
      relevance: {
        conditions: [
          {
            anyOf: [
              { field: 'materials', op: 'includes', value: 'gold' },
              { field: 'materials', op: 'includes', value: 'silver' },
            ],
          },
          {
            noneOf: [
              { field: 'tags', op: 'includes', value: 'flat' },
            ],
          },
        ],
      },
    };

    const matchContext = { materials: ['gold'], tags: ['ornate'] };
    expect(evaluateAmpRelevance(compoundManifest, matchContext).relevant).toBe(true);

    const forbiddenContext = { materials: ['gold'], tags: ['flat'] };
    const resForbidden = evaluateAmpRelevance(compoundManifest, forbiddenContext);
    expect(resForbidden.relevant).toBe(false);
    expect(resForbidden.reason).toContain('Forbidden condition matched');

    const noneMatchContext = { materials: ['iron'], tags: ['ornate'] };
    const resNone = evaluateAmpRelevance(compoundManifest, noneMatchContext);
    expect(resNone.relevant).toBe(false);
    expect(resNone.reason).toContain('None of anyOf conditions matched');
  });

  it('resolves complete plan with active and dormant items and explicit reasons', () => {
    const manifests = [facetManifest, aaManifest, runtimeManifest];
    const context = {
      pipeline: 'render-fidelity',
      materials: ['gem'],
      tags: [],
      selectAmpsEnabled: true,
    };

    const plan = resolveAmpPlan(manifests, context, []);

    // aaManifest and facetManifest should be selected; runtimeManifest is dormant
    expect(plan.selectedPlan.map((x) => x.ampId)).toEqual([
      'pixelbrain.facet',
      'pixelbrain.pixel-aa',
    ]);
    expect(plan.dormantList.map((x) => x.ampId)).toEqual(['pixelbrain.gear-glide']);
    expect(plan.dormantList[0].skipReason).toContain('Pipeline mismatch');
    expect(plan.fullPlan).toHaveLength(3);
  });

  it('allows explicit APPLY_AMP to override relevance and activate a dormant AMP', () => {
    const manifests = [facetManifest, runtimeManifest];
    const context = {
      pipeline: 'render-fidelity',
      materials: ['wood'], // facet would normally be dormant
      tags: [],
    };
    const explicit = [
      { ampId: 'pixelbrain.facet', stage: 'SHAPE_POST', inputs: {}, params: { facetCount: 6 } },
    ];

    const plan = resolveAmpPlan(manifests, context, explicit);
    const activeIds = plan.selectedPlan.map((x) => x.ampId);
    expect(activeIds).toContain('pixelbrain.facet');

    const explicitEntry = plan.selectedPlan.find((x) => x.ampId === 'pixelbrain.facet');
    expect(explicitEntry.source).toBe('EXPLICIT_APPLY');
    expect(explicitEntry.params.facetCount).toBe(6);
  });

  it('enforces stage filtering when context.stage is specified', () => {
    const manifests = [facetManifest, aaManifest];
    const context = {
      pipeline: 'render-fidelity',
      materials: ['gem'],
      stage: 'LAYER_POST',
      selectAmpsEnabled: true,
    };

    const plan = resolveAmpPlan(manifests, context, []);
    expect(plan.selectedPlan.map((x) => x.ampId)).toEqual(['pixelbrain.pixel-aa']);
    const dormantFacet = plan.dormantList.find((d) => d.ampId === 'pixelbrain.facet');
    expect(dormantFacet).toBeDefined();
    expect(dormantFacet.skipReason).toContain("Stage mismatch: manifest stage 'SHAPE_POST' does not match requested stage 'LAYER_POST'");
  });
});
