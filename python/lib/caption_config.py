"""
caption_config.py — Centralised subtitle and visual configuration.

All font sizes, margins, colours, and animation parameters live here.
Change values here to affect the entire rendering pipeline.
"""

from __future__ import annotations

# ── Canvas ────────────────────────────────────────────────────────────────────
TARGET_W   = 1080
TARGET_H   = 1920
TARGET_FPS = 30

# ── Safe zones (pixels from each edge) ───────────────────────────────────────
# YouTube Shorts UI overlays the bottom ~200px and sides ~40px
SAFE_LEFT   = 60    # left margin
SAFE_RIGHT  = 60    # right margin
SAFE_TOP    = 120   # top margin
SAFE_BOTTOM = 220   # bottom margin (above YT UI chrome)

# Usable width for text
TEXT_MAX_W  = TARGET_W - SAFE_LEFT - SAFE_RIGHT   # 960 px

# ── Caption positioning ───────────────────────────────────────────────────────
# Vertical position of caption block centre (0.0 = top, 1.0 = bottom)
# 0.72 = lower-centre, above the YT UI, below the visual centre
CAPTION_Y_RATIO = 0.72

# ── Font sizing (dynamic — scales with text length) ──────────────────────────
FONT_SIZE_MAX   = 88    # short text (1–3 words)
FONT_SIZE_MID   = 72    # medium text (4–6 words)
FONT_SIZE_MIN   = 56    # long text (7+ words)
FONT_SIZE_HOOK  = 96    # hook overlay (first 2 seconds)

# Word count thresholds for font size selection
FONT_THRESH_SHORT  = 3   # ≤ 3 words → MAX size
FONT_THRESH_MEDIUM = 6   # ≤ 6 words → MID size

# ── Caption colours (ABGR hex for libass) ────────────────────────────────────
# Normal captions
COLOR_PRIMARY  = "&H00FFFFFF"   # white
COLOR_OUTLINE  = "&H00000000"   # black
COLOR_SHADOW   = "&HAA000000"   # semi-transparent black

# Highlighted / keyword captions (yellow)
COLOR_HIGHLIGHT = "&H0000FFFF"  # yellow (ABGR: 00 00 FF FF)

# Hook text
COLOR_HOOK_PRIMARY = "&H00FFFFFF"
COLOR_HOOK_OUTLINE = "&H000000FF"   # red outline for hook

# ── Stroke / shadow ───────────────────────────────────────────────────────────
OUTLINE_WIDTH  = 4     # px — thicker for mobile readability
SHADOW_DEPTH   = 2     # px
BOLD           = 1

# ── Margins (libass MarginL/R/V in pixels) ────────────────────────────────────
MARGIN_L = SAFE_LEFT
MARGIN_R = SAFE_RIGHT
MARGIN_V = SAFE_BOTTOM   # distance from bottom edge

# ── Line wrapping ─────────────────────────────────────────────────────────────
# Max characters per line before wrapping (approximate — depends on font)
MAX_CHARS_PER_LINE = 18

# ── Animation timing ─────────────────────────────────────────────────────────
HOOK_DURATION_S    = 2.0    # seconds hook text is visible
FADE_DURATION_S    = 0.35   # fade in/out for transitions
ZOOM_INTERVAL_S    = 2.5    # seconds between zoom pulses
ZOOM_FACTOR        = 1.06   # Ken Burns zoom magnitude
PUNCH_DURATION_S   = 0.25   # zoom-in punch duration

# ── Font paths ────────────────────────────────────────────────────────────────
import os
from pathlib import Path

_ASSETS = Path(__file__).parent.parent.parent / "assets" / "fonts"

FONT_CANDIDATES = [
    str(_ASSETS / "Montserrat-Bold.ttf"),
    str(_ASSETS / "Montserrat-ExtraBold.ttf"),
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]

def get_font_path() -> str | None:
    """Return the first available bold font path, or None."""
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return p
    return None

def get_font_name() -> str:
    """Return the font name for libass (used in ASS style strings)."""
    p = get_font_path()
    if not p:
        return "Arial"
    name = Path(p).stem
    # Map file names to font family names
    if "Montserrat" in name:
        return "Montserrat"
    if "arial" in name.lower():
        return "Arial"
    if "DejaVu" in name:
        return "DejaVu Sans"
    return "Arial"
