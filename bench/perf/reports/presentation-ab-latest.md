# Presentation Pass — Before/After Performance Report

**Collected:** 2026-07-17T14:08:07.328Z  
**Sample window:** 6000ms per condition  
**Viewport:** 1280×720  
**Base:** http://127.0.0.1:4173  
**Method:** Same build; BEFORE re-injects the pre-pass compositor knobs (sidebar/panel `backdrop-filter`, FFT/stage `mix-blend-mode`, full-bleed scanlines, canvas `shadowBlur` stroke tax). AFTER is the current tree.

## Frame budget

| Route | Metric | Before | After | Δ % |
| --- | --- | --- | --- | --- |
| /listen | FPS (avg) | 60 | 60 | 0% |
| /listen | p95 frame ms | 16.8 | 16.8 | 0% |
| /listen | % frames >16.7ms | 61.4% | 60.6% | -1.3% |
| /listen | % frames >20ms | 0% | 0% | 0% |
| /visualiser | FPS (avg) | 54.2 | 60 | +10.7% |
| /visualiser | p95 frame ms | 33.3 | 16.7 | -49.8% |
| /visualiser | % frames >16.7ms | 64.6% | 63.1% | -2.3% |
| /visualiser | % frames >20ms | 5.5% | 0% | -100% |

## Compositor inventory

| Route | Metric | Before | After |
| --- | --- | --- | --- |
| /listen | mix-blend layers | 0 | 0 |
| /listen | backdrop-filter layers | 0 | 0 |
| /listen | canvas count | 0 | 0 |
| /visualiser | mix-blend layers | 1 | 0 |
| /visualiser | backdrop-filter layers | 7 | 1 |
| /visualiser | canvas count | 4 | 4 |

## What changed (and how it shows up in the numbers)

| Change | Mechanism | Expected signal |
|---|---|---|
| Opaque HUD / panels | Stop `backdrop-filter` sampling live WebGL/canvas every frame | Fewer glass layers; lower `pctOver16` / `pctOver20` |
| Drop CSS `mix-blend-mode` on mandala / scanlines | Additive look stays in-canvas (`lighter`); compositor skips per-frame blend | Fewer blend layers; smoother p95 |
| Scope Listen CRT scanlines to cockpit | Less translucent full-viewport cover over Phaser | Lower over-budget % |
| Spectrum RAF parks when standby/hidden | Third paint loop not competing with Phaser+FFT idle | Higher idle FPS on /listen |
| Remove canvas `shadowBlur` (spectrum / MiniWave) | Same class of fill-rate tax already banned on the mandala | Lower p95 when those strokes fire |
| Cap DPR on coarse/low-core + pause off-screen Visualiser RAFs | Smaller buffers; no paint when scrolled away | Visualiser FPS / over-budget improvement |

## Raw

```json
[
  {
    "route": "/listen",
    "mode": "before",
    "inventory": {
      "canvasCount": 0,
      "canvases": [],
      "blendedLayers": 0,
      "glassLayers": 0
    },
    "frames": {
      "frames": 360,
      "avgMs": 16.67,
      "p50Ms": 16.7,
      "p95Ms": 16.8,
      "fps": 60,
      "pctOver16": 61.4,
      "pctOver20": 0,
      "pctOver33": 0
    }
  },
  {
    "route": "/listen",
    "mode": "after",
    "inventory": {
      "canvasCount": 0,
      "canvases": [],
      "blendedLayers": 0,
      "glassLayers": 0
    },
    "frames": {
      "frames": 360,
      "avgMs": 16.67,
      "p50Ms": 16.7,
      "p95Ms": 16.8,
      "fps": 60,
      "pctOver16": 60.6,
      "pctOver20": 0,
      "pctOver33": 0
    }
  },
  {
    "route": "/visualiser",
    "mode": "before",
    "inventory": {
      "canvasCount": 4,
      "canvases": [
        {
          "className": "bcv-miniwave",
          "w": 128,
          "h": 38,
          "cssW": 128,
          "cssH": 38,
          "area": 4864,
          "parentBlend": "normal",
          "parentFilter": "blur(4px)"
        },
        {
          "className": "bcv-miniwave",
          "w": 128,
          "h": 38,
          "cssW": 128,
          "cssH": 38,
          "area": 4864,
          "parentBlend": "normal",
          "parentFilter": "blur(4px)"
        },
        {
          "className": "bcv-miniwave",
          "w": 128,
          "h": 38,
          "cssW": 128,
          "cssH": 38,
          "area": 4864,
          "parentBlend": "normal",
          "parentFilter": "blur(4px)"
        },
        {
          "className": "bcv-canvas",
          "w": 223,
          "h": 223,
          "cssW": 223,
          "cssH": 223,
          "area": 49729,
          "parentBlend": "normal",
          "parentFilter": "none"
        }
      ],
      "blendedLayers": 1,
      "glassLayers": 7
    },
    "frames": {
      "frames": 325,
      "avgMs": 18.46,
      "p50Ms": 16.7,
      "p95Ms": 33.3,
      "fps": 54.2,
      "pctOver16": 64.6,
      "pctOver20": 5.5,
      "pctOver33": 3.4
    }
  },
  {
    "route": "/visualiser",
    "mode": "after",
    "inventory": {
      "canvasCount": 4,
      "canvases": [
        {
          "className": "bcv-miniwave",
          "w": 128,
          "h": 38,
          "cssW": 128,
          "cssH": 38,
          "area": 4864,
          "parentBlend": "normal",
          "parentFilter": "none"
        },
        {
          "className": "bcv-miniwave",
          "w": 128,
          "h": 38,
          "cssW": 128,
          "cssH": 38,
          "area": 4864,
          "parentBlend": "normal",
          "parentFilter": "none"
        },
        {
          "className": "bcv-miniwave",
          "w": 128,
          "h": 38,
          "cssW": 128,
          "cssH": 38,
          "area": 4864,
          "parentBlend": "normal",
          "parentFilter": "none"
        },
        {
          "className": "bcv-canvas",
          "w": 223,
          "h": 223,
          "cssW": 223,
          "cssH": 223,
          "area": 49729,
          "parentBlend": "normal",
          "parentFilter": "none"
        }
      ],
      "blendedLayers": 0,
      "glassLayers": 1
    },
    "frames": {
      "frames": 360,
      "avgMs": 16.67,
      "p50Ms": 16.7,
      "p95Ms": 16.7,
      "fps": 60,
      "pctOver16": 63.1,
      "pctOver20": 0,
      "pctOver33": 0
    }
  }
]
```
