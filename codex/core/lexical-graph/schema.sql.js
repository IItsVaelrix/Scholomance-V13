// codex/core/lexical-graph/schema.sql.js
//
// Additive graph overlay for scholomance_dict.sqlite. Never touches the
// legacy `entry` / `entry_fts` / `rhyme_index` / `wordnet_*` tables — those
// remain Lexicon Oracle authority. See:
// docs/superpowers/specs/2026-07-18-lexical-graph-foundation-design.md

export const LEXICAL_GRAPH_DDL = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lexical_entry (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (
    type IN ('word', 'phrase', 'device', 'idiom', 'symbol', 'allusion', 'motif')
  ),
  canonical_text TEXT NOT NULL,
  canonical_lower TEXT NOT NULL,
  entry_id INTEGER NULL REFERENCES entry(id) ON DELETE CASCADE,
  definitions_json TEXT NOT NULL CHECK (
    json_valid(definitions_json) AND json_type(definitions_json) = 'array'
  ),
  phonemes_json TEXT NULL CHECK (
    phonemes_json IS NULL
    OR (json_valid(phonemes_json) AND json_type(phonemes_json) = 'array')
  ),
  syllable_count INTEGER NULL,
  stress_pattern TEXT NULL,
  emotional_profile_json TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(emotional_profile_json) AND json_type(emotional_profile_json) = 'object'
  ),
  semantic_coordinates_json TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(semantic_coordinates_json) AND json_type(semantic_coordinates_json) = 'object'
  ),
  register_json TEXT NOT NULL DEFAULT '[]' CHECK (
    json_valid(register_json) AND json_type(register_json) = 'array'
  ),
  domains_json TEXT NOT NULL DEFAULT '[]' CHECK (
    json_valid(domains_json) AND json_type(domains_json) = 'array'
  ),
  provenance_json TEXT NOT NULL CHECK (
    json_valid(provenance_json) AND json_type(provenance_json) = 'array'
  ),
  embeddings_tq BLOB NULL,
  embedding_kind TEXT NULL,
  embedding_version TEXT NULL,
  embedding_dimensions INTEGER NULL,
  embedding_source TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (type = 'word' AND entry_id IS NOT NULL)
    OR (type != 'word' AND entry_id IS NULL)
  ),
  CHECK (
    (
      embeddings_tq IS NULL
      AND embedding_kind IS NULL
      AND embedding_version IS NULL
      AND embedding_dimensions IS NULL
      AND embedding_source IS NULL
    )
    OR
    (
      embeddings_tq IS NOT NULL
      AND embedding_kind IS NOT NULL
      AND embedding_version IS NOT NULL
      AND embedding_dimensions > 0
      AND embedding_source IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_lexical_entry_type_canonical
  ON lexical_entry(type, canonical_lower);

CREATE INDEX IF NOT EXISTS idx_lexical_entry_canonical_lower
  ON lexical_entry(canonical_lower);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lexical_entry_entry_id_unique
  ON lexical_entry(entry_id) WHERE entry_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS lexical_relation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL REFERENCES lexical_entry(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES lexical_entry(id) ON DELETE CASCADE,
  relation TEXT NOT NULL CHECK (
    relation IN (
      'synonym', 'antonym', 'rhymes_with', 'sounds_like', 'symbolizes', 'evokes',
      'intensifies', 'contrasts_with', 'commonly_follows', 'example_of', 'used_with',
      'commonly_confused_with', 'related_device'
    )
  ),
  strength REAL NOT NULL CHECK (strength >= 0 AND strength <= 1),
  context_json TEXT NULL CHECK (
    context_json IS NULL
    OR (json_valid(context_json) AND json_type(context_json) = 'array')
  ),
  UNIQUE (source_id, target_id, relation)
);

CREATE INDEX IF NOT EXISTS idx_lexical_relation_source
  ON lexical_relation(source_id);

CREATE INDEX IF NOT EXISTS idx_lexical_relation_target
  ON lexical_relation(target_id);

CREATE INDEX IF NOT EXISTS idx_lexical_relation_relation_source
  ON lexical_relation(relation, source_id);

CREATE TABLE IF NOT EXISTS lemma_form (
  surface_lower TEXT NOT NULL,
  lemma_lower TEXT NOT NULL,
  pos TEXT NOT NULL,
  transform_id TEXT NOT NULL,
  source TEXT NOT NULL,
  irregular INTEGER NOT NULL CHECK (irregular IN (0, 1)),
  morphological_confidence REAL NOT NULL CHECK (
    morphological_confidence >= 0 AND morphological_confidence <= 1
  ),
  PRIMARY KEY (surface_lower, lemma_lower, pos, transform_id, source)
);

CREATE INDEX IF NOT EXISTS idx_lemma_form_surface
  ON lemma_form(surface_lower, lemma_lower, pos);

CREATE TABLE IF NOT EXISTS literary_device (
  id TEXT PRIMARY KEY REFERENCES lexical_entry(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  aliases_json TEXT NOT NULL CHECK (
    json_valid(aliases_json) AND json_type(aliases_json) = 'array'
  ),
  definition TEXT NOT NULL,
  detection_signals_json TEXT NOT NULL CHECK (
    json_valid(detection_signals_json) AND json_type(detection_signals_json) = 'array'
  ),
  purposes_json TEXT NOT NULL CHECK (
    json_valid(purposes_json) AND json_type(purposes_json) = 'array'
  ),
  compatible_structures_json TEXT NOT NULL CHECK (
    json_valid(compatible_structures_json) AND json_type(compatible_structures_json) = 'array'
  ),
  examples_json TEXT NOT NULL CHECK (
    json_valid(examples_json) AND json_type(examples_json) = 'array'
  )
);

CREATE VIRTUAL TABLE IF NOT EXISTS lexical_entry_fts USING fts5(
  canonical_text,
  content,
  tokenize='unicode61',
  prefix='2 3 4'
);

CREATE TABLE IF NOT EXISTS lexical_entry_fts_map (
  rowid INTEGER PRIMARY KEY,
  entry_id TEXT NOT NULL UNIQUE,
  FOREIGN KEY (entry_id) REFERENCES lexical_entry(id) ON DELETE CASCADE
);
`;
