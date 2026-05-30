# Generated Captions

This directory contains all caption artefacts produced by the subtitle generator.

## Structure

```
project/captions/
├── index.json                              ← master index of every caption set
├── ai_tools/
│   ├── 2024-01-15_a1b2c3.srt              ← segment-level SRT (FFmpeg burn-in)
│   ├── 2024-01-15_a1b2c3.chunked.srt      ← 3-word chunks (Shorts style)
│   ├── 2024-01-15_a1b2c3.highlighted.srt  ← chunked + keywords UPPERCASED
│   ├── 2024-01-15_a1b2c3.words.json       ← word timestamps (machine-readable)
│   ├── 2024-01-15_a1b2c3.highlights.json  ← keyword highlight map
│   └── 2024-01-15_a1b2c3.vtt             ← WebVTT (per-word, for web players)
├── tech_facts/
├── automation/
├── money_facts/
├── productivity/
└── general/
```

## File formats

### Segment SRT (`.srt`)
Standard SRT with one cue per Whisper segment (~sentence).
Used as the fallback for FFmpeg subtitle burn-in.

### Chunked SRT (`.chunked.srt`)
3 words per cue — the fast-paced style used in viral Shorts.
Timing is derived from Whisper word-level timestamps.

### Highlighted SRT (`.highlighted.srt`)
Same as chunked, but high-impact keywords are **UPPERCASED**.
This is the file used by the video builder for FFmpeg burn-in.

```
1
00:00:00,000 --> 00:00:01,200
This AI TOOL just

2
00:00:01,250 --> 00:00:02,400
REPLACED three full-time
```

### Word timestamps (`.words.json`)
```json
{
  "words": [
    { "word": "This", "start": 0.0, "end": 0.3, "duration": 0.3, "index": 0, "isPunctuation": false }
  ],
  "totalWords": 98,
  "totalDuration": 44.2,
  "wordsPerMinute": 133,
  "sentences": [...]
}
```

### Highlight map (`.highlights.json`)
```json
[
  {
    "word": "TOOL",
    "start": 0.82,
    "end": 1.1,
    "wordIndex": 2,
    "score": 160,
    "reason": "script_keyword"
  }
]
```

### WebVTT (`.vtt`)
One cue per word. Used for web-based players and accessibility tools.

## Keyword highlighting

Keywords are detected in three layers (highest priority first):

1. **Script keywords** — explicit keywords from the script JSON (`score +100`)
2. **Niche power words** — curated per-niche dictionary (`score +60`)
3. **TF-IDF scoring** — rare, long, or numeric words (`score +10–50`)

Minimum score to be highlighted: **55**
