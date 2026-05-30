# Analytics Data

This directory contains all YouTube analytics data collected by the tracking system.

## Structure

```
project/analytics/
├── index.json              ← master index of all tracked videos
├── snapshots/              ← time-series metric snapshots (NDJSON per video)
│   ├── dQw4w9WgXcQ.ndjson
│   └── abc123xyz.ndjson
└── reports/                ← daily analysis reports
    ├── 2024-01-15.json
    └── 2024-01-16.json
```

## Metrics tracked

| Metric | Source | Description |
|--------|--------|-------------|
| `views` | Data API + Analytics API | Total view count |
| `likes` | Data API + Analytics API | Total like count |
| `likeRate` | Computed | likes ÷ views |
| `comments` | Data API | Total comment count |
| `ctr` | Analytics API | Impression click-through rate (0–1) |
| `avgViewPercentage` | Analytics API | Average % of video watched (retention) |
| `avgViewDurationSec` | Analytics API | Average watch duration in seconds |
| `watchTimeMinutes` | Analytics API | Total estimated watch time |
| `impressions` | Analytics API | Total thumbnail impressions |
| `subscribersGained` | Analytics API | Subscribers gained from this video |

## Performance tiers

| Tier | Score | Criteria |
|------|-------|----------|
| `high` | 65–100 | 50%+ above channel average on key metrics |
| `average` | 35–64 | Within normal range |
| `low` | 0–34 | 50%+ below channel average |

## Suggestion categories

| Category | What it addresses |
|----------|------------------|
| `thumbnail` | Low CTR — thumbnail design issues |
| `title` | Low CTR — title copy issues |
| `retention` | Low average view percentage |
| `content` | Hook, pacing, topic selection |
| `niche` | Best-performing niche identification |
| `schedule` | Upload timing optimisation |

## Note on Analytics API

The YouTube Analytics API requires:
- The same OAuth2 credentials as the upload flow
- Channel must be in good standing
- Some metrics (impressions, CTR) require YouTube Studio access

If the Analytics API is unavailable, the system falls back to the
Data API (views, likes, comments only) and marks `dataSource: "stats_only"`.
