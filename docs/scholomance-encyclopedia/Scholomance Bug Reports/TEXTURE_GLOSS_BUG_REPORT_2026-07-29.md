# Texture Gloss Bug Report — 2026-07-29

**Component:** `codex/core/pixelbrain/vixel/vri-renderer.js` (texture pass ×
palette quantization)
**Severity:** Aesthetic, corpus-wide. No crash, no test failure, no incorrect data.
**Status:** Fixed 2026-07-29 — bounded grain + ordered dither.
**Difficulty to catch:** **Above average.** Rationale in §5.

---

## 1. Summary

Once palette quantization was introduced, the texture pass began **reassigning
ramp bands instead of texturing within them**. Roughly 28% of lit pixels — and
~70% of pixels in the middle of a shading band — had their ramp anchor changed by
procedural grain rather than by surface form.

The visible result is that every textured material acquired a specular sheen.
Discrete, scattered brightness jumps across a surface is the perceptual
definition of gloss, so assets read as glossy regardless of what they are made
of. Bark glossed harder than metal.

The defect was reported by the author as a persistent visual quality noticed
across the whole asset library without an identified cause: *"I can see it in the
visual acuity when any of the assets are created, just didn't occur to me it's
asset noise."*

---

## 2. Mechanism

The texture pass modulates RGB directly:

```js
const mod = grain * 35;        // 0..255 units
```

At typical grain magnitudes this is ~17/255 ≈ **0.067 relative luminance**.

Quantization maps luminance onto ramp position. A 7-anchor ramp has a step of
1/6 ≈ **0.167 luminance**.

So a single grain sample displaces a pixel by ~0.4 of a ramp step. Any pixel
within 0.4 steps of a band boundary crosses it. Because the grain is
high-frequency and per-pixel, while form shading is smooth and low-frequency —
the corpus asset measured carries only **19 distinct normals** — the noise
dominates band assignment at fine detail while the form dominates only at coarse
scale.

Crucially the texture amplitudes were **correct when authored**. Against a
continuous RGB output, 0.067 luminance is subtle grain. The output space changed
underneath them when quantization landed; nothing retuned them.

---

## 3. Evidence

Measured on `PolarisOS/worldpacks/shrine-demo/scdl/lightning-sword.scdl`.

### 3.1 Value variation is texture, not form

```
geometry only (no light, no atmosphere)   221 colours   <- texture grain alone
+ lighting                                301 colours   <- form contributes ~80
```

### 3.2 Band reassignment rate

```
pixels whose ramp step was changed by texture: 458/1623 = 28.2%
```

### 3.3 The flips are mid-band, not at seams

```
distance from band boundary -> % of pixels whose ramp step texture changed
  0.0-0.1 (at seam)      4.5%   (n=709)
  0.1-0.2                0.0%   (n=80)
  0.2-0.3               13.2%   (n=273)
  0.3-0.4               69.7%   (n=304)
  0.4-0.5 (mid-band)    69.3%   (n=257)
```

This refuted the first hypothesis. Seam-sparkle would concentrate at 0.0–0.1;
instead ~70% of *mid-band* pixels flip, meaning displacement routinely exceeds
half a step. Texture was not decorating bands, it was rewriting them.

(The low seam figure is partly an artefact: luminance 0 and 1 both bin as "at
boundary" but are clamped endpoints that cannot move outward.)

### 3.4 Amplitudes are uneven across materials

`BARK` 0.85 · `CLOUD` 0.60 · `METAL_GRAIN` 0.45 · `CRYSTAL` 0.30 · `FABRIC` 0.20

Bark receives nearly twice metal's displacement, so the most organic material
glossed hardest — the exact inverse of physical plausibility.

---

## 4. Fix

Two changes, both in the quantization boundary.

**Bounded grain.** Texture layers gained `maxLuminanceDelta`. The compiler sets
it relative to the material's own ramp step (`textureGrainSteps`, default 0.5),
so grain can texture a band but not reassign it. `null` outside quantization,
preserving prior continuous-output behaviour exactly.

**Ordered dither.** Quantization now resolves the fractional ramp position with a
Bayer 4×4 threshold rather than rounding. A region 40% of the way between two
anchors receives the brighter anchor in 40% of its cells. Gradation becomes
deliberate and positional instead of noise-driven, which is the standard
pixel-art technique for gradients inside a small palette.

The dither is sampled in **logical cell space, not output pixel space**. An
earlier iteration of the fix used output coordinates, which placed 256 dither
samples inside one logical cell at 8× and one at 1× — the pattern changed with
output size, destroying the scale-invariance quantization exists to provide.

`NEAREST_ANCHOR` is unaffected: it preserves hue and therefore has no ordered
axis to dither along.

---

## 5. Why this was hard to catch

Recorded because the failure class is worth recognising again.

1. **The symptom reads as a feature.** A glossy sword looks intentional. Nobody
   files "too shiny" as a defect, and a reviewer glancing at output sees a
   plausible material response.
2. **No test could fail.** Determinism held. Colour counts stayed plausible.
   Output was byte-stable across runs. There is no natural assertion that would
   have caught "grain displaces ramp index" — the property is not one anybody
   thinks to state.
3. **It is an interaction, not a unit defect.** The texture pass is correct in
   isolation. The quantizer is correct in isolation. The defect exists only in
   composition.
4. **It was created retroactively by a correct change.** The amplitudes were
   right for years against continuous output. Adding quantization — itself a
   fix — made existing correct code wrong without touching it. Blame-oriented
   search finds nothing: the commit that broke it did not modify it.
5. **Perceptible but unattributable.** The author saw the signature across the
   whole library and could not localise it. Aesthetic defects resist bisection
   because there is no failing case to bisect toward.
6. **Two wrong diagnoses during an active hunt.** It was first misattributed to
   palette drift (authored colour far off-ramp), then predicted to concentrate at
   band seams. Measurement refuted both. The correct mechanism was only visible
   by rendering with and without a single layer, quantizing both, and comparing
   per-pixel ramp assignment — an operation no normal workflow performs.

**Generalisation.** This is a sibling of the repository's "checks that cannot
fail" family, and arguably worse: a *defect that presents as a design choice*.
Where a check that cannot fail is silent, this one produces confident, plausible,
attractive output. The tell was not in any log or assertion — it was a human
noticing that everything looked subtly the same kind of wrong.

---

## 6. Standing law this implies

> Once output commits to a ramp, every modulation must be **index arithmetic**,
> not RGB arithmetic.

Lighting should offset the anchor index. Texture should dither between adjacent
indices. Grading should remap indices. Any pass still doing continuous RGB
arithmetic ahead of the quantizer is competing with the ramp, and will express
itself as unintended step displacement.

Two known violations remain outside this fix:

- `qbit-phosphorylation.js` `shadedHex()` selects an anchor and then multiplies
  its RGB by `0.4 + 0.6·lit`, smearing a discrete ramp back into a continuum.
  Offsetting the anchor index instead would keep it on-ramp and yield hue-shifted
  shadows for free.
- The VRI lighting pass adds `lightColor × contribution` in RGB before
  quantization. It is bounded in practice by the smoothness of form shading, but
  it is the same category.

---

## 7. Verification

```bash
npx vitest run tests/codex/core/pixelbrain/vixel/vri.test.js
```

143 passing, including seven new assertions covering: dither enabled by default,
dither yields at least as much gradation as rounding, dither sampled in logical
cell space (identical colour set at 4× and 8×), every dithered colour still on
the ramp, grain bounded to a fraction of the ramp step when quantizing, grain
unbounded when not, and `NEAREST_ANCHOR` unaffected by the dither flag.
