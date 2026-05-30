"""
music_mixer.py — Background music mixing.

Loads a music track, loops/trims it to match the video duration,
applies a volume envelope (fade-in at start, duck under voice,
fade-out at end), and returns a MoviePy AudioFileClip.

Volume levels:
  intro  (0 – 1.5 s)  : 0 → MUSIC_VOLUME  (fade in)
  body   (1.5 s – end-2s): MUSIC_VOLUME    (constant, ducked under voice)
  outro  (end-2s – end): MUSIC_VOLUME → 0  (fade out)
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

import numpy as np
from moviepy.editor import AudioFileClip, CompositeAudioClip, afx

# ── Constants ────────────────────────────────────────────────────────────────

MUSIC_VOLUME  = 0.12   # background music volume relative to voice (0–1)
FADE_IN_DUR   = 1.5    # seconds
FADE_OUT_DUR  = 2.0    # seconds


def mix_music(
    music_path: Optional[str],
    voice_clip: AudioFileClip,
    total_duration: float,
) -> Optional[CompositeAudioClip]:
    """
    Mix background music with the voice audio.

    Args:
        music_path:     path to music file, or None (returns voice only)
        voice_clip:     the voice AudioFileClip
        total_duration: total video duration in seconds

    Returns:
        CompositeAudioClip (voice + music) or the original voice_clip if
        no music is available.
    """
    if not music_path or not os.path.exists(music_path):
        return voice_clip

    try:
        music = AudioFileClip(music_path)

        # Loop music if shorter than video
        if music.duration < total_duration:
            loops = int(np.ceil(total_duration / music.duration))
            from moviepy.editor import concatenate_audioclips
            music = concatenate_audioclips([music] * loops)

        # Trim to exact duration
        music = music.subclip(0, total_duration)

        # Apply volume envelope
        music = music.volumex(MUSIC_VOLUME)
        music = afx.audio_fadein(music,  FADE_IN_DUR)
        music = afx.audio_fadeout(music, FADE_OUT_DUR)

        # Composite: voice on top, music underneath
        return CompositeAudioClip([voice_clip, music])

    except Exception as e:
        print(f"[music_mixer] Warning: could not load music ({e}). Continuing without it.")
        return voice_clip
