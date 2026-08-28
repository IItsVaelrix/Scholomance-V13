"""PIXEL_BRAIN must be an expert on the project's REAL pixel-asset
infrastructure (codex/core/pixelbrain/imports/*/diagnostic_manifest.json),
not a filename-substring glob that never opens a file.

Root cause: the old run_pixel_brain matched "sprite"/"palette" against
candidate.name.lower() and never read a single byte of content, so a query
about a specific asset returned the same generic "Found N colour-definition
file(s)" regardless of which asset was named.
"""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from vaelrix_forcefield.brains import pixel_brain
from vaelrix_forcefield.brains._evidence_errors import EvidenceLookupError
from vaelrix_forcefield.brains.pixel_brain import run_pixel_brain
from vaelrix_forcefield.forcefield import create_force_field


def _real_pixelbrain_assets() -> list[str]:
    here = Path(__file__).resolve()
    for _ in range(10):
        if (here / "codex" / "core" / "pixelbrain" / "imports").is_dir():
            return sorted(p.name for p in (here / "codex" / "core" / "pixelbrain" / "imports").iterdir() if p.is_dir())
        here = here.parent
    return []


class TestPixelBrainRealInfra(unittest.TestCase):
    def test_named_asset_returns_real_manifest_facts_not_a_generic_file_count(self):
        assets = _real_pixelbrain_assets()
        if not assets:
            self.skipTest("no real pixelbrain asset fixtures present in this checkout")
        asset_id = assets[0]
        field = create_force_field(f"inspect the {asset_id} pixel asset")
        result = run_pixel_brain(field, query=f"inspect the {asset_id} pixel asset")
        joined = " ".join(result.findings)
        self.assertIn(asset_id, joined)
        # Real packet facts, not the old "Found N colour-definition file(s)" shape.
        self.assertNotIn("colour-definition file", joined)
        self.assertTrue(
            "checksum" in joined.lower() or "genetype" in joined.lower() or "gene" in joined.lower(),
            f"expected real gene/checksum facts, got: {joined}",
        )

    def test_generic_pixel_query_lists_real_available_assets(self):
        assets = _real_pixelbrain_assets()
        if not assets:
            self.skipTest("no real pixelbrain asset fixtures present in this checkout")
        field = create_force_field("check the pixel art color palette")
        result = run_pixel_brain(field, query="check the pixel art color palette")
        joined = " ".join(result.findings)
        self.assertTrue(any(a in joined for a in assets))

    def test_corrupt_manifest_raises_evidence_lookup_error_not_none(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            asset_dir = root / "codex" / "core" / "pixelbrain" / "imports" / "some_asset"
            asset_dir.mkdir(parents=True)
            (asset_dir / "diagnostic_manifest.json").write_text("{not valid json")

            with self.assertRaises(EvidenceLookupError):
                pixel_brain._read_manifest(root, "some_asset")

    def test_corrupt_manifest_is_reported_distinctly_from_manifest_missing(self):
        assets = _real_pixelbrain_assets()
        if not assets:
            self.skipTest("no real pixelbrain asset fixtures present in this checkout")
        asset_id = assets[0]

        with patch.object(pixel_brain, "_read_manifest", side_effect=EvidenceLookupError("simulated: corrupt JSON")):
            text = f"inspect the {asset_id} pixel asset"
            field = create_force_field(text)
            result = run_pixel_brain(field, query=text)
            joined = " ".join(result.findings)
        self.assertNotIn("no diagnostic manifest found", joined)
        self.assertIn("failed", joined.lower())


if __name__ == "__main__":
    unittest.main()
