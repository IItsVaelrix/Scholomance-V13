"""Regression: raw Rich-markup bombs in user/chat text must never crash the TUI.

Three canonical crasher strings previously raised rich.errors.MarkupError on the
main thread and dropped the app into the rescue shell before the message reached
the agent:

    * bare closer              "[/]"
    * mismatched open/close    "[bold]hi[/italic]"
    * unterminated tag         "[red]unterminated"

Two defence layers exist in divtube_downloader/tui/ui/app.py:

    1. Source escape (app.py:2123) - user input is passed through
       rich.markup.escape BEFORE being interpolated into the styled echo line.
    2. Sink catch (app.py:2018-2026) - _write_to_chat wraps chat.write in
       try/except MarkupError and re-writes the text with markup neutralised.

These tests exercise both layers without mounting the full Textual app.
"""

import os
import sys

import pytest
from rich.errors import MarkupError
from rich.markup import escape as escape_markup
from rich.text import Text

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "divtube_downloader"))

from tui.ui.app import DivTubeAgentApp  # noqa: E402

CHAT_ID = "chat-log"


class FakeChat:
    """Mimics the Rich-markup parsing semantics of the real chat widget.

    write(msg) parses markup exactly like RichLog.write does for str payloads:
    malformed markup raises MarkupError; a Rich renderable passes through.
    """

    id = CHAT_ID

    def __init__(self):
        self.written = []

    def write(self, msg):
        if isinstance(msg, str):
            Text.from_markup(msg)  # raises MarkupError on malformed markup
        self.written.append(msg)


def make_app():
    """Instantiate without Textual's __init__; _write_to_chat needs no reactives."""
    app = DivTubeAgentApp.__new__(DivTubeAgentApp)
    app._chat_text_mirror = {}  # normally created in __init__ (app.py:489)
    return app


# -- Layer 2: sink catch in _write_to_chat ----------------------------------

@pytest.mark.parametrize("bomb", [
    "[/]",                      # bare closer
    "[bold]hi[/italic]",        # mismatched open/close
    "[/bold]",                  # stray named closer
    "[b]x[/]extra[/]",          # extra trailing closer
])
def test_write_to_chat_never_raises(bomb):
    app = make_app()
    chat = FakeChat()
    app._write_to_chat(chat, bomb)  # must not raise
    assert len(chat.written) == 1
    # malformed markup was neutralised: round-trips as literal text
    assert Text.from_markup(chat.written[0]).plain == bomb


def test_write_to_chat_passes_well_formed_markup_through():
    app = make_app()
    chat = FakeChat()
    app._write_to_chat(chat, "[i]italic[/]")
    assert len(chat.written) == 1
    assert chat.written[0] == "[i]italic[/]"  # clean markup untouched


def test_write_to_chat_keeps_plain_text_mirror():
    app = make_app()
    chat = FakeChat()
    app._write_to_chat(chat, "[/]")
    # The /copy mirror must hold the literal bomb string, not escaped markup.
    assert app._chat_text_mirror[CHAT_ID][-1] == "[/]"


def test_unclosed_opener_is_valid_markup_relying_on_source_escape():
    """'[red]unterminated' does NOT raise MarkupError.

    Rich tolerates an open tag with no closer (and unknown tag names), so the
    sink catch (Layer 2) never fires for these. Their literal display is
    guaranteed only by the source escape (Layer 1) applied to user input.
    """
    # Sanity: it parses cleanly as markup (style consumed, text kept).
    assert Text.from_markup("[red]unterminated").plain == "unterminated"
    assert Text.from_markup("[notarealstyle9]y[/]").plain == "y"
    # Layer 1 escape makes it display literally in the echo line.
    line = f"[bold #FFFFFF]{escape_markup('[red]unterminated')}[/]"
    assert "[red]unterminated" in Text.from_markup(line).plain


# -- Layer 1: source escape before interpolation -----------------------------

@pytest.mark.parametrize("bomb", [
    "[/]",
    "[bold]hi[/italic]",
    "[red]unterminated",
    "[[literal]] brackets",
])
def test_echo_line_parses_after_escape(bomb):
    # Exact format used at app.py:2123.
    line = f"\n[bold #FFD700]\u25b8[/] [bold #FFFFFF]{escape_markup(bomb)}[/]"
    parsed = Text.from_markup(line)  # must not raise
    assert bomb in parsed.plain       # user text survives as literal chars


def test_double_escape_is_display_safe():
    once = escape_markup("[/]")
    twice = escape_markup(once)
    assert Text.from_markup(once).plain == "[/]"
    # Double-escaping degrades display but must still be parse-safe.
    Text.from_markup(f"\n[bold]{twice}[/]")  # no exception


def test_raw_bomb_would_have_raised():
    """Sanity: without the escape, the bare closer genuinely is a MarkupError.

    Guards against the escape layer silently becoming a no-op.
    """
    with pytest.raises(MarkupError):
        Text.from_markup("[/]")
