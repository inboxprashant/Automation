"""
subtitle_renderer.py — Responsive, mobile-first subtitle rendering.

Replaces the old subtitle_burner.py with a full rewrite that:

  1. Reads the SRT file and analyses each cue's word count
  2. Dynamically selects font size per cue (large for short text, smaller for long)
  3. Enforces safe-zone margins on all sides
  4. Auto-wraps long lines using libass's WrapStyle
  5. Generates an ASS (Advanced SubStation Alpha) file instead of using
     the SRT filter — ASS gives full per-cue style control
  6. Burns the ASS file into the video using FFmpeg's ass filter
  7. Applies keyword highlighting (yellow) for UPPERCASE words in the SRT

ASS format reference: http://www.tcax.org/docs/ass-specs.htm
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path
from typing import NamedTuple

from .caption_config import (
    TARGET_W, TARGET_H,
    SAFE_LEFT, SAFE_RIGHT, SAFE_BOTTOM, SAFE_TOP,
    TEXT_MAX_W, CAPTION_Y_RATIO,
    FONT_SIZE_MAX, FONT_SIZE_MID, FONT_SIZE_MIN,
    FONT_THRESH_SHORT, FONT_THRESH_MEDIUM,
    COLOR_PRIMARY, COLOR_OUTLINE, COLOR_SHADOW, COLOR_HIGHLIGHT,
    OUTLINE_WIDTH, SHADOW_DEPTH, BOLD,
    MARGIN_L, MARGIN_R, MARGIN_V,
    MAX_CHARS_PER_LINE,
    get_font_name,
)


# ── SRT parser ────────────────────────────────────────────────────────────────

class SrtCue(NamedTuple):
    index:   int
    start:   str    # "HH:MM:SS,mmm"
    end:     str
    text:    str    # raw text (may contain UPPERCASE keywords)


def parse_srt(srt_path: str) -> list[SrtCue]:
    """Parse an SRT file into a list of SrtCue objects."""
    with open(srt_path, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()

    cues = []
    blocks = re.split(r"\n\s*\n", content.strip())

    for block in blocks:
        lines = block.strip().splitlines()
        if len(lines) < 3:
            continue
        try:
            idx = int(lines[0].strip())
        except ValueError:
            continue

        time_match = re.match(
            r"(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})",
            lines[1]
        )
        if not time_match:
            continue

        start = time_match.group(1).replace(".", ",")
        end   = time_match.group(2).replace(".", ",")
        text  = " ".join(lines[2:]).strip()

        cues.append(SrtCue(index=idx, start=start, end=end, text=text))

    return cues


# ── Font size selection ───────────────────────────────────────────────────────

def pick_font_size(text: str) -> int:
    """
    Dynamically select font size based on word count.
    Shorter text → larger font (more impact).
    Longer text  → smaller font (fits on screen).
    """
    words = len(text.split())
    if words <= FONT_THRESH_SHORT:
        return FONT_SIZE_MAX
    if words <= FONT_THRESH_MEDIUM:
        return FONT_SIZE_MID
    return FONT_SIZE_MIN


# ── Text wrapping ─────────────────────────────────────────────────────────────

def wrap_text(text: str, max_chars: int = MAX_CHARS_PER_LINE) -> str:
    """
    Wrap text to fit within max_chars per line.
    Returns text with \\N (ASS hard line break) inserted.
    """
    words  = text.split()
    lines  = []
    current = ""

    for word in words:
        test = f"{current} {word}".strip()
        if len(test) <= max_chars:
            current = test
        else:
            if current:
                lines.append(current)
            current = word

    if current:
        lines.append(current)

    return r"\N".join(lines)


# ── Keyword highlighting ──────────────────────────────────────────────────────

def apply_keyword_highlight(text: str) -> str:
    """
    Wrap UPPERCASE words in ASS colour override tags for yellow highlighting.
    e.g. "This AI TOOL is FREE" → "This AI {\\c&H0000FFFF&}TOOL{\\c&H00FFFFFF&} is {\\c&H0000FFFF&}FREE{\\c&H00FFFFFF&}"
    """
    def replace_upper(match):
        word = match.group(0)
        # Only highlight if it's a real word (not just punctuation)
        if len(word) >= 2 and word.isalpha():
            return f"{{\\c{COLOR_HIGHLIGHT}&}}{word}{{\\c{COLOR_PRIMARY}&}}"
        return word

    # Match sequences of uppercase letters (2+ chars)
    return re.sub(r'\b[A-Z]{2,}\b', replace_upper, text)


# ── ASS file generation ───────────────────────────────────────────────────────

def srt_to_ass(cues: list[SrtCue], output_path: str) -> None:
    """
    Convert parsed SRT cues to an ASS file with:
      - Per-cue dynamic font sizing
      - Safe-zone margins
      - Keyword highlighting
      - Auto line wrapping
      - Centred bottom-of-screen positioning
    """
    font_name = get_font_name()

    # ASS header
    header = f"""\
[Script Info]
ScriptType: v4.00+
PlayResX: {TARGET_W}
PlayResY: {TARGET_H}
ScaledBorderAndShadow: yes
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font_name},{FONT_SIZE_MID},{COLOR_PRIMARY},&H000000FF,{COLOR_OUTLINE},{COLOR_SHADOW},{BOLD},0,0,0,100,100,0,0,1,{OUTLINE_WIDTH},{SHADOW_DEPTH},2,{MARGIN_L},{MARGIN_R},{MARGIN_V},1
Style: Large,{font_name},{FONT_SIZE_MAX},{COLOR_PRIMARY},&H000000FF,{COLOR_OUTLINE},{COLOR_SHADOW},{BOLD},0,0,0,100,100,0,0,1,{OUTLINE_WIDTH},{SHADOW_DEPTH},2,{MARGIN_L},{MARGIN_R},{MARGIN_V},1
Style: Small,{font_name},{FONT_SIZE_MIN},{COLOR_PRIMARY},&H000000FF,{COLOR_OUTLINE},{COLOR_SHADOW},{BOLD},0,0,0,100,100,0,0,1,{OUTLINE_WIDTH},{SHADOW_DEPTH},2,{MARGIN_L},{MARGIN_R},{MARGIN_V},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    events = []
    for cue in cues:
        start_ass = _srt_time_to_ass(cue.start)
        end_ass   = _srt_time_to_ass(cue.end)

        # Select style based on word count
        words = len(cue.text.split())
        if words <= FONT_THRESH_SHORT:
            style = "Large"
        elif words <= FONT_THRESH_MEDIUM:
            style = "Default"
        else:
            style = "Small"

        # Wrap long text
        wrapped = wrap_text(cue.text, MAX_CHARS_PER_LINE)

        # Apply keyword highlighting
        highlighted = apply_keyword_highlight(wrapped)

        # Add fade-in/out animation tags ({\fad(in_ms, out_ms)})
        fade_tag = r"{\fad(80,80)}"

        text_with_effects = f"{fade_tag}{highlighted}"

        events.append(
            f"Dialogue: 0,{start_ass},{end_ass},{style},,0,0,0,,{text_with_effects}"
        )

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(header)
        f.write("\n".join(events))
        f.write("\n")


def _srt_time_to_ass(t: str) -> str:
    """Convert SRT timestamp (HH:MM:SS,mmm) to ASS format (H:MM:SS.cc)."""
    t = t.replace(",", ".")
    parts = t.split(":")
    h, m = int(parts[0]), int(parts[1])
    s_ms = parts[2].split(".")
    s  = int(s_ms[0])
    ms = int(s_ms[1]) if len(s_ms) > 1 else 0
    cs = ms // 10   # centiseconds
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


# ── FFmpeg burn-in ────────────────────────────────────────────────────────────

def burn_subtitles(
    input_video:  str,
    srt_path:     str,
    output_video: str,
    ffmpeg_bin:   str = "ffmpeg",
    encoder:      str = "libx264",
    enc_flags:    list[str] | None = None,
) -> None:
    """
    Convert SRT → ASS (with dynamic sizing + highlighting) then burn into video.

    Args:
        input_video:  path to input MP4
        srt_path:     path to .srt file
        output_video: path for output MP4
        ffmpeg_bin:   path to ffmpeg binary
        encoder:      video encoder (libx264, h264_nvenc, etc.)
        enc_flags:    extra encoder flags
    """
    if enc_flags is None:
        enc_flags = ["-preset", "fast", "-crf", "20"]

    # Generate ASS file alongside the SRT
    ass_path = srt_path.replace(".srt", ".ass")
    if not ass_path.endswith(".ass"):
        ass_path = srt_path + ".ass"

    cues = parse_srt(srt_path)
    if not cues:
        print(f"[subtitle_renderer] WARNING: no cues found in {srt_path}", file=sys.stderr)
        # Copy input to output unchanged
        import shutil
        shutil.copy2(input_video, output_video)
        return

    srt_to_ass(cues, ass_path)
    print(f"[subtitle_renderer] Generated ASS: {ass_path} ({len(cues)} cues)")

    # Escape ASS path for FFmpeg filter
    ass_esc = os.path.abspath(ass_path).replace("\\", "/")
    if len(ass_esc) >= 2 and ass_esc[1] == ":":
        ass_esc = ass_esc[0] + "\\:" + ass_esc[2:]
    ass_esc = ass_esc.replace("'", "\\'")

    cmd = [
        ffmpeg_bin, "-y",
        "-i", input_video,
        "-vf", f"ass='{ass_esc}'",
        "-c:v", encoder, *enc_flags,
        "-c:a", "copy",
        "-movflags", "+faststart",
        output_video,
    ]

    print(f"[subtitle_renderer] Burning ASS subtitles...")
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        lines = result.stderr.strip().split("\n")
        for line in lines[-30:]:
            print(f"[ffmpeg:err] {line}", file=sys.stderr, flush=True)
        raise RuntimeError(
            f"Subtitle burn failed (exit {result.returncode}). "
            "Check that FFmpeg was compiled with libass support."
        )

    print(f"[subtitle_renderer] Done: {output_video}")
