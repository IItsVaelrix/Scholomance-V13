#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "librosa",
#     "numpy",
#     "soundfile",
# ]
# ///

import sys
import json
import librosa
import numpy as np

def compile_resonance(audio_path, output_path):
    print(f"Loading audio: {audio_path}")
    # Load audio
    y, sr = librosa.load(audio_path, sr=22050)
    
    print("Computing beat tracking...")
    # Get beats and BPM
    bpm, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    if isinstance(bpm, np.ndarray):
        bpm = float(bpm[0])
    
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    downbeats_ms = [int(t * 1000) for t in beat_times]
    
    print("Computing RMS energy...")
    # Compute RMS energy
    hop_length = 512
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
    
    # Normalize RMS to 0-1 for animation
    rms_min = np.min(rms)
    rms_max = np.max(rms)
    if rms_max > rms_min:
        rms_norm = (rms - rms_min) / (rms_max - rms_min)
    else:
        rms_norm = rms
        
    print("Detecting onsets...")
    # Compute onsets
    onset_frames = librosa.onset.onset_detect(y=y, sr=sr, hop_length=hop_length)
    onset_set = set(onset_frames)
    
    print("Generating frames...")
    # Generate frames
    frames = []
    times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop_length)
    
    for i, t in enumerate(times):
        time_ms = int(t * 1000)
        is_onset = 1 if i in onset_set else 0
        r = float(rms_norm[i])
        
        frames.append({
            "timeMs": time_ms,
            "spectral": {
                "rms": round(r, 4),
                "onset": is_onset
            }
        })
        
    print("Constructing sidecar...")
    sidecar = {
        "sync": {
            "bpm": round(float(bpm), 2),
            "analysisOffsetMs": 0,
            "downbeatsMs": downbeats_ms
        },
        "channels": {
            "spectral.onset": { "interpolation": "step", "default": 0 },
            "spectral.rms": { "interpolation": "linear", "default": 0 },
            "resonance.violence": { "interpolation": "step", "default": 0 }
        },
        "frames": frames
    }
    
    print(f"Writing {len(frames)} frames to {output_path}")
    with open(output_path, 'w') as f:
        json.dump(sidecar, f, separators=(',', ':'))
        
    print("Done!")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: uv run compile-resonance.py <audio_path> <output_json>")
        sys.exit(1)
        
    compile_resonance(sys.argv[1], sys.argv[2])
