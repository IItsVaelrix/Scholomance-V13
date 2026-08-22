# Every theme MUST define the same key set: the app CSS references these as
# `$token` names (underscores become hyphens via App.get_css_variables), so a
# missing key would raise an unresolved-variable error the instant a user
# switches themes. Keep the two palettes key-for-key parallel.
#
# Token roles under "Disciplined Grimoire":
#   background    — base canvas
#   surface       — panel fill
#   panel_border  — the RESTING border, muted; every panel uses this at rest
#   accent_primary— the FOCUS/active-surface accent; only one panel wears it
#   accent_secondary / accent_tertiary / highlight — identity touches kept as
#                   TEXT, never as a second competing border colour
#   text_bright   — active/primary titles; text_primary/secondary step down
THEMES = {
    "void_cyan": {
        "background": "#080A12",
        "surface": "#0F1422",
        "accent_primary": "#55E6FF",
        "accent_secondary": "#B388FF",
        "accent_tertiary": "#7DD3FC",
        "success": "#7CFF8B",
        "warning": "#FFD166",
        "error": "#FF5C7A",
        "muted": "#4B5563",
        "panel_border": "#1E293B",
        "text_primary": "#E2E8F0",
        "text_secondary": "#94A3B8",
        "text_bright": "#F8FAFC",
        "highlight": "#FFD166"
    },
    "obsidian_crimson": {
        "background": "#0D0D0D",
        "surface": "#1C1C1C",
        "accent_primary": "#DC143C",
        "accent_secondary": "#8B5CF6",
        "accent_tertiary": "#B388FF",
        "success": "#7CFF8B",
        "warning": "#FFD166",
        "error": "#FF5C7A",
        "muted": "#6A5A6A",
        "panel_border": "#2D181E",
        "text_primary": "#E2E8F0",
        "text_secondary": "#9B8A9B",
        "text_bright": "#F8FAFC",
        "highlight": "#FFD700"
    }
}

# Default theme used as fallback when a widget renders off-app or with an
# unknown THEME_NAME. Kept in ONE place so the fallback can never drift.
DEFAULT_THEME = "obsidian_crimson"


def palette(name: str | None = None) -> dict:
    """Return the palette dict for a theme name.

    Widgets call ``palette(getattr(self.app, "THEME_NAME", None))`` so every
    colour they render resolves through theme.py — the single source of truth.
    Unknown/absent names fall back to DEFAULT_THEME rather than raising.
    """
    return THEMES.get(name or DEFAULT_THEME, THEMES[DEFAULT_THEME])
