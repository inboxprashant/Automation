"""
ffmpeg_path.py — Resolve the FFmpeg binary path.

Priority:
  1. FFMPEG_BINARY env var (user override)
  2. System PATH (ffmpeg / ffmpeg.exe)
  3. imageio-ffmpeg bundled binary (always available after pip install)

Call setup_ffmpeg_env() once at startup to set FFMPEG_BINARY and
patch MoviePy's config so it uses the correct binary.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys


def get_ffmpeg_path() -> str:
    """Return the absolute path to the ffmpeg binary."""

    # 1. Explicit env override
    env_path = os.environ.get("FFMPEG_BINARY")
    if env_path and os.path.isfile(env_path):
        return env_path

    # 2. System PATH
    system_ffmpeg = shutil.which("ffmpeg")
    if system_ffmpeg:
        return system_ffmpeg

    # 3. imageio-ffmpeg bundled binary
    try:
        import imageio_ffmpeg
        bundled = imageio_ffmpeg.get_ffmpeg_exe()
        if bundled and os.path.isfile(bundled):
            return bundled
    except ImportError:
        pass

    raise FileNotFoundError(
        "FFmpeg not found. Install it with:\n"
        "  Windows: winget install ffmpeg\n"
        "  macOS:   brew install ffmpeg\n"
        "  Linux:   sudo apt install ffmpeg\n"
        "Or: pip install imageio-ffmpeg"
    )


def setup_ffmpeg_env() -> str:
    """
    Resolve FFmpeg, set FFMPEG_BINARY env var, and patch MoviePy config.
    Returns the resolved path.
    """
    ffmpeg_path = get_ffmpeg_path()

    # Set env var so subprocess calls (ffprobe, ffmpeg) can find it
    os.environ["FFMPEG_BINARY"] = ffmpeg_path

    # Derive ffprobe path (same directory, same version)
    ffprobe_path = ffmpeg_path.replace("ffmpeg", "ffprobe")
    if os.path.isfile(ffprobe_path):
        os.environ["FFPROBE_BINARY"] = ffprobe_path

    # Patch MoviePy to use this binary
    try:
        import moviepy.config as mpy_config
        mpy_config.FFMPEG_BINARY = ffmpeg_path
        if os.path.isfile(ffprobe_path):
            mpy_config.FFPROBE_BINARY = ffprobe_path
    except Exception:
        pass

    return ffmpeg_path
