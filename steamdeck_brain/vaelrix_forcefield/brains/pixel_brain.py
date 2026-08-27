"""
Vaelrix Cortex ForceField — Pixel Brain.

Visual/art domain specialist. Its expertise is the project's real pixel-asset
infrastructure: SCDNA gene packets under codex/core/pixelbrain/imports/, each
with a diagnostic_manifest.json carrying real facts (geneType, checksum,
byte length) about that asset. Falls back to a generic CSS/theme-token scan
only for palette/thumbnail concerns that aren't about a specific packet.
"""

from __future__ import annotations

import json
from pathlib import Path

from ..types import AmplifierBrain, AmplifierResult, ResonanceScore, VaelrixCortexForceField


PIXEL_BRAIN = AmplifierBrain(
    id="PIXEL_BRAIN",
    domain=["visual", "pixel", "art", "sprite", "palette"],
    activationSignals=["pixel", "sprite", "art", "visual", "palette", "silhouette", "thumbnail"],
    allowedTools=["read_file", "thumbnail"],
    defaultSearchBudget=1,
)

_COLOUR_PATTERNS = [
    "palette", "colour", "color", "theme", "token", "variable",
    "brand", "chroma", "hue", "shade", "tint", "swatch",
]

_SPRITE_PATTERNS = [
    "sprite", "icon", "glyph", "emblem", "sigil", "rune",
    "avatar", "badge", "logo", "favicon",
]

_THUMBNAIL_PATTERNS = [
    "thumbnail", "thumb", "preview", "cover", "banner", "poster",
]


def _project_root() -> Path:
    here = Path(__file__).resolve()
    for _ in range(8):
        if here == here.parent:
            break
        if any((here / marker).exists() for marker in (".git", "package.json", "pyproject.toml")):
            return here
        here = here.parent
    return Path.cwd()


def _pixelbrain_imports_dir(root: Path) -> Path:
    return root / "codex" / "core" / "pixelbrain" / "imports"


def _list_pixelbrain_assets(root: Path) -> list[str]:
    imports_dir = _pixelbrain_imports_dir(root)
    if not imports_dir.is_dir():
        return []
    return sorted(p.name for p in imports_dir.iterdir() if p.is_dir())


def _read_manifest(root: Path, asset_id: str) -> dict | None:
    manifest_path = _pixelbrain_imports_dir(root) / asset_id / "diagnostic_manifest.json"
    if not manifest_path.exists():
        return None
    try:
        return json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _match_assets_in_text(text_lower: str, assets: list[str]) -> list[str]:
    """Match asset ids the query actually names.

    An asset id is a real identifier (e.g. "barrel_hand"), so a substring
    match against the lowercased query is precise enough — false positives
    would require the query to contain that exact token sequence.
    """
    return [a for a in assets if a.replace("_", " ") in text_lower or a in text_lower]


def _describe_manifest(asset_id: str, manifest: dict | None) -> str:
    if manifest is None:
        return f"{asset_id}: matched but no diagnostic manifest found under codex/core/pixelbrain/imports/."
    gene_type = manifest.get("geneType", "UNKNOWN")
    checksum = manifest.get("checksum", "MISSING")
    byte_length = manifest.get("byteLength", "?")
    return f"{asset_id}: {gene_type} gene, {byte_length} bytes, checksum {checksum}"


def _scan_for_visual_assets(root: Path) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {"colourFiles": [], "spriteFiles": [], "assetDirs": []}
    for candidate in list(root.rglob("*"))[:1000]:
        if candidate.is_dir() and candidate.name.lower() in {"assets", "sprites", "images", "icons", "textures"}:
            result["assetDirs"].append(str(candidate.relative_to(root)))
            continue
        if not candidate.is_file():
            continue
        name_lower = candidate.name.lower()
        if any(p in name_lower for p in _COLOUR_PATTERNS):
            result["colourFiles"].append(str(candidate.relative_to(root)))
        if any(p in name_lower for p in _SPRITE_PATTERNS):
            result["spriteFiles"].append(str(candidate.relative_to(root)))
    return result


def run_pixel_brain(
    field: VaelrixCortexForceField,
    query: str | None = None,
) -> AmplifierResult:
    q = (query or field.task.rawUserRequest).lower()
    findings: list[str] = []
    root = _project_root()

    pixelbrain_assets = _list_pixelbrain_assets(root)
    named_assets = _match_assets_in_text(q, pixelbrain_assets)
    if named_assets:
        for asset_id in named_assets[:4]:
            findings.append(_describe_manifest(asset_id, _read_manifest(root, asset_id)))
    elif pixelbrain_assets and any(
        w in q for w in {"pixel", "sprite", "asset", "palette", "gene", "packet"}
    ):
        findings.append(
            f"No specific pixel asset named in the task. {len(pixelbrain_assets)} real "
            f"pixel asset(s) available: {', '.join(pixelbrain_assets[:8])}"
        )

    assets = _scan_for_visual_assets(root)

    if any(w in q for w in {"palette", "colour", "color", "theme", "chroma"}):
        if assets["colourFiles"]:
            findings.append(
                f"Found {len(assets['colourFiles'])} colour-definition file(s): "
                + ", ".join(assets["colourFiles"][:4])
            )
        else:
            findings.append("No colour palette files detected; consider defining a design-token palette.")

    if any(w in q for w in {"sprite", "icon", "glyph", "emblem", "sigil", "rune"}):
        if assets["spriteFiles"]:
            findings.append(
                f"Found {len(assets['spriteFiles'])} sprite/icon file(s): "
                + ", ".join(assets["spriteFiles"][:4])
            )
        elif assets["assetDirs"]:
            findings.append(
                f"Asset directories exist ({', '.join(assets['assetDirs'][:3])}) "
                "but no sprite files matched by name."
            )
        else:
            findings.append("No sprite or icon files detected. Ensure visual assets are tracked in the project.")

    if any(w in q for w in {"thumbnail", "thumb", "cover", "banner"}):
        if assets["assetDirs"]:
            findings.append(
                f"Check {len(assets['assetDirs'])} asset dir(s) for thumbnail candidates."
            )
        else:
            findings.append("No asset directories found; thumbnail source location is unknown.")

    if any(w in q for w in {"silhouette", "contrast", "readability", "legibility"}):
        findings.append(
            "Silhouette and contrast analysis requires visual inspection; "
            "verify foreground/background separation."
        )

    if not findings:
        findings.append("No specific visual-art signals detected in the task. Pixel Brain standing by.")

    return AmplifierResult(
        brainId=PIXEL_BRAIN.id,
        summary="Visual / pixel-art analysis based on task keywords and project scan.",
        findings=findings,
        recommendedAction="Review flagged visual assets and ensure palette consistency.",
        resonance=ResonanceScore(
            intentMatch=0.7,
            evidenceStrength=0.5,
            novelty=0.4,
            conflictRisk=0.1,
            actionability=0.6,
        ),
    )
