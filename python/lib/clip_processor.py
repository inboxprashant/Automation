"""
clip_processor.py — Per-clip video processing using MoviePy + OpenCV.

Handles:
  • Crop / scale to 1080×1920 (9:16)
  • Slow-zoom (Ken Burns) effect
  • Fade-in / fade-out transitions
  • Zoom-in transition (scale punch)
  • Brightness / contrast normalisation via OpenCV
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from moviepy.editor import VideoFileClip, vfx
from moviepy.video.fx.all import crop, fadein, fadeout

# ── Constants ────────────────────────────────────────────────────────────────

TARGET_W = 1080
TARGET_H = 1920
TARGET_FPS = 30
FADE_DURATION = 0.4   # seconds for fade transitions
ZOOM_FACTOR   = 1.08  # slow-zoom end scale (8% larger than start)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _scale_to_fill(clip: VideoFileClip) -> VideoFileClip:
    """
    Scale the clip so it fills 1080×1920 (cover, not contain).
    Crops any overflow from the centre.
    """
    src_w, src_h = clip.size
    target_ratio = TARGET_W / TARGET_H
    src_ratio    = src_w / src_h

    if src_ratio > target_ratio:
        # Wider than target — scale by height, crop width
        new_h = TARGET_H
        new_w = int(src_w * TARGET_H / src_h)
    else:
        # Taller than target — scale by width, crop height
        new_w = TARGET_W
        new_h = int(src_h * TARGET_W / src_w)

    clip = clip.resize((new_w, new_h))

    # Centre-crop to exact target size
    x1 = (new_w - TARGET_W) // 2
    y1 = (new_h - TARGET_H) // 2
    clip = crop(clip, x1=x1, y1=y1, x2=x1 + TARGET_W, y2=y1 + TARGET_H)

    return clip


def _normalise_frame(frame: np.ndarray) -> np.ndarray:
    """
    Apply CLAHE (Contrast Limited Adaptive Histogram Equalisation) to
    the luminance channel so clips look consistent regardless of source.
    """
    lab = cv2.cvtColor(frame, cv2.COLOR_RGB2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    lab = cv2.merge([l, a, b])
    return cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)


def _apply_zoom(clip: VideoFileClip, factor: float = ZOOM_FACTOR) -> VideoFileClip:
    """
    Apply a slow Ken-Burns zoom: starts at 1.0× and ends at `factor`×.
    The clip is pre-scaled so the zoomed version still fills the frame.
    """
    # Pre-scale so the zoomed-out version still covers the frame
    clip = clip.resize(factor)

    def zoom_frame(get_frame, t):
        frame = get_frame(t)
        progress = t / clip.duration if clip.duration > 0 else 0
        scale = 1.0 + (factor - 1.0) * progress

        h, w = frame.shape[:2]
        new_w = int(w / scale)
        new_h = int(h / scale)
        x1 = (w - new_w) // 2
        y1 = (h - new_h) // 2

        cropped = frame[y1:y1 + new_h, x1:x1 + new_w]
        return cv2.resize(cropped, (w, h), interpolation=cv2.INTER_LINEAR)

    return clip.fl(zoom_frame, apply_to=["mask"])


# ── Public API ────────────────────────────────────────────────────────────────

def process_clip(
    clip_path: str,
    start: float,
    duration: float,
    zoom: bool = False,
    transition: str = "cut",
    normalise: bool = True,
) -> VideoFileClip:
    """
    Load, trim, scale, and apply effects to a single background clip.

    Args:
        clip_path:  path to the source video file
        start:      start time within the source clip (seconds)
        duration:   desired output duration (seconds)
        zoom:       apply slow Ken-Burns zoom
        transition: 'cut' | 'fade' | 'zoom_in'
        normalise:  apply CLAHE brightness normalisation

    Returns:
        Processed MoviePy VideoFileClip (no audio, TARGET_W×TARGET_H, TARGET_FPS)
    """
    raw = VideoFileClip(clip_path, audio=False)

    # Clamp start/duration to clip bounds
    clip_dur = raw.duration
    start    = min(start, max(0, clip_dur - 0.5))
    duration = min(duration, clip_dur - start)

    clip = raw.subclip(start, start + duration)
    clip = clip.set_fps(TARGET_FPS)
    clip = _scale_to_fill(clip)

    # Brightness normalisation via OpenCV
    if normalise:
        clip = clip.fl_image(_normalise_frame)

    # Zoom effect
    if zoom:
        clip = _apply_zoom(clip)

    # Transitions
    if transition == "fade":
        clip = fadein(clip, FADE_DURATION)
        clip = fadeout(clip, FADE_DURATION)
    elif transition == "zoom_in":
        # Quick punch-in at the start (scale from 1.05 → 1.0 over 0.3s)
        original_size = clip.size

        def punch_in(get_frame, t):
            frame = get_frame(t)
            if t > 0.3:
                return frame
            scale = 1.05 - 0.05 * (t / 0.3)
            h, w = frame.shape[:2]
            new_w = int(w / scale)
            new_h = int(h / scale)
            x1 = (w - new_w) // 2
            y1 = (h - new_h) // 2
            cropped = frame[y1:y1 + new_h, x1:x1 + new_w]
            return cv2.resize(cropped, (w, h), interpolation=cv2.INTER_LINEAR)

        clip = clip.fl(punch_in, apply_to=["mask"])

    raw.close()
    return clip
