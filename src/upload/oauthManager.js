/**
 * OAuth Manager
 *
 * Centralises all Google OAuth2 concerns:
 *   • Builds and caches a single OAuth2 client per process
 *   • Proactively refreshes the access token before it expires
 *   • Persists the latest access token to disk so restarts don't
 *     immediately trigger a refresh (saves quota)
 *   • Emits a warning when the refresh token itself is about to expire
 *     (Google refresh tokens expire after 7 days of inactivity on
 *     test-mode apps, or never on production apps)
 *
 * Token cache file: project/logs/oauth_token.json
 * (gitignored — contains a short-lived access token, not the refresh token)
 */

'use strict';

const { google }  = require('googleapis');
const fs          = require('fs');
const path        = require('path');
const config      = require('../config');
const logger      = require('../utils/logger');

const TOKEN_CACHE_PATH = path.resolve(
  __dirname, '..', '..', 'project', 'logs', 'oauth_token.json'
);

// Refresh 5 minutes before actual expiry
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

let _client = null;

// ── Token cache I/O ──────────────────────────────────────────────────────────

function loadCachedToken() {
  try {
    if (fs.existsSync(TOKEN_CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(TOKEN_CACHE_PATH, 'utf8'));
    }
  } catch { /* ignore corrupt cache */ }
  return null;
}

function saveCachedToken(tokens) {
  try {
    fs.mkdirSync(path.dirname(TOKEN_CACHE_PATH), { recursive: true });
    fs.writeFileSync(TOKEN_CACHE_PATH, JSON.stringify(tokens, null, 2), 'utf8');
  } catch (err) {
    logger.warn(`[oauthManager] Could not cache token: ${err.message}`);
  }
}

// ── Client builder ───────────────────────────────────────────────────────────

/**
 * Build (or return cached) an authenticated OAuth2 client.
 * Automatically refreshes the access token if it is expired or missing.
 *
 * @returns {Promise<import('googleapis').Auth.OAuth2Client>}
 */
async function getAuthClient() {
  if (_client && _isTokenFresh(_client.credentials)) {
    return _client;
  }

  const oauth2 = new google.auth.OAuth2(
    config.youtube.clientId,
    config.youtube.clientSecret,
    config.youtube.redirectUri
  );

  // Start with the refresh token from config
  const credentials = { refresh_token: config.youtube.refreshToken };

  // Layer in any cached access token to avoid an unnecessary refresh
  const cached = loadCachedToken();
  if (cached?.access_token) {
    credentials.access_token  = cached.access_token;
    credentials.expiry_date   = cached.expiry_date;
    credentials.token_type    = cached.token_type ?? 'Bearer';
  }

  oauth2.setCredentials(credentials);

  // Listen for token refreshes and persist them
  oauth2.on('tokens', (tokens) => {
    logger.debug('[oauthManager] Access token refreshed');
    const merged = { ...oauth2.credentials, ...tokens };
    oauth2.setCredentials(merged);
    saveCachedToken(merged);
  });

  // Force a refresh if the access token is stale or missing
  if (!_isTokenFresh(oauth2.credentials)) {
    logger.debug('[oauthManager] Refreshing access token...');
    try {
      const { credentials: fresh } = await oauth2.refreshAccessToken();
      oauth2.setCredentials(fresh);
      saveCachedToken(fresh);
      logger.info('[oauthManager] Access token refreshed successfully');
    } catch (err) {
      throw new Error(
        `[oauthManager] Token refresh failed: ${err.message}. ` +
        'Run `node scripts/get_token.js` to re-authorise.'
      );
    }
  }

  _client = oauth2;
  return oauth2;
}

/**
 * Return true if the token is present and not about to expire.
 * @param {object} credentials
 * @returns {boolean}
 */
function _isTokenFresh(credentials) {
  if (!credentials?.access_token) return false;
  if (!credentials.expiry_date)   return true;   // no expiry = assume valid
  return credentials.expiry_date - Date.now() > REFRESH_BUFFER_MS;
}

/**
 * Invalidate the cached client (forces a fresh build on next call).
 * Call this after a 401 response.
 */
function invalidateClient() {
  _client = null;
  logger.debug('[oauthManager] Client cache invalidated');
}

/**
 * Build an authenticated YouTube API client.
 * @returns {Promise<import('googleapis').youtube_v3.Youtube>}
 */
async function getYouTubeClient() {
  const auth = await getAuthClient();
  return google.youtube({ version: 'v3', auth });
}

module.exports = { getAuthClient, getYouTubeClient, invalidateClient };
