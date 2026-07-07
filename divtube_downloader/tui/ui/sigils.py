"""Three-tier sigil grammar.

The cockpit used to sprinkle ✦ ❖ ◆ ⚡ 🔧 ● ◦ more or less at random. That visual
noise is what reads as "templated / AI-generated". Here each glyph means exactly
one thing, and *colour* (not glyph variety) carries the nuance:

    SECTION  ❖   a panel or section identity — every border_title lives here
    ACTION   ▸   a thing you do — command prompts, tool calls, "go"
    STATE    ●   a status dot — its colour is the signal (success/warning/error)

HERO (✦) is deliberately scarce: the single ceremonial flourish reserved for the
boot masthead, so it still means "this is the cockpit" instead of "decoration".
"""

SECTION = "❖"
ACTION = "▸"
STATE = "●"
HERO = "✦"


def title(label: str) -> str:
    """Standard panel/section title: one SECTION sigil, leading, no trailing twin."""
    return f"{SECTION} {label}"
