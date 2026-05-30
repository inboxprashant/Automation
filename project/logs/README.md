# Upload Logs

This directory contains structured upload logs for every YouTube upload attempt.

## Files

```
project/logs/
├── uploads.ndjson       ← every upload attempt (NDJSON, one entry per line)
├── upload_index.json    ← summary index for fast lookups
└── oauth_token.json     ← cached OAuth2 access token (auto-managed, gitignored)
```

## NDJSON entry format

```json
{
  "jobId": "a1b2c3",
  "videoId": "dQw4w9WgXcQ",
  "title": "The AI Tool That Replaced My Team",
  "niche": "ai_tools",
  "status": "success",
  "startedAt": "2024-01-15T09:00:00.000Z",
  "completedAt": "2024-01-15T09:02:34.000Z",
  "durationMs": 154000,
  "retryCount": 0,
  "videoUrl": "https://www.youtube.com/shorts/dQw4w9WgXcQ",
  "thumbnailSet": "yes",
  "scheduledFor": null,
  "privacyStatus": "public",
  "fileSizeKb": 18432,
  "errorMessage": null,
  "errorCode": null
}
```

## Status values

| Status | Meaning |
|--------|---------|
| `success` | Video published successfully |
| `failure` | All retry attempts failed |
| `scheduled` | Video uploaded, set to publish at a future time |

## Useful commands

```bash
# View recent upload logs
node scripts/upload_video.js --logs

# View upload index
node scripts/upload_video.js --list

# Tail the NDJSON log
tail -f project/logs/uploads.ndjson | jq .
```
