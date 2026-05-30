"""
ffprobe.py — Thin wrapper around ffprobe for media metadata.
Uses the ffprobe binary resolved by ffmpeg_path.py.
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path


def _get_ffprobe() -> str:
    """Return the ffprobe binary path, falling back to ffmpeg if ffprobe not found."""
    import shutil

    # Check explicit env var first
    explicit = os.environ.get("FFPROBE_BINARY")
    if explicit and os.path.isfile(explicit):
        return explicit

    # Derive from FFMPEG_BINARY — try ffprobe in same directory
    ffmpeg = os.environ.get("FFMPEG_BINARY", "ffmpeg")
    ffmpeg_dir = os.path.dirname(ffmpeg)

    # Try common ffprobe names in the same directory
    for name in ["ffprobe.exe", "ffprobe"]:
        candidate = os.path.join(ffmpeg_dir, name)
        if os.path.isfile(candidate):
            return candidate

    # Fall back to system ffprobe
    system = shutil.which("ffprobe")
    if system:
        return system

    # Last resort: use ffmpeg itself (it can do probing too)
    return ffmpeg


def probe(path: str) -> dict:
    """Return full ffprobe/ffmpeg JSON output for a media file."""
    binary = _get_ffprobe()
    cmd = [
        binary, "-v", "quiet",
        "-print_format", "json",
        "-show_format", "-show_streams",
        str(path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0 or not result.stdout.strip():
        # Try with ffmpeg -i as last resort
        ffmpeg = os.environ.get("FFMPEG_BINARY", binary)
        r2 = subprocess.run(
            [ffmpeg, "-v", "quiet", "-print_format", "json",
             "-show_format", "-show_streams", str(path)],
            capture_output=True, text=True
        )
        if r2.returncode != 0 or not r2.stdout.strip():
            raise RuntimeError(f"ffprobe failed for {path}: {result.stderr[:200]}")
        return json.loads(r2.stdout)
    return json.loads(result.stdout)


def get_duration(path: str) -> float:
    """Return media duration in seconds."""
    try:
        data = probe(path)
        fmt_dur = data.get("format", {}).get("duration")
        if fmt_dur:
            return float(fmt_dur)
        for stream in data.get("streams", []):
            if "duration" in stream:
                return float(stream["duration"])
    except Exception:
        pass

    # Fallback: use moviepy
    try:
        from moviepy.editor import AudioFileClip, VideoFileClip
        ext = str(path).lower()
        if ext.endswith(('.mp3', '.wav', '.m4a', '.aac')):
            clip = AudioFileClip(str(path))
        else:
            clip = VideoFileClip(str(path))
        dur = clip.duration
        clip.close()
        return dur
    except Exception as e:
        raise ValueError(f"Cannot determine duration for: {path} — {e}")


def get_video_size(path: str) -> tuple[int, int]:
    """Return (width, height) of the first video stream."""
    data = probe(path)
    for stream in data.get("streams", []):
        if stream.get("codec_type") == "video":
            return int(stream["width"]), int(stream["height"])
    raise ValueError(f"No video stream found in: {path}")


def has_audio(path: str) -> bool:
    """Return True if the file has at least one audio stream."""
    data = probe(path)
    return any(s.get("codec_type") == "audio" for s in data.get("streams", []))
