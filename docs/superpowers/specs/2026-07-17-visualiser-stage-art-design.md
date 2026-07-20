# Visualiser Stage Art (Replace Mandala) — Design

**Date:** 2026-07-17  
**Status:** Approved  
**Context:** Deck Aw Snap under live mandala/canvas. Truesight + karaoke remain on and stable. Stage should be static custom art.

## Goal

Replace `MandalaStage` on Bytecode Visualiser with **static per-track stage art**.

## Decisions

| Item | Choice |
|------|--------|
| Art source | Optional `stageArtUrl` per track |
| Fallback | `coverUrl` |
| Motion | Fully static (no canvas / RAF / Ken Burns) |
| Fit | Stage aspect follows the image; full art visible (`contain`), no crop |
| Keep | Truesight coloring, karaoke playhead, scanlines |

## Non-goals

- Generating artwork
- Re-enabling mandala bytecode RAF on stage
- Changing Deck karaoke / Truesight policy

## Integration

- `GrimoireTrack.stageArtUrl?: string`
- Stage: `<img src={stageArtUrl ?? coverUrl} alt="" />` inside `.bcv-stage`
- `object-fit: cover` to fill the stage frame
- Remove `MandalaStage` mount from `BytecodeVisualiserPage` (karaoke may still use fingerprint seed)

## Success

- Stage shows cover (or custom art when set) with no live geometry
- Play on Deck remains stable with Truesight + karaoke
