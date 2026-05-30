/**
 * Viral potential scorer.
 *
 * Takes raw trends from all sources and produces a normalised
 * viralScore (0–100) for each topic using a weighted multi-signal model.
 *
 * Scoring model
 * ─────────────
 * Each source contributes a rawScore (0–100). The final viralScore
 * is a weighted average across sources that mentioned the same topic,
 * plus bonuses for:
 *   • cross-source confirmation  (+15 per additional source)
 *   • niche alignment            (+10 if niche matches our target niches)
 *   • keyword richness           (+5 if ≥ 4 unique keywords)
 *
 * Source weights (reflect data quality / relevance to Shorts):
 *   youtube_trending      0.40
 *   youtube_search        0.35
 *   google_trends_daily   0.15
 *   google_trends_interest 0.10
 *   reddit_hot            0.08
 *   reddit_rising         0.07
 */

'use strict';

const TARGET_NICHES = new Set(['ai_tools', 'tech_facts', 'automation', 'money_facts', 'productivity']);

const SOURCE_WEIGHTS = {
  youtube_trending:        0.40,
  youtube_search:          0.35,
  google_trends_daily:     0.15,
  google_trends_interest:  0.10,
  reddit_hot:              0.08,
  reddit_rising:           0.07,
};

/**
 * Resolve a source string to its weight.
 * Partial matches handle dynamic source names like "youtube_search:AI tools".
 *
 * @param {string} source
 * @returns {number}
 */
function getWeight(source) {
  for (const [key, weight] of Object.entries(SOURCE_WEIGHTS)) {
    if (source.startsWith(key)) return weight;
  }
  return 0.05; // unknown source — low weight
}

/**
 * @typedef {object} ScoredTrend
 * @property {string}   topic
 * @property {string[]} keywords
 * @property {string}   niche
 * @property {number}   viralScore   — 0–100, rounded to 1 decimal
 * @property {string[]} sources      — all sources that mentioned this topic
 * @property {object}   [_meta]
 */

/**
 * Score and rank an array of raw trends.
 *
 * @param {import('./sources/googleTrends').RawTrend[]} rawTrends
 * @returns {ScoredTrend[]}
 */
function score(rawTrends) {
  // Group by normalised topic key
  const groups = new Map();

  for (const trend of rawTrends) {
    const key = normaliseKey(trend.topic);
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, {
        topic: trend.topic,
        keywords: [...trend.keywords],
        niche: trend.niche,
        sources: [],
        weightedSum: 0,
        totalWeight: 0,
        _meta: trend._meta,
      });
    }

    const group = groups.get(key);

    // Merge keywords (deduplicated)
    for (const kw of trend.keywords) {
      if (!group.keywords.includes(kw)) group.keywords.push(kw);
    }

    // Prefer the most specific niche
    if (trend.niche !== 'general' && group.niche === 'general') {
      group.niche = trend.niche;
    }

    const w = getWeight(trend.source);
    group.weightedSum += trend.rawScore * w;
    group.totalWeight += w;
    group.sources.push(trend.source);
  }

  // Compute final scores
  const scored = [];

  for (const [, group] of groups) {
    const baseScore = group.totalWeight > 0
      ? group.weightedSum / group.totalWeight
      : 0;

    const uniqueSources = new Set(group.sources.map(normaliseSourceFamily));
    const crossSourceBonus = Math.min(30, (uniqueSources.size - 1) * 15);
    const nicheBonus = TARGET_NICHES.has(group.niche) ? 10 : 0;
    const keywordBonus = group.keywords.length >= 4 ? 5 : 0;

    const viralScore = Math.min(100, Math.round((baseScore + crossSourceBonus + nicheBonus + keywordBonus) * 10) / 10);

    scored.push({
      topic: group.topic,
      keywords: [...new Set(group.keywords)].slice(0, 8),
      niche: group.niche,
      viralScore,
      sources: [...new Set(group.sources)],
      _debug: {
        baseScore: Math.round(baseScore * 10) / 10,
        crossSourceBonus,
        nicheBonus,
        keywordBonus,
        sourceCount: uniqueSources.size,
      },
    });
  }

  // Sort descending by viralScore
  return scored.sort((a, b) => b.viralScore - a.viralScore);
}

/**
 * Normalise a topic string to a deduplication key.
 * Lowercases, strips punctuation, collapses whitespace.
 *
 * @param {string} topic
 * @returns {string}
 */
function normaliseKey(topic) {
  return (topic ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/**
 * Map a full source string to its family for cross-source counting.
 * e.g. "youtube_search:AI tools" → "youtube_search"
 *
 * @param {string} source
 * @returns {string}
 */
function normaliseSourceFamily(source) {
  return source.split(':')[0].replace(/_hot$|_rising$/, '');
}

module.exports = { score, normaliseKey };
