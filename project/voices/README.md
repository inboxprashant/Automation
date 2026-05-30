# Generated Voice Files

This directory contains all AI-generated voice MP3 files and their metadata.

## Structure

```
project/voices/
├── index.json                          ← master index of every voice file
├── ai_tools/
│   ├── 2024-01-15_a1b2c3.mp3          ← audio file
│   └── 2024-01-15_a1b2c3.json         ← metadata sidecar
├── tech_facts/
├── automation/
├── money_facts/
├── productivity/
└── general/
```

## Metadata sidecar format

```json
{
  "jobId": "a1b2c3",
  "niche": "ai_tools",
  "voiceId": "AZnzlk1XvdvUeBnXmlld",
  "voiceName": "Domi",
  "scriptTitle": "The AI Tool That Replaced My Entire Team",
  "characterCount": 487,
  "durationEstimate": 44,
  "mp3Path": "/absolute/path/to/file.mp3",
  "mp3Relative": "project/voices/ai_tools/2024-01-15_a1b2c3.mp3",
  "generatedAt": "2024-01-15T09:00:00.000Z"
}
```

## Voice catalogue

| Name    | Gender | Tone                  | Best niches                        |
|---------|--------|-----------------------|------------------------------------|
| Rachel  | Female | Calm, professional    | productivity, money_facts          |
| Domi    | Female | Energetic, confident  | ai_tools, tech_facts, automation   |
| Bella   | Female | Warm, engaging        | productivity, money_facts          |
| Antoni  | Male   | Deep, authoritative   | money_facts, tech_facts            |
| Elli    | Female | Young, enthusiastic   | ai_tools, tech_facts               |
| Josh    | Male   | Conversational        | automation, productivity           |
| Arnold  | Male   | Powerful, dramatic    | money_facts, tech_facts            |
| Adam    | Male   | Clear, neutral        | ai_tools, automation               |
| Sam     | Male   | Raspy, intense        | money_facts, productivity          |

Run `node scripts/generate_voice.js --list-voices` for full details.
