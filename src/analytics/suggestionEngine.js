/**
 * Suggestion Engine
 *
 * Generates actionable optimisation suggestions from performance analysis.
 *
 * Each suggestion has:
 *   category  — 'thumbnail' | 'title' | 'retention' | 'ctr' | 'niche' | 'schedule' | 'content'
 *   priority  — 'high' | 'medium' | 'low'
 *   finding   — what the data shows
 *   action    — specific thing to do next
 *   impact    — expected outcome
 */

'use strict';

// ── Thresholds ────────────────────────────────────────────────────────────────

const CTR_EXCELLENT  = 0.08;   // 8%+
const CTR_GOOD       = 0.05;   // 5–8%
const CTR_POOR       = 0.02;   // <2%
const RETENTION_GOOD = 60;     // 60%+
const RETENTION_POOR = 30;     // <30%
const LIKE_RATE_GOOD = 0.04;   // 4%+

// ── Suggestion builder ────────────────────────────────────────────────────────

/**
 * @typedef {object} Suggestion
 * @property {string} category
 * @property {'high'|'medium'|'low'} priority
 * @property {string} finding
 * @property {string} action
 * @property {string} impact
 * @property {string[]} [affectedVideos]
 */

/**
 * Generate suggestions from a full performance analysis.
 *
 * @param {object} analysis  — output of performanceDetector.analysePerformance()
 * @param {import('./analyticsCollector').VideoMetrics[]} metrics
 * @returns {Suggestion[]}
 */
function generateSuggestions(analysis, metrics) {
  const suggestions = [];
  const { channelAvg, highPerformers, lowPerformers, trending, bestNiche, results } = analysis;

  // ── CTR suggestions ────────────────────────────────────────────────────────
  const ctrMetrics = metrics.filter((m) => m.ctr != null);

  if (ctrMetrics.length > 0) {
    const avgCtr = ctrMetrics.reduce((s, m) => s + m.ctr, 0) / ctrMetrics.length;

    if (avgCtr < CTR_POOR) {
      suggestions.push({
        category: 'thumbnail',
        priority: 'high',
        finding:  `Average CTR is ${(avgCtr * 100).toFixed(1)}% — well below the 2% minimum.`,
        action:   'Redesign thumbnails: use bold UPPERCASE text (3–5 words max), high-contrast colours, and a clear emotional face or arrow. A/B test red vs yellow backgrounds.',
        impact:   'Improving CTR from 2% to 5% can 2.5× your impressions-to-views conversion.',
      });
    } else if (avgCtr < CTR_GOOD) {
      suggestions.push({
        category: 'thumbnail',
        priority: 'medium',
        finding:  `Average CTR is ${(avgCtr * 100).toFixed(1)}% — room to improve toward 5–8%.`,
        action:   'Add a curiosity-gap element to thumbnails: a partially revealed secret, a shocked expression, or a bold number (e.g. "7x faster").',
        impact:   'Each 1% CTR improvement typically adds 15–20% more views from the same impressions.',
      });
    }

    // Low-CTR individual videos
    const lowCtr = ctrMetrics.filter((m) => m.ctr < CTR_POOR);
    if (lowCtr.length > 0) {
      suggestions.push({
        category:       'title',
        priority:       'high',
        finding:        `${lowCtr.length} video(s) have CTR below 2%.`,
        action:         'Rewrite titles for these videos: lead with the benefit or shock, use power words (SECRET, FREE, NEVER, EXPOSED), keep under 60 characters.',
        impact:         'Title changes can be applied immediately and take effect within 24–48 hours.',
        affectedVideos: lowCtr.map((m) => m.videoId),
      });
    }
  }

  // ── Retention suggestions ──────────────────────────────────────────────────
  const retMetrics = metrics.filter((m) => m.avgViewPercentage != null);

  if (retMetrics.length > 0) {
    const avgRet = retMetrics.reduce((s, m) => s + m.avgViewPercentage, 0) / retMetrics.length;

    if (avgRet < RETENTION_POOR) {
      suggestions.push({
        category: 'retention',
        priority: 'high',
        finding:  `Average retention is ${avgRet.toFixed(1)}% — viewers are leaving in the first few seconds.`,
        action:   'Strengthen the hook: open with the most shocking or valuable statement in the first 2 seconds. Remove any intro music, logos, or slow build-up. Cut to the point immediately.',
        impact:   'YouTube\'s algorithm heavily rewards videos with >50% retention — improving this is the single highest-leverage change.',
      });
    } else if (avgRet < RETENTION_GOOD) {
      suggestions.push({
        category: 'retention',
        priority: 'medium',
        finding:  `Average retention is ${avgRet.toFixed(1)}% — good but not algorithm-boosting territory.`,
        action:   'Add a pattern interrupt every 5–7 seconds: change the visual, add a sound effect, or ask a rhetorical question. End with a strong CTA that teases the next video.',
        impact:   'Pushing retention above 60% triggers YouTube\'s recommendation algorithm to distribute the video more widely.',
      });
    }

    // Drop-off at specific points (if we have duration data)
    const shortRetention = retMetrics.filter((m) => m.avgViewPercentage < 25 && m.avgViewDurationSec != null && m.avgViewDurationSec < 5);
    if (shortRetention.length > 0) {
      suggestions.push({
        category:       'content',
        priority:       'high',
        finding:        `${shortRetention.length} video(s) lose viewers in the first 5 seconds.`,
        action:         'Rewrite the hook for these videos. The first sentence must answer "why should I keep watching?" — use a bold claim, a surprising statistic, or a direct question.',
        impact:         'Fixing the hook is the fastest way to improve both retention and algorithmic reach.',
        affectedVideos: shortRetention.map((m) => m.videoId),
      });
    }
  }

  // ── Like rate suggestions ──────────────────────────────────────────────────
  const avgLikeRate = channelAvg.likeRate;
  if (avgLikeRate < LIKE_RATE_GOOD && metrics.length >= 3) {
    suggestions.push({
      category: 'content',
      priority: 'medium',
      finding:  `Average like rate is ${(avgLikeRate * 100).toFixed(2)}% — below the 4% benchmark for Shorts.`,
      action:   'Add a specific, urgent CTA at the end: "Like this if you didn\'t know that" or "Follow for the next one — dropping tomorrow". Avoid generic "like and subscribe".',
      impact:   'Higher like rate signals quality to the algorithm and improves recommendation placement.',
    });
  }

  // ── Niche suggestions ──────────────────────────────────────────────────────
  if (analysis.bestNiche && results.length >= 5) {
    const nicheResults = results.filter((r) => r.metrics.niche === analysis.bestNiche);
    const otherResults = results.filter((r) => r.metrics.niche !== analysis.bestNiche);
    const nicheAvgScore = nicheResults.reduce((s, r) => s + r.score, 0) / nicheResults.length;
    const otherAvgScore = otherResults.length > 0
      ? otherResults.reduce((s, r) => s + r.score, 0) / otherResults.length
      : 0;

    if (nicheAvgScore > otherAvgScore + 10) {
      suggestions.push({
        category: 'niche',
        priority: 'medium',
        finding:  `"${analysis.bestNiche}" content scores ${Math.round(nicheAvgScore - otherAvgScore)} points higher than other niches.`,
        action:   `Increase the proportion of "${analysis.bestNiche}" content. Consider setting TOPIC_CATEGORY=${analysis.bestNiche} or adding it as a dedicated upload slot.`,
        impact:   'Doubling down on your best-performing niche compounds audience growth.',
      });
    }
  }

  // ── High performer patterns ────────────────────────────────────────────────
  if (highPerformers.length >= 2) {
    const titles = highPerformers.map((r) => r.title);
    suggestions.push({
      category:       'title',
      priority:       'low',
      finding:        `${highPerformers.length} high-performing videos identified.`,
      action:         `Study these titles for patterns: ${titles.slice(0, 3).map((t) => `"${t}"`).join(', ')}. Replicate the structure, emotional trigger, and keyword placement in future scripts.`,
      impact:         'Replicating proven title patterns is the lowest-risk way to maintain high performance.',
      affectedVideos: highPerformers.map((r) => r.videoId),
    });
  }

  // ── Trending videos ────────────────────────────────────────────────────────
  if (trending.length > 0) {
    suggestions.push({
      category:       'content',
      priority:       'high',
      finding:        `${trending.length} video(s) are currently trending (rapid view growth).`,
      action:         'Create follow-up content on the same topic immediately while the algorithm is boosting it. Use the same keywords, niche, and thumbnail style.',
      impact:         'Riding a trending video\'s momentum with a sequel can 3–5× the reach of the follow-up.',
      affectedVideos: trending,
    });
  }

  // ── Low performers ────────────────────────────────────────────────────────
  if (lowPerformers.length > 0 && lowPerformers.length >= Math.ceil(results.length * 0.4)) {
    suggestions.push({
      category: 'content',
      priority: 'medium',
      finding:  `${lowPerformers.length} of ${results.length} videos are underperforming (${Math.round(lowPerformers.length / results.length * 100)}% of channel).`,
      action:   'Run the trend finder before each upload to ensure topics have proven demand. Avoid evergreen topics that lack urgency — focus on "right now" angles.',
      impact:   'Topic selection accounts for ~40% of a Short\'s performance ceiling.',
    });
  }

  // Sort: high priority first, then medium, then low
  const order = { high: 0, medium: 1, low: 2 };
  return suggestions.sort((a, b) => order[a.priority] - order[b.priority]);
}

module.exports = { generateSuggestions };
