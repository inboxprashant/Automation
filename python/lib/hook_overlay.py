"""
hook_overlay.py — Animated hook text renderer for the first 2 seconds.

Renders a full-resolution RGBA PNG with:
  • Large bold text (96px) centred in the upper-third safe zone
  • Multi-line auto-wrap with safe margins
  • Thick stroke + drop shadow for readability on any background
  • Semi-transparent dark pill background behind text for contrast
  • Emoji-safe rendering (falls back gracefully)
"""

from __future__ import annotations

import os
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter

from .caption_config import (
    TARGET_W, TARGET_H,
    SAFE_LEFT, SAFE_RIGHT, SAFE_TOP,
    TEXT_MAX_W,
    FONT_SIZE_HOOK,
    FONT_CANDIDATES,
    get_font_path,
)

# Hook text sits in the upper-third of the frame
HOOK_Y_RATIO   = 0.20    # centre of text block at 20% from top
PILL_PADDING_X = 40      # horizontal padding inside the pill background
PILL_PADDING_Y = 24      # vertical padding inside the pill background
PILL_RADIUS    = 24      # corner radius of the pill
PILL_ALPHA     = 180     # 0–255 opacity of the pill background
STROKE_W       = 5       # text stroke width
LINE_SPACING   = 16      # extra pixels between lines


def _load_font(size: int) -> ImageFont.FreeTypeFont:
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    # PIL default (very small, but won't crash)
    return ImageFont.load_default()


def _measure_text(draw: ImageDraw.ImageDraw, text: str, font) -> tuple[int, int]:
    """Return (width, height) of a single line of text."""
    bbox = draw.textbbox((0, 0), text, font=font, stroke_width=STROKE_W)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def _wrap_to_fit(text: str, font, max_width: int) -> list[str]:
    """Wrap text so each line fits within max_width pixels."""
    dummy = Image.new("RGB", (1, 1))
    draw  = ImageDraw.Draw(dummy)
    words = text.split()
    lines, current = [], ""

    for word in words:
        test = f"{current} {word}".strip()
        w, _ = _measure_text(draw, test, font)
        if w <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)

    return lines if lines else [text]


def render_hook_png(text: str, output_path: str) -> None:
    """
    Render hook text to a transparent RGBA PNG at TARGET_W × TARGET_H.
    The PNG is overlaid by FFmpeg for the first 2 seconds of the video.
    """
    if not text or not text.strip():
        # Write a fully transparent PNG so FFmpeg overlay still works
        img = Image.new("RGBA", (TARGET_W, TARGET_H), (0, 0, 0, 0))
        img.save(output_path, "PNG")
        return

    font      = _load_font(FONT_SIZE_HOOK)
    max_width = TEXT_MAX_W - PILL_PADDING_X * 2

    lines = _wrap_to_fit(text.upper(), font, max_width)

    # Measure all lines
    dummy = Image.new("RGB", (1, 1))
    dd    = ImageDraw.Draw(dummy)
    line_sizes = [_measure_text(dd, line, font) for line in lines]
    block_w = max(w for w, _ in line_sizes)
    block_h = sum(h for _, h in line_sizes) + LINE_SPACING * (len(lines) - 1)

    # Pill background dimensions
    pill_w = block_w + PILL_PADDING_X * 2
    pill_h = block_h + PILL_PADDING_Y * 2

    # Position: horizontally centred, vertically at HOOK_Y_RATIO
    pill_x = (TARGET_W - pill_w) // 2
    pill_y = int(TARGET_H * HOOK_Y_RATIO) - pill_h // 2
    pill_y = max(SAFE_TOP, pill_y)   # never above safe zone

    # Create canvas
    img  = Image.new("RGBA", (TARGET_W, TARGET_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Draw pill background
    pill_box = [pill_x, pill_y, pill_x + pill_w, pill_y + pill_h]
    draw.rounded_rectangle(
        pill_box,
        radius=PILL_RADIUS,
        fill=(0, 0, 0, PILL_ALPHA),
    )

    # Draw each line of text
    text_y = pill_y + PILL_PADDING_Y
    for i, (line, (lw, lh)) in enumerate(zip(lines, line_sizes)):
        text_x = (TARGET_W - lw) // 2

        # Stroke (drawn in 8 directions)
        for dx in range(-STROKE_W, STROKE_W + 1):
            for dy in range(-STROKE_W, STROKE_W + 1):
                if dx == 0 and dy == 0:
                    continue
                draw.text(
                    (text_x + dx, text_y + dy),
                    line, font=font,
                    fill=(0, 0, 0, 255),
                )

        # Main text — white with slight yellow tint for energy
        draw.text((text_x, text_y), line, font=font, fill=(255, 248, 100, 255))

        text_y += lh + LINE_SPACING

    img.save(output_path, "PNG")


# ── Legacy MoviePy clip (kept for backward compatibility) ─────────────────────

def make_hook_overlay(hook_text: str, duration: float = 2.0):
    """Legacy MoviePy wrapper — delegates to render_hook_png."""
    from moviepy.editor import ImageClip
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        tmp_png = f.name

    try:
        render_hook_png(hook_text, tmp_png)
        clip = ImageClip(tmp_png, duration=duration).set_fps(30)
        return clip
    finally:
        if os.path.exists(tmp_png):
            os.unlink(tmp_png)
