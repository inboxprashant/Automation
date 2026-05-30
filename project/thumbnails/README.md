# Generated Thumbnails

This directory contains all AI-generated YouTube thumbnail images.

## Structure

```
project/thumbnails/
├── index.json              ← master index of every thumbnail
├── ai_tools/
│   └── 2024-01-15_a1b2c3.jpg
├── tech_facts/
├── automation/
├── money_facts/
├── productivity/
└── general/
```

## Output spec

| Property | Value |
|----------|-------|
| Resolution | 1280 × 720 px |
| Format | JPEG (quality 95) |
| Colour space | sRGB |

## Composition layers

```
1. Gradient background    (radial, dark edges)
2. Geometric shapes       (circles, subtle texture)
3. Vignette               (dark edge overlay)
4. Accent bars            (top + bottom colour stripes)
5. Headline               (massive bold text, stroke + shadow)
6. Subheadline            (supporting text)
7. Arrow + label          (points at headline)
8. Badge                  (pill-shaped power word)
9. CTA strip              (bottom bar)
10. Film grain noise      (professional finish)
```

## Colour schemes

| Scheme | Primary | Best for |
|--------|---------|----------|
| `red_black` | #FF0000 | Shock, anger, urgency |
| `yellow_black` | #FFD700 | Greed, money, success |
| `blue_white` | #0066FF | Trust, tech, information |
| `green_dark` | #00CC44 | Growth, health, money |
| `orange_dark` | #FF6600 | Energy, excitement |
| `purple_gold` | #7B2FBE | Premium, mystery |
| `white_red` | #FFFFFF | Clean, bold contrast |
| `cyan_dark` | #00FFCC | Futuristic, tech |

Run `node scripts/generate_thumbnail.js --list-schemes` for full details.
