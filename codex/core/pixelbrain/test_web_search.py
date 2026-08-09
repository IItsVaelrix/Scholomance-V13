"""Tests for PB-WEB-SEARCH-v1."""
import hashlib
import json
import sys
import os
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from web_search import (
    SCHEMA_VERSION,
    checksum,
    freeze,
    verify,
    to_corpus_docs,
    _canonical_payload,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

FAKE_RESULTS = [
    {
        "title": "Phonological RAG Survey",
        "url": "https://example.com/phonological-rag",
        "snippet": "A survey of phonological methods in retrieval.",
    },
    {
        "title": "Morphological Decomposition for IR",
        "url": "https://example.com/morphological-ir",
        "snippet": "Morphological decomposition widens recall.",
    },
    {
        "title": "Syllable Structure in NLP",
        "url": "https://example.com/syllable-nlp",
        "snippet": "Syllable templates constrain tokenization.",
    },
]

FAKE_QUERY = "phonological retrieval augmented generation"


class TestChecksum(unittest.TestCase):
    def test_deterministic(self):
        """Same inputs → same checksum, always."""
        c1 = checksum(FAKE_QUERY, FAKE_RESULTS)
        c2 = checksum(FAKE_QUERY, FAKE_RESULTS)
        self.assertEqual(c1, c2)

    def test_format(self):
        c = checksum(FAKE_QUERY, FAKE_RESULTS)
        self.assertTrue(c.startswith("search1:"))
        self.assertEqual(len(c), len("search1:") + 16)

    def test_different_query_different_checksum(self):
        c1 = checksum(FAKE_QUERY, FAKE_RESULTS)
        c2 = checksum("different query", FAKE_RESULTS)
        self.assertNotEqual(c1, c2)

    def test_different_results_different_checksum(self):
        c1 = checksum(FAKE_QUERY, FAKE_RESULTS)
        c2 = checksum(FAKE_QUERY, FAKE_RESULTS[:2])
        self.assertNotEqual(c1, c2)

    def test_order_matters(self):
        c1 = checksum(FAKE_QUERY, FAKE_RESULTS)
        c2 = checksum(FAKE_QUERY, list(reversed(FAKE_RESULTS)))
        self.assertNotEqual(c1, c2)

    def test_100_iterations(self):
        """Determinism replay: 100 iterations, 1 unique checksum."""
        checksums = set()
        for _ in range(100):
            checksums.add(checksum(FAKE_QUERY, FAKE_RESULTS))
        self.assertEqual(len(checksums), 1)

    def test_page_text_excluded_from_checksum(self):
        """page_text is NOT part of the checksum (it's non-deterministic)."""
        r_with_page = [dict(r, page_text="some fetched content") for r in FAKE_RESULTS]
        c1 = checksum(FAKE_QUERY, FAKE_RESULTS)
        c2 = checksum(FAKE_QUERY, r_with_page)
        self.assertEqual(c1, c2)


class TestFreeze(unittest.TestCase):
    def test_schema(self):
        artifact = freeze(FAKE_QUERY, FAKE_RESULTS)
        self.assertEqual(artifact["schema"], SCHEMA_VERSION)

    def test_checksum_present(self):
        artifact = freeze(FAKE_QUERY, FAKE_RESULTS)
        self.assertIn("checksum", artifact)
        self.assertTrue(artifact["checksum"].startswith("search1:"))

    def test_result_count(self):
        artifact = freeze(FAKE_QUERY, FAKE_RESULTS)
        self.assertEqual(artifact["result_count"], 3)

    def test_frozen_at_present(self):
        artifact = freeze(FAKE_QUERY, FAKE_RESULTS)
        self.assertIn("frozen_at", artifact)

    def test_determinism_note(self):
        artifact = freeze(FAKE_QUERY, FAKE_RESULTS)
        self.assertIn("determinism_note", artifact)
        self.assertIn("frozen", artifact["determinism_note"].lower())

    def test_no_page_text_by_default(self):
        artifact = freeze(FAKE_QUERY, FAKE_RESULTS)
        for r in artifact["results"]:
            self.assertNotIn("page_text", r)

    def test_verify_passes(self):
        artifact = freeze(FAKE_QUERY, FAKE_RESULTS)
        self.assertTrue(verify(artifact))

    def test_verify_fails_on_tamper(self):
        artifact = freeze(FAKE_QUERY, FAKE_RESULTS)
        artifact["results"][0]["title"] = "TAMPERED"
        self.assertFalse(verify(artifact))

    def test_json_serializable(self):
        artifact = freeze(FAKE_QUERY, FAKE_RESULTS)
        s = json.dumps(artifact)
        restored = json.loads(s)
        self.assertTrue(verify(restored))


class TestCorpusInjection(unittest.TestCase):
    def test_doc_count(self):
        artifact = freeze(FAKE_QUERY, FAKE_RESULTS)
        docs = to_corpus_docs(artifact)
        self.assertEqual(len(docs), 3)

    def test_doc_structure(self):
        artifact = freeze(FAKE_QUERY, FAKE_RESULTS)
        docs = to_corpus_docs(artifact)
        for doc in docs:
            self.assertIn("text", doc)
            self.assertIn("source", doc)
            self.assertIn("tag", doc)
            self.assertEqual(doc["tag"], "web")
            self.assertTrue(doc["source"].startswith("web-search:search1:"))

    def test_doc_text_includes_title_and_snippet(self):
        artifact = freeze(FAKE_QUERY, FAKE_RESULTS)
        docs = to_corpus_docs(artifact)
        self.assertIn("Phonological RAG Survey", docs[0]["text"])
        self.assertIn("phonological methods", docs[0]["text"])

    def test_rejects_tampered_artifact(self):
        artifact = freeze(FAKE_QUERY, FAKE_RESULTS)
        artifact["results"][0]["url"] = "https://evil.com"
        with self.assertRaises(ValueError):
            to_corpus_docs(artifact)

    def test_page_text_included_when_present(self):
        results_with_pages = [
            dict(r, page_text="Full page content here " * 100)
            for r in FAKE_RESULTS
        ]
        artifact = freeze(FAKE_QUERY, results_with_pages, fetch_pages=False)
        # Manually add page_text (simulating fetch)
        artifact["results"][0]["page_text"] = "Extra linguistic content"
        docs = to_corpus_docs(artifact)
        self.assertIn("Extra linguistic content", docs[0]["text"])

    def test_error_pages_excluded(self):
        artifact = freeze(FAKE_QUERY, FAKE_RESULTS)
        artifact["results"][0]["page_text"] = "[FETCH ERROR: timeout]"
        docs = to_corpus_docs(artifact)
        self.assertNotIn("FETCH ERROR", docs[0]["text"])


class TestCanonicalPayload(unittest.TestCase):
    def test_excludes_timestamp(self):
        """Canonical payload must not include frozen_at."""
        payload = _canonical_payload(FAKE_QUERY, FAKE_RESULTS)
        self.assertNotIn("frozen_at", payload)

    def test_excludes_page_text(self):
        results_with_pages = [
            dict(r, page_text="some content") for r in FAKE_RESULTS
        ]
        p1 = _canonical_payload(FAKE_QUERY, FAKE_RESULTS)
        p2 = _canonical_payload(FAKE_QUERY, results_with_pages)
        self.assertEqual(p1, p2)

    def test_sorted_keys(self):
        payload = _canonical_payload(FAKE_QUERY, FAKE_RESULTS)
        parsed = json.loads(payload)
        keys = list(parsed.keys())
        self.assertEqual(keys, sorted(keys))


if __name__ == "__main__":
    unittest.main()
