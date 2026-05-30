/**
 * Trend Finder — main orchestrator.
 *
 * Runs all three sources in parallel (with graceful degradation if one
 * fails), scores the combined results, deduplicates, and saves the
 * top-10 to project/trends/YYYY-MM-DD.json.
 *
 * Exported API:
 *   findTrends()  → Promise<TrendReport>
 *
 * Each source is optional — if it throws, the others still run.
 * A minimum of 1 working source is required to produce a report.
 */

'use strict';

const logger = require('../utils/logger');
const { score } = require('./scorer');
const { deduplicate } = require('./deduplicator');
const { saveTrends } = require('./trendStorage');

// Sources — imported lazily so a missing optional dep doesn't crash startup
const sources = {
  google_trends: () => require('./sources/googleTrends'),
  reddit:        () => require('./sources/reddit'),
  youtube:       () => require('./sources/youtube'),
};

/**
 * Run a single source and return its raw trends.
 * Returns [] on failure so the pipeline continues.
 *
 * @param {string} name
 * @param {Function} loader
 * @returns {Promise<import('./sources/googleTrends').RawTrend[]>}
 */
async function runSource(name, loader) {
  try {
    logger.info(`[trendFinder] Running source: ${name}`);
    const mod = loader();
    const results = await mod.collect();
    logger.info(`[trendFinder] ${name} → ${results.length} raw items`);
    return results;
  } catch (err) {
    logger.warn(`[trendFinder] Source "${name}" failed: ${err.message}`);
    return [];
  }
}

/**
 * Count raw trends by source family.
 *
 * @param {import('./sources/googleTrends').RawTrend[]} rawTrends
 * @returns {object}
 */
function countSources(rawTrends) {
  const counts = {};
  for (const t of rawTrends) {
    const family = t.source.split(':')[0];
    counts[family] = (counts[family] ?? 0) + 1;
  }
  return counts;
}

/**
 * Find, score, deduplicate, and save today's top trends.
 *
 * @returns {Promise<import('./trendStorage').TrendReport>}
 */
async function findTrends() {
  logger.info('═══════════════════════════════════════════');
  logger.info('  Trend Finder — starting run');
  logger.info('═══════════════════════════════════════════');

  const startTime = Date.now();

  // ── 1. Collect from all sources in parallel ──────────────────────────────
  const [googleResults, redditResults, youtubeResults] = await Promise.all([
    runSource('google_trends', sources.google_trends),
    runSource('reddit',        sources.reddit),
    runSource('youtube',       sources.youtube),
  ]);

  const allRaw = [...googleResults, ...redditResults, ...youtubeResults];

  if (allRaw.length === 0) {
    throw new Error('[trendFinder] All sources returned 0 results. Check API credentials and network.');
  }

  logger.info(`[trendFinder] Total raw trends collected: ${allRaw.length}`);

  // ── 2. Score ─────────────────────────────────────────────────────────────
  const scored = score(allRaw);
  logger.info(`[trendFinder] Unique topics after scoring: ${scored.length}`);

  // ── 3. Deduplicate ───────────────────────────────────────────────────────
  const deduped = deduplicate(scored);
  logger.info(`[trendFinder] Topics after deduplication: ${deduped.length}`);

  if (deduped.length === 0) {
    throw new Error('[trendFinder] No topics survived deduplication. Try clearing project/trends/ history.');
  }

  // ── 4. Save top 10 ───────────────────────────────────────────────────────
  const stats = {
    totalRaw: allRaw.length,
    sourceCounts: countSources(allRaw),
  };

  const { report, relativePath } = saveTrends(deduped, stats);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info(`[trendFinder] ✅ Done in ${elapsed}s — saved to ${relativePath}`);

  // Log the top 10 to console for visibility
  logger.info('\n── Top 10 Trends ──────────────────────────────────────');
  report.trends.forEach((t) => {
    logger.info(`  #${t.rank} [${t.viralScore}] [${t.niche}] ${t.topic}`);
  });
  logger.info('────────────────────────────────────────────────────────\n');

  return report;
}

module.exports = { findTrends };
