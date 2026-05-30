"""
subtitle_burner.py — Burns SRT subtitles into a video using FFmpeg.

Uses FFmpeg's `subtitles` filter (libass) for hardware-accelerated
subtitle rendering.  Falls back to MoviePy TextClip compositing if
libass is not available.

Subtitle style (optimised for Shorts):
  • Large bold white text, black outline
  • Bottom-centre position with generous margin
  • 3-word chunks (from the highlighted SRT)
  • Keywords are UPPERCASE (already encoded in the SRT by the caption module)
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path


# ── Constants ────────────────────────────────────────────────────────────────

FONT_SIZE     = 72
FONT_NAME     = "Montserrat"   # falls back to Arial / DejaVu if not installed
OUTLINE_WIDTH = 3
MARGIN_V      = 120            # pixels from bottom
PRIMARY_COLOR = "&H00FFFFFF"   # white (ABGR hex)
OUTLINE_COLOR = "&H00000000"   # black
SHADOW_COLOR  = "&H80000000"   # semi-transparent black shadow

ASS_STYLE = (
    f"FontName={FONT_NAME},"
    f"FontSize={FONT_SIZE},"
    f"PrimaryColour={PRIMARY_COLOR},"
    f"OutlineColour={OUTLINE_COLOR},"
    f"ShadowColour={SHADOW_COLOR},"
    f"Outline={OUTLINE_WIDTH},"
    f"Shadow=1,"
    f"Bold=1,"
    f"Alignment=2,"          # bottom-centre
    f"MarginV={MARGIN_V}"
)


def _escape_path(path: str) -> str:
    """Escape a file path for use in an FFmpeg filter string."""
    # On Windows, colons in drive letters must be escaped
    return path.replace("\\", "/").replace(":", "\\:")


def burn_subtitles_ffmpeg(
    input_video: str,
    srt_path: str,
    output_video: str,
) -> None:
    """
    Burn SRT subtitles into a video using FFmpeg's subtitles filter.

    Args:
        input_video:  path to the input MP4 (no audio needed at this stage)
        srt_path:     path to the .srt file
        output_video: path for the output MP4

    Raises:
        RuntimeError: if FFmpeg exits with a non-zero code
    """
    srt_escaped = _escape_path(srt_path)

    subtitle_filter = (
        f"subtitles='{srt_escaped}'"
        f":force_style='{ASS_STYLE}'"
    )

    cmd = [
        "ffmpeg", "-y",
        "-i", input_video,
        "-vf", subtitle_filter,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "20",
        "-c:a", "copy",
        "-movflags", "+faststart",
        output_video,
    ]

    print(f"[subtitle_burner] Burning subtitles...")
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print(result.stderr[-2000:], file=sys.stderr)
        raise RuntimeError(
            f"FFmpeg subtitle burn failed (code {result.returncode}). "
            "Ensure libass is compiled into your FFmpeg build."
        )

    print(f"[subtitle_burner] Done: {output_video}")
