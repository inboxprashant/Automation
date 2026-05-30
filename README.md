# YouTube Shorts Automation System

A production-ready, fully automated pipeline that generates, renders, and publishes viral YouTube Shorts daily — zero manual work required.

> **Live proof:** https://www.youtube.com/shorts/7h0cOXP-leQ — published automatically by this system.

---

## How it works

```
┌─────────────────────────────────────────────────────────────────┐
│                     DAILY AUTOMATION FLOW                       │
├─────────────────────────────────────────────────────────────────┤
│  1. Trend Finder    → Top 10 viral topics (Google/Reddit/YT)    │
│  2. Script Gen      → Hook + body + CTA  (GPT-4o or local)      │
│  3. Voice Gen       → Realistic MP3      (ElevenLabs TTS)       │
│  4. Stock Clips     → Vertical MP4s      (Pexels API)           │
│  5. Captions        → SRT + highlights   (Whisper or local)     │
│  6. Video Build     → 1080×1920 MP4      (FFmpeg + NVENC)       │
│  7. Thumbnail       → High-CTR JPG       (GPT-4o + Pillow)      │
│  8. Upload          → Auto-publish       (YouTube Data API v3)  │
│  9. Notify          → Email report       (Gmail SMTP)           │
└─────────────────────────────────────────────────────────────────┘
```

**Runs automatically at 09:00, 15:00, and 20:00 UTC every day.**

---

## Quick Start

### 1. Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 18 | https://nodejs.org |
| Python | ≥ 3.10 | https://python.org |
| FFmpeg | any | `winget install ffmpeg` or via `pip install imageio-ffmpeg` |

### 2. Install dependencies

```bash
# Node.js packages
npm install

# Python packages
pip install moviepy==1.0.3 openai==1.30.1 pysrt==1.1.2 python-dotenv==1.0.1 \
            imageio-ffmpeg==0.4.9 requests==2.32.2 openai-whisper pillow opencv-python
```

### 3. Configure environment

Your `.env` is already set up. The only values you need to update:

```bash
# Required for email notifications (everything else works without it)
GMAIL_PASS=your-16-char-app-password   # https://myaccount.google.com/apppasswords

# Optional — enables GPT-4o scripts and faster Whisper API
# Add billing credits at: https://platform.openai.com/settings/billing
OPENAI_API_KEY=sk-...
```

### 4. Get YouTube OAuth token (one time only)

```bash
node scripts/get_token.js
```

Open the printed URL, authorise your Google account, copy the `refresh_token` into `.env`.

### 5. Start the automation

```bash
npm start
```

The system runs in the background and publishes Shorts at 09:00, 15:00, and 20:00 UTC.

---

## API Keys Status

| Service | Status | Notes |
|---------|--------|-------|
| OpenAI | ⚠️ Quota | Add billing credits for GPT-4o + Whisper API. **System works without it** using local fallbacks. |
| ElevenLabs | ✅ Working | Using Liam voice (free premade) |
| YouTube | ✅ Working | OAuth2 token active |
| Pexels | ✅ Working | Stock clips downloading |
| Pixabay | ⚠️ Invalid key | Set `PIXABAY_API_KEY` for extra clips |
| Gmail | ⚠️ Placeholder | Set `GMAIL_PASS` for email notifications |

### Fallback behaviour (no OpenAI credits needed)

- **Script generation** → Uses curated topic bank (25 angles across 5 niches)
- **Captions** → Uses local Whisper model (runs on CPU, ~90s per video)
- **Thumbnail** → Skipped (non-fatal, video still uploads)

---

## Running individual steps

```bash
# Validate your .env
npm run check:config

# Run the full pipeline once right now
node scripts/run_workflow.js --niche ai_tools

# Skip specific steps
node scripts/run_workflow.js --niche ai_tools --skip findTrends,generateThumbnail

# Run individual steps
npm run generate:script -- ai_tools        # Generate a script
npm run generate:voice  -- --job <jobId>   # Generate voice audio
npm run generate:captions -- --job <jobId> # Generate captions
npm run fetch:clips -- --job <jobId>       # Download stock clips
npm run generate:video -- --job <jobId>    # Render the video
npm run upload:video -- --job <jobId>      # Upload to YouTube

# Find trending topics
npm run find:trends

# View scheduler status
npm run scheduler:status

# Run analytics
npm run analytics

# Test email notifications
npm run test:email -- --all

# Start the dashboard (http://localhost:3001)
npm run dashboard
```

---

## Schedule configuration

Edit these in `.env`:

```bash
# Upload times (HH:MM, comma-separated, in SCHEDULE_TIMEZONE)
UPLOAD_TIMES=09:00,15:00,20:00

# Timezone (IANA format)
SCHEDULE_TIMEZONE=UTC                  # or America/New_York, Europe/London, etc.

# Videos per slot trigger
SHORTS_PER_DAY=2                       # 2 per slot × 3 slots = 6 Shorts/day

# Different niche per slot (optional)
SLOT_NICHES=ai_tools,,money_facts      # slot1=ai_tools, slot2=default, slot3=money_facts
```

---

## Project structure

```
youtube-shorts-automation/
│
├── src/
│   ├── index.js                    ← Entry point + health check server
│   ├── config/                     ← Env validation + config assembly
│   ├── scheduler/                  ← Multi-slot cron + retry tracker
│   ├── workflow/                   ← Task queue + workflow manager + steps
│   ├── ai/                         ← Script generation (GPT-4o + local fallback)
│   ├── voice/                      ← ElevenLabs TTS + rate limiter
│   ├── captions/                   ← Whisper transcription (API + local fallback)
│   ├── media/                      ← Pexels/Pixabay stock clip downloader
│   ├── video/                      ← FFmpeg video creator
│   ├── thumbnail/                  ← GPT-4o + Pillow thumbnail generator
│   ├── upload/                     ← YouTube Data API v3 uploader
│   ├── notifications/              ← Gmail SMTP email notifier
│   ├── trends/                     ← Google Trends + Reddit + YouTube sources
│   ├── analytics/                  ← YouTube Analytics tracker
│   └── utils/                      ← Logger, retry, fs helpers, health check
│
├── python/
│   ├── video_builder.py            ← Single-pass FFmpeg video assembly
│   ├── transcribe.py               ← Local Whisper transcription
│   └── lib/
│       ├── ffmpeg_path.py          ← FFmpeg binary resolver (system/imageio)
│       ├── ffprobe.py              ← Media metadata (ffprobe + moviepy fallback)
│       ├── scene_planner.py        ← Scene division + clip assignment
│       ├── clip_processor.py       ← Scale/crop/zoom/transitions
│       ├── hook_overlay.py         ← Hook text PNG renderer (Pillow)
│       ├── music_mixer.py          ← Background music ducking
│       └── subtitle_burner.py      ← FFmpeg libass subtitle burn-in
│
├── scripts/                        ← CLI tools for every pipeline step
├── dashboard/                      ← Next.js control panel (port 3001)
├── project/                        ← All generated output (gitignored)
│   ├── scripts/                    ← Generated script JSON files
│   ├── voices/                     ← Generated MP3 files
│   ├── captions/                   ← SRT, VTT, word timestamps
│   ├── clips/                      ← Downloaded stock video clips
│   ├── renders/                    ← Final rendered MP4 files
│   ├── thumbnails/                 ← Generated thumbnail JPGs
│   ├── trends/                     ← Daily trend reports
│   ├── analytics/                  ← YouTube analytics data
│   └── logs/                       ← Upload logs, workflow runs, retry state
│
├── assets/
│   ├── backgrounds/                ← Fallback background clips
│   ├── music/                      ← Background music files
│   └── fonts/                      ← Montserrat-Bold.ttf (hook text)
│
├── .env                            ← Your configuration (never commit this)
├── .env.example                    ← Template with all variables documented
├── package.json
└── requirements.txt
```

---

## Video output specs

| Property | Value |
|----------|-------|
| Resolution | 1080 × 1920 (9:16 vertical) |
| Frame rate | 30 fps |
| Video codec | H.264 (NVENC hardware or libx264 software) |
| Audio codec | AAC 192 kbps |
| Container | MP4 (faststart) |
| Duration | ~35–50 seconds |
| Render time | ~60s (NVIDIA GPU) / ~3–5 min (CPU) |

## Effects applied

- **Scene cuts** — 5 scenes (hook + 3 body + CTA), each with a different stock clip
- **Ken Burns zoom** — slow 8% zoom on hook and every 3rd body scene
- **Zoom-in punch** — quick scale punch on the hook transition
- **Fade transitions** — between alternating body scenes
- **Hook text overlay** — animated slide-up + fade-in for first 2 seconds
- **Background music** — ducked to 12% volume, fades in/out
- **Subtitles** — 3-word chunks, white bold, black outline, bottom-centre
- **Keyword UPPERCASE** — high-impact words capitalised in subtitles

---

## Health check

The system exposes a health check server on port 3002:

```bash
curl http://localhost:3002/health    # liveness probe
curl http://localhost:3002/ready     # readiness probe
curl http://localhost:3002/metrics   # memory, queue depth, uptime
```

---

## Dashboard

```bash
cd dashboard && npm install
npm run dashboard    # opens http://localhost:3001
```

Features: upload status, analytics charts, trend viewer, script browser, manual upload override, start/stop automation, live log viewer.

---

## Troubleshooting

**OpenAI 429 quota exceeded**
The system automatically falls back to local script generation and local Whisper transcription. Add billing credits at https://platform.openai.com/settings/billing to re-enable GPT-4o and faster Whisper API.

**ElevenLabs 402 — library voice requires paid plan**
Use a `premade` voice ID. Available free voices: Roger, Sarah, Laura, Charlie, George, Liam, Alice, Brian, Adam. Current setting: `TX3LPaxmHKxFdv7VOQHJ` (Liam).

**YouTube upload 401 Insufficient Permission**
Re-run `node scripts/get_token.js` to get a fresh OAuth token with `youtube.upload` scope.

**FFmpeg not found**
The system uses `imageio-ffmpeg` as a bundled fallback. If you see FFmpeg errors, run:
```bash
pip install imageio-ffmpeg
```

**Gmail login failed**
Generate a 16-character App Password at https://myaccount.google.com/apppasswords (requires 2-Step Verification). Set it as `GMAIL_PASS` in `.env`.

**Local Whisper slow**
First run downloads the model (~140 MB). Subsequent runs are faster. For faster transcription, add OpenAI billing credits to use the Whisper API instead.

---

## Niches supported

| Niche | Description |
|-------|-------------|
| `ai_tools` | AI tools, ChatGPT, automation apps |
| `tech_facts` | Surprising technology facts |
| `automation` | Workflow automation, no-code tools |
| `money_facts` | Personal finance, investing, wealth |
| `productivity` | Habits, time management, performance |
| `tech` | General technology (legacy alias) |

---

## Environment variables reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | ✅ | — | OpenAI API key (system works without credits via fallbacks) |
| `ELEVENLABS_API_KEY` | ✅ | — | ElevenLabs TTS API key |
| `ELEVENLABS_VOICE_ID` | | `TX3LPaxmHKxFdv7VOQHJ` | Voice ID (use premade voices on free plan) |
| `YOUTUBE_CLIENT_ID` | ✅ | — | Google OAuth2 client ID |
| `YOUTUBE_CLIENT_SECRET` | ✅ | — | Google OAuth2 client secret |
| `YOUTUBE_REFRESH_TOKEN` | ✅ | — | Long-lived refresh token |
| `CHANNEL_NAME` | ✅ | — | Your YouTube channel name |
| `GMAIL_USER` | ✅ | — | Gmail address for notifications |
| `GMAIL_PASS` | ✅ | — | 16-char Gmail App Password |
| `PEXELS_API_KEY` | | — | Pexels stock video API (free) |
| `PIXABAY_API_KEY` | | — | Pixabay stock video API (free) |
| `TOPIC_CATEGORY` | | `tech` | Default content niche |
| `UPLOAD_TIMES` | | `09:00,15:00,20:00` | Daily upload schedule |
| `SCHEDULE_TIMEZONE` | | `UTC` | IANA timezone |
| `SHORTS_PER_DAY` | | `1` | Videos per slot trigger |
| `SLOT_NICHES` | | — | Per-slot niche override |
| `MEDIA_TARGET_CLIPS` | | `6` | Stock clips to fetch per video |
| `LOG_LEVEL` | | `info` | `debug` / `info` / `warn` / `error` |
| `HEALTH_PORT` | | `3002` | Health check server port |
#   A u t o m a t i o n  
 