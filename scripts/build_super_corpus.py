#!/usr/bin/env python3
"""
build_super_corpus.py

Build a literary corpus for Scholomance in SQLite, under
SCHOL-GUTENBERG-SANITIZATION-v1.

Combines:
- DATA-SET 1.md (Ritual/Occult/Lyric data)
- Project Gutenberg (selected classics)
- WordNet Examples (from scholomance_dict.sqlite)

Output:
- scholomance_corpus.sqlite with FTS5, plus the exclusion ledger that says how
  the source text became these rows.

─── WHY THIS FILE WAS REWRITTEN ────────────────────────────────────────────

Failure Tribunal 2026-08-13, "The Gutenberg Silence". The previous version split
on every period and then dropped anything outside a character-length window with
a bare `continue`:

    sentences = re.split(r'(?<=[.!?])\\s+', text)      # Mrs. | Bennet.
    if len(s) > 500 or len(s) < 10: continue          # deletes Bennet.

The persisted corpus therefore contained records like

    Lady Lucas was ... a valuable neighbour to Mrs.

with the surname destroyed and nothing recording that it had ever existed. 1,587
such truncations were still resident in the shipped database. No database-only
algorithm can recover the missing word; only the immutable raw source can.

Three laws now govern this script, and all three are enforced rather than
described:

1. ONE SENTENCEHOOD AUTHORITY. Segmentation is not reimplemented here. It is
   delegated to `scripts/gutenberg-sanitize.mjs`, a thin CLI over the pure
   contract in `scripts/lib/gutenberg-corpus-sanitizer.mjs`. A Python copy would
   be a second place for `Mr. Bennet` to drift.
2. RAW EVIDENCE IS IMMUTABLE. Every download is written to `cache/gutenberg`
   before it is read, and its SHA-256 is stored with the source row, so the
   derivation can be replayed and audited.
3. EVERY EXCLUSION IS DATA. The contract returns a closed-vocabulary ledger and
   throws if `accepted + sentenceQuarantined != sentenceCandidates`. Those counts
   are written to the `sanitation` table: the denominator travels with the rows.

KNOWN LIMIT, STATED RATHER THAN PAPERED OVER: the contract normalizes physical
whitespace before segmenting, so it returns sentence text without character
offsets into the raw file. Replay is therefore reproducible (raw + contract
version -> identical rows) but a per-row source offset is not available. Adding
one is a contract change, not a caller change.
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import urllib.request

DEFAULT_DB_PATH = "scholomance_corpus.sqlite"
DEFAULT_DICT_PATH = "scholomance_dict.sqlite"
MANUAL_CORPUS_PATH = "docs/references/DATA-SET 1.md"
RAW_CACHE_DIR = "cache/gutenberg"
SANITIZER = "scripts/gutenberg-sanitize.mjs"
CONTRACT = "SCHOL-GUTENBERG-SANITIZATION-v1"

# Token bounds for corpus ingestion. Generous on purpose: this corpus feeds
# full-text search, not a combinatorial chart parser, so it has no termination
# ceiling to defend. Both bounds are counted when they exclude.
MIN_TOKENS = 1
MAX_TOKENS = 250

# The closed vocabulary. An unknown reason is a contract violation, not a row.
LAWFUL_REASONS = {
    "illustration", "asterism", "heading", "markup",
    "tooShort", "tooLong", "noCompound", "unreadable",
}

# Curated premium Gutenberg classics for rapid and rich local corpus building
GUTENBERG_SEEDS = [
    84,    # Frankenstein (Mary Shelley)
    1342,  # Pride and Prejudice (Jane Austen)
    11,    # Alice in Wonderland (Lewis Carroll)
    174,   # The Picture of Dorian Gray (Oscar Wilde)
    1661,  # The Adventures of Sherlock Holmes (Arthur Conan Doyle)
    345,   # Dracula (Bram Stoker)
    1533,  # Macbeth (William Shakespeare)
    2554,  # Crime and Punishment (Fyodor Dostoevsky)
    4300,  # Ulysses (James Joyce)
    1322,  # Leaves of Grass (Walt Whitman)
]


def init_db(db_path, overwrite=False):
    if os.path.exists(db_path) and overwrite:
        os.remove(db_path)

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")

    conn.executescript("""
        CREATE TABLE IF NOT EXISTS source (
            id INTEGER PRIMARY KEY,
            title TEXT,
            author TEXT,
            type TEXT,
            url TEXT,
            external_id TEXT UNIQUE,
            -- Provenance. `raw_sha256` and `raw_path` are what make the
            -- derivation replayable from immutable evidence.
            raw_path TEXT,
            raw_sha256 TEXT,
            contract TEXT
        );

        CREATE TABLE IF NOT EXISTS sentence (
            id INTEGER PRIMARY KEY,
            source_id INTEGER,
            ordinal INTEGER,
            text TEXT,
            FOREIGN KEY(source_id) REFERENCES source(id)
        );

        -- THE EXCLUSION LEDGER. Every record the source produced and this corpus
        -- does not contain, with the reason it was excluded. Without this table
        -- a small count cannot be told from a deleted population.
        CREATE TABLE IF NOT EXISTS sanitation (
            id INTEGER PRIMARY KEY,
            source_id INTEGER,
            reason TEXT NOT NULL,
            count INTEGER NOT NULL,
            FOREIGN KEY(source_id) REFERENCES source(id)
        );

        CREATE TABLE IF NOT EXISTS sanitation_counts (
            source_id INTEGER PRIMARY KEY,
            paragraphs INTEGER,
            sentence_candidates INTEGER,
            accepted INTEGER,
            sentence_quarantined INTEGER,
            structural_quarantined INTEGER,
            FOREIGN KEY(source_id) REFERENCES source(id)
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS sentence_fts USING fts5(
            text,
            content='sentence',
            content_rowid='id'
        );

        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    """)
    # Older databases predate the provenance columns; add them rather than
    # silently writing a corpus whose origin cannot be checked.
    existing = {row[1] for row in conn.execute("PRAGMA table_info(source)")}
    for column in ("raw_path", "raw_sha256", "contract"):
        if column not in existing:
            conn.execute(f"ALTER TABLE source ADD COLUMN {column} TEXT")
    if "ordinal" not in {row[1] for row in conn.execute("PRAGMA table_info(sentence)")}:
        conn.execute("ALTER TABLE sentence ADD COLUMN ordinal INTEGER")
    conn.commit()
    return conn


def sanitize(text, min_tokens=MIN_TOKENS, max_tokens=MAX_TOKENS):
    """Run the canonical contract over `text` and return its packet.

    Raises on a non-zero exit: the sanitizer fails loudly when its accounting
    invariant breaks, and a caller must never turn that into a partial corpus.
    """
    result = subprocess.run(
        ["node", SANITIZER, "--min-tokens", str(min_tokens), "--max-tokens", str(max_tokens)],
        input=text.encode("utf-8"),
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"sanitizer refused the text: {result.stderr.decode('utf-8', 'replace').strip()}"
        )
    packet = json.loads(result.stdout.decode("utf-8"))
    if packet.get("contract") != CONTRACT:
        raise RuntimeError(f"unexpected sanitation contract: {packet.get('contract')!r}")

    unknown = set(packet.get("quarantine", {})) - LAWFUL_REASONS
    if unknown:
        raise RuntimeError(f"unknown sanitation reason(s): {sorted(unknown)}")

    counts = packet["counts"]
    if counts["accepted"] + counts["sentenceQuarantined"] != counts["sentenceCandidates"]:
        raise RuntimeError("sanitation accounting invariant failed in the caller's view")
    return packet


def record_sanitation(conn, source_id, packet):
    """Write the ledger beside the rows it explains."""
    cur = conn.cursor()
    cur.execute("DELETE FROM sanitation WHERE source_id = ?", (source_id,))
    for reason, count in sorted(packet["quarantine"].items()):
        cur.execute(
            "INSERT INTO sanitation (source_id, reason, count) VALUES (?, ?, ?)",
            (source_id, reason, count),
        )
    counts = packet["counts"]
    cur.execute(
        "INSERT OR REPLACE INTO sanitation_counts "
        "(source_id, paragraphs, sentence_candidates, accepted, sentence_quarantined, structural_quarantined) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (
            source_id, counts["paragraphs"], counts["sentenceCandidates"],
            counts["accepted"], counts["sentenceQuarantined"], counts["structuralQuarantined"],
        ),
    )


def insert_segments(conn, source_id, segments):
    cur = conn.cursor()
    for ordinal, text in enumerate(segments):
        cur.execute(
            "INSERT INTO sentence (source_id, ordinal, text) VALUES (?, ?, ?)",
            (source_id, ordinal, text),
        )


def ingest_manual(conn, path):
    if not os.path.exists(path):
        print(f"Manual corpus not found: {path}")
        return

    print(f"Ingesting manual corpus: {path}")
    with open(path, "r", encoding="utf-8") as handle:
        content = handle.read()

    cur = conn.cursor()
    cur.execute(
        "INSERT OR IGNORE INTO source (title, type, external_id, contract) VALUES (?, ?, ?, ?)",
        ("DATA-SET 1", "manual", "manual-001", CONTRACT),
    )
    source_id = cur.execute(
        "SELECT id FROM source WHERE external_id = ?", ("manual-001",)
    ).fetchone()[0]

    # The same segmentation authority. The wrapper stripper finds no Gutenberg
    # markers here and returns the text unchanged, so this is safe on any prose.
    packet = sanitize(content)
    insert_segments(conn, source_id, packet["segments"])
    record_sanitation(conn, source_id, packet)
    conn.commit()
    print(f"  Inserted {len(packet['segments'])} sentences; quarantined {packet['quarantine']}")


def fetch_raw(bid):
    """Return (raw_text, path). Cached raw is immutable evidence, so reuse it."""
    os.makedirs(RAW_CACHE_DIR, exist_ok=True)
    path = os.path.join(RAW_CACHE_DIR, f"pg{bid}.txt")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8", errors="replace") as handle:
            return handle.read(), path

    url = f"https://www.gutenberg.org/cache/epub/{bid}/pg{bid}.txt"
    print(f"  Downloading {url}")
    request = urllib.request.Request(url, headers={"User-Agent": "Scholomance corpus builder"})
    with urllib.request.urlopen(request) as response:
        content = response.read().decode("utf-8", "replace")
    # Write raw BEFORE deriving anything from it.
    tmp = f"{path}.partial"
    with open(tmp, "w", encoding="utf-8") as handle:
        handle.write(content)
    shutil.move(tmp, path)
    return content, path


def ingest_gutenberg(conn, book_ids):
    cur = conn.cursor()
    for bid in book_ids:
        ext_id = f"gutenberg-{bid}"
        if cur.execute("SELECT id FROM source WHERE external_id = ?", (ext_id,)).fetchone():
            print(f"Skipping Gutenberg ID {bid} (already ingested)")
            continue

        print(f"Gutenberg ID {bid}")
        try:
            content, raw_path = fetch_raw(bid)
        except Exception as error:  # noqa: BLE001 - reported, never silent
            # `unreadable` is a lawful reason code. A book that could not be read
            # is recorded as such rather than vanishing from the run.
            print(f"  UNREADABLE {bid}: {error}")
            cur.execute(
                "INSERT OR IGNORE INTO source (title, type, external_id, contract) VALUES (?, ?, ?, ?)",
                (f"Gutenberg {bid}", "gutenberg", ext_id, CONTRACT),
            )
            source_id = cur.execute(
                "SELECT id FROM source WHERE external_id = ?", (ext_id,)
            ).fetchone()[0]
            cur.execute(
                "INSERT INTO sanitation (source_id, reason, count) VALUES (?, ?, ?)",
                (source_id, "unreadable", 1),
            )
            conn.commit()
            continue

        title_match = re.search(r"Title:\s*(.*)", content)
        author_match = re.search(r"Author:\s*(.*)", content)
        title = title_match.group(1).strip() if title_match else f"Gutenberg {bid}"
        author = author_match.group(1).strip() if author_match else "Unknown"
        digest = hashlib.sha256(content.encode("utf-8")).hexdigest()

        cur.execute(
            "INSERT INTO source (title, author, type, url, external_id, raw_path, raw_sha256, contract) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                title, author, "gutenberg",
                f"https://www.gutenberg.org/cache/epub/{bid}/pg{bid}.txt",
                ext_id, raw_path, digest, CONTRACT,
            ),
        )
        source_id = cur.lastrowid

        packet = sanitize(content)
        insert_segments(conn, source_id, packet["segments"])
        record_sanitation(conn, source_id, packet)
        conn.commit()
        counts = packet["counts"]
        print(
            f"  {counts['accepted']} sentences from {counts['sentenceCandidates']} candidates"
            f" ({counts['paragraphs']} paragraphs); quarantined {packet['quarantine']}"
        )


def populate_fts(conn):
    print("Populating FTS index...")
    conn.execute("INSERT INTO sentence_fts(sentence_fts) VALUES('rebuild')")
    conn.commit()


def ingest_wordnet_examples(conn, dict_path):
    if not os.path.exists(dict_path):
        print(f"Dictionary not found: {dict_path}. Skipping WordNet examples.")
        return

    print(f"Ingesting WordNet examples from {dict_path}")
    dict_conn = sqlite3.connect(f"file:{dict_path}?mode=ro", uri=True)
    examples = dict_conn.execute(
        "SELECT examples_json FROM wordnet_synset WHERE examples_json != '[]'"
    ).fetchall()
    dict_conn.close()

    cur = conn.cursor()
    cur.execute(
        "INSERT OR IGNORE INTO source (title, type, external_id, contract) VALUES (?, ?, ?, ?)",
        ("WordNet Examples", "dictionary", "wordnet-examples", "gold-examples"),
    )
    source_id = cur.execute(
        "SELECT id FROM source WHERE external_id = ?", ("wordnet-examples",)
    ).fetchone()[0]

    # WordNet examples arrive one sentence per record. They are gold boundaries
    # and must not be routed through an off-gold sanitizer (Tribunal rule 8).
    count = 0
    for row in examples:
        for example in json.loads(row[0]):
            cur.execute(
                "INSERT INTO sentence (source_id, ordinal, text) VALUES (?, ?, ?)",
                (source_id, count, example),
            )
            count += 1

    conn.commit()
    print(f"  Inserted {count} sentences from WordNet.")


def audit(db_path):
    """Report the corpus against the laws, without changing it."""
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    sentences = conn.execute("SELECT COUNT(*) FROM sentence").fetchone()[0]
    truncated = conn.execute(
        "SELECT COUNT(*) FROM sentence WHERE "
        "text LIKE '% Mr.' OR text LIKE '% Mrs.' OR text LIKE '% Dr.' "
        "OR text LIKE '% St.' OR text LIKE '% Messrs.'"
    ).fetchone()[0]
    has_ledger = conn.execute(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sanitation'"
    ).fetchone()[0]
    ledger = conn.execute("SELECT reason, SUM(count) FROM sanitation GROUP BY reason").fetchall() if has_ledger else []
    unprovenanced = conn.execute(
        "SELECT COUNT(*) FROM source WHERE type='gutenberg' AND (raw_sha256 IS NULL OR raw_sha256='')"
    ).fetchone()[0] if has_ledger else None
    conn.close()

    print(f"sentences                     {sentences}")
    print(f"records truncated at a title  {truncated}   <- must be 0")
    print(f"gutenberg sources w/o sha256  {unprovenanced}   <- must be 0")
    print(f"exclusion ledger              {dict(ledger) if ledger else '(none)'}")
    return truncated == 0 and not unprovenanced


def main():
    parser = argparse.ArgumentParser(description="Build Scholomance Super Corpus")
    parser.add_argument("--db", default=DEFAULT_DB_PATH, help="Path to output SQLite")
    parser.add_argument("--dict", default=DEFAULT_DICT_PATH, help="Path to input dictionary")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing DB")
    parser.add_argument("--seeds", type=int, nargs="+", help="Gutenberg IDs to ingest")
    parser.add_argument("--audit", action="store_true", help="Report on an existing DB and exit")

    args = parser.parse_args()

    db_path = args.db
    # On Render, we might want to use /var/data/
    if os.path.exists("/var/data") and not os.path.isabs(db_path):
        db_path = os.path.join("/var/data", db_path)

    if args.audit:
        raise SystemExit(0 if audit(db_path) else 1)

    conn = init_db(db_path, args.overwrite)

    ingest_manual(conn, MANUAL_CORPUS_PATH)
    ingest_wordnet_examples(conn, args.dict)
    ingest_gutenberg(conn, args.seeds if args.seeds else GUTENBERG_SEEDS)
    populate_fts(conn)

    conn.close()
    print(f"Super Corpus built at {db_path}")
    audit(db_path)


if __name__ == "__main__":
    main()
