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
    occupationSkillsFile: 'occupation_skills.tsv',
    delimiter: '\t',
    columns: Object.freeze({
      socCode: 'O*NET-SOC Code',
      title: 'Title',
      description: 'Description',
      skillId: 'Skill ID',
      skillName: 'Skill Name',
      importance: 'Importance',
      level: 'Level',
    }),
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

/** Normalize O*NET occupation + skill rows into interchange rows. */
export function normalizeOnet(occupationRows, skillRows, sourceRelease) {
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

  for (const r of skillRows) {
    const soc = (r[cols.socCode] || '').trim();
    const skillId = (r[cols.skillId] || '').trim();
    const skillName = (r[cols.skillName] || '').trim();
    if (!soc || !skillId || !skillName) continue;
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
    const importance = r[cols.importance];
    const level = r[cols.level];
    rows.push(
      relationRow({
        namespace: 'onet',
        from_concept_id: conceptId('onet', soc),
        predicate: 'requires_skill',
        to_concept_id: conceptId('onet', skillExternalId),
        requirement_kind: onetRequirementFromImportance(importance),
        importance: importance === '' ? null : Number(importance),
        level: level === '' ? null : Number(level),
        source_release: sourceRelease,
        source_record_id: `onet-rel-${soc}-${skillId}`,
      })
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

  const [onetOcc, onetSkills] = await Promise.all([
    readDelimited(join(onetDir, RAW_LAYOUT.onet.occupationsFile), RAW_LAYOUT.onet.delimiter),
    readDelimited(join(onetDir, RAW_LAYOUT.onet.occupationSkillsFile), RAW_LAYOUT.onet.delimiter),
  ]);
  const onetRows = normalizeOnet(onetOcc, onetSkills, onetRelease);

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

  return {
    outputDir: outDir,
    files,
    counts: {
      onet: onetRows.length,
      esco: escoRows.length,
      crosswalk: crosswalkRows.length,
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
    `CAREER_INGEST_DONE onet=${result.counts.onet} esco=${result.counts.esco} crosswalk=${result.counts.crosswalk}`
  );
}
