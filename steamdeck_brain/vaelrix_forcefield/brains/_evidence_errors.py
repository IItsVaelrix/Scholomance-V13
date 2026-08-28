"""Shared exception for brains whose evidence comes from reading real files
(LORE_BRAIN, ARCHITECTURE_BRAIN, UI_BRAIN, PIXEL_BRAIN's quote/manifest
helpers).

Each of these helpers used to catch every exception around a file read and
return None — identical to "searched every file and found no match." A
permission error, a corrupt file, or a rglob() hitting an unreadable
subdirectory would silently report the same as "this term simply isn't
documented anywhere," which is a claim about content, not about whether the
search actually completed. See docs/scholomance-encyclopedia/Scholomance
White Papers/AGENT_BLIND_SPOT_DIAGNOSTIC_2026-08-28.md.
"""

from __future__ import annotations


class EvidenceLookupError(Exception):
    """A real error occurred while searching for evidence — distinct from
    searching successfully and finding nothing."""
