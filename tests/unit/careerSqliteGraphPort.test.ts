// The SQLite retrieval port, exercised against the REAL built shards via
// better-sqlite3 (the same engine the browser worker mirrors with WASM). This
// is the end-to-end proof that the corpus is reachable through the exact
// `CareerGraphQueryPort` the analysis pipeline consumes — the capability the
// pipeline shipped without.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import {
  createSqlGraphPort,
  occupationFamily,
  queryTokens,
  buildFtsMatch,
  type SqlSelect,
} from '../../src/lib/career/graph/sqlite-graph-port';
import { analyzeCareerGraph } from '../../src/lib/career/graph/analyze-graph';

const SHARD_DIR = resolve('data/career-graph/shards');
const CORE = resolve(SHARD_DIR, 'career-core.sqlite');
const FAMILY_15 = resolve(SHARD_DIR, 'career-family-15.sqlite');

/** Wrap a better-sqlite3 database as the port's `SqlSelect` reader. */
function reader(path: string): SqlSelect {
  const db = new Database(path, { readonly: true });
  return (sql, params) => db.prepare(sql).all(...params) as Record<string, unknown>[];
}

describe('sqlite-graph-port helpers', () => {
  it('derives the family group from either an external id or a concept id', () => {
    expect(occupationFamily('15-1252.00')).toBe('15');
    expect(occupationFamily('onet:15-1252.00')).toBe('15');
    expect(occupationFamily('esco:dev-1')).toBeNull();
  });

  it('tokenizes and builds an injection-safe FTS match', () => {
    expect(queryTokens('Senior Software Developer (Python)')).toEqual([
      'senior',
      'software',
      'developer',
      'python',
    ]);
    expect(buildFtsMatch(['a"b', 'c'])).toBe('"a""b" OR "c"');
    expect(buildFtsMatch([])).toBeNull();
  });
});

const haveShards = existsSync(CORE) && existsSync(FAMILY_15);
const suite = haveShards ? describe : describe.skip;

suite('sqlite-graph-port over the real built shards', () => {
  const core = reader(CORE);
  const family15 = reader(FAMILY_15);
  const port = createSqlGraphPort({
    core,
    family: (group) => (group === '15' ? family15 : null),
  });

  it('resolves a known occupation from the core FTS index', () => {
    const rows = port.searchOccupations('software developer building applications', 10);
    const ids = rows.map((r) => r.conceptId);
    expect(ids).toContain('onet:15-1252.00');
    const dev = rows.find((r) => r.conceptId === 'onet:15-1252.00')!;
    expect(dev.matchScore).toBeGreaterThan(0);
    expect(dev.family).toBe('15');
  });

  it('traverses real requires_skill edges from the resident family shard', () => {
    const skills = port.relatedSkills('onet:15-1252.00', 50);
    expect(skills.length).toBeGreaterThan(0);
    // Ordered importance desc, level desc, id asc — graded skills lead.
    for (let i = 1; i < skills.length; i += 1) {
      const a = skills[i - 1];
      const b = skills[i];
      const ordered =
        a.importance > b.importance ||
        (a.importance === b.importance && a.level > b.level) ||
        (a.importance === b.importance && a.level === b.level && a.conceptId <= b.conceptId);
      expect(ordered).toBe(true);
    }
  });

  it('returns an empty frontier for a non-resident family instead of throwing', () => {
    // Chief Executives are SOC 11 — no family reader wired here.
    expect(() => port.relatedSkills('onet:11-1011.00', 25)).not.toThrow();
    expect(port.relatedSkills('onet:11-1011.00', 25)).toEqual([]);
  });

  it('drives a full evidence-first analysis end to end against the corpus', () => {
    const input = {
      resumeText:
        'Built and shipped web applications in JavaScript and Python. ' +
        'Designed REST APIs and wrote automated tests.',
      jobDescriptionText:
        'Software Developer. Develop, create and modify applications software. ' +
        'JavaScript, Python, SQL, and automated testing required.',
    };
    const options = {
      artifactId: 'career-graph:onet-30.3+esco-1.2.1',
      provenance: {
        code: 'CAREER_GRAPH_CORPUS',
        severity: 'info' as const,
        message: 'Running on the O*NET 30.3 / ESCO 1.2.1 corpus.',
      },
    };

    // Phase 1: several software occupations match, so the pipeline pauses for
    // confirmation and emits no skill claims yet.
    const phase1 = analyzeCareerGraph(port, input, options);
    expect(phase1.mode).toBe('graph');
    expect(phase1.diagnostics[0].code).toBe('CAREER_GRAPH_CORPUS');
    expect(phase1.diagnostics.some((d) => d.code === 'SEED_GRAPH_DEMO')).toBe(false);
    expect(phase1.diagnostics.some((d) => d.code === 'OCCUPATION_CONFIRMATION_REQUIRED')).toBe(true);
    expect(phase1.occupations.map((o) => o.conceptId)).toContain('onet:15-1252.00');
    expect(phase1.skills).toEqual([]);

    // Phase 2: candidate confirms Software Developers → classified frontier
    // built from the resident family-15 shard.
    const phase2 = analyzeCareerGraph(
      port,
      { ...input, confirmedOccupationId: 'onet:15-1252.00' },
      options
    );
    expect(phase2.occupations.map((o) => o.conceptId)).toEqual(['onet:15-1252.00']);
    expect(phase2.skills.length).toBeGreaterThan(0);
    const VALID_CLASSES = ['demonstrated', 'adjacent', 'missing', 'not_required', 'ambiguous'];
    for (const s of phase2.skills) {
      expect(VALID_CLASSES).toContain(s.classification);
    }
    // Provenance carries through to every classified skill.
    expect(phase2.skills.every((s) => s.sources.length > 0)).toBe(true);
  });
});
