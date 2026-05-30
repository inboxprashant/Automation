#!/usr/bin/env python3
"""
thumbnail_builder.py — High-CTR YouTube thumbnail renderer.

Output: 1280×720 JPG

Composition layers (bottom to top):
  1. Background  — gradient or blurred stock image
  2. Vignette    — dark edge overlay for depth
  3. Accent bar  — coloured horizontal stripe
  4. Badge       — pill-shaped label (top-left)
  5. Headline    — massive bold text with stroke + shadow
  6. Subheadline — supporting text below headline
  7. Arrow       — pointing at headline with label
  8. CTA strip   — bottom bar with call-to-action text
  9. Noise       — subtle film grain for professional look

Usage:
  python thumbnail_builder.py
    --output      <path/to/output.jpg>
    --headline    "THEY HID THIS"
    --subheadline "The AI tool replacing entire teams"
    --badge       "SHOCKING"
    --arrow-label "They hide this"
    --cta-text    "Watch Before Deleted"
    --scheme      red_black
    --emotion     shock
    --niche       ai_tools
    --job-id      abc123
"""

from __future__ import annotations

import argparse
import math
import os
import random
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import (
    Image, ImageDraw, ImageFilter, ImageFont, ImageEnhance
)

# ── Canvas ────────────────────────────────────────────────────────────────────

W, H       = 1280, 720
QUALITY    = 95          # JPEG quality
FONT_DIR   = Path(__file__).parent.parent / "assets" / "fonts"

# ── Colour schemes ────────────────────────────────────────────────────────────

SCHEMES: dict[str, dict] = {
    "red_black":    {"bg1": "#1A0000", "bg2": "#3D0000", "primary": "#FF0000",
                     "accent": "#FF4444", "text": "#FFFFFF", "sub": "#FFCCCC",
                     "badge_bg": "#FF0000", "badge_text": "#FFFFFF",
                     "cta_bg": "#CC0000", "cta_text": "#FFFFFF"},
    "yellow_black": {"bg1": "#0D0D00", "bg2": "#1A1A00", "primary": "#FFD700",
                     "accent": "#FFA500", "text": "#FFD700", "sub": "#FFFFFF",
                     "badge_bg": "#FFD700", "badge_text": "#000000",
                     "cta_bg": "#CC9900", "cta_text": "#000000"},
    "blue_white":   {"bg1": "#001133", "bg2": "#002266", "primary": "#0066FF",
                     "accent": "#00CCFF", "text": "#FFFFFF", "sub": "#CCDDFF",
                     "badge_bg": "#0066FF", "badge_text": "#FFFFFF",
                     "cta_bg": "#0044CC", "cta_text": "#FFFFFF"},
    "green_dark":   {"bg1": "#001A00", "bg2": "#003300", "primary": "#00CC44",
                     "accent": "#00FF66", "text": "#FFFFFF", "sub": "#CCFFDD",
                     "badge_bg": "#00CC44", "badge_text": "#000000",
                     "cta_bg": "#009933", "cta_text": "#FFFFFF"},
    "orange_dark":  {"bg1": "#1A0500", "bg2": "#330A00", "primary": "#FF6600",
                     "accent": "#FFAA00", "text": "#FFFFFF", "sub": "#FFE0CC",
                     "badge_bg": "#FF6600", "badge_text": "#FFFFFF",
                     "cta_bg": "#CC4400", "cta_text": "#FFFFFF"},
    "purple_gold":  {"bg1": "#0D0020", "bg2": "#1A0040", "primary": "#7B2FBE",
                     "accent": "#FFD700", "text": "#FFFFFF", "sub": "#E0CCFF",
                     "badge_bg": "#FFD700", "badge_text": "#1A0040",
                     "cta_bg": "#5A1A8A", "cta_text": "#FFD700"},
    "white_red":    {"bg1": "#F0F0F0", "bg2": "#FFFFFF", "primary": "#CC0000",
                     "accent": "#FF4444", "text": "#CC0000", "sub": "#333333",
                     "badge_bg": "#CC0000", "badge_text": "#FFFFFF",
                     "cta_bg": "#CC0000", "cta_text": "#FFFFFF"},
    "cyan_dark":    {"bg1": "#001A1A", "bg2": "#003333", "primary": "#00FFCC",
                     "accent": "#00CCAA", "text": "#00FFCC", "sub": "#CCFFEE",
                     "badge_bg": "#00FFCC", "badge_text": "#001A1A",
                     "cta_bg": "#009977", "cta_text": "#FFFFFF"},
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def load_font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    """Load Montserrat Bold (or best available fallback)."""
    candidates = []
    if bold:
        candidates += [
            FONT_DIR / "Montserrat-Bold.ttf",
            FONT_DIR / "Montserrat-ExtraBold.ttf",
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
            Path("C:/Windows/Fonts/arialbd.ttf"),
            Path("/System/Library/Fonts/Helvetica.ttc"),
        ]
    else:
        candidates += [
            FONT_DIR / "Montserrat-SemiBold.ttf",
            FONT_DIR / "Montserrat-Regular.ttf",
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
            Path("C:/Windows/Fonts/arial.ttf"),
        ]
    for c in candidates:
        if c.exists():
            return ImageFont.truetype(str(c), size)
    return ImageFont.load_default()


def draw_text_with_stroke(
    draw: ImageDraw.ImageDraw,
    pos: tuple[int, int],
    text: str,
    font: ImageFont.FreeTypeFont,
    fill: tuple,
    stroke_fill: tuple,
    stroke_width: int = 4,
    anchor: str = "lt",
) -> None:
    """Draw text with a multi-directional stroke for maximum legibility."""
    x, y = pos
    # Draw stroke in 8 directions
    for dx in range(-stroke_width, stroke_width + 1):
        for dy in range(-stroke_width, stroke_width + 1):
            if dx == 0 and dy == 0:
                continue
            draw.text((x + dx, y + dy), text, font=font, fill=stroke_fill, anchor=anchor)
    # Draw main text
    draw.text(pos, text, font=font, fill=fill, anchor=anchor)


def wrap_text(text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    """Wrap text to fit within max_width pixels."""
    words = text.split()
    lines, current = [], ""
    dummy = Image.new("RGB", (1, 1))
    draw  = ImageDraw.Draw(dummy)

    for word in words:
        test = f"{current} {word}".strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


# ── Layer renderers ───────────────────────────────────────────────────────────

def render_background(scheme: dict) -> Image.Image:
    """
    Render a gradient background with subtle geometric shapes.
    Uses a radial gradient from bg2 (centre) to bg1 (edges).
    """
    img = Image.new("RGB", (W, H))
    arr = np.zeros((H, W, 3), dtype=np.uint8)

    c1 = np.array(hex_to_rgb(scheme["bg1"]), dtype=float)
    c2 = np.array(hex_to_rgb(scheme["bg2"]), dtype=float)

    cx, cy = W * 0.45, H * 0.5
    max_dist = math.sqrt(cx**2 + cy**2)

    for y in range(H):
        for x in range(W):
            dist = math.sqrt((x - cx)**2 + (y - cy)**2)
            t = min(1.0, dist / max_dist)
            # Ease-in-out
            t = t * t * (3 - 2 * t)
            color = (c2 * (1 - t) + c1 * t).astype(np.uint8)
            arr[y, x] = color

    img = Image.fromarray(arr, "RGB")

    # Add subtle diagonal lines for texture
    draw = ImageDraw.Draw(img)
    line_color = tuple(min(255, c + 15) for c in hex_to_rgb(scheme["bg2"]))
    for i in range(-H, W + H, 80):
        draw.line([(i, 0), (i + H, H)], fill=line_color, width=1)

    return img


def render_vignette(scheme: dict) -> Image.Image:
    """Dark edge vignette to focus attention on the centre."""
    arr = np.zeros((H, W, 4), dtype=np.uint8)
    cx, cy = W / 2, H / 2

    for y in range(H):
        for x in range(W):
            dx = (x - cx) / cx
            dy = (y - cy) / cy
            dist = math.sqrt(dx**2 + dy**2)
            alpha = int(min(200, max(0, (dist - 0.5) * 300)))
            arr[y, x] = [0, 0, 0, alpha]

    return Image.fromarray(arr, "RGBA")


def render_accent_bar(scheme: dict) -> Image.Image:
    """Horizontal accent stripe — adds visual energy."""
    img  = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    color = hex_to_rgb(scheme["primary"]) + (180,)

    # Top stripe
    draw.rectangle([(0, 0), (W, 8)], fill=color)
    # Bottom stripe (thicker)
    draw.rectangle([(0, H - 12), (W, H)], fill=color)

    return img


def render_geometric_shapes(scheme: dict) -> Image.Image:
    """Abstract geometric shapes for visual interest."""
    img  = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    primary = hex_to_rgb(scheme["primary"])
    accent  = hex_to_rgb(scheme["accent"])

    # Large circle (right side, partially off-canvas)
    circle_color = primary + (25,)
    draw.ellipse([(W - 300, -100), (W + 200, H + 100)], fill=circle_color)

    # Medium circle (bottom-left)
    circle2_color = accent + (20,)
    draw.ellipse([(-100, H - 250), (300, H + 100)], fill=circle2_color)

    # Small accent circles
    for _ in range(5):
        r = random.randint(20, 60)
        x = random.randint(W // 2, W - 50)
        y = random.randint(50, H - 50)
        dot_color = accent + (30,)
        draw.ellipse([(x - r, y - r), (x + r, y + r)], fill=dot_color)

    return img


def render_badge(text: str, scheme: dict) -> tuple[Image.Image, tuple[int, int]]:
    """
    Pill-shaped badge element.
    Returns (badge_image, (x, y) position).
    """
    font     = load_font(32, bold=True)
    dummy    = Image.new("RGB", (1, 1))
    draw_d   = ImageDraw.Draw(dummy)
    bbox     = draw_d.textbbox((0, 0), text, font=font)
    tw, th   = bbox[2] - bbox[0], bbox[3] - bbox[1]

    pad_x, pad_y = 24, 14
    bw = tw + pad_x * 2
    bh = th + pad_y * 2

    badge = Image.new("RGBA", (bw + 6, bh + 6), (0, 0, 0, 0))
    draw  = ImageDraw.Draw(badge)

    bg_color   = hex_to_rgb(scheme["badge_bg"]) + (255,)
    text_color = hex_to_rgb(scheme["badge_text"])

    # Shadow
    draw.rounded_rectangle([(3, 3), (bw + 3, bh + 3)], radius=bh // 2,
                            fill=(0, 0, 0, 120))
    # Badge body
    draw.rounded_rectangle([(0, 0), (bw, bh)], radius=bh // 2, fill=bg_color)
    # Text
    draw.text((pad_x, pad_y), text, font=font, fill=text_color)

    pos = (40, 40)
    return badge, pos


def render_headline(text: str, scheme: dict, max_width: int = 760) -> tuple[Image.Image, int]:
    """
    Render the main headline text.
    Returns (image, bottom_y) so subheadline knows where to start.
    """
    font_size = 130
    font      = load_font(font_size, bold=True)

    # Auto-shrink if text is too long
    dummy = Image.new("RGB", (1, 1))
    draw  = ImageDraw.Draw(dummy)
    while font_size > 60:
        lines = wrap_text(text, font, max_width)
        total_h = sum(draw.textbbox((0, 0), l, font=font)[3] for l in lines)
        if total_h < H * 0.55:
            break
        font_size -= 8
        font = load_font(font_size, bold=True)

    lines   = wrap_text(text, font, max_width)
    layer   = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw    = ImageDraw.Draw(layer)

    text_color   = hex_to_rgb(scheme["text"])
    stroke_color = (0, 0, 0)

    # Start in upper-centre area
    y = 120
    bottom_y = y

    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        lw   = bbox[2] - bbox[0]
        lh   = bbox[3] - bbox[1]
        x    = (W - lw) // 2 - 60   # slightly left of centre

        draw_text_with_stroke(
            draw, (x, y), line, font,
            fill=text_color,
            stroke_fill=stroke_color,
            stroke_width=6,
        )
        y += lh + 12
        bottom_y = y

    return layer, bottom_y


def render_subheadline(text: str, scheme: dict, start_y: int) -> Image.Image:
    """Render the supporting subheadline text."""
    font  = load_font(42, bold=False)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw  = ImageDraw.Draw(layer)

    lines = wrap_text(text, font, 700)
    color = hex_to_rgb(scheme["sub"])
    y     = start_y + 16

    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        lw   = bbox[2] - bbox[0]
        x    = (W - lw) // 2 - 60
        draw_text_with_stroke(draw, (x, y), line, font,
                              fill=color, stroke_fill=(0, 0, 0), stroke_width=3)
        y += (bbox[3] - bbox[1]) + 8

    return layer


def render_arrow(label: str, scheme: dict, target_y: int) -> Image.Image:
    """
    Render a bold arrow pointing at the headline, with a label.
    Arrow points from right side toward the headline text.
    """
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw  = ImageDraw.Draw(layer)

    color = hex_to_rgb(scheme["accent"]) + (230,)
    font  = load_font(34, bold=True)

    # Arrow coordinates — points left toward headline
    ax1, ay1 = W - 80,  target_y + 40
    ax2, ay2 = W - 220, target_y + 40

    # Arrow shaft
    draw.line([(ax1, ay1), (ax2, ay2)], fill=color, width=8)

    # Arrowhead (triangle pointing left)
    tip_x = ax2 - 2
    head  = [
        (tip_x,      ay2),
        (tip_x + 30, ay2 - 18),
        (tip_x + 30, ay2 + 18),
    ]
    draw.polygon(head, fill=color)

    # Label above the arrow
    if label:
        bbox = draw.textbbox((0, 0), label, font=font)
        lw   = bbox[2] - bbox[0]
        lx   = ax2 + (ax1 - ax2) // 2 - lw // 2
        draw_text_with_stroke(
            draw, (lx, ay1 - 44), label, font,
            fill=hex_to_rgb(scheme["accent"]),
            stroke_fill=(0, 0, 0),
            stroke_width=3,
        )

    return layer


def render_cta_strip(text: str, scheme: dict) -> Image.Image:
    """Bottom CTA strip with call-to-action text."""
    layer    = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw     = ImageDraw.Draw(layer)
    strip_h  = 64
    y_top    = H - strip_h - 12

    bg_color = hex_to_rgb(scheme["cta_bg"]) + (230,)
    draw.rectangle([(0, y_top), (W, H - 12)], fill=bg_color)

    font  = load_font(36, bold=True)
    color = hex_to_rgb(scheme["cta_text"])
    bbox  = draw.textbbox((0, 0), text, font=font)
    tw    = bbox[2] - bbox[0]
    th    = bbox[3] - bbox[1]
    tx    = (W - tw) // 2
    ty    = y_top + (strip_h - th) // 2

    draw_text_with_stroke(draw, (tx, ty), text, font,
                          fill=color, stroke_fill=(0, 0, 0), stroke_width=3)
    return layer


def render_noise(strength: float = 0.03) -> Image.Image:
    """Subtle film grain for a professional, non-flat look."""
    arr   = np.random.randint(0, int(255 * strength), (H, W, 1), dtype=np.uint8)
    arr   = np.repeat(arr, 3, axis=2)
    noise = Image.fromarray(arr, "RGB").convert("RGBA")
    noise.putalpha(30)
    return noise


# ── Compositor ────────────────────────────────────────────────────────────────

def build_thumbnail(
    output_path: str,
    headline: str,
    subheadline: str,
    badge: str,
    arrow_label: str,
    cta_text: str,
    scheme_name: str,
    **kwargs,
) -> None:
    scheme = SCHEMES.get(scheme_name, SCHEMES["red_black"])

    # ── Layer 1: Background ──────────────────────────────────────────────────
    canvas = render_background(scheme).convert("RGBA")

    # ── Layer 2: Geometric shapes ────────────────────────────────────────────
    shapes = render_geometric_shapes(scheme)
    canvas = Image.alpha_composite(canvas, shapes)

    # ── Layer 3: Vignette ────────────────────────────────────────────────────
    vignette = render_vignette(scheme)
    canvas   = Image.alpha_composite(canvas, vignette)

    # ── Layer 4: Accent bars ─────────────────────────────────────────────────
    accent = render_accent_bar(scheme)
    canvas = Image.alpha_composite(canvas, accent)

    # ── Layer 5: Headline ────────────────────────────────────────────────────
    headline_layer, bottom_y = render_headline(headline, scheme)
    canvas = Image.alpha_composite(canvas, headline_layer)

    # ── Layer 6: Subheadline ─────────────────────────────────────────────────
    sub_layer = render_subheadline(subheadline, scheme, bottom_y)
    canvas    = Image.alpha_composite(canvas, sub_layer)

    # ── Layer 7: Arrow ───────────────────────────────────────────────────────
    if arrow_label:
        arrow_layer = render_arrow(arrow_label, scheme, target_y=140)
        canvas      = Image.alpha_composite(canvas, arrow_layer)

    # ── Layer 8: Badge ───────────────────────────────────────────────────────
    if badge:
        badge_img, badge_pos = render_badge(badge, scheme)
        canvas.paste(badge_img, badge_pos, badge_img)

    # ── Layer 9: CTA strip ───────────────────────────────────────────────────
    if cta_text:
        cta_layer = render_cta_strip(cta_text, scheme)
        canvas    = Image.alpha_composite(canvas, cta_layer)

    # ── Layer 10: Noise ──────────────────────────────────────────────────────
    noise  = render_noise()
    canvas = Image.alpha_composite(canvas, noise)

    # ── Export ───────────────────────────────────────────────────────────────
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    final = canvas.convert("RGB")

    # Slight sharpening for crispness at small sizes
    final = final.filter(ImageFilter.UnsharpMask(radius=1.2, percent=120, threshold=3))

    final.save(output_path, "JPEG", quality=QUALITY, optimize=True)
    print(f"[thumbnail_builder] Saved: {output_path}")
    print(output_path)   # last line captured by Node.js


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="YouTube thumbnail renderer")
    parser.add_argument("--output",      required=True)
    parser.add_argument("--headline",    required=True)
    parser.add_argument("--subheadline", default="")
    parser.add_argument("--badge",       default="")
    parser.add_argument("--arrow-label", default="")
    parser.add_argument("--cta-text",    default="")
    parser.add_argument("--scheme",      default="red_black")
    parser.add_argument("--emotion",     default="curiosity")
    parser.add_argument("--niche",       default="general")
    parser.add_argument("--job-id",      default="job")
    args = parser.parse_args()

    print(f"[thumbnail_builder] Job {args.job_id} | scheme: {args.scheme} | emotion: {args.emotion}")

    build_thumbnail(
        output_path  = args.output,
        headline     = args.headline,
        subheadline  = args.subheadline,
        badge        = args.badge,
        arrow_label  = getattr(args, "arrow_label"),
        cta_text     = getattr(args, "cta_text"),
        scheme_name  = args.scheme,
        emotion      = args.emotion,
        niche        = args.niche,
        job_id       = args.job_id,
    )


if __name__ == "__main__":
    main()
