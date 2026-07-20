# Scholomance Offline Dictionary Build

This repo includes a build script to generate an offline dictionary SQLite database from open datasets. The output is a single SQLite file with FTS5 for fast lookup and search.

## Sources (Open Data)
- **CMU Pronouncing Dictionary** (~134k English words with ARPAbet phonemes). Installed via npm (`cmudict` package).
- **Open English WordNet (OEWN)** for definitions, synonyms, and semantic relations (CC BY 4.0).
- **Datamuse API** provides runtime enrichment (rhymes, word associations) — no build-time dependency.

## Prerequisites

1. Install Node dependencies (provides CMU dict):
```bash
npm install
```

2. Place the OEWN XML file in your project root:
   - Download from the [Open English WordNet releases](https://github.com/globalwordnet/english-wordnet/releases)
   - Supports both `.xml` and `.xml.gz` formats

No additional Python packages are required — the build script uses only the standard library.

## Build

```bash
python scripts/build_scholomance_dict.py \
  --oewn_path english-wordnet-2025.xml \
  --db scholomance_dict.sqlite \
  --overwrite
```

Options:
- `--cmu_path PATH` — custom CMU dict location (default: `node_modules/cmudict/lib/cmu/cmudict.0.7a`)
- `--oewn_path PATH` — path to OEWN XML file (required)
- `--db PATH` — output SQLite path (default: `scholomance_dict.sqlite`)
- `--overwrite` — overwrite existing database

## Serve API (Development Only)

Run the lightweight Python API server for local development:
```bash
python scripts/serve_scholomance_dict.py --db scholomance_dict.sqlite --host 127.0.0.1 --port 8787
```
Point the app to it with `VITE_SCHOLOMANCE_DICT_API_URL=http://127.0.0.1:8787/api/lexicon` in `.env`.

For production, use Fastify `/api/lexicon/*` routes and set:
- `SCHOLOMANCE_DICT_PATH=/absolute/path/to/scholomance_dict.sqlite`
- `VITE_SCHOLOMANCE_DICT_API_URL=https://your-domain.example/api/lexicon`

## What the Build Does

1. **CMU Dict ingestion** — parses ~134k words with their ARPAbet phonemes, computes vowel families, codas, and rhyme keys. Populates `entry`, `entry_fts`, and `rhyme_index` tables.
2. **OEWN XML ingestion** — extracts synsets (definitions, examples), lemma-to-synset mappings, and semantic relations (hypernyms, hyponyms, etc.).
3. **Cross-referencing** — enriches CMU entries with WordNet definitions and POS tags by matching headwords to lemmas.
4. **Lexicon population** — copies all words into the `lexicon` table for word-validity checks.

## Schema Summary

- `entry`: word entries (headword, phonemes, POS, definitions via senses_json)
- `entry_fts`: FTS5 index for full-text search over headwords + definitions
- `rhyme_index`: pre-computed rhyme families and keys for fast rhyme lookup
- `wordnet_synset`: OEWN synsets (definitions, examples, lexname)
- `wordnet_lemma`: lemma-to-synset mapping (for synonyms, sense lookup)
- `wordnet_rel`: synset relationships (hypernym, hyponym, etc.)
- `lexicon`: word inventory for existence checks
- `meta`: build metadata + source info

## Query Examples

### Lookup by headword (exact)
```sql
SELECT headword, pos, pronunciation, senses_json
FROM entry;

WHERE headword_lower = lower('time');
```

### Rhyme lookup
```sql
SELECT word_lower FROM rhyme_index
WHERE rhyme_family = (SELECT rhyme_family FROM rhyme_index WHERE word_lower = 'time')
AND word_lower != 'time'
LIMIT 50;
```

### WordNet synonyms (via synset)
```sql
SELECT l2.lemma
FROM wordnet_lemma l1
JOIN wordnet_lemma l2 ON l1.synset_id = l2.synset_id
WHERE l1.lemma_lower = lower('run')
LIMIT 50;
```

### Full-text search
```sql
SELECT e.headword, e.pos
FROM entry_fts f
JOIN entry e ON e.id = f.rowid
WHERE entry_fts MATCH 'unit NEAR/3 time'
LIMIT 25;
```

## Lexical graph overlay (Analyze / Leximancy foundation)

```bash
npm run lexical-graph -- migrate --db scholomance_dict.sqlite --timestamp 2026-07-18T00:00:00.000Z
npm run lexical-graph -- all --db scholomance_dict.sqlite --timestamp 2026-07-18T00:00:00.000Z
```

Does not replace Oracle `entry` tables. The Docker image build runs `lexical-graph all` after the OEWN dict/corpus steps so production Leximancy has `lexical_entry_fts`, devices, and `lemma_form`. See `docs/superpowers/specs/2026-07-18-lexical-graph-foundation-design.md`.
