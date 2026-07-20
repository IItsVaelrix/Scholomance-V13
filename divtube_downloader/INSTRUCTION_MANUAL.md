# DivTube_downloader — Instruction Manual

**Version 1.0-SNAPSHOT** (Determinism Engine · Cockpit UI)

---

## Table of Contents

1. [Overview](#1-overview)
2. [System Requirements](#2-system-requirements)
3. [Installation](#3-installation)
4. [Launching the Application](#4-launching-the-application)
5. [The TUI Interface](#5-the-tui-interface)
6. [Agent Commands](#6-agent-commands)
7. [Video Forge (Video Editor)](#7-video-forge-video-editor)
8. [TurboQuant SEO Plugin](#8-turboquant-seo-plugin)
9. [Provider & Session Commands](#9-provider--session-commands)
10. [Auto-Detection (Smart Paste)](#10-auto-detection-smart-paste)
11. [Configuration](#11-configuration)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Overview

DivTube_downloader is a **YouTube video downloader, video production suite, and YouTube SEO/content analysis toolkit** with a terminal-based graphical interface (TUI). It combines:

- **Java 21 backend** — handles downloads via `yt-dlp`, YouTube Data API v3 analysis, deterministic title rating
- **Python TUI frontend** (Textual framework) — modern terminal dashboard with chat interface, AI critique, video editing ("Video Forge"), and SEO intelligence
- **TurboQuant SEO Plugin** — zero-GPU local semantic vector search (Node.js) for title/content optimization
- **Content Critic** — AI-driven critique pipeline using LLMs (OpenAI, xAI, OpenCode) to score YouTube content against SEO frameworks

---

## 2. System Requirements

| Component | Requirement |
|---|---|
| **OS** | Linux (primary), macOS, Windows (via WSL) |
| **Python** | 3.10+ |
| **Java** | JDK 21 |
| **Node.js** | 18+ (required for TurboQuant SEO; cockpit works without it) |
| **External tools** | `yt-dlp` (downloads), `ffmpeg` / `ffprobe` (video rendering) |
| **Disk space** | ~500 MB for dependencies + downloaded videos |
| **API keys** | YouTube Data API v3 key, LLM provider API key (OpenAI/xAI/OpenCode) |

---

## 3. Installation

### 3.1 Quick start (recommended)

```bash
cd divtube_downloader
./run.sh
```

The `run.sh` script automatically:
1. Creates a Python virtual environment (`.venv`) if missing
2. Installs Python dependencies (`textual`, `rich`, `yt-dlp`, `Pillow`, `anthropic`)
3. Loads API keys from `.env`
4. Launches the TUI application

### 3.2 Manual setup

```bash
cd divtube_downloader

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install textual rich yt-dlp Pillow anthropic

# Verify Java 21 is available
java -version   # must show 21.x

# Set up environment
cp .env.example .env   # if available, otherwise edit .env directly
```

### 3.3 Environment variables (`.env`)

```
YOUTUBE_API_KEY=          # Google YouTube Data API v3 key (required for Intel)
CUSTOM_API_KEY=           # LLM API key (for /critique and /scholomance)
CUSTOM_API_BASE=          # LLM base URL (e.g. https://api.x.ai/v1 or https://opencode.ai/zen/v1)
CUSTOM_MODELS_URL=        # LLM model listing endpoint
```

> **Note:** The bundled `.env` already contains placeholder keys. Replace them with your own for production use.

---

## 4. Launching the Application

```bash
# From the divtube_downloader directory:
python3 -m tui.ui.app

# Or via the convenience launcher:
./run.sh
```

After launching, you will see the **DivTube Cockpit** banner and a terminal interface divided into:

```
╭──────────────────────────────────────────────────────╮
│ ✦  D I V T U B E   C O C K P I T  ✦                │
│     determinism engine · cockpit online              │
╰──────────────────────────────────────────────────────╯
```

---

## 5. The TUI Interface

The interface has four main areas:

- **Chat log** (center) — displays output, analysis results, and command feedback
- **Command input** (bottom) — type commands (prefixed with `/`) or paste YouTube URLs
- **Sidebar** (left) — quick-action buttons
- **Inspector** (right) — status panel

**Keyboard shortcuts:**
- `q` — Quit
- `c` — Clear chat log

**All commands are typed at the prompt and start with `/`.**

---

## 6. Agent Commands

### `/analyze <url>`

Analyze a YouTube video's metadata without downloading.

```
/analyze https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

Returns: title, channel, duration, thumbnail URL, and other metadata.

### `/download <url>`

Download a YouTube video. The system will:
1. Analyze the URL first
2. Prompt you to confirm you have rights to download
3. Download in the configured quality

```
/download https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

### `/critique <file> [model]`

Run an AI critique on a JSON file containing video/content data. Saves results to `reports/` and stores in SQLite memory.

```
/critique my_video.json
/critique my_video.json gpt-4
```

### `/scholomance <file>`

Deep analysis using the Scholomance engine — applies the full critique pipeline with specialized system prompts.

```
/scholomance content.md
```

### `/thumbnail <image_path>`

Analyze a thumbnail image for SEO effectiveness. Scores:
- **< 50** — needs improvement (red)
- **50–74** — decent (yellow)
- **75+** — good (green)

Metrics: silhouette, contrast, color separation, composition flags.

```
/thumbnail thumbnails/my_thumbnail.png
```

### `/apply-patch <file.json>`

Apply AI-generated patches from a previous `/critique` report to a JSON file. The critique report must contain a JSON `patches` block.

```
/apply-patch my_video.json
```

### `/model`

Open an interactive model selector to switch between available LLM models (free vs paid).

```
/model
```

### `/memory`

Show the number of stored critique memory cells in SQLite.

```
/memory
```

---

## 7. Video Forge (Video Editor)

The Video Forge is a timeline-based video editor with full project management.

### Project management

| Command | Description |
|---|---|
| `/forge new <name>` | Create a new video project |
| `/forge list` | List saved projects |
| `/forge open <id>` | Open an existing project |
| `/forge project` | Show current project info |
| `/forge recipe` | Dump full project as JSON (AI-editable) |
| `/forge apply <file>` | Load a modified JSON recipe |

### Media management

| Command | Description |
|---|---|
| `/forge import <path>` | Import a media file (video/audio/image/subtitle) |
| `/forge timeline` | Show the current timeline |
| `/forge delete <clip_id>` | Remove a clip |
| `/forge duplicate <clip_id>` | Duplicate a clip |
| `/forge mute <clip_id>` | Toggle mute on a clip |
| `/forge detach-audio <clip_id>` | Detach audio from a clip |

### Editing

| Command | Description |
|---|---|
| `/forge trim <clip_id> <start> <end>` | Trim a clip (time in seconds) |
| `/forge split <clip_id> <time>` | Split a clip at a given time |
| `/forge move <clip_id> <index>` | Move a clip on the timeline |

### Transitions & effects

| Command | Description |
|---|---|
| `/forge transition <from> <to> <type> <dur>` | Add transition between clips |
| `/forge effect <clip_id> <name>` | Apply an effect to a clip |
| `/forge transitions` | List available transitions |
| `/forge effects` | List available effects |

**Available transitions:** fade, crossfade, dissolve, slide_left, slide_right, slide_up, slide_down, push_left, push_right, wipe_left, wipe_right, zoom_in, zoom_out, spin, page_curl, radial, cube, ripple, blur_transition

**Available effects:** grayscale, sepia, vintage, blur, sharpen, edge_detect, pixelate, glitch, vignette, saturate, hue_shift, invert, night_vision, thermal, cartoon, sketch, oil_paint, watercolor, neon_glow, chroma_key

### Text overlays

| Command | Description |
|---|---|
| `/forge add-title <text>` | Add a title card |
| `/forge add-caption <text>` | Add a caption overlay |
| `/forge add-credit <text>` | Add a credit card |

### Audio

| Command | Description |
|---|---|
| `/forge music <path>` | Add background music track |
| `/forge narration <path>` | Add narration track |

### Export

| Command | Description |
|---|---|
| `/forge export <preset>` | Render project to video file |
| `/forge presets` | List export presets |
| `/forge ledger` | Show render history |

**Available export presets:** `youtube_1080p_mp4`, `youtube_4k_mp4`, `shorts_1080x1920`, `tiktok_1080x1920`, `instagram_1080x1080`, `twitter_720p_mp4`, `audio_mp3`, `audio_wav`, `source_match`, and more.

### Special

| Command | Description |
|---|---|
| `/forge snapshot <clip_id>` | Save a snapshot frame as image |
| `/forge freeze <clip_id>` | Create a freeze-frame clip |

---

## 8. TurboQuant SEO Plugin

Zero-GPU local semantic search engine. Commands require Node.js ≥ 18. If Node is unavailable, the cockpit still launches but these commands report as offline.

### Golden Curve management

A "Golden Curve" is a vectorized reference text (e.g., a top-performing video title/description) that other content is compared against.

| Command | Description | Example |
|---|---|---|
| `/register-golden <name> <text>` | Store text as a named Golden Curve | `/register-golden speedrun-god "insane glitchless any% world record"` |
| `/list-curves` | List all saved Golden Curves | `/list-curves` |
| `/delete-curve <name>` | Delete a Golden Curve | `/delete-curve speedrun-god` |

### Scoring & analysis

| Command | Description | Example |
|---|---|---|
| `/score-title "Title" --curve <name>` | Score a single title vs a curve (0–100%) | `/score-title "My Title" --curve speedrun-god` |
| `/test-titles --curve <name> "A" "B"` | A/B rank multiple titles vs a curve | `/test-titles --curve speedrun-god "Title A" "Title B"` |
| `/analyze-gaps --target <name> "text"` | Find missing semantic concepts | `/analyze-gaps --target speedrun-god "my draft"` |
| `/search-similar "text" -k 5` | k-Nearest Neighbor search across all curves | `/search-similar "draft description" -k 5` |

### Pack import/export

| Command | Description | Example |
|---|---|---|
| `/export-pack <file>` | Export all curves to a portable `.goldenpack` file | `/export-pack gaming-niche` |
| `/import-pack <file>` | Import curves from a `.goldenpack` file | `/import-pack gaming-niche` |

### Embedders (vectorizers)

The plugin supports three vectorizers, tried in order:

1. **Turbovec** (`turbovec1`) — bespoke domain-adapted embeddings with IDF weighting and OOV resolution. Build with: `python3 embeddings/build_turbovec.py`
2. **GloVe** (`glove50`) — generic mean-pooled embeddings
3. **Hashing** (`hash512`) — lexical fallback when no pack is present

---

## 9. Provider & Session Commands

### API provider configuration

| Command | Description |
|---|---|
| `/provider <name>` | Set API provider (`openai`, `xai`, `opencode`, `router`, `gemini`, `qwen`/`token-plan` Token Plan, `qwen-paygo` DashScope paygo, `qwen-cn` China, or a custom base URL) |
| `/apikey <key>` | Set API key (saved to `.env`) |
| `/release` | Release internal tool gates and API 429 cooldowns |

### Session

| Command | Description |
|---|---|
| `/clear` | Clear the chat log |
| `/help` | Show all available commands |
| `/divtube` | Return to the main DivTube screen (if in Video Forge) |
| `/exit` | Quit the application |

---

## 10. Auto-Detection (Smart Paste)

When you paste content at the prompt, the app auto-detects the type:

| Pasted content | Action |
|---|---|
| YouTube URL (`youtube.com` or `youtu.be`) | Auto-runs `/analyze` |
| File path ending in `.json` | Pre-fills `/critique <path>` |
| File path ending in `.png`, `.jpg`, `.jpeg`, `.webp` | Pre-fills `/thumbnail <path>` |
| File path ending in `.md` | Pre-fills `/scholomance <path>` |

---

## 11. Configuration

### TUI config (`tui_config.json`)

```json
{
    "ui": {
        "theme": "void_cyan",
        "show_sidebar": true,
        "stream_output": true
    }
}
```

### Niche packs

Pre-configured strategies for content categories. Load with:

- `music.nichepack` — music content SEO strategies
- `commentary.nichepack` — commentary content SEO strategies

Custom niche packs can be imported via `/import-pack`.

### Intel pipeline weights (in `intel/pipeline.py`)

```python
"thumbnail": 0.25,   # 25% weight
"title":     0.30,   # 30% weight
"tag":       0.20,   # 20% weight
"performance": 0.25  # 25% weight
```

### YouTube analysis thresholds (in `YouTubeAnalysisConfig.java`)

- **VIRAL**: ≥ 10,000 views/day
- **STRONG**: ≥ 1,000 views/day
- **STABLE**: ≥ 100 views/day

---

## 12. Troubleshooting

### "TurboQuant plugin offline"
- Ensure Node.js ≥ 18 is installed and on your PATH
- Verify with: `node --version`

### "Java not found" or Gradle errors
- Ensure JDK 21 is installed
- Set `JAVA_HOME` explicitly: `export JAVA_HOME=/path/to/jdk-21`
- The `run.sh` script auto-detects a VSCode JDK path — edit it if you use a different JDK

### "yt-dlp not found"
- Install yt-dlp: `pip install yt-dlp` or `sudo apt install yt-dlp`
- The Java backend calls `yt-dlp` as an external process

### "YouTube API key not configured"
- Add your YouTube Data API v3 key to `.env`: `YOUTUBE_API_KEY=your_key_here`
- Get a key from: https://console.cloud.google.com/apis/credentials

### "No module named 'tui'"
- Run from the `divtube_downloader` directory (the project root)
- Ensure the virtual environment is activated

### Download fails / "Rights confirmation"
- The `LegalPolicyGuard` requires explicit user confirmation
- Check the chat output for prompts and respond accordingly

### Video Forge rendering fails
- Ensure `ffmpeg` and `ffprobe` are installed: `sudo apt install ffmpeg`
- Verify with: `ffmpeg -version`

### Logs and reports
- Critique reports are saved to: `reports/`
- Downloaded videos go to: `./downloads/` (configurable)
- Thumbnail analyses are cached in: `thumbnails/`
- Video Forge projects are stored in: `video_forge/projects/`
- Render history: `/forge ledger`

---

*Generated from DivTube_downloader v1.0-SNAPSHOT — Scholomance ecosystem*
