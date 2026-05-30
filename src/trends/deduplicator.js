/**
 * Deduplicator — removes topics that are too similar to each other
 * or have already been used in a recent run.
 *
 * Two-stage process:
 *   1. Cross-batch dedup: within today's results, merge near-duplicate topics
 *      using a simple Jaccard similarity on normalised word sets.
 *   2. Historical dedup: compare against the last N days of saved trends
 *      to avoid repeating topics across runs.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { normaliseKey } = require('./scorer');

const TRENDS_DIR = path.resolve(__dirname, '..', '..', 'project', 'trends');
const SIMILARITY_THRESHOLD = 0.55;  // Jaccard — topics above this are considered duplicates
const HISTORY_DAYS = 7;             // look back this many days for historical dedup

/**
 * Compute Jaccard similarity between two strings.
 * Operates on word-level token sets.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} 0–1
 */
function jaccard(a, b) {
  const setA = new Set(normaliseKey(a).split(' ').filter(Boolean));
  const setB = new Set(normaliseKey(b).split(' ').filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

/**
 * Load all trend JSON files from the last N days.
 *
 * @returns {string[]} array of topic strings from recent runs
 */
function loadRecentTopics() {
  if (!fs.existsSync(TRENDS_DIR)) return [];

  const cutoff = Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000;
  const recentTopics = [];

  try {
    const files = fs.readdirSync(TRENDS_DIR)
      .filter((f) => f.endsWith('.json') && f !== 'index.json')
      .map((f) => ({ name: f, mtime: fs.statSync(path.join(TRENDS_DIR, f)).mtimeMs }))
      .filter((f) => f.mtime >= cutoff)
      .map((f) => f.name);

    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(TRENDS_DIR, file), 'utf8'));
        const topics = (data.trends ?? []).map((t) => t.topic).filter(Boolean);
        recentTopics.push(...topics);
      } catch {
        // skip corrupt files
      }
    }
  } catch (err) {
    logger.warn(`[deduplicator] Could not load recent topics: ${err.message}`);
  }

  return recentTopics;
}

/**
 * Remove near-duplicate topics from a list.
 * Keeps the highest-scoring representative from each cluster.
 *
 * @param {import('./scorer').ScoredTrend[]} trends — already sorted by viralScore desc
 * @returns {import('./scorer').ScoredTrend[]}
 */
function deduplicateBatch(trends) {
  const kept = [];

  for (const candidate of trends) {
    const isDuplicate = kept.some(
      (existing) => jaccard(candidate.topic, existing.topic) >= SIMILARITY_THRESHOLD
    );

    if (!isDuplicate) {
      kept.push(candidate);
    } else {
      logger.debug(`[deduplicator] Dropped near-duplicate: "${candidate.topic}"`);
    }
  }

  return kept;
}

/**
 * Remove topics that appeared in recent runs.
 *
 * @param {import('./scorer').ScoredTrend[]} trends
 * @returns {import('./scorer').ScoredTrend[]}
 */
function deduplicateHistory(trends) {
  const recentTopics = loadRecentTopics();
  if (recentTopics.length === 0) return trends;

  return trends.filter((candidate) => {
    const tooSimilar = recentTopics.some(
      (recent) => jaccard(candidate.topic, recent) >= SIMILARITY_THRESHOLD
    );
    if (tooSimilar) {
      logger.debug(`[deduplicator] Filtered historical duplicate: "${candidate.topic}"`);
    }
    return !tooSimilar;
  });
}

/**
 * Run both deduplication passes.
 *
 * @param {import('./scorer').ScoredTrend[]} trends
 * @returns {import('./scorer').ScoredTrend[]}
 */
function deduplicate(trends) {
  const beforeBatch = trends.length;
  const afterBatch = deduplicateBatch(trends);

  const beforeHistory = afterBatch.length;
  const afterHistory = deduplicateHistory(afterBatch);

  logger.info(
    `[deduplicator] Batch dedup: ${beforeBatch} → ${afterBatch.length} | ` +
    `History dedup: ${beforeHistory} → ${afterHistory.length}`
  );

  return afterHistory;
}

module.exports = { deduplicate, jaccard };
