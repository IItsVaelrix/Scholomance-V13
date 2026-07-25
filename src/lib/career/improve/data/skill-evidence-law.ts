/**
 * Skill Evidence Law — seeded, deterministic evidence rules per skill (spec §4.3).
 *
 * A phrase match is NOT proof of a skill. "queried the database" does not demonstrate
 * SQL — the store could be MongoDB, DynamoDB, Redis, a GUI tool, or SQL-backed without
 * the candidate authoring queries. Each skill therefore declares two tiers:
 *
 *   - `demonstrated`: tokens/phrases that are explicit authorship evidence.
 *   - `adjacent`:     tokens/phrases that are related but do not prove authorship.
 *
 * Unknown skills fall back to label-token exact match = demonstrated, else none
 * (never a speculative adjacent). This file is words only; matching lives in
 * `../skill-phrase-bridge.ts`.
 */

export interface SkillEvidenceLawEntry {
  /** Canonical label, e.g. "SQL". */
  canonicalLabel: string;
  /** Optional canonical concept id. */
  conceptId?: string;
  /** Surface aliases that canonicalize to this skill (lowercased). */
  aliases: readonly string[];
  /** Tokens/phrases that are explicit authorship evidence → `demonstrated`. */
  demonstrated: readonly string[];
  /** Tokens/phrases that are related but not proof → `adjacent`. */
  adjacent: readonly string[];
}

/**
 * The seeded evidence law. Keyed by a stable skill key. Matching is case-insensitive;
 * single-word entries match on word boundaries, multi-word entries match as phrases.
 */
export const SKILL_EVIDENCE_LAW: Readonly<Record<string, SkillEvidenceLawEntry>> = Object.freeze({
  sql: Object.freeze({
    canonicalLabel: 'SQL',
    conceptId: 'onet:sql',
    aliases: ['sql', 'postgres', 'postgresql', 'mysql', 'relational db', 'relational database'],
    demonstrated: [
      'sql',
      // relational vendors are explicit-authorship evidence
      'postgres', 'postgresql', 'mysql', 'mariadb', 'oracle db', 'oracle database',
      'sqlite', 'tsql', 't-sql', 'pl/sql', 'redshift', 'snowflake', 'bigquery',
      // query-language syntax (specific phrases to avoid "join the team" false positives)
      'select ', 'select *', 'inner join', 'left join', 'right join', 'outer join',
      'group by', 'order by', 'where clause', 'stored procedure', 'stored procedures',
    ],
    adjacent: [
      'database', 'databases', 'db', 'queried', 'query', 'queries', 'querying',
      'relational data', 'records', 'data store', 'datastore',
    ],
  }),
  react: Object.freeze({
    canonicalLabel: 'React',
    conceptId: 'onet:react',
    aliases: ['react', 'reactjs', 'react.js'],
    demonstrated: ['react', 'reactjs', 'react.js', 'jsx', 'tsx', 'hooks', 'redux', 'next.js', 'nextjs'],
    adjacent: ['frontend', 'front-end', 'front end', 'ui', 'user interface', 'spa', 'single page'],
  }),
  kubernetes: Object.freeze({
    canonicalLabel: 'Kubernetes',
    conceptId: 'onet:kubernetes',
    aliases: ['kubernetes', 'k8s'],
    demonstrated: ['kubernetes', 'k8s', 'helm', 'kubectl', 'pod', 'pods', 'kustomize'],
    adjacent: ['container', 'containers', 'container orchestration', 'orchestration', 'docker', 'cluster'],
  }),
  python: Object.freeze({
    canonicalLabel: 'Python',
    conceptId: 'onet:python',
    aliases: ['python'],
    demonstrated: ['python', 'django', 'flask', 'fastapi', 'pandas', 'numpy', 'pytest', 'pip'],
    adjacent: ['scripting', 'script', 'automation script'],
  }),
  leadership: Object.freeze({
    canonicalLabel: 'Leadership',
    conceptId: 'esco:leadership',
    aliases: ['leadership', 'team lead', 'team leadership'],
    demonstrated: ['led a team', 'managed a team', 'team lead', 'team leader', 'led the team', 'mentored', 'mentoring'],
    adjacent: ['team', 'collaborated', 'collaboration', 'coordinated', 'worked with'],
  }),
});

/** Lowercased alias → skill key lookup, built once. */
const ALIAS_TO_KEY: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [key, entry] of Object.entries(SKILL_EVIDENCE_LAW)) {
    map.set(key.toLowerCase(), key);
    for (const alias of entry.aliases) map.set(alias.toLowerCase(), key);
    map.set(entry.canonicalLabel.toLowerCase(), key);
  }
  return map;
})();

/** Resolve a surface term to a seeded evidence-law entry, or null when unknown. */
export function resolveEvidenceLaw(term: string): SkillEvidenceLawEntry | null {
  const key = ALIAS_TO_KEY.get(String(term ?? '').toLowerCase().trim());
  return key ? SKILL_EVIDENCE_LAW[key] : null;
}
