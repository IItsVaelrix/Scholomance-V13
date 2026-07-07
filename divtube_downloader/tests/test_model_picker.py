import unittest

from tui.services.env_config import resolve_provider
from tui.services.content_critic_service import classify_models, _model_is_paid


class TestProviderAliases(unittest.TestCase):
    def test_grok_alias_maps_to_xai(self):
        canonical, base_url, models_url, default_model = resolve_provider("grok")
        self.assertEqual(canonical, "xai")
        self.assertEqual(base_url, "https://api.x.ai/v1")
        self.assertEqual(models_url, "https://api.x.ai/v1")
        self.assertTrue(default_model)
        # grok-beta is decommissioned; default must not point at it.
        self.assertNotEqual(default_model, "grok-beta")

    def test_grok_alias_case_insensitive(self):
        self.assertEqual(resolve_provider("GROK")[0], "xai")
        self.assertEqual(resolve_provider("x.ai")[0], "xai")

    def test_openrouter_alias(self):
        self.assertEqual(resolve_provider("openrouter")[0], "router")

    def test_unknown_name_is_custom_url(self):
        canonical, base_url, models_url, default_model = resolve_provider(
            "https://my.host/v1"
        )
        self.assertEqual(canonical, "https://my.host/v1")
        self.assertEqual(base_url, "https://my.host/v1")
        self.assertEqual(default_model, "")


class TestModelClassification(unittest.TestCase):
    def test_xai_token_price_fields_are_paid(self):
        m = {
            "id": "grok-4.3",
            "prompt_text_token_price": 12500,
            "completion_text_token_price": 25000,
        }
        self.assertTrue(_model_is_paid(m))

    def test_groq_pricing_dict_is_paid(self):
        m = {"id": "llama", "pricing": {"prompt": "0.00000003", "completion": "0.0"}}
        self.assertTrue(_model_is_paid(m))

    def test_zero_pricing_is_free(self):
        m = {"id": "z", "pricing": {"prompt": "0", "completion": "0"}}
        self.assertFalse(_model_is_paid(m))

    def test_free_suffix_is_free(self):
        m = {
            "id": "meta/llama:free",
            "pricing": {"prompt": "5", "completion": "5"},
        }
        self.assertFalse(_model_is_paid(m))

    def test_no_pricing_metadata_defaults_to_free(self):
        # blackbox / gemini return no price info — must never be hidden.
        self.assertFalse(_model_is_paid({"id": "blackboxai", "object": "model"}))
        self.assertFalse(
            _model_is_paid({"id": "models/gemini-2.5-flash", "object": "model"})
        )

    def test_classify_models_partitions_every_model(self):
        raw = [
            {"id": "grok-4.3", "prompt_text_token_price": 12500,
             "completion_text_token_price": 25000},
            {"id": "blackboxai"},
            {"id": "free-one:free"},
        ]
        free, paid = classify_models(raw)
        self.assertEqual(set(free) | set(paid), {"grok-4.3", "blackboxai",
                                                 "free-one:free"})
        self.assertIn("grok-4.3", paid)
        self.assertIn("blackboxai", free)
        self.assertIn("free-one:free", free)

    def test_classify_models_handles_bare_string_ids(self):
        free, paid = classify_models(["plain-id"])
        self.assertEqual(free, ["plain-id"])
        self.assertEqual(paid, [])


if __name__ == "__main__":
    unittest.main()
