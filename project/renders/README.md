# Rendered Videos

This directory contains all final YouTube Shorts MP4 files.

## Structure

```
project/renders/
├── index.json              ← master index of every render
├── ai_tools/
│   └── 2024-01-15_a1b2c3.mp4
├── tech_facts/
├── automation/
├── money_facts/
├── productivity/
└── general/
```

## Video specs

| Property | Value |
|----------|-------|
| Resolution | 1080 × 1920 (9:16) |
| Frame rate | 30 fps |
| Video codec | H.264 (libx264) |
| Audio codec | AAC 192 kbps |
| Container | MP4 (faststart) |

## Pipeline stages

```
Background clips (assets/backgrounds/)
  ↓ scene_planner.py   — divide audio into scenes, assign clips
  ↓ clip_processor.py  — scale to 9:16, zoom effects, transitions
  ↓ concatenate        — stitch scenes into one background video
  ↓ hook_overlay.py    — animated hook text for first 2 seconds
  ↓ music_mixer.py     — voice + background music (ducked)
  ↓ subtitle_burner.py — FFmpeg libass subtitle burn-in
  ↓ project/renders/   — final MP4
```

## Effects applied

- **Slow zoom (Ken Burns)** — applied to hook scene and every 3rd body scene
- **Zoom-in punch** — quick scale punch on the hook scene transition
- **Fade transitions** — between alternating body scenes
- **Hook text overlay** — animated slide-up + fade-in for first 2 seconds
- **Background music** — ducked to 12% volume, fades in/out
- **UPPERCASE keywords** — high-impact words capitalised in subtitles
