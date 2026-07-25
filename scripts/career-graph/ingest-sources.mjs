// O*NET / ESCO / crosswalk normalizer (Task 5).
//
// Reads the verified raw source releases from data/career-graph/raw/<version>/
// and writes normalized CSVs in the Career Graph interchange format (see
// README.md) that build-database.mjs consumes.
//
// ────────────────────────────────────────────────────────────────────────────
// HONESTY NOTE — CONFIRM BEFORE PINNING:
// The raw file names and column headers below encode the *expected* layout of
// the O*NET 30.3 text release, the ESCO 1.2.1 CSV bundle, and the O*NET-ESCO
// crosswalk. These layouts are release-specific. After running
// `career:sources:fetch`, open the real files and confirm each RAW_LAYOUT
// constant matches; adjust the file/column names here if the pinned release
// differs. The normalization logic itself is fully unit-tested against
// synthetic files in this documented layout.
// ────────────────────────────────────────────────────────────────────────────

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseCsv } from './lib/csv.mjs';
import { stringifyCsv } from './lib/csv.mjs';
import { NORMALIZED_COLUMNS, conceptId } from './build-database.mjs';

/** Expected raw layout — confirm against the pinned releases. */
export const RAW_LAYOUT = Object.freeze({
  onet: Object.freeze({
    occupationsFile: 'occupations.tsv',
    // O*NET 30.x splits the 35-element skill taxonomy across two files with an
    // identical schema: Essential Skills (10 basic, 2.A.*) and Transferable
    // Skills (25 cross-functional, 2.B.*). Both are read and concatenated.
    occupationSkillsFiles: Object.freeze(['essential_skills.tsv', 'transferable_skills.tsv']),
    // The concrete tools an occupation uses (O*NET 30.3 ships this as
    // "Software Skills.txt"). Different schema from the rated skill files: a
    // categorical list with no Scale/Data Value, keyed on the Workplace Example
    // (e.g. "Atlassian JIRA") — the layer that actually appears on résumés.
    technologySkillsFile: 'technology_skills.tsv',
    delimiter: '\t',
    columns: Object.freeze({
      socCode: 'O*NET-SOC Code',
      title: 'Title',
      description: 'Description',
      skillId: 'Element ID',
      skillName: 'Element Name',
      scaleId: 'Scale ID',
      dataValue: 'Data Value',
      recommendSuppress: 'Recommend Suppress',
      notRelevant: 'Not Relevant',
    }),
    technologyColumns: Object.freeze({
      socCode: 'O*NET-SOC Code',
      example: 'Workplace Example',
      categoryId: 'Element ID',
      categoryName: 'Element Name',
      hotTechnology: 'Hot Technology',
      inDemand: 'In Demand',
    }),
    // The skill files are long-format: one row per occupation × element × scale.
    // Importance and Level arrive as SEPARATE rows and must be pivoted together.
    scales: Object.freeze({ importance: 'IM', level: 'LV' }),
  }),
  esco: Object.freeze({
    occupationsFile: 'occupations.csv',
    skillsFile: 'skills.csv',
    relationsFile: 'occupation_skills.csv',
    delimiter: ',',
    columns: Object.freeze({
      conceptUri: 'conceptUri',
      preferredLabel: 'preferredLabel',
      description: 'description',
      occupationUri: 'occupationUri',
      skillUri: 'skillUri',
      requirementType: 'requirementType',
    }),
  }),
  crosswalk: Object.freeze({
    file: 'crosswalk.csv',
    delimiter: ',',
    columns: Object.freeze({
      onetSocCode: 'onetSocCode',
      escoOccupationUri: 'escoOccupationUri',
    }),
  }),
});

/** Stable, readable external id from an ESCO concept URI (last path segment). */
export function lastPathSegment(uri) {
  const trimmed = String(uri || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  const idx = trimmed.lastIndexOf('/');
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

/**
 * Map an O*NET importance value (0-5 scale) to a requirement kind.
 * Documented assumption; tune against the pinned release if needed.
 */
export function onetRequirementFromImportance(importance) {
  const v = Number(importance);
  if (Number.isNaN(v)) return 'required';
  if (v >= 3.5) return 'required';
  if (v >= 2.5) return 'preferred';
  return 'optional';
}

function mapEscoRequirement(requirementType) {
  const t = String(requirementType || '').trim().toLowerCase();
  if (t === 'essential') return 'required';
  if (t === 'optional') return 'optional';
  return t || 'required';
}

function conceptRow({ namespace, external_id, kind, preferred_label, description, source_release, source_record_id }) {
  return {
    record_type: 'concept',
    namespace,
    external_id,
    kind,
    preferred_label,
    description: description || '',
    from_concept_id: '',
    predicate: '',
    to_concept_id: '',
    requirement_kind: '',
    importance: '',
    level: '',
    source_release,
    source_record_id,
  };
}

function relationRow({ namespace, from_concept_id, predicate, to_concept_id, requirement_kind, importance, level, source_release, source_record_id }) {
  return {
    record_type: 'relation',
    namespace: '',
    external_id: '',
    kind: '',
    preferred_label: '',
    description: '',
    from_concept_id,
    predicate,
    to_concept_id,
    requirement_kind: requirement_kind || '',
    importance: importance == null ? '' : String(importance),
    level: level == null ? '' : String(level),
    source_release,
    source_record_id,
  };
}

/** O*NET flags unreliable/inapplicable estimates with a 'Y'. */
function isFlagged(value) {
  return String(value || '').trim().toUpperCase() === 'Y';
}

/**
 * Pivot O*NET long-format skill ratings into one record per
 * (occupation, skill element).
 *
 * The release ships one row per occupation × element × scale, so Importance
 * ('IM') and Level ('LV') arrive as separate rows that must be folded together.
 * Rows flagged `Recommend Suppress` (unreliable estimate) or `Not Relevant`
 * (scale does not apply to this occupation) are dropped rather than turned into
 * graph facts.
 *
 * @returns {{ pairs: Map<string, object>, readRows: number, usedRows: number }}
 */
export function pivotOnetSkillRatings(skillRatingRows) {
  const cols = RAW_LAYOUT.onet.columns;
  const { importance: IM, level: LV } = RAW_LAYOUT.onet.scales;
  const pairs = new Map();
  let usedRows = 0;

  for (const r of skillRatingRows) {
    const soc = (r[cols.socCode] || '').trim();
    const skillId = (r[cols.skillId] || '').trim();
    const skillName = (r[cols.skillName] || '').trim();
    if (!soc || !skillId || !skillName) continue;
    if (isFlagged(r[cols.recommendSuppress]) || isFlagged(r[cols.notRelevant])) continue;

    const value = Number((r[cols.dataValue] ?? '').toString().trim());
    if (!Number.isFinite(value)) continue;

    const scale = (r[cols.scaleId] || '').trim().toUpperCase();
    if (scale !== IM && scale !== LV) continue;

    const key = `${soc}\u0000${skillId}`;
    let entry = pairs.get(key);
    if (!entry) {
      entry = { soc, skillId, skillName, importance: null, level: null };
      pairs.set(key, entry);
    }
    if (scale === IM) entry.importance = value;
    else entry.level = value;
    usedRows += 1;
  }

  return { pairs, readRows: skillRatingRows.length, usedRows };
}

/** Normalize O*NET occupation + skill rating rows into interchange rows. */
export function normalizeOnet(occupationRows, skillRatingRows, sourceRelease) {
  const cols = RAW_LAYOUT.onet.columns;
  const rows = [];
  const seenSkill = new Set();

  for (const r of occupationRows) {
    const soc = (r[cols.socCode] || '').trim();
    const title = (r[cols.title] || '').trim();
    if (!soc || !title) continue;
    rows.push(
      conceptRow({
        namespace: 'onet',
        external_id: soc,
        kind: 'occupation',
        preferred_label: title,
        description: (r[cols.description] || '').trim(),
        source_release: sourceRelease,
        source_record_id: `onet-occ-${soc}`,
      })
    );
  }

  const { pairs, readRows, usedRows } = pivotOnetSkillRatings(skillRatingRows);
  let relationCount = 0;

  for (const { soc, skillId, skillName, importance, level } of pairs.values()) {
    // Importance is what grades the edge. A pair carrying only a Level rating
    // cannot be classified as required/preferred/optional, so it is not emitted
    // rather than being defaulted into a claim the source does not support.
    if (importance == null) continue;

    const skillExternalId = `skill.${skillId}`;
    if (!seenSkill.has(skillExternalId)) {
      seenSkill.add(skillExternalId);
      rows.push(
        conceptRow({
          namespace: 'onet',
          external_id: skillExternalId,
          kind: 'skill',
          preferred_label: skillName,
          description: '',
          source_release: sourceRelease,
          source_record_id: `onet-skill-${skillId}`,
        })
      );
    }

    rows.push(
      relationRow({
        namespace: 'onet',
        from_concept_id: conceptId('onet', soc),
        predicate: 'requires_skill',
        to_concept_id: conceptId('onet', skillExternalId),
        requirement_kind: onetRequirementFromImportance(importance),
        importance,
        level,
        source_release: sourceRelease,
        source_record_id: `onet-rel-${soc}-${skillId}`,
      })
    );
    relationCount += 1;
  }

  // A skill file that parses but yields no edges is the exact failure this
  // pipeline shipped with: every row was silently skipped on a column-name
  // mismatch and the build still reported success. Refuse to normalize a
  // skill-less career graph.
  if (readRows > 0 && relationCount === 0) {
    const headers = Object.keys(skillRatingRows[0] || {});
    throw new Error(
      `INGEST_NO_SKILL_RELATIONS: read ${readRows} O*NET skill rating rows ` +
      `(${usedRows} usable) but produced 0 requires_skill relations. ` +
      `Expected columns [${Object.values(cols).join(', ')}] and scales ` +
      `[${Object.values(RAW_LAYOUT.onet.scales).join(', ')}]; the file provides ` +
      `[${headers.join(', ')}]. Check that prepare-sources mapped the right file.`
    );
  }

  return rows;
}

/** Stable, url-safe id fragment for a technology name. */
export function technologySlug(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Grade an occupation→technology edge.
 *
 * O*NET does not assert that any technology is *required* for an occupation —
 * the file lists tools observed in use, flagged for market signal. Nothing here
 * maps to 'required'; claiming otherwise would put a requirement in the graph
 * that the source never made.
 */
export function onetTechnologyRequirement(row) {
  const cols = RAW_LAYOUT.onet.technologyColumns;
  if (isFlagged(row[cols.inDemand]) || isFlagged(row[cols.hotTechnology])) return 'preferred';
  return 'optional';
}

/**
 * Normalize O*NET technology/software rows into tool concepts and
 * occupation→tool relations.
 *
 * Tools are identified by their Workplace Example ("Atlassian JIRA"), with the
 * O*NET category ("Content workflow software") kept as the description so the
 * UI can explain a match. Slug collisions between distinct tool names are
 * disambiguated with a deterministic counter, so a given input file always
 * produces the same ids.
 */
export function normalizeOnetTechnology(technologyRows, sourceRelease) {
  const cols = RAW_LAYOUT.onet.technologyColumns;
  const rows = [];
  const slugByName = new Map(); // tool name -> external id fragment
  const nameBySlug = new Map(); // external id fragment -> tool name
  const seenEdge = new Set();
  let relationCount = 0;

  for (const r of technologyRows) {
    const soc = (r[cols.socCode] || '').trim();
    const name = (r[cols.example] || '').trim();
    if (!soc || !name) continue;

    let slug = slugByName.get(name);
    if (!slug) {
      const base = technologySlug(name);
      if (!base) continue;
      slug = base;
      let n = 1;
      while (nameBySlug.has(slug) && nameBySlug.get(slug) !== name) {
        n += 1;
        slug = `${base}-${n}`;
      }
      slugByName.set(name, slug);
      nameBySlug.set(slug, name);

      rows.push(
        conceptRow({
          namespace: 'onet',
          external_id: `tech.${slug}`,
          kind: 'skill',
          preferred_label: name,
          description: (r[cols.categoryName] || '').trim(),
          source_release: sourceRelease,
          source_record_id: `onet-tech-${slug}`,
        })
      );
    }

    // The same tool can be listed for one occupation under several categories.
    const edgeKey = `${soc}|${slug}`;
    if (seenEdge.has(edgeKey)) continue;
    seenEdge.add(edgeKey);

    rows.push(
      relationRow({
        namespace: 'onet',
        from_concept_id: conceptId('onet', soc),
        predicate: 'requires_skill',
        to_concept_id: conceptId('onet', `tech.${slug}`),
        requirement_kind: onetTechnologyRequirement(r),
        importance: null,
        level: null,
        source_release: sourceRelease,
        source_record_id: `onet-techrel-${soc}-${slug}`,
      })
    );
    relationCount += 1;
  }

  if (technologyRows.length > 0 && relationCount === 0) {
    const headers = Object.keys(technologyRows[0] || {});
    throw new Error(
      `INGEST_NO_TECHNOLOGY_RELATIONS: read ${technologyRows.length} O*NET technology rows ` +
      `but produced 0 requires_skill relations. Expected columns ` +
      `[${Object.values(cols).join(', ')}]; the file provides [${headers.join(', ')}].`
    );
  }

  return rows;
}

/** Normalize ESCO occupation/skill concepts and their relations. */
export function normalizeEsco(occupationRows, skillRows, relationRows, sourceRelease) {
  const cols = RAW_LAYOUT.esco.columns;
  const rows = [];

  for (const r of occupationRows) {
    const seg = lastPathSegment(r[cols.conceptUri]);
    const label = (r[cols.preferredLabel] || '').trim();
    if (!seg || !label) continue;
    rows.push(
      conceptRow({
        namespace: 'esco',
        external_id: seg,
        kind: 'occupation',
        preferred_label: label,
        description: (r[cols.description] || '').trim(),
        source_release: sourceRelease,
        source_record_id: `esco-occ-${seg}`,
      })
    );
  }

  for (const r of skillRows) {
    const seg = lastPathSegment(r[cols.conceptUri]);
    const label = (r[cols.preferredLabel] || '').trim();
    if (!seg || !label) continue;
    rows.push(
      conceptRow({
        namespace: 'esco',
        external_id: seg,
        kind: 'skill',
        preferred_label: label,
        description: (r[cols.description] || '').trim(),
        source_release: sourceRelease,
        source_record_id: `esco-skill-${seg}`,
      })
    );
  }

  for (const r of relationRows) {
    const occSeg = lastPathSegment(r[cols.occupationUri]);
    const skillSeg = lastPathSegment(r[cols.skillUri]);
    if (!occSeg || !skillSeg) continue;
    rows.push(
      relationRow({
        namespace: 'esco',
        from_concept_id: conceptId('esco', occSeg),
        predicate: 'requires_skill',
        to_concept_id: conceptId('esco', skillSeg),
        requirement_kind: mapEscoRequirement(r[cols.requirementType]),
        importance: null,
        level: null,
        source_release: sourceRelease,
        source_record_id: `esco-rel-${occSeg}-${skillSeg}`,
      })
    );
  }

  return rows;
}

/** Normalize the O*NET-SOC -> ESCO crosswalk into mapped_to relations. */
export function normalizeCrosswalk(crosswalkRows, sourceRelease) {
  const cols = RAW_LAYOUT.crosswalk.columns;
  const rows = [];
  for (const r of crosswalkRows) {
    const soc = (r[cols.onetSocCode] || '').trim();
    const escoSeg = lastPathSegment(r[cols.escoOccupationUri]);
    if (!soc || !escoSeg) continue;
    rows.push(
      relationRow({
        namespace: 'crosswalk',
        from_concept_id: conceptId('onet', soc),
        predicate: 'mapped_to',
        to_concept_id: conceptId('esco', escoSeg),
        requirement_kind: '',
        importance: null,
        level: null,
        source_release: sourceRelease,
        source_record_id: `xwalk-${soc}-${escoSeg}`,
      })
    );
  }
  return rows;
}

async function readDelimited(path, delimiter) {
  const text = await readFile(path, 'utf-8');
  return parseCsv(text, { delimiter });
}

/**
 * Ingest verified raw sources into normalized interchange CSVs.
 *
 * @param {{ rawRoot: string, outputDir: string, manifest: object }} args
 * @returns {Promise<{ outputDir: string, files: string[], counts: object }>}
 */
export async function ingestSources({ rawRoot, outputDir, manifest }) {
  const outDir = resolve(outputDir);
  await mkdir(outDir, { recursive: true });

  const onetDir = join(resolve(rawRoot), manifest.onet.version);
  const escoDir = join(resolve(rawRoot), manifest.esco.version);
  const crosswalkDir = join(resolve(rawRoot), manifest.crosswalk.version);

  const onetRelease = `onet-${manifest.onet.version}`;
  const escoRelease = `esco-${manifest.esco.version}`;
  const crosswalkRelease = `crosswalk-${manifest.crosswalk.version}`;

  const [onetOcc, onetTech, ...onetSkillFiles] = await Promise.all([
    readDelimited(join(onetDir, RAW_LAYOUT.onet.occupationsFile), RAW_LAYOUT.onet.delimiter),
    readDelimited(join(onetDir, RAW_LAYOUT.onet.technologySkillsFile), RAW_LAYOUT.onet.delimiter),
    ...RAW_LAYOUT.onet.occupationSkillsFiles.map((f) =>
      readDelimited(join(onetDir, f), RAW_LAYOUT.onet.delimiter)
    ),
  ]);
  const onetRows = [
    ...normalizeOnet(onetOcc, onetSkillFiles.flat(), onetRelease),
    ...normalizeOnetTechnology(onetTech, onetRelease),
  ];

  const [escoOcc, escoSkills, escoRels] = await Promise.all([
    readDelimited(join(escoDir, RAW_LAYOUT.esco.occupationsFile), RAW_LAYOUT.esco.delimiter),
    readDelimited(join(escoDir, RAW_LAYOUT.esco.skillsFile), RAW_LAYOUT.esco.delimiter),
    readDelimited(join(escoDir, RAW_LAYOUT.esco.relationsFile), RAW_LAYOUT.esco.delimiter),
  ]);
  const escoRows = normalizeEsco(escoOcc, escoSkills, escoRels, escoRelease);

  const crosswalkRaw = await readDelimited(
    join(crosswalkDir, RAW_LAYOUT.crosswalk.file),
    RAW_LAYOUT.crosswalk.delimiter
  );
  const crosswalkRows = normalizeCrosswalk(crosswalkRaw, crosswalkRelease);

  const files = [];
  const write = async (name, rows) => {
    const path = join(outDir, name);
    await writeFile(path, stringifyCsv([...NORMALIZED_COLUMNS], rows));
    files.push(path);
  };
  await write('onet.normalized.csv', onetRows);
  await write('esco.normalized.csv', escoRows);
  await write('crosswalk.normalized.csv', crosswalkRows);

  const relationsIn = (rows) => rows.filter((r) => r.record_type === 'relation').length;

  return {
    outputDir: outDir,
    files,
    counts: {
      onet: onetRows.length,
      esco: escoRows.length,
      crosswalk: crosswalkRows.length,
    },
    // Surfaced so an ingest that produces concepts but no edges is visible in
    // the build log instead of only in the database.
    relations: {
      onet: relationsIn(onetRows),
      esco: relationsIn(escoRows),
      crosswalk: relationsIn(crosswalkRows),
    },
  };
}

// CLI: node scripts/career-graph/ingest-sources.mjs <rawRoot> <outputDir> [configPath]
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);

if (isMain) {
  const [, , rawArg, outArg, configArg] = process.argv;
  if (!rawArg || !outArg) {
    console.error(
      'usage: node scripts/career-graph/ingest-sources.mjs <rawRoot> <outputDir> [configPath]'
    );
    process.exit(2);
  }
  const { loadSourceManifest } = await import('./fetch-sources.mjs');
  const manifest = await loadSourceManifest(
    configArg || resolve('config', 'career-graph-sources.json')
  );
  const result = await ingestSources({ rawRoot: rawArg, outputDir: outArg, manifest });
  console.log(
    `CAREER_INGEST_DONE onet=${result.counts.onet} esco=${result.counts.esco} crosswalk=${result.counts.crosswalk} ` +
    `relations(onet=${result.relations.onet} esco=${result.relations.esco} crosswalk=${result.relations.crosswalk})`
  );
}
