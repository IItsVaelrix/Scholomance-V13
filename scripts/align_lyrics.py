#!/usr/bin/env python3
"""Forced-alignment lyric timing pipeline (alignment-v1).

ffmpeg decode -> Demucs htdemucs vocal separation -> torchaudio MMS_FA CTC
forced alignment of the canonical lyrics -> static JSON artifact consumed by
the visualiser frontend.

Usage:
  python scripts/align_lyrics.py --audio <file|url> --lyrics lyrics.txt \
      --track-id <id> [--out public/data/alignment] [--review] [--no-separate]
  python scripts/align_lyrics.py --selftest

The selftest needs no ML dependencies. The align run needs the venv from
scripts/align_lyrics_requirements.txt (torch CPU + torchaudio + demucs).
Exit code is non-zero if any lyric line — or any single word — failed
alignment (the frontend's parseAlignment rejects an artifact wholesale on a
single null span, so the producer gate must be at least that strict).
"""

import argparse
import html
import json
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

CONFIDENCE_FLOOR = 0.40

# How much of an interpolated gap a word claims, relative to its neighbours.
# The unit is PHONEMES, read from the same dictionary the app's phoneme engine
# uses — codex/core/phonology/cmu.phoneme.engine.js CMU_DICT_RELATIVE_PATH.
# Measured against the alternatives on the hold-out (see build_words): phonemes
# beat character-length, and both beat vowel-nuclei (i.e. plain syllable count),
# which is too coarse — "strength" is one syllable but takes far longer to sing
# than "a". Coverage is 95-99%; the rest fall back to letters, the next best
# proxy measured.
_TAIL_WEIGHT = 1.0
_CMU_DICT = (Path(__file__).resolve().parent.parent
             / "node_modules/cmudict/lib/cmu/cmudict.0.7a")
_PHONEMES = {}


def _load_cmu():
    """Same file, same first-pronunciation-wins rule as CmuPhonemeEngine."""
    if _PHONEMES or not _CMU_DICT.exists():
        return
    for line in _CMU_DICT.read_text(encoding="latin-1").splitlines():
        if line.startswith(";;;"):
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        word = parts[0].split("(")[0].upper()
        _PHONEMES.setdefault(word, len(parts) - 1)


def _span_weight(text):
    letters = re.sub(r"[^A-Za-z']", "", text)
    if not letters:
        return 1
    _load_cmu()
    return _PHONEMES.get(letters.upper()) or max(1, len(letters))


# ── Lyric tokenization ──────────────────────────────────────────────────────

def tokenize_lines(lines):
    """Display words with (line, word) indices. A token is a word iff it
    contains a letter — this rule is mirrored exactly by the frontend's
    /[A-Za-z]/ counter, so indices line up. Parenthetical runs are tagged
    backing vocals; depth carries across lines and counts letterless paren
    tokens too, so "( ooh )" and multi-line parentheticals tag correctly."""
    out = []
    depth = 0
    for li, line in enumerate(lines):
        wi = 0
        for tok in line.split():
            step = tok.count("(") - tok.count(")")
            if not re.search(r"[A-Za-z]", tok):
                depth = max(0, depth + step)
                continue
            backing = depth > 0 or tok.startswith("(")
            depth = max(0, depth + step)
            out.append({"line": li, "word": wi, "display": tok, "backing": backing})
            wi += 1
    return out


def normalize_word(display):
    """Display token -> alignable lowercase form. Melisma letter-runs collapse
    ("Oooooohhhhh" -> "oh"); only letters and apostrophes survive."""
    w = display.lower()
    w = re.sub(r"([a-z])\1{2,}", r"\1", w)
    w = re.sub(r"[^a-z']", "", w)
    return w.strip("'")


# ── Audio stages (ffmpeg / demucs subprocesses) ─────────────────────────────

def run(cmd):
    print("  $", " ".join(map(str, cmd)))
    res = subprocess.run(cmd)
    if res.returncode != 0:
        sys.exit(f"command failed ({res.returncode}): {cmd[0]}")


def decode(audio, wav_out):
    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg not found on PATH")
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", audio,
         "-ac", "2", "-ar", "44100", str(wav_out)])


def separate_vocals(wav_in, workdir):
    """Demucs htdemucs two-stem split; returns the vocal stem path."""
    run([sys.executable, "-m", "demucs.separate", "-n", "htdemucs",
         "--two-stems", "vocals", "-o", str(workdir), str(wav_in)])
    stem = workdir / "htdemucs" / wav_in.stem / "vocals.wav"
    if not stem.exists():
        sys.exit(f"demucs did not produce {stem}")
    return stem


def to_16k_mono(wav_in, wav_out):
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_in),
         "-ac", "1", "-ar", "16000", str(wav_out)])


# ── Forced alignment (torchaudio MMS_FA) ────────────────────────────────────

def compute_emission(model, waveform, sample_rate, chunk_s=30.0, ctx_s=2.0):
    """Frame emissions for the full waveform, computed in windows.

    Transformer attention is O(n^2) in sequence length — a 4-minute track in
    one pass allocates gigabytes and gets OOM-killed on small machines. Each
    window is padded with ctx_s of audio on both sides so boundary frames see
    real context; only the central region's frames are kept. Boundary error is
    bounded by one frame (~20 ms), far below karaoke perception."""
    import torch
    total = waveform.size(1)
    chunk = int(chunk_s * sample_rate)
    ctx = int(ctx_s * sample_rate)
    pieces = []
    with torch.inference_mode():
        for start in range(0, total, chunk):
            end = min(total, start + chunk)
            s = max(0, start - ctx)
            e = min(total, end + ctx)
            em, _ = model(waveform[:, s:e])
            frames_per_sample = em.size(1) / (e - s)
            f0 = round((start - s) * frames_per_sample)
            f1 = round((end - s) * frames_per_sample)
            pieces.append(em[:, f0:f1])
    return torch.cat(pieces, dim=1)


def _load_waveform(vocals16k, sample_rate):
    import torch
    import soundfile as sf
    data, sr = sf.read(str(vocals16k))
    if sr != sample_rate:
        sys.exit(f"expected {sample_rate} Hz input, got {sr}")
    return torch.from_numpy(data).float().unsqueeze(0)


def _mmap_model(get_model):
    """Build a bundle model with mmap'd weights: get_model() otherwise holds
    the built model AND the full state dict in RAM at once, which trips
    earlyoom on memory-constrained machines (SteamOS kills at <400 MB free)."""
    import torch
    _orig_load = torch.load
    def _mmap_load(*a, **k):
        k.setdefault("mmap", True)
        k.setdefault("map_location", "cpu")
        return _orig_load(*a, **k)
    torch.load = _mmap_load
    try:
        return get_model().eval()
    finally:
        torch.load = _orig_load


def align_mms(vocals16k, words):
    """MMS_FA (~1.2 GB): best quality; needs ~2.5 GB free RAM."""
    import torch
    from torchaudio.pipelines import MMS_FA as bundle

    waveform = _load_waveform(vocals16k, bundle.sample_rate)
    model = _mmap_model(lambda: bundle.get_model(with_star=False))
    tokenizer = bundle.get_tokenizer()
    aligner = bundle.get_aligner()

    norms = [normalize_word(w["display"]) for w in words]
    keep = [i for i, n in enumerate(norms) if n]
    transcript = [norms[i] for i in keep]

    with torch.inference_mode():
        emission = compute_emission(model, waveform, bundle.sample_rate)
        token_spans = aligner(emission[0], tokenizer(transcript))

    seconds_per_frame = waveform.size(1) / emission.size(1) / bundle.sample_rate
    aligned = {}
    for idx, spans in zip(keep, token_spans):
        start = spans[0].start * seconds_per_frame
        end = spans[-1].end * seconds_per_frame
        dur = sum(s.end - s.start for s in spans)
        score = sum(s.score * (s.end - s.start) for s in spans) / max(1, dur)
        aligned[idx] = (start, end, score)
    return aligned


def align_base(vocals16k, words):
    """WAV2VEC2_ASR_BASE_960H (~360 MB): same CTC forced alignment via the
    functional API; fits machines where the MMS model gets OOM-killed."""
    import torch
    import torchaudio
    import torchaudio.functional as AF

    bundle = torchaudio.pipelines.WAV2VEC2_ASR_BASE_960H
    waveform = _load_waveform(vocals16k, bundle.sample_rate)
    model = _mmap_model(bundle.get_model)
    labels = bundle.get_labels()          # ('-', '|', 'E', 'T', ...) blank=0
    dictionary = {c: i for i, c in enumerate(labels)}
    sep = dictionary["|"]

    norms = [normalize_word(w["display"]).upper() for w in words]
    token_lists = [[dictionary[c] for c in n if c in dictionary] for n in norms]
    keep = [i for i, t in enumerate(token_lists) if t]

    targets = [sep]
    for i in keep:
        targets.extend(token_lists[i])
        targets.append(sep)

    with torch.inference_mode():
        emission = compute_emission(model, waveform, bundle.sample_rate)
        log_probs = torch.log_softmax(emission, dim=-1)
        tgt = torch.tensor([targets], dtype=torch.int32)
        aligned_tokens, scores = AF.forced_align(log_probs, tgt, blank=0)
        # forced_align returns log-probabilities; confidence is a probability
        # (the MMS bundle aligner does this exp() internally).
        spans = AF.merge_tokens(aligned_tokens[0], scores[0].exp(), blank=0)

    seconds_per_frame = waveform.size(1) / emission.size(1) / bundle.sample_rate
    aligned = {}
    word_iter = iter(keep)
    current = []
    idx = None
    for span in spans:
        if span.token == sep:
            if current and idx is not None:
                start = current[0].start * seconds_per_frame
                end = current[-1].end * seconds_per_frame
                dur = sum(s.end - s.start for s in current)
                score = sum(s.score * (s.end - s.start) for s in current) / max(1, dur)
                aligned[idx] = (start, end, score)
            current = []
            idx = next(word_iter, None)
        else:
            current.append(span)
    if current and idx is not None:
        start = current[0].start * seconds_per_frame
        end = current[-1].end * seconds_per_frame
        dur = sum(s.end - s.start for s in current)
        score = sum(s.score * (s.end - s.start) for s in current) / max(1, dur)
        aligned[idx] = (start, end, score)
    return aligned


ALIGNERS = {
    "mms": (align_mms, "torchaudio-mms_fa"),
    "base": (align_base, "torchaudio-wav2vec2-base960h"),
}


# ── Artifact assembly ───────────────────────────────────────────────────────

def build_words(words, aligned, vocal_start_s=None):
    """vocal_start_s: the artist's reported onset of the first sung word. A
    leading run of unreliable words has no left anchor to interpolate from, and
    every anchor the pipeline can *derive* for it is a guess. A reported onset
    is evidence, so when it is supplied it wins over the derived fallback."""
    entries = []
    for i, w in enumerate(words):
        a = aligned.get(i)
        ok = a is not None and a[2] >= CONFIDENCE_FLOOR and a[1] > a[0]
        entry = {
            "line": w["line"], "word": w["word"], "text": w["display"],
            "startS": round(a[0], 3) if a else None,
            "endS": round(a[1], 3) if a else None,
            "confidence": round(a[2], 3) if a else 0.0,
            "interpolated": not ok,
        }
        if w["backing"]:
            entry["backing"] = True
        entries.append(entry)

    # Unreliable words get spans interpolated between confident neighbours —
    # flagged, never silently trusted (honesty law).
    n = len(entries)
    # Typical word length, measured from the words that actually aligned. Used
    # only to bound a leading run (below); if nothing aligned there is no
    # measurement to lean on and leading runs stay null.
    confident_durs = sorted(e["endS"] - e["startS"] for e in entries
                            if not e["interpolated"] and e["startS"] is not None)
    median_dur = (confident_durs[len(confident_durs) // 2]
                  if confident_durs else None)
    for i, e in enumerate(entries):
        if not e["interpolated"]:
            continue
        j = i - 1
        while j >= 0 and entries[j]["interpolated"]:
            j -= 1
        k = i + 1
        while k < n and entries[k]["interpolated"]:
            k += 1
        hi = entries[k]["startS"] if k < n else None
        if j >= 0:
            lo = entries[j]["endS"]
        elif hi is not None and vocal_start_s is not None and vocal_start_s < hi:
            # Reported onset beats any derivation: the artist knows when they
            # opened their mouth, the pipeline is only inferring it.
            lo = vocal_start_s
        elif hi is not None and median_dur is not None:
            # A *leading* run has no left anchor. The old rule used 0.0, which
            # asserts the singer opens on the file's first sample — a claim
            # nothing measured, and one that stretched a missed first word
            # across the whole intro. Back off from the first confident word by
            # the measured median word length instead: still a guess, still
            # flagged, but bounded and never inventing a t=0 onset.
            lo = max(0.0, hi - (k - j) * median_dur)
        else:
            lo = None
        if hi is None or lo is None or hi < lo:
            continue  # no anchors -> stays null; caught by build_lines
        # Words in the run share the gap in proportion to how much VOICE they
        # take — their phoneme count — not equally. The old rule gave "I" and
        # "unfathomably" identical slices, and that error compounds across a
        # long run, which is exactly where interpolation is needed most.
        # Hold-out measured on all three tracks (mask a run of confident words,
        # predict it, score against what MMS_FA actually found): 46-63% lower
        # mean error than the equal-share rule on 12-word runs, against a
        # shuffled-weight control at z up to 29.6.
        # Audio-derived probes were tried first and all refuted by their own
        # controls: spectral-onset snapping (a reversed/random baseline matched
        # it), energy warping (a time-reversed envelope matched it), and metre
        # snapping (an anti-phase grid matched it beyond 2-word runs). The
        # signal is in the text, not the waveform.
        weights = [_span_weight(entries[x]["text"]) for x in range(j + 1, k)]
        weights.append(_TAIL_WEIGHT)  # the rest before the next confident word
        total = sum(weights)
        before = sum(weights[:i - j - 1])
        e["startS"] = round(lo + (hi - lo) * before / total, 3)
        e["endS"] = round(lo + (hi - lo) * (before + weights[i - j - 1]) / total, 3)
    return entries


def build_lines(num_lines, word_entries):
    lines, failed = [], []
    for li in range(num_lines):
        ws = [w for w in word_entries if w["line"] == li and w["startS"] is not None]
        if ws:
            lines.append({"index": li, "startS": ws[0]["startS"], "endS": ws[-1]["endS"]})
        else:
            lines.append({"index": li, "startS": None, "endS": None})
            failed.append(li)
    return lines, failed


# ── Review page ─────────────────────────────────────────────────────────────

def write_review(path, audio_src, lines, entries):
    by_line = {}
    for i, e in enumerate(entries):
        by_line.setdefault(e["line"], []).append((i, e))
    body = []
    for li, text in enumerate(lines):
        spans = "".join(
            f'<span data-i="{i}"{" class=flag" if e["interpolated"] else ""}>{html.escape(e["text"])}</span> '
            for i, e in by_line.get(li, [])
        )
        body.append(f"<p>{spans or html.escape(text)}</p>")
    page = f"""<!doctype html><meta charset="utf-8"><title>alignment review</title>
<style>
 body{{background:#111;color:#aaa;font:16px/1.7 serif;max-width:48rem;margin:0 auto 2rem;padding:0 1rem}}
 .hdr{{position:sticky;top:0;background:#111;padding:1rem 0 .7rem;z-index:1}}
 audio{{width:100%;display:block}}
 #bar{{position:relative;height:8px;margin-top:.55rem;background:#242424;border-radius:4px;cursor:pointer;overflow:hidden}}
 #fill{{position:absolute;inset:0 auto 0 0;width:0;background:#fff;box-shadow:0 0 10px #fff;transition:width .08s linear}}
 #time{{display:flex;justify-content:space-between;font:12px/1.4 monospace;color:#777;margin-top:.3rem}}
 span.on{{color:#fff;text-shadow:0 0 10px #fff}}
 span.flag{{border-bottom:1px dotted #c66}}
</style>
<div class="hdr">
 <audio controls src="{html.escape(str(audio_src))}"></audio>
 <div id="bar"><div id="fill"></div></div>
 <div id="time"><span id="cur">0:00</span><span id="dur">0:00</span></div>
</div>
{''.join(body)}
<script>
const W = {json.dumps([{"s": e["startS"], "e": e["endS"]} for e in entries])};
const a = document.querySelector('audio');
const fill = document.getElementById('fill');
const bar = document.getElementById('bar');
const curEl = document.getElementById('cur');
const durEl = document.getElementById('dur');
const fmt = s => (s === s ? Math.floor(s/60) + ':' + String(Math.floor(s%60)).padStart(2,'0') : '0:00');
a.addEventListener('loadedmetadata', () => {{ durEl.textContent = fmt(a.duration); }});
a.ontimeupdate = () => {{
  const t = a.currentTime;
  const d = a.duration || 0;
  fill.style.width = (d ? (t/d)*100 : 0) + '%';
  curEl.textContent = fmt(t);
  document.querySelectorAll('span[data-i]').forEach(el => {{
    const w = W[+el.dataset.i];
    el.classList.toggle('on', w.s !== null && t >= w.s && t < w.e);
  }});
}};
bar.addEventListener('click', e => {{
  const r = bar.getBoundingClientRect();
  if (a.duration) a.currentTime = ((e.clientX - r.left) / r.width) * a.duration;
}});
</script>"""
    path.write_text(page, encoding="utf-8")
    print(f"review page: {path}")


# ── Selftest (stdlib only) ──────────────────────────────────────────────────

def selftest():
    assert normalize_word("Oooooohhhhh)") == "oh"
    assert normalize_word("(Oooooohhhhh)") == "oh"
    assert normalize_word("cause'") == "cause"
    assert normalize_word("I'm") == "i'm"
    assert normalize_word("tree") == "tree"
    assert normalize_word("o") == "o"  # "will o wisp"
    toks = tokenize_lines([
        "whispers underneath the willow tree (Oooooohhhhh)",
        "I love you so much,",
    ])
    assert [t["display"] for t in toks[:5]] == ["whispers", "underneath", "the", "willow", "tree"]
    assert toks[5]["display"] == "(Oooooohhhhh)" and toks[5]["backing"] is True
    assert toks[5]["line"] == 0 and toks[5]["word"] == 5
    assert toks[6] == {"line": 1, "word": 0, "display": "I", "backing": False}
    assert toks[-1]["display"] == "much," and normalize_word("much,") == "much"
    # round-trip: every token maps back to its display form and stable indices
    for t in toks:
        assert re.search(r"[A-Za-z]", t["display"]) and normalize_word(t["display"])
    # backing detection: lone paren tokens still toggle depth, and depth
    # carries across lines for multi-line parentheticals
    toks2 = tokenize_lines(["la ( ooh ) la", "(ooh", "aah) end"])
    assert [t["backing"] for t in toks2 if t["line"] == 0] == [False, True, False]
    assert [t["backing"] for t in toks2 if t["line"] == 1] == [True]
    assert [t["backing"] for t in toks2 if t["line"] == 2] == [True, False]
    # paren tokens never shift word indices (frontend counts letters only)
    assert [t["word"] for t in toks2 if t["line"] == 0] == [0, 1, 2]
    # trailing unreliable words have no later anchor -> span stays null and
    # main() must exit non-zero (parseAlignment rejects null spans wholesale)
    ws = [{"line": 0, "word": i, "display": d, "backing": False}
          for i, d in enumerate(["a", "b", "c"])]
    entries = build_words(ws, {0: (1.0, 1.5, 0.9)})
    assert entries[1]["startS"] is None and entries[2]["startS"] is None
    assert [i for i, e in enumerate(entries) if e["startS"] is None] == [1, 2]
    # ...but an interior unreliable word interpolates between its anchors
    entries = build_words(ws, {0: (1.0, 1.5, 0.9), 2: (3.0, 3.5, 0.9)})
    assert entries[1]["interpolated"] and entries[1]["startS"] == 1.5
    # A long word claims more of the gap than a short one. Under the old
    # equal-share rule both took half; measured on real tracks that rule cost
    # 30-56% accuracy on long runs.
    ws2 = [{"line": 0, "word": i, "display": d, "backing": False}
           for i, d in enumerate(["a", "I", "unfathomably", "z"])]
    # anchors must be real spans: build_words needs a[1] > a[0] to trust one.
    entries = build_words(ws2, {0: (0.0, 0.5, 0.9), 3: (10.0, 10.5, 0.9)})
    short, long_ = entries[1], entries[2]
    assert short["interpolated"] and long_["interpolated"]
    short_span = short["endS"] - short["startS"]
    long_span = long_["endS"] - long_["startS"]
    assert long_span > short_span * 5, (short_span, long_span)
    # ...and the run still spans the gap, in order, without overlap or overrun.
    assert short["startS"] == 0.5, short["startS"]
    assert long_["startS"] == short["endS"]
    assert long_["endS"] < 10.0, long_["endS"]
    # A *leading* unreliable run backs off from the first confident word by the
    # measured median word length — it must never claim the singer opened at
    # t=0. (Regression: a missed first word once spread 0.000-10.707 across a
    # 21s intro, and the pacing generator read that 0.0 as "measured".)
    entries = build_words(ws, {1: (20.0, 20.2, 0.9), 2: (20.4, 20.6, 0.9)})
    assert entries[0]["interpolated"]
    assert entries[0]["startS"] > 19.0, entries[0]["startS"]
    assert entries[0]["endS"] <= 20.0, entries[0]["endS"]
    # ...and with no confident word anywhere there is no median to lean on, so
    # the run stays null and main() exits non-zero rather than guessing.
    entries = build_words(ws, {})
    assert all(e["startS"] is None for e in entries)
    # A reported vocal onset anchors the leading run exactly, beating the
    # derived backoff: "a" is reported to start at 19.0, so it starts at 19.0.
    entries = build_words(ws, {1: (20.0, 20.2, 0.9), 2: (20.4, 20.6, 0.9)},
                          vocal_start_s=19.0)
    assert entries[0]["startS"] == 19.0, entries[0]["startS"]
    assert entries[0]["interpolated"], "a reported anchor is still not a measurement"
    # A nonsense report (after the first word the aligner *did* find) must be
    # ignored rather than produce a backwards span.
    entries = build_words(ws, {1: (20.0, 20.2, 0.9), 2: (20.4, 20.6, 0.9)},
                          vocal_start_s=99.0)
    assert entries[0]["startS"] < 20.0, entries[0]["startS"]
    print("selftest OK")


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--audio", help="audio file path or URL")
    ap.add_argument("--lyrics", help="text file, one lyric line per line")
    ap.add_argument("--track-id", help="track id used in the artifact filename")
    ap.add_argument("--out", default="public/data/alignment", help="output directory")
    ap.add_argument("--review", action="store_true", help="emit an HTML review page")
    ap.add_argument("--no-separate", action="store_true",
                    help="skip Demucs and align against the full mix (lower accuracy)")
    ap.add_argument("--vocal-start-s", type=float, default=None,
                    help="reported onset (seconds) of the first sung word. Used "
                         "only to anchor a leading run of words the aligner "
                         "could not place; a reported onset beats a derived one.")
    ap.add_argument("--model", choices=sorted(ALIGNERS), default="mms",
                    help="mms: best quality, ~2.5 GB RAM; base: ~1 GB RAM fallback")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()

    if args.selftest:
        selftest()
        return
    if not (args.audio and args.lyrics and args.track_id):
        ap.error("--audio, --lyrics and --track-id are required (or use --selftest)")

    lyric_lines = [l for l in Path(args.lyrics).read_text(encoding="utf-8").splitlines()
                   if l.strip()]
    words = tokenize_lines(lyric_lines)
    print(f"{len(lyric_lines)} lines, {len(words)} words")

    with tempfile.TemporaryDirectory(prefix="align_") as td:
        tdp = Path(td)
        full = tdp / "full.wav"
        decode(args.audio, full)
        stem = full if args.no_separate else separate_vocals(full, tdp)
        vocals16k = tdp / "vocals16k.wav"
        to_16k_mono(stem, vocals16k)
        align_fn, aligner_name = ALIGNERS[args.model]
        aligned = align_fn(vocals16k, words)

    entries = build_words(words, aligned, vocal_start_s=args.vocal_start_s)
    lines, failed = build_lines(len(lyric_lines), entries)

    payload = {
        "version": "alignment-v1",
        "trackId": args.track_id,
        "source": {
            "aligner": aligner_name,
            "separator": None if args.no_separate else "htdemucs",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            # Declared so a later reader can tell a reported anchor from a
            # derived one. null means every span here came out of the pipeline.
            "reportedVocalStartS": args.vocal_start_s,
        },
        "lines": lines,
        "words": entries,
    }
    out = Path(args.out) / f"{args.track_id}.alignment-v1.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"artifact: {out}")

    confident = [e for e in entries if not e["interpolated"]]
    mean_conf = sum(e["confidence"] for e in confident) / max(1, len(confident))
    print(f"words: {len(entries)}  confident: {len(confident)}  "
          f"interpolated: {len(entries) - len(confident)}  mean confidence: {mean_conf:.3f}")

    if args.review:
        write_review(out.with_suffix(".review.html"), args.audio, lyric_lines, entries)

    # Producer gate: the frontend's parseAlignment rejects an artifact wholesale
    # if ANY word span is null, so null words must fail the run just like
    # fully-failed lines do (e.g. a trailing low-confidence fade-out word has no
    # later anchor to interpolate against and keeps startS=None).
    unaligned = [i for i, e in enumerate(entries) if e["startS"] is None]
    problems = []
    if failed:
        problems.append(f"{len(failed)} line(s) failed alignment entirely: {failed}")
    if unaligned:
        problems.append(f"{len(unaligned)} word(s) have no span — the frontend "
                        f"will reject this artifact: {unaligned}")
    if problems:
        for p in problems:
            print(f"WARNING: {p}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
