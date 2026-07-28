# Design Spec: Celestial Sword — Vixel Topological Architecture & Health Gates

**Date:** 2026-07-28
**Status:** Approved & Implemented
**Asset Name:** `celestial-sword`

---

## 1. Architectural Overview: Derived Topological Layers

To prevent layer-coherence tearing, decorative trim drift, and asymmetric coordinate quantization, visual layers are **derived deterministically from a single canonical structural mask** rather than painted as independent floating shapes.

```
canonicalMask = rasterize(swordGeometry)

goldOuterBand = dilate(canonicalMask, goldWidth) - canonicalMask
goldInnerBand = canonicalMask - erode(canonicalMask, innerWidth)

goldTrim = applyRegionRules(
    goldOuterBand + goldInnerBand,
    guardRegion,
    bladeRegion,
    pommelRegion
)
```

---

## 2. Coherent Layer Render Order

All visual layers share a **single origin, single transform, and single lattice coordinate system**:

1. **Canonical Occupancy Mask** (`canonicalMask`)
2. **Dark Structural Underlay** (`darksteel`)
3. **Steel / Celestial Blade Fill** (`cosmic_blue` / `stardust_white`)
4. **Ivory Highlight** (`stardust_white`)
5. **Gold Trim (Derived from Occupancy)** (`gold`)
6. **Gold Emissive Halo** (`void_rune_glow`)
7. **Celestial Particles**

*The glow is allowed to detach; the trim NEVER detaches.*

---

## 3. Vixel Deterministic Health Gates

| Gate | Rule | Enforcement |
|---|---|---|
| **TrimAttachment** | Every structural gold cell must touch the sword mask within 1 cell. | Distance to `canonicalMask` \(\le 1.42\) cells |
| **IslandRejection** | Reject unapproved gold components smaller than defined area (\(< 3\) cells). | Morphological component area check |
| **MirrorDelta** | Guard halves must mirror identically across the central axis. | Left-right occupancy delta \(= 0\) |
| **TransformIdentity** | All structural layers must share identical origin, scale, and rotation. | Verified at compile time |
| **AlphaSeam** | No transparent cell may exist between touching structural layers. | 4-connected occupancy seam check |
| **NativeScale** | Native resolution composite enlarged once using nearest-neighbor. | Single-pass scaling in rasterizer |

---

## 4. Rebuilding the Celestial Sword Crossguard

1. **Mirrored Crossguard Core**: Author the crossguard as a single, perfectly mirrored 8-connected polygon mask centered on \(x = 16\).
2. **Derived Gold Trim**: Compute inner and outer gold borders using morphological dilation and erosion of the structural mask.
3. **Shared Junction Mask**: Connect blade and crossguard through a contiguous 2px overlap junction mask to eliminate alpha seams.
