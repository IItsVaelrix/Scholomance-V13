"""ToolUsageHistory: real usage ledger for the adaptive tool recommender.

Own small sqlite file — mirrors MemoryService/divtube_memory.db's pattern
of a Python-owned CREATE TABLE IF NOT EXISTS, deliberately NOT
scholomance_collab.sqlite: episode_store.py's docstring makes schema
authority there explicit ("Python should [never] invent [a table]"), and
that ledger's job (recall/staleness caching keyed on tool args) is unrelated
to this one's (what tool actually got used for what kind of request).

Similarity reuses tool_recommender's n-gram embedding + cosine similarity —
pure Python, no I/O, no second metric to maintain — which is what keeps a
lookup here fast enough to run synchronously once per user message. The
whole point of building this instead of routing through the substrate is
that substrate queries measure ~4s cold; this is bounded to MAX_ROWS entries
and each comparison is microseconds.
"""
import json
import sqlite3
import time
from collections import Counter

from tui.services.tool_recommender import _cosine_similarity, _ngram_embedding, _tokenize_task

DEFAULT_MAX_ROWS = 500
DEFAULT_SIMILARITY_THRESHOLD = 0.15


def _task_similarity(a, b):
    """Task-to-task similarity, NOT the same job as tool_recommender's raw
    n-gram cosine. Measured (see gate-reactivation session notes): character
    trigram cosine alone scored an unrelated pair ('run the tests...' vs
    'audit this file against Vaelrix Law') at 0.427 — HIGHER than a genuinely
    similar pair ('run the tests...' vs 'run the test suite') at 0.405.
    English sentences share too many incidental substrings for raw n-grams
    to discriminate topic at this granularity.

    Word-token Jaccard (stopword-filtered, via the same _tokenize_task used
    for task->tool matching) discriminates topic correctly but is brittle to
    morphology (plural/singular, tense) since it needs an exact string
    match per token. Blending the two — Jaccard dominant, n-gram as a minor
    assist for near-miss wording — separates the measured similar/dissimilar
    pairs with a comfortable margin at threshold 0.15.
    """
    tokens_a, tokens_b = set(_tokenize_task(a)), set(_tokenize_task(b))
    jaccard = 0.0
    if tokens_a and tokens_b:
        jaccard = len(tokens_a & tokens_b) / len(tokens_a | tokens_b)
    ngram = _cosine_similarity(_ngram_embedding(a), _ngram_embedding(b))
    return 0.7 * jaccard + 0.3 * ngram


class ToolUsageHistory:
    def __init__(self, db_path="tool_usage_history.db", max_rows=DEFAULT_MAX_ROWS):
        self.db_path = db_path
        self.max_rows = max_rows
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS tool_usage (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_text  TEXT NOT NULL,
                    tools_used TEXT NOT NULL,
                    created_at REAL NOT NULL
                )
                """
            )
            conn.commit()

    def record(self, task_text, tools_used):
        """Log one completed turn's real tool usage. No-ops on empty input —
        a turn with no task text or no tools called teaches nothing."""
        if not task_text or not tools_used:
            return
        deduped = sorted(set(tools_used))
        if not deduped:
            return
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT INTO tool_usage (task_text, tools_used, created_at) VALUES (?, ?, ?)",
                (task_text, json.dumps(deduped), time.time()),
            )
            conn.commit()
            self._prune(conn)

    def _prune(self, conn):
        conn.execute(
            """
            DELETE FROM tool_usage WHERE id NOT IN (
                SELECT id FROM tool_usage ORDER BY id DESC LIMIT ?
            )
            """,
            (self.max_rows,),
        )
        conn.commit()

    def similar_task_tool_counts(self, task_text, threshold=DEFAULT_SIMILARITY_THRESHOLD):
        """Counter of tools used on past tasks similar to task_text, weighted
        by similarity (a near-identical past task counts for more than a
        borderline one). Scans up to max_rows entries — bounded and fast
        enough for the synchronous per-message selection path."""
        counts = Counter()
        if not task_text:
            return counts
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(
                "SELECT task_text, tools_used FROM tool_usage ORDER BY id DESC"
            ).fetchall()
        for past_text, tools_json in rows:
            similarity = _task_similarity(task_text, past_text)
            if similarity < threshold:
                continue
            try:
                tools = json.loads(tools_json)
            except (TypeError, ValueError):
                continue
            for tool_name in tools:
                counts[tool_name] += similarity
        return counts
