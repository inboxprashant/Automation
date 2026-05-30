# Generated Scripts

This directory contains all AI-generated YouTube Shorts scripts.

## Structure

```
project/scripts/
├── index.json              ← master index of every generated script
├── ai_tools/               ← scripts by niche
│   └── 2024-01-15_a1b2c3.json
├── tech_facts/
├── automation/
├── money_facts/
└── productivity/
```

## Script JSON format

```json
{
  "title": "...",
  "description": "... #tag1 #tag2 #tag3",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8"],
  "niche": "ai_tools",
  "angle": "...",
  "hook": "...",
  "body": "...",
  "cta": "...",
  "narration": "hook + body + cta as one string — fed directly to TTS",
  "estimatedDuration": 45,
  "keywords": ["..."],
  "_meta": {
    "jobId": "a1b2c3",
    "generatedAt": "2024-01-15T09:00:00.000Z",
    "savedAt": "/absolute/path/to/file.json"
  }
}
```

## Niches

| Niche | Description |
|-------|-------------|
| `ai_tools` | AI tools, ChatGPT, automation apps |
| `tech_facts` | Surprising technology facts |
| `automation` | Workflow automation, no-code tools |
| `money_facts` | Personal finance, investing, wealth |
| `productivity` | Habits, time management, performance |
