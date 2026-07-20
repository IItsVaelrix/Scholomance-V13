import unittest

from tui.ui.widgets.test_run_panel import format_progress_bar, format_test_row


class TestTestRunFormatting(unittest.TestCase):
    def test_format_test_row_pass_fail_skip(self):
        self.assertIn("✓", format_test_row("alpha", "pass"))
        self.assertIn("✗", format_test_row("beta", "fail"))
        self.assertIn("○", format_test_row("gamma", "skip"))
        self.assertIn("…", format_test_row("delta", "pending"))

    def test_format_progress_bar_bounds(self):
        self.assertIn("0%", format_progress_bar(0))
        self.assertIn("100%", format_progress_bar(1))
        self.assertIn("50%", format_progress_bar(0.5))

    def test_name_truncation(self):
        long = "x" * 40
        row = format_test_row(long, "pass", max_name=20)
        # Markup prefix + truncated label ending in …
        self.assertIn("…", row)
        self.assertLess(len(row), len(long) + 20)


if __name__ == "__main__":
    unittest.main()
