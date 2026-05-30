"""
scene_planner.py — Splits the script into timed scenes and matches
each scene to the best available background clip.

Scene model
───────────
The script has three logical sections:
  hook   — first ~3 s  (high energy, scroll-stopper)
  body   — middle bulk (informational, varied pace)
  cta    — last ~3 s   (call to action)

We divide the total audio duration proportionally, then assign one
background clip per scene.  Clips are selected by keyword matching
against the clip filename / niche tag, with random fallback.

Returns a list of ScenePlan dicts consumed by the video builder.
"""

from __future__ import annotations

import glob
import os
import random
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .ffprobe import get_duration


# ── Constants ────────────────────────────────────────────────────────────────

BACKGROUNDS_DIR = Path(__file__).parent.parent.parent / "assets" / "backgrounds"
CLIPS_DIR       = Path(__file__).parent.parent.parent / "project" / "clips"
MUSIC_DIR       = Path(__file__).parent.parent.parent / "assets" / "music"

# Proportion of total duration assigned to each section
SECTION_RATIOS = {"hook": 0.10, "body": 0.80, "cta": 0.10}

# Minimum clip duration we'll accept (clips shorter than this are skipped)
MIN_CLIP_DURATION = 3.0


# ── Data classes ─────────────────────────────────────────────────────────────

@dataclass
class ScenePlan:
    index:       int
    section:     str          # 'hook' | 'body_N' | 'cta'
    start:       float        # seconds into the final video
    duration:    float        # seconds this scene lasts
    clip_path:   str          # absolute path to background clip
    clip_start:  float        # where in the clip to start (for variety)
    keywords:    list[str] = field(default_factory=list)
    zoom:        bool = False  # apply slow-zoom effect to this scene
    transition:  str = "cut"  # 'cut' | 'fade' | 'zoom_in'


# ── Clip library ─────────────────────────────────────────────────────────────

def _find_clips() -> list[Path]:
    """Return all video files from project/clips/ and assets/backgrounds/."""
    exts = ["*.mp4", "*.mov", "*.webm", "*.mkv"]
    clips = []
    # project/clips/ takes priority (downloaded stock clips)
    for subdir in CLIPS_DIR.rglob("*"):
        if subdir.is_dir():
            for ext in exts:
                clips.extend(subdir.glob(ext))
    # Also include any manually placed clips in assets/backgrounds/
    for ext in exts:
        clips.extend(BACKGROUNDS_DIR.glob(ext))
    return [c for c in clips if _clip_usable(c)]


def _clip_usable(path: Path) -> bool:
    """Return True if the clip is long enough to use."""
    try:
        return get_duration(str(path)) >= MIN_CLIP_DURATION
    except Exception:
        return False


def _score_clip(clip: Path, keywords: list[str]) -> int:
    """Score a clip by how many keywords appear in its filename."""
    name = clip.stem.lower().replace("_", " ").replace("-", " ")
    return sum(1 for kw in keywords if kw.lower() in name)


def _pick_clip(clips: list[Path], keywords: list[str], used: set[str]) -> Path:
    """
    Pick the best matching clip for the given keywords.
    Avoids repeating the same clip consecutively when possible.
    """
    if not clips:
        raise FileNotFoundError(
            f"No background clips found in {BACKGROUNDS_DIR}. "
            "Add .mp4 files to assets/backgrounds/."
        )

    # Score all clips
    scored = sorted(clips, key=lambda c: _score_clip(c, keywords), reverse=True)

    # Prefer clips not recently used
    fresh = [c for c in scored if str(c) not in used]
    pool = fresh if fresh else scored

    return pool[0]


# ── Scene planner ─────────────────────────────────────────────────────────────

def plan_scenes(
    audio_duration: float,
    script: dict,
    niche: str = "general",
    body_scene_count: int = 3,
) -> list[ScenePlan]:
    """
    Divide the audio into scenes and assign background clips.

    Args:
        audio_duration:   total audio length in seconds
        script:           script dict with keys: hook, body, cta, keywords
        niche:            content niche (used for clip scoring)
        body_scene_count: how many sub-scenes to split the body into

    Returns:
        List of ScenePlan objects in chronological order.
    """
    clips = _find_clips()
    keywords = script.get("keywords", []) + [niche]

    hook_dur = max(2.0, audio_duration * SECTION_RATIOS["hook"])
    cta_dur  = max(2.0, audio_duration * SECTION_RATIOS["cta"])
    body_dur = max(1.0, audio_duration - hook_dur - cta_dur)

    scenes: list[ScenePlan] = []
    used_clips: set[str] = set()
    cursor = 0.0

    # ── Hook scene ───────────────────────────────────────────────────────────
    clip = _pick_clip(clips, keywords + ["energy", "fast", "city"], used_clips)
    clip_dur = get_duration(str(clip))
    clip_start = random.uniform(0, max(0, clip_dur - hook_dur - 1))

    scenes.append(ScenePlan(
        index=0,
        section="hook",
        start=cursor,
        duration=hook_dur,
        clip_path=str(clip),
        clip_start=clip_start,
        keywords=keywords,
        zoom=True,
        transition="zoom_in",
    ))
    used_clips.add(str(clip))
    cursor += hook_dur

    # ── Body scenes ──────────────────────────────────────────────────────────
    scene_dur = body_dur / body_scene_count
    for i in range(body_scene_count):
        clip = _pick_clip(clips, keywords, used_clips)
        clip_dur = get_duration(str(clip))
        clip_start = random.uniform(0, max(0, clip_dur - scene_dur - 1))

        transition = "fade" if i % 2 == 0 else "cut"
        zoom = (i % 3 == 1)  # zoom every third scene

        scenes.append(ScenePlan(
            index=i + 1,
            section=f"body_{i}",
            start=cursor,
            duration=scene_dur,
            clip_path=str(clip),
            clip_start=clip_start,
            keywords=keywords,
            zoom=zoom,
            transition=transition,
        ))
        used_clips.add(str(clip))
        cursor += scene_dur

    # ── CTA scene ────────────────────────────────────────────────────────────
    clip = _pick_clip(clips, keywords + ["subscribe", "follow"], used_clips)
    clip_dur = get_duration(str(clip))
    clip_start = random.uniform(0, max(0, clip_dur - cta_dur - 1))

    scenes.append(ScenePlan(
        index=body_scene_count + 1,
        section="cta",
        start=cursor,
        duration=cta_dur,
        clip_path=str(clip),
        clip_start=clip_start,
        keywords=keywords,
        zoom=False,
        transition="fade",
    ))

    return scenes


# ── Music picker ─────────────────────────────────────────────────────────────

def pick_music(niche: str = "general") -> Optional[str]:
    """
    Return the path to a background music file, or None if none available.
    Tries niche-specific subfolder first, then falls back to root music dir.
    """
    search_dirs = [
        MUSIC_DIR / niche,
        MUSIC_DIR,
    ]
    for d in search_dirs:
        files = list(d.glob("*.mp3")) + list(d.glob("*.wav")) + list(d.glob("*.m4a"))
        if files:
            return str(random.choice(files))
    return None
