/**
 * Trend storage — persists daily top-10 trend reports to project/trends/.
 *
 * File naming: project/trends/YYYY-MM-DD.json
 * Index file:  project/trends/index.json
 *
 * Each daily file contains the top 10 trends in the output format:
 *   { topic, keywords, niche, viralScore }
 * plus metadata about the run.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const TRENDS_DIR = path.resolve(__dirname, '..', '..', 'project', 'trends');
const INDEX_FILE = path.join(TRENDS_DIR, 'index.json');
const TOP_N = 10;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadIndex() {
  if (!fs.existsSync(INDEX_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveIndex(index) {
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');
}

/**
 * @typedef {object} TrendEntry
 * @property {string}   topic
 * @property {string[]} keywords
 * @property {string}   niche
 * @property {number}   viralScore
 */

/**
 * @typedef {object} TrendReport
 * @property {string}       date
 * @property {TrendEntry[]} trends
 * @property {object}       _meta
 */

/**
 * Save the top-10 trends for today.
 *
 * @param {import('./scorer').ScoredTrend[]} scoredTrends — full sorted list
 * @param {{ sourceCounts: object, totalRaw: number }} stats
 * @returns {{ filePath: string, relativePath: string, report: TrendReport }}
 */
function saveTrends(scoredTrends, stats = {}) {
  ensureDir(TRENDS_DIR);

  const date = new Date().toISOString().slice(0, 10);
  const filePath = path.join(TRENDS_DIR, `${date}.json`);
  const relativePath = path.relative(process.cwd(), filePath);

  // Strip internal debug fields from the output
  const top10 = scoredTrends.slice(0, TOP_N).map((t, i) => ({
    rank: i + 1,
    topic: t.topic,
    keywords: t.keywords,
    niche: t.niche,
    viralScore: t.viralScore,
    sources: t.sources,
  }));

  const report = {
    date,
    trends: top10,
    _meta: {
      generatedAt: new Date().toISOString(),
      totalRawTrends: stats.totalRaw ?? 0,
      sourceCounts: stats.sourceCounts ?? {},
      topicCount: top10.length,
    },
  };

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf8');
  logger.info(`[trendStorage] Saved ${top10.length} trends → ${relativePath}`);

  // Update index
  const index = loadIndex();
  const existingIdx = index.findIndex((e) => e.date === date);
  const entry = {
    date,
    topicCount: top10.length,
    topTopic: top10[0]?.topic ?? '',
    topViralScore: top10[0]?.viralScore ?? 0,
    file: relativePath.replace(/\\/g, '/'),
  };

  if (existingIdx >= 0) {
    index[existingIdx] = entry; // overwrite same-day entry
  } else {
    index.unshift(entry);
  }

  saveIndex(index);
  return { filePath, relativePath, report };
}

/**
 * Load the trend report for a specific date (defaults to today).
 *
 * @param {string} [date] — YYYY-MM-DD
 * @returns {TrendReport|null}
 */
function loadTrends(date) {
  const target = date ?? new Date().toISOString().slice(0, 10);
  const filePath = path.join(TRENDS_DIR, `${target}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Return the index of all saved trend reports.
 * @returns {Array<object>}
 */
function listReports() {
  return loadIndex();
}

module.exports = { saveTrends, loadTrends, listReports, TRENDS_DIR, TOP_N };
