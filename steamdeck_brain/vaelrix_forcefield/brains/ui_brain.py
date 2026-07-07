"""
Vaelrix Cortex ForceField — UI Brain.

Interface/widget/screen/layout domain specialist. Analyzes tasks for
UI-related concerns: component hierarchy, widget patterns, layout
heuristics, and theme consistency — deterministic keyword/pattern analysis.
"""

from __future__ import annotations

import os
from pathlib import Path

from ..types import AmplifierBrain, AmplifierResult, ResonanceScore, VaelrixCortexForceField


UI_BRAIN = AmplifierBrain(
    id="UI_BRAIN",
    domain=["ui", "interface", "widget", "screen", "layout"],
    activationSignals=["ui", "interface", "widget", "screen", "layout", "component", "theme"],
    allowedTools=["read_file", "search_code"],
    defaultSearchBudget=3,
)

_UI_FILE_PATTERNS = [".jsx", ".tsx", ".vue", ".svelte", ".css", ".scss", ".less", ".html"]

_LAYOUT_TERMS: dict[str, str] = {
    "flexbox": "CSS Flexbox — one-dimensional layout system.",
    "grid": "CSS Grid — two-dimensional layout system.",
    "responsive": "Responsive design — adapts to viewport size.",
    "breakpoint": "Breakpoint — viewport width threshold for layout change.",
    "container": "Container — wraps and constrains content width.",
    "sidebar": "Sidebar — ancillary navigation or info panel.",
    "header": "Header — top bar with branding/navigation.",
    "footer": "Footer — bottom bar with links/legal.",
    "modal": "Modal — overlay dialog.",
    "toast": "Toast — transient notification.",
    "tooltip": "Tooltip — hover info popup.",
    "drawer": "Drawer — slide-in panel from edge.",
    "carousel": "Carousel — horizontally scrolling item list.",
    "accordion": "Accordion — expandable/collapsible sections.",
    "tabs": "Tabs — mutually exclusive panel switcher.",
}

_COMPONENT_TERMS: dict[str, str] = {
    "button": "Button — clickable action trigger.",
    "input": "Input — text/data entry field.",
    "checkbox": "Checkbox — binary toggle.",
    "radio": "Radio button — exclusive multi-choice.",
    "select": "Select — dropdown choice picker.",
    "slider": "Slider — range value picker.",
    "switch": "Switch/toggle — on/off control.",
    "badge": "Badge — status/count indicator.",
    "avatar": "Avatar — user/profile image.",
    "card": "Card — content container with border/shadow.",
    "table": "Table — tabular data display.",
    "form": "Form — structured input collection.",
    "navbar": "Navbar — primary navigation bar.",
    "breadcrumb": "Breadcrumb — navigation path trail.",
    "pagination": "Pagination — page navigation control.",
}

_THEME_TERMS: dict[str, str] = {
    "dark mode": "Dark mode — light-on-dark color scheme.",
    "light mode": "Light mode — dark-on-light color scheme.",
    "contrast": "Contrast — accessibility ratio between text and background.",
    "font": "Font — typeface selection.",
    "spacing": "Spacing — consistent padding/margin scale.",
    "shadow": "Shadow — elevation/depth indicator.",
    "radius": "Border radius — corner roundness.",
    "animation": "Animation — motion/transition effects.",
}


def _project_root() -> Path:
    here = Path(__file__).resolve()
    for _ in range(8):
        if here == here.parent:
            break
        if any((here / marker).exists() for marker in (".git", "package.json", "pyproject.toml")):
            return here
        here = here.parent
    return Path.cwd()


# Vendored / build / VCS directories that never contain the project's own UI
# source. Pruning them is what keeps the scan bounded by source-tree size
# instead of walking node_modules / virtualenvs (hundreds of thousands of
# paths) on every query.
_IGNORE_DIRS = {
    "node_modules", "venv", "__pycache__", "dist", "build", "out",
    "coverage", "test-results", "site-packages", "target", "vendor",
}
# Hard ceiling on files examined so a pathological tree can never dominate
# latency even if a new vendor dir slips past _IGNORE_DIRS.
_SCAN_FILE_BUDGET = 6000


def _scan_ui_files(root: Path) -> tuple[list[str], list[str]]:
    components: list[str] = []
    styles: list[str] = []
    style_exts = {".css", ".scss", ".less"}
    component_dirs = {"components", "pages", "views", "ui", "widgets", "screens"}
    root_str = str(root)
    examined = 0
    for dirpath, dirnames, filenames in os.walk(root):
        # Prune in-place so os.walk never descends vendored/build/dot dirs.
        dirnames[:] = [
            d for d in dirnames
            if d not in _IGNORE_DIRS and not d.startswith(".")
        ]
        parent_name = os.path.basename(dirpath).lower()
        dirpath_lower = dirpath.lower()
        for name in filenames:
            examined += 1
            if examined > _SCAN_FILE_BUDGET:
                return components, styles
            suffix = os.path.splitext(name)[1].lower()
            if suffix not in _UI_FILE_PATTERNS:
                continue
            rel = os.path.relpath(os.path.join(dirpath, name), root_str)
            if suffix in style_exts or parent_name in {"styles", "themes", "css"}:
                styles.append(rel)
            elif parent_name in component_dirs or any(
                d in dirpath_lower for d in component_dirs
            ):
                components.append(rel)
    return components, styles


def run_ui_brain(
    field: VaelrixCortexForceField,
    query: str | None = None,
) -> AmplifierResult:
    text = (query or field.task.rawUserRequest).lower()
    findings: list[str] = []
    root = _project_root()

    layout_hits = {term: desc for term, desc in _LAYOUT_TERMS.items() if term in text}
    if layout_hits:
        findings.append(f"Layout terms: {', '.join(layout_hits.keys())}")
    else:
        findings.append("No layout terms detected — specify layout approach (flexbox, grid, etc.).")

    component_hits = {term: desc for term, desc in _COMPONENT_TERMS.items() if term in text}
    if component_hits:
        findings.append(f"UI components referenced: {', '.join(component_hits.keys())}")

    theme_hits = {term: desc for term, desc in _THEME_TERMS.items() if term in text}
    if theme_hits:
        findings.append(f"Theme concerns: {', '.join(theme_hits.keys())}")

    components, styles = _scan_ui_files(root)
    if components:
        findings.append(
            f"Found {len(components)} UI component file(s): {', '.join(components[:4])}"
        )
    if styles:
        findings.append(
            f"Found {len(styles)} style file(s): {', '.join(styles[:4])}"
        )

    if "responsive" in text and "breakpoint" not in text:
        findings.append("Responsive design mentioned but no breakpoints defined.")
    if "mobile" in text or "phone" in text:
        findings.append("Mobile target — verify touch targets >= 44px and readable at 320px viewport.")

    if any(w in text for w in {"accessible", "a11y", "accessibility", "wcag"}):
        findings.append("Accessibility referenced — verify color contrast, ARIA labels, and keyboard nav.")
    elif any(w in text for w in {"contrast", "color", "colour"}):
        findings.append("Color/contrast mentioned — ensure WCAG AA compliance (4.5:1 ratio).")

    if any(w in text for w in {"loading", "empty", "error", "skeleton"}):
        findings.append("UI states referenced — implement loading, empty, and error states for all data views.")

    if not findings:
        findings.append("UI Brain standing by — no strong UI signals detected.")

    return AmplifierResult(
        brainId=UI_BRAIN.id,
        summary="UI/interface heuristic analysis.",
        findings=findings,
        recommendedAction="Review UI component structure, layout approach, and theme consistency.",
        resonance=ResonanceScore(
            intentMatch=0.7, evidenceStrength=0.5, novelty=0.4,
            conflictRisk=0.1, actionability=0.7,
        ),
    )
