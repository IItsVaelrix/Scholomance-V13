"""Canonical YouTube URL policy for DivTube.

Why this module exists
----------------------
The rule "is this a YouTube URL we will hand to a downloader" was encoded
three times: in ``tui/remote/protocol.py``, in
``tui/services/remote_download_queue.py`` (as a second, independent ``_HOSTS``
set), and in the Java companion's ``YouTubeUrlValidator``. The three had
drifted apart in *opposite* directions, which is the bad kind of drift -- the
remote protocol accepted ``music.youtube.com`` and ``/shorts/`` links that the
desktop companion refused, while the companion accepted ``http://`` links and
arbitrary path shapes that the protocol did not. The same video pasted into
two entry points got two answers.

This module is the single Python source of truth. ``protocol.py`` and
``remote_download_queue.py`` both delegate here, and both tests read the same
``tests/youtube_url_policy.json`` table that
``YouTubeUrlConformanceTest`` (Java) reads, so a change to one language fails
the other suite instead of silently diverging.

Scheme is the one deliberate asymmetry, and it is a parameter rather than a
fork: the desktop companion accepts ``http``, while the remote protocol passes
``require_https=True`` because those URLs arrive from a paired device over the
network. See ``_intentional_difference`` in the JSON table.

Security notes
--------------
Decisions are made on the parsed authority, never by substring search. Three
checks specifically exist because the obvious implementation gets them wrong:

* **credentials** -- ``https://youtube.com@evil.example/watch?v=x`` looks like
  a YouTube URL and is not one; the authority is ``evil.example``.
* **port** -- ``parsed.hostname`` excludes the port, so
  ``https://youtube.com:22/watch?v=x`` passes a host allowlist while sending
  the request to an attacker-chosen endpoint. Only 80/443 are honoured.
* **control characters** -- checked before any stripping. ``str.strip()``
  removes whitespace, which is fine, but the historical ``.strip()``-then-test
  order is a trap that Java's ``trim()`` falls straight into because it removes
  everything at or below U+0020, NUL included.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urlparse

__all__ = ["UrlDecision", "describe", "evaluate", "is_url_like", "is_valid"]

#: Real YouTube properties that host a single playable video.
ALLOWED_HOSTS: frozenset[str] = frozenset({
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
    "www.youtu.be",
})

_SHORT_HOSTS = frozenset({"youtu.be", "www.youtu.be"})

#: An explicit non-default port is a redirect to wherever the caller likes.
ALLOWED_PORTS: frozenset[int | None] = frozenset({None, 80, 443})

_WATCH_PATHS = frozenset({"/watch"})
_ID_SEGMENT_PATHS = frozenset({"/shorts", "/live", "/embed", "/v"})

#: Character set only -- no length minimum. The property that matters is that an
#: id cannot smuggle separators or syntax into the downloader argument; a length
#: rule would be a guess about someone else's identifier format (real ids are 11
#: characters, but short synthetic ids in tests are legitimate to accept).
_VIDEO_ID = re.compile(r"^[A-Za-z0-9_\-]+$")
_HAS_SCHEME = re.compile(r"^[a-z][a-z0-9+.\-]*://", re.IGNORECASE)
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


@dataclass(frozen=True)
class UrlDecision:
    """The one evaluation both :func:`is_valid` and :func:`describe` read from,
    so an explanation can never disagree with the boolean a caller branched on."""

    ok: bool
    reason: str
    detail: str = ""

    def __str__(self) -> str:  # pragma: no cover - convenience for log lines
        return self.reason if not self.detail else f"{self.reason}: {_sanitize(self.detail)}"


def is_valid(url: object, *, require_https: bool = False) -> bool:
    """Return True when *url* identifies a YouTube video we will download."""
    return evaluate(url, require_https=require_https).ok


def describe(url: object, *, require_https: bool = False) -> str:
    """A short, safe, user-presentable reason for a refusal."""
    return str(evaluate(url, require_https=require_https))


def is_url_like(text: object) -> bool:
    """True when *text* was meant to be a YouTube link rather than prose.

    This is an **intent** test for the cockpit input box, deliberately weaker
    than :func:`is_valid`: a pasted ``youtube.com/playlist?list=...`` should
    still route to the analyser so the user gets a specific "unsupported link"
    answer, instead of having their URL quietly submitted as a prompt. Deciding
    intent here and permissibility in :func:`evaluate` keeps those two questions
    from being conflated.

    What it does fix is the substring form it replaces. ``"youtube.com" in val``
    also matched sentences like "explain youtube.com's quota model", so ordinary
    prompts were intercepted and sent to the downloader. Requiring the whole
    input to be a single host-bearing token, and comparing the parsed authority
    rather than scanning for a fragment, removes that class of misfire.
    """
    if not isinstance(text, str):
        return False
    stripped = text.strip()
    if not stripped or any(char.isspace() for char in stripped):
        # Prose containing a domain is still prose.
        return False
    candidate = stripped if _HAS_SCHEME.match(stripped) else "https://" + stripped
    try:
        host = urlparse(candidate).hostname
    except ValueError:
        return False
    return bool(host) and host.lower() in ALLOWED_HOSTS


def evaluate(url: object, *, require_https: bool = False) -> UrlDecision:
    if not isinstance(url, str):
        return _no("no link was provided")
    if _CONTROL.search(url):
        # Before any stripping -- see the module docstring.
        return _no("the link contains non-printing characters")

    candidate = url.strip()
    if not candidate:
        return _no("no link was provided")
    if not _HAS_SCHEME.match(candidate):
        # Tolerate a bare "youtube.com/watch?v=x" the way the desktop entry
        # point always has; scheme is still checked on the parsed result below.
        candidate = "https://" + candidate

    try:
        parsed = urlparse(candidate)
    except ValueError:
        return _no("the link could not be parsed as a URL")

    schemes = ("https",) if require_https else ("http", "https")
    if parsed.scheme not in schemes:
        return _no("only https links are supported" if require_https
                   else "only http and https links are supported", parsed.scheme)

    if parsed.username is not None or parsed.password is not None:
        return _no("the link must not carry credentials", parsed.username or "")

    try:
        port = parsed.port
    except ValueError:
        return _no("the link specifies an unsupported port")

    host = (parsed.hostname or "").lower()
    if not host:
        return _no("the link has no host component")
    if host not in ALLOWED_HOSTS:
        return _no("the link does not point at a YouTube host", host)
    if port not in ALLOWED_PORTS:
        return _no("the link specifies an unsupported port", str(port))

    path = parsed.path or ""

    if host in _SHORT_HOSTS:
        video_id = _first_segment(path)
        return _yes() if _VIDEO_ID.match(video_id) else _no(
            "the link does not identify a video", path)

    if path in _WATCH_PATHS:
        value = _query_value(parsed.query, "v")
        return _yes() if value and _VIDEO_ID.match(value) else _no(
            "the link does not identify a video", "watch")

    head = "/" + _first_segment(path)
    if head in _ID_SEGMENT_PATHS:
        remainder = path[len(head) + 1:]
        video_id = remainder.split("/")[0] if remainder else ""
        return _yes() if _VIDEO_ID.match(video_id) else _no(
            "the link does not identify a video", path)

    return _no("only watch, shorts, live and embed links are supported",
               path or "(none)")


def _yes() -> UrlDecision:
    return UrlDecision(True, "supported YouTube link")


def _no(reason: str, detail: str = "") -> UrlDecision:
    return UrlDecision(False, reason, detail)


def _first_segment(path: str) -> str:
    stripped = path[1:] if path.startswith("/") else path
    return stripped.split("/")[0]


def _query_value(query: str, wanted: str) -> str | None:
    """Exact key match only -- a substring test would accept ``?preview=v=abc``."""
    for pair in (query or "").split("&"):
        if not pair:
            continue
        key, sep, value = pair.partition("=")
        if key == wanted:
            return value if sep else ""
    return None


def _sanitize(raw: str) -> str:
    collapsed = _CONTROL.sub("?", raw)
    return collapsed if len(collapsed) <= 60 else collapsed[:60] + "..."
