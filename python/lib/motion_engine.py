"""
motion_engine.py — Dynamic zoom, motion, and visual effects for Shorts.

Generates FFmpeg filter_complex expressions for:
  1. Continuous Ken Burns zoom (slow drift across the whole clip)
  2. Zoom pulse every N seconds (micro-zoom for pattern interrupt)
  3. Subtle camera shake (random drift, ±8px)
  4. Scene-cut flash (brief brightness spike at cut points)
  5. Background blur overlay when captions appear (depth-of-field feel)
  6. Vignette overlay (darkened edges, focus on centre)

All effects are expressed as FFmpeg filter strings — no MoviePy needed.
"""

from __future__ import annotations

import math
from .caption_config import (
    TARGET_W, TARGET_H, TARGET_FPS,
    ZOOM_FACTOR, ZOOM_INTERVAL_S, PUNCH_DURATION_S,
)


# ── Ken Burns zoom ────────────────────────────────────────────────────────────

def ken_burns_filter(
    duration: float,
    zoom_start: float = 1.0,
    zoom_end:   float | None = None,
    direction:  str = "in",   # 'in' | 'out' | 'random'
) -> str:
    """
    Generate a zoompan filter expression for a slow Ken Burns zoom.

    The zoompan filter works at the frame level:
      z = zoom value (1.0 = no zoom, 1.1 = 10% zoom)
      x, y = pan position (centre of crop window)

    Args:
        duration:   clip duration in seconds
        zoom_start: starting zoom level
        zoom_end:   ending zoom level (defaults to zoom_start ± ZOOM_FACTOR)
        direction:  'in' (zoom in), 'out' (zoom out), 'random'

    Returns:
        FFmpeg zoompan filter string
    """
    import random as _random

    if direction == "random":
        direction = _random.choice(["in", "out"])

    if zoom_end is None:
        if direction == "in":
            zoom_end = zoom_start * ZOOM_FACTOR
        else:
            zoom_end = zoom_start / ZOOM_FACTOR

    total_frames = int(duration * TARGET_FPS)

    # Linear interpolation: z = zoom_start + (zoom_end - zoom_start) * (on/total)
    z_expr = (
        f"'min({zoom_start:.4f}+({zoom_end:.4f}-{zoom_start:.4f})*on/{total_frames},10)'"
    )

    # Pan: keep centred
    x_expr = "'iw/2-(iw/zoom/2)'"
    y_expr = "'ih/2-(ih/zoom/2)'"

    return (
        f"zoompan=z={z_expr}:x={x_expr}:y={y_expr}"
        f":d={total_frames}:s={TARGET_W}x{TARGET_H}:fps={TARGET_FPS}"
    )


# ── Zoom pulse (pattern interrupt) ───────────────────────────────────────────

def zoom_pulse_filter(duration: float, interval: float = ZOOM_INTERVAL_S) -> str:
    """
    Subtle zoom pulse using zoompan — compatible with FFmpeg 4.x.
    Creates a gentle oscillating zoom effect.
    """
    total_frames = int(duration * TARGET_FPS)
    # Oscillate zoom between 1.0 and 1.03 using a sine wave
    # zoompan z expression: 1 + 0.03 * abs(sin(PI * on / (fps * interval)))
    frames_per_cycle = int(TARGET_FPS * interval)
    z_expr = f"'1+0.03*abs(sin(PI*on/{frames_per_cycle}))'"
    x_expr = "'iw/2-(iw/zoom/2)'"
    y_expr = "'ih/2-(ih/zoom/2)'"
    return (
        f"zoompan=z={z_expr}:x={x_expr}:y={y_expr}"
        f":d={total_frames}:s={TARGET_W}x{TARGET_H}:fps={TARGET_FPS}"
    )


# ── Vignette overlay ──────────────────────────────────────────────────────────

def vignette_filter(strength: float = 0.4) -> str:
    """
    Add a vignette (darkened edges) to focus attention on the centre.
    strength: 0.0 = no vignette, 1.0 = very dark edges
    """
    angle = strength * math.pi / 4   # max PI/4 radians
    return f"vignette=angle={angle:.4f}:mode=forward"


# ── Caption blur overlay ──────────────────────────────────────────────────────

def caption_blur_strip_filter(
    y_ratio: float = 0.60,
    blur_strength: float = 8.0,
    alpha: float = 0.45,
) -> str:
    """
    Add a semi-transparent blurred strip behind the caption area.
    Creates a depth-of-field effect that makes captions pop.

    This is expressed as a split+blur+overlay filter chain.

    Args:
        y_ratio:       vertical position of strip top (0.0–1.0)
        blur_strength: Gaussian blur radius
        alpha:         opacity of the blur overlay (0.0–1.0)

    Returns:
        filter_complex fragment (assumes input labelled [bg])
    """
    y_px     = int(TARGET_H * y_ratio)
    h_px     = TARGET_H - y_px
    alpha_int = int(alpha * 255)

    return (
        # Split the background
        f"[bg]split=2[bg_main][bg_blur];"
        # Crop the caption strip from the blurred copy
        f"[bg_blur]crop={TARGET_W}:{h_px}:0:{y_px},"
        f"gblur=sigma={blur_strength:.1f},"
        f"format=rgba,colorchannelmixer=aa={alpha:.2f}[blur_strip];"
        # Overlay the blurred strip back onto the main video
        f"[bg_main][blur_strip]overlay=0:{y_px}[bg]"
    )


# ── Scene transition flash ────────────────────────────────────────────────────

def cut_flash_filter(flash_duration: float = 0.08) -> str:
    """
    Brief brightness flash at the start of a clip (simulates a cut flash).
    flash_duration: seconds the flash lasts
    """
    frames = int(flash_duration * TARGET_FPS)
    # Increase brightness for the first N frames, then return to normal
    return (
        f"curves=all='0/0 0.5/0.5 1/1':enable='lt(n,{frames})',"
        f"eq=brightness=0.15:enable='lt(n,{frames})'"
    )


# ── Full motion filter chain ──────────────────────────────────────────────────

def build_motion_filter(
    duration:       float,
    scene_index:    int,
    apply_zoom:     bool = True,
    apply_pulse:    bool = True,
    apply_vignette: bool = True,
    apply_flash:    bool = False,
) -> str:
    """
    Build the per-clip motion filter chain.

    Uses scale+crop for zoom effects (much faster than zoompan on CPU/NVENC).
    The zoom is achieved by scaling slightly larger than the target, then
    cropping — this is hardware-accelerated and processes at full speed.

    For Ken Burns: we pre-scale to zoom_end size, then crop from a position
    that drifts from one corner to the centre over the clip duration.
    This is approximated with a static crop (true motion requires zoompan).
    """
    filters = []

    # Alternate zoom level per scene for visual variety
    zoom = 1.0 + (ZOOM_FACTOR - 1.0) * (0.5 + 0.5 * (scene_index % 2))
    # scene 0: 1.04, scene 1: 1.08, scene 2: 1.04, ...

    if apply_zoom:
        # Scale slightly larger, then centre-crop to target
        scaled_w = int(TARGET_W * zoom)
        scaled_h = int(TARGET_H * zoom)
        # Ensure even dimensions
        scaled_w += scaled_w % 2
        scaled_h += scaled_h % 2
        x_off = (scaled_w - TARGET_W) // 2
        y_off = (scaled_h - TARGET_H) // 2
        filters.append(
            f"scale={scaled_w}:{scaled_h}:force_original_aspect_ratio=increase,"
            f"crop={TARGET_W}:{TARGET_H}:{x_off}:{y_off}"
        )
    else:
        filters.append(
            f"scale={TARGET_W}:{TARGET_H}:force_original_aspect_ratio=increase,"
            f"crop={TARGET_W}:{TARGET_H}"
        )

    # Cut flash (brightness spike at start of non-first scenes)
    if apply_flash:
        filters.append(cut_flash_filter())

    # Vignette
    if apply_vignette:
        filters.append(vignette_filter(strength=0.35))

    # Ensure correct FPS
    filters.append(f"fps={TARGET_FPS}")

    return ",".join(filters)
