#!/usr/bin/env python3
"""Additive OEWN antonym ingest.

See docs/superpowers/specs/2026-07-18-oewn-antonym-ingest-design.md.
"""

import argparse
from datetime import datetime
import os
import sqlite3
import sys
import urllib.request

from oewn_antonym_project import (
    PINNED_OEWN_URLS,
    apply_oewn_antonyms,
    file_sha256,
    parse_oewn_antonyms,
    project_antonyms,
)


def iso8601_timestamp(value: str) -> str:
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise argparse.ArgumentTypeError(
            "timestamp must be an ISO-8601 timestamp"
        ) from error
    return value


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default="scholomance_dict.sqlite")
    parser.add_argument("--oewn_path", required=True)
    parser.add_argument("--expected-release", required=True)
    parser.add_argument("--timestamp", required=True, type=iso8601_timestamp)
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--max-unresolved-ratio", type=float, default=0.02)
    return parser.parse_args()


def ensure_oewn_file(path: str, expected_release: str, download: bool) -> None:
    if os.path.exists(path):
        return
    if not download:
        raise SystemExit(f"ERROR: OEWN not found at {path}")

    url = PINNED_OEWN_URLS.get(expected_release)
    if not url:
        raise SystemExit(f"ERROR: no pinned URL for release {expected_release}")
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    urllib.request.urlretrieve(url, path)


def main() -> None:
    args = parse_args()
    ensure_oewn_file(args.oewn_path, args.expected_release, args.download)

    source_sha256 = file_sha256(args.oewn_path)
    parsed = parse_oewn_antonyms(args.oewn_path)
    if parsed.release != args.expected_release:
        raise SystemExit(
            f"ERROR: OEWN release {parsed.release!r} != expected {args.expected_release!r}"
        )

    source_url = PINNED_OEWN_URLS.get(
        args.expected_release,
        f"file://{os.path.abspath(args.oewn_path)}",
    )
    conn = sqlite3.connect(args.db)
    try:
        existing_synsets = {
            row[0] for row in conn.execute("SELECT id FROM wordnet_synset")
        }
        projection = project_antonyms(parsed, existing_synsets)
        result = apply_oewn_antonyms(
            conn,
            projection,
            release=parsed.release,
            source_url=source_url,
            source_sha256=source_sha256,
            timestamp=args.timestamp,
            max_unresolved_ratio=args.max_unresolved_ratio,
        )
        print(
            f"inserted={result.inserted_count} "
            f"skipped_existing={result.skipped_existing_count} "
            f"asserted={projection.asserted_count} "
            f"unresolved_ratio={projection.unresolved_ratio}"
        )
    finally:
        conn.close()


if __name__ == "__main__":
    main()
