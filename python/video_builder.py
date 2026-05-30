#!/usr/bin/env python3
"""
video_builder.py — Mobile-first YouTube Shorts video assembly.

Pipeline (single FFmpeg pass per stage):
  Stage 1  Plan scenes from audio duration + script
  Stage 2  Per-clip: scale/crop + Ken Burns zoom + zoom pulse + vignette
  Stage 3  Concat all processed clips into one background video
  Stage 4  Overlay animated hook PNG (first 2 seconds)
  Stage 5  Mix voice + background music
  Stage 6  Burn responsive ASS subtitles (dynamic font size, keyword highlight)
  Stage 7  Save to project/renders/

Key improvements over v1:
  • Responsive subtitles: font size scales with word count (56–88px)
  • Safe-zone margins: 60px left/right, 220px bottom (above YT chrome)
  • Keyword highlighting: UPPERCASE words rendered in yellow
  • Fade-in/out per cue: smooth 80ms transitions
  • Ken Burns zoom: alternates in/out per scene
  • Zoom pulse: subtle 3% scale oscillation every 2.5s
  • Vignette: darkened edges focus attention on centre
  • Hook text: large yellow uppercase with pill background
  • Hardware encoding: NVENC → VideoToolbox → libx264 fallback
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from lib.ffmpeg_path      import setup_ffmpeg_env
FFMPEG_BIN = setup_ffmpeg_env()

from lib.ffprobe          import get_duration
from lib.scene_planner    import plan_scenes, pick_music
from lib.hook_overlay     import render_hook_png
from lib.subtitle_renderer import parse_srt, srt_to_ass
from lib.motion_engine    import build_motion_filter
from lib.caption_config   import TARGET_W, TARGET_H, TARGET_FPS

RENDERS_DIR = Path(__file__).parent.parent / "project" / "renders"


# ── Logging ───────────────────────────────────────────────────────────────────

def log(msg: str) -> None:
    print(f"[video_builder] {msg}", flush=True)


# ── Encoder detection ─────────────────────────────────────────────────────────

def detect_encoder() -> tuple[str, list[str]]:
    try:
        r = subprocess.run(
            [FFMPEG_BIN, "-hide_banner", "-encoders"],
            capture_output=True, text=True, timeout=10,
        )
        enc = r.stdout + r.stderr
    except Exception:
        enc = ""

    if "h264_nvenc" in enc:
        log("Encoder: h264_nvenc (NVIDIA)")
        return "h264_nvenc", ["-preset", "medium", "-cq", "20"]
    if "h264_videotoolbox" in enc:
        log("Encoder: h264_videotoolbox (Apple)")
        return "h264_videotoolbox", ["-q:v", "60"]
    log("Encoder: libx264 (software)")
    return "libx264", ["-preset", "fast", "-crf", "20"]


# ── Script loader ─────────────────────────────────────────────────────────────

def load_script(path: str | None) -> dict:
    if path and os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"hook": "", "body": "", "cta": "", "keywords": [], "title": "Short"}


# ── FFmpeg runner ─────────────────────────────────────────────────────────────

def run_ffmpeg(cmd: list[str], label: str = "ffmpeg") -> None:
    resolved = [FFMPEG_BIN if c == "ffmpeg" else c for c in cmd]
    log(f"Running {label}...")
    r = subprocess.run(resolved, capture_output=True, text=True)
    if r.returncode != 0:
        for line in r.stderr.strip().split("\n")[-50:]:
            print(f"[ffmpeg:err] {line}", file=sys.stderr, flush=True)
        raise RuntimeError(f"{label} failed (exit {r.returncode})")


# ── Path escaping ─────────────────────────────────────────────────────────────

def esc(p: str) -> str:
    """Escape path for FFmpeg filter string (Windows drive-letter safe)."""
    p = os.path.abspath(p).replace("\\", "/")
    if len(p) >= 2 and p[1] == ":":
        p = p[0] + "\\:" + p[2:]
    return p.replace("'", "\\'")


# ── Stage 1: Concat list ──────────────────────────────────────────────────────

def build_concat_list(scenes: list, tmp: str) -> str:
    path = os.path.join(tmp, "concat.txt")
    with open(path, "w", encoding="utf-8") as f:
        for s in scenes:
            clip = os.path.abspath(s.clip_path).replace("\\", "/")
            f.write(f"file '{clip}'\n")
            f.write(f"inpoint {s.clip_start:.3f}\n")
            f.write(f"outpoint {s.clip_start + s.duration:.3f}\n")
    return path


# ── Stage 2+3: Process clips + concat ────────────────────────────────────────

def build_background(scenes: list, tmp: str, encoder: str, enc_flags: list[str]) -> str:
    """
    Process each scene clip individually (scale + motion effects),
    then concatenate into a single background video.

    Each clip gets its own FFmpeg pass so motion filters can be
    parameterised per-scene (zoom direction alternates, flash on cuts).
    """
    processed_paths = []

    for i, scene in enumerate(scenes):
        out = os.path.join(tmp, f"scene_{i:02d}.mp4")
        is_hook = scene.section == "hook"
        is_cta  = scene.section == "cta"

        motion = build_motion_filter(
            duration=scene.duration,
            scene_index=i,
            apply_zoom=scene.zoom or is_hook,
            apply_pulse=not is_hook,          # no pulse on hook (too busy)
            apply_vignette=True,
            apply_flash=(i > 0),              # flash on all cuts except first
        )

        cmd = [
            "ffmpeg", "-y",
            "-ss", str(scene.clip_start),
            "-t",  str(scene.duration),
            "-i",  scene.clip_path,
            "-vf", motion,
            "-c:v", encoder, *enc_flags,
            "-an",
            "-r", str(TARGET_FPS),
            out,
        ]
        run_ffmpeg(cmd, f"scene {i} ({scene.section})")
        processed_paths.append(out)

    # Write concat list for processed clips
    concat_path = os.path.join(tmp, "processed_concat.txt")
    with open(concat_path, "w", encoding="utf-8") as f:
        for p in processed_paths:
            f.write(f"file '{p.replace(chr(92), '/')}'\n")

    bg_path = os.path.join(tmp, "background.mp4")
    cmd = [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0",
        "-i", concat_path,
        "-c:v", encoder, *enc_flags,
        "-an",
        bg_path,
    ]
    run_ffmpeg(cmd, "concat scenes")
    log(f"Background: {bg_path}")
    return bg_path


# ── Stage 4: Hook overlay ─────────────────────────────────────────────────────

def overlay_hook(bg_path: str, hook_png: str | None, tmp: str,
                 encoder: str, enc_flags: list[str]) -> str:
    """Overlay the hook PNG on the first 2 seconds of the background."""
    if not hook_png or not os.path.exists(hook_png):
        return bg_path

    out = os.path.join(tmp, "with_hook.mp4")
    cmd = [
        "ffmpeg", "-y",
        "-i", bg_path,
        "-i", hook_png,
        "-filter_complex",
        "[1:v]format=rgba[hook];"
        "[0:v][hook]overlay=0:0:enable='between(t,0,2)'[vout]",
        "-map", "[vout]",
        "-c:v", encoder, *enc_flags,
        "-an",
        out,
    ]
    run_ffmpeg(cmd, "hook overlay")
    log(f"Hook overlaid: {out}")
    return out


# ── Stage 5: Audio mix ────────────────────────────────────────────────────────

def attach_audio(
    video_path:     str,
    audio_path:     str,
    music_path:     str | None,
    audio_duration: float,
    tmp:            str,
    encoder:        str,
    enc_flags:      list[str],
) -> str:
    """Attach voice + optional background music to the video."""
    out = os.path.join(tmp, "with_audio.mp4")

    if music_path and os.path.exists(music_path):
        # With music: use filter_complex for mixing
        fade_out_start = max(0, audio_duration - 2.0)
        filter_complex = (
            f"[2:a]aloop=loop=-1:size=2e+09,"
            f"atrim=duration={audio_duration:.3f},"
            f"volume=0.10,"
            f"afade=t=in:d=1.5,"
            f"afade=t=out:st={fade_out_start:.3f}:d=2[music];"
            f"[1:a][music]amix=inputs=2:duration=first:dropout_transition=2[aout]"
        )
        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-i", audio_path,
            "-i", music_path,
            "-t", str(audio_duration),
            "-filter_complex", filter_complex,
            "-map", "0:v",
            "-map", "[aout]",
            "-c:v", encoder, *enc_flags,
            "-c:a", "aac", "-b:a", "192k",
            "-shortest",
            out,
        ]
    else:
        # No music: simple stream copy for audio
        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-i", audio_path,
            "-t", str(audio_duration),
            "-map", "0:v",
            "-map", "1:a",
            "-c:v", encoder, *enc_flags,
            "-c:a", "aac", "-b:a", "192k",
            "-shortest",
            out,
        ]

    run_ffmpeg(cmd, "audio mix")
    log(f"Audio attached: {out}")
    return out


# ── Stage 6: Subtitle burn ────────────────────────────────────────────────────

def burn_subtitles(
    video_path: str,
    srt_path:   str,
    output:     str,
    tmp:        str,
    encoder:    str,
    enc_flags:  list[str],
) -> None:
    """Convert SRT → ASS (responsive sizing + highlights) then burn in."""
    ass_path = os.path.join(tmp, "captions.ass")

    cues = parse_srt(srt_path)
    if not cues:
        log("WARNING: no subtitle cues — copying video without subtitles")
        shutil.copy2(video_path, output)
        return

    srt_to_ass(cues, ass_path)
    log(f"ASS generated: {len(cues)} cues")

    ass_esc = esc(ass_path)

    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-vf", f"ass='{ass_esc}'",
        "-c:v", encoder, *enc_flags,
        "-c:a", "copy",
        "-movflags", "+faststart",
        output,
    ]
    run_ffmpeg(cmd, "subtitle burn")
    log(f"Subtitles burned: {output}")


# ── Stage 7: Save to renders/ ─────────────────────────────────────────────────

def save_to_renders(src: str, job_id: str, niche: str) -> str:
    from datetime import date
    d = RENDERS_DIR / (niche or "general")
    d.mkdir(parents=True, exist_ok=True)
    dest = d / f"{date.today().isoformat()}_{job_id}.mp4"
    shutil.copy2(src, str(dest))
    log(f"Saved: {dest}")
    return str(dest)


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio",    required=True)
    parser.add_argument("--srt",      required=True)
    parser.add_argument("--output",   required=True)
    parser.add_argument("--script",   default=None)
    parser.add_argument("--niche",    default="general")
    parser.add_argument("--title",    default="Short")
    parser.add_argument("--job-id",   default="job")
    parser.add_argument("--music",    default=None)
    parser.add_argument("--no-music", action="store_true")
    args = parser.parse_args()

    t0 = time.time()
    log(f"Job {args.job_id} | niche: {args.niche} | title: {args.title[:50]}")

    for label, p in [("audio", args.audio), ("srt", args.srt)]:
        if not os.path.exists(p):
            print(f"[video_builder] ERROR: {label} not found: {p}", file=sys.stderr)
            sys.exit(1)

    script         = load_script(args.script)
    hook_text      = script.get("hook", "")
    encoder, enc_f = detect_encoder()
    audio_dur      = get_duration(args.audio)
    log(f"Audio: {audio_dur:.2f}s")

    scenes = plan_scenes(audio_duration=audio_dur, script=script, niche=args.niche)
    log(f"Scenes: {len(scenes)}")

    music_path = None
    if not args.no_music:
        music_path = args.music or pick_music(args.niche)
        log(f"Music: {Path(music_path).name if music_path else 'none'}")

    with tempfile.TemporaryDirectory(prefix=f"shorts_{args.job_id}_") as tmp:

        # Hook PNG
        hook_png = None
        if hook_text.strip():
            hook_png = os.path.join(tmp, "hook.png")
            try:
                render_hook_png(hook_text, hook_png)
                log(f"Hook PNG: {Path(hook_png).name}")
            except Exception as e:
                log(f"Hook PNG failed (non-fatal): {e}")
                hook_png = None

        # Stage 2+3: Process clips + concat
        bg = build_background(scenes, tmp, encoder, enc_f)

        # Stage 4: Hook overlay
        bg = overlay_hook(bg, hook_png, tmp, encoder, enc_f)

        # Stage 5: Audio
        av = attach_audio(bg, args.audio, music_path, audio_dur, tmp, encoder, enc_f)

        # Stage 6: Subtitles
        burn_subtitles(av, args.srt, args.output, tmp, encoder, enc_f)

    if not os.path.exists(args.output):
        print(f"[video_builder] ERROR: output not created: {args.output}", file=sys.stderr)
        sys.exit(1)

    render_path = save_to_renders(args.output, args.job_id, args.niche)

    elapsed = time.time() - t0
    log(f"Done in {elapsed:.1f}s")
    log(f"Output : {args.output}")
    log(f"Render : {render_path}")

    # Last stdout line captured by Node.js
    print(render_path)


if __name__ == "__main__":
    main()
