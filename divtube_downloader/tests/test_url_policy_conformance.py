"""Asserts the Python cockpit matches the canonical, language-neutral URL
policy table that the Java companion is tested against.

This is the anti-drift control. ``tui/remote/protocol.py`` and the Java
``YouTubeUrlValidator`` used to carry independent allowlists that had drifted
apart in opposite directions, so the same link could be downloadable from the
desktop and refused by the phone (or the reverse). Both suites now read
``youtube_url_policy.json`` from this directory; editing the policy in one
language without the other fails here.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tui.remote.url_policy import describe, evaluate, is_url_like, is_valid

FIXTURE = Path(__file__).with_name("youtube_url_policy.json")


def _cases() -> list[dict]:
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    cases = data["cases"]
    assert len(cases) >= 40, f"policy table looks truncated: {len(cases)} cases"
    return cases


def _case_id(case: dict) -> str:
    return repr(case["url"])[:60]


CASES = _cases()


def test_policy_table_is_shared_with_the_java_suite() -> None:
    """Both suites must read one file, not two copies of it."""
    java_side = FIXTURE.parent.parent / "src/test/java/divtube/validation/YouTubeUrlConformanceTest.java"
    assert java_side.is_file(), f"Java conformance test vanished: {java_side}"
    text = java_side.read_text(encoding="utf-8")
    assert "tests/youtube_url_policy.json" in text, (
        "the Java test no longer reads the shared table; the two policies can drift again"
    )


@pytest.mark.parametrize("case", CASES, ids=_case_id)
def test_matches_canonical_policy(case: dict) -> None:
    expected = case["expect"]
    assert expected in {"accept", "reject"}, f"bad expectation {expected!r}"
    assert is_valid(case["url"], require_https=True) is (expected == "accept"), (
        f'{case["url"]!r}: policy table says {expected}'
        + (f" ({case['note']})" if case.get("note") else "")
    )


@pytest.mark.parametrize("case", CASES, ids=_case_id)
def test_every_rejection_explains_itself(case: dict) -> None:
    if case["expect"] == "accept":
        return
    reason = describe(case["url"], require_https=True)
    assert reason and reason != "supported YouTube link"
    assert _CONTROL_FREE(reason), f"describe() leaked a control character: {reason!r}"


def _CONTROL_FREE(text: str) -> bool:
    return all(ord(char) >= 0x20 and ord(char) != 0x7F for char in text)


def test_scheme_is_an_intentional_per_entry_point_difference() -> None:
    """The table uses https throughout so both languages can share it. This
    pins the one place they legitimately differ: the desktop entry point accepts
    http, the remote protocol does not."""
    plain = "http://www.youtube.com/watch?v=dQw4w9WgXcQ"
    assert is_valid(plain) is True, "desktop companion accepts http"
    assert is_valid(plain, require_https=True) is False, "remote protocol requires https"


def test_bare_host_without_scheme_is_accepted_like_the_desktop_expects() -> None:
    assert is_valid("youtube.com/watch?v=dQw4w9WgXcQ") is True


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        # Genuine paste-through
        ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", True),
        ("youtube.com/watch?v=dQw4w9WgXcQ", True),
        ("https://youtu.be/abc", True),
        # A playlist is not downloadable, but it is unmistakably a link: it must
        # still route to the analyser so the user is told why, rather than being
        # quietly resubmitted as a prompt. Intent is weaker than permission.
        ("https://www.youtube.com/playlist?list=PL123", True),
        ("https://www.youtube.com/feed/subscriptions", True),
        # The bug the old `"youtube.com" in val` check had: prose that happens to
        # mention the domain is a prompt, not a download request.
        ("explain youtube.com's quota model", False),
        ("what does youtu.be rate limiting look like?", False),
        ("summarise this: https://example.com/blog/youtube.com", False),
        # Not a YouTube authority
        ("https://evil.example/?x=/youtube.com/watch?v=a", False),
        ("https://youtube.com.attacker.tld/watch?v=x", False),
        ("https://youtube.com@evil.example/watch?v=x", False),
        # Degenerate input must not raise
        ("", False),
        ("   ", False),
        ("https://", False),
        ("nonsense", False),
        (None, False),
        (42, False),
    ],
)
def test_intent_detection_does_not_hijack_prose(text: object, expected: bool) -> None:
    assert is_url_like(text) is expected, text


def test_evaluate_and_is_valid_cannot_disagree() -> None:
    for case in CASES:
        decision = evaluate(case["url"], require_https=True)
        assert decision.ok is (case["expect"] == "accept")
        # A refusal must always carry a reason, an acceptance never pretends.
        assert bool(decision.reason) is True
