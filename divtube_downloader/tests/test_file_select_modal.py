import unittest

from textual.app import App, ComposeResult
from textual.widgets import Static

from tui.ui.app import FileSelectScreen


class _Host(App):
    def compose(self) -> ComposeResult:
        yield Static("host")


class _FakeArchive:
    """Stand-in for ArchiveBridge — records queries, returns canned paths."""
    available = True

    def __init__(self):
        self.queries = []

    def search_paths(self, query, limit=200):
        self.queries.append(query)
        return [f"codex/core/{query}-{i}.js" for i in range(3)]


class TestFileSelectModal(unittest.IsolatedAsyncioTestCase):
    async def test_keypress_in_modal_does_not_crash(self):
        """Regression: pressing a key in the @-triggered find-file modal
        must not raise. `handle_key` is a reserved async hook on Textual's
        Widget; overriding it with a sync method made every keystroke crash
        with `TypeError: object NoneType can't be used in 'await' expression`.
        """
        app = _Host()
        async with app.run_test() as pilot:
            await app.push_screen(FileSelectScreen())
            await pilot.pause()
            # Typing into the filter is what users hit immediately.
            for ch in "app":
                await pilot.press(ch)
            await pilot.pause()
            # Escape should dismiss the modal without error.
            await pilot.press("escape")
            await pilot.pause()
        # If we got here without run_test re-raising, the bug is fixed.

    def test_picker_populates_when_git_lists_nothing(self):
        """The find-file list must not be empty just because the project is
        untracked — it falls back to a filesystem walk."""
        screen = FileSelectScreen()
        self.assertTrue(screen.files, "file picker came up empty")
        # Filesystem walk must respect ignore dirs.
        self.assertFalse(
            any(part in FileSelectScreen.IGNORE_DIRS
                for f in screen.files for part in f.split("/")),
            "ignored directories leaked into the picker",
        )


    def test_archive_mode_prefers_bridge_over_local_walk(self):
        """When an available archive is passed, the picker sources from it and
        does not eagerly walk the local filesystem."""
        screen = FileSelectScreen(_FakeArchive())
        self.assertIsNotNone(screen.archive)
        self.assertEqual(screen.files, [])

    def test_unavailable_archive_falls_back_to_local(self):
        class _Offline:
            available = False
        screen = FileSelectScreen(_Offline())
        self.assertIsNone(screen.archive)
        self.assertTrue(screen.files)

    async def test_archive_search_routes_to_bridge(self):
        arch = _FakeArchive()
        app = _Host()
        async with app.run_test() as pilot:
            await app.push_screen(FileSelectScreen(arch))
            await pilot.pause()
            for ch in "combat":
                await pilot.press(ch)
            ol = app.screen.query_one("#file-list")
            for _ in range(40):
                await pilot.pause()
                if ol.option_count:
                    break
            self.assertTrue(arch.queries, "archive was never queried")
            self.assertGreater(ol.option_count, 0, "archive results not shown")


if __name__ == "__main__":
    unittest.main()
