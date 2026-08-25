import unittest
from tui.core.command_parser import CommandRegistry

class MockUI:
    def __init__(self):
        self.logs = []
    def log_msg(self, msg):
        self.logs.append(msg)

class TestTUI(unittest.TestCase):
    def test_command_parser(self):
        reg = CommandRegistry()
        ui = MockUI()
        reg.register("/test", lambda u, args: u.log_msg("tested"), "desc", "usage")
        reg.parse_and_execute("/test args", ui)
        self.assertIn("tested", ui.logs)

    def test_bare_slash_opens_help_not_agent(self):
        """A bare '/' must open the command palette, never reach the agent."""
        reg = CommandRegistry()
        ui = MockUI()
        calls = []
        reg.register("/help", lambda u, args: calls.append("help"), "Show commands", "/help")
        reg.register("/prompt", lambda u, args: calls.append(("prompt", args)), "Chat", "/prompt <m>")
        reg.parse_and_execute("/", ui)
        self.assertIn("help", calls)
        self.assertNotIn(("prompt", ["/"]), calls)

    def test_bare_slash_without_help_lists_commands(self):
        reg = CommandRegistry()
        ui = MockUI()
        reg.register("/alpha", lambda u, args: None, "d", "u")
        reg.register("/beta", lambda u, args: None, "d", "u")
        reg.parse_and_execute("/", ui)
        self.assertTrue(any("/alpha" in m and "/beta" in m for m in ui.logs), ui.logs)

if __name__ == '__main__':
    unittest.main()
