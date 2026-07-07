"""Regression: a chat message containing Rich markup must never crash the app.

A user message like ``how do I close a tag like [/] in rich?`` was being
interpolated raw into a Rich-markup string in ``on_command_submitted`` and
rendered by the chat ``RichLog``. The stray ``[/]`` closing tag raised
``rich.errors.MarkupError`` on the main thread, which Textual surfaces as an
unhandled exception — the whole TUI exits and ``run.sh`` drops to its rescue
shell. See app.py:on_command_submitted / log_msg.
"""

import asyncio
import unittest

from tui.ui.app import DivTubeAgentApp
from tui.ui.widgets.command_area import CommandSubmitted

# Messages a user could plausibly type that contain markup-breaking sequences.
CRASHERS = [
    "how do I close a tag like [/] in rich?",
    "mismatched [bold]hi[/italic] tags",
    "just a bare [/] here",
]


class TestMarkupCrash(unittest.TestCase):
    def test_markup_message_does_not_crash_app(self):
        async def run():
            app = DivTubeAgentApp()
            async with app.run_test(size=(120, 40)) as pilot:
                await pilot.pause(0.2)
                for msg in CRASHERS:
                    app.post_message(CommandSubmitted(msg))
                    await pilot.pause(0.2)
                # If any message had broken markup rendering, run_test would
                # re-raise the stored exception on exit and fail this test.

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
