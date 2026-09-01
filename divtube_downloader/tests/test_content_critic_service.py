"""Regression tests for the token-burn gaps closed in content_critic_service.py.

The shared .aether_meter.json showed $510.53 spent against a configured $20
budget (see tests/test_token_meter.py's TestIsOverBudget docstring). The main
agent loop (prompt_service.py) was fixed to check the budget before every
turn, cache the system prompt + growing history, and advertise a scoped
CORE_TOOL_NAMES tool list instead of the full catalog. This service is a
second, independent path into the same shared meter/budget that never got
any of those three fixes — these tests pin the fix in place.
"""
import json
import tempfile
import threading
import unittest
from unittest.mock import MagicMock, patch

from tui.services import content_critic_service as ccs
from tui.services.prompt_service import PromptService
from tui.services.token_meter import meter


class _SyncThread:
    """Runs the target synchronously so tests don't race a background thread."""

    def __init__(self, target=None, *a, **kw):
        self._target = target

    def start(self):
        self._target()


class ContentCriticServiceTestBase(unittest.TestCase):
    def setUp(self):
        # Never let a test write to the real repo-root .aether_meter.json —
        # content_critic_service imports the shared singleton, not a fresh
        # instance, so its state must be saved/restored around each test.
        self._orig_save = meter._save
        meter._save = lambda: None
        self._orig_budget = meter.budget_usd
        self._orig_cost = meter.cost_usd
        self._orig_calls = meter.calls

        self.svc = ccs.ContentCriticService.__new__(ccs.ContentCriticService)
        self.svc.memory = MagicMock()
        self.svc.memory.get_recent_critiques.return_value = ""
        self.svc.memory.count.return_value = 1

        self.tmp_json = tempfile.NamedTemporaryFile(
            suffix=".json", mode="w", delete=False
        )
        json.dump({"title": "test video"}, self.tmp_json)
        self.tmp_json.close()

        self.results = []

    def callback(self, msg, success=True, is_final=False):
        self.results.append((msg, success, is_final))

    def tearDown(self):
        meter._save = self._orig_save
        meter.budget_usd = self._orig_budget
        meter.cost_usd = self._orig_cost
        meter.calls = self._orig_calls


class TestBudgetBreaker(ContentCriticServiceTestBase):
    def test_stops_before_first_api_call_when_over_budget(self):
        meter.budget_usd = 1.0
        meter.cost_usd = 5.0  # already over budget
        self.svc.tools = MagicMock(tools=[])

        mock_get_client = MagicMock(side_effect=AssertionError(
            "must not call the API once the shared budget is exceeded"
        ))
        with patch.object(
            ccs, "get_config", return_value=("key", "http://x", "http://x/models")
        ), patch.object(ccs, "get_openai_client", mock_get_client), patch.object(
            ccs.threading, "Thread", _SyncThread
        ):
            self.svc.critique(self.tmp_json.name, "grok-4.3", self.callback)

        mock_get_client.assert_not_called()
        self.assertTrue(self.results, "expected a callback about the exceeded budget")
        msg, success, is_final = self.results[-1]
        self.assertIn("budget", msg.lower())
        self.assertFalse(success)
        self.assertTrue(is_final)

    def test_proceeds_normally_when_under_budget(self):
        meter.budget_usd = 20.0
        meter.cost_usd = 0.0
        self.svc.tools = MagicMock(tools=[])

        fake_resp = MagicMock()
        fake_resp.model_dump.return_value = {
            "choices": [{"message": {"content": "Looks great."}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5},
        }
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = fake_resp

        with patch.object(
            ccs, "get_config", return_value=("key", "http://x", "http://x/models")
        ), patch.object(
            ccs, "get_openai_client", return_value=mock_client
        ), patch.object(
            ccs.threading, "Thread", _SyncThread
        ), patch("os.getcwd", return_value=tempfile.mkdtemp()):
            self.svc.critique(self.tmp_json.name, "grok-4.3", self.callback)

        mock_client.chat.completions.create.assert_called_once()
        self.assertTrue(any(is_final for _, _, is_final in self.results))


class TestToolAndCachingScope(ContentCriticServiceTestBase):
    def test_scopes_tools_to_core_names_and_marks_cache_control(self):
        meter.budget_usd = 20.0
        meter.cost_usd = 0.0
        core_name = next(iter(PromptService.CORE_TOOL_NAMES))
        self.svc.tools = MagicMock(tools=[
            {"type": "function", "function": {"name": core_name, "parameters": {}}},
            {"type": "function", "function": {"name": "bug_create", "parameters": {}}},
        ])

        fake_resp = MagicMock()
        fake_resp.model_dump.return_value = {
            "choices": [{"message": {"content": "Looks great."}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5},
        }
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = fake_resp

        with patch.object(
            ccs, "get_config", return_value=("key", "http://x", "http://x/models")
        ), patch.object(
            ccs, "get_openai_client", return_value=mock_client
        ), patch.object(
            ccs.threading, "Thread", _SyncThread
        ), patch("os.getcwd", return_value=tempfile.mkdtemp()):
            self.svc.critique(self.tmp_json.name, "grok-4.3", self.callback)

        _, kwargs = mock_client.chat.completions.create.call_args
        sent_tool_names = {t["function"]["name"] for t in kwargs["tools"]}
        self.assertEqual(sent_tool_names, {core_name})

        system_msg = kwargs["messages"][0]
        self.assertIsInstance(system_msg["content"], list)
        self.assertEqual(system_msg["content"][0]["cache_control"], {"type": "ephemeral"})

        last_msg = kwargs["messages"][-1]
        self.assertIsInstance(last_msg["content"], list)
        self.assertEqual(last_msg["content"][0]["cache_control"], {"type": "ephemeral"})


if __name__ == "__main__":
    unittest.main()
