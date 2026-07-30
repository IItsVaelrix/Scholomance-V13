# Design Specification: Vixel Co-Synthesis Engine

**Date:** 2026-07-29  
**Status:** Approved  
**Target Files:** `PolarisOS/scripts/vixel-rasterize.mjs`, `src/lib/vixel-lattice/vixel-fusion.js`

---

## 1. Overview

This specification establishes the **Vixel Co-Synthesis Engine**, unifying vector geometry (Wand) and pixel craft (SCDL) into a single mathematical field calculation. Vector paths no longer act as standalone line overlays; instead, vector curves continuously guide material grain orientation, modulate palette value steps, emit photonic lighting fields, and dither sub-pixel edge transitions across the pixel substrate.

---

## 2. Core Vixel Synthesis Laws

### Law 1: Vector-Guided Material Orientation
- For any sub-pixel point $(x, y)$ inside a material cell (`bark`, `oak_bark`, `voidbark`, `leather`, `darksteel`), sample nearest Wand vector path.
- Compute local tangent vector $\hat{T}_{\text{vec}} = (t_x, t_y)$.
- Dynamically orient material grain direction:
  $$\theta_{\text{grain}}(x, y) = \text{atan2}(t_y, t_x)$$
- Ensures tree bark grain follows trunk/branch curvature naturally.

---

### Law 2: Vector Distance Value-Stepping (Form Ramps)
- Compute signed distance $d_{\text{vec}}$ from structural vector manifold curves (trunk centerlines, column axes).
- Compute cylindrical cross-section lighting intensity:
  $$\text{ValueStep}(d_{\text{vec}}) = \text{Quantize}\left( \sqrt{1 - \left(\frac{d_{\text{vec}}}{R}\right)^2} \cdot (\hat{N} \cdot \hat{L}), \text{steps}=4 \right)$$
- Re-indexes cell color along 4-tier palette ramps (`bark_void` $\rightarrow$ `bark_dark` $\rightarrow$ `bark_mid` $\rightarrow$ `bark_hi`).

---

### Law 3: Vector Photonic Emission Field
- Vector paths with emission roles (`torii`, `moon`, `lantern`, `book`, `rune`) emit a radial light falloff:
  $$I_{\text{vec}}(x, y) = \sum_{k} I_k \cdot \exp\left( -\frac{d_k(x, y)^2}{r_k^2} \right)$$
- Re-indexes surrounding pixel cell palette steps, boosting ambient specular highlights on path stone, foliage, and trunks facing the vector light source.

---

### Law 4: Vector-Dithered Sub-Pixel Coverage
- Calculate sub-pixel signed distance $d_{\text{sd}}$ to vector path boundaries.
- Modulate $4 \times 4$ Bayer ordered dithering matrix $\mathbf{M}_{\text{Bayer}}$:
  $$\text{Alpha}(x, y) = \text{Smoothstep}\left( -0.5, 0.5, d_{\text{sd}} + \mathbf{M}_{\text{Bayer}}(x \bmod 4, y \bmod 4) - 0.5 \right)$$
- Creates organic dithered transitions between vector contours and dithered pixel backgrounds instead of harsh vector cutoffs.

---

## 3. Verification & Pass Criteria

1. Executing `node PolarisOS/scripts/vixel-rasterize.mjs scholomance-forest-entrance 4` produces a rich 640×360 PNG combining dithered pixel textures with vector-guided bark grain and photonic emissions.
2. 100% deterministic hash retention (`vixelHash` & `feelHash`).
3. Ablation A/B test passes cleanly (`diffPixels > 5%`).
