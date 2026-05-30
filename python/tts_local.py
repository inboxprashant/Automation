#!/usr/bin/env python3
"""
tts_local.py — Offline TTS fallback using pyttsx3 (Windows SAPI / macOS say / Linux espeak).

Used when ElevenLabs API is unavailable (quota, 401, network issues).
Output is a WAV file converted to MP3 via FFmpeg.

Usage:
  python tts_local.py --text "Your narration here" --output output.mp3 [--rate 165] [--voice 0]
"""

import argparse
import os
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from lib.ffmpeg_path import setup_ffmpeg_env
FFMPEG_BIN = setup_ffmpeg_env()


def list_voices():
    """Print available TTS voices."""
    import pyttsx3
    engine = pyttsx3.init()
    voices = engine.getProperty('voices')
    for i, v in enumerate(voices):
        print(f"  [{i}] {v.name} | {v.id}")
    engine.stop()


def synthesise(text: str, output_mp3: str, rate: int = 165, voice_index: int = 0) -> None:
    """
    Synthesise text to MP3 using pyttsx3.

    Args:
        text:        narration text
        output_mp3:  output MP3 file path
        rate:        speech rate (words per minute, default 165)
        voice_index: index into available voices list
    """
    import pyttsx3

    # Write to a temp WAV first (pyttsx3 saves WAV natively)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        wav_path = f.name

    try:
        engine = pyttsx3.init()
        voices = engine.getProperty('voices')

        if voices and voice_index < len(voices):
            engine.setProperty('voice', voices[voice_index].id)

        engine.setProperty('rate', rate)
        engine.setProperty('volume', 1.0)

        engine.save_to_file(text, wav_path)
        engine.runAndWait()
        engine.stop()

        if not os.path.exists(wav_path) or os.path.getsize(wav_path) == 0:
            raise RuntimeError("pyttsx3 produced an empty WAV file")

        # Convert WAV → MP3 via FFmpeg
        os.makedirs(os.path.dirname(os.path.abspath(output_mp3)), exist_ok=True)
        result = subprocess.run(
            [FFMPEG_BIN, "-y", "-i", wav_path,
             "-codec:a", "libmp3lame", "-qscale:a", "4",
             output_mp3],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg WAV→MP3 failed: {result.stderr[-200:]}")

        size_kb = os.path.getsize(output_mp3) // 1024
        print(f"[tts_local] Saved: {output_mp3} ({size_kb} KB)")

    finally:
        if os.path.exists(wav_path):
            os.unlink(wav_path)


def main():
    parser = argparse.ArgumentParser(description="Offline TTS fallback")
    parser.add_argument("--text",   required=True,  help="Text to synthesise")
    parser.add_argument("--output", required=True,  help="Output MP3 path")
    parser.add_argument("--rate",   type=int, default=165, help="Speech rate (WPM)")
    parser.add_argument("--voice",  type=int, default=0,   help="Voice index")
    parser.add_argument("--list-voices", action="store_true")
    args = parser.parse_args()

    if args.list_voices:
        list_voices()
        return

    print(f"[tts_local] Synthesising {len(args.text)} chars at {args.rate} WPM...")
    synthesise(args.text, args.output, rate=args.rate, voice_index=args.voice)


if __name__ == "__main__":
    main()
