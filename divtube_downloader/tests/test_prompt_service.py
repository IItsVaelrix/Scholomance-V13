import unittest

from tui.services.prompt_service import _cacheable_system_message


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


if __name__ == "__main__":
    unittest.main()
