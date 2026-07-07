# Ambience Loop Credits

The focus-mode mixer currently exposes a **single channel** (Rain + Forest
Stream). The other loops below are kept on disk but are not wired into the
mixer for now — re-add their ids to `AMBIENCE_CHANNELS` in
`src/lib/ambient/ambienceMixer.service.js` to bring them back.

## Active channel

| Channel | File | Source | Author | License |
| --- | --- | --- | --- | --- |
| Rain + Forest Stream | rain-forest-stream.mp3 | A 120s seamless loop (crossfaded, normalized to ~-18 LUFS) cut from a user-supplied "Relaxing Rain Noise + Forest Stream" recording | Unknown — user-supplied | ⚠️ **Unverified.** Confirm you have the right to use this recording and fill in the real source/author/license before distributing. |

## Inactive (procedural CC0 placeholders, not currently mixed)

These loops are **procedurally generated placeholders** synthesized locally
with ffmpeg from filtered noise. They contain no third-party recordings and
carry no external copyright — released as CC0 / public domain. They exist so
the focus-mode mixer is audible out of the box; swap them for curated
recordings whenever you like.

| Channel | File | Source | Author | License |
| --- | --- | --- | --- | --- |
| Rain | rain.mp3 | Procedurally generated (ffmpeg `anoisesrc` pink noise, band-limited 500–9500 Hz) | Scholomance (placeholder) | CC0 |
| Café Plaza | cafe.mp3 | Procedurally generated (ffmpeg brown-noise murmur, bandpass ~900 Hz + 0.2 Hz tremolo, faint high "crockery" band) | Scholomance (placeholder) | CC0 |
| Wind through a house | wind.mp3 | Procedurally generated (ffmpeg brown noise, 45–450 Hz + 0.1 Hz breathy swell) | Scholomance (placeholder) | CC0 |

Each loop is 60s, 128 kbps stereo MP3, loudness-normalized to ~-18 LUFS so the
master slider has headroom. The LFO periods divide evenly into 60s (rain has
no LFO; café 0.2 Hz = 5s × 12; wind 0.1 Hz = 10s × 6) so each file loops
gaplessly with no audible seam.

**Swapping:** replace any file in place — filenames are the contract used by
`src/lib/ambient/ambienceMixer.service.js` (served at `/audio/ambience/<id>.mp3`).
When you drop in a real CC0 / public-domain recording, update its row above
with the actual Source URL, Author, and License.

## Recommended sourcing for real loops

- [freesound.org](https://freesound.org) — filter License = "Creative Commons 0".
- [Pixabay audio](https://pixabay.com/sound-effects/) — Pixabay Content License.

Target ~60–120s, ~128–192 kbps MP3, normalized to roughly -18 LUFS, and trim
at zero-crossings so the loop is gapless.
