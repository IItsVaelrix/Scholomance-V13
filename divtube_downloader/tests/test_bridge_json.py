import unittest

from tui.services.tool_service import _extract_bridge_json


class TestExtractBridgeJson(unittest.TestCase):
    def test_pure_object(self):
        self.assertEqual(_extract_bridge_json('{"ok": true}'), {"ok": True})

    def test_log_noise_then_pretty_json(self):
        text = (
            "{ filePath: 'package.json' } [Immunity] Initiating scan.\n"
            "{\n"
            '  "filePath": "package.json",\n'
            '  "totalViolations": 0\n'
            "}\n"
        )
        data = _extract_bridge_json(text)
        self.assertEqual(data["filePath"], "package.json")
        self.assertEqual(data["totalViolations"], 0)

    def test_empty(self):
        self.assertIsNone(_extract_bridge_json(""))
        self.assertIsNone(_extract_bridge_json(None))


if __name__ == "__main__":
    unittest.main()
