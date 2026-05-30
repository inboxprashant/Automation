#!/usr/bin/env python3
"""
transcribe.py — Local Whisper transcription (no API key needed).

Uses the openai-whisper package to transcribe audio locally.
Falls back to 'base' model if 'small' is not cached.

Usage:
  python transcribe.py --audio <path> --output <path.json>

Output JSON:
  {
    "text": "full transcript",
    "segments": [{"id":0,"start":0.0,"end":1.2,"text":"..."},...],
    "words": [{"word":"hello","start":0.0,"end":0.3},...]
  }
"""

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from lib.ffmpeg_path import setup_ffmpeg_env
setup_ffmpeg_env()


def transcribe(audio_path: str, model_name: str = "base") -> dict:
    import whisper
    import os

    # Add FFmpeg directory to PATH so whisper's internal subprocess can find it
    ffmpeg_bin = os.environ.get("FFMPEG_BINARY", "")
    if ffmpeg_bin and os.path.isfile(ffmpeg_bin):
        ffmpeg_dir = os.path.dirname(ffmpeg_bin)
        current_path = os.environ.get("PATH", "")
        if ffmpeg_dir not in current_path:
            os.environ["PATH"] = ffmpeg_dir + os.pathsep + current_path
        # Also copy the binary as 'ffmpeg.exe' in the same dir if needed
        import shutil
        ffmpeg_name = os.path.join(ffmpeg_dir, "ffmpeg.exe")
        if not os.path.exists(ffmpeg_name) and os.path.exists(ffmpeg_bin):
            try:
                shutil.copy2(ffmpeg_bin, ffmpeg_name)
            except Exception:
                pass

    print(f"[transcribe] Loading Whisper model: {model_name}", flush=True)
    model = whisper.load_model(model_name)

    print(f"[transcribe] Transcribing: {audio_path}", flush=True)
    result = model.transcribe(
        audio_path,
        word_timestamps=True,
        verbose=False,
    )

    # Flatten word timestamps from segments
    words = []
    for seg in result.get("segments", []):
        for w in seg.get("words", []):
            words.append({
                "word":  w["word"],
                "start": round(w["start"], 3),
                "end":   round(w["end"],   3),
            })

    segments = [
        {
            "id":    s["id"],
            "start": round(s["start"], 3),
            "end":   round(s["end"],   3),
            "text":  s["text"].strip(),
        }
        for s in result.get("segments", [])
    ]

    return {
        "text":     result.get("text", "").strip(),
        "segments": segments,
        "words":    words,
        "duration": result.get("segments", [{}])[-1].get("end", 0) if segments else 0,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio",  required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model",  default="base")
    args = parser.parse_args()

    if not os.path.exists(args.audio):
        print(f"[transcribe] ERROR: audio not found: {args.audio}", file=sys.stderr)
        sys.exit(1)

    data = transcribe(args.audio, args.model)

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    print(f"[transcribe] Done: {len(data['words'])} words, {len(data['segments'])} segments")
    print(f"[transcribe] Saved: {args.output}")


if __name__ == "__main__":
    main()
