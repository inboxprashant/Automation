# Downloaded Stock Clips

This directory contains all stock video clips downloaded from Pexels and Pixabay.

## Structure

```
project/clips/
├── index.json          ← master index with metadata for every clip
├── pexels/             ← clips from Pexels
│   ├── pexels_12345.mp4
│   └── pexels_67890.mp4
└── pixabay/            ← clips from Pixabay
    ├── pixabay_11111.mp4
    └── pixabay_22222.mp4
```

## Index record format

```json
{
  "id": "pexels_12345",
  "provider": "pexels",
  "localPath": "/absolute/path/to/pexels_12345.mp4",
  "localRelative": "project/clips/pexels/pexels_12345.mp4",
  "downloadUrl": "https://...",
  "pageUrl": "https://www.pexels.com/video/12345",
  "width": 1080,
  "height": 1920,
  "duration": 15,
  "isPortrait": true,
  "tags": ["technology", "computer", "screen"],
  "queries": ["computer screen code", "technology abstract"],
  "photographer": "John Doe",
  "downloadedAt": "2024-01-15T09:00:00.000Z",
  "usedCount": 2,
  "lastUsedAt": "2024-01-16T09:00:00.000Z"
}
```

## Cache behaviour

- **Deduplication** — each clip ID is downloaded at most once
- **Cache-first** — if ≥ 4 matching clips exist locally, API calls are skipped
- **Eviction** — when the cache exceeds 500 clips, the oldest never-used clips are deleted
- **Scoring** — portrait clips score higher than landscape; longer clips score higher than short ones

## API keys required

| Provider | Free tier | Get key |
|----------|-----------|---------|
| Pexels   | 200 req/hour | https://www.pexels.com/api/ |
| Pixabay  | 100 req/min  | https://pixabay.com/api/docs/ |

Add to `.env`:
```
PEXELS_API_KEY=your_key_here
PIXABAY_API_KEY=your_key_here
```
