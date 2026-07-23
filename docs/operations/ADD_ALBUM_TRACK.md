# Adding a Track to a Grimoire Album (Local Master)

The process used to add **Dry Mouth** to the *Scholomancer* album on 2026-07-19.
Applies to any locally-supplied Suno master (an `.mp3` handed over directly,
not streamed from the Suno CDN). The registry is pure data — no database, no
server step; everything lives in `src/pages/Visualiser/tracks/` plus one file
in `public/media/`.

## Honesty law (read first)

Every value in a track module must be **measured or reported, never invented**
(see `docs/scholomance-encyclopedia/Scholomance LAW/VAELRIX_LAW.md`). The
file's own ID3 tags are the source of truth for id, title, creation date and
lyrics. Duration is measured with ffprobe. Style/model come from Vaelrix if
the file doesn't declare them — and the module's header comment must say which
values came from where. No BPM/key claims unless someone measured them; a
track without a measured tempo simply omits `pacing` and falls back to
`DEFAULT_PACING`, which the UI already labels "estimated".

## Step 1 — Read the master's tags

```bash
ffprobe -v quiet -print_format json -show_format "path/to/Track Name.mp3"
```

You need four things from the output:

- **`tags.comment`** — Suno masters embed `made with suno;
  created=<ISO date>; id=<uuid>`. The uuid is the track id **and** the
  alignment artifact filename. The date becomes the "Released" meta row.
- **`tags.lyrics-eng`** — the canonical lyrics, verbatim.
- **`format.duration`** — seconds; round to the nearest integer for the
  `duration` field and note the raw value in the comment.
- **`tags.title` / `tags.artist`** — title as-is; artist is normalized to the
  persona name `Vaelrix`.

## Step 2 — Copy the master into public/media

```bash
cp "path/to/Track Name.mp3" public/media/<kebab-title>.mp3
```

The module will reference it BASE_URL-relative (`media/<kebab-title>.mp3`) so
it survives a deploy under a subpath — never an absolute `/media/...` path
(Same-Origin API Law applies to assets the same way).

## Step 3 — Create the track module

Create `src/pages/Visualiser/tracks/<kebab-title>.ts` exporting a
`GrimoireTrack` const. **Copy `brown-dwarf.ts` as the template** — it is the
canonical local-master shape. Fill in:

- `id` — the uuid from the comment tag.
- `duration` + `meta` Duration row (`m:ss`).
- `sunoUrl` — `https://suno.com/song/<uuid>`, derived from the embedded id.
  It is a provenance link; if you didn't open it, say "not verified live" in
  the header comment.
- `audioUrl` — `` `${import.meta.env.BASE_URL}media/<kebab-title>.mp3` ``.
- `coverUrl` — track-specific art if supplied, else the album art
  (`media/scholomancer-cover.png`).
- `lyrics` — verbatim from `lyrics-eng`, with two edits only: drop blank
  stanza-break lines and drop `[Section]` direction lines (`[Chorus]` etc.).
  The registry carries sung text only. **Do not fix typos or spacing** —
  the forced aligner and `alignmentArtifactContract` count word indices over
  exactly these lines.
- Header comment — restate which tag each value came from, quoting the
  comment tag verbatim.

## Step 4 — Wire it into the album and the shelf

Two files, three edits:

1. **`albums.ts`** — import the track (directly, never via `./index` — the
   barrel would create a circular dependency) and append
   `{ trackId: X.id, trackNumber: <next> }` to the album's `tracks`. Album
   running order is Damien's artistic choice — ask if it isn't "append".
2. **`index.ts`** — add the `export`, the `import`, and insert the track into
   `GRIMOIRE_TRACKS` in **chronological release order** (the shelf is
   chronological by the master's `created` date; it deliberately disagrees
   with album order — see the comment above `GRIMOIRE_TRACKS`).

## Step 5 — Verify

```bash
npm run scd64:intellisense -- src/pages/Visualiser/tracks/<kebab-title>.ts \
    src/pages/Visualiser/tracks/albums.ts src/pages/Visualiser/tracks/index.ts
npx vitest run tests/visualiser
```

If visualiser tests fail, **baseline the same suite at HEAD in a detached
worktree before blaming your change** (never `git stash` — the tree is always
dirty). As of 2026-07-19 there are 7 known-stale failures at HEAD
(`useAlbumAudioEngine` event transitions, `AlbumPage` aria canvas, and
`scholomancerSingle` still asserting the album's old 3-track/2-genre shape).
Only a *delta* against the HEAD baseline counts as your breakage.

Note: `tests/visualiser/scholomancerSingle.test.ts` pins the album's exact
track list, so it must be updated whenever a track is legitimately added —
but as of this writing it was already stale before Dry Mouth landed; fixing
it means re-pinning the whole current album shape, not just appending.

## Step 6 — Forced alignment (word-synced lyrics)

```bash
# lyrics.txt must match the module's lyrics[] EXACTLY — extract, don't retype:
node -e "
const fs = require('fs');
const src = fs.readFileSync('src/pages/Visualiser/tracks/<kebab-title>.ts', 'utf8');
const m = src.match(/lyrics: \[([\s\S]*?)\n  \]/);
const lines = [...m[1].matchAll(/^\s{4}\"((?:[^\"\\\\]|\\\\.)*)\",\$/gm)]
  .map(x => JSON.parse('\"' + x[1] + '\"'));
fs.writeFileSync('/tmp/lyrics.txt', lines.join('\n') + '\n');
"

.venv-align/bin/python scripts/align_lyrics.py \
    --audio public/media/<kebab-title>.mp3 \
    --lyrics /tmp/lyrics.txt \
    --track-id <uuid> \
    --review
```

- Pipeline: ffmpeg decode → Demucs htdemucs vocal separation → torchaudio
  MMS_FA forced alignment. Takes minutes on the Deck; run it in the
  background. This is **not** the whisperx `align-track.mts` script.
- Output lands at `public/data/alignment/<uuid>.alignment-v1.json` (+ a
  `.review.html` page). The frontend's `useLyricAlignment` picks it up by
  uuid automatically — no registration step.
- The script exits non-zero if *any* word fails to align, because the
  frontend rejects an artifact wholesale on a single null span. A failed run
  leaves the track on the estimated `DEFAULT_PACING` sync — that's a working
  state, not a blocker.
- Open the review HTML and spot-check a few lines before trusting the sync.
