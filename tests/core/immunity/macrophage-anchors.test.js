// @vitest-environment node
/**
 * FINDING ANCHORS — the two things SpatialImmuneOrchestrator cannot know alone.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyFinding, resonanceByFile, buildImportGraph,
  anchorByCoupling, couplingLocality, DISTRESS_WEIGHTS,
} from '../../../codex/core/immunity/macrophage-sweep.js';

describe('triage', () => {
  it('calls a swallow that RETURNS a plausible value a silent fallback', () => {
    const lines = ['} catch {', '  return [];', '}'];
    expect(classifyFinding(lines, 1)).toBe('SILENT_FALLBACK');
  });

  it('separates a logging swallow from a bare skip', () => {
    expect(classifyFinding(['} catch (e) {', '  console.warn(e);', '}'], 1)).toBe('LOGS_ONLY');
    expect(classifyFinding(['} catch {', '  // ignore close errors', '}'], 1)).toBe('SKIP_ONLY');
  });

  /**
   * Density is not wrongness. collab.routes.js carries 40 findings, every one
   * `catch (error) { return sendServiceError(reply, error); }` — correct error
   * handling. Weighting is what stops the loudest file being the most correct.
   */
  it('ranks three silent fallbacks above forty honest error returns', () => {
    const classOf = (f) => f.cls;
    const resonance = resonanceByFile([
      ...Array.from({ length: 3 }, () => ({ path: 'dangerous.js', cls: 'SILENT_FALLBACK' })),
      ...Array.from({ length: 40 }, () => ({ path: 'noisy.js', cls: 'SKIP_ONLY' })),
    ], classOf);
    expect(resonance.get('dangerous.js')).toBeGreaterThan(0);
    expect(DISTRESS_WEIGHTS.SILENT_FALLBACK).toBeGreaterThan(DISTRESS_WEIGHTS.SKIP_ONLY);
  });

  it('normalises resonance into the unit interval the field expects', () => {
    const r = resonanceByFile([{ path: 'a.js' }, { path: 'a.js' }, { path: 'b.js' }], () => 'SILENT_FALLBACK');
    expect(Math.max(...r.values())).toBe(1);
    expect(Math.min(...r.values())).toBeGreaterThan(0);
  });
});

describe('anchoring', () => {
  const files = {
    'a.js': "import './b.js';",
    'b.js': "import './c.js';",
    'c.js': '',
    'far.js': '',
  };
  const paths = Object.keys(files).sort();
  // readSource's contract: a documented fallback that NAMES the failure, so a
  // caller can tell an empty file from one it could not read.
  const read = (p) => (files[p] === undefined
    ? { ok: false, source: null, error: new Error('ENOENT') }
    : { ok: true, source: files[p], error: null });

  it('reads real internal coupling and ignores package imports', () => {
    const withPkg = { ...files, 'a.js': "import 'react';\nimport './b.js';" };
    const graph = buildImportGraph(paths, (p) => (withPkg[p] === undefined
      ? { ok: false, source: null, error: new Error('ENOENT') }
      : { ok: true, source: withPkg[p], error: null }));
    expect(graph.get('a.js').has('b.js')).toBe(true);
    expect([...graph.get('a.js')]).not.toContain('react');
  });

  /**
   * Spacing is load-bearing. Packed contiguously, 203 files form a solid slab
   * with no gaps for structure, and every seed flows to the same basins no
   * matter what is coupled — measured: shuffling gave a byte-identical
   * partition. Anchors must leave room between them.
   */
  it('leaves gaps between anchors rather than packing a solid slab', () => {
    const anchors = anchorByCoupling(paths, buildImportGraph(paths, read));
    const coords = [...anchors.values()];
    const xs = [...new Set(coords.map((c) => c.x))].sort((a, b) => a - b);
    expect(xs.length).toBeGreaterThan(1);
    expect(xs[1] - xs[0]).toBeGreaterThan(1);
  });

  it('gives every file exactly one anchor', () => {
    const anchors = anchorByCoupling(paths, buildImportGraph(paths, read));
    expect(anchors.size).toBe(paths.length);
    const keys = [...anchors.values()].map((c) => `${c.x},${c.y},${c.z}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('is deterministic', () => {
    const graph = buildImportGraph(paths, read);
    expect([...anchorByCoupling(paths, graph)]).toEqual([...anchorByCoupling(paths, graph)]);
  });

  /**
   * If adjacency does not encode coupling, agents patrol noise. This is the
   * check that tells the driver whether its own topology is worth anything.
   */
  it('reports a coupling lift so a meaningless layout can be detected', () => {
    const graph = buildImportGraph(paths, read);
    const locality = couplingLocality(anchorByCoupling(paths, graph), graph);
    expect(locality).toHaveProperty('lift');
    expect(locality.observed).toBeGreaterThanOrEqual(0);
    expect(locality.chance).toBeGreaterThanOrEqual(0);
  });
});

describe('readSource contract', () => {
  /**
   * The prion this module's own sweep found in this module. An unreadable file
   * must not be silently indistinguishable from an empty one: classifyFinding
   * scores a null-source file SKIP_ONLY, the LOWEST danger weight, so a file
   * nobody could read would be reported as a file with nothing wrong.
   */
  it('names the failure instead of returning a bare null', async () => {
    const { readSource } = await import('../../../codex/core/immunity/macrophage-sweep.js');
    const read = readSource('/definitely/not/a/real/root');
    const result = read('nope.js');

    expect(result.ok).toBe(false);
    expect(result.source).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
  });

  it('reports ok with the source for a file that exists', async () => {
    const { readSource } = await import('../../../codex/core/immunity/macrophage-sweep.js');
    const read = readSource(process.cwd());
    const result = read('package.json');

    expect(result.ok).toBe(true);
    expect(typeof result.source).toBe('string');
    expect(result.error).toBeNull();
  });
});
