import os
import json
import tempfile
import unittest
from types import SimpleNamespace

from tui.core.command_parser import CommandRegistry
from tui.services.niche_service import NicheService
from tui.ui.app import DivTubeAgentApp


class _MockUI:
    """Minimal stand-in for the app passed to command handlers."""

    def __init__(self, niche=None, intel=None):
        self.logs = []
        self.niche = niche
        self.intel = intel

    def log_msg(self, msg):
        self.logs.append(msg)


def _lab_registry():
    """Register only the lab commands into a fresh registry.

    setup_lab_commands depends solely on self.registry, so we can bind it to a
    lightweight object instead of constructing the whole Textual app.
    """
    reg = CommandRegistry()
    DivTubeAgentApp.setup_lab_commands(SimpleNamespace(registry=reg))
    return reg


class TestNicheService(unittest.TestCase):
    def _svc(self):
        tmp = tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False)
        tmp.close()
        self.addCleanup(os.unlink, tmp.name)
        return NicheService(db_path=tmp.name)

    def test_seeds_default_niches(self):
        svc = self._svc()
        names = svc.list_niches()
        self.assertEqual(names, ["commentary", "gaming", "music"])  # alphabetical

    def test_get_niche_is_case_insensitive(self):
        svc = self._svc()
        cfg = json.loads(svc.get_niche("GAMING"))
        self.assertIn("power_words", cfg)
        self.assertEqual(svc.get_niche("does-not-exist"), "{}")

    def test_pack_round_trip(self):
        svc = self._svc()
        pack = tempfile.NamedTemporaryFile(suffix=".nichepack", delete=False)
        pack.close()
        self.addCleanup(os.unlink, pack.name)
        exported = svc.export_pack(pack.name)
        self.assertEqual(exported, 3)
        imported = svc.import_pack(pack.name)
        self.assertEqual(imported, 3)


class TestLabCommands(unittest.TestCase):
    def test_commands_are_registered(self):
        reg = _lab_registry()
        self.assertIn("/intel", reg.commands)
        self.assertIn("/niche", reg.commands)

    def test_intel_requires_url(self):
        reg = _lab_registry()
        ui = _MockUI()
        reg.parse_and_execute("/intel", ui)
        self.assertTrue(any("Usage" in m for m in ui.logs))

    def test_intel_dispatches_to_service(self):
        reg = _lab_registry()
        calls = []
        fake_intel = SimpleNamespace(run_intel=lambda url, cb: calls.append(url))
        ui = _MockUI(intel=fake_intel)
        reg.parse_and_execute("/intel https://youtu.be/dQw4w9WgXcQ", ui)
        self.assertEqual(calls, ["https://youtu.be/dQw4w9WgXcQ"])

    def test_niche_list(self):
        reg = _lab_registry()
        tmp = tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False)
        tmp.close()
        self.addCleanup(os.unlink, tmp.name)
        ui = _MockUI(niche=NicheService(db_path=tmp.name))
        reg.parse_and_execute("/niche list", ui)
        joined = " ".join(ui.logs)
        self.assertIn("gaming", joined)
        self.assertIn("music", joined)

    def test_niche_show(self):
        reg = _lab_registry()
        tmp = tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False)
        tmp.close()
        self.addCleanup(os.unlink, tmp.name)
        ui = _MockUI(niche=NicheService(db_path=tmp.name))
        reg.parse_and_execute("/niche show gaming", ui)
        self.assertTrue(any("power_words" in m for m in ui.logs))


if __name__ == "__main__":
    unittest.main()
