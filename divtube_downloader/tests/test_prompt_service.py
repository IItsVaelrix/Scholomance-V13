import threading
import unittest
from unittest import mock

from tui.services.prompt_service import _cacheable_system_message, _with_history_cache_breakpoint


class TestCacheableSystemMessage(unittest.TestCase):
    def test_wraps_text_in_content_array_with_ephemeral_marker(self):
        msg = _cacheable_system_message("you are an assistant")
        self.assertEqual(msg["role"], "system")
        self.assertEqual(msg["content"], [{
            "type": "text",
            "text": "you are an assistant",
            "cache_control": {"type": "ephemeral"},
        }])

    def test_preserves_arbitrary_text_verbatim(self):
        # The law context appended to the base prompt can contain anything
        # (file paths, JSON snippets) — it must round-trip untouched, not
        # just short plain sentences.
        text = "line one\nline two: {\"k\": \"v\"}\n--- Scholomance LAW ---"
        msg = _cacheable_system_message(text)
        self.assertEqual(msg["content"][0]["text"], text)


class TestWithHistoryCacheBreakpoint(unittest.TestCase):
    """_cacheable_system_message only ever marked the system prompt as
    cacheable. Measured against real accumulated usage (.aether_meter.json,
    qwen3.8-max — the exact provider this caching code targets): 0.14%
    cache hit rate against $510 of real spend, because the actual dominant,
    ever-growing content — the messages array itself, tool results and all —
    carried zero cache markers and was rebilled at full price every turn.
    Alibaba's own 3-marker best practice calls for a marker on the
    conversation history too ("grows each turn"); this is that marker.
    """

    def test_empty_messages_returned_unchanged(self):
        self.assertEqual(_with_history_cache_breakpoint([]), [])

    def test_last_message_gets_wrapped_with_ephemeral_marker(self):
        messages = [
            {"role": "system", "content": "sys"},
            {"role": "user", "content": "hello"},
        ]
        result = _with_history_cache_breakpoint(messages)
        self.assertEqual(result[-1]["content"], [{
            "type": "text", "text": "hello", "cache_control": {"type": "ephemeral"},
        }])

    def test_earlier_messages_are_not_touched(self):
        messages = [{"role": "system", "content": "sys"}, {"role": "user", "content": "hello"}]
        result = _with_history_cache_breakpoint(messages)
        self.assertEqual(result[0], {"role": "system", "content": "sys"})

    def test_does_not_mutate_the_caller_list_or_dicts(self):
        # Critical: mutating in place would leave a stale marker on this
        # message forever as new messages get appended in later turns,
        # accumulating one more live cache_control block per turn — most
        # providers cap how many a single request may carry.
        original_last = {"role": "tool", "content": "some tool result"}
        messages = [{"role": "system", "content": "sys"}, original_last]
        _with_history_cache_breakpoint(messages)
        self.assertEqual(messages[-1], original_last)
        self.assertIsInstance(messages[-1]["content"], str)

    def test_non_string_content_is_left_alone(self):
        # A message whose content is already a block-array (e.g. the system
        # message _cacheable_system_message already wrapped) — don't
        # double-wrap it; return the list unchanged.
        messages = [{"role": "system", "content": [{"type": "text", "text": "sys",
                                                      "cache_control": {"type": "ephemeral"}}]}]
        result = _with_history_cache_breakpoint(messages)
        self.assertEqual(result, messages)

    def test_empty_string_content_is_left_alone(self):
        # An assistant tool-call message typically has content="" — nothing
        # meaningful to mark, and it's never actually last at call time
        # anyway (tool-result messages always follow it before the next
        # _call_api), but must degrade safely if it ever were.
        messages = [{"role": "assistant", "content": "", "tool_calls": []}]
        result = _with_history_cache_breakpoint(messages)
        self.assertEqual(result, messages)

    def test_breakpoint_moves_to_the_new_last_message_each_turn(self):
        # Simulates two successive turns of the real loop: a tool result
        # gets appended, and the NEXT call's breakpoint must land on it —
        # not still on the previous turn's message.
        turn1 = [{"role": "system", "content": "sys"}, {"role": "user", "content": "hi"}]
        result1 = _with_history_cache_breakpoint(turn1)
        self.assertEqual(result1[-1]["content"][0]["text"], "hi")

        turn2 = turn1 + [{"role": "assistant", "content": "", "tool_calls": [{"id": "1"}]},
                          {"role": "tool", "content": "tool output here"}]
        result2 = _with_history_cache_breakpoint(turn2)
        self.assertEqual(result2[-1]["content"][0]["text"], "tool output here")
        # Only ONE live marker per call — the earlier "hi" message must be
        # back to a plain string in this turn's payload, not still wrapped.
        self.assertEqual(result2[1]["content"], "hi")


class TestCallApiAppliesHistoryCacheBreakpoint(unittest.TestCase):
    """_call_api is the one real call site — wiring _with_history_cache_
    breakpoint in as a pure function proves nothing on its own if the actual
    request never uses it."""

    def _service(self):
        from tui.services.prompt_service import PromptService
        return PromptService.__new__(PromptService)

    def _fake_response(self):
        resp = mock.Mock()
        resp.model_dump.return_value = {
            "choices": [{"message": {"role": "assistant", "content": "ok"}}],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1},
        }
        return resp

    def test_outgoing_request_carries_the_breakpoint_on_the_last_message(self):
        svc = self._service()
        messages = [
            {"role": "system", "content": "sys"},
            {"role": "tool", "content": "a big tool result"},
        ]
        fake_client = mock.Mock()
        fake_client.chat.completions.create.return_value = self._fake_response()
        # Never touch the real, persisted .aether_meter.json / rate window
        # from a test — these are real module-level singletons.
        with mock.patch("tui.services.prompt_service.get_openai_client", return_value=fake_client), \
             mock.patch("tui.services.prompt_service.meter"), \
             mock.patch("tui.services.prompt_service.llm_throttle"):
            svc._call_api(messages, "qwen3.8-max", "http://fake", "key", use_tools=False, tools=[])

        sent_messages = fake_client.chat.completions.create.call_args.kwargs["messages"]
        self.assertEqual(sent_messages[-1]["content"], [{
            "type": "text", "text": "a big tool result", "cache_control": {"type": "ephemeral"},
        }])

    def test_original_messages_list_passed_in_is_not_mutated(self):
        svc = self._service()
        messages = [{"role": "system", "content": "sys"}, {"role": "tool", "content": "result"}]
        fake_client = mock.Mock()
        fake_client.chat.completions.create.return_value = self._fake_response()
        with mock.patch("tui.services.prompt_service.get_openai_client", return_value=fake_client), \
             mock.patch("tui.services.prompt_service.meter"), \
             mock.patch("tui.services.prompt_service.llm_throttle"):
            svc._call_api(messages, "qwen3.8-max", "http://fake", "key", use_tools=False, tools=[])
        self.assertEqual(messages[-1]["content"], "result")


class TestPromptStopsWhenOverBudget(unittest.TestCase):
    """The token meter tracked real spend accurately the whole time — real
    .aether_meter.json showed $510.53 against a configured $20 budget —
    because nothing in the agent loop ever checked it. This is that check,
    tested at the actual loop level (not just the pure is_over_budget()
    unit above), since a correct meter method proves nothing if the loop
    never consults it.
    """

    def _service(self):
        from tui.services.prompt_service import PromptService
        svc = PromptService.__new__(PromptService)
        svc.active_model = "qwen3.8-max"
        svc.max_history = 20
        svc.history = {}
        svc._history_lock = threading.Lock()
        svc.HISTORY_FILE = "/tmp/test_prompt_budget_history.json"
        return svc

    def test_no_api_call_is_made_once_over_budget(self):
        svc = self._service()
        fake_client = mock.Mock()
        event = threading.Event()
        results = {}

        def on_finished(ok, detail):
            results["ok"] = ok
            results["detail"] = detail
            event.set()

        with mock.patch("tui.services.prompt_service.get_config", return_value=("fake-key", "http://fake", None)), \
             mock.patch("tui.services.prompt_service.get_openai_client", return_value=fake_client), \
             mock.patch("tui.services.prompt_service.meter") as fake_meter:
            fake_meter.is_over_budget.return_value = True
            fake_meter.budget_usd = 20.0
            svc.prompt(
                "do something", lambda m: None, system_hint="test hint",
                agent_id="test-agent", tools=[], on_finished=on_finished,
            )
            self.assertTrue(event.wait(timeout=5), "prompt() never called on_finished")

        fake_client.chat.completions.create.assert_not_called()
        self.assertFalse(results["ok"])

    def test_a_normal_turn_still_completes_when_under_budget(self):
        svc = self._service()
        fake_client = mock.Mock()
        resp = mock.Mock()
        resp.model_dump.return_value = {
            "choices": [{"message": {"role": "assistant", "content": "done"}}],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1},
        }
        fake_client.chat.completions.create.return_value = resp
        event = threading.Event()
        results = {}

        def on_finished(ok, detail):
            results["ok"] = ok
            event.set()

        with mock.patch("tui.services.prompt_service.get_config", return_value=("fake-key", "http://fake", None)), \
             mock.patch("tui.services.prompt_service.get_openai_client", return_value=fake_client), \
             mock.patch("tui.services.prompt_service.meter") as fake_meter:
            fake_meter.is_over_budget.return_value = False
            svc.prompt(
                "do something", lambda m: None, system_hint="test hint",
                agent_id="test-agent", tools=[], on_finished=on_finished,
            )
            self.assertTrue(event.wait(timeout=5), "prompt() never called on_finished")

        fake_client.chat.completions.create.assert_called_once()
        self.assertTrue(results["ok"])


if __name__ == "__main__":
    unittest.main()
